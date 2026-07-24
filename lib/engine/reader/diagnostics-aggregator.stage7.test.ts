/**
 * lib/engine/reader/diagnostics-aggregator.stage7.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 7 tests — Diagnostics Aggregation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §11 (Fail Fast / Loud /
 *     Deterministic)
 *   - Runtime API Specification v1.0 §9 (Audit Model)
 *
 * RUN: npx jiti lib/engine/reader/diagnostics-aggregator.stage7.test.ts
 *
 * Coverage targets:
 *  - Merge diagnostics from multiple stages.
 *  - Deterministic ordering (stage rank → start line → category → emit order).
 *  - Severity preservation (no escalation, no suppression).
 *  - Category preservation.
 *  - Source location preservation.
 *  - Anatomy preservation (explanation + recommendation intact).
 *  - No deduplication (spec does not define dedup).
 *  - Immutability: input arrays not mutated; output is fresh + readonly.
 *  - Helpers: containsHaltDiagnostic, countBySeverity.
 */

import assert from 'node:assert/strict'
import {
  aggregateDiagnostics,
  containsHaltDiagnostic,
  countBySeverity,
} from './diagnostics-aggregator'
import type { ReaderError } from './contracts'

// ─── helpers ────────────────────────────────────────────────────────────────

function mkDiag(overrides: Partial<ReaderError> & { category: ReaderError['category'] }): ReaderError {
  return {
    location: { startLine: 1, endLine: 1 },
    severity: 'warning',
    explanation: 'expl',
    recommendation: 'rec',
    ...overrides,
  }
}

// ─── Merge from multiple stages ─────────────────────────────────────────────

function verifies_merges_diagnostics_from_multiple_stages(): void {
  const s2 = [mkDiag({ category: 'structural.missing_section', location: { startLine: 5, endLine: 5 } })]
  const s3 = [mkDiag({ category: 'semantic.smell', location: { startLine: 1, endLine: 1 } })]
  const out = aggregateDiagnostics({ stage2Schema: s2, stage3Metadata: s3 })
  assert.equal(out.length, 2)
}

function verifies_handles_missing_sources(): void {
  // When a stage was skipped, its source is omitted; the aggregator contributes
  // zero diagnostics for it (no crash, no null handling needed at call site).
  const out = aggregateDiagnostics({ stage2Schema: undefined, stage3Metadata: undefined })
  assert.equal(out.length, 0)
}

// ─── Deterministic ordering ─────────────────────────────────────────────────

function verifies_orders_by_stage_rank_first(): void {
  // Stage 2 diagnostics come before Stage 3, regardless of line numbers.
  const s2 = [mkDiag({ category: 'structural.missing_section', location: { startLine: 100, endLine: 100 } })]
  const s3 = [mkDiag({ category: 'semantic.smell', location: { startLine: 1, endLine: 1 } })]
  const out = aggregateDiagnostics({ stage2Schema: s2, stage3Metadata: s3 })
  // Stage 2 (line 100) must appear before Stage 3 (line 1) — stage rank wins.
  assert.equal(out[0]!.category, 'structural.missing_section')
  assert.equal(out[1]!.category, 'semantic.smell')
}

function verifies_orders_by_line_within_stage(): void {
  const s2 = [
    mkDiag({ category: 'structural.missing_section', location: { startLine: 50, endLine: 50 } }),
    mkDiag({ category: 'structural.duplicate_section', location: { startLine: 10, endLine: 10 } }),
  ]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  // Within Stage 2, lower line first.
  assert.equal(out[0]!.location.startLine, 10)
  assert.equal(out[1]!.location.startLine, 50)
}

function verifies_orders_by_category_on_same_line(): void {
  // Same stage, same line — category is the tie-breaker (lexicographic).
  const s3 = [
    mkDiag({ category: 'semantic.smell', location: { startLine: 5, endLine: 5 } }),
    mkDiag({ category: 'semantic.conflicting_rules', location: { startLine: 5, endLine: 5 } }),
  ]
  const out = aggregateDiagnostics({ stage3Metadata: s3 })
  // 'semantic.conflicting_rules' < 'semantic.smell' lexicographically.
  assert.equal(out[0]!.category, 'semantic.conflicting_rules')
  assert.equal(out[1]!.category, 'semantic.smell')
}

function verifies_deterministic_output_across_runs(): void {
  // Same inputs → same output, byte-for-byte. Property test for the
  // determinism contract (Reader Pipeline Principle 2).
  const sources = {
    stage2Schema: [mkDiag({ category: 'structural.missing_section', location: { startLine: 5, endLine: 5 } })],
    stage3Metadata: [mkDiag({ category: 'semantic.smell', location: { startLine: 1, endLine: 1 } })],
  }
  const a = aggregateDiagnostics(sources)
  const b = aggregateDiagnostics(sources)
  assert.deepEqual(a, b)
}

function verifies_stable_sort_preserves_emit_order_on_ties(): void {
  // Two diagnostics sharing stage + line + category — emit order is the
  // final tie-breaker so the output is deterministic.
  const s2 = [
    mkDiag({ category: 'structural.missing_section', location: { startLine: 5, endLine: 5 }, explanation: 'first' }),
    mkDiag({ category: 'structural.missing_section', location: { startLine: 5, endLine: 5 }, explanation: 'second' }),
  ]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  assert.equal(out[0]!.explanation, 'first')
  assert.equal(out[1]!.explanation, 'second')
}

// ─── Preservation (no mutation of anatomy) ──────────────────────────────────

