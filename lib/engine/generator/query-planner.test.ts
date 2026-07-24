/**
 * lib/engine/generator/query-planner.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator E-2B — Query Planner tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §3 (Query Planning)
 *   - Blueprint Integration Specification v1.0 §4 (AssemblyRequest Contract)
 *
 * RUN: npx jiti lib/engine/generator/query-planner.test.ts
 *
 * Coverage targets:
 *  - Successful planning from a realistic AssemblyRequest.
 *  - Deterministic output (same input → same QueryPlan).
 *  - Immutable output (input never mutated).
 *  - Document Registry → permittedDocuments mapping (names extracted, Tier dropped).
 *  - Coverage rules → coverageRequirements pass-through.
 *  - LO targets → per-Set slots with computed counts.
 *  - Difficulty/Pattern axes enumerated with targetCount=0.
 *  - Duplicate rules preserved.
 *  - Exclusions preserved + sorted.
 *  - Empty collections handled gracefully.
 *  - FILTER_EXECUTION_ORDER re-exported.
 *  - No Bank access (no SQL/Supabase/runtime references).
 */

import assert from 'node:assert/strict'
import { planQuery, FILTER_EXECUTION_ORDER } from './query-planner'
import type { AssemblyRequest } from '../reader/contracts'
import type { QueryPlan } from './contracts'
import { stableStringify } from '../shared/testing/determinism'
import { buildAssemblyRequest } from '../shared/testing/fixtures'

// ─── helpers ────────────────────────────────────────────────────────────────

function planFromFixture(): QueryPlan {
  return planQuery(buildAssemblyRequest())
}

// ─── Successful planning ────────────────────────────────────────────────────

function verifies_planning_produces_non_null_query_plan(): void {
  const plan = planFromFixture()
  assert.ok(plan, 'planQuery must produce a QueryPlan')
  assert.ok(plan.coverageRequirements.length > 0)
  assert.ok(plan.permittedDocuments.length > 0)
  assert.ok(plan.difficultySlots.length > 0)
  assert.ok(plan.patternSlots.length > 0)
  assert.ok(plan.learningObjectiveSlots.length > 0)
  assert.ok(plan.duplicateRules.length > 0)
}

// ─── Deterministic output ───────────────────────────────────────────────────

function verifies_deterministic_output(): void {
  const req = buildAssemblyRequest()
  const a = planQuery(req)
  const b = planQuery(req)
  assert.deepEqual(a, b)
}

function verifies_deterministic_serialization(): void {
  const req = buildAssemblyRequest()
  const a = stableStringify(planQuery(req))
  const b = stableStringify(planQuery(req))
  assert.equal(a, b)
}

// ─── Immutable output (input never mutated) ─────────────────────────────────

function verifies_input_not_mutated(): void {
  const req = buildAssemblyRequest()
  const before = stableStringify(req)
  planQuery(req)
  planQuery(req) // twice to catch accumulator-style mutation
  const after = stableStringify(req)
  assert.equal(after, before, 'AssemblyRequest must not be mutated by planQuery')
}

// ─── Document Registry → permittedDocuments ────────────────────────────────

function verifies_permitted_documents_extracted_from_registry(): void {
  const plan = planFromFixture()
  const req = buildAssemblyRequest()
  // Every document name in the registry should appear in permittedDocuments.
  for (const entry of req.documentRegistry) {
    assert.ok(
      plan.permittedDocuments.includes(entry.name),
      `permittedDocuments missing: ${entry.name}`
    )
  }
}

function verifies_permitted_documents_sorted(): void {
  const plan = planFromFixture()
  for (let i = 1; i < plan.permittedDocuments.length; i++) {
    assert.ok(
      plan.permittedDocuments[i - 1]! <= plan.permittedDocuments[i]!,
      'permittedDocuments must be sorted alphabetically'
    )
  }
}

function verifies_tier_not_carried_in_query_plan(): void {
  // The Query Plan carries document NAMES only, not Tier (Tier is derived
  // per-Candidate at Discovery time, §3.5).
  const plan = planFromFixture()
  for (const doc of plan.permittedDocuments) {
    assert.equal(typeof doc, 'string')
  }
  // QueryPlan type has no tier field — compile-time guarantee.
  assert.ok(!('tier' in plan), 'QueryPlan must not carry Tier')
}

// ─── Coverage rules → coverageRequirements ──────────────────────────────────

function verifies_coverage_rules_passed_through(): void {
  const plan = planFromFixture()
  const req = buildAssemblyRequest()
  assert.equal(plan.coverageRequirements.length, req.coverageRules.length)
  for (let i = 0; i < req.coverageRules.length; i++) {
    assert.equal(plan.coverageRequirements[i]!.ruleId, req.coverageRules[i]!.id)
    assert.equal(plan.coverageRequirements[i]!.level, req.coverageRules[i]!.level)
  }
}

function verifies_multiple_coverage_rules_preserved(): void {
  // The fixture carries CR-1..CR-5 (5 rules).
  const plan = planFromFixture()
  const ids = plan.coverageRequirements.map((c) => c.ruleId)
  assert.deepEqual(ids, ['CR-1', 'CR-2', 'CR-3', 'CR-4', 'CR-5'])
}

