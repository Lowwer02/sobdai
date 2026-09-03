/**
 * lib/engine/solver/contracts.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver — immutable contracts only.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4 (Constraint Categories),
 *     §7 (Conflict Resolution Model), §8 (Feasibility Model),
 *     §11 (Failure Handling), §12 (AllocatedCandidateSet).
 *   - Allocation Model Specification v1.0 §5 (Allocation States),
 *     §7 (Conflict Model), §8 (Reservation Model), §9 (Replacement Model).
 *
 * This file is TYPES ONLY. No solver logic, no search, no backtracking, no
 * placement algorithm, no constraint evaluation, no Bank access, no I/O, no
 * side effects. The Solver's runtime stages (later sessions) consume these
 * types. Per Allocation Model §0 ("This is not the Solver — it is the language
 * the Solver speaks"), the Solver consumes the Allocation vocabulary exactly;
 * it does not redefine Slot, Assignment, Reservation, Conflict, Lock, or
 * Replacement. Per Solver §0 ("This is the Solver — not the language"),
 * ownership is split: Allocation Model owns semantics; Solver owns behavior.
 *
 * VOCABULARY REUSE: CandidateSet, BlueprintSlot, ShortfallReport,
 * CoverageSatisfaction, GeneratorWarning are imported from ../generator/
 * contracts. RankedCandidateSet, RankedCandidate, RankedSlot, RankingWarning
 * are imported from ../ranking/contracts. CompositeScore, ScoringConfidence,
 * Penalty, RawSignal, ComponentId are imported from ../scoring/contracts.
 * The Solver does NOT duplicate or redefine any upstream contract — it carries
 * them forward unchanged (Solver §12.4, "Carried-Forward Fields").
 *
 * CASING: camelCase, matching the existing lib/engine/** contracts convention.
 * The Solver spec's §12.3 "Conceptual Shape" uses snake_case, but that section
 * is explicitly labeled "Conceptual" (illustrative, not normative). Following
 * the codebase convention keeps the Solver's output contract consistent with
 * the RankedCandidateSet it consumes (ranking/contracts.ts) and the
 * CandidateGenerationResult it ultimately derives from.
 *
 * IMMUTABILITY: every field is `readonly`. Arrays are `readonly`. Maps are
 * not introduced here so the output remains plainly serializable (mirroring
 * ranking/contracts.ts).
 *
 * DETERMINISM: every type is a pure data structure. When constructed from
 * deterministic inputs, two byte-identical RankedCandidateSets produce
 * byte-identical AllocatedCandidateSets given the same Solver version (Solver
 * §9.2 — "Same RankedCandidateSet + same Solver version → same
 * AllocatedCandidateSet. Always."). Verified by the contract test's
 * stable-serialization property.
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
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
  RankingWarning,
} from '../ranking/contracts'
import type { ComponentId } from '../scoring/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Solver-owned vocabulary (§4, §7, §8, §11)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The ten runtime stages from Constraint Solver Architecture §3.1. The contract
 * records the stage taxonomy; the pipeline that executes them is a later
 * session. Each stage has one responsibility (§3.2 Stage Contracts).
 */
export type SolverStage =
  | 'receive'
  | 'initialize'
  | 'validate_constraints'
  | 'candidate_placement'
  | 'conflict_detection'
  | 'conflict_resolution'
  | 'allocation_validation'
  | 'finalize_allocation'
  | 'audit_finalization'
  | 'allocated_candidate_set_emission'

/**
 * Failure severity vocabulary from Constraint Solver Architecture §11.2.
 * Fatal failures halt the Solver (structural corruption / input
 * contradictions); non-fatal failures are infeasibilities that become
 * shortfalls in a partial AllocatedCandidateSet.
 */
export type SolverSeverity = 'Fatal' | 'Non-fatal'

/**
 * Fatal and non-fatal failure categories from Constraint Solver Architecture
 * §11.1. EXACT vocabulary — adding a value is a Solver contract change.
 */