function verifies_severity_preserved(): void {
  const s2 = [
    mkDiag({ category: 'structural.missing_section', severity: 'fatal' }),
    mkDiag({ category: 'semantic.smell', severity: 'warning' }),
    mkDiag({ category: 'semantic.conflicting_rules', severity: 'blocking' }),
  ]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  const severities = out.map((d) => d.severity)
  // All three severities present (no escalation, no suppression).
  assert.ok(severities.includes('fatal'))
  assert.ok(severities.includes('blocking'))
  assert.ok(severities.includes('warning'))
}

function verifies_category_preserved(): void {
  const s2 = [mkDiag({ category: 'structural.broken_reference' })]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  assert.equal(out[0]!.category, 'structural.broken_reference')
}

function verifies_source_location_preserved(): void {
  const s2 = [mkDiag({ category: 'structural.missing_section', location: { startLine: 42, endLine: 48 } })]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  assert.equal(out[0]!.location.startLine, 42)
  assert.equal(out[0]!.location.endLine, 48)
}

function verifies_anatomy_fields_preserved(): void {
  const s2 = [
    mkDiag({
      category: 'structural.missing_section',
      explanation: 'specific explanation text',
      recommendation: 'specific recommendation text',
    }),
  ]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  assert.equal(out[0]!.explanation, 'specific explanation text')
  assert.equal(out[0]!.recommendation, 'specific recommendation text')
}

// ─── No deduplication (spec does not define dedup) ──────────────────────────

function verifies_no_deduplication_of_identical_diagnostics(): void {
  // Two stages emitting the SAME diagnostic is informative (cross-stage
  // signal); the aggregator must NOT collapse them.
  const identical = mkDiag({ category: 'structural.missing_section', location: { startLine: 5, endLine: 5 } })
  const out = aggregateDiagnostics({
    stage2Schema: [identical],
    stage3Metadata: [{ ...identical }], // same content, different object
  })
  assert.equal(out.length, 2, 'identical diagnostics across stages must NOT be deduplicated')
}

// ─── Immutability ───────────────────────────────────────────────────────────

function verifies_input_arrays_not_mutated(): void {
  const s2 = [mkDiag({ category: 'structural.missing_section' })]
  const s2Before = [...s2]
  aggregateDiagnostics({ stage2Schema: s2 })
  assert.deepEqual(s2, s2Before, 'input array must not be mutated')
}

function verifies_output_is_fresh_array(): void {
  // The output array is a NEW array; mutating it must not affect the input.
  const s2 = [mkDiag({ category: 'structural.missing_section' })]
  const out = aggregateDiagnostics({ stage2Schema: s2 })
  assert.notEqual(out, s2, 'output must be a fresh array, not the input reference')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function verifies_contains_halt_diagnostic_detects_fatal_and_blocking(): void {
  assert.equal(containsHaltDiagnostic([mkDiag({ category: 'structural.missing_section', severity: 'fatal' })]), true)
  assert.equal(containsHaltDiagnostic([mkDiag({ category: 'semantic.conflicting_rules', severity: 'blocking' })]), true)
  assert.equal(containsHaltDiagnostic([mkDiag({ category: 'semantic.smell', severity: 'warning' })]), false)
  assert.equal(containsHaltDiagnostic([]), false)
}

function verifies_count_by_severity(): void {
  const diags = [
    mkDiag({ category: 'structural.missing_section', severity: 'fatal' }),
    mkDiag({ category: 'semantic.conflicting_rules', severity: 'blocking' }),
    mkDiag({ category: 'semantic.conflicting_rules', severity: 'blocking' }),
    mkDiag({ category: 'semantic.smell', severity: 'warning' }),
  ]
  const counts = countBySeverity(diags)
  assert.equal(counts.fatal, 1)
  assert.equal(counts.blocking, 2)
  assert.equal(counts.warning, 1)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'merges diagnostics from multiple stages', fn: verifies_merges_diagnostics_from_multiple_stages },
  { name: 'handles missing sources (skipped stages)', fn: verifies_handles_missing_sources },
  { name: 'orders by stage rank first (Stage 2 before Stage 3)', fn: verifies_orders_by_stage_rank_first },
  { name: 'orders by start line within a stage', fn: verifies_orders_by_line_within_stage },
  { name: 'orders by category on same line (tie-breaker)', fn: verifies_orders_by_category_on_same_line },
  { name: 'deterministic: same inputs → same output', fn: verifies_deterministic_output_across_runs },
  { name: 'stable sort preserves emit order on full ties', fn: verifies_stable_sort_preserves_emit_order_on_ties },
  { name: 'severity preserved (no escalation/suppression)', fn: verifies_severity_preserved },
  { name: 'category preserved', fn: verifies_category_preserved },
  { name: 'source location preserved', fn: verifies_source_location_preserved },
  { name: 'anatomy fields (explanation + recommendation) preserved', fn: verifies_anatomy_fields_preserved },
  { name: 'no deduplication of identical diagnostics (cross-stage signal)', fn: verifies_no_deduplication_of_identical_diagnostics },
  { name: 'immutability: input arrays not mutated', fn: verifies_input_arrays_not_mutated },
  { name: 'immutability: output is a fresh array', fn: verifies_output_is_fresh_array },
  { name: 'containsHaltDiagnostic: fatal + blocking halt; warning does not', fn: verifies_contains_halt_diagnostic_detects_fatal_and_blocking },
  { name: 'countBySeverity: correct tallies', fn: verifies_count_by_severity },
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
