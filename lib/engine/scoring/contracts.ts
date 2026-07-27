/**
 * lib/engine/scoring/contracts.ts
 * ----------------------------------------------------------------------------
 * Scoring Model — foundational contracts (immutable types only).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Scoring Model Specification v1.0 §4 (Score Components — the fixed
 *     vocabulary), §6 (Confidence Model), §7 (Penalty Model), §8 (Score
 *     Transparency), §10 (Data Contracts), §11 (Failure Handling).
 *
 * This file is TYPES ONLY. No scoring logic, no evaluation, no math, no
 * calculations, no Bank access, no I/O, no side effects. The Ranking runtime
 * stages (E-3C+) consume these types. Per Scoring Model §0 ("This is not a
 * module specification. It is a language specification"), this file IS that
 * language, spoken by Ranking.
 *
 * VOCABULARY REUSE: enum types (Difficulty, Tier, BlueprintType, QuestionPattern,
 * LearningObjective, etc.) are imported from ../reader/contracts — the FROZEN
 * upstream vocabulary. They are NOT redefined here. Adding a value to any of
 * those enums is a contract change in the upstream file, not here. Same pattern
 * as lib/engine/generator/contracts.ts:34-42.
 *
 * CASING: camelCase, matching the existing lib/engine/** codebase convention
 * (reader/contracts.ts and generator/contracts.ts use camelCase). The Scoring
 * Model spec's prose uses snake_case in code fences, but it is explicitly
 * labeled conceptual/illustrative (§10 "These are vocabulary, not schemas").
 * Following the codebase convention keeps the Scoring language consistent with
 * the AssemblyRequest and CandidateSet it consumes.
 *
 * IMMUTABILITY: every field is `readonly`. Discriminated unions use literal
 * `type`/`kind` fields for compile-time narrowing. No setters, no mutation.
 * (Scoring Model §10 + Implementation Planning determinism contract.)
 *
 * DETERMINISM: every type is a pure data structure. When constructed from
 * deterministic inputs, two byte-identical inputs produce byte-identical
 * instances (verified by the contract test's stable-serialization property).
 *
 * BOUNDARIES (Scoring §13.1): these contracts CARRY only evaluation and
 * metadata. They do NOT carry: Question content, selection/decision state,
 * cross-Candidate comparison, or Bank rows. They NEVER reference Math.random,
 * Date.now, the Bank, an LLM, or SQL.
 *
 * RELATIONSHIPS (Scoring §10.7):
 *
 *   RawSignal ───┐
 *                 ├─► ScoreComponent ──┐
 *   RawSignal ───┘                     │
 *                                      ├─► CompositeScore ──► ScoringConfidence (parallel)
 *   RawSignal ───┐                     │           │
 *                 ├─► ScoreComponent ──┘           └─► ScoreBreakdown
 *   RawSignal ───┘                                 │
 *                                                  └─► Penalty (applied to Composite)
 *
 * Every Composite traces to its Components; every Component traces to its
 * Signals; every Confidence and Penalty is bound to the Composite it qualifies.
 */

import type {
  BlueprintType,
  CoverageRuleId,
  Difficulty,
  LearningObjective,
  QuestionPattern,
  Tier,
} from '../reader/contracts'
import type { BlueprintSlot } from '../generator/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. SignalExtractionConfidence — the four integrity states (§6.2, §6.3, §3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The integrity classification a Raw Signal carries at extraction time
 * (§6.2 Confidence Vocabulary, §6.3 Confidence Propagation step 1).
 *
 * EXACT vocabulary (four values — Scoring Model §6.2 + §6.3.1):
 *
 * - 'known'       — "A signal is present and trustworthy (e.g. difficulty =
 *                    Easy from a complete Bank row)." (§6.2) No Confidence
 *                    reduction.
 * - 'incomplete'  — "A signal is partially present (e.g. topic exists but
 *                    does not match the Blueprint's curated Topic strings —
 *                    Integration Spec IG-1 analog)." (§6.2) Confidence
 *                    reduced.
 * - 'missing'     — "A signal is entirely absent (a stronger form of
 *                    Unknown)" (§6.2). The canonical IG-2 case: "pattern is
 *                    missing because the column does not exist" (§6.2).
 *                    Confidence reduced; flagged.
 * - 'conflicting' — "Two signals disagree (e.g. a Candidate's document maps
 *                    to Tier 2 by the Registry but its tags suggest Tier 3)"
 *                    (§6.2). Confidence reduced; conflict flagged; NOT
 *                    resolved by picking a winner.
 *
 * This is the per-Signal carrier of §6.3 propagation step 1: "Each Raw Signal
 * carries a confidence level: known / incomplete / missing / conflicting."
 *
 * DISTINCT from the Generator's metadata-quality `ConfidenceLevel` ('full' |
 * 'reduced' — Candidate Generation §5.2). That coarse two-state facet is an
 * INPUT to Scoring (§6.5 reconciliation); this four-state vocabulary is the
 * Scoring language's own integrity classifier. Do not merge the two.
 */
