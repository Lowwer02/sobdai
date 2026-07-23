/**
 * lib/engine/reader/blueprint-ast.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 5 — Blueprint AST vocabulary (business-meaning nodes).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §4 (Blueprint AST),
 *     §4.6 (What the Blueprint AST Deliberately Does NOT Carry)
 *   - Blueprint Integration Specification v1.0 §3 (Canonical Blueprint Format),
 *     §4 (AssemblyRequest contract — downstream consumer)
 *
 * The Blueprint AST is the BUSINESS-MEANING representation of the Blueprint.
 * It is produced by Stage 5 (AST Projection) from the Markdown AST and
 * consumed by Stage 6 (AssemblyRequest Builder). After projection, the
 * Markdown AST is no longer needed (spec §4 intro).
 *
 * What the Blueprint AST carries (spec §4.2 — "business object concepts"):
 *  - Identity (Blueprint id + version + profile)
 *  - Document Registry (closed set of Documents + Tier assignments)
 *  - Tier Definitions (Tier → label + per-set min/max)
 *  - Distribution Targets (per-Set, per-axis counts from the Master Table)
 *  - Distribution Constraints (sum, tier floors/ceilings, anchor rule)
 *  - Coverage Rules (CR-1 … CR-5 with rule-specific bindings)
 *  - LO Mapping (LO definitions + LO↔Type correspondence + per-Set %)
 *  - Patterns (Pattern definitions + per-Set Pattern targets + Pattern×Type)
 *  - Duplicate Prevention (L1 … L5 with scope + level + Similarity Metric)
 *
 * What the Blueprint AST DELIBERATELY DOES NOT CARRY (spec §4.6):
 *  - ❌ Per-slot examples (the 500 illustrative rows in v3.0 Set tables — the
 *    Engine re-derives its own selection; AssemblyRequest omits them).
 *  - ❌ Document syntax (Markdown tables, code blocks — that's Markdown AST).
 *  - ❌ Rationale prose (the "เหตุผล" columns are dropped per spec §8.2).
 *  - ❌ QA / analysis sections (Coverage Analysis, Quality Review — these are
 *     authoring artifacts, not rules).
 *  - ❌ Validation state (the AST is a parse result, not a judgment).
 *
 * IMMUTABILITY CONTRACT: every node is `readonly`. Callers MUST NOT mutate.
 * The AssemblyRequest builder (Stage 6) treats the AST as a read-only input.
 * TypeScript `readonly` modifiers enforce this at compile time; runtime freeze
 * is not added (would slow hot path; type guard is sufficient).
 */

import type {
  AnchorRule,
  AssessmentProfile,
  BlueprintType,
  CoverageRule,
  CoverageRuleId,
  Difficulty,
  DistributionConstraints,
  DocumentRegistryEntry,
  DuplicatePreventionId,
  DuplicatePreventionRule,
  DuplicatePreventionScope,
  EnforcementLevel,
  LearningObjective,
  LoDistribution,
  QuestionPattern,
  SimilarityThresholds,
  SourceLocation,
  Tier,
} from './contracts'

// ─── Identity ───────────────────────────────────────────────────────────────

/**
 * Blueprint identity carried in the AST. Mirrors `AssemblyRequestIdentity`
 * (contracts.ts) but with optional fields — at AST-construction time the
 * individual pieces may still be missing (Stage 3 reports; Stage 5 carries
 * what's present). Stage 6 fails closed if any required piece is missing.
 */
export interface BlueprintAstIdentity {
  readonly blueprintId: string | null
  readonly blueprintVersion: string | null
  readonly profile: AssessmentProfile
}

// ─── Tier Definitions + Assignments ─────────────────────────────────────────

/**
 * One row of the Tier Definitions table. Per-set min/max bounds the count of
 * Questions from Documents at this Tier.
 *
 * Real v3.0 example: `| **Tier 1** | Core | 13–20 | กฎหมายแม่บท + ... |` →
 *   `{ tier: 1, label: 'Core', min: 13, max: 20, criteria: 'กฎหมายแม่บท + ...' }`.
 *
 * `criteria` is preserved verbatim for human review (audit trail) but is NOT
 * consumed by any Engine module. The Engine cares about the numeric bounds.
 */
