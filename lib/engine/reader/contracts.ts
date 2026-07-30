/**
 * lib/engine/reader/contracts.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — Reader pipeline type contracts.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *  - Blueprint Integration Specification v1.0 §3 (Canonical Blueprint Format),
 *    §4 (AssemblyRequest Contract), §5 (Critical Reconciliations)
 *  - Blueprint Reader Pipeline Architecture v1.0 §3–§7 (pipeline stages,
 *    Blueprint AST vocabulary, Reader Error anatomy)
 *
 * Two-AST split (Reader Pipeline §3): the Reader produces two intermediate ASTs
 * before emitting an AssemblyRequest. Markdown AST (parser-native) → Blueprint
 * AST (business-object vocabulary) → Canonical Blueprint (information-content
 * fixed by Integration Spec §3) → AssemblyRequest (the sole Engine input).
 *
 * This file is TYPES ONLY — no parsing logic, no I/O. Pipeline implementation
 * arrives in E-1.2 (Reader Stages 1–8). The contracts land first because every
 * downstream module (Generator, Ranking, Solver) imports AssemblyRequest.
 *
 * IG-2 NOTE: this file does NOT depend on IG-2 closure. The AssemblyRequest
 * vocabulary references the four IG-2 axes (blueprint_type, learning_objective,
 * question_pattern, section) but only as enum/string types — the Reader emits
 * them from the Blueprint, not from the Bank. The Bank storing them is a
 * separate concern (E-0, currently paused pending Architecture Amendment).
 */

import type {
  AssessmentProfile,
  BlueprintType,
  CoverageRuleId,
  Difficulty,
  DuplicatePreventionId,
  DuplicatePreventionScope,
  EnforcementLevel,
  LearningObjective,
  QuestionPattern,
  RunUnit,
  Tier,
} from '../shared/assessment-vocabulary'

export type {
  AssessmentProfile,
  BlueprintType,
  CoverageRuleId,
  Difficulty,
  DuplicatePreventionId,
  DuplicatePreventionScope,
  EnforcementLevel,
  LearningObjective,
  QuestionPattern,
  RunUnit,
  Tier,
} from '../shared/assessment-vocabulary'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Reader-owned value vocabulary
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Similarity Metric verdict. From Integration Spec §5.5 (Similarity Metric uses
 * `keyword_sim = jaccard(keywords_a, keywords_b)` with BLOCK/WARN/PASS
 * thresholds).
 *
 * - 'BLOCK' — pair rejected (Hard).
 * - 'WARN'  — pair admitted; reduced Confidence.
 * - 'PASS'  — pair admitted without penalty.
 */
export type SimilarityVerdict = 'BLOCK' | 'WARN' | 'PASS'

// ═══════════════════════════════════════════════════════════════════════════
// 2. AssemblyRequest sub-contracts (Integration Spec §4.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AssemblyRequest identity block. From Integration Spec §4.3 (`identity`).
 *
 * Carries the Blueprint id, its version, and the Assessment Profile. These three
 * together form the deterministic identity of an Engine run: same triple + same
 * Bank state → same Assembly Result (Runtime API §3.4 Idempotency).
 */
export interface AssemblyRequestIdentity {
  /** Stable Blueprint identifier (e.g. "simulation_exam_blueprint"). */
  blueprint_id: string
  /** Blueprint version (e.g. "3.0"). */
  blueprint_version: string
  /** Assessment Profile. v1.0 = 'simulation'. */
  profile: AssessmentProfile
}

/**
 * A Document Registry entry. From Integration Spec §4.3 (`document_registry`):
 * each entry = `{id, name, tier}`.
 *
 * The Document Registry is the CLOSED SET of documents the Engine may draw from.
 * Tier is assigned at the Document level (§5.2) and inherited by every Question
 * that belongs to that Document — the Generator derives Tier per Candidate via
 * this lookup, never from a stored Question column.
 */
export interface DocumentRegistryEntry {
  /** Stable document identifier (e.g. "LAW-ACT-HED-2562" per Content Template v2.1 §3). */
  id: string
  /** Human-readable document name (Thai or English; display only). */
  name: string
  /** Tier 1–4 assigned to this Document (Integration Spec §5.2). */
  tier: Tier
}

/**
 * Anchor rule. From Integration Spec §4.3 (`distribution_constraints.anchor`).
 *
 * Blueprint v3.0: a Tier-1 Document may receive a +5 bonus to its per-set
 * allocation count, capped at one anchor per Set. This is the only "bonus"
 * mechanism in the distribution arithmetic.
 */
