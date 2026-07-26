/**
 * lib/engine/generator/discovery.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator E-2D — Candidate Discovery + Pool Validation tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §5 (Discovery), §7 (Validation),
 *     §9 (Provenance), §11.2 (Failure Catalogue subset), §2.3 Invariants.
 *
 * RUN: npx jiti lib/engine/generator/discovery.test.ts
 *
 * Coverage:
 *  Discovery
 *   - Candidate materialization (5 facets)
 *   - Identity / Metadata / Completeness / Confidence / Provenance mapping
 *   - Determinism, immutability, stable serialization
 *   - Duplicate-Code conflict → Fatal
 *  Pool Validation
 *   - Empty pool, CR-1 coverage, LO completeness, document existence,
 *     L1 diversity
 *   - Warning / Blocking / Fatal rollup
 *   - Pure function (no mutation)
 *  Regression
 *   - End-to-end E-2C → E-2D pipeline (runFilters → discoverCandidates →
 *     validatePool)
 *   - Default fixture materializes without Fatal
 *   - Purity (no Supabase / clock / random)
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  discoverCandidates,
  validatePool,
  type DiscoveryContext,
} from './discovery'
import { FILTER_EXECUTION_ORDER } from './contracts'
import type { CandidatePool, QueryPlan } from './contracts'
import { planQuery } from './query-planner'
import { InMemoryBankAdapter, runFilters } from './metadata-filters'
import {
  buildAssemblyRequest,
  buildBankRow,
  buildBankRows,
  buildCoverageRule,
  buildDocument,
  type SyntheticBankRow,
} from '../shared/testing/fixtures'
import { stableStringify } from '../shared/testing/determinism'

// ─── helpers ────────────────────────────────────────────────────────────────

/** A plan + registry pair where the single document's name === its id, so the
 *  default buildBankRow().document ('LAW-ACT-HED-2562') is in the registry. */
function singleDocCtx(): DiscoveryContext {
  return {
    plan: planQuery(
      buildAssemblyRequest({
        documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
      })
    ),
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
  }
}

/** Default-fixture ctx (8 docs, CR-1..CR-5 with null bindings). */
function defaultCtx(): DiscoveryContext {
  const req = buildAssemblyRequest()
  return { plan: planQuery(req), documentRegistry: req.documentRegistry }
}

/** A row that passes E-2C's filters AND carries populated IG-2 axes (so the
 *  pattern/LO filters don't treat the columns as wholly-absent). */
function okRow(code: string, overrides: Partial<SyntheticBankRow> = {}): SyntheticBankRow {
  return buildBankRow({
    questionCode: code,
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    questionPattern: 'Positive',
    learningObjective: 'LO1',
    topic: 'มาตรา 6',
    ...overrides,
  })
}

/** Build a DiscoveryContext whose plan's LO targets are explicitly set. */
function ctxWithLoTargets(targets: Partial<Record<'LO1' | 'LO2' | 'LO3' | 'LO4', number>>): DiscoveryContext {
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    loDistribution: {
      targets: { LO1: 0, LO2: 0, LO3: 0, LO4: 0, ...targets } as never,
      typeMap: {
        LO1: ['Memory'],
        LO2: ['Concept'],
        LO3: ['Procedure'],
        LO4: ['Scenario'],
      },
    },
  })
  return { plan: planQuery(req), documentRegistry: req.documentRegistry }
}

/** Materialize rows through Discovery and assert success; return the pool. */
function discoverOk(rows: readonly SyntheticBankRow[], ctx: DiscoveryContext): CandidatePool {
  const r = discoverCandidates({ rows, ctx })
  assert.equal(r.ok, true, 'expected Discovery to succeed')
  if (!r.ok) throw new Error('unreachable')
  return r.pool
}

// ═══════════════════════════════════════════════════════════════════════════
// Discovery — materialization
// ═══════════════════════════════════════════════════════════════════════════

