/**
 * lib/engine/generator/contracts.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator — foundational contracts (immutable types only).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §3 (Query Planning),
 *     §4 (Filters), §5 (Candidate), §6 (CandidatePool), §7 (Validation),
 *     §8 (Expansion), §9 (Provenance/Completeness/Confidence), §10 (CandidateSet)
 *
 * This file is TYPES ONLY. No filtering logic, no Bank access, no I/O, no side
 * effects. The Generator's runtime stages (E-2B+) consume these types.
 *
 * VOCABULARY REUSE: enum types (Difficulty, Tier, BlueprintType, QuestionPattern,
 * LearningObjective, etc.) are imported from ../reader/contracts — the FROZEN
 * upstream vocabulary. They are NOT redefined here. Adding a value to any of
 * those enums is a contract change in the upstream file, not here.
 *
 * CASING: camelCase, matching the existing lib/engine/** codebase convention
 * (reader/contracts.ts uses camelCase: specVersion, documentRegistry, etc.).
 * The Candidate Generation spec's §10.3 "Conceptual Shape" uses snake_case,
 * but that section is explicitly labeled "Conceptual" (illustrative, not
 * normative). Following the codebase convention keeps the Generator's output
 * contract consistent with the AssemblyRequest it consumes.
 *
 * IMMUTABILITY: every field is `readonly`. Discriminated unions use literal
 * `kind`/`type` fields for compile-time narrowing. No setters, no mutation.
 *
 * DETERMINISM: every type is a pure data structure. When constructed from
 * deterministic inputs, two byte-identical inputs produce byte-identical
 * instances (verified by the contract test's stable-serialization property).
 */

import type {
  BlueprintType,
  CoverageRuleId,
  Difficulty,
  EnforcementLevel,
  LearningObjective,
  QuestionPattern,
  Tier,
} from '../reader/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Shared vocabulary — Generator-specific enums
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Question lifecycle status. From the Bank's `questions.status` column
 * (migration 001: CHECK ('Draft', 'Review', 'Published') — capitalized).
 *
 * The Generator's Status Filter (§4.2) admits only `Published` Questions into
 * a CandidatePool by policy (only published Questions may appear in a
 * published Blueprint). The full enum is carried on the Candidate's Metadata
 * facet for audit, even when the filter would have excluded the row.
 */
export type QuestionStatus = 'Draft' | 'Review' | 'Published'

/**
 * Severity classification for Generator diagnostics (§7.4). EXACT vocabulary.
 * "Classification is precise — not a slider."
 *
 * - 'Pass'     — axis fully satisfiable; no action needed.
 * - 'Warning'  — satisfiable but reduced headroom; warning carried into
 *                CandidateSet metadata.
 * - 'Blocking' — shortfall Pool Expansion cannot resolve; halt by default,
 *                surface to Human Review; override is explicit + auditable.
 * - 'Fatal'    — Generator cannot produce a meaningful CandidateSet
 *                (e.g. required Bank column missing — IG-2; or Document
 *                Registry references absent documents — IG-1). Halt
 *                unconditionally; no CandidateSet produced.
 */
export type GeneratorSeverity = 'Pass' | 'Warning' | 'Blocking' | 'Fatal'

/**
 * Confidence level — a coarse, deterministic metadata-quality signal (§5.2).
 * NOT a ranking score. Derived from Completeness + the axis-derivation path.
 *
 * The spec defines Confidence qualitatively ("all axes present and
 * unambiguous" vs. "axis derived via fallback"); this enum captures that
 * two-state distinction without inventing vocabulary the spec doesn't
 * authorize. The accompanying `reason` (on the Confidence struct) carries
 * the spec's free-text "Confidence Reason" when reduced.
 *
 * - 'full'    — all required axes present and unambiguous.
 * - 'reduced' — one or more axes missing, derived via fallback, or ambiguous.
 *               Reduced-Confidence Candidates are still admitted (Maximum
 *               Recall); Ranking will lower their score downstream.
 */
export type ConfidenceLevel = 'full' | 'reduced'

/**
 * Per-axis completeness flag (§5.2, §9.2). Binary per axis: a Candidate's
 * metadata is either `complete` or `incomplete` for each IG-2 axis.
 *
 * Incomplete-axes Candidates are FLAGGED, NOT DROPPED (Maximum Recall
 * guarantee, §5.2: "marked `pattern: incomplete` — not dropped, but flagged").
 */