export interface AnchorRule {
  /** Per-set bonus applied to the anchor Document's count. Blueprint v3.0 = +5. */
  bonus: number
  /** Maximum number of anchor Documents per Set. Blueprint v3.0 = 1. */
  maxPerSet: number
}

/**
 * Distribution arithmetic invariants. From Integration Spec §4.3
 * (`distribution_constraints`).
 *
 * These are the global arithmetic the Solver must satisfy. Per-set sum is fixed
 * (100 for Blueprint v3.0); Tier floors/ceilings bound the per-Tier counts; the
 * Anchor rule is the only +bonus mechanism. Together these form a constraint-
 * satisfaction problem (Integration Spec §5.3 — IG-5, closed at the Solver level).
 */
export interface DistributionConstraints {
  /** Required sum of question counts per Set. Blueprint v3.0 = 100. */
  sumPerSet: number
  /** Per-Tier min/max bounds. Keys are Tier 1–4; values are [min, max] inclusive. */
  tierMinMax: Record<Tier, readonly [min: number, max: number]>
  /** Minimum Tier-1 count per Set. Blueprint v3.0 ≥ 30. */
  tier1Floor: number
  /** Maximum Tier-4 count per Set. Blueprint v3.0 ≤ 25. */
  tier4Ceiling: number
  /** Anchor rule. May be null if the Blueprint declares no anchor. */
  anchor: AnchorRule | null
}

/**
 * A single Coverage Rule. From Integration Spec §4.3 (`coverage_rules`):
 * each = `{id, level, binding}`.
 *
 * `binding` is intentionally typed as `unknown` here — the binding shape varies
 * per rule (CR-1 binds Document × Topic pairs; CR-5 binds Section ranges; CR-3
 * binds the cross-set cap). The Reader emits the binding appropriate to each id;
 * the Generator and Solver interpret it per rule. Typing it concretely now would
 * preempt per-rule contracts that belong in their consuming modules.
 */
export interface CoverageRule {
  /** CR-1 … CR-5. */
  id: CoverageRuleId
  /** 'hard' — must satisfy or report infeasible; 'soft' — optimize toward. */
  level: EnforcementLevel
  /** Rule-specific binding payload (Document×Topic pairs for CR-1, etc.). */
  binding: unknown
}

/**
 * LO Distribution block. From Integration Spec §4.3 (`lo_distribution`).
 *
 * Carries the per-set percentage targets for LO1–LO4 and the LO↔BlueprintType
 * correspondence map (which LOs may be satisfied by which BlueprintTypes).
 */
export interface LoDistribution {
  /** Per-set percentage target per LO. Should sum to 100 per Blueprint. */
  targets: Record<LearningObjective, number>
  /** LO → BlueprintTypes that may satisfy it. */
  typeMap: Record<LearningObjective, readonly BlueprintType[]>
}

/**
 * Similarity Metric thresholds. From Integration Spec §5.5.
 *
 * `keyword_sim = jaccard(keywords_a, keywords_b)` produces a score in [0, 1];
 * these thresholds bucket it into BLOCK/WARN/PASS. Threshold values come from
 * the Blueprint (L-rules' similarity_threshold fields).
 */
export interface SimilarityThresholds {
  /** ≥ this → BLOCK (Hard reject). */
  block: number
  /** ≥ this and < block → WARN (admit with reduced Confidence). */
  warn: number
  // < warn → PASS (no penalty).
}

/**
 * A single Duplicate Prevention Rule. From Integration Spec §4.3
 * (`duplicate_prevention`): each = `{id, scope, level, similarity_threshold?}`.
 */
export interface DuplicatePreventionRule {
  /** L1 … L5. */
  id: DuplicatePreventionId
  /** within_set or across_set. */
  scope: DuplicatePreventionScope
  /** 'hard' or 'soft'. */
  level: EnforcementLevel
  /** Present when the rule uses the Similarity Metric; absent for exact-match rules. */
  similarityThresholds?: SimilarityThresholds
}

/**
 * Run target. From Integration Spec §4.2 (Conceptual Shape) — the `target`
 * block naming how many Sets and how many Questions per Set the run produces.
 */
export interface RunTarget {
  /** Number of Sets one Engine run produces. Blueprint v3.0 = 5. */
  sets: number
  /** Questions per Set. Blueprint v3.0 = 100. */
  perSet: number
}