function verifies_materialization_populates_all_five_facets(): void {
  const pool = discoverOk([okRow('Q-000001')], singleDocCtx())
  assert.equal(pool.candidates.length, 1)
  const c = pool.candidates[0]!
  // All five facets present.
  assert.ok(c.identity)
  assert.ok(c.metadata)
  assert.ok(c.completeness)
  assert.ok(c.confidence)
  assert.ok(c.provenance)
}

function verifies_identity_maps_code(): void {
  const pool = discoverOk([okRow('Q-000001')], singleDocCtx())
  const id = pool.candidates[0]!.identity
  assert.equal(id.questionCode, 'Q-000001')
  // v1.0 simplification: questionId carries the Code (no separate UUID).
  assert.equal(id.questionId, 'Q-000001')
}

function verifies_metadata_copies_bank_fields(): void {
  const pool = discoverOk(
    [okRow('Q-000001', { difficulty: 'Hard', topic: 'มาตรา 7', status: 'Published' })],
    singleDocCtx()
  )
  const m = pool.candidates[0]!.metadata
  assert.equal(m.document, 'LAW-ACT-HED-2562')
  assert.equal(m.difficulty, 'Hard')
  assert.equal(m.topic, 'มาตรา 7')
  assert.equal(m.status, 'Published')
}

function verifies_metadata_derives_tier_from_registry(): void {
  // Tier-1 document.
  const ctxT1: DiscoveryContext = {
    plan: planQuery(buildAssemblyRequest({
      documentRegistry: [buildDocument({ id: 'DOC-A', tier: 1 })],
    })),
    documentRegistry: [buildDocument({ id: 'DOC-A', tier: 1 })],
  }
  const p1 = discoverOk(
    [okRow('Q-000001', { document: 'DOC-A' })],
    ctxT1
  )
  assert.equal(p1.candidates[0]!.metadata.tier, 1)

  // Tier-4 document.
  const ctxT4: DiscoveryContext = {
    plan: planQuery(buildAssemblyRequest({
      documentRegistry: [buildDocument({ id: 'DOC-B', tier: 4 })],
    })),
    documentRegistry: [buildDocument({ id: 'DOC-B', tier: 4 })],
  }
  const p4 = discoverOk(
    [okRow('Q-000002', { document: 'DOC-B' })],
    ctxT4
  )
  assert.equal(p4.candidates[0]!.metadata.tier, 4)
}

function verifies_metadata_ig2_axes_normalized_to_null(): void {
  // SyntheticBankRow.ig2 axes are optional; Discovery normalizes undefined→null.
  const row = buildBankRow({
    questionCode: 'Q-000001',
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    // deliberately omit all IG-2 axes
  })
  const pool = discoverOk([row], singleDocCtx())
  const m = pool.candidates[0]!.metadata
  assert.equal(m.blueprintType, null)
  assert.equal(m.learningObjective, null)
  assert.equal(m.questionPattern, null)
  assert.equal(m.section, null)
}

// ─── Completeness ────────────────────────────────────────────────────────────

function verifies_completeness_complete_when_axis_present(): void {
  const pool = discoverOk(
    [okRow('Q-000001', { blueprintType: 'Memory', learningObjective: 'LO1', questionPattern: 'Positive', section: 'ม.6' })],
    singleDocCtx()
  )
  const c = pool.candidates[0]!.completeness
  assert.equal(c.blueprintType, 'complete')
  assert.equal(c.learningObjective, 'complete')
  assert.equal(c.questionPattern, 'complete')
  assert.equal(c.section, 'complete')
}

function verifies_completeness_incomplete_when_axis_missing(): void {
  const row = buildBankRow({
    questionCode: 'Q-000001',
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    // all IG-2 axes omitted → all incomplete
  })
  const pool = discoverOk([row], singleDocCtx())
  const c = pool.candidates[0]!.completeness
  assert.equal(c.blueprintType, 'incomplete')
  assert.equal(c.learningObjective, 'incomplete')
  assert.equal(c.questionPattern, 'incomplete')
  assert.equal(c.section, 'incomplete')
}

// ─── Confidence (D1) ─────────────────────────────────────────────────────────

