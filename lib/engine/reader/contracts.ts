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

// ═══════════════════════════════════════════════════════════════════════════
// 1. Shared Enum Vocabulary (Integration Spec §4.3, layer-independent per §3.4)
// ═══════════════════════════════════════════════════════════════════════════
// These enums are the language-independent rule identifiers. Thai display labels
// live in the Blueprint for Human review; the Engine operates on these enums
// exclusively (Integration Spec §3.4 Layer Independence Guarantees).

/**
 * Assessment Profile. From Integration Spec §4.3 (`identity.profile`).
 *
 * v1.0 = 'simulation' only. Other profiles (Diagnostic, Weekly Challenge, Final
 * Challenge, AI Adaptive) are deferred per Engine Foundation — adding one is a
 * Profile-additive change, never a redesign.
 */
export type AssessmentProfile = 'simulation'

/**
 * Tier level assigned to a Document. From Integration Spec §5.2 ("Tier Is a
 * Document Property, Not a Question Property") and §4.3 (`document_registry`
 * entries carry `tier ∈ {1,2,3,4}`).
 *
 * Critical: Tier is DERIVED per Candidate via Document Registry lookup (Candidate
 * Generation §3.3) — never stored on the Question. The Tier constraints
 * (`tier1_floor ≥ 30`, `tier4_ceiling ≤ 25`) aggregate over Documents.
 */
export type Tier = 1 | 2 | 3 | 4

/**
 * BlueprintType axis. From Integration Spec §5.4. Enum: Memory / Concept /
 * Procedure / Scenario. This is one of the four IG-2 axes the Bank must persist
 * for the Generator's filters and Ranking's Pattern Fit component.
 */
export type BlueprintType = 'Memory' | 'Concept' | 'Procedure' | 'Scenario'

/**
 * Question Pattern axis. From Integration Spec §5.4. Enum: Positive / Negative /
 * Best Answer / Scenario / Sequence / Matching. This is one of the four IG-2
 * axes. NOTE: distinct from Content Template v2.1's QuestionType enum
 * (MCQ4/MCQ5/True-False/Matching/Ordering/Essay) — see Architecture Amendment
 * Request (IG-2 paused).
 */
export type QuestionPattern =
  | 'Positive'
  | 'Negative'
  | 'Best Answer'
  | 'Scenario'
  | 'Sequence'
  | 'Matching'

/**
 * Learning Objective identifier. From Integration Spec §4.3 (`lo_distribution`).
 * Blueprint v3.0 declares LO1–LO4 with target % per set and an LO↔BlueprintType
 * correspondence map.
 */
export type LearningObjective = 'LO1' | 'LO2' | 'LO3' | 'LO4'

/**
 * Difficulty level. From Blueprint v3.0's distribution axes (Document × Difficulty
 * × BlueprintType × Pattern). Matches the Bank's existing `difficulty` column
 * values, which the importer already parses.
 */
export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/**
 * Coverage Rule enforcement level. From Integration Spec §4.3 (`coverage_rules`
 * entries carry `level ∈ {hard, soft}`).
 *
 * Hard — the Solver must satisfy or report infeasibility. Soft — the Solver
 * optimizes toward but may miss with a Soft Constraint conflict.
 */
export type EnforcementLevel = 'hard' | 'soft'

/**
 * Coverage Rule identifier. From Integration Spec §3.3 / §4.3. Blueprint v3.0
 * declares CR-1 through CR-5 with bindings and enforcement levels.
 *
 * - CR-1: Mandatory Topic (Document × Topic) pairs must appear in every Set.
 * - CR-3: Topic + Difficulty + Type may not appear in >5 Sets (auto-satisfied
 *         for v3.0's 5 Sets).
 * - CR-5: Section Sweep (requires IG-2 `section`).
 */
export type CoverageRuleId = 'CR-1' | 'CR-2' | 'CR-3' | 'CR-4' | 'CR-5'

/**
 * Duplicate Prevention Rule identifier. From Integration Spec §3.3 / §4.3.
 * Blueprint v3.0 declares L1–L5 with scope and enforcement level.
 */
export type DuplicatePreventionId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

/**
 * Duplicate Prevention scope. From Integration Spec §4.3 (`duplicate_prevention`
 * entries carry `scope ∈ {within_set, across_set}`).
 */
export type DuplicatePreventionScope = 'within_set' | 'across_set'

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

/**
 * The unit one Engine run produces. From Integration Spec §5.1 (Critical
 * Reconciliation: "The Run Unit: `blueprint`, not `exam_set`").
 *
 * v1.0 = 'blueprint' only. One Engine run produces `target.sets` (5) Draft Exam
 Sets that must be CO-ALLOCATED to satisfy cross-Set rules (CR-3, L3, L4, L5).
 */
export type RunUnit = 'blueprint'

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
// 5. Reader result — the entry-point return type
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The result of reading a Blueprint. Reader Pipeline §3.
 *
 * Either an AssemblyRequest (success) or a non-empty list of ReaderErrors
 * (failure). A successful read MAY still carry warnings (severity 'warning');
 * those are NOT in the error list — they travel with the AssemblyRequest via
 * the Runtime API's Warnings collection.
 *
 * Discriminated union: callers narrow on `ok`.
 */
export type ReadBlueprintResult =
  | { ok: true; assemblyRequest: AssemblyRequest }
  | { ok: false; errors: ReaderError[] }
