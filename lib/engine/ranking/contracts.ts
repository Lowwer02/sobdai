/**
 * lib/engine/ranking/contracts.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking — immutable contracts only.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §5 (Ordering), §6 (Tie Resolution),
 *     §7 (RankedCandidateSet), §9 (Transparency), §10 (Failure Handling).
 *
 * This file is TYPES ONLY. No ranking logic, no scoring logic, no solver, no
 * ordering algorithm, no tie-resolution algorithm, no Bank access, no I/O, no
 * side effects.
 *
 * VOCABULARY REUSE: CandidateSet, BlueprintSlot, ShortfallReport, and
 * CoverageSatisfaction are imported from ../generator/contracts. RawSignal,
 * CompositeScore, ScoringConfidence, and Penalty are imported from
 * ../scoring/contracts. Ranking does NOT duplicate or redefine Generator or
 * Scoring contracts.
 *
 * CASING: camelCase, matching existing lib/engine/** contracts.
 *
 * IMMUTABILITY: every field is `readonly`. Arrays are `readonly`. Maps are
 * not introduced here so the output remains plainly serializable.
 */

import type {
  BlueprintSlot,
  CandidateSet,
  ConstraintSnapshot,
  CoverageSatisfaction,
  GeneratorWarning,
  ShortfallReport,
} from '../generator/contracts'
import type {
  ComponentId,
  CompositeScore,
  Penalty,
  RawSignal,
  ScoringConfidence,
} from '../scoring/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Ranking-owned vocabulary (§2, §5, §6, §10)
// ═══════════════════════════════════════════════════════════════════════════

/** The seven runtime stages from Ranking Architecture §2.1. */
export type RankingStage =
  | 'signal_extraction'
  | 'scoring'
  | 'confidence'
  | 'penalty_application'
  | 'ordering'
  | 'tie_resolution'
  | 'ranked_candidate_set_emission'

/** Failure severity vocabulary from Ranking Architecture §10.1. */
export type RankingSeverity = 'Fatal' | 'Non-fatal'

/** Fatal and non-fatal failure categories from Ranking Architecture §10.1. */
export type RankingDiagnosticCategory =
  | 'missing_score'
  | 'missing_confidence'
  | 'unknown_score'
  | 'incomplete_candidate'
  | 'version_mismatch'
  | 'conflicting_metadata'
  | 'tie_overflow'
  | 'ordering_inconsistency'

/**
 * Permitted tie-breaker source classes from §6.3. The contract records the
 * class of evidence used without specifying the implementation's exact key.
 */
export type TieBreakerSource =
  | 'stable_identity'
  | 'deterministic_metadata'
  | 'scoring_model_derived_sub_facet'

// ═══════════════════════════════════════════════════════════════════════════
// 2. Ordering transparency (§5.6, §6.2, §9)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The fixed, inspectable ordering key used by a Ranking implementation (§5.4).
 * This is descriptive contract data, not an algorithm.
 */
export interface OrderingKeyDescriptor {
  /** Ordered names of the evaluation facets used for ordering. */
  readonly facets: readonly string[]
  /** Human-readable explanation of the key's meaning. Never empty. */
  readonly description: string
}

/** Neighbor comparison required by §5.6 and exposed in the audit layer (§9.4). */
export interface NeighborComparison {
  /** Candidate immediately above this entry in the same slot, or null at top. */
  readonly aboveCode: string | null
  /** Candidate immediately below this entry in the same slot, or null at bottom. */
  readonly belowCode: string | null
  /** How this Candidate compares to its neighbors. Never empty. */
  readonly explanation: string
}

/**
 * The tie-breaker applied to a visible tie group (§6.3). The exact key is an
 * implementation concern; the contract requires it to be deterministic and
 * inspectable.
 */
export interface TieBreaker {
  readonly source: TieBreakerSource
  readonly key: string
  readonly reason: string
}

/** Explicit tie-group detail (§6.2, §6.4). */
export interface TieGroup {
  /** Shared identifier carried by every tied RankedCandidate. */
  readonly tieGroupId: string
  /** All tied Candidate codes before internal tie resolution. */
  readonly memberCodes: readonly string[]
  /** The total order produced inside the tie group. */
  readonly resolvedOrder: readonly string[]
  /** The deterministic tie-breaker applied. */
  readonly tieBreaker: TieBreaker
}

/** Per-entry tie status (§9.2). Null group fields mean "not tied." */
export interface TieStatus {
  readonly tieGroupId: string | null
  readonly memberCodes: readonly string[]
  readonly tieBreaker: TieBreaker | null
}

/**
 * Why a Candidate occupies its position in a slot (§5.6, §9.2). Score
 * breakdown/confidence/penalties remain owned by Scoring and are carried on the
 * entry itself; this object records Ranking-owned ordering transparency.
 */
export interface OrderingReason {
  /** Always-present top ordering reason (§9.4). Never empty. */
  readonly summary: string
  /** Evaluation facets that determined the position (§5.6). */
  readonly determiningFacets: readonly string[]
  /** Neighbor comparison (§5.6); null only when no neighbor exists to compare. */
  readonly neighborComparison: NeighborComparison | null
  /** Whether the entry was part of a visible tie group (§6.2). */
  readonly tieStatus: TieStatus
}

/**
 * Reproducible per-position trace (§9.3): Candidate → Signals → Components →
 * Composite → Confidence → Penalties → Rank.
 */