export type SolverDiagnosticCategory =
  | 'blueprint_impossible'
  | 'constraint_contradiction'
  | 'no_feasible_candidate'
  | 'runtime_inconsistency'
  | 'version_mismatch'
  | 'corrupted_allocation'
  | 'invalid_runtime_state'
  | 'duplicate_assignment'
  | 'released_lock'

/**
 * The conceptual constraint categories from Constraint Solver Architecture
 * §4.1. EXACT vocabulary — new categories require a Solver version bump
 * (§4.4, §17.7, AP-14). These classify constraints by *kind*, not by
 * enforcement mechanism.
 */
export type ConstraintCategory =
  | 'hard'
  | 'soft'
  | 'coverage'
  | 'distribution'
  | 'cross_set'
  | 'dependency'
  | 'reviewer'
  | 'future'

/**
 * Fixed constraint priority order from Constraint Solver Architecture §4.3.
 * When constraints interact, the Solver applies this priority. The literal
 * string encodes the priority position so audit consumers can sort deterministically.
 *
 * 1. Reviewer Constraints — highest (Human Authority is final).
 * 2. Hard Constraints — inviolable.
 * 3. Soft Constraints — advisory.
 * 4. Future Constraints — per declared priority (none in v1.0).
 */
export type ConstraintPriority = 'reviewer' | 'hard' | 'soft' | 'future'

/**
 * The feasibility spectrum from Constraint Solver Architecture §8.1. EXACT
 * vocabulary. A run lands in exactly one state.
 *
 * - 'feasible'            — every Slot Allocated, every Hard Constraint satisfied.
 * - 'partially_feasible'  — some Slots Rejected; honest best effort.
 * - 'infeasible'          — Blueprint cannot be satisfied even in principle.
 * - 'impossible'          — Blueprint self-contradictory on paper (stage 3).
 */
export type FeasibilityState =
  | 'feasible'
  | 'partially_feasible'
  | 'infeasible'
  | 'impossible'

// ═══════════════════════════════════════════════════════════════════════════
// 2. Allocation vocabulary (Allocation Model §5, §7 — spoken, not redefined)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Allocation Unit / Slot lifecycle state vocabulary from Allocation Model §5.1.
 *
 * The Solver speaks the Allocation vocabulary exactly (Solver §18.4): it may
 * not invent states, transition rules, or contracts. These literals are the
 * Allocation Model's state vocabulary, surfaced here so the Solver's output
 * contract can name a placed slot's terminal state without redefining what the
 * states *mean*.
 *
 * - 'open'        — Slot has no Candidate; available.
 * - 'reserved'    — tentatively held for a Candidate during solving (internal;
 *                   does not escape to the output per Allocation §8.1).
 * - 'allocated'   — confirmed Candidate placement (post-solving).
 * - 'locked'      — allocation committed as Solver output (terminal within run).
 * - 'released'    — allocation undone (Reviewer override, post-run).
 * - 'rejected'    — Slot cannot be filled; shortfall recorded (Solver terminal).
 * - 'completed'   — allocation Approved by Human Reviewer (terminal, post-run).
 */
export type AllocationState =
  | 'open'
  | 'reserved'
  | 'allocated'
  | 'locked'
  | 'released'
  | 'rejected'
  | 'completed'

/**
 * Conflict type vocabulary from Allocation Model §7.2. EXACT vocabulary — the
 * Solver may not invent Conflict types (Allocation §7.5, Solver AP-11).
 *
 * - 'hard'              — violates a Hard constraint; blocks placement.
 * - 'soft'              — strains a Soft constraint; warns but does not block.
 * - 'dependency'        — placement depends on another (e.g. coverage).
 * - 'mutual_exclusion'  — two Candidates cannot both be placed (e.g. L1).
 */
export type ConflictType = 'hard' | 'soft' | 'dependency' | 'mutual_exclusion'