function verifies_confidence_full_when_all_axes_present(): void {
  const pool = discoverOk(
    [okRow('Q-000001', { blueprintType: 'Memory', learningObjective: 'LO1', questionPattern: 'Positive', section: 'ม.6' })],
    singleDocCtx()
  )
  const conf = pool.candidates[0]!.confidence
  assert.equal(conf.level, 'full')
  assert.equal(conf.reason, null)
}

function verifies_confidence_reduced_when_axis_missing(): void {
  // First missing axis (in deterministic order: blueprintType first) names the reason.
  const row = buildBankRow({
    questionCode: 'Q-000001',
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    learningObjective: 'LO1', // present
    // blueprintType missing → first reason
  })
  const pool = discoverOk([row], singleDocCtx())
  const conf = pool.candidates[0]!.confidence
  assert.equal(conf.level, 'reduced')
  assert.ok(conf.reason?.includes('blueprintType'), 'reason must name the missing axis')
}

function verifies_confidence_reason_uses_deterministic_axis_order(): void {
  // Multiple axes missing → reason names the FIRST in order
  // (blueprintType → learningObjective → questionPattern → section).
  const row = buildBankRow({
    questionCode: 'Q-000001',
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    // blueprintType present; learningObjective + questionPattern + section missing.
    blueprintType: 'Memory',
  })
  const pool = discoverOk([row], singleDocCtx())
  const conf = pool.candidates[0]!.confidence
  assert.equal(conf.level, 'reduced')
  assert.ok(conf.reason?.includes('learningObjective'), 'reason must name the first missing axis in order')
}

// ─── Provenance ──────────────────────────────────────────────────────────────

function verifies_provenance_records_all_seven_filters_passed(): void {
  const pool = discoverOk([okRow('Q-000001')], singleDocCtx())
  const fp = pool.candidates[0]!.provenance.filtersPassed
  assert.deepEqual([...fp], [...FILTER_EXECUTION_ORDER])
}

function verifies_provenance_source_is_metadata_query(): void {
  const pool = discoverOk([okRow('Q-000001')], singleDocCtx())
  const src = pool.candidates[0]!.provenance.source
  assert.equal(src.kind, 'metadata_query')
  assert.ok(src.kind === 'metadata_query' && src.queryId.includes('Q-000001'))
}

function verifies_provenance_eligible_slots_include_difficulty_per_set(): void {
  // Use singleDocCtx so the row's document is in the registry (Tier derives).
  const pool = discoverOk([okRow('Q-000001', { difficulty: 'Hard' })], singleDocCtx())
  const slots = pool.candidates[0]!.provenance.eligibleSlots
  // singleDocCtx plan: 5 Sets. A difficulty slot per Set → ≥5 difficulty slots.
  const diffSlots = slots.filter((s) => s.difficulty === 'Hard')
  assert.ok(diffSlots.length >= 5, 'should have a Hard difficulty slot per Set')
  // Set numbers 1..5 each appear.
  const setNumbers = new Set(diffSlots.map((s) => s.setNumber))
  for (let s = 1; s <= 5; s++) assert.ok(setNumbers.has(s as never))
}

function verifies_provenance_eligible_slots_omit_null_pattern(): void {
  // A Candidate with null pattern → no pattern slots in eligibleSlots.
  const row = buildBankRow({
    questionCode: 'Q-000001',
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    learningObjective: 'LO1',
    // questionPattern omitted
  })
  const pool = discoverOk([row], singleDocCtx())
  const slots = pool.candidates[0]!.provenance.eligibleSlots
  assert.equal(slots.filter((s) => s.pattern !== undefined).length, 0)
}

function verifies_provenance_coverage_satisfied_for_cr1_match(): void {
  // Build a plan whose CR-1 binds (DOC-A, มาตรา 6); a row matching that pair
  // satisfies CR-1.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'DOC-A', tier: 1 })],
    coverageRules: [
      buildCoverageRule({
        id: 'CR-1',
        level: 'hard',
        binding: {
          kind: 'document_topic_pairs',
          pairs: [{ document: 'DOC-A', topic: 'มาตรา 6' }],
        },
      }),
    ],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = discoverOk(
    [okRow('Q-000001', { document: 'DOC-A', topic: 'มาตรา 6' })],
    ctx
  )
  const cov = pool.candidates[0]!.provenance.coverageSatisfied
  assert.deepEqual([...cov], ['CR-1'])
}

