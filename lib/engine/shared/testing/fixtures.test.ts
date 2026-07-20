/**
 * lib/engine/shared/testing/fixtures.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the fixture builders.
 *
 * Source of truth: Implementation Planning v1.0 §6.1 / §2.3.
 *
 * These tests pin the fixture library's contracts — if a builder stops
 * producing fresh objects, or a default changes silently, every downstream
 * module test becomes unreliable. Catch breaks here first.
 *
 * RUN: npx jiti lib/engine/shared/testing/fixtures.test.ts
 */

import assert from 'node:assert/strict'
import {
  buildAnchorRule,
  buildAssemblyRequest,
  buildBankRow,
  buildBankRows,
  buildCoverageRule,
  buildDocument,
  buildDistributionConstraints,
  buildDuplicatePreventionRule,
  buildEmptyDocumentRegistryRequest,
  buildIdentity,
  buildInconsistentLoDistributionRequest,
  buildInfeasibleDistributionRequest,
  buildLoDistribution,
  buildRunTarget,
} from './fixtures'

// ─── atomic builders ────────────────────────────────────────────────────────

function verifies_build_document_defaults(): void {
  const d = buildDocument({ id: 'X' })
  assert.equal(d.id, 'X')
  assert.equal(d.name, 'X') // name defaults to id when not provided
  assert.equal(d.tier, 1) // tier defaults to Core
}

function verifies_build_anchor_rule_defaults_match_v3(): void {
  const a = buildAnchorRule()
  assert.equal(a.bonus, 5) // Blueprint v3.0 +5
  assert.equal(a.maxPerSet, 1) // Blueprint v3.0 ≤1 anchor/set
}

function verifies_build_distribution_constraints_defaults_match_v3(): void {
  const dc = buildDistributionConstraints()
  assert.equal(dc.sumPerSet, 100)
  assert.equal(dc.tier1Floor, 30) // Blueprint v3.0 ≥30
  assert.equal(dc.tier4Ceiling, 25) // Blueprint v3.0 ≤25
  assert.deepEqual(dc.tierMinMax[1], [30, 100])
  assert.deepEqual(dc.tierMinMax[4], [0, 25])
}

function verifies_build_lo_distribution_defaults_even_split(): void {
  const lo = buildLoDistribution()
  // Even 25% split across LO1–LO4 by default.
  assert.equal(lo.targets.LO1, 25)
  assert.equal(lo.targets.LO4, 25)
  // Canonical LO↔BlueprintType map.
  assert.deepEqual(lo.typeMap.LO1, ['Memory'])
  assert.deepEqual(lo.typeMap.LO4, ['Scenario'])
}

// ─── composite AssemblyRequest ──────────────────────────────────────────────

function verifies_build_assembly_request_has_full_v3_defaults(): void {
  const req = buildAssemblyRequest()
  // Blueprint v3.0 defaults present.
  assert.equal(req.identity.profile, 'simulation')
  assert.equal(req.runUnit, 'blueprint')
  assert.equal(req.target.sets, 5)
  assert.equal(req.target.perSet, 100)
  assert.equal(req.meta.specVersion, '1.0')
  // Default fixture carries multiple documents across all 4 tiers.
  const tiers = new Set(req.documentRegistry.map((d) => d.tier))
  assert.ok(tiers.has(1) && tiers.has(4), 'default registry spans Tiers 1–4')
  // Default fixture carries all 5 CR and all 5 L rules.
  assert.equal(req.coverageRules.length, 5)
  assert.equal(req.duplicatePrevention.length, 5)
}

function verifies_build_assembly_request_overrides_apply(): void {
  const req = buildAssemblyRequest({
    target: { sets: 3, perSet: 50 },
    exclusions: ['Q-000001'],
  })
  assert.equal(req.target.sets, 3)
  assert.equal(req.target.perSet, 50)
  assert.deepEqual(req.exclusions, ['Q-000001'])
  // Untouched defaults still present.
  assert.equal(req.meta.specVersion, '1.0')
}

function verifies_build_assembly_request_returns_fresh_object(): void {
  // Critical contract: each call returns a NEW object, so a test mutating its
  // fixture doesn't pollute the next test. Verify by mutation round-trip.
  const a = buildAssemblyRequest()
  const originalSets = a.target.sets
  a.target.sets = 999
  const b = buildAssemblyRequest()
  assert.equal(b.target.sets, originalSets, 'fixture mutation must not leak across calls')
}

// ─── edge-case (malformed) fixtures ─────────────────────────────────────────