export interface TierDefinition {
  readonly tier: Tier
  readonly label: string
  readonly min: number
  readonly max: number
  /** Human-readable criteria for this Tier. Audit-only; not Engine-consumed. */
  readonly criteria: string
  readonly sourceLocation: SourceLocation
}

/**
 * One row of the Tier Mapping table — assigns a Document to a Tier.
 *
 * Real v3.0 example: `| 1. พ.ร.บ.การศึกษาแห่งชาติ 2542 | Tier 1: Core |` →
 *   `{ documentName: 'พ.ร.บ.การศึกษาแห่งชาติ 2542', documentNumber: 1, tier: 1 }`.
 *
 * `documentNumber` is the leading `N.` in the document name; the AssemblyRequest
 * Builder resolves the document name to a DocumentRegistryEntry id (Stage 6's
 * job, since the registry may be authored in a separate place).
 */
export interface TierAssignment {
  /** Document name as authored (e.g. "พ.ร.บ.การศึกษาแห่งชาติ 2542"). */
  readonly documentName: string
  /** Leading number in the authored row, e.g. `1` for "1. พ.ร.บ. ...". Null if absent. */
  readonly documentNumber: number | null
  readonly tier: Tier
  readonly sourceLocation: SourceLocation
}

// ─── Coverage Rule bindings (typed per rule id) ─────────────────────────────
// contracts.ts declares CoverageRule.binding as `unknown` intentionally — the
// shape varies per rule id. Here we provide the concrete shapes per CR-* so
// Stage 5 emits typed bindings Stage 6 can consume without re-parsing.

/**
 * CR-1 binding: a list of (Document, MandatoryTopic) pairs that MUST appear in
 * every Set. Each pair is a binding constraint the Solver must satisfy.
 *
 * Real v3.0 example: `{ document: 'พ.ร.บ.การศึกษาแห่งชาติ 2542', topic: 'หลักการจัดการศึกษา (ม.6–8)' }`.
 */
export interface Cr1Binding {
  readonly kind: 'CR-1'
  readonly mandatoryTopics: ReadonlyArray<{
    readonly document: string
    readonly topic: string
  }>
}

/**
 * CR-2 binding: minimum percentage (0..100) of unique Topics required per Set.
 * Real v3.0 = 70 (i.e. ≥70 unique topics out of 100 questions).
 */
export interface Cr2Binding {
  readonly kind: 'CR-2'
  readonly minUniqueTopicPercent: number
}

/**
 * CR-3 binding: maximum number of Sets a (Topic + Difficulty + Type) triple
 * may appear in. Real v3.0 = 5 (auto-satisfied because v3.0 has exactly 5 Sets).
 */
export interface Cr3Binding {
  readonly kind: 'CR-3'
  readonly maxSetsPerTriple: number
}

/**
 * CR-4 binding: minimum count of Questions per Document per Set.
 * Real v3.0 = 5 (every Document appears in every Set with at least 5 questions).
 */
export interface Cr4Binding {
  readonly kind: 'CR-4'
  readonly minPerDocumentPerSet: number
}

/**
 * CR-5 binding: Section Sweep — Tier-1 documents must have every major section
 * measured at least once across the 5 Sets combined. No threshold value; this
 * is a coverage sweep, not a count.
 */
export interface Cr5Binding {
  readonly kind: 'CR-5'
  /** Reserved for future sweep-config (e.g. which Sections count as "major").
   *  Empty in v1.0 — the Engine derives "major" from the Section axis itself. */
  readonly majorSections: readonly string[]
}

/** Discriminated union of all CR bindings. */
export type CoverageRuleBinding =
  | Cr1Binding
  | Cr2Binding
  | Cr3Binding
  | Cr4Binding
  | Cr5Binding

// ─── Learning Objectives ────────────────────────────────────────────────────