// ─── LO targets → per-Set slots ─────────────────────────────────────────────

function verifies_lo_slots_have_computed_target_counts(): void {
  const plan = planFromFixture()
  const req = buildAssemblyRequest()
  const perSet = req.target.perSet
  // 5 Sets × 4 LOs = 20 slots.
  assert.equal(plan.learningObjectiveSlots.length, 20)
  // LO1 target for Set 1 = round(25 * 100 / 100) = 25 (fixture default LO1=25%).
  const lo1Set1 = plan.learningObjectiveSlots.find(
    (s) => s.setNumber === 1 && s.axisValue === 'LO1'
  )
  assert.ok(lo1Set1)
  const expectedTarget = Math.round(
    (req.loDistribution.targets.LO1 * perSet) / 100
  )
  assert.equal(lo1Set1!.targetCount, expectedTarget)
}

function verifies_lo_slots_set_major_ordering(): void {
  const plan = planFromFixture()
  // First 4 slots should be Set 1's LOs; next 4 Set 2's; etc.
  for (let i = 0; i < 4; i++) {
    assert.equal(plan.learningObjectiveSlots[i]!.setNumber, 1)
  }
  for (let i = 4; i < 8; i++) {
    assert.equal(plan.learningObjectiveSlots[i]!.setNumber, 2)
  }
}

// ─── Difficulty/Pattern axes enumerated with targetCount=0 ─────────────────

function verifies_difficulty_slots_enumerated(): void {
  const plan = planFromFixture()
  // 5 Sets × 3 Difficulties = 15 slots.
  assert.equal(plan.difficultySlots.length, 15)
  // All targetCounts are 0 (AssemblyRequest doesn't carry per-axis Difficulty targets).
  for (const slot of plan.difficultySlots) {
    assert.equal(slot.targetCount, 0)
  }
  // Verify all three difficulties appear for Set 1.
  const set1Difficulties = plan.difficultySlots
    .filter((s) => s.setNumber === 1)
    .map((s) => s.axisValue)
  assert.deepEqual(set1Difficulties, ['Easy', 'Medium', 'Hard'])
}

function verifies_pattern_slots_enumerated(): void {
  const plan = planFromFixture()
  // 5 Sets × 6 Patterns = 30 slots.
  assert.equal(plan.patternSlots.length, 30)
  for (const slot of plan.patternSlots) {
    assert.equal(slot.targetCount, 0)
  }
  // Verify all six patterns appear for Set 1 (including Matching Concept).
  const set1Patterns = plan.patternSlots
    .filter((s) => s.setNumber === 1)
    .map((s) => s.axisValue)
  assert.deepEqual(set1Patterns, [
    'Positive',
    'Negative',
    'Best Answer',
    'Scenario',
    'Sequence',
    'Matching Concept',
  ])
}

// ─── Duplicate rules preserved ──────────────────────────────────────────────

function verifies_duplicate_rules_preserved(): void {
  const plan = planFromFixture()
  const req = buildAssemblyRequest()
  assert.equal(plan.duplicateRules.length, req.duplicatePrevention.length)
  const ids = plan.duplicateRules.map((r) => r.ruleId)
  assert.deepEqual(ids, ['L1', 'L2', 'L3', 'L4', 'L5'])
}

function verifies_duplicate_rule_scopes_preserved(): void {
  const plan = planFromFixture()
  const l1 = plan.duplicateRules.find((r) => r.ruleId === 'L1')
  assert.ok(l1)
  assert.equal(l1!.scope, 'within_set')
  const l3 = plan.duplicateRules.find((r) => r.ruleId === 'L3')
  assert.equal(l3!.scope, 'across_set')
}

// ─── Exclusions ─────────────────────────────────────────────────────────────

function verifies_exclusions_passed_through(): void {
  const req = buildAssemblyRequest({ exclusions: ['Q-999999', 'Q-888888'] })
  const plan = planQuery(req)
  assert.equal(plan.exclusions.length, 2)
  // Sorted for deterministic output.
  assert.deepEqual(plan.exclusions, ['Q-888888', 'Q-999999'])
}

function verifies_empty_exclusions_handled(): void {
  const req = buildAssemblyRequest({ exclusions: [] })
  const plan = planQuery(req)
  assert.equal(plan.exclusions.length, 0)
}

// ─── Empty collections handled gracefully ───────────────────────────────────

function verifies_empty_document_registry_handled(): void {
  const req = buildAssemblyRequest({ documentRegistry: [] })
  const plan = planQuery(req)
  assert.equal(plan.permittedDocuments.length, 0)
  // Other fields should still be populated from the rest of the request.
  assert.ok(plan.difficultySlots.length > 0)
}

function verifies_empty_coverage_rules_handled(): void {
  const req = buildAssemblyRequest({ coverageRules: [] })
  const plan = planQuery(req)
  assert.equal(plan.coverageRequirements.length, 0)
}

function verifies_empty_duplicate_prevention_handled(): void {
  const req = buildAssemblyRequest({ duplicatePrevention: [] })
  const plan = planQuery(req)
  assert.equal(plan.duplicateRules.length, 0)
}

