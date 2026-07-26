/**
 * lib/engine/generator/discovery.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator Stages 3 + 4 — Candidate Discovery + Pool Validation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0
 *       §5   (Candidate Discovery — materialize filtered rows into Candidates)
 *       §7   (Pool Validation — per-axis completeness; REPORTS ONLY)
 *       §9   (Candidate Provenance)
 *       §11.2 (Failure Catalogue subset — Empty Pool, Partial Coverage,
 *              Conflicting Metadata; per §2.3 Invariants + §7.5 does-not)
 *
 * WHAT THIS MODULE IS.
 *  - Stage 3 (Discovery): convert the eligible rows from E-2C (FilterStageResult)
 *    into immutable Candidate objects carrying the five facets (§5.2): Identity,
 *    Metadata, Completeness, Confidence, Provenance. Discovery DISCOVERS only.
 *  - Stage 4 (Pool Validation): validate the CandidatePool against every
 *    checkable Blueprint axis, detect shortfalls, classify the result.
 *    Validation REPORTS only — it never repairs, expands, or weakens (§7.5).
 *
 * WHAT THIS MODULE IS NOT (§5.6 + §7.5 + §7.3).
 *  - ❌ Does NOT rank, score, or select (Ranking's job).
 *  - ❌ Does NOT solve joint constraints (Solver's job — IG-5; §7.3 boundary:
 *         Validation is per-axis only; "SUM=100, tier floors, anchor rule" are
 *         joint and out of scope here).
 *  - ❌ Does NOT expand the pool (Pool Expansion is §8 / E-2E).
 *  - ❌ Does NOT relax or weaken filters; never silently drops a Candidate.
 *  - ❌ Does NOT infer missing axes (§5.6 + AP-12); it FLAGS them via
 *         Completeness and reflects them in Confidence.
 *  - ❌ Does NOT read content. Metadata only.
 *  - ❌ Does NOT read the wall clock. Determinism contract (README §1).
 *
 * IMMUTABILITY: every result is `readonly`; inputs are never mutated.
 * DETERMINISM: pure functions of their inputs. Same input → same output, byte
 *              for byte (verified by the test suite via stableStringify).
 *
 * ARCHITECTURE DECISIONS (spec ambiguities — see plan; recorded here for audit):
 *   D1 — Confidence = 'reduced' iff any IG-2 axis is null/incomplete. Reason
 *        names the first missing axis. Deterministic; requires ZERO inference
 *        (the §5.3 "inferred from tags" example is treated as stale prose;
 *        §5.6 + AP-12 are normative MUST NEVER rules and win the conflict).
 *   D2 — Validation scope: check what is checkable (CR-1 coverage, LO targets,
 *        document existence, L1 diversity); emit existence Warnings; honor the
 *        §7.3 per-axis boundary (Difficulty/Pattern have target=0 and Pass).
 *   D3 — Tier derivation cannot fail: E-2C's Document Filter guarantees every
 *        row reaching Discovery has document ∈ permittedDocuments (= registry
 *        names). Tier is always derivable; no Tier-failure path is needed.
 *   D4 — A duplicate Question Code with differing metadata is a Bank-integrity
 *        violation; surfaced as a Fatal `internal_error` (§2.2 Discovery
 *        "Fatal on malformed Bank metadata"). Halts the run; the offending Code
 *        is named in the diagnostic.
 */

import type {
  AxisSlot,
  BlueprintSlot,
  Candidate,
  CandidateCompleteness,
  CandidateConfidence,
  CandidateIdentity,
  CandidateMetadata,
  CandidatePool,
  CandidateProvenance,
  CandidateSource,
  CoverageRuleId,
  FatalDiagnostic,
  GeneratorSeverity,
  QueryPlan,
  QuestionStatus,
  ShortfallEntry,
  ShortfallReport,
  Tier,
} from './contracts'
import { FILTER_EXECUTION_ORDER } from './contracts'
import type { Cr1DocumentTopicBinding } from './metadata-filters'
import type { DocumentRegistryEntry, LearningObjective } from '../reader/contracts'
import type { SyntheticBankRow } from '../shared/testing/fixtures'