/**
 * One LO definition row.
 *
 * Real v3.0 example: `| **LO1** | Knowledge Recall | Remember | ... | Memory |` →
 *   `{ lo: 'LO1', name: 'Knowledge Recall', bloom: 'Remember', blueprintType: 'Memory' }`.
 *
 * The `blueprintType` per LO row forms the LO↔Type correspondence map the
 * Solver consults when matching LO slots to Candidate Types.
 */
export interface LoDefinition {
  readonly lo: LearningObjective
  readonly name: string
  readonly bloomLevel: string
  readonly blueprintType: BlueprintType
  readonly sourceLocation: SourceLocation
}

/**
 * Per-Set percentage target for one LO. Real v3.0 LO1 = 20–25% (min/max form).
 *
 * The `target` field carries a single representative target (midpoint of the
 * range or the explicitly authored target). Stage 6 derives `targets` map for
 * LoDistribution from these (using midpoint when only a range is authored).
 */
export interface LoDistributionTarget {
  readonly lo: LearningObjective
  readonly minPercent: number
  readonly maxPercent: number
  /** Representative target percent (midpoint of min/max, or authored target). */
  readonly targetPercent: number
  readonly sourceLocation: SourceLocation
}

// ─── Question Patterns ──────────────────────────────────────────────────────

/**
 * One Pattern definition row.
 *
 * Real v3.0 example: `| **Positive** | ถามสิ่งที่ถูกต้อง | "ข้อใด..." | 35–40% |` →
 *   `{ pattern: 'Positive', description: '...', example: '...', share: {min:35, max:40} }`.
 */
export interface PatternDefinition {
  readonly pattern: QuestionPattern
  readonly description: string
  readonly example: string
  /** Per-Set share percentage range from the Pattern Types table. */
  readonly sharePercent: { readonly min: number; readonly max: number }
  readonly sourceLocation: SourceLocation
}

/**
 * Per-Set count target for one Pattern. From the Pattern Distribution Target
 * table (Min/Max/Target form).
 *
 * Real v3.0 Positive: `| Positive | 35 | 40 | 38 |` →
 *   `{ pattern: 'Positive', min: 35, max: 40, target: 38 }`.
 */
export interface PatternDistributionTarget {
  readonly pattern: QuestionPattern
  readonly min: number
  readonly max: number
  readonly target: number
  readonly sourceLocation: SourceLocation
}

/**
 * Pattern × Blueprint Type correspondence entry. `isPrimary` flags the cell
 * marked "✅ Primary" in the cross-table.
 *
 * Real v3.0 example: `Positive × Memory = ✅ Primary` →
 *   `{ pattern: 'Positive', blueprintType: 'Memory', isPrimary: true }`.
 */
export interface PatternTypeCorrespondence {
  readonly pattern: QuestionPattern
  readonly blueprintType: BlueprintType
  readonly isPrimary: boolean
}

// ─── Duplicate Prevention ───────────────────────────────────────────────────

/**
 * One Duplicate Prevention rule row.
 *
 * Real v3.0 L1: `| **L1** | ภายใน Set | Topic + Difficulty + Type เดียวกัน = ห้ามซ้ำ | Hard |` →
 *   `{ id: 'L1', scope: 'within_set', description: '...', level: 'hard' }`.
 */
export interface DuplicatePolicy {
  readonly id: DuplicatePreventionId
  readonly scope: DuplicatePreventionScope
  readonly description: string
  readonly level: EnforcementLevel
  readonly sourceLocation: SourceLocation
}

// ─── Distribution Master Table ──────────────────────────────────────────────