export type AxisCompleteness = 'complete' | 'incomplete'

/**
 * Candidate rejection reason — used in the Exclusions Log (§9.4) and the
 * Shortfall Report (§7.2). Discriminated by `kind`; the payload varies.
 *
 * Reused-vocabulary note: these reasons cover the 7 filter axes + the
 * structural failures (exclusion, status, bank). They are the Generator's
 * own diagnostic vocabulary for "why a Bank row did NOT become a Candidate"
 * — distinct from ReaderError (which is about Blueprint authoring problems).
 */
export type CandidateRejectionReason =
  | { readonly kind: 'excluded'; readonly code: string }
  | { readonly kind: 'status'; readonly code: string; readonly status: QuestionStatus }
  | { readonly kind: 'document'; readonly code: string; readonly document: string }
  | { readonly kind: 'coverage'; readonly code: string; readonly detail: string }
  | { readonly kind: 'difficulty'; readonly code: string; readonly difficulty: Difficulty }
  | { readonly kind: 'pattern'; readonly code: string }
  | { readonly kind: 'learning_objective'; readonly code: string }
  | { readonly kind: 'bank_unreachable'; readonly detail: string }
  | { readonly kind: 'missing_axis'; readonly code: string; readonly axis: string }

// ═══════════════════════════════════════════════════════════════════════════
// 2. CandidateSource — where a Candidate's Bank row came from
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Bank read that produced a Candidate. Pure metadata for audit; the
 * Generator is deterministic given Bank state, and the source records which
 * read fetched the row (useful for debugging Bank-state-hash mismatches).
 *
 * Discriminated union: `kind` identifies the read type. Today only one kind
 * exists ('metadata_query'); future read types (cache, snapshot) add kinds
 * additively.
 */
export type CandidateSource =
  | { readonly kind: 'metadata_query'; readonly queryId: string }

// ═══════════════════════════════════════════════════════════════════════════
// 3. Slot — a Blueprint distribution cell (§3.2, §9.2, Glossary)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A Blueprint distribution cell. From §3.2 / Glossary: "A Blueprint
 * distribution cell." A Slot names one cell in the multi-axis distribution
 * (Document × Difficulty × BlueprintType × Pattern) for one Set.
 *
 * Set number is 1..5 (Blueprint v3.0 declares 5 Sets). All axis fields are
 * optional — a Slot may be axis-specific (e.g. a Difficulty slot carries
 * only `difficulty` + `setNumber`; a full-slot carries all four).
 *
 * The Generator's Slot Eligibility (Provenance facet) records which slots
 * a Candidate could legally fill; the CandidateSet's slot_index pre-computes
 * the reverse mapping (slot → Candidates).
 */
