/**
 * lib/engine/generator/metadata-filters.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator E-2C — Metadata Filters tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §4 (Metadata Filtering),
 *     §4.2 (the 7 filters), §4.3 (FIXED execution order),
 *     §4.4 (what the stage does NOT do), §2.3 Invariant #2,
 *     §11.2 (Missing Metadata is Fatal), §11.4 (No Silent Weakening)
 *   - Engineering Execution Backlog v1.0 F-2.2.1 (7 filters in fixed order)
 *     and F-2.2.2 (selectivity instrumentation — counts).
 *
 * RUN: npx jiti lib/engine/generator/metadata-filters.test.ts
 *
 * Coverage:
 *  - Per-filter correctness (one block per filter, ≥3 cases each).
 *  - runFilters applies the filters in FILTER_EXECUTION_ORDER (regression guard).
 *  - Cumulative rejection log carries the correct per-filter reason kinds.
 *  - Selectivity report (PerFilterReport) counts add up; CounterEvent emitted.
 *  - IG-2 fail-loud: a wholly-absent pattern/LO column → ok:false Fatal
 *    'missing_required_axis' (never silently skipped).
 *  - Per-row null on an IG-2 axis → ADMITTED (Maximum Recall, §2.3 / §4.4).
 *  - Determinism + immutability (rows never mutated; same input → same output).
 *  - Purity: source has no supabase / clock / random references.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  coverageFilter,
  difficultyFilter,
  documentFilter,
  exclusionFilter,
  InMemoryBankAdapter,
  type Ig2FilterOutcome,
  learningObjectiveFilter,
  patternFilter,
  runFilters,
  statusFilter,
} from './metadata-filters'
import { FILTER_EXECUTION_ORDER } from './contracts'
import type { QueryPlan } from './contracts'
import { planQuery } from './query-planner'
import {
  buildAssemblyRequest,
  buildBankRow,
  buildBankRows,
  buildCoverageRule,
  type SyntheticBankRow,
} from '../shared/testing/fixtures'
import { stableStringify } from '../shared/testing/determinism'
import { CollectorSink } from '../shared/observability'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build a QueryPlan from the default AssemblyRequest fixture. */
function defaultPlan(): QueryPlan {
  return planQuery(buildAssemblyRequest())
}

/**
 * Build a QueryPlan that permits ONE document name (the synthetic Bank default
 * id-as-name 'LAW-ACT-HED-2562'), so the default buildBankRow() rows pass the
 * Document Filter. Done by constructing a one-document AssemblyRequest and
 * letting the planner extract the name.
 */
function singleDocPlan(): QueryPlan {
  return planQuery(
    buildAssemblyRequest({
      documentRegistry: [
        // name === id so the default buildBankRow().document ('LAW-ACT-HED-2562')
        // is recognized. Tests that want a distinct name override row.document.
        { id: 'LAW-ACT-HED-2562', name: 'LAW-ACT-HED-2562', tier: 1 },
      ],
    })
  )
}

/**
 * Helper: a row that passes EVERY filter by default (published, in-document,
 * easy, AND carries populated IG-2 axes so the Pattern/LO filters do not treat
 * the columns as wholly-absent and halt Fatal). Tests that need a NULL on a
 * specific IG-2 axis override it explicitly; because some OTHER row in those
 * tests carries a populated value, the column is still "present" and the filter
 * runs (admitting the null per Maximum Recall).
 *
 * Tests that want the IG-2 Fatal path (wholly-absent column) use raw
 * `buildBankRows()` directly — which defaults both IG-2 axes to null on every
 * row — NOT this helper.
 */
function okRow(code: string, overrides: Partial<SyntheticBankRow> = {}): SyntheticBankRow {
  return buildBankRow({
    questionCode: code,
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    questionPattern: 'Positive',
    learningObjective: 'LO1',
    ...overrides,
  })
}