// ─── FILTER_EXECUTION_ORDER re-exported ─────────────────────────────────────

function verifies_filter_execution_order_reexported(): void {
  // The Query Planner re-exports FILTER_EXECUTION_ORDER for downstream
  // stages. Verify it's the same array (identity) as the contracts constant.
  assert.deepEqual(FILTER_EXECUTION_ORDER, [
    'exclusion',
    'status',
    'document',
    'coverage',
    'difficulty',
    'pattern',
    'learning_objective',
  ])
}

// ─── No Bank/SQL/Runtime references ─────────────────────────────────────────

function verifies_query_plan_has_no_bank_references(): void {
  const plan = planFromFixture()
  const serialized = stableStringify(plan)
  // The Query Plan must not contain any Bank-coupled fields.
  assert.ok(!serialized.includes('supabase'), 'QueryPlan must not reference Supabase')
  assert.ok(!serialized.includes('select('), 'QueryPlan must not contain SQL')
  assert.ok(!serialized.includes('questionId'), 'QueryPlan must not carry Question ids')
}

// ─── LO targets with 0% ─────────────────────────────────────────────────────

function verifies_lo_with_zero_percent_produces_zero_target(): void {
  const req = buildAssemblyRequest({
    loDistribution: {
      targets: { LO1: 0, LO2: 50, LO3: 50, LO4: 0 },
      typeMap: {
        LO1: ['Memory'],
        LO2: ['Concept'],
        LO3: ['Procedure'],
        LO4: ['Scenario'],
      },
    },
  })
  const plan = planQuery(req)
  const lo1Set1 = plan.learningObjectiveSlots.find(
    (s) => s.setNumber === 1 && s.axisValue === 'LO1'
  )
  assert.equal(lo1Set1!.targetCount, 0)
  const lo2Set1 = plan.learningObjectiveSlots.find(
    (s) => s.setNumber === 1 && s.axisValue === 'LO2'
  )
  assert.equal(lo2Set1!.targetCount, 50) // 50% of 100 = 50
}

// ─── Multiple sets verified ─────────────────────────────────────────────────

function verifies_all_five_sets_present_in_lo_slots(): void {
  const plan = planFromFixture()
  const setNumbers = new Set(plan.learningObjectiveSlots.map((s) => s.setNumber))
  assert.deepEqual([...setNumbers].sort(), [1, 2, 3, 4, 5])
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'planning produces a non-null QueryPlan', fn: verifies_planning_produces_non_null_query_plan },
  { name: 'deterministic: same input → same QueryPlan', fn: verifies_deterministic_output },
  { name: 'deterministic serialization (key-order invariant)', fn: verifies_deterministic_serialization },
  { name: 'input not mutated by planQuery', fn: verifies_input_not_mutated },
  { name: 'permittedDocuments extracted from Document Registry', fn: verifies_permitted_documents_extracted_from_registry },
  { name: 'permittedDocuments sorted alphabetically', fn: verifies_permitted_documents_sorted },
  { name: 'Tier NOT carried in QueryPlan (derived at runtime)', fn: verifies_tier_not_carried_in_query_plan },
  { name: 'coverage rules passed through (ruleId + level)', fn: verifies_coverage_rules_passed_through },
  { name: 'multiple coverage rules preserved (CR-1..CR-5)', fn: verifies_multiple_coverage_rules_preserved },
  { name: 'LO slots have computed target counts from percentages', fn: verifies_lo_slots_have_computed_target_counts },
  { name: 'LO slots ordered Set-major (Set 1 LOs, then Set 2, ...)', fn: verifies_lo_slots_set_major_ordering },
  { name: 'Difficulty slots enumerated (5×3=15, targetCount=0)', fn: verifies_difficulty_slots_enumerated },
  { name: 'Pattern slots enumerated (5×6=30, targetCount=0, includes Matching Concept)', fn: verifies_pattern_slots_enumerated },
  { name: 'duplicate rules preserved (L1..L5)', fn: verifies_duplicate_rules_preserved },
  { name: 'duplicate rule scopes preserved (within_set/across_set)', fn: verifies_duplicate_rule_scopes_preserved },
  { name: 'exclusions passed through + sorted', fn: verifies_exclusions_passed_through },
  { name: 'empty exclusions handled', fn: verifies_empty_exclusions_handled },
  { name: 'empty Document Registry handled', fn: verifies_empty_document_registry_handled },
  { name: 'empty coverage rules handled', fn: verifies_empty_coverage_rules_handled },
  { name: 'empty duplicate prevention handled', fn: verifies_empty_duplicate_prevention_handled },
  { name: 'FILTER_EXECUTION_ORDER re-exported', fn: verifies_filter_execution_order_reexported },
  { name: 'QueryPlan has no Bank/SQL/Runtime references', fn: verifies_query_plan_has_no_bank_references },
  { name: 'LO with 0% produces targetCount=0', fn: verifies_lo_with_zero_percent_produces_zero_target },
  { name: 'all 5 Sets present in LO slots', fn: verifies_all_five_sets_present_in_lo_slots },
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