/**
 * AssemblyRequest metadata. From Integration Spec §4.3 (`meta`).
 *
 * `spec_version` is a CONSTANT "1.0" for this version of the Integration Spec.
 * Bumping it is a contract change that downstream modules must negotiate via
 * Runtime API version negotiation (Runtime API §4.5).
 */
export interface AssemblyRequestMeta {
  /** Constant "1.0" for Integration Spec v1.0. */
  specVersion: '1.0'
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. AssemblyRequest — the sole Engine input contract
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The AssemblyRequest — the sole input the Engine accepts.
 *
 * Source of truth: Blueprint Integration Specification v1.0 §4.
 *
 * Produced by the Reader (Reader Pipeline §8) from a Canonical Blueprint.
 * Consumed by the Candidate Generator. The Engine Foundation, Generator,
 * Ranking, Solver, Runtime API, and Draft Builder all depend on this shape.
 *
 * CONTRACT (Integration Spec §4.4 — "What the AssemblyRequest Deliberately Omits"):
 *  - NO prose, NO Markdown, NO rationale, NO per-slot examples.
 *  - NO per-slot Topic tables (the 500 rows of `1 | Easy | Memory` are
 *    illustrative; the Engine re-derives its own selection — it is an assembler,
 *    not a replicator).
 *  - NO content (Question bodies, choices, explanations).
 *
 * DETERMINISM (Engine Foundation Principle 2 / Reader Pipeline §6):
 *  A byte-identical Blueprint produces a byte-identical AssemblyRequest. This is
 *  verified by a property test in the Reader's acceptance criteria (E-1.2 S-1.2.6).
 */
export interface AssemblyRequest {
  /** Blueprint identity (id + version + profile). */
  identity: AssemblyRequestIdentity
  /** The unit one run produces. v1.0 = 'blueprint' (multi-set, §5.1). */
  runUnit: RunUnit
  /** How many Sets × Questions/Set this run produces. */
  target: RunTarget
  /** Closed set of Documents the Engine may draw from, each with its Tier. */
  documentRegistry: DocumentRegistryEntry[]
  /** Global arithmetic invariants the Solver must satisfy. */
  distributionConstraints: DistributionConstraints
  /** CR-1 … CR-5 with enforcement level + rule-specific bindings. */
  coverageRules: CoverageRule[]
  /** LO1–LO4 percentage targets + LO↔BlueprintType correspondence. */
  loDistribution: LoDistribution
  /** L1–L5 with scope, enforcement level, optional similarity thresholds. */
  duplicatePrevention: DuplicatePreventionRule[]
  /** Runtime-only: Question Codes to exclude from this run (not persisted). */
  exclusions: string[]
  /** Constant spec_version "1.0" for this Integration Spec version. */
  meta: AssemblyRequestMeta
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Reader Error anatomy (Reader Pipeline §6 — Fail Fast / Loud / Deterministic)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reader Error Category. EXACT vocabulary from Reader Pipeline §6.
 *
 * Split into `structural.*` (Stage 4 — shape of the document is wrong) and
 * `semantic.*` (Stage 5 — shape is fine but content is inconsistent). The
 * `generation.*` category is reserved for AssemblyRequest-emission failures
 * (Stage 8).
 */
export type ReaderErrorCategory =
  // Stage 4 — Structural Validation
  | 'structural.missing_section'
  | 'structural.duplicate_section'
  | 'structural.malformed_table'
  | 'structural.invalid_hierarchy'
  | 'structural.broken_reference'
  | 'structural.invalid_enum'
  // Stage 5 — Semantic Validation
  | 'semantic.distribution_inconsistency'
  | 'semantic.impossible_constraint'
  | 'semantic.conflicting_rules'
  | 'semantic.duplicated_rule'
  | 'semantic.smell'
  // Stage 8 — AssemblyRequest Generation
  | 'generation.missing_contract_field'

/**
 * Reader Error severity. From Reader Pipeline §6.
 *
 * - 'fatal'    — parsing cannot proceed (e.g. structurally unparseable document).
 * - 'blocking' — the AssemblyRequest cannot be emitted (e.g. IG-4 self-inconsistency).
 * - 'warning'  — emitted but the run may proceed (e.g. `semantic.smell`).
 */
export type ReaderErrorSeverity = 'fatal' | 'blocking' | 'warning'

/**
 * A source location in the Blueprint document. From Reader Pipeline §3 (Markdown
 * AST nodes MUST carry source line range).
 *
 * 1-indexed and inclusive, matching typical editor line numbers. Used so a Reader
 * Error can be located precisely by a Human authoring the Blueprint.
 */
export interface SourceLocation {
  /** Starting line (1-indexed, inclusive). */
  startLine: number
  /** Ending line (1-indexed, inclusive). Equal to startLine for single-line spans. */
  endLine: number
}

/**
 * A Reader Error. From Reader Pipeline §6.
 *
 * Mirrors the Runtime API's EngineError anatomy but specialized for the Reader:
 * it carries a structured SourceLocation (so the Blueprint author can find the
 * problem) and a Reader-specific category vocabulary.
 *
 * The Runtime API adapts ReaderErrors into EngineErrors (category 'Blueprint
 * Error', Runtime API §7.2) when surfacing them in the Assembly Result.
 */
export interface ReaderError {
  /** One of ReaderErrorCategory (Stage 4/5/8). */
  category: ReaderErrorCategory
  /** Where in the source document the error was detected. */
  location: SourceLocation
  /** fatal / blocking / warning. */
  severity: ReaderErrorSeverity
  /** Plain-language description of what's wrong. */
  explanation: string
  /** Concrete suggested fix — never empty. */
  recommendation: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Reader result — the entry-point return type (Stage 8 output)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reader execution metadata. From Reader Pipeline §10 (AssemblyRequest
 * Generation) + Runtime API §9 (Audit Model — Execution Trace + Version
 * Trace). Carries the deterministic identity of THIS Reader run.
 *
 * All fields are stable strings or null — no Date, no random — so the
 * ReaderResult's determinism contract holds: byte-identical Blueprint →
 * byte-identical ReaderResult (Reader Pipeline Principle 2).
 *
 * `timestampIso` is OPTIONAL: when provided by the caller (the orchestrator),
 * it's carried through for audit; when absent, null. The Reader itself never
 * reads the wall clock.
 */
export interface ReaderExecutionMeta {
  /** The Reader implementation version that produced this result. Constant "1.0.0" for v1.0. */
  readonly readerVersion: '1.0.0'
  /** Blueprint schema major version the Reader targeted (e.g. "3"). Null when input couldn't be parsed at all. */
  readonly schemaVersionMajor: string | null
  /**
   * Optional caller-supplied ISO timestamp. Null when not provided. The Reader
   * never generates one (would violate determinism); the orchestrator may.
   */
  readonly timestampIso: string | null
}

/**
 * The final Reader result. From Reader Pipeline §3 (entry-point return type)
 * + §10 (AssemblyRequest Generation) + §11 (Fail Fast / Loud / Deterministic).
 *
 * Stage 8 produces this. Both branches carry the FULL aggregated diagnostics
 * list (success still includes warnings; failure includes the blocking/fatal
 * errors that halted the pipeline). Both branches also carry the Blueprint
 * metadata and the Reader execution metadata — the success/failure
 * distinction is solely about whether an `assemblyRequest` was produced.
 *
 * DISCRIMINATED UNION: callers narrow on `ok`.
 *  - `ok: true`  — pipeline completed; `assemblyRequest` is present and valid.
 *                  `diagnostics` may still carry `warning`-severity entries.
 *  - `ok: false` — pipeline halted at a stage whose diagnostics included a
 *                  `fatal` or `blocking` entry; `assemblyRequest` is absent.
 *                  `diagnostics` carries every diagnostic emitted up to the halt.
 *
 * IMMUTABILITY: every field is `readonly`. The discriminated union's two
 * branches share most fields so the caller can inspect diagnostics and
 * metadata regardless of success/failure without duplicating logic.
 *
 * DETERMINISM (Reader Pipeline Principle 2): same Blueprint input → same
 * ReaderResult, byte-for-byte. Achieved by: every stage is a pure function;
 * the aggregator sorts diagnostics deterministically; the execution metadata
 * carries only stable values (no Date/random inside the Reader).
 */
export type ReadBlueprintResult = {
  /** Discriminator. */
  readonly ok: boolean
  /** Aggregated diagnostics from ALL stages that ran (Stage 7 output). */
  readonly diagnostics: readonly ReaderError[]
  /** Stage-4-normalized metadata. Present even on failure (for debugging). */
  readonly metadata: import('./normalizer').CanonicalBlueprintMetadata
  /** Reader execution metadata (version, schema major, optional timestamp). */
  readonly executionMeta: ReaderExecutionMeta
} & (
  | { readonly ok: true; readonly assemblyRequest: AssemblyRequest }
  | { readonly ok: false }
)