function verifies_infeasible_distribution_is_arithmetically_impossible(): void {
  // The fixture's purpose: be arithmetically infeasible. Verify it actually is
  // (sum of tier1_floor + tier4_ceiling floor > sum_per_set before T2/T3).
  const req = buildInfeasibleDistributionRequest()
  const dc = req.distributionConstraints
  const tier1Min = dc.tierMinMax[1][0]
  const tier4Min = dc.tierMinMax[4][0]
  assert.ok(
    tier1Min + tier4Min > dc.sumPerSet,
    `expected infeasibility: ${tier1Min} + ${tier4Min} > ${dc.sumPerSet}`
  )
}

function verifies_empty_registry_request_has_zero_documents(): void {
  const req = buildEmptyDocumentRegistryRequest()
  assert.equal(req.documentRegistry.length, 0)
  // Other defaults still present (so downstream tests don't have to rebuild).
  assert.equal(req.target.sets, 5)
}

function verifies_inconsistent_lo_sums_above_100(): void {
  const req = buildInconsistentLoDistributionRequest()
  const total =
    req.loDistribution.targets.LO1 +
    req.loDistribution.targets.LO2 +
    req.loDistribution.targets.LO3 +
    req.loDistribution.targets.LO4
  assert.ok(total > 100, `expected LO sum > 100, got ${total}`)
}

// ─── synthetic Bank rows ────────────────────────────────────────────────────

function verifies_build_bank_row_defaults(): void {
  const row = buildBankRow({ questionCode: 'Q-000001' })
  assert.equal(row.questionCode, 'Q-000001')
  assert.equal(row.document, 'LAW-ACT-HED-2562')
  assert.equal(row.difficulty, 'Easy')
  assert.equal(row.status, 'Published')
  // IG-2 axes default to null (pending closure).
  assert.equal(row.blueprintType, null)
  assert.equal(row.learningObjective, null)
}

function verifies_build_bank_row_overrides_apply(): void {
  const row = buildBankRow({
    questionCode: 'Q-000042',
    document: 'LAW-PDPA-2562',
    difficulty: 'Hard',
    blueprintType: 'Concept',
  })
  assert.equal(row.questionCode, 'Q-000042')
  assert.equal(row.document, 'LAW-PDPA-2562')
  assert.equal(row.difficulty, 'Hard')
  assert.equal(row.blueprintType, 'Concept')
}

function verifies_build_bank_rows_produces_sequential_codes(): void {
  const rows = buildBankRows(3)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].questionCode, 'Q-000001')
  assert.equal(rows[1].questionCode, 'Q-000002')
  assert.equal(rows[2].questionCode, 'Q-000003')
}

function verifies_build_bank_rows_applies_uniform_overrides(): void {
  // Useful for scale tests: build 100k rows all from one Document, all Easy.
  const rows = buildBankRows(5, { document: 'LAW-ACT-HED-2562', difficulty: 'Easy' })
  for (const r of rows) {
    assert.equal(r.document, 'LAW-ACT-HED-2562')
    assert.equal(r.difficulty, 'Easy')
  }
  // Each row still has a UNIQUE sequential code.
  const codes = new Set(rows.map((r) => r.questionCode))
  assert.equal(codes.size, 5, 'codes must be unique')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'buildDocument: defaults (name←id, tier←1)', fn: verifies_build_document_defaults },
  { name: 'buildAnchorRule: defaults match Blueprint v3.0', fn: verifies_build_anchor_rule_defaults_match_v3 },
  { name: 'buildDistributionConstraints: defaults match v3.0', fn: verifies_build_distribution_constraints_defaults_match_v3 },
  { name: 'buildLoDistribution: even 25% split + canonical typeMap', fn: verifies_build_lo_distribution_defaults_even_split },
  { name: 'buildAssemblyRequest: full v3.0 defaults present', fn: verifies_build_assembly_request_has_full_v3_defaults },
  { name: 'buildAssemblyRequest: overrides apply', fn: verifies_build_assembly_request_overrides_apply },
  { name: 'buildAssemblyRequest: returns fresh object per call', fn: verifies_build_assembly_request_returns_fresh_object },
  { name: 'infeasible distribution fixture is actually infeasible', fn: verifies_infeasible_distribution_is_arithmetically_impossible },
  { name: 'empty registry fixture has zero documents', fn: verifies_empty_registry_request_has_zero_documents },
  { name: 'inconsistent LO fixture sums above 100', fn: verifies_inconsistent_lo_sums_above_100 },
  { name: 'buildBankRow: defaults', fn: verifies_build_bank_row_defaults },
  { name: 'buildBankRow: overrides apply', fn: verifies_build_bank_row_overrides_apply },
  { name: 'buildBankRows: sequential codes Q-000001..N', fn: verifies_build_bank_rows_produces_sequential_codes },
  { name: 'buildBankRows: uniform overrides + unique codes', fn: verifies_build_bank_rows_applies_uniform_overrides },
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