// ═══════════════════════════════════════════════════════════════════════════
// Module constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The per-Set question count assumed when the QueryPlan does not expose one.
 *
 * Architecture note (read before changing):
 *  - This is Blueprint v3.0's published default (5 Sets × 100 questions/Set).
 *  - The QueryPlan (E-2B output) does NOT currently carry `perSet` — the Query
 *    Planner dropped it as a Solver concern (the Solver re-derives the actual
 *    per-Set allocation from joint constraints). Pool Validation's L1 diversity
 *    check still needs a per-Set reference count, so it falls back to this
 *    constant.
 *  - This constant SHOULD disappear once `perSet` becomes an explicit field on
 *    the FROZEN QueryPlan contract (a future contract revision, not this
 *    session). At that point `checkL1Diversity` reads `pool.queryPlan.perSet`
 *    directly and this constant is deleted. Tracked as a Known Limitation of
 *    E-2D.
 */
const DEFAULT_BLUEPRINT_PER_SET = 100

//////////////////////////////////////////////////////////////////////////
// STAGE 3 — CANDIDATE DISCOVERY
//
// Materialize E-2C's eligible Bank rows into immutable Candidate objects
// (Architecture §5). Each Candidate carries five facets (§5.2): Identity,
// Metadata, Completeness, Confidence, Provenance. Discovery DISCOVERS only —
// it never ranks, selects, solves, or reads content (§5.6).
//
// This stage group contains:
//   - Public API   : DiscoveryInput, DiscoveryResult, DiscoveryContext
//   - Helpers      : facet builders, Tier derivation, slot/coverage projection
//   - Entry point  : discoverCandidates()
//////////////////////////////////////////////////////////////////////////

// ═══════════════════════════════════════════════════════════════════════════
// 3.1 Public API — Discovery
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 3 input. Carries the eligible rows from E-2C (FilterStageResult.rows
 * on the success branch) plus the QueryPlan they were filtered against.
 */
export interface DiscoveryInput {
  readonly rows: readonly SyntheticBankRow[]
  readonly plan: QueryPlan
}

/**
 * Stage 3 result. Discriminated on `ok`:
 *  - `ok: true`  — every row materialized into a Candidate; pool constructed.
 *  - `ok: false` — Fatal (malformed Bank metadata per §2.2; e.g. a duplicate
 *                  Question Code with conflicting metadata — see D4). No pool
 *                  produced; the diagnostics name the offending Codes.
 */
export type DiscoveryResult =
  | { readonly ok: true; readonly pool: CandidatePool }
  | { readonly ok: false; readonly fatalDiagnostics: readonly FatalDiagnostic[] }

