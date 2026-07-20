/**
 * lib/engine/shared/observability.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the observability primitives.
 *
 * Source of truth: Runtime API v1.0 §11 (Observability).
 *
 * Verifies the sink contract: events flow through, the collector aggregates
 * correctly, and the no-op sink truly is a no-op (so module code never has to
 * null-check).
 *
 * RUN: npx jiti lib/engine/shared/observability.test.ts
 */

import assert from 'node:assert/strict'
import {
  noopSink,
  CollectorSink,
  moduleTiming,
  errorCounter,
  type ObservabilityEvent,
} from './observability'

// ─── noopSink ───────────────────────────────────────────────────────────────

function verifies_noop_sink_does_not_throw(): void {
  // The contract: observability is best-effort and must never break a run.
  // noopSink is the default fallback; it must accept anything.
  const events: ObservabilityEvent[] = [
    { module: 'Reader', durationMs: 12, runId: 'r1' },
    { name: 'error.by_category', labels: { category: 'Validation Error' }, value: 1, runId: 'r1' },
    { name: 'draft.duplicate_rejection', value: 1, runId: 'r2' },
  ]
  for (const e of events) {
    assert.doesNotThrow(() => noopSink.emit(e))
  }
}

// ─── CollectorSink ──────────────────────────────────────────────────────────

function verifies_collector_records_in_order(): void {
  const sink = new CollectorSink()
  sink.emit(moduleTiming('Reader', 10, 'r1'))
  sink.emit(errorCounter('Validation Error', 'r1'))
  sink.emit(moduleTiming('Generator', 25, 'r1'))

  assert.equal(sink.events.length, 3)
  assert.equal(sink.timings.length, 2)
  assert.equal(sink.counters.length, 1)
  // Order preserved (emission order, not re-sorted).
  assert.equal(sink.timings[0].module, 'Reader')
  assert.equal(sink.timings[1].module, 'Generator')
}

function verifies_collector_counter_sum_aggregates_by_name(): void {
  const sink = new CollectorSink()
  // Three errors of the same category → sum 3.
  sink.emit(errorCounter('Validation Error', 'r1'))
  sink.emit(errorCounter('Validation Error', 'r1'))
  sink.emit(errorCounter('Blueprint Error', 'r1'))

  assert.equal(sink.counterSum('error.by_category'), 3)
  assert.equal(
    sink.counterSum('error.by_category', { category: 'Validation Error' }),
    2
  )
  assert.equal(
    sink.counterSum('error.by_category', { category: 'Blueprint Error' }),
    1
  )
  // Unknown name → 0 (not undefined, not throw).
  assert.equal(sink.counterSum('nonexistent'), 0)
}

function verifies_collector_counter_sum_respects_value(): void {
  const sink = new CollectorSink()
  // An event that reports a non-1 value (e.g. "1000 rows reduced by this filter").
  sink.emit({ name: 'generator.filter.rows_reduced', value: 1000, runId: 'r1' })
  sink.emit({ name: 'generator.filter.rows_reduced', value: 250, runId: 'r1' })
  assert.equal(sink.counterSum('generator.filter.rows_reduced'), 1250)
}

function verifies_collector_counter_sum_unlabeled_event(): void {
  // An event without labels must match a no-label filter and not match any
  // label-filter.
  const sink = new CollectorSink()
  sink.emit({ name: 'draft.duplicate_rejection', value: 1, runId: 'r1' })
  assert.equal(sink.counterSum('draft.duplicate_rejection'), 1)
  assert.equal(
    sink.counterSum('draft.duplicate_rejection', { anything: 'x' }),
    0
  )
}

// ─── event factories ────────────────────────────────────────────────────────

function verifies_module_timing_carries_identity(): void {
  const e = moduleTiming('Solver', 412, 'run-abc')
  assert.equal(e.module, 'Solver')
  assert.equal(e.durationMs, 412)
  assert.equal(e.runId, 'run-abc')
}

function verifies_error_counter_uses_canonical_name_and_category(): void {
  // The category label MUST be the canonical ErrorCategory string — this is
  // what the monitoring dashboard keys on (Runtime API §11 "error rates by
  // category"). A typo here would silently fragment the metric.
  const e = errorCounter('Constraint Error', 'r1')
  assert.equal(e.name, 'error.by_category')
  assert.equal(e.labels?.category, 'Constraint Error')
  assert.equal(e.value, 1)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'noopSink: accepts all events without throwing', fn: verifies_noop_sink_does_not_throw },
  { name: 'CollectorSink: records events in emission order', fn: verifies_collector_records_in_order },
  { name: 'CollectorSink: counterSum aggregates by name', fn: verifies_collector_counter_sum_aggregates_by_name },
  { name: 'CollectorSink: counterSum respects value', fn: verifies_collector_counter_sum_respects_value },
  { name: 'CollectorSink: counterSum on unlabeled event', fn: verifies_collector_counter_sum_unlabeled_event },
  { name: 'moduleTiming: carries identity', fn: verifies_module_timing_carries_identity },
  { name: 'errorCounter: canonical name and category label', fn: verifies_error_counter_uses_canonical_name_and_category },
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