export interface RankingAuditTrail {
  readonly candidateCode: string
  readonly signals: readonly RawSignal[]
  readonly componentIds: readonly ComponentId[]
  readonly composite: CompositeScore
  readonly confidence: ScoringConfidence
  readonly penalties: readonly Penalty[]
  readonly rank: number
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Ranked entries and per-slot output (§7.3)
// ═══════════════════════════════════════════════════════════════════════════

/** One ordered Candidate inside one Blueprint slot (§7.3). */
export interface RankedCandidate {
  /** Question Code (§7.3 `code`). */
  readonly code: string
  /** One-based total-order position within this slot (§7.3 `rank`). */
  readonly rank: number
  /** Null if not tied; shared id if tied (§7.3 `tie_group_id`). */
  readonly tieGroupId: string | null
  /** Composite Score with full Breakdown, imported from Scoring (§7.3). */
  readonly composite: CompositeScore
  /** Propagated Confidence, carried forward from Composite (§9.2). */
  readonly confidence: ScoringConfidence
  /** Applied Penalties with triggers, carried forward from Scoring (§9.2). */
  readonly penalties: readonly Penalty[]
  /** Raw Signals that fed the Components (§7.3, §9.2). */
  readonly signals: readonly RawSignal[]
  /** Why this Candidate occupies this position (§7.3, §9.2). */
  readonly orderingReason: OrderingReason
  /** Full reproducible trace for audit (§9.3). */
  readonly auditTrail: RankingAuditTrail
}

/** Per-slot summary (§7.3 `slot_summary`). */
export interface RankedSlotSummary {
  /** Visible tie groups in this slot. Empty when no ties occurred. */
  readonly tieGroups: readonly TieGroup[]
  /** Top-of-slot rationale (§7.3). Never empty when rankedCandidates non-empty. */
  readonly topOfSlotRationale: string
  /** The fixed ordering key descriptor used for this slot (§5.4). */
  readonly orderingKey: OrderingKeyDescriptor
}

/** One Blueprint slot and its deterministically ordered Candidates (§7.3). */
export interface RankedSlot {
  /** Stable slot id string (§7.3 `slot_id`). */
  readonly slotId: string
  /** The Blueprint slot this ordering belongs to. */
  readonly slot: BlueprintSlot
  /** Ordered list; no dependence on CandidateSet iteration order (§5.4). */
  readonly rankedCandidates: readonly RankedCandidate[]
  readonly slotSummary: RankedSlotSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. RankedCandidateSet output (§7)
// ═══════════════════════════════════════════════════════════════════════════

/** Identity block from §7.3. */
export interface RankedCandidateSetIdentity {
  readonly candidateSetId: string
  readonly scoringModelVersion: '1.0'
  readonly rankingVersion: string
}

/** Metadata block from §7.3. */
export interface RankedCandidateSetMeta {
  readonly specVersion: '1.0'
  readonly rankingVersion: string
  readonly scoringModelVersion: '1.0'
}

/** Ranking-emitted warning (§7.3 `warnings[]`, §10.1 non-fatal rows). */
export interface RankingWarning {
  readonly severity: Extract<RankingSeverity, 'Non-fatal'>
  readonly category: Extract<
    RankingDiagnosticCategory,
    'incomplete_candidate' | 'conflicting_metadata'
  >
  readonly stage: RankingStage
  readonly slotId: string | null
  readonly code: string | null
  readonly explanation: string
  readonly recommendation: string
}

/**
 * Ranking's immutable output contract (§7.3). It carries forward Generator
 * findings unchanged and layers Ranking-owned orderings and explanations on top.
 */
export interface RankedCandidateSet {
  readonly identity: RankedCandidateSetIdentity
  /** Original CandidateSet, read-only and unchanged (§7.4, §12.2). */
  readonly candidateSet: CandidateSet
  /** One deterministic ordering per Blueprint slot (§7.1). */
  readonly slots: readonly RankedSlot[]
  /** Carried forward from CandidateSet unchanged (§7.4). */
  readonly shortfallReport: ShortfallReport
  /** Carried forward from CandidateSet unchanged (§7.4). */
  readonly coverageSatisfaction: CoverageSatisfaction
  /** Carried forward from CandidateSet unchanged (§7.4; IG-5 amendment). */
  readonly constraintSnapshot: ConstraintSnapshot
  /** Generator warnings carried forward plus Ranking-emitted warnings (§7.3). */
  readonly warnings: readonly (GeneratorWarning | RankingWarning)[]
  readonly meta: RankedCandidateSetMeta
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Structured failures (§10)
// ═══════════════════════════════════════════════════════════════════════════

/** Structured Ranking diagnostic (§10.4). */
export interface RankingDiagnostic {
  readonly category: RankingDiagnosticCategory
  readonly severity: RankingSeverity
  readonly stage: RankingStage
  readonly slotId: string | null
  readonly code: string | null
  readonly componentId: ComponentId | null
  readonly explanation: string
  readonly recommendation: string
}

/** Top-level Ranking result: success emits RankedCandidateSet; fatal failure emits diagnostics. */
export type CandidateRankingResult =
  | { readonly ok: true; readonly rankedCandidateSet: RankedCandidateSet }
  | { readonly ok: false; readonly fatalDiagnostics: readonly RankingDiagnostic[] }