export type SignalExtractionConfidence = 'known' | 'incomplete' | 'missing' | 'conflicting'

// ═══════════════════════════════════════════════════════════════════════════
// 2. RawSignal — one atomic fact about a Candidate (§10.1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The set of axes a Raw Signal may observe. Drawn ONLY from CandidateSet
 * metadata (Scoring §3.1, §12.2 — "Scoring operates on CandidateSet metadata.
 * It never reads Question content"). This union is the closed inventory of
 * what a Signal IS ABOUT; new axes require a Scoring Model version bump
 * (§15.6), not a unilateral Ranking extension.
 *
 * Maps to the Scoring Model §4.1 Component inputs:
 *  - difficulty, pattern, learning_objective, document, topic, tier —
 *    Candidate metadata axes (Candidate Generation §5.5).
 *  - usage_count, last_used_at — Usage / Freshness inputs (Bank metadata).
 *  - generator_confidence — the Generator's per-Candidate Confidence facet,
 *    an input to Scoring Confidence per §6.5 reconciliation.
 *
 * `null` is forbidden: a RawSignal's source must name a concrete field. (A
 * signal being ABSENT is represented by integrity='missing', not by an absent
 * source name.)
 */
export type RawSignalSource =
  | 'difficulty'
  | 'pattern'
  | 'learning_objective'
  | 'document'
  | 'topic'
  | 'tier'
  | 'blueprint_type'
  | 'usage_count'
  | 'last_used_at'
  | 'generator_confidence'

/**
 * A Raw Signal — "a factual observation about a Candidate, extracted from
 * CandidateSet metadata" (§10.1).
 *
 * Per §10.1:
 *  - Owns: "One atomic fact (e.g. difficulty = Easy, usage_count = 7)".
 *  - Carries: "Value + source (CandidateSet field) + extraction confidence".
 *  - Does NOT carry: "Evaluation, opinion, or comparison".
 *
 * The Signal is the input to every Score Component; its integrity drives
 * downstream Confidence (§6). Signals are extracted by Ranking's Signal
 * Extraction stage (Candidate Ranking §3) — NOT computed by Scoring itself.
 *
 * DESIGN NOTES:
 *  - `value` is `unknown` because signals span heterogeneous shapes: an enum
 *    value (Difficulty), a number (usage_count), a derived Tier, a Confidence
 *    struct. The Component evaluator that consumes this Signal narrows by
 *    `source` (a discriminated-union-style dispatch on source → value type).
 *    The contract pins the SOURCE vocabulary; the value payload is open by
 *    design (§10 "vocabulary, not schemas"). Serialization-stable because
 *    consumers must narrow before comparison.
 *  - `integrity` is the per-Signal carrier of Confidence propagation step 1
 *    (§6.3.1). It is non-optional: every Signal is classified at extraction.
 */