// ═══════════════════════════════════════════════════════════════════════════
// 3.2 Discovery — materialization helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a document-name → Tier lookup map from the Query Plan's permitted
 * documents. NOTE: `plan.permittedDocuments` carries NAMES only (no Tier) —
 * the Query Planner deliberately drops Tier (it's derived per-Candidate, §3.5).
 *
 * To derive Tier we need the Document REGISTRY, not the plan. E-2D receives a
 * QueryPlan (which lacks the registry) but the AssemblyRequest carries it. For
 * v1.0 we accept the registry alongside the plan via the input contract below;
 * the orchestrator wires it through. (This does not modify any FROZEN type —
 * `DocumentRegistryEntry` is consumed read-only.)
 */
export interface DiscoveryContext {
  /** The QueryPlan (from E-2B, carried through E-2C). */
  readonly plan: QueryPlan
  /** The Document Registry (from the AssemblyRequest) — for Tier derivation. */
  readonly documentRegistry: readonly DocumentRegistryEntry[]
}

/** Normalize a possibly-undefined IG-2 axis to its nullable form. */
function nullable<T>(v: T | null | undefined): T | null {
  return v === undefined ? null : v
}

/** Per-axis completeness: 'complete' iff the value is present (non-null). */
function completenessOf<T>(v: T | null): 'complete' | 'incomplete' {
  return v === null ? 'incomplete' : 'complete'
}

/**
 * Build the Completeness facet. Per D1: one flag per IG-2 axis. A null axis is
 * FLAGGED 'incomplete', NOT used to drop the Candidate (Maximum Recall, §5.2).
 */
function buildCompleteness(row: SyntheticBankRow): CandidateCompleteness {
  return {
    blueprintType: completenessOf(nullable(row.blueprintType)),
    learningObjective: completenessOf(nullable(row.learningObjective)),
    questionPattern: completenessOf(nullable(row.questionPattern)),
    section: completenessOf(nullable(row.section)),
  }
}

/**
 * Build the Confidence facet. Per D1: 'reduced' iff any IG-2 axis is incomplete;
 * the reason names the FIRST missing axis (deterministic ordering:
 * blueprintType → learningObjective → questionPattern → section). 'full' when
 * every axis is present.
 *
 * The reason string is a stable, machine-derivable label (NOT a ranking score
 * — §5.2 / §5.3). Ranking reads `level` for weighting; `reason` is for audit.
 */
function buildConfidence(row: SyntheticBankRow): CandidateConfidence {
  const bp = nullable(row.blueprintType)
  const lo = nullable(row.learningObjective)
  const qp = nullable(row.questionPattern)
  const sec = nullable(row.section)

  if (bp === null) return { level: 'reduced', reason: 'blueprintType axis missing (IG-2 gap)' }
  if (lo === null) return { level: 'reduced', reason: 'learningObjective axis missing (IG-2 gap)' }
  if (qp === null) return { level: 'reduced', reason: 'questionPattern axis missing (IG-2 gap)' }
  if (sec === null) return { level: 'reduced', reason: 'section axis missing (IG-2 gap)' }
  return { level: 'full', reason: null }
}

/**
 * Derive Tier from the row's document via the Document Registry (§3.5, §5.5).
 *
 * Per D3 this CANNOT fail at this stage: E-2C's Document Filter already
 * guaranteed `row.document ∈ plan.permittedDocuments`, and
 * `permittedDocuments = documentRegistry.map(e => e.name)`. So every row's
 * document is a registry NAME and the lookup always hits.
 *
 * If the invariant is somehow violated (e.g. Discovery called directly with
 * unfiltered rows), we surface it loudly — return tier 1 is NOT acceptable
 * (AP-9 hidden assumptions). The caller (discoverCandidates) treats a missing
 * lookup as a Fatal `document_registry_mismatch`.
 */
function deriveTier(
  row: SyntheticBankRow,
  registry: readonly DocumentRegistryEntry[]
): Tier | null {
  const entry = registry.find((e) => e.name === row.document)
  return entry ? entry.tier : null
}

/**
 * Build the Provenance facet (§9.2). Records HOW the Candidate was admitted.
 *
 *  - filtersPassed: every survivor passed all 7 filters in FILTER_EXECUTION_ORDER
 *    (E-2C's guarantee — this is the post-filter stage).
 *  - eligibleSlots: the per-Set slots whose axis value matches the Candidate's.
 *    A Candidate may be eligible for multiple slots across multiple Sets.
 *  - coverageSatisfied: CR-1 rule ids whose document_topic_pairs binding the
 *    Candidate matches (using E-2C's exported Cr1DocumentTopicBinding shape).
 *  - source: the Bank read kind + a deterministic query id (correlates the
 *    Candidate with its origin read; not the wall clock).
 */
function buildProvenance(
  row: SyntheticBankRow,
  ctx: DiscoveryContext
): { provenance: CandidateProvenance; tierMissing: boolean } {
  // filtersPassed: copy of the frozen order array (frozen as readonly).
  const filtersPassed: readonly string[] = [...FILTER_EXECUTION_ORDER] as readonly string[]

  // eligibleSlots: for each Set, include slots whose axisValue matches the row.
  const eligibleSlots = computeEligibleSlots(row, ctx.plan)

  // coverageSatisfied: CR-1 rules whose binding the row matches.
  const coverageSatisfied = computeCoverageSatisfied(row, ctx.plan)

  // source: stable, deterministic id derived from the row's Code (NOT a clock).
  const source: CandidateSource = {
    kind: 'metadata_query',
    queryId: `meta:${row.questionCode}`,
  }

  return {
    provenance: {
      filtersPassed: filtersPassed as CandidateProvenance['filtersPassed'],
      eligibleSlots,
      coverageSatisfied,
      source,
    },
    tierMissing: false,
  }
}

/**
 * Compute which Blueprint slots a Candidate is eligible to fill, per Set.
 *
 * For each Set (1..setCount), the row is eligible for:
 *  - the Difficulty slot matching row.difficulty
 *  - the Pattern slot matching row.questionPattern (when present)
 *  - the LO slot matching row.learningObjective (when present)
 *
 * Slots are returned with setNumber + the matching axis. A Candidate that
 * carries null pattern/LO is eligible for fewer slots (its Completeness flags
 * the gap; Ranking will weight it lower).
 */
function computeEligibleSlots(row: SyntheticBankRow, plan: QueryPlan): readonly BlueprintSlot[] {
  const slots: BlueprintSlot[] = []
  const setCount = inferSetCount(plan)

  for (let set = 1; set <= setCount; set++) {
    const s = set as BlueprintSlot['setNumber']
    // Difficulty is always present (Bank column; E-2C's Difficulty Filter
    // guaranteed it's in-enum). Emit a difficulty slot.
    slots.push({ setNumber: s, difficulty: row.difficulty })
    // Pattern slot (when the Candidate carries one).
    const qp = nullable(row.questionPattern)
    if (qp !== null) {
      slots.push({ setNumber: s, pattern: qp })
    }
    // LO slot (when the Candidate carries one).
    const lo = nullable(row.learningObjective)
    if (lo !== null) {
      slots.push({ setNumber: s, learningObjective: lo })
    }
  }

  return slots
}

/**
 * Infer the Set count from the QueryPlan. The planner emits one Difficulty
 * slot per (Set × Difficulty); with 3 difficulties, setCount = difficultySlots
 * length / 3. Falls back to 5 (Blueprint v3.0) if the plan is degenerate.
 */
function inferSetCount(plan: QueryPlan): number {
  if (plan.difficultySlots.length >= 3) {
    return Math.floor(plan.difficultySlots.length / 3)
  }
  // Degenerate plan (no difficulty slots). Default to Blueprint v3.0's 5 Sets.
  return 5
}

/**
 * Compute which CR-1 coverage requirements this Candidate satisfies, by
 * matching (document, topic) against any recognized CR-1 binding in the plan.
 *
 * Uses E-2C's exported `Cr1DocumentTopicBinding` shape — the ONLY coverage
 * binding shape E-2C narrows `unknown` to. Other binding shapes (or null) are
 * treated as "no per-Question predicate" (E-2C's Admit-All decision); they
 * therefore satisfy no Candidate either, which is correct.
 */
function computeCoverageSatisfied(
  row: SyntheticBankRow,
  plan: QueryPlan
): readonly CoverageRuleId[] {
  const satisfied: CoverageRuleId[] = []
  const topic = nullable(row.topic)
  if (topic === null) return satisfied // no topic → can't match any (document, topic) pair

  for (const req of plan.coverageRequirements) {
    if (req.ruleId !== 'CR-1') continue
    const binding = req.binding
    if (!isCr1Binding(binding)) continue
    const matches = binding.pairs.some(
      (p) => p.document === row.document && p.topic === topic
    )
    if (matches) satisfied.push(req.ruleId)
  }
  return satisfied
}

/** Type guard mirroring E-2C's `isCr1Binding` (not exported there; re-derived). */
function isCr1Binding(b: unknown): b is Cr1DocumentTopicBinding {
  if (b === null || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  if (o['kind'] !== 'document_topic_pairs') return false
  const pairs = o['pairs']
  if (!Array.isArray(pairs)) return false
  return pairs.every(
    (p) =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>)['document'] === 'string' &&
      typeof (p as Record<string, unknown>)['topic'] === 'string'
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 3.3 Discovery — the public entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Materialize eligible rows into immutable Candidates (Stage 3, §5).
 *
 * Pure and deterministic. Returns `ok:false` ONLY on Fatal:
 *  - A duplicate Question Code with conflicting metadata (D4 — Bank integrity).
 *  - A row whose Tier cannot be derived (D3 — should be unreachable post-filter;
 *    surfaced as `document_registry_mismatch` if the upstream invariant breaks).
 *
 * Duplicate Codes with IDENTICAL metadata are de-duplicated silently (same row
 * twice is not a conflict; it's a redundant read). This does NOT violate
 * Maximum Recall — the Candidate is still in the pool exactly once.
 *
 * @param input.rows  Eligible rows (E-2C FilterStageResult.rows).
 * @param input.ctx   Plan + Document Registry (for Tier derivation).
 */
export function discoverCandidates(
  input: { rows: readonly SyntheticBankRow[] } & { ctx: DiscoveryContext }
): DiscoveryResult {
  const { rows, ctx } = input
  const seen = new Map<string, Candidate>()
  const conflicts: FatalDiagnostic[] = []

  for (const row of rows) {
    // Identity (§5.4): Code IS identity.
    const identity: CandidateIdentity = {
      questionCode: row.questionCode,
      // v1.0 simplification: the Bank exposes no separate UUID on
      // SyntheticBankRow, so questionId carries the Code. The contract field
      // is preserved for downstream Bank lookups; only the value source is
      // simplified. Documented as a Known Limitation.
      questionId: row.questionCode,
    }

    // Duplicate-Code conflict detection (D4).
    const existing = seen.get(row.questionCode)
    if (existing !== undefined) {
      // Same Code, different metadata → conflict. Compare via stable fields.
      if (!metadataMatches(existing.metadata, row)) {
        conflicts.push(duplicateCodeFatal(row.questionCode))
        continue // skip this row; the conflict diagnostic carries the Code
      }
      // Same Code, identical metadata → silent de-dup (redundant read).
      continue
    }

    // Tier derivation (D3). Should always succeed post-filter.
    const tier = deriveTier(row, ctx.documentRegistry)
    if (tier === null) {
      conflicts.push(tierDerivationFatal(row))
      continue
    }

    // Metadata (§5.5).
    const metadata: CandidateMetadata = {
      document: row.document,
      difficulty: row.difficulty,
      topic: nullable(row.topic),
      status: row.status as QuestionStatus,
      tier,
      blueprintType: nullable(row.blueprintType),
      learningObjective: nullable(row.learningObjective),
      questionPattern: nullable(row.questionPattern),
      section: nullable(row.section),
      tags: [], // not on SyntheticBankRow v1.0; defaulted empty.
      category: null, // not on SyntheticBankRow v1.0; defaulted null.
    }

    const completeness = buildCompleteness(row)
    const confidence = buildConfidence(row)
    const { provenance } = buildProvenance(row, ctx)

    const candidate: Candidate = {
      identity,
      metadata,
      completeness,
      confidence,
      provenance,
    }
    seen.set(row.questionCode, candidate)
  }

  if (conflicts.length > 0) {
    return { ok: false, fatalDiagnostics: conflicts }
  }

  const pool: CandidatePool = {
    candidates: [...seen.values()],
    queryPlan: ctx.plan,
  }
  return { ok: true, pool }
}

/** Whether an existing Candidate's metadata matches a (re-read) row. */
function metadataMatches(meta: CandidateMetadata, row: SyntheticBankRow): boolean {
  return (
    meta.document === row.document &&
    meta.difficulty === row.difficulty &&
    meta.topic === nullable(row.topic) &&
    meta.status === (row.status as QuestionStatus) &&
    meta.blueprintType === nullable(row.blueprintType) &&
    meta.learningObjective === nullable(row.learningObjective) &&
    meta.questionPattern === nullable(row.questionPattern) &&
    meta.section === nullable(row.section)
  )
}

/** Fatal diagnostic for a duplicate-Code conflict (D4). */
function duplicateCodeFatal(code: string): FatalDiagnostic {
  return {
    category: 'internal_error',
    severity: 'Fatal',
    explanation: `Question Code '${code}' appears multiple times in the filtered Bank rows with conflicting metadata. Code is Candidate identity (§5.4); a duplicate with differing metadata is a Bank-integrity violation.`,
    recommendation: `Deduplicate or correct the Bank rows for Code '${code}' so a single coherent metadata record exists, then re-run.`,
  }
}

/** Fatal diagnostic for a Tier derivation failure (D3 — should be unreachable). */
function tierDerivationFatal(row: SyntheticBankRow): FatalDiagnostic {
  return {
    category: 'document_registry_mismatch',
    severity: 'Fatal',
    explanation: `Cannot derive Tier for Question Code '${row.questionCode}': its document '${row.document}' is not in the Document Registry. E-2C's Document Filter should have rejected this row upstream (D3 invariant).`,
    recommendation: `Ensure Discovery is invoked with E-2C's filtered output, or add '${row.document}' to the Document Registry.`,
  }
}

//////////////////////////////////////////////////////////////////////////
// STAGE 4 — POOL VALIDATION
//
// Validate the CandidatePool against every checkable Blueprint axis, detect
// shortfalls, and classify the result (Architecture §7). Validation REPORTS
// ONLY — it never repairs, expands, selects, or weakens filters (§7.5). It
// honors the §7.3 per-axis boundary: joint constraints (SUM=100, tier floors,
// the anchor rule) are the Solver's job (IG-5) and are NOT attempted here.
//
// This stage group contains:
//   - Public API   : PoolValidationResult
//   - Helpers      : severity rollup, per-axis check functions
//   - Entry point  : validatePool()
//////////////////////////////////////////////////////////////////////////

// ═══════════════════════════════════════════════════════════════════════════
// 4.1 Public API — Pool Validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 4 result. Carries the validated pool (UNCHANGED — Validation never
 * mutates per §7.5), the FROZEN ShortfallReport, and a worst-severity rollup.
 *
 * This is a thin carrier that composes ONLY FROZEN contract types
 * (`CandidatePool`, `ShortfallReport`, `GeneratorSeverity`). It introduces NO
 * new diagnostic vocabulary — no new severity, no new axis, no new entry shape.
 * It is the minimal carrier the §2.2 "Validated Pool + Shortfall Report"
 * output contract requires.
 */
export interface PoolValidationResult {
  /** The validated pool. Unchanged — Validation reports, never repairs. */
  readonly pool: CandidatePool
  /** Per-axis shortfalls detected (FROZEN contract). Empty when pool passes. */
  readonly shortfallReport: ShortfallReport
  /** Worst severity across `shortfallReport.entries`. 'Pass' when empty. */
  readonly classification: GeneratorSeverity
}

// ═══════════════════════════════════════════════════════════════════════════
// 4.2 Pool Validation — helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Severity rank for worst-severity rollup (Pass < Warning < Blocking < Fatal). */
const SEVERITY_RANK: Record<GeneratorSeverity, number> = {
  Pass: 0,
  Warning: 1,
  Blocking: 2,
  Fatal: 3,
}

/** Pick the worst (highest-rank) severity across entries; 'Pass' if empty. */
function worstSeverity(entries: readonly ShortfallEntry[]): GeneratorSeverity {
  if (entries.length === 0) return 'Pass'
  let worst: GeneratorSeverity = 'Pass'
  for (const e of entries) {
    if (SEVERITY_RANK[e.severity] > SEVERITY_RANK[worst]) {
      worst = e.severity
    }
  }
  return worst
}

/** Build a ShortfallEntry with the standard anatomy (mirrors ReaderError). */
function entry(
  axis: ShortfallEntry['axis'],
  severity: GeneratorSeverity,
  setNumber: ShortfallEntry['setNumber'],
  explanation: string,
  recommendation: string
): ShortfallEntry {
  return { axis, severity, explanation, recommendation, setNumber }
}

// ─── Per-axis checks (§7.2). Each returns zero or more ShortfallEntry. ───────

/** Empty-pool check (§11.2 Empty Pool → Blocking). */
function checkEmptyPool(pool: CandidatePool): ShortfallEntry[] {
  if (pool.candidates.length === 0) {
    return [
      entry(
        'coverage',
        'Blocking',
        null,
        'Candidate pool is empty — no Bank rows survived Metadata Filtering. The Blueprint cannot be satisfied.',
        'Inspect E-2C\'s rejection log (FilterStageResult.rejectionLog) to identify which filters removed every row; widen the Bank or relax Blueprint axes via an auditable change.'
      ),
    ]
  }
  return []
}

/**
 * CR-1 coverage completeness (§7.2 row 1; §11.2 Partial Coverage).
 * Only checked when CR-1 carries a recognized `document_topic_pairs` binding.
 * A bound (document, topic) pair with zero matching Candidates → Blocking.
 */
function checkCoverage(pool: CandidatePool): ShortfallEntry[] {
  const entries: ShortfallEntry[] = []
  for (const req of pool.queryPlan.coverageRequirements) {
    if (req.ruleId !== 'CR-1') continue
    if (!isCr1Binding(req.binding)) continue
    for (const pair of req.binding.pairs) {
      const hasMatch = pool.candidates.some(
        (c) => c.metadata.document === pair.document && c.metadata.topic === pair.topic
      )
      if (!hasMatch) {
        entries.push(
          entry(
            'coverage',
            'Blocking',
            null,
            `Mandatory coverage pair (document='${pair.document}', topic='${pair.topic}') has no Candidate in the pool. CR-1 (hard) requires every bound pair to be represented.`,
            `Add Bank Questions for (document='${pair.document}', topic='${pair.topic}'), or revise the CR-1 binding via an auditable Blueprint change.`
          )
        )
      }
    }
  }
  return entries
}

/**
 * LO completeness (§7.2 row 5). The ONLY axis whose slots carry real targets
 * (loDistribution.targets → per-Set counts, computed by E-2B). For each Set ×
 * LO slot: Pass if count > target; Warning if count == target (no headroom);
 * Blocking if count < target.
 *
 * SPECIAL CASE: a slot with `targetCount === 0` means the LO is NOT required
 * for that Set (the Blueprint分配 0% to it). Such a slot is trivially Pass
 * regardless of the Candidate count — emitting a "0 for target 0" Warning
 * would be noise (and would block the happy path). Skipped entirely.
 */
function checkLearningObjectives(pool: CandidatePool): ShortfallEntry[] {
  const entries: ShortfallEntry[] = []
  const plan = pool.queryPlan
  for (const slot of plan.learningObjectiveSlots) {
    const target = slot.targetCount
    if (target === 0) continue // LO not required for this Set; nothing to validate.
    const lo = slot.axisValue as LearningObjective
    const count = pool.candidates.filter(
      (c) => c.metadata.learningObjective === lo
    ).length
    if (count < target) {
      entries.push(
        entry(
          'learning_objective',
          'Blocking',
          slot.setNumber,
          `Set ${slot.setNumber} ${lo}: ${count} Candidate(s) available, target ${target}.`,
          `Add Bank Questions tagged ${lo}, or revise the LO distribution target via an auditable Blueprint change.`
        )
      )
    } else if (count === target) {
      // Exactly-target → reduced headroom for Ranking (§7.4 Warning).
      entries.push(
        entry(
          'learning_objective',
          'Warning',
          slot.setNumber,
          `Set ${slot.setNumber} ${lo}: exactly ${count} Candidate(s) for target ${target} — no headroom for Ranking to optimize.`,
          'Add additional Bank Questions tagged ' + lo + ' if Ranking flexibility is desired.'
        )
      )
    }
    // count > target → Pass; no entry.
  }
  return entries
}

/**
 * Document existence (covers "missing required documents"). For each permitted
 * document with zero Candidates → Warning (the document is in the Blueprint's
 * closed set but the Bank has no Questions for it).
 */
function checkDocuments(pool: CandidatePool): ShortfallEntry[] {
  const entries: ShortfallEntry[] = []
  for (const doc of pool.queryPlan.permittedDocuments) {
    const count = pool.candidates.filter((c) => c.metadata.document === doc).length
    if (count === 0) {
      entries.push(
        entry(
          'document',
          'Warning',
          null,
          `Document '${doc}' is in the Blueprint's closed set but has no Candidates in the pool.`,
          `Add Bank Questions for document '${doc}', or remove it from the Document Registry via an auditable Blueprint change.`
        )
      )
    }
  }
  return entries
}

/**
 * L1 duplicate diversity (§7.2 row 6). For each Set, count distinct
 * (topic, difficulty, pattern) tuples; if fewer than perSet, the Set cannot be
 * filled without L1 (within-set uniqueness) violations → Warning.
 *
 * "Type" in §7.2 is read as Pattern (§3.2 / §5.5 axis vocabulary). L2–L5 are
 * not checked (spec specifies L1 only at §7.2).
 */
function checkL1Diversity(pool: CandidatePool): ShortfallEntry[] {
  const entries: ShortfallEntry[] = []
  const setCount = inferSetCount(pool.queryPlan)
  // The QueryPlan does not yet expose perSet (see DEFAULT_BLUEPRINT_PER_SET's
  // architecture note). Use the Blueprint v3.0 default as the L1 reference.
  const perSet = DEFAULT_BLUEPRINT_PER_SET

  for (let set = 1; set <= setCount; set++) {
    const tuples = new Set<string>()
    for (const c of pool.candidates) {
      const topic = c.metadata.topic ?? ''
      const pattern = c.metadata.questionPattern ?? ''
      tuples.add(`${topic}\u{0000}${c.metadata.difficulty}\u{0000}${pattern}`)
    }
    if (tuples.size < perSet) {
      entries.push(
        entry(
          'duplicate_diversity',
          'Warning',
          set as BlueprintSlot['setNumber'],
          `Set ${set}: ${tuples.size} distinct (topic, difficulty, pattern) combination(s); L1 within-set uniqueness needs ≥ ${perSet}.`,
          'Add Bank Questions with more varied (topic, difficulty, pattern) combinations, or revise L1 via an auditable Blueprint change.'
        )
      )
    }
  }
  return entries
}

// ═══════════════════════════════════════════════════════════════════════════
// 4.3 Pool Validation — the public entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate the Candidate Pool against every checkable Blueprint axis (Stage 4,
 * §7). REPORTS ONLY — never repairs, expands, or weakens (§7.5). Honors the
 * §7.3 per-axis boundary: does NOT solve joint constraints (SUM=100, tier
 * floors, anchor rule — the Solver's job, IG-5).
 *
 * Pure and deterministic. The returned `pool` is the SAME pool passed in
 * (Validation never mutates). `classification` is the worst severity across
 * `shortfallReport.entries`; 'Pass' when the pool fully satisfies every axis.
 */
export function validatePool(pool: CandidatePool): PoolValidationResult {
  // Run every check; concatenate. Order is fixed for deterministic output.
  const entries: ShortfallEntry[] = [
    ...checkEmptyPool(pool),
    ...checkCoverage(pool),
    ...checkLearningObjectives(pool),
    ...checkDocuments(pool),
    ...checkL1Diversity(pool),
  ]

  const shortfallReport: ShortfallReport = { entries }
  const classification = worstSeverity(entries)

  return { pool, shortfallReport, classification }
}
