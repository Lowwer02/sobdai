/**
 * lib/engine/solver/physical-search-result.test.ts
 * ----------------------------------------------------------------------------
 * Physical Search Result Tests (PHASE 3F2-B).
 *
 * RUN: npx jiti lib/engine/solver/physical-search-result.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { CandidateProfile, SetCandidateProfiles } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { buildSetSolverInput } from './set-solver-input'
import { runPhysicalSearch } from './physical-search-result'

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function mkCandidate(questionCode: string, tier: Tier = 1): Candidate {
  return {
    identity: { questionCode, questionId: questionCode },
    metadata: {
      document: 'DOC-A',
      difficulty: 'Easy',
      topic: 'Topic A',
      status: 'Published',
      tier,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'Sec 1',
      tags: [],
      category: null,
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document', 'coverage', 'difficulty'],
      eligibleSlots: [],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function mkProfile(questionCode: string, tier: Tier = 1): CandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode, tier),
    suitabilityProfiles: [],
  }
}

function mkSnapshot(perSet = 3, tier1Floor = 0): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    target: { sets: 2, perSet },
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor,
      tier4Ceiling: perSet,
    },
  }
}

function mkInput(setNumber: 1 | 2 | 3 | 4 | 5, profiles: readonly CandidateProfile[], perSet = 3, tier1Floor = 0): ReturnType<typeof buildSetSolverInput> {
  const universe: SetCandidateProfiles = {
    setNumber,
    profiles,
  }
  return buildSetSolverInput(universe, mkSnapshot(perSet, tier1Floor))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. COMPLETE
function test_complete(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input = mkInput(1, profiles, 3)
  const budget = { maxNodesVisited: 10 }

  const result = runPhysicalSearch(input, budget)

  assert.equal(result.status, 'COMPLETE')
  if (result.status === 'COMPLETE') {
    assert.equal(result.assignment.setNumber, 1)
    assert.equal(result.assignment.placements.length, 3)
    
    // Position numbers are exactly 1..perSet
    const positionNumbers = result.assignment.placements.map(p => p.position.positionNumber)
    assert.deepEqual(positionNumbers, [1, 2, 3])

    // Candidate order matches deterministic selection (which orders Tier 1 candidates lexically/by branch-ordering)
    // Note: since all are Tier 1, ordered candidates are sorted lexically: Q-001, Q-002, Q-003
    const candidateCodes = result.assignment.placements.map(p => p.candidate.questionCode)
    assert.deepEqual(candidateCodes, ['Q-001', 'Q-002', 'Q-003'])

    // Diagnostics preserved
    assert.ok(result.diagnostics.nodesVisited > 0)
    assert.ok(result.diagnostics.backtracks >= 0)
  }
}

// 2. COMPLETE uniqueness
function test_complete_uniqueness(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input = mkInput(1, profiles, 3)
  const budget = { maxNodesVisited: 10 }

  const result = runPhysicalSearch(input, budget)

  assert.equal(result.status, 'COMPLETE')
  if (result.status === 'COMPLETE') {
    const codes = result.assignment.placements.map(p => p.candidate.questionCode)
    const uniqueCodes = new Set(codes)
    assert.equal(uniqueCodes.size, codes.length, 'placement candidate questionCodes must be unique')
  }
}

// 3. PROVEN_INFEASIBLE
function test_proven_infeasible(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002')] // only 2 candidates, need 3
  const input = mkInput(1, profiles, 3)
  const budget = { maxNodesVisited: 10 }

  const result = runPhysicalSearch(input, budget)

  assert.equal(result.status, 'PROVEN_INFEASIBLE')
  assert.ok(!('assignment' in result), 'PROVEN_INFEASIBLE result must not have assignment field')
  assert.ok(result.diagnostics.nodesVisited >= 0)
}

// 4. SEARCH_BUDGET_EXHAUSTED
function test_search_budget_exhausted(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input = mkInput(1, profiles, 3)
  const budget = { maxNodesVisited: 1 } // Intentionally insufficient budget

  const result = runPhysicalSearch(input, budget)

  assert.equal(result.status, 'SEARCH_BUDGET_EXHAUSTED')
  assert.ok(!('assignment' in result), 'SEARCH_BUDGET_EXHAUSTED result must not have assignment field')
  assert.equal(result.diagnostics.nodesVisited, 1)
}

// 5. Position order preservation
function test_position_order_preservation(): void {
  // Let's create a universe where ordering prioritizes Tier 1 over Tier 2.
  // We place Q-002 (Tier 1) and Q-001 (Tier 2).
  // The branch order will explore Q-002 first, then Q-001.
  // This is non-lexical candidate selection order: Q-002, then Q-001.
  const profiles = [
    mkProfile('Q-001', 2), // Tier 2
    mkProfile('Q-002', 1), // Tier 1
  ]
  // We set tier1Floor to 1 to force the ordering rule (Tier 1 first)
  const input = mkInput(1, profiles, 2, 1)
  const budget = { maxNodesVisited: 10 }

  const result = runPhysicalSearch(input, budget)

  assert.equal(result.status, 'COMPLETE')
  if (result.status === 'COMPLETE') {
    const codes = result.assignment.placements.map(p => p.candidate.questionCode)
    assert.deepEqual(codes, ['Q-002', 'Q-001'], 'Should preserve selected candidate order (Tier 1 first)')
  }
}

// 6. Cross-Set independence
function test_cross_set_independence(): void {
  const profilesSet1 = [mkProfile('Q-001'), mkProfile('Q-002')]
  const profilesSet2 = [mkProfile('Q-001'), mkProfile('Q-003')]

  const input1 = mkInput(1, profilesSet1, 2)
  const input2 = mkInput(2, profilesSet2, 2)
  const budget = { maxNodesVisited: 10 }

  const res1 = runPhysicalSearch(input1, budget)
  const res2 = runPhysicalSearch(input2, budget)

  assert.equal(res1.status, 'COMPLETE')
  assert.equal(res2.status, 'COMPLETE')

  if (res1.status === 'COMPLETE' && res2.status === 'COMPLETE') {
    assert.equal(res1.assignment.setNumber, 1)
    assert.equal(res2.assignment.setNumber, 2)

    assert.equal(res1.assignment.placements[0]?.position.setNumber, 1)
    assert.equal(res2.assignment.placements[0]?.position.setNumber, 2)

    const codes1 = res1.assignment.placements.map(p => p.candidate.questionCode)
    const codes2 = res2.assignment.placements.map(p => p.candidate.questionCode)

    assert.ok(codes1.includes('Q-001'))
    assert.ok(codes2.includes('Q-001'))
  }
}

// 7. Determinism
function test_determinism(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input1 = mkInput(1, profiles, 3)
  const input2 = mkInput(1, profiles, 3)
  const budget = { maxNodesVisited: 10 }

  const res1 = runPhysicalSearch(input1, budget)
  const res2 = runPhysicalSearch(input2, budget)

  assert.deepEqual(res1, res2)
}

// 8. Budget invariant
function test_budget_invariant(): void {
  const budget = { maxNodesVisited: 2 }
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input = mkInput(1, profiles, 3)

  const res = runPhysicalSearch(input, budget)
  assert.ok(res.diagnostics.nodesVisited <= budget.maxNodesVisited)
}

// 9. Immutability
function test_immutability(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input = mkInput(1, profiles, 3)
  const originalInputJSON = JSON.stringify(input)
  const budget = { maxNodesVisited: 10 }

  runPhysicalSearch(input, budget)

  assert.equal(JSON.stringify(input), originalInputJSON, 'runPhysicalSearch must not mutate SetSolverInput, profiles, or constraint snapshot')
}

// 10. Assignment cardinality
function test_assignment_cardinality(): void {
  const profiles = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const input = mkInput(1, profiles, 3)
  const budget = { maxNodesVisited: 10 }

  const res = runPhysicalSearch(input, budget)
  assert.equal(res.status, 'COMPLETE')
  if (res.status === 'COMPLETE') {
    assert.equal(res.assignment.placements.length, input.constraintSnapshot.target.perSet)
  }
}

// Run all tests
const tests = [
  test_complete,
  test_complete_uniqueness,
  test_proven_infeasible,
  test_search_budget_exhausted,
  test_position_order_preservation,
  test_cross_set_independence,
  test_determinism,
  test_budget_invariant,
  test_immutability,
  test_assignment_cardinality,
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(err)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