export interface RawSignal {
  /** The Candidate this Signal is about (immutable business identifier). */
  readonly questionCode: string
  /** Which CandidateSet field this fact came from (closed vocabulary above). */
  readonly source: RawSignalSource
  /** The atomic fact's value (narrowed by the consuming Component). */
  readonly value: unknown
  /**
   * Extraction integrity (§6.2, §6.3.1). Drives Confidence propagation.
   * Non-optional: every Signal is classified at extraction time.
   */
  readonly integrity: SignalExtractionConfidence
  /**
   * Free-text explanation of how the value was extracted or why integrity is
   * not 'known' (e.g. "pattern column absent — IG-2 gap", "tier derived via
   * document Registry lookup"). Null when integrity === 'known' and the
   * extraction path is the trivial direct read.
   */
  readonly extractionNote: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ComponentId — the FIXED v1.0 Score Component vocabulary (§4.1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The v1.0 Score Component vocabulary — EXACTLY ten components (Scoring
 * Model §4.1). This is the closed set Ranking may compute; inventing a new
 * component requires a Scoring Model version bump (§4.4, §15.6) and is an
 * explicit Anti-Pattern (AP-2) if done unilaterally.
 *
 * The ten (§4.1 table):
 *   1. coverage_fit          — Candidate's (document, topic) vs slot's
 *                              coverage requirement.
 *   2. difficulty_fit        — Candidate's difficulty vs slot's difficulty.
 *   3. distribution_fit      — slot's current fill state vs target count.
 *   4. pattern_fit           — Candidate's pattern vs slot's pattern (IG-2).
 *   5. lo_fit                — Candidate's learning_objective vs slot's LO.
 *   6. freshness             — Candidate's lifecycle timestamps.
 *   7. usage                 — Candidate's usage count across Exam Sets.
 *   8. diversity             — (Topic × Difficulty × Type) distinctness.
 *   9. constraint_readiness  — slot's constraint headroom (Solver preview).
 *  10. blueprint_alignment   — holistic alignment with slot intent.
 *
 * Ordering of this union is alphabetical for deterministic iteration; it is
 * NOT a priority ordering (Components are facets, not a ranking — §4.3).
 */
export type ComponentId =
  | 'coverage_fit'
  | 'difficulty_fit'
  | 'distribution_fit'
  | 'pattern_fit'
  | 'lo_fit'
  | 'freshness'
  | 'usage'
  | 'diversity'
  | 'constraint_readiness'
  | 'blueprint_alignment'

/**
 * The v1.0 Component vocabulary as a fixed, inspectable array. Mirrors the
 * Generator's FILTER_EXECUTION_ORDER pattern (lib/engine/generator/contracts.ts
 * :319): a named constant that lets tests assert vocabulary stability
 * (no Component silently added or removed without a spec bump).
 *
 * NOT a priority order — Components are facets (§4.3). Sort order is
 * deterministic (alphabetical) purely so iteration is reproducible.
 */
export const COMPONENT_VOCABULARY: readonly ComponentId[] = [
  'coverage_fit',
  'difficulty_fit',
  'distribution_fit',
  'pattern_fit',
  'lo_fit',
  'freshness',
  'usage',
  'diversity',
  'constraint_readiness',
  'blueprint_alignment',
] as const

// ═══════════════════════════════════════════════════════════════════════════
// 4. NormalizedScore — a Component value on a common scale (§3, §4.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A normalized Component value. Per Scoring §3 lifecycle stage "Normalized
 * Scores — components placed on common scales" and §4.2 ("Output: The
 * component's value + its normalized form").
 *
 * The model fixes that Components are placed on a COMMON SCALE (§3, §5.2
 * "Comparable. Two Composites for the same slot are directly comparable")
 * but explicitly does NOT specify the scale or the normalization math
 * (§4.3: "Components are not formulas"; §10: "vocabulary, not schemas").
 *
 * DESIGN: the contract pins only the existence of a normalized value and its
 * domain. `value` is a finite number in the closed interval [0, 1]. The
 * bounds are asserted here so that:
 *  - Two normalized values are always directly comparable (§5.2).
 *  - The "common scale" requirement (§3) is honored without inventing the
 *    scale's semantics (which is implementation — §4.3).
 *
 * Out-of-range values are a contract violation (caught at construction time
 * by the Ranking runtime; this types-only file cannot enforce runtime bounds,
 * but the JSDoc and the test pin the intended domain).
 */
export interface NormalizedScore {
  /**
   * The normalized value, on the common Component scale. Bounded to the
   * closed interval [0, 1]. Constructing out-of-range is a runtime contract
   * violation (Fail Loud — §11).
   */
  readonly value: number
  /**
   * Human-readable name of the normalization basis (e.g. "exact-match",
   * "tier-weighted", "jaccard"). Free text; the contract requires presence
   * for transparency (§8) but does not fix the vocabulary (implementation
   * concern per §4.3).
   */
  readonly scale: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ScoringConfidence — the propagated trust level (§6, §10.5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The propagated Scoring Confidence level. Per §6.2 ("Low Confidence" /
 * "High Confidence") and §10.5 ("Carries: Level (e.g. high/low) + propagation
 * path + the specific signals that reduced it").
 *
 * The spec defines Confidence qualitatively ("High Confidence: computed from
 * complete, consistent, known evidence" vs "Low Confidence: trust level is
 * reduced because the evidence is unknown, incomplete, missing, or
 * conflicting" — §6.2). This enum captures that two-state distinction
 * without inventing vocabulary the spec doesn't authorize — same conservative
 * pattern used for the Generator's ConfidenceLevel (Candidate Generation §5.2,
 * lib/engine/generator/contracts.ts:90).
 *
 * DISTINCT from:
 *  - SignalExtractionConfidence (4-state, per-Signal — §6.3.1).
 *  - Generator ConfidenceLevel ('full' | 'reduced' — Candidate metadata
 *    quality, an INPUT per §6.5).
 * This is the propagated, per-(Candidate × slot) Composite-level Confidence.
 */
export type ScoringConfidenceLevel = 'high' | 'low'

/**
 * Scoring Confidence — "the trust level of a Score, propagated from evidence
 * quality" (§10.5).
 *
 * Per §10.5:
 *  - Owns: "One parallel evaluation traveling with every Score".
 *  - Carries: "Level (e.g. high/low) + propagation path + the specific
 *    signals that reduced it".
 *  - Does NOT carry: "A probability, a ranking, or a substitute for the
 *    Score".
 *
 * Propagation contract (§6.3): Signal integrity (known/incomplete/missing/
 * conflicting) → Component Confidence → Composite Confidence. ANY non-'known'
 * Signal reduces Confidence (§6.3.1, §6.3.2). A Composite built on several
 * low-Confidence Components is itself low-Confidence, even if its value is
 * high (§6.3.3 — non-negotiable; AP-12 "Confidence collapse" prohibits the
 * reverse).
 */
export interface ScoringConfidence {
  /** High or Low (§6.2). */
  readonly level: ScoringConfidenceLevel
  /**
   * The Signal sources whose integrity reduced this Confidence (§10.5
   * "the specific signals that reduced it"). Empty when level === 'high'.
   * Each entry names a RawSignalSource from §4.1's Component inputs.
   */
  readonly reducingSignals: readonly RawSignalSource[]
  /**
   * Free-text propagation trace (§10.5 "propagation path"). Explains HOW
   * Confidence was derived from the evidence (e.g. "pattern Component built
   * on missing IG-2 column → low"). Null when level === 'high'.
   */
  readonly propagationNote: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. PenaltyType + Penalty — structured demerits (§7)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Penalty vocabulary — exactly three types (Scoring §7.1).
 *
 * - 'soft'            — "The Candidate is viable but disadvantaged for this
 *                       slot. Reduces the Composite Score's effective value.
 *                       The Candidate remains in contention." (§7.1)
 * - 'hard'            — "The Candidate is severely disadvantaged; selecting
 *                       it would be a deliberate choice. Strongly reduces the
 *                       effective value; flags the Candidate for Reviewer
 *                       attention." (§7.1)
 * - 'disqualification'— "The Candidate is ineligible for this slot, despite
 *                       passing Generator filters. Removes the Candidate
 *                       from this slot's contention entirely. Recorded with
 *                       reason." (§7.1)
 *
 * Combination rules (§7.3, structural not numerical):
 *  - Soft penalties may accumulate; effect is bounded (cannot reach Hard
 *    equivalence by Soft accumulation alone).
 *  - A Hard penalty dominates Soft for this slot.
 *  - Disqualification is TERMINAL for this (Candidate × slot) — cannot be
 *    overruled by other penalties or by Score (§7.1, §7.3).
 */
export type PenaltyType = 'soft' | 'hard' | 'disqualification'

/**
 * A structured demerit (§10.6, §7).
 *
 * Per §10.6:
 *  - Owns: "One disadvantage or disqualification".
 *  - Carries: "Type (Soft/Hard/Disqualification) + trigger + evidence +
 *    effect".
 *  - Does NOT carry: "A re-evaluation of the Candidate's fit (penalty
 *    modifies effect; it does not re-score)".
 *
 * Transparency is non-negotiable (§7.5: "Every penalty is explainable: type,
 * trigger, evidence, and effect on the Composite. An unexplained penalty is
 * non-conformant."). All four fields are therefore required and non-empty.
 *
 * Ownership (§7.4): applied by Ranking as part of scoring. The Constraint
 * Solver may AUGMENT Hard penalties only (§9.2); the Reviewer may REMOVE but
 * not add. The owner of an applied penalty is recorded for audit.
 */
export interface Penalty {
  /** soft / hard / disqualification (§7.1). */
  readonly type: PenaltyType
  /**
   * The evaluable condition that fired the penalty (§7.2 examples: "high
   * usage load", "near-duplicate of selected Candidate", "constraint
   * headroom exhausted"). Free text; never empty.
   */
  readonly trigger: string
  /**
   * The evidence supporting the penalty (e.g. the Signal source(s) or slot
   * state that fired it). Free text; never empty.
   */
  readonly evidence: string
  /**
   * The penalty's effect on the Composite (e.g. "reduces effective value by
   * application of Soft demerit", "removes from slot contention"). Free text;
   * never empty.
   */
  readonly effect: string
  /**
   * Which actor applied this penalty. 'ranking' for Ranking-applied (§7.4);
   * 'solver' for Solver-augmented Hard penalties (§9.2). The Reviewer cannot
   * ADD penalties (§7.4), so 'reviewer' is not in this union.
   */
  readonly appliedBy: 'ranking' | 'solver'
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. ScoreComponent — a per-axis evaluation (§10.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A Score Component — "a per-axis evaluation of a Candidate for a slot"
 * (§10.2).
 *
 * Per §10.2:
 *  - Owns: "One facet of fit (e.g. Difficulty Fit, Usage)".
 *  - Carries: "Value + normalized form + inputs (Raw Signals) + reasoning +
 *    component Confidence + applied penalties".
 *  - Does NOT carry: "Decision, selection, or cross-Candidate comparison".
 *
 * One ScoreComponent exists per (Candidate × slot × ComponentId). The
 * Component is the atomic unit of evaluation; the Composite aggregates them.
 *
 * TRANSPARENCY (§8.3): "Components record their inputs, value, and reasoning
 * at evaluation." All transparency fields are therefore required.
 */
export interface ScoreComponent {
  /** Which of the ten v1.0 facets this Component evaluates (§4.1). */
  readonly componentId: ComponentId
  /** The Question Code this Component evaluates (immutable business id). */
  readonly questionCode: string
  /** The slot this Component is evaluated against. */
  readonly slot: BlueprintSlot
  /** The normalized value on the common Component scale (§3, §4.2). */
  readonly normalized: NormalizedScore
  /**
   * The Raw Signals this Component consumed (§10.2 "inputs (Raw Signals)",
   * §8.3 "Components record their inputs"). At least one — a Component
   * without evidence is non-conformant (§6.2 "without evidence, there is no
   * Score").
   */
  readonly inputs: readonly RawSignal[]
  /**
   * Plain-language explanation of why the Component took its value (§8.1
   * "Reasons", e.g. "Difficulty Fit = full match: Candidate is Easy, slot
   * requires Easy"). Never empty.
   */
  readonly reasoning: string
  /** This Component's propagated Confidence (§6.3.2, §10.2). */
  readonly confidence: ScoringConfidence
  /**
   * Penalties applied to this Component (§10.2 "applied penalties"). Empty
   * when none apply. Per §7.3, a Disqualification here is terminal for this
   * (Candidate × slot) pair.
   */
  readonly penalties: readonly Penalty[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. ScoreBreakdown — the Composite's transparency (§10.4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Score Breakdown — "the decomposition of a Composite into its
 * contributing Components" (§10.4).
 *
 * Per §10.4:
 *  - Owns: "The transparency of the Composite".
 *  - Carries: "Per-Component values, contributions, and reasons".
 *  - Does NOT carry: "Anything not in the Components (no hidden
 *    contributions)".
 *
 * Per §5.4: "A Composite without its breakdown is non-conformant." Per §8.1:
 * the Breakdown includes "which Components contributed, with what values,
 * weights, and normalized forms". The Breakdown is ALWAYS-PRESENT (§8.4).
 *
 * DESIGN: the Breakdown references the contributing ScoreComponents rather
 * than re-stating their values, so there is one source of truth (the
 * Components themselves). The Breakdown adds the per-Component CONTRIBUTION
 * (its weight/effect in the Composite) — §8.1 "weights". The arithmetic of
 * contribution is implementation (§4.3); the presence of contribution is
 * contractual (§8).
 */
export interface ScoreBreakdown {
  /**
   * The Components contributing to the Composite, each with its contribution.
   * Non-empty: a Composite must decompose into at least one Component (§10.4).
   */
  readonly contributions: readonly ComponentContribution[]
  /**
   * Free-text summary of how the Components aggregate into the Composite
   * value (e.g. "weighted mean of 10 Components; Pattern Fit excluded from
   * weight due to missing IG-2 axis"). Never empty.
   */
  readonly aggregationNote: string
}

/**
 * One Component's contribution to a Composite (§8.1 "Per-Component values,
 * contributions, and reasons").
 */
export interface ComponentContribution {
  /** The contributing Component (the source of truth for its value). */
  readonly component: ScoreComponent
  /**
   * This Component's contribution to the Composite value (§8.1 "weights").
   * Implementation-defined shape (§4.3 leaves arithmetic open); the contract
   * requires presence for transparency.
   */
  readonly contribution: number
  /**
   * Why this Component contributed this amount (e.g. "weight 0.15; full
   * match on difficulty"). Never empty.
   */
  readonly reason: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CompositeScore — the structured aggregate per (Candidate × slot) (§10.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Composite Score — "the structured aggregate evaluation of a Candidate
 * for a slot" (§10.3).
 *
 * Per §10.3:
 *  - Owns: "One holistic evaluation per (Candidate × slot)".
 *  - Carries: "Aggregated value + full Score Breakdown + propagated
 *    Confidence + applied Penalties + slot reference".
 *  - Does NOT carry: "Decision, selection, or claim of Question quality".
 *
 * Per (Candidate × slot): a Candidate may have different Composites against
 * different slots (§5.2). Comparable across Candidates for the same slot
 * (§5.2).
 *
 * TRANSPARENCY (§5.4, §8): the Breakdown is non-optional and always-present.
 * An opaque Composite is non-conformant (AP-5).
 *
 * IMMUTABILITY (Ranking §8.3 no-modification rule): once computed (Ranking
 * stage 2–4), the Composite is immutable. Stages 5–6 (Ordering, Tie
 * Resolution) consume it read-only. The Solver may augment Hard PENALTIES
 * only (Scoring §9.2); it never alters the Composite value or Confidence.
 */
export interface CompositeScore {
  /** The Question Code this Composite evaluates. */
  readonly questionCode: string
  /** The slot this Composite is evaluated against (§10.3 "slot reference"). */
  readonly slot: BlueprintSlot
  /** The aggregated value on the common scale (§5.2 — Comparable). */
  readonly value: number
  /** The full decomposition — ALWAYS PRESENT (§5.4, §8.4). */
  readonly breakdown: ScoreBreakdown
  /** The propagated trust level (§6, §10.5). */
  readonly confidence: ScoringConfidence
  /**
   * Penalties applied to this Composite (§10.3, §7). Empty when none. A
   * Disqualification here is terminal for this (Candidate × slot) — §7.3.
   */
  readonly penalties: readonly Penalty[]
}