function verifies_provenance_coverage_empty_when_no_cr1_match(): void {
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'DOC-A', tier: 1 })],
    coverageRules: [
      buildCoverageRule({
        id: 'CR-1',
        level: 'hard',
        binding: {
          kind: 'document_topic_pairs',
          pairs: [{ document: 'DOC-A', topic: 'มาตรา 99' }],
        },
      }),
    ],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = discoverOk(
    [okRow('Q-000001', { document: 'DOC-A', topic: 'มาตรา 6' })], // different topic
    ctx
  )
  assert.equal(pool.candidates[0]!.provenance.coverageSatisfied.length, 0)
}

// ─── Determinism / Immutability / Stable serialization ──────────────────────

function verifies_discovery_is_deterministic(): void {
  const rows = [okRow('Q-000001'), okRow('Q-000002', { difficulty: 'Hard' })]
  const ctx = singleDocCtx()
  const a = discoverCandidates({ rows, ctx })
  const b = discoverCandidates({ rows, ctx })
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_discovery_does_not_mutate_input_rows(): void {
  const rows = [okRow('Q-000001'), okRow('Q-000002')]
  const before = stableStringify(rows)
  discoverCandidates({ rows, ctx: singleDocCtx() })
  discoverCandidates({ rows, ctx: singleDocCtx() }) // twice to catch accumulator mutation
  assert.equal(stableStringify(rows), before)
}

function verifies_discovery_stable_serialization(): void {
  const rows = [okRow('Q-000001')]
  const a = stableStringify(discoverCandidates({ rows, ctx: singleDocCtx() }))
  const b = stableStringify(discoverCandidates({ rows, ctx: singleDocCtx() }))
  assert.equal(a, b)
}

// ─── Duplicate-Code conflict (D4) ────────────────────────────────────────────

function verifies_duplicate_code_with_identical_metadata_is_deduplicated(): void {
  // Same Code, same metadata → not a conflict; pool has one Candidate.
  const row = okRow('Q-000001')
  const pool = discoverOk([row, { ...row }], singleDocCtx())
  assert.equal(pool.candidates.length, 1)
}

function verifies_duplicate_code_with_conflicting_metadata_is_fatal(): void {
  const base = okRow('Q-000001')
  const conflict = okRow('Q-000001', { difficulty: 'Hard' }) // same Code, different metadata
  const r = discoverCandidates({ rows: [base, conflict], ctx: singleDocCtx() })
  assert.equal(r.ok, false)
  if (r.ok) throw new Error('unreachable')
  assert.equal(r.fatalDiagnostics.length, 1)
  assert.equal(r.fatalDiagnostics[0]!.category, 'internal_error')
  assert.equal(r.fatalDiagnostics[0]!.severity, 'Fatal')
  assert.ok(r.fatalDiagnostics[0]!.explanation.includes('Q-000001'))
}

// ═══════════════════════════════════════════════════════════════════════════
// Pool Validation
// ═══════════════════════════════════════════════════════════════════════════

function verifies_validation_empty_pool_is_blocking(): void {
  const ctx = singleDocCtx()
  const emptyPool: CandidatePool = { candidates: [], queryPlan: ctx.plan }
  const r = validatePool(emptyPool)
  assert.equal(r.classification, 'Blocking')
  assert.ok(r.shortfallReport.entries.some((e) => e.axis === 'coverage' && e.severity === 'Blocking'))
}

function verifies_validation_happy_path_passes(): void {
  // A rich pool with diverse (topic, difficulty, pattern) tuples; LO targets = 0
  // so LO completeness trivially passes; the single doc is represented; L1
  // diversity (120 distinct tuples) ≥ perSet=100. Should be Pass (no entries).
  const ctx = ctxWithLoTargets({ LO1: 0, LO2: 0, LO3: 0, LO4: 0 })
  const rows: SyntheticBankRow[] = []
  for (let i = 1; i <= 120; i++) {
    const seq = String(i).padStart(6, '0')
    rows.push(
      okRow(`Q-${seq}`, {
        topic: `มาตรา ${i}`, // distinct topic per row → distinct tuple
        difficulty: (['Easy', 'Medium', 'Hard'] as const)[i % 3],
        questionPattern: (['Positive', 'Negative', 'Best Answer', 'Scenario', 'Sequence', 'Matching Concept'] as const)[i % 6],
      })
    )
  }
  const pool = discoverOk(rows, ctx)
  const r = validatePool(pool)
  assert.equal(r.classification, 'Pass')
  assert.equal(r.shortfallReport.entries.length, 0)
}

function verifies_validation_cr1_unmet_pair_is_blocking(): void {
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'DOC-A', tier: 1 })],
    coverageRules: [
      buildCoverageRule({
        id: 'CR-1',
        level: 'hard',
        binding: {
          kind: 'document_topic_pairs',
          pairs: [{ document: 'DOC-A', topic: 'มาตรา 999' }], // no row will match
        },
      }),
    ],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = discoverOk([okRow('Q-000001', { document: 'DOC-A', topic: 'มาตรา 6' })], ctx)
  const r = validatePool(pool)
  assert.equal(r.classification, 'Blocking')
  const cov = r.shortfallReport.entries.find((e) => e.axis === 'coverage')
  assert.ok(cov)
  assert.equal(cov!.severity, 'Blocking')
  assert.ok(cov!.explanation.includes('มาตรา 999'))
}