/**
 * Per-Set count of Questions from one Document. From the Distribution Master
 * Table's "จำนวนข้อต่อ Document ต่อ Set" sub-table.
 *
 * Real v3.0 example: row "1. พ.ร.บ.การศึกษาแห่งชาติ 2542" with
 * `| **20** | 13 | 12 | 13 | 13 |` (sets 1..5) → one entry per Set.
 *
 * NOTE: per Integration Spec §4.4 / Reader Pipeline §4.6, the Master Table's
 * per-Document per-Set counts are AUTHOR-GUIDANCE, not Engine rules. They are
 * preserved in the AST for completeness and for the Reader's own distribution-
 * consistency check (a later, separate concern), but the AssemblyRequest does
 * NOT carry them — the Engine re-derives its own per-Set allocation from the
 * rules. Stage 6 drops these.
 */
export interface DocumentSetCount {
  readonly documentName: string
  readonly documentNumber: number | null
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  readonly count: number
  /** True iff this cell was bolded in the source (the Set's "Theme Anchor"). */
  readonly isThemeAnchor: boolean
}

/**
 * Per-Set count of Questions at one Difficulty. From the Difficulty Distribution
 * sub-table. Like DocumentSetCount, this is AUTHOR-GUIDANCE — Stage 6 drops it.
 */
export interface DifficultySetCount {
  readonly difficulty: Difficulty
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  readonly count: number
}

/**
 * Per-Set count of Questions at one BlueprintType. From the Blueprint Type
 * Distribution sub-table. AUTHOR-GUIDANCE — Stage 6 drops it.
 */
export interface BlueprintTypeSetCount {
  readonly blueprintType: BlueprintType
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  readonly count: number
}

// ─── Set definitions (light — they're authoring artifacts, not rules) ───────

/**
 * A Set definition section (## Set N — <theme>). Carries only the metadata the
 * Engine COULD need (theme name, anchor document) — NOT the per-Question rows
 * (those are illustrative per Integration Spec §4.4 and would be dropped at
 * Stage 6 anyway).
 *
 * Stage 5 captures the Set section's presence and theme (useful for diagnostics
 * and audit); Stage 6 currently does not consume this, but it's available if
 * the AssemblyRequest contract ever grows Set metadata.
 */
export interface SetDefinition {
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  readonly theme: string
  /** Document name marked as this Set's anchor (e.g. "พ.ร.บ.การศึกษาแห่งชาติ 2542"). */
  readonly anchorDocument: string | null
  readonly sourceLocation: SourceLocation
}

// ─── Blueprint AST root ─────────────────────────────────────────────────────

/**
 * The Blueprint AST root. Composed of typed business-node collections. Every
 * collection is a `readonly` array — immutability enforced by type.
 *
 * Source-order is preserved within each collection (the order the source
 * declared them); Stage 6 may re-sort for deterministic output.
 */
export interface BlueprintAst {
  readonly identity: BlueprintAstIdentity
  readonly tierDefinitions: readonly TierDefinition[]
  readonly tierAssignments: readonly TierAssignment[]
  readonly distributionConstraints: DistributionConstraints
  readonly coverageRules: readonly CoverageRule[]
  readonly loDefinitions: readonly LoDefinition[]
  readonly loDistributionTargets: readonly LoDistributionTarget[]
  readonly patternDefinitions: readonly PatternDefinition[]
  readonly patternDistributionTargets: readonly PatternDistributionTarget[]
  readonly patternTypeCorrespondence: readonly PatternTypeCorrespondence[]
  readonly duplicatePolicies: readonly DuplicatePolicy[]
  readonly similarityThresholds: SimilarityThresholds | null
  readonly documentSetCounts: readonly DocumentSetCount[]
  readonly difficultySetCounts: readonly DifficultySetCount[]
  readonly blueprintTypeSetCounts: readonly BlueprintTypeSetCount[]
  readonly setDefinitions: readonly SetDefinition[]
}

// ─── Re-exports (Stage 6 convenience — single import surface) ───────────────

export type {
  AnchorRule,
  AssessmentProfile,
  BlueprintType,
  CoverageRule,
  CoverageRuleId,
  Difficulty,
  DistributionConstraints,
  DocumentRegistryEntry,
  DuplicatePreventionRule,
  LearningObjective,
  LoDistribution,
  QuestionPattern,
  SimilarityThresholds,
  SourceLocation,
  Tier,
}