/**
 * Conflict scope from Allocation Model §7.3. EXACT vocabulary. Cross-set and
 * within-run conflicts are why Allocation Group reasoning is necessary.
 */
export type ConflictScope = 'within_set' | 'cross_set' | 'within_run'

/**
 * The resolution status of a Conflict, composing Allocation Model §7.4
 * ("Resolution: how or whether the Conflict was resolved") with Solver §7.1
 * ("Conflict Persistence": every Conflict is recorded whether resolved or not).
 *
 * - 'resolved'    — the Conflict was removed via Replacement/Swap/Rollback/etc.
 * - 'unresolved'  — the Conflict could not be resolved; surfaces as a shortfall.
 * - 'superseded'  — the Conflict was abandoned because the placement itself was
 *                   rejected/replaced (the Candidate is no longer in contention).
 */
export type ConflictResolutionStatus = 'resolved' | 'unresolved' | 'superseded'

// ═══════════════════════════════════════════════════════════════════════════
// 3. Placement transparency (Solver §10, Allocation §10.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Why a Candidate occupies its Slot (Solver §10.2, §12.3
 * `placement_reasoning`). Always-present transparency (Solver §10.4): the
 * placement reasoning is carried on every allocated slot, never empty.
 *
 * Per Solver §18.3, Reservation priority is *inherited* from Ranking, never
 * *computed* by the Solver. `inheritedRank` records the inherited priority as
 * evidence ("ranked Nth for this slot"); it does not re-rank.
 */
export interface PlacementReasoning {
  /** The inherited Composite value from the RankedCandidate (read-only, unchanged). */
  readonly inheritedScoreValue: number
  /**
   * The position this Candidate held in the RankedSlot's ordering (1-based).
   * Inherited read-only from Ranking (Solver §18.3) — never recomputed.
   */
  readonly inheritedRank: number
  /**
   * Plain-language explanation of why this Candidate was placed here. Never
   * empty. Composes the inherited priority with constraint satisfaction (§10.2).
   */
  readonly summary: string
}

/**
 * A named Blueprint constraint reference (Allocation §7.1 `constraint
 * reference`, §7.4 "Constraint: named, not vague"). Identifies which
 * Blueprint rule is at issue — e.g. 'L1', 'tier_1_floor', 'anchor_rule',
 * 'CR-1', 'CR-3'. The literal is opaque at this layer; the Solver's runtime
 * names the constraints the Blueprint carries via the AssemblyRequest.
 */
export type ConstraintReference = string

/**
 * One Conflict encountered during solving, with full evidence (Allocation
 * §7.4, Solver §7.3 Transparency Guarantee). Recorded whether resolved or not
 * (Solver §7.1 Conflict Persistence). Carried in a placed slot's
 * `conflictsResolved[]` or in the top-level `unresolvedConflicts[]`.
 *
 * Per Solver §18.2, a Solver-applied Hard Penalty augmentation (Scoring §9.2)
 * manifests as a Hard Conflict with `source: 'solver'`. The Candidate's
 * underlying Composite Score is unchanged; the augmentation is layered on top,
 * transparently, for this (Candidate × Slot) placement only.
 */
export interface ConflictRecord {
  /** The Candidate whose placement triggered or is implicated in the Conflict. */
  readonly candidateCode: string
  /** The Blueprint constraint at issue (named, not vague). */
  readonly constraint: ConstraintReference
  /** Hard / Soft / Dependency / Mutual Exclusion (Allocation §7.2). */
  readonly type: ConflictType
  /** Within-set / Cross-set / Within-run (Allocation §7.3). */
  readonly scope: ConflictScope
  /** Which actor detected the Conflict: the Solver, or the Reviewer via override. */
  readonly source: 'solver' | 'reviewer'
  /** How or whether the Conflict was resolved; if unresolved, why (Allocation §7.4). */
  readonly resolution: ConflictResolutionStatus
  /**
   * Other placed Candidates implicated (e.g. the L1 mutual-exclusion partner).
   * Empty when the Conflict has no co-participants. Codes, not objects.
   */
  readonly participants: readonly string[]
  /** The signals and Slot state that produced the Conflict. Never empty. */
  readonly evidence: string
  /**
   * Plain-language description of the resolution attempt (or non-resolution).
   * Never empty: AP-5/Allocation AP-5 forbid hidden conflicts; AP-7 forbids
   * implicit resolution.
   */
  readonly resolutionNote: string
}