function verifies_validation_cr1_null_binding_skips_coverage_check(): void {
  // Default fixture has CR-1 with null binding → no coverage check fires even
  // though the pool is sparse. (D2: only recognized bindings are checked.)
  const ctx = defaultCtx()
  // Align the row's document to a registry NAME (the first entry's name, which
  // differs from its id in the default fixture).
  const firstName = ctx.documentRegistry[0]!.name
  const pool = discoverOk([okRow('Q-000001', { document: firstName })], ctx)
  const r = validatePool(pool)
  // No coverage entry should appear (CR-1 binding is null).
  assert.equal(
    r.shortfallReport.entries.filter((e) => e.axis === 'coverage').length,
    0
  )
}

function verifies_validation_lo_shortfall_is_blocking(): void {
  // LO1 target = 5 per Set; pool has only 1 LO1 Candidate.
  const ctx = ctxWithLoTargets({ LO1: 5 })
  const pool = discoverOk(
    [okRow('Q-000001', { learningObjective: 'LO1' })],
    ctx
  )
  const r = validatePool(pool)
  const loEntries = r.shortfallReport.entries.filter((e) => e.axis === 'learning_objective')
  assert.ok(loEntries.some((e) => e.severity === 'Blocking'))
}

function verifies_validation_lo_exactly_target_is_warning(): void {
  // LO1 target = 1 per Set; pool has exactly 1 LO1 Candidate.
  const ctx = ctxWithLoTargets({ LO1: 1 })
  const pool = discoverOk(
    [okRow('Q-000001', { learningObjective: 'LO1' })],
    ctx
  )
  const r = validatePool(pool)
  const loEntries = r.shortfallReport.entries.filter(
    (e) => e.axis === 'learning_objective' && e.severity === 'Warning'
  )
  assert.ok(loEntries.length > 0, 'exactly-target LO should be a Warning (no headroom)')
}

function verifies_validation_lo_over_target_is_pass(): void {
  // LO1 target = 1 per Set; pool has 3 LO1 Candidates → Pass (no LO entry).
  // Distinct topics so L1 diversity doesn't trip (irrelevant to this assertion
  // but keeps the entry set focused on LO).
  const ctx = ctxWithLoTargets({ LO1: 1 })
  const rows = [
    okRow('Q-000001', { learningObjective: 'LO1', topic: 'T1' }),
    okRow('Q-000002', { learningObjective: 'LO1', topic: 'T2' }),
    okRow('Q-000003', { learningObjective: 'LO1', topic: 'T3' }),
  ]
  const pool = discoverOk(rows, ctx)
  const r = validatePool(pool)
  assert.equal(
    r.shortfallReport.entries.filter((e) => e.axis === 'learning_objective').length,
    0
  )
}