export interface BlueprintSlot {
  /** Set number (1..5 for Blueprint v3.0). */
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  readonly difficulty?: Difficulty
  readonly blueprintType?: BlueprintType
  readonly pattern?: QuestionPattern
  readonly document?: string
  readonly learningObjective?: LearningObjective
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Candidate facets (§5.2, §5.4, §5.5, §9.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Candidate Identity facet (§5.4). The Question Code is the immutable
 * business identifier (migration 026); two Candidates with the same Code
 * ARE the same Candidate. The underlying Question id is carried for Bank
 * lookups but is NOT the unit of exchange.
 *
 * "Codes, not objects" (Engine Foundation §4.1): the Code is what flows
 * across module boundaries (Generator → Ranking → Solver → Draft Builder).
 */
export interface CandidateIdentity {
  /** Immutable Question Code (e.g. 'Q-000001'). From migration 026. */
  readonly questionCode: string
  /** Underlying Question id (UUID). For Bank lookups; NOT for identity/equality. */
  readonly questionId: string
}

/**
 * Candidate Metadata facet (§5.5). Carries the Bank metadata the Generator's
 * filters and Ranking's Components need. Tier is DERIVED (not a Bank column);
 * the derivation path is recorded in the Provenance facet.
 *
 * What this facet CARRIES (§5.5 IN): document, difficulty, topic, status,
 * tier (derived), blueprint_type, learning_objective, question_pattern,
 * section, tags, category.
 *
 * What this facet NEVER carries (§5.5 OUT): content, choices, correct_answer,
 * hint, explanations, why_*_wrong. The Generator is metadata-only.
 */
export interface CandidateMetadata {
  /** Document name (matched against AssemblyRequest.documentRegistry). */
  readonly document: string
  readonly difficulty: Difficulty
  readonly topic: string | null
  readonly status: QuestionStatus
  /** Tier DERIVED from document via Document Registry. Not a Bank column. */
  readonly tier: Tier
  // IG-2 axes (subject to availability — see Completeness facet).
  readonly blueprintType: BlueprintType | null
  readonly learningObjective: LearningObjective | null
  readonly questionPattern: QuestionPattern | null
  /** Free-text legal-section reference (e.g. 'ม.6–8'). IG-2 axis. */
  readonly section: string | null
  /** Cross-cutting labels (for Similarity Metric + Ranking Diversity). */
  readonly tags: readonly string[]
  readonly category: string | null
}

/**
 * Per-axis completeness flags (§5.2, §9.2). One flag per IG-2 axis. An
 * incomplete axis is FLAGGED, not dropped — the Candidate is still admitted
 * (Maximum Recall), but Ranking lowers its Confidence-derived score.
 */
export interface CandidateCompleteness {
  readonly blueprintType: AxisCompleteness
  readonly learningObjective: AxisCompleteness
  readonly questionPattern: AxisCompleteness
  readonly section: AxisCompleteness
}

/**
 * Confidence facet (§5.2). Coarse metadata-quality signal — NOT a ranking
 * score. The level is binary (full/reduced); the reason carries free-text
 * explaining why Confidence was reduced (e.g. "tier derived via document
 * fallback", "pattern axis missing — IG-2 gap").
 *
 * Reduced Confidence does NOT exclude the Candidate. It signals downstream
 * Ranking to weight the Candidate lower.
 */
export interface CandidateConfidence {
  readonly level: ConfidenceLevel
  /**
   * Free-text reason when level === 'reduced'. Null when level === 'full'.
   * Never empty string when present.
   */
  readonly reason: string | null
}

/**
 * Candidate Provenance facet (§9.2). Records HOW the Generator admitted this
 * Candidate: which filters it passed, which Blueprint slots it could fill,
 * which coverage requirements it satisfies, and any derivation/fallback
 * that reduced its Confidence.
 *
 * Provenance is what makes the Generator's output auditable — a Reviewer
 * can reconstruct why a Candidate appeared by reading its Provenance.
 */
export interface CandidateProvenance {
  /** Ordered list of filters the Candidate passed (§4.3 fixed order). */
  readonly filtersPassed: readonly FilterId[]
  /** Blueprint slots this Candidate could legally fill (§9.2). */
  readonly eligibleSlots: readonly BlueprintSlot[]
  /** CR-1 mandatory-topic bindings this Candidate satisfies, if any. */
  readonly coverageSatisfied: readonly CoverageRuleId[]
  /** Source of the Bank read that produced this Candidate. */
  readonly source: CandidateSource
}

/**
 * The Candidate — the Generator's unit of exchange (§5). Composed of exactly
 * five facets: Identity, Metadata, Completeness, Confidence, Provenance.
 *
 * IMMUTABLE: every facet is readonly. The Generator constructs Candidates
 * once (in Discovery) and never mutates them. Downstream Ranking/Solver may
 * ANNOTATE (add derived scores on top), never modify.
 *
 * IDENTITY/EQUALITY: two Candidates with the same `identity.questionCode`
 * ARE the same Candidate (§5.4). The Generator deduplicates by Code.
 */
export interface Candidate {
  readonly identity: CandidateIdentity
  readonly metadata: CandidateMetadata
  readonly completeness: CandidateCompleteness
  readonly confidence: CandidateConfidence
  readonly provenance: CandidateProvenance
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. FilterId — the 7 named filters in FIXED execution order (§4.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter identifier. The seven named filters from §4.2. The FIXED execution
 * order (§4.3, most selective first) is encoded in the FILTER_EXECUTION_ORDER
 * constant below — do not reorder.
 *
 * Adding a filter is additive (append to the union + to the order array).
 * Reordering is a spec change (the order is normative, §4.3).
 */
export type FilterId =
  | 'exclusion'
  | 'status'
  | 'document'
  | 'coverage'
  | 'difficulty'
  | 'pattern'
  | 'learning_objective'

/**
 * The FIXED filter execution order (§4.3 — most selective first). Normative.
 * The Generator's Metadata Filtering stage applies filters in this order;
 * reordering would change selectivity characteristics and is a spec change.
 *
 * Order rationale (§4.3):
 *   1. exclusion     — cheapest (set membership on Codes)
 *   2. status        — cheap (single enum check)
 *   3. document      — highly selective (~90% reduction)
 *   4. coverage      — selective (mandatory-topic bindings)
 *   5. difficulty    — moderately selective
 *   6. pattern       — moderately selective (requires IG-2 column)
 *   7. learning_objective — least selective
 */
export const FILTER_EXECUTION_ORDER: readonly FilterId[] = [
  'exclusion',
  'status',
  'document',
  'coverage',
  'difficulty',
  'pattern',
  'learning_objective',
] as const

// ═══════════════════════════════════════════════════════════════════════════
// 6. CandidatePool — internal working set (§6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Internal Candidate working set (§6.1, §6.2). Produced by Discovery,
 * consumed by Validation/Expansion. NEVER leaves the Generator (the external
 * contract is CandidateSet).
 *
 * Marked readonly at the type level for safety; the Generator's internal
 * pipeline may construct a fresh Pool at each stage (the working set evolves
 * through Expansion), but external code treats it as immutable.
 */
export interface CandidatePool {
  /** Candidates in the pool (unvalidated, pre-shortfall-detection). */
  readonly candidates: readonly Candidate[]
  /** The Query Plan that produced this pool (§3). */
  readonly queryPlan: QueryPlan
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. QueryPlan — bank-independent translation of AssemblyRequest (§3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Query Plan (§3.2, §3.3). A structured specification of WHAT to look
 * for — bank-independent, pure transformation of the AssemblyRequest. Does
 * NOT execute queries, access the Bank, or decide filter order.
 *
 * Components (§3.2):
 *  - Coverage requirements (from CR-1..CR-5)
 *  - Per-Set Difficulty slots
 *  - Permitted documents (closed set from Document Registry)
 *  - Per-Set Pattern slots
 *  - Per-Set LO slots
 *  - Duplicate rules (recorded as constraint metadata, NOT a per-Question filter)
 *  - Exclusions (literal Code set)
 */
export interface QueryPlan {
  /** Coverage requirements (CR-1..CR-5 with enforcement level). */
  readonly coverageRequirements: readonly CoverageRequirement[]
  /** Per-Set Difficulty slots (each = {set, difficulty, targetCount}). */
  readonly difficultySlots: readonly AxisSlot[]
  /** Closed set of permitted document names (from Document Registry). */
  readonly permittedDocuments: readonly string[]
  /** Per-Set Pattern slots. */
  readonly patternSlots: readonly AxisSlot[]
  /** Per-Set LO slots. */
  readonly learningObjectiveSlots: readonly AxisSlot[]
  /** Duplicate rules recorded as constraint metadata (NOT per-Question filters). */
  readonly duplicateRules: readonly DuplicateRuleMetadata[]
  /** Literal set of excluded Question Codes. */
  readonly exclusions: readonly string[]
}

/**
 * One coverage requirement (from CR-1..CR-5). The Query Planner translates
 * the AssemblyRequest's coverage rules into these structured requirements.
 */
export interface CoverageRequirement {
  readonly ruleId: CoverageRuleId
  readonly level: EnforcementLevel
  /** Rule-specific binding (Document×Topic pairs for CR-1, etc.). Opaque at
   *  this layer; the Generator's Coverage Filter interprets it per rule. */
  readonly binding: unknown
}

/**
 * Per-Set axis slot (§3.2). One cell in the per-Set distribution. `axisValue`
 * is the axis's enum value (Difficulty, Pattern, or LO depending on the
 * parent slots array).
 */
export interface AxisSlot {
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  /** The axis value as a string (Difficulty/Pattern/LO stringified). */
  readonly axisValue: string
  readonly targetCount: number
}

/**
 * Duplicate-rule metadata recorded in the Query Plan (§3.2). Duplicate rules
 * are NOT per-Question filters — they're constraint metadata the Solver
 * consumes. The Generator records them so the Solver has the full rule set.
 */
export interface DuplicateRuleMetadata {
  readonly ruleId: import('../reader/contracts').DuplicatePreventionId
  readonly scope: import('../reader/contracts').DuplicatePreventionScope
  readonly level: EnforcementLevel
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Shortfall Report (§7.2, §10.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Shortfall Report (§7.2). Per-axis shortfall detection. Records where
 * the Bank cannot fully satisfy the Blueprint's per-axis targets.
 *
 * BOUNDARY (§7.3): per-axis only. Does NOT solve joint constraints (SUM=100,
 * tier floors/ceilings, anchor rule — those are the Solver's job, IG-5).
 *
 * A ShortfallReport is carried forward into the CandidateSet and from there
 * into every downstream contract (RankedCandidateSet, AllocatedCandidateSet).
 */
export interface ShortfallReport {
  /** Per-axis shortfall entries (one per axis with a detected shortfall). */
  readonly entries: readonly ShortfallEntry[]
}

/**
 * One per-axis shortfall entry. Names the axis, the severity, and a
 * human-readable explanation + recommendation (mirrors ReaderError anatomy
 * so a Reviewer can act uniformly on Reader and Generator diagnostics).
 */
export interface ShortfallEntry {
  /** Which axis has the shortfall. */
  readonly axis: ShortfallAxis
  readonly severity: GeneratorSeverity
  readonly explanation: string
  readonly recommendation: string
  /** Set number (1..5) when the shortfall is Set-specific; null when global. */
  readonly setNumber: 1 | 2 | 3 | 4 | 5 | null
}

/**
 * The axes the Shortfall Report covers (§7.2). One per per-axis completeness
 * check.
 */
export type ShortfallAxis =
  | 'coverage'
  | 'difficulty'
  | 'document'
  | 'pattern'
  | 'learning_objective'
  | 'duplicate_diversity'

// ═══════════════════════════════════════════════════════════════════════════
// 9. CandidateStatistics — aggregate counts for audit/monitoring (§11)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate statistics about a CandidateSet. Carried in the CandidateSet's
 * metadata block for audit, monitoring dashboards, and the Runtime API's
 * observability layer. Pure counts — no opinions, no derived scores.
 */
export interface CandidateStatistics {
  /** Total Candidates in the set. */
  readonly totalCandidates: number
  /** Candidates with Confidence level 'full'. */
  readonly fullConfidenceCount: number
  /** Candidates with Confidence level 'reduced'. */
  readonly reducedConfidenceCount: number
  /** Candidates with at least one incomplete IG-2 axis. */
  readonly incompleteAxesCount: number
  /** Distinct documents represented in the set. */
  readonly distinctDocuments: number
  /** Distinct difficulties represented. */
  readonly distinctDifficulties: number
  /** Distinct patterns represented. */
  readonly distinctPatterns: number
  /** Distinct LOs represented. */
  readonly distinctLearningObjectives: number
  /** Count of shortfall entries (carried from ShortfallReport). */
  readonly shortfallCount: number
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. CandidateSet — the immutable OUTPUT contract (§10.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CandidateSet identity block (§10.3). Carries the three pieces that pin
 * a CandidateSet to a specific generation run: the AssemblyRequest id, the
 * generation timestamp, and the Bank state hash.
 *
 * The Bank state hash is what makes the Generator "deterministic given Bank
 * state" (§1.4) — re-runs against the same Bank state produce identical
 * CandidateSets; runs against different Bank states are distinguishable.
 */
export interface CandidateSetIdentity {
  /** The AssemblyRequest id that drove this generation (position id in v1.0). */
  readonly assemblyRequestId: string
  /** Generation timestamp (caller-supplied ISO; null when not provided). */
  readonly generatedAt: string | null
  /** Hash of the Bank state used for this generation. Null when not computed. */
  readonly bankStateHash: string | null
}

/**
 * CandidateSet metadata block (§10.3). Carries the spec version + the
 * Generator implementation version.
 *
 * `specVersion` is the constant "1.0" for Candidate Generation Architecture
 * v1.0. Bumping it is a contract change requiring downstream negotiation.
 */
export interface CandidateSetMeta {
  readonly specVersion: '1.0'
  readonly generatorVersion: string
}

/**
 * Pre-computed slot index (§10.3 `slot_index`). Maps each Blueprint slot to
 * the Question Codes eligible for it. Critical denormalization: lets
 * Ranking/Solver look up "all Candidates eligible for slot X" without
 * re-deriving eligibility.
 *
 * Keyed by a stable slot-id string (derived from the BlueprintSlot's axes).
 * Values are arrays of Question Codes (NOT Candidate objects — the index is
 * a Code-level lookup; the full Candidate is in `candidates`).
 */
export interface SlotIndex {
  readonly slots: ReadonlyMap<string, readonly string[]>
}

/**
 * Coverage satisfaction (§10.3 `coverage_satisfaction`). Records which
 * mandatory-topic bindings (CR-1) are covered, by which Question Codes.
 */
export interface CoverageSatisfaction {
  /** Per mandatory-topic binding: which Codes satisfy it. */
  readonly bindings: ReadonlyArray<{
    readonly document: string
    readonly topic: string
    readonly satisfyingCodes: readonly string[]
  }>
}

/**
 * The CandidateSet — the Generator's immutable OUTPUT contract (§10.3).
 * Produced by Stage 6 (CandidateSet Emission); consumed by Ranking and Solver.
 *
 * LIFECYCLE (§10.4): immutable once emitted. Downstream modules may ANNOTATE
 * on top (add derived data in their own contracts); they never modify the
 * CandidateSet's core fields. May be cached for audit (the cache is
 * input-deterministic).
 *
 * DETERMINISM: same AssemblyRequest + same Bank state + same Generator
 * version → same CandidateSet, byte-for-byte.
 */
export interface CandidateSet {
  readonly identity: CandidateSetIdentity
  readonly candidates: readonly Candidate[]
  readonly slotIndex: SlotIndex
  readonly shortfallReport: ShortfallReport
  readonly coverageSatisfaction: CoverageSatisfaction
  readonly warnings: readonly GeneratorWarning[]
  readonly statistics: CandidateStatistics
  readonly exclusionsLog: readonly ExclusionEntry[]
  readonly meta: CandidateSetMeta
}

/**
 * One Generator warning (§10.3 `warnings[]`). Non-fatal issues carried
 * forward from Validation/Expansion. Distinct from ShortfallReport entries
 * (which are per-axis); warnings are general advisories.
 */
export interface GeneratorWarning {
  readonly severity: Extract<GeneratorSeverity, 'Warning'>
  readonly axis: ShortfallAxis | null
  readonly explanation: string
  readonly recommendation: string
}

/**
 * One exclusions-log entry (§10.3 `exclusions_log`, §9.4). Records a Bank
 * row that was excluded from the CandidatePool, with the reason. For
 * debugging "why isn't Question X a Candidate?".
 */
export interface ExclusionEntry {
  readonly code: string | null
  readonly reason: CandidateRejectionReason
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. CandidateGenerationResult — top-level Generator result
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The top-level Generator result. Discriminated union on `ok`.
 *
 *  - `ok: true`  — CandidateSet produced. May still carry warnings + a
 *                  non-empty ShortfallReport (shortfalls don't fail the run;
 *                  they're honest partial-output signals).
 *  - `ok: false` — Fatal error; no CandidateSet produced. The diagnostics
 *                  explain why (e.g. IG-2 column missing, Bank unreachable).
 *
 * IMMUTABLE: both branches readonly.
 */
export type CandidateGenerationResult =
  | { readonly ok: true; readonly candidateSet: CandidateSet }
  | { readonly ok: false; readonly fatalDiagnostics: readonly FatalDiagnostic[] }

/**
 * One fatal diagnostic. The Generator's analogue of ReaderError for
 * unrecoverable failures. Carries the same anatomy (category, severity,
 * explanation, recommendation) so the Runtime API can surface Generator
 * failures uniformly with Reader failures.
 */
export interface FatalDiagnostic {
  readonly category: GeneratorFatalCategory
  readonly severity: Extract<GeneratorSeverity, 'Fatal'>
  readonly explanation: string
  readonly recommendation: string
}

/**
 * Fatal-category vocabulary. Small and normative — adding a value is a
 * Generator contract change.
 */
export type GeneratorFatalCategory =
  | 'bank_unreachable'
  | 'missing_required_axis'
  | 'document_registry_mismatch'
  | 'internal_error'

// ═══════════════════════════════════════════════════════════════════════════
// 12. Re-exports — single import surface for downstream stages
// ═══════════════════════════════════════════════════════════════════════════

export type {
  BlueprintType,
  CoverageRuleId,
  Difficulty,
  EnforcementLevel,
  LearningObjective,
  QuestionPattern,
  Tier,
} from '../reader/contracts'