/**
 * One Replacement performed on a Slot during solving (Allocation §9.1,
 * Solver §12.3 `replacements[]`). Replacements are explicit, never silent
 * (Allocation AP-7). A Reviewer may also perform a Replacement during review
 * (an override) — distinguished by `source`.
 */
export interface ReplacementRecord {
  /** The Candidate removed from the Slot. */
  readonly previousCode: string
  /** The Candidate now occupying the Slot (null if the Slot was left Open). */
  readonly newCode: string | null
  /** Why the Replacement occurred (constraint forced backtrack, Reviewer preference). */
  readonly reason: string
  /** Which actor performed the Replacement: the Solver during search, or Reviewer. */
  readonly source: 'solver' | 'reviewer'
}

/**
 * A Reviewer-imposed constraint in force for a placement (Solver §4.1
 * Reviewer Constraints, §12.3 `reviewer_overrides[]`). Reviewer overrides are
 * Hard Constraints with the highest priority (Solver §4.3); they are inputs to
 * re-solving, honored verbatim (Solver §2.5, Allocation §5.4).
 *
 * Per Allocation §5.4, a Reviewer override that violates a Hard Constraint is
 * permitted only with explicit acknowledgement — recorded here as a Conflict.
 */
export interface ReviewerOverrideRecord {
  /** The Candidate the override concerns. */
  readonly candidateCode: string
  /** force-include / force-exclude / replace / un-reject (Allocation §5.4). */
  readonly kind: 'force_include' | 'force_exclude' | 'replace' | 'un_reject'
  /** Plain-language reason the Reviewer gave. Never empty. */
  readonly reason: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Placement outcomes (Solver §12.3 placements[])
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The common fields shared by every placement record (Solver §12.3). A
 * placement is keyed by `slotId` and resolves to one terminal state:
 * Allocated (filled) or Rejected (could not be filled). The discriminated union
 * below (`AllocatedPlacement` | `RejectedPlacement`) gives compile-time
 * narrowing on `state`.
 */
interface PlacementBase {
  /** Stable slot id string (mirrors RankedSlot.slotId; §12.3 `slot_id`). */
  readonly slotId: string
  /** The Blueprint slot this placement belongs to. Immutable (Allocation §6.1). */
  readonly slot: BlueprintSlot
}

/**
 * A successfully allocated Slot (Solver §12.3 placements[], state Allocated).
 * The assigned Candidate, the reasoning for its placement, the conflicts that
 * arose (and were resolved), any replacements performed, and any Reviewer
 * overrides in force.
 *
 * `assignedCandidate` carries the placed Candidate's full RankedCandidate
 * record — including its unchanged Composite, Confidence, Penalties, and
 * Signals — read-only from Ranking. The Solver never re-scores or re-ranks
 * (AP-1, AP-2; §18.2, §18.3).
 */
export interface AllocatedPlacement extends PlacementBase {
  /** Discriminator: this Slot was filled. */
  readonly state: 'allocated'
  /** The placed Candidate, with its read-only inherited evaluation. */
  readonly assignedCandidate: RankedCandidate
  /** Why this Candidate occupies this Slot (§10.2). Never empty. */
  readonly placementReasoning: PlacementReasoning
  /** Conflicts encountered and resolved during this placement (Allocation §7.4). */
  readonly conflictsResolved: readonly ConflictRecord[]
  /** Replacements performed on this Slot, with reasons (Allocation §9.1). */
  readonly replacements: readonly ReplacementRecord[]
  /** Reviewer-imposed constraints in force for this placement (Solver §4.1). */
  readonly reviewerOverrides: readonly ReviewerOverrideRecord[]
}

/**
 * A Slot the Solver could not fill (Solver §12.3 placements[], state Rejected;
 * §8.4 Rejected Slots). A Rejected Slot is a shortfall, not a failure — it is
 * the Solver's honest reporting mechanism (Solver §8.3, §8.5). The Reviewer may
 * force a Candidate into it (Allocation §5.4 un-reject); the Solver never does
 * so silently.
 */
export interface RejectedPlacement extends PlacementBase {
  /** Discriminator: this Slot could not be filled. */
  readonly state: 'rejected'
  /** Candidates considered and why each was blocked. At least one entry. */
  readonly considered: readonly RejectedCandidateDetail[]
  /** The specific Hard Constraints that could not be satisfied. At least one. */
  readonly blockingConstraints: readonly ConstraintReference[]
  /** Plain-language explanation of the shortfall. Never empty. */
  readonly reason: string
}

/**
 * Per-considered-Candidate detail on a Rejected Slot (Solver §8.4 "the
 * Candidates considered (and why each was blocked)"). Names the Candidate and
 * the specific reason it could not be placed.
 */
export interface RejectedCandidateDetail {
  /** The Question Code of the considered Candidate. */
  readonly candidateCode: string
  /** Plain-language reason this Candidate could not be placed here. Never empty. */
  readonly reason: string
}

/**
 * One placement per Slot (Solver §12.3 placements[]). Discriminated by `state`.
 * Exactly one placement per Blueprint Slot — the Solver produces a joint
 * mapping, one outcome per slot (Allocated or Rejected).
 */
export type Placement = AllocatedPlacement | RejectedPlacement

// ═══════════════════════════════════════════════════════════════════════════
// 5. Shortfall summary (Solver §8.2, §12.3 shortfall_summary)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate shortfall summary (Solver §8.2, §12.3 `shortfall_summary`). The
 * gap between the Blueprint's targets and what the Solver achieved. Carried at
 * the top level of the AllocatedCandidateSet alongside the carried-forward
 * upstream ShortfallReport (which the Solver augments but does not modify).
 */
export interface ShortfallSummary {
  /** How many Slots were Allocated. */
  readonly allocatedSlotCount: number
  /** How many Slots were Rejected (could not be filled). */
  readonly rejectedSlotCount: number
  /** How many unresolved Conflicts remain. */
  readonly unresolvedConflictCount: number
  /** How many violated Soft Constraints were recorded as warnings. */
  readonly strainedSoftConstraintCount: number
  /** Plain-language summary of the gap. Never empty. */
  readonly summary: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Audit trail (Solver §10, §12.3 audit_trail)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One reproducible decision in the audit trail (Solver §10.3, Allocation
 * §10.2). The audit trail is reproducible: given the same RankedCandidateSet
 * and version stack, the trail can be re-derived exactly (Solver §10.5).
 *
 * `decision` records the kind of act (placement / rejection / conflict /
 * replacement / rollback / release / lock). `evidence` and `reasoning` together
 * satisfy the "What Every Decision Explains" table (Solver §10.2); `ordering`
 * gives the reconstructable sequence (Solver §10.3 Ordering component).
 */
export interface AllocationAuditEntry {
  /** The kind of decision this entry records. */
  readonly decision:
    | 'placement'
    | 'rejection'
    | 'conflict'
    | 'replacement'
    | 'rollback'
    | 'release'
    | 'lock'
  /** Which actor made the decision (Solver, or Reviewer-with-override). */
  readonly owner: 'solver' | 'reviewer'
  /**
   * The sequence position for reconstruction (Solver §10.3 Ordering). Stable,
   * zero-based, strictly increasing within the trail.
   */
  readonly ordering: number
  /** The signals, Scores, and Slot state that produced the decision. Never empty. */
  readonly evidence: string
  /** Plain-language explanation of why the decision was made. Never empty. */
  readonly reasoning: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Solver warning (§3.2 non-fatal rows, §12.3 warnings surface)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A Solver-emitted warning (Solver §3.2 Conflict Detection / Conflict
 * Resolution — non-fatal rows; §8.2 strained Soft Constraints). Distinct from
 * the carried-forward Generator and Ranking warnings; composes the layered
 * warning surface (Solver §12.3, carried-forward via `warnings`).
 */
export interface SolverWarning {
  readonly severity: Extract<SolverSeverity, 'Non-fatal'>
  /** The conceptual constraint category strained (Solver §4.1), if applicable. */
  readonly category: ConstraintCategory | null
  readonly stage: SolverStage
  readonly slotId: string | null
  readonly candidateCode: string | null
  readonly explanation: string
  readonly recommendation: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. AllocatedCandidateSet output (§12)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AllocatedCandidateSet identity block (Solver §12.3 identity). Pins the
 * allocation to a specific RankedCandidateSet and the version stack that
 * produced it.
 */
export interface AllocatedCandidateSetIdentity {
  /** The RankedCandidateSet id this allocation derives from. */
  readonly rankedCandidateSetId: string
  /** The Solver implementation version that produced this allocation. */
  readonly solverVersion: string
  /** The Allocation Model version spoken (Allocation Model §16.7). */
  readonly allocationModelVersion: '1.0'
  /** The Scoring Model version of the inherited evaluations. */
  readonly scoringModelVersion: '1.0'
}

/**
 * AllocatedCandidateSet metadata block (Solver §12.3 meta). Carries the spec
 * version plus the version stack for reproducibility (Solver §9.3 Versioning).
 */
export interface AllocatedCandidateSetMeta {
  readonly specVersion: '1.0'
  readonly solverVersion: string
  readonly allocationModelVersion: '1.0'
  readonly scoringModelVersion: '1.0'
}

/** Physical per-Set allocation evidence (quantified Blueprints only). */
export interface PerSetPhysicalCount {
  readonly setNumber: number
  /** The Blueprint's required physical Set size (`target.perSet`). */
  readonly expectedQuestionCount: number
  /** Placements actually allocated for this Set. */
  readonly allocatedQuestionCount: number
  /** Distinct Question Codes among the allocated placements. */
  readonly distinctQuestionCount: number
}

/**
 * The Solver's immutable OUTPUT contract (Solver §12). A feasible (or honestly
 * partial) joint mapping of Candidates to Blueprint Slots, with full audit
 * trail (Solver §12.1). The input to Review (Solver §12.6).
 *
 * CARRY-FORWARD (Solver §12.4): the CandidateSet's shortfalls and coverage
 * satisfaction are carried forward unchanged — the Solver augments with its own
 * shortfalls (Rejected Slots, unresolved Conflicts) but does not modify the
 * upstream findings.
 *
 * LIFECYCLE (Solver §12.5): immutable once emitted. Caching for audit is
 * permitted (input-deterministic).
 *
 * BOUNDARIES (Solver §12.6, Appendix B): read-only for downstream. Not a
 * selection, not a Draft, not a publication, not opaque.
 *
 * DETERMINISM (Solver §9.2): same RankedCandidateSet + same Solver version →
 * same AllocatedCandidateSet. Always.
 */
export interface AllocatedCandidateSet {
  readonly identity: AllocatedCandidateSetIdentity
  /** One placement per Blueprint Slot (Solver §12.3 placements[]). */
  readonly placements: readonly Placement[]
  /**
   * Physical per-Set allocation evidence for quantified Blueprints (authored
   * LO quantities). One row per Set: the physical Question placements must
   * equal the Blueprint's per-Set target exactly — slot-group counts are not
   * a substitute. Undefined for legacy unquantified allocations.
   */
  readonly perSetPhysicalCounts?: readonly PerSetPhysicalCount[]
  /** The joint feasibility verdict for the whole allocation (Solver §8.1). */
  readonly feasibility: FeasibilityState
  /** Aggregate gap: targets vs. achieved (Solver §8.2, §12.3 shortfall_summary). */
  readonly shortfallSummary: ShortfallSummary
  /** Hard Conflicts that could not be resolved (Solver §12.3 unresolved_conflicts[]). */
  readonly unresolvedConflicts: readonly ConflictRecord[]
  /** Full reproducible decision trace (Solver §12.3 audit_trail). */
  readonly auditTrail: readonly AllocationAuditEntry[]
  /**
   * The RankedCandidateSet consumed read-only (Solver §12.3 identity +
   * upstream-immutability §3.3). Carried for audit traceability; never modified.
   */
  readonly rankedCandidateSet: RankedCandidateSet
  /** Carried forward from CandidateSet unchanged (Solver §12.4). */
  readonly shortfallReport: ShortfallReport
  /** Carried forward from CandidateSet unchanged (Solver §12.4). */
  readonly coverageSatisfaction: CoverageSatisfaction
  /** Carried forward unchanged for Solver/audit visibility (IG-5 amendment). */
  readonly constraintSnapshot: ConstraintSnapshot
  /**
   * Layered warnings: carried-forward Generator + Ranking warnings plus
   * Solver-emitted warnings (mirrors RankedCandidateSet.warnings composition).
   */
  readonly warnings: readonly (GeneratorWarning | RankingWarning | SolverWarning)[]
  readonly meta: AllocatedCandidateSetMeta
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Structured failures (§11)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured Solver diagnostic (Solver §11.3 "Fail Loud": category, location,
 * severity, explanation, recommendation). Mirrors the Ranking diagnostic shape
 * (ranking/contracts.ts RankingDiagnostic) so the Runtime API can surface
 * Solver failures uniformly with upstream module failures.
 */
export interface SolverDiagnostic {
  readonly category: SolverDiagnosticCategory
  readonly severity: SolverSeverity
  readonly stage: SolverStage
  readonly slotId: string | null
  readonly candidateCode: string | null
  readonly componentId: ComponentId | null
  readonly explanation: string
  readonly recommendation: string
}

/**
 * Top-level Solver result: success emits an AllocatedCandidateSet; fatal
 * failure emits diagnostics (Solver §3.2 Stage Contracts — Fatal rows;
 * §11.2 Fatal vs. Non-Fatal). Mirrors the CandidateRankingResult /
 * CandidateGenerationResult discriminated-union pattern.
 *
 *  - `ok: true`  — AllocatedCandidateSet produced. May be a partial allocation
 *                  with shortfalls (Solver §8.3); partial is valid output.
 *  - `ok: false` — Fatal failure; no AllocatedCandidateSet produced (Solver
 *                  §11.2). Structural corruption or input contradiction.
 */
export type ConstraintSolverResult =
  | { readonly ok: true; readonly allocatedCandidateSet: AllocatedCandidateSet }
  | { readonly ok: false; readonly fatalDiagnostics: readonly SolverDiagnostic[] }

// ═══════════════════════════════════════════════════════════════════════════
// 10. Re-exports — single import surface for downstream stages
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Downstream stages import everything they need from this barrel. The upstream
 * contracts the Solver consumes are re-exported so consumers of the
 * AllocatedCandidateSet (the Runtime API, the Review Workbench) can resolve
 * carried-forward fields through a single import (mirrors generator/contracts
 * re-exports). No type is redefined here.
 */
export type {
  BlueprintSlot,
  CandidateSet,
  ConstraintSnapshot,
  CoverageSatisfaction,
  GeneratorWarning,
  ShortfallReport,
} from '../generator/contracts'

export type {
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
  RankingWarning,
} from '../ranking/contracts'

export type { ComponentId } from '../scoring/contracts'