function verifies_validation_missing_document_is_warning(): void {
  // Two documents in the registry; rows only for one → the other gets a Warning.
  const req = buildAssemblyRequest({
    documentRegistry: [
      buildDocument({ id: 'DOC-A', tier: 1 }),
      buildDocument({ id: 'DOC-B', tier: 2 }),
    ],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = discoverOk(
    [okRow('Q-000001', { document: 'DOC-A' })],
    ctx
  )
  const r = validatePool(pool)
  const docEntries = r.shortfallReport.entries.filter((e) => e.axis === 'document')
  assert.equal(docEntries.length, 1)
  assert.equal(docEntries[0]!.severity, 'Warning')
  assert.ok(docEntries[0]!.explanation.includes('DOC-B'))
}

function verifies_validation_l1_diversity_shortfall_is_warning(): void {
  // Few distinct (topic, difficulty, pattern) tuples → L1 Warning per Set.
  const ctx = ctxWithLoTargets({ LO1: 0, LO2: 0, LO3: 0, LO4: 0 })
  const rows = [
    okRow('Q-000001', { topic: 'T1', difficulty: 'Easy', questionPattern: 'Positive' }),
    okRow('Q-000002', { topic: 'T1', difficulty: 'Easy', questionPattern: 'Positive' }), // same tuple
  ]
  const pool = discoverOk(rows, ctx)
  const r = validatePool(pool)
  const l1 = r.shortfallReport.entries.filter((e) => e.axis === 'duplicate_diversity')
  assert.ok(l1.length > 0)
  assert.equal(l1[0]!.severity, 'Warning')
}

function verifies_validation_does_not_mutate_pool(): void {
  const ctx = singleDocCtx()
  const pool = discoverOk([okRow('Q-000001')], ctx)
  const before = stableStringify(pool)
  validatePool(pool)
  validatePool(pool)
  assert.equal(stableStringify(pool), before)
}

function verifies_validation_is_deterministic(): void {
  const ctx = singleDocCtx()
  const pool = discoverOk([okRow('Q-000001'), okRow('Q-000002')], ctx)
  const a = validatePool(pool)
  const b = validatePool(pool)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_validation_severity_rollup_picks_worst(): void {
  // Construct a pool that produces both a Warning (missing doc) and a Blocking
  // (LO shortfall). Classification must be Blocking (worse than Warning).
  const req = buildAssemblyRequest({
    documentRegistry: [
      buildDocument({ id: 'DOC-A', tier: 1 }),
      buildDocument({ id: 'DOC-B', tier: 2 }),
    ],
    loDistribution: {
      targets: { LO1: 50, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: {
        LO1: ['Memory'], LO2: ['Concept'], LO3: ['Procedure'], LO4: ['Scenario'],
      },
    },
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  // One LO1 candidate (target 50 → Blocking); DOC-B has zero (Warning).
  const pool = discoverOk([okRow('Q-000001', { document: 'DOC-A', learningObjective: 'LO1' })], ctx)
  const r = validatePool(pool)
  assert.equal(r.classification, 'Blocking')
  const severities = new Set(r.shortfallReport.entries.map((e) => e.severity))
  assert.ok(severities.has('Warning'))
  assert.ok(severities.has('Blocking'))
}

// ═══════════════════════════════════════════════════════════════════════════
// Regression — end-to-end E-2C → E-2D
// ═══════════════════════════════════════════════════════════════════════════

function verifies_end_to_end_pipeline_runFilters_discover_validate(): void {
  // runFilters → discoverCandidates → validatePool end-to-end.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    loDistribution: {
      targets: { LO1: 0, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: {
        LO1: ['Memory'], LO2: ['Concept'], LO3: ['Procedure'], LO4: ['Scenario'],
      },
    },
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const rows: SyntheticBankRow[] = []
  for (let i = 1; i <= 110; i++) {
    const seq = String(i).padStart(6, '0')
    rows.push(
      okRow(`Q-${seq}`, {
        topic: `มาตรา ${i}`,
        difficulty: (['Easy', 'Medium', 'Hard'] as const)[i % 3],
        questionPattern: (['Positive', 'Negative', 'Best Answer', 'Scenario', 'Sequence', 'Matching Concept'] as const)[i % 6],
        learningObjective: (['LO1', 'LO2', 'LO3', 'LO4'] as const)[i % 4],
      })
    )
  }
  const filterResult = runFilters(new InMemoryBankAdapter(rows), ctx.plan)
  assert.equal(filterResult.ok, true, 'E-2C filtering should succeed')
  if (!filterResult.ok) throw new Error('unreachable')

  const discovery = discoverCandidates({ rows: filterResult.rows, ctx })
  assert.equal(discovery.ok, true, 'Discovery should succeed')
  if (!discovery.ok) throw new Error('unreachable')

  const validation = validatePool(discovery.pool)
  // With rich, diverse rows and LO targets=0, classification should be Pass.
  assert.equal(validation.classification, 'Pass')
}

function verifies_default_fixture_materializes_without_fatal(): void {
  // The default buildAssemblyRequest fixture (8 docs, CR-1..CR-5 null bindings)
  // must materialize without Fatal — CR-1 null bindings skip the coverage check.
  const ctx = defaultCtx()
  // Rows must align with the default registry's NAMES (not ids). The default
  // fixture's first doc has a distinct name; align the row to it.
  const firstName = ctx.documentRegistry[0]!.name
  const pool = discoverOk(
    [okRow('Q-000001', { document: firstName })],
    ctx
  )
  assert.equal(pool.candidates.length, 1)
  assert.equal(pool.candidates[0]!.identity.questionCode, 'Q-000001')
}

function verifies_validation_does_not_emit_difficulty_or_pattern_shortfalls(): void {
  // Difficulty/Pattern slots have target=0 (Solver derives counts). Validation
  // must NOT emit difficulty/pattern entries (D2 + §7.3 boundary).
  const ctx = ctxWithLoTargets({ LO1: 0, LO2: 0, LO3: 0, LO4: 0 })
  const pool = discoverOk([okRow('Q-000001')], ctx)
  const r = validatePool(pool)
  assert.equal(
    r.shortfallReport.entries.filter((e) => e.axis === 'difficulty').length,
    0
  )
  assert.equal(
    r.shortfallReport.entries.filter((e) => e.axis === 'pattern').length,
    0
  )
}

// ─── Purity ──────────────────────────────────────────────────────────────────

function verifies_discovery_source_is_pure(): void {
  const src = readFileSync(__dirname + '/discovery.ts', 'utf8')
  const codeOnly = stripComments(src)
  assert.ok(
    !/\bfrom\s+['"][^'"]*@supabase/.test(codeOnly),
    'discovery.ts must not import from any @supabase/* package'
  )
  assert.ok(!/\bcreateClient\s*\(/.test(codeOnly), 'no createClient')
  assert.ok(!/\.rpc\s*\(/.test(codeOnly), 'no Supabase RPC')
  assert.ok(
    !/\b(Date\.now|process\.hrtime|performance\.now)\s*\(/.test(codeOnly),
    'no wall clock'
  )
  assert.ok(!/\bMath\.random\s*\(/.test(codeOnly), 'no Math.random')
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\/])\/\/[^\n]*/g, '$1')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  // Discovery — materialization
  { name: 'Discovery: materializes all 5 facets', fn: verifies_materialization_populates_all_five_facets },
  { name: 'Discovery: identity maps Code (questionId=Code v1.0)', fn: verifies_identity_maps_code },
  { name: 'Discovery: metadata copies Bank fields', fn: verifies_metadata_copies_bank_fields },
  { name: 'Discovery: metadata derives Tier from registry (tier 1 and 4)', fn: verifies_metadata_derives_tier_from_registry },
  { name: 'Discovery: metadata normalizes IG-2 undefined → null', fn: verifies_metadata_ig2_axes_normalized_to_null },
  // Completeness
  { name: 'Completeness: complete when axis present', fn: verifies_completeness_complete_when_axis_present },
  { name: 'Completeness: incomplete when axis missing', fn: verifies_completeness_incomplete_when_axis_missing },
  // Confidence
  { name: 'Confidence: full when all axes present', fn: verifies_confidence_full_when_all_axes_present },
  { name: 'Confidence: reduced when axis missing', fn: verifies_confidence_reduced_when_axis_missing },
  { name: 'Confidence: reason uses deterministic axis order', fn: verifies_confidence_reason_uses_deterministic_axis_order },
  // Provenance
  { name: 'Provenance: records all 7 filters passed', fn: verifies_provenance_records_all_seven_filters_passed },
  { name: 'Provenance: source is metadata_query', fn: verifies_provenance_source_is_metadata_query },
  { name: 'Provenance: eligible slots include difficulty per Set', fn: verifies_provenance_eligible_slots_include_difficulty_per_set },
  { name: 'Provenance: eligible slots omit null pattern', fn: verifies_provenance_eligible_slots_omit_null_pattern },
  { name: 'Provenance: coverageSatisfied for CR-1 match', fn: verifies_provenance_coverage_satisfied_for_cr1_match },
  { name: 'Provenance: coverage empty when no CR-1 match', fn: verifies_provenance_coverage_empty_when_no_cr1_match },
  // Determinism / immutability
  { name: 'Discovery: deterministic (same input → same output)', fn: verifies_discovery_is_deterministic },
  { name: 'Discovery: does not mutate input rows', fn: verifies_discovery_does_not_mutate_input_rows },
  { name: 'Discovery: stable serialization', fn: verifies_discovery_stable_serialization },
  // Duplicate-Code conflict
  { name: 'Discovery: duplicate Code identical metadata deduplicated', fn: verifies_duplicate_code_with_identical_metadata_is_deduplicated },
  { name: 'Discovery: duplicate Code conflicting metadata → Fatal', fn: verifies_duplicate_code_with_conflicting_metadata_is_fatal },
  // Pool Validation
  { name: 'Validation: empty pool → Blocking', fn: verifies_validation_empty_pool_is_blocking },
  { name: 'Validation: happy path → Pass (empty entries)', fn: verifies_validation_happy_path_passes },
  { name: 'Validation: CR-1 unmet pair → Blocking', fn: verifies_validation_cr1_unmet_pair_is_blocking },
  { name: 'Validation: CR-1 null binding skips coverage check', fn: verifies_validation_cr1_null_binding_skips_coverage_check },
  { name: 'Validation: LO shortfall → Blocking', fn: verifies_validation_lo_shortfall_is_blocking },
  { name: 'Validation: LO exactly-target → Warning', fn: verifies_validation_lo_exactly_target_is_warning },
  { name: 'Validation: LO over-target → Pass (no entry)', fn: verifies_validation_lo_over_target_is_pass },
  { name: 'Validation: missing document → Warning', fn: verifies_validation_missing_document_is_warning },
  { name: 'Validation: L1 diversity shortfall → Warning', fn: verifies_validation_l1_diversity_shortfall_is_warning },
  { name: 'Validation: does not mutate pool', fn: verifies_validation_does_not_mutate_pool },
  { name: 'Validation: deterministic', fn: verifies_validation_is_deterministic },
  { name: 'Validation: severity rollup picks worst', fn: verifies_validation_severity_rollup_picks_worst },
  // Regression
  { name: 'Regression: end-to-end runFilters → discoverCandidates → validatePool', fn: verifies_end_to_end_pipeline_runFilters_discover_validate },
  { name: 'Regression: default fixture materializes without Fatal', fn: verifies_default_fixture_materializes_without_fatal },
  { name: 'Regression: no difficulty/pattern shortfalls (target=0)', fn: verifies_validation_does_not_emit_difficulty_or_pattern_shortfalls },
  // Purity
  { name: 'Purity: discovery.ts has no supabase/clock/random', fn: verifies_discovery_source_is_pure },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