/**
 * Narrow an `Ig2FilterOutcome` to the success (`'result'`) branch for assertion.
 * Throws if the outcome was Fatal — tests that exercise the success path never
 * expect a Fatal, so this surfaces an unexpected Fatal as a test failure rather
 * than a silent type-error skip. The Fatal branch is covered explicitly by
 * verifies_pattern_exposes_fatal_at_standalone_level (and its LO counterpart).
 */
function requireResult(o: Ig2FilterOutcome) {
  assert.equal(o.kind, 'result', 'expected success outcome, got Fatal')
  return o
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 1: Exclusion
// ═══════════════════════════════════════════════════════════════════════════

function verifies_exclusion_drops_listed_codes(): void {
  const rows = [okRow('Q-000001'), okRow('Q-000002'), okRow('Q-000003')]
  const plan = singleDocPlan()
  // Inject exclusions through the AssemblyRequest path.
  const planWithExcl = planQuery(
    buildAssemblyRequest({
      documentRegistry: [{ id: 'LAW-ACT-HED-2562', name: 'LAW-ACT-HED-2562', tier: 1 }],
      exclusions: ['Q-000002'],
    })
  )
  const r = exclusionFilter(rows, planWithExcl)
  assert.equal(r.kept.length, 2)
  assert.equal(r.rejected.length, 1)
  assert.equal(r.rejected[0]!.code, 'Q-000002')
  assert.equal(r.rejected[0]!.reason.kind, 'excluded')
  void plan // unused; exclusionFilter doesn't read most of it
}

function verifies_exclusion_empty_set_admits_all(): void {
  const rows = buildBankRows(3)
  const r = exclusionFilter(rows, singleDocPlan())
  assert.equal(r.kept.length, 3)
  assert.equal(r.rejected.length, 0)
  assert.equal(r.stats.rowsRejected, 0)
  assert.equal(r.stats.rowsKept, 3)
}

function verifies_exclusion_stats_correct(): void {
  const rows = buildBankRows(5)
  const plan = planQuery(
    buildAssemblyRequest({
      documentRegistry: [{ id: 'LAW-ACT-HED-2562', name: 'LAW-ACT-HED-2562', tier: 1 }],
      exclusions: ['Q-000001', 'Q-000003', 'Q-000005'],
    })
  )
  const r = exclusionFilter(rows, plan)
  assert.equal(r.stats.rowsIn, 5)
  assert.equal(r.stats.rowsKept, 2)
  assert.equal(r.stats.rowsRejected, 3)
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 2: Status
// ═══════════════════════════════════════════════════════════════════════════

function verifies_status_admits_published(): void {
  const rows = [okRow('Q-000001', { status: 'Published' })]
  const r = statusFilter(rows, defaultPlan())
  assert.equal(r.kept.length, 1)
  assert.equal(r.rejected.length, 0)
}

function verifies_status_rejects_draft_and_review(): void {
  const rows = [
    okRow('Q-000001', { status: 'Draft' }),
    okRow('Q-000002', { status: 'Review' }),
    okRow('Q-000003', { status: 'Published' }),
  ]
  const r = statusFilter(rows, defaultPlan())
  assert.equal(r.kept.length, 1)
  assert.equal(r.rejected.length, 2)
  assert.equal(r.rejected[0]!.reason.kind, 'status')
  assert.equal(r.rejected[0]!.reason.kind === 'status' && r.rejected[0]!.reason.status, 'Draft')
  assert.equal(r.rejected[1]!.reason.kind === 'status' && r.rejected[1]!.reason.status, 'Review')
}

function verifies_status_rejects_unknown_status_string(): void {
  // SyntheticBankRow.status is a free string; an unknown value is still rejected.
  const rows = [okRow('Q-000001', { status: 'Garbage' as SyntheticBankRow['status'] })]
  const r = statusFilter(rows, defaultPlan())
  assert.equal(r.kept.length, 0)
  assert.equal(r.rejected.length, 1)
  assert.equal(r.rejected[0]!.reason.kind, 'status')
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 3: Document
// ═══════════════════════════════════════════════════════════════════════════

function verifies_document_admits_permitted_name(): void {
  // singleDocPlan permits the name 'LAW-ACT-HED-2562'.
  const rows = [
    okRow('Q-000001', { document: 'LAW-ACT-HED-2562' }),
    okRow('Q-000002', { document: 'SOME-OTHER-DOC' }),
  ]
  const r = documentFilter(rows, singleDocPlan())
  assert.equal(r.kept.length, 1)
  assert.equal(r.kept[0]!.questionCode, 'Q-000001')
  assert.equal(r.rejected.length, 1)
  assert.equal(r.rejected[0]!.reason.kind, 'document')
  assert.equal(
    r.rejected[0]!.reason.kind === 'document' && r.rejected[0]!.reason.document,
    'SOME-OTHER-DOC'
  )
}

function verifies_document_empty_registry_rejects_all(): void {
  // Empty closed set → no row qualifies (closed-set semantics, not Fatal).
  const plan = planQuery(buildAssemblyRequest({ documentRegistry: [] }))
  const rows = buildBankRows(3)
  const r = documentFilter(rows, plan)
  assert.equal(r.kept.length, 0)
  assert.equal(r.rejected.length, 3)
  assert.equal(r.stats.rowsRejected, 3)
}

function verifies_document_matches_name_not_id_semantics(): void {
  // When the registry entry's NAME differs from its ID, the Document Filter
  // matches row.document against the NAME, not the id.
  const plan = planQuery(
    buildAssemblyRequest({
      documentRegistry: [{ id: 'ID-001', name: 'Pretty Name', tier: 1 }],
    })
  )
  const rows = [
    okRow('Q-000001', { document: 'ID-001' }), // matches the id — should be REJECTED
    okRow('Q-000002', { document: 'Pretty Name' }), // matches the name — should be KEPT
  ]
  const r = documentFilter(rows, plan)
  assert.equal(r.kept.length, 1)
  assert.equal(r.kept[0]!.questionCode, 'Q-000002')
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 4: Coverage
// ═══════════════════════════════════════════════════════════════════════════

function verifies_coverage_null_binding_admits_all(): void {
  // The default fixture builds all of CR-1..CR-5 with binding: null. Under the
  // approved "Admit all (Maximum Recall)" decision, every row passes.
  const rows = buildBankRows(4)
  const r = coverageFilter(rows, defaultPlan())
  assert.equal(r.kept.length, 4)
  assert.equal(r.rejected.length, 0)
}

function verifies_coverage_cr1_binding_admits_matching_pairs(): void {
  // Build a plan where CR-1 carries a concrete document_topic_pairs binding.
  const plan = planQuery(
    buildAssemblyRequest({
      documentRegistry: [{ id: 'LAW-ACT-HED-2562', name: 'LAW-ACT-HED-2562', tier: 1 }],
      coverageRules: [
        buildCoverageRule({
          id: 'CR-1',
          level: 'hard',
          binding: {
            kind: 'document_topic_pairs',
            pairs: [
              { document: 'LAW-ACT-HED-2562', topic: 'มาตรา 6' },
              { document: 'LAW-ACT-HED-2562', topic: 'มาตรา 7' },
            ],
          },
        }),
      ],
    })
  )
  const rows = [
    okRow('Q-000001', { topic: 'มาตรา 6' }), // matches pair 0 → kept
    okRow('Q-000002', { topic: 'มาตรา 7' }), // matches pair 1 → kept
    okRow('Q-000003', { topic: 'มาตรา 99' }), // no match → rejected
    okRow('Q-000004', { topic: null }), // null topic → rejected (can't match)
  ]
  const r = coverageFilter(rows, plan)
  assert.equal(r.kept.length, 2)
  const keptCodes = r.kept.map((x) => x.questionCode).sort()
  assert.deepEqual(keptCodes, ['Q-000001', 'Q-000002'])
  assert.equal(r.rejected.length, 2)
  assert.equal(r.rejected[0]!.reason.kind, 'coverage')
}

function verifies_coverage_unknown_binding_shape_admits_all(): void {
  // A binding shape the filter has not been taught → treated as null → admit all.
  const plan = planQuery(
    buildAssemblyRequest({
      coverageRules: [
        buildCoverageRule({
          id: 'CR-2', // CR-2 has no recognized binding shape in E-2C
          level: 'hard',
          binding: { something: 'unrecognized' },
        }),
      ],
    })
  )
  const rows = buildBankRows(3)
  const r = coverageFilter(rows, plan)
  assert.equal(r.kept.length, 3)
  assert.equal(r.rejected.length, 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 5: Difficulty
// ═══════════════════════════════════════════════════════════════════════════

function verifies_difficulty_admits_three_enum_values(): void {
  const rows = [
    okRow('Q-000001', { difficulty: 'Easy' }),
    okRow('Q-000002', { difficulty: 'Medium' }),
    okRow('Q-000003', { difficulty: 'Hard' }),
  ]
  const r = difficultyFilter(rows, defaultPlan())
  assert.equal(r.kept.length, 3)
  assert.equal(r.rejected.length, 0)
}

function verifies_difficulty_rejects_out_of_enum(): void {
  // Cast an out-of-enum value through the loose SyntheticBankRow type.
  const rows = [
    okRow('Q-000001', { difficulty: 'Extra' as SyntheticBankRow['difficulty'] }),
    okRow('Q-000002', { difficulty: 'Easy' }),
  ]
  const r = difficultyFilter(rows, defaultPlan())
  assert.equal(r.kept.length, 1)
  assert.equal(r.rejected.length, 1)
  assert.equal(r.rejected[0]!.reason.kind, 'difficulty')
  assert.equal(
    r.rejected[0]!.reason.kind === 'difficulty' && r.rejected[0]!.reason.difficulty,
    'Extra'
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 6: Pattern (IG-2)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_pattern_admits_valid_values(): void {
  const rows = [
    okRow('Q-000001', { questionPattern: 'Positive' }),
    okRow('Q-000002', { questionPattern: 'Matching Concept' }), // two-word form
  ]
  const r = requireResult(patternFilter(rows, defaultPlan()))
  assert.equal(r.kept.length, 2)
  assert.equal(r.rejected.length, 0)
}

function verifies_pattern_admits_null_axis(): void {
  // Per-row null → ADMIT (Maximum Recall). Incompleteness is a downstream
  // Reduced-Confidence signal, never a filter rejection.
  const rows = [
    okRow('Q-000001', { questionPattern: null }),
    okRow('Q-000002', { questionPattern: 'Positive' }),
  ]
  const r = requireResult(patternFilter(rows, defaultPlan()))
  assert.equal(r.kept.length, 2)
}

function verifies_pattern_rejects_out_of_enum(): void {
  const rows = [
    okRow('Q-000001', { questionPattern: 'Bare Matching' as SyntheticBankRow['questionPattern'] }),
    okRow('Q-000002', { questionPattern: 'Positive' }),
  ]
  const r = requireResult(patternFilter(rows, defaultPlan()))
  assert.equal(r.kept.length, 1)
  assert.equal(r.rejected.length, 1)
  assert.equal(r.rejected[0]!.reason.kind, 'pattern')
}

/**
 * Session 6.26A refinement: the standalone patternFilter now PRESERVES the
 * IG-2 Fatal outcome (previously it was silently flattened to empty kept[]).
 * A wholly-absent pattern column surfaces as `{kind:'fatal', axis}` at the
 * standalone API level — exactly the outcome runFilters turns into the
 * `ok:false` FilterStageResult. This is strictly better coverage; runtime
 * behaviour is unchanged (runFilters still halts Fatal on the same condition).
 */
function verifies_pattern_exposes_fatal_at_standalone_level(): void {
  const rows = buildBankRows(2) // default: questionPattern null on every row
  const o = patternFilter(rows, defaultPlan())
  assert.equal(o.kind, 'fatal')
  if (o.kind !== 'fatal') return
  assert.equal(o.axis, 'question_pattern')
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter 7: Learning Objective (IG-2)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_lo_admits_valid_values(): void {
  const rows = [
    okRow('Q-000001', { learningObjective: 'LO1' }),
    okRow('Q-000002', { learningObjective: 'LO4' }),
  ]
  const r = requireResult(learningObjectiveFilter(rows, defaultPlan()))
  assert.equal(r.kept.length, 2)
}

function verifies_lo_admits_null_axis(): void {
  const rows = [
    okRow('Q-000001', { learningObjective: null }),
    okRow('Q-000002', { learningObjective: 'LO2' }),
  ]
  const r = requireResult(learningObjectiveFilter(rows, defaultPlan()))
  assert.equal(r.kept.length, 2)
}

function verifies_lo_rejects_out_of_enum(): void {
  const rows = [
    okRow('Q-000001', { learningObjective: 'LO9' as SyntheticBankRow['learningObjective'] }),
    okRow('Q-000002', { learningObjective: 'LO1' }),
  ]
  const r = requireResult(learningObjectiveFilter(rows, defaultPlan()))
  assert.equal(r.kept.length, 1)
  assert.equal(r.rejected[0]!.reason.kind, 'learning_objective')
}

/**
 * Session 6.26A refinement: the standalone learningObjectiveFilter now
 * PRESERVES the IG-2 Fatal outcome. See verifies_pattern_exposes_fatal_….
 */
function verifies_lo_exposes_fatal_at_standalone_level(): void {
  // Populate the pattern column so the LO filter is what would Fatal — every
  // row's learningObjective is null (the buildBankRows default).
  const rows = buildBankRows(2, { questionPattern: 'Positive' })
  const o = learningObjectiveFilter(rows, defaultPlan())
  assert.equal(o.kind, 'fatal')
  if (o.kind !== 'fatal') return
  assert.equal(o.axis, 'learning_objective')
}

// ═══════════════════════════════════════════════════════════════════════════
// Orchestrator: runFilters
// ═══════════════════════════════════════════════════════════════════════════

function verifies_runFilters_applies_in_fixed_order(): void {
  // Regression guard (F-2.2.2.2): perFilter must list filters in
  // FILTER_EXECUTION_ORDER exactly. Rows carry populated IG-2 axes so the run
  // reaches all 7 filters (rather than halting Fatal on a wholly-absent axis).
  const adapter = new InMemoryBankAdapter(
    buildBankRows(3, { questionPattern: 'Positive', learningObjective: 'LO1' })
  )
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, true)
  if (!r.ok) return
  const order = r.perFilter.map((p) => p.filterId)
  assert.deepEqual(order, [...FILTER_EXECUTION_ORDER])
}

function verifies_runFilters_happy_path_keeps_all(): void {
  // Default fixture rows: published, in-document, easy, null IG-2 axes.
  // All filters admit them (null IG-2 axes are admitted per Maximum Recall).
  const rows = [
    okRow('Q-000001'),
    okRow('Q-000002'),
    okRow('Q-000003'),
  ]
  const adapter = new InMemoryBankAdapter(rows)
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.rows.length, 3)
  assert.equal(r.rejectionLog.length, 0)
}

function verifies_runFilters_rejection_log_accumulates(): void {
  // Mix rows that each fail a different filter; the cumulative log should carry
  // the right per-filter reason kinds.
  const rows = [
    okRow('Q-000001', { status: 'Draft' }), // status
    okRow('Q-000002', { document: 'NOT-PERMITTED' }), // document
    okRow('Q-000003', { difficulty: 'Weird' as SyntheticBankRow['difficulty'] }), // difficulty
    okRow('Q-000004'), // passes everything
  ]
  const adapter = new InMemoryBankAdapter(rows)
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0]!.questionCode, 'Q-000004')
  // Rejection log kinds (order = filter execution order).
  const kinds = r.rejectionLog.map((e) => e.reason.kind)
  assert.deepEqual(kinds, ['status', 'document', 'difficulty'])
}

function verifies_runFilters_selectivity_counts_add_up(): void {
  const rows = [
    okRow('Q-000001', { status: 'Draft' }),
    okRow('Q-000002', { status: 'Draft' }),
    okRow('Q-000003'),
    okRow('Q-000004'),
  ]
  const adapter = new InMemoryBankAdapter(rows)
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, true)
  if (!r.ok) return
  const totalRejected = r.perFilter.reduce((sum, p) => sum + p.stats.rowsRejected, 0)
  // 2 rejected by status; the rest admit all (no further reduction). The
  // cumulative rejection log length must equal the sum of per-filter rejections.
  assert.equal(totalRejected, r.rejectionLog.length)
  assert.equal(totalRejected, 2)
}

function verifies_runFilters_emits_counter_per_reducing_filter(): void {
  const rows = [
    okRow('Q-000001', { status: 'Draft' }),
    okRow('Q-000002', { document: 'NOT-PERMITTED' }),
    okRow('Q-000003'), // survives
  ]
  const sink = new CollectorSink()
  const adapter = new InMemoryBankAdapter(rows)
  runFilters(adapter, singleDocPlan(), sink)
  const reductions = sink.counters.filter(
    (c) => c.name === 'generator.filter.rows_reduced'
  )
  // status dropped 1, document dropped 1 → 2 counter events.
  assert.equal(reductions.length, 2)
  const filterLabels = reductions.map((c) => c.labels?.filter).sort()
  assert.deepEqual(filterLabels, ['document', 'status'])
  // Each counter carries the number of rows reduced.
  assert.equal(reductions[0]!.value, 1)
}

function verifies_runFilters_noop_sink_default_does_not_throw(): void {
  const rows = buildBankRows(3, { questionPattern: 'Positive', learningObjective: 'LO1' })
  const adapter = new InMemoryBankAdapter(rows)
  // No sink argument → defaults to noopSink. Must not throw.
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, true)
}

// ═══════════════════════════════════════════════════════════════════════════
// IG-2 fail-loud
// ═══════════════════════════════════════════════════════════════════════════

function verifies_runFilters_fatal_when_pattern_column_absent(): void {
  // Every row has questionPattern === null (the field's default). Per §11.2 the
  // Generator halts Fatal — it must NOT silently skip the Pattern Filter.
  const rows = buildBankRows(3) // default: questionPattern null/undefined
  const adapter = new InMemoryBankAdapter(rows)
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.fatalDiagnostics.length, 1)
  assert.equal(r.fatalDiagnostics[0]!.category, 'missing_required_axis')
  assert.equal(r.fatalDiagnostics[0]!.severity, 'Fatal')
  assert.ok(
    r.fatalDiagnostics[0]!.explanation.includes('question_pattern'),
    'Fatal explanation must name the missing axis'
  )
}

function verifies_runFilters_fatal_when_lo_column_absent(): void {
  // Every row has learningObjective === null. (Pattern filter runs first in
  // execution order and would also Fatal — so populate the pattern column to
  // isolate the LO Fatal.)
  const rows = buildBankRows(3, { questionPattern: 'Positive' })
  const adapter = new InMemoryBankAdapter(rows)
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.fatalDiagnostics[0]!.category, 'missing_required_axis')
  assert.ok(
    r.fatalDiagnostics[0]!.explanation.includes('learning_objective'),
    'Fatal explanation must name the missing axis'
  )
}

function verifies_runFilters_partial_axis_presence_is_not_fatal(): void {
  // At least one row has a populated pattern → the column is "present"; the
  // filter runs, nulls are admitted, populated values are enum-checked. NOT Fatal.
  const rows = [
    okRow('Q-000001', { questionPattern: null }),
    okRow('Q-000002', { questionPattern: 'Positive' }),
    okRow('Q-000003', { learningObjective: 'LO1' }), // both axes populated
  ]
  const adapter = new InMemoryBankAdapter(rows)
  const r = runFilters(adapter, singleDocPlan())
  assert.equal(r.ok, true)
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism + immutability
// ═══════════════════════════════════════════════════════════════════════════

function verifies_runFilters_is_deterministic(): void {
  const rows = [
    okRow('Q-000001', { questionPattern: 'Positive', learningObjective: 'LO1' }),
    okRow('Q-000002', { status: 'Draft' }), // rejected
    okRow('Q-000003', { questionPattern: null, learningObjective: 'LO2' }),
  ]
  const plan = singleDocPlan()
  const a = runFilters(new InMemoryBankAdapter(rows), plan)
  const b = runFilters(new InMemoryBankAdapter(rows), plan)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_runFilters_does_not_mutate_input_rows(): void {
  const rows = [
    okRow('Q-000001', { questionPattern: 'Positive', learningObjective: 'LO1' }),
    okRow('Q-000002', { status: 'Draft' }),
  ]
  const before = stableStringify(rows)
  runFilters(new InMemoryBankAdapter(rows), singleDocPlan())
  runFilters(new InMemoryBankAdapter(rows), singleDocPlan()) // twice to catch accumulator mutation
  const after = stableStringify(rows)
  assert.equal(after, before, 'input rows must not be mutated')
}

function verifies_filter_fns_do_not_mutate_input_rows(): void {
  // Spot-check each standalone filter for non-mutation.
  const rows = buildBankRows(4, { questionPattern: 'Positive', learningObjective: 'LO1' })
  const before = stableStringify(rows)
  const plan = singleDocPlan()
  exclusionFilter(rows, plan)
  statusFilter(rows, plan)
  documentFilter(rows, plan)
  coverageFilter(rows, plan)
  difficultyFilter(rows, plan)
  patternFilter(rows, plan)
  learningObjectiveFilter(rows, plan)
  assert.equal(stableStringify(rows), before)
}

// ═══════════════════════════════════════════════════════════════════════════
// Purity: source contains no Supabase / clock / random references
// ═══════════════════════════════════════════════════════════════════════════

function verifies_metadata_filters_source_is_pure(): void {
  const src = readFileSync(__dirname + '/metadata-filters.ts', 'utf8')
  // Purity is about EXECUTABLE code paths — imports, function calls, and
  // identifiers that actually couple the module to Supabase, the wall clock,
  // or nondeterministic RNG. Documentation comments legitimately mention these
  // tokens while explaining why they are absent. We therefore:
  //   (a) strip /* ... */ and // comments, and
  //   (b) assert on the resulting code-only body.
  // This matches what a Reviewer or future linter would care about: does the
  // module IMPORT or CALL a forbidden thing — not does its prose mention one.
  const codeOnly = stripComments(src)
  assert.ok(
    !/\bfrom\s+['"][^'"]*@supabase/.test(codeOnly),
    'metadata-filters.ts must not import from any @supabase/* package (README §2: adapter is injected)'
  )
  assert.ok(
    !/\bcreateClient\s*\(/.test(codeOnly),
    'metadata-filters.ts must not call createClient (README §2: adapter is injected)'
  )
  assert.ok(
    !/\.rpc\s*\(/.test(codeOnly),
    'metadata-filters.ts must not make Supabase RPC calls (README §2)'
  )
  assert.ok(
    !/\b(Date\.now|process\.hrtime|performance\.now)\s*\(/.test(codeOnly),
    'metadata-filters.ts must not read the wall clock (README §1 determinism)'
  )
  assert.ok(
    !/\bMath\.random\s*\(/.test(codeOnly),
    'metadata-filters.ts must not use Math.random (README §1 determinism)'
  )
}

/**
 * Strip // line comments and /* block comments from TS source. Naive but
 * sufficient for the purity check (we are scanning for forbidden tokens, not
 * parsing). Does not alter string literals — a string like 'createClient'
 * would survive, which is intentional: such a string would only exist in
 * executable code referencing the API, which IS the thing we forbid.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\/])\/\/[^\n]*/g, '$1')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  // Exclusion
  { name: 'exclusion: drops listed Codes', fn: verifies_exclusion_drops_listed_codes },
  { name: 'exclusion: empty set admits all', fn: verifies_exclusion_empty_set_admits_all },
  { name: 'exclusion: stats correct', fn: verifies_exclusion_stats_correct },
  // Status
  { name: 'status: admits Published', fn: verifies_status_admits_published },
  { name: 'status: rejects Draft/Review', fn: verifies_status_rejects_draft_and_review },
  { name: 'status: rejects unknown status string', fn: verifies_status_rejects_unknown_status_string },
  // Document
  { name: 'document: admits permitted name', fn: verifies_document_admits_permitted_name },
  { name: 'document: empty registry rejects all (closed set)', fn: verifies_document_empty_registry_rejects_all },
  { name: 'document: matches NAME not id', fn: verifies_document_matches_name_not_id_semantics },
  // Coverage
  { name: 'coverage: null binding admits all (Maximum Recall)', fn: verifies_coverage_null_binding_admits_all },
  { name: 'coverage: CR-1 binding admits matching pairs', fn: verifies_coverage_cr1_binding_admits_matching_pairs },
  { name: 'coverage: unknown binding shape admits all', fn: verifies_coverage_unknown_binding_shape_admits_all },
  // Difficulty
  { name: 'difficulty: admits Easy/Medium/Hard', fn: verifies_difficulty_admits_three_enum_values },
  { name: 'difficulty: rejects out-of-enum', fn: verifies_difficulty_rejects_out_of_enum },
  // Pattern
  { name: 'pattern: admits valid values (incl. two-word Matching Concept)', fn: verifies_pattern_admits_valid_values },
  { name: 'pattern: admits null axis (Maximum Recall)', fn: verifies_pattern_admits_null_axis },
  { name: 'pattern: rejects out-of-enum', fn: verifies_pattern_rejects_out_of_enum },
  { name: 'pattern (6.26A): standalone filter preserves the Fatal outcome', fn: verifies_pattern_exposes_fatal_at_standalone_level },
  // Learning Objective
  { name: 'LO: admits LO1..LO4', fn: verifies_lo_admits_valid_values },
  { name: 'LO: admits null axis (Maximum Recall)', fn: verifies_lo_admits_null_axis },
  { name: 'LO: rejects out-of-enum', fn: verifies_lo_rejects_out_of_enum },
  { name: 'LO (6.26A): standalone filter preserves the Fatal outcome', fn: verifies_lo_exposes_fatal_at_standalone_level },
  // Orchestrator
  { name: 'runFilters: applies filters in FILTER_EXECUTION_ORDER (regression guard)', fn: verifies_runFilters_applies_in_fixed_order },
  { name: 'runFilters: happy path keeps all default-fixture rows', fn: verifies_runFilters_happy_path_keeps_all },
  { name: 'runFilters: rejection log accumulates per-filter kinds in order', fn: verifies_runFilters_rejection_log_accumulates },
  { name: 'runFilters: selectivity counts add up to rejection log length', fn: verifies_runFilters_selectivity_counts_add_up },
  { name: 'runFilters: emits one counter per reducing filter', fn: verifies_runFilters_emits_counter_per_reducing_filter },
  { name: 'runFilters: noop sink default does not throw', fn: verifies_runFilters_noop_sink_default_does_not_throw },
  // IG-2 fail-loud
  { name: 'IG-2 fail-loud: wholly-absent pattern column → Fatal missing_required_axis', fn: verifies_runFilters_fatal_when_pattern_column_absent },
  { name: 'IG-2 fail-loud: wholly-absent LO column → Fatal missing_required_axis', fn: verifies_runFilters_fatal_when_lo_column_absent },
  { name: 'IG-2: partial axis presence is NOT fatal (nulls admitted)', fn: verifies_runFilters_partial_axis_presence_is_not_fatal },
  // Determinism + immutability
  { name: 'determinism: same input → same FilterStageResult', fn: verifies_runFilters_is_deterministic },
  { name: 'immutability: runFilters does not mutate input rows', fn: verifies_runFilters_does_not_mutate_input_rows },
  { name: 'immutability: standalone filter fns do not mutate input rows', fn: verifies_filter_fns_do_not_mutate_input_rows },
  // Purity
  { name: 'purity: source has no supabase/clock/random references', fn: verifies_metadata_filters_source_is_pure },
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
