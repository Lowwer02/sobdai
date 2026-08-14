/**
 * lib/engine/solver/physical-solver-orchestrator.test.ts
 * ----------------------------------------------------------------------------
 * Physical Multi-Set Orchestrator Tests (PHASE 3F3-B).
 *
 * RUN: npx jiti lib/engine/solver/physical-solver-orchestrator.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { PreTieCandidateProfile, PreTieSetCandidateProfiles } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { solvePhysicalAssignments } from './physical-solver-orchestrator'
import { type PhysicalSolverInput } from './set-solver-input'

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

function mkProfile(questionCode: string, tier: Tier = 1): PreTieCandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode, tier),
    suitabilityProfiles: [],
  }
}

function mkSnapshot(sets: number, perSet = 2): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    target: { sets, perSet },
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor: 0,
      tier4Ceiling: perSet,
    },
  }
}

function mkSolverInput(
  sets: number,
  perSet: number,
  profilesList: { setNumber: 1 | 2 | 3 | 4 | 5; codes: string[] }[],
  omitSetProfiles = false
): PhysicalSolverInput {
  const constraintSnapshot = mkSnapshot(sets, perSet)
  
  const setProfiles: PreTieSetCandidateProfiles[] = profilesList.map(p => ({
    setNumber: p.setNumber,
    profiles: p.codes.map(c => mkProfile(c)),
  }))

  return {
    candidateSet: {
      identity: { assemblyRequestId: 'run-123', generatedAt: '2026-08-12T00:00:00Z', bankStateHash: 'hash123' },
      candidates: [],
      slotIndex: { slots: new Map() },
      shortfallReport: { entries: [] },
      coverageSatisfaction: { bindings: [] },
      constraintSnapshot,
      warnings: [],
      statistics: {
        totalCandidates: 0,
        fullConfidenceCount: 0,
        reducedConfidenceCount: 0,
        incompleteAxesCount: 0,
        distinctDocuments: 0,
        distinctDifficulties: 0,
        distinctPatterns: 0,
        distinctLearningObjectives: 0,
        shortfallCount: 0,
      },
      exclusionsLog: [],
      meta: { specVersion: '1.0', generatorVersion: '1.0' },
    },
    setProfiles: omitSetProfiles ? (undefined as any) : setProfiles,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. One active Set
function test_one_active_set(): void {
  const input = mkSolverInput(1, 2, [{ setNumber: 1, codes: ['Q-001', 'Q-002'] }])
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  assert.equal(run.results.length, 1)
  const res = run.results[0]!
  assert.equal(res.status, 'COMPLETE')
  if (res.status === 'COMPLETE') {
    assert.equal(res.assignment.setNumber, 1)
  }
}

// 2. Three active Sets
function test_three_active_sets(): void {
  const input = mkSolverInput(3, 2, [
    { setNumber: 3, codes: ['Q-005', 'Q-006'] },
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  assert.equal(run.results.length, 3)
  const res1 = run.results[0]!
  const res2 = run.results[1]!
  const res3 = run.results[2]!
  
  assert.equal(res1.status, 'COMPLETE')
  assert.equal(res2.status, 'COMPLETE')
  assert.equal(res3.status, 'COMPLETE')
  
  if (
    res1.status === 'COMPLETE' &&
    res2.status === 'COMPLETE' &&
    res3.status === 'COMPLETE'
  ) {
    assert.equal(res1.assignment.setNumber, 1)
    assert.equal(res2.assignment.setNumber, 2)
    assert.equal(res3.assignment.setNumber, 3)
  }
}

// 3. Five active Sets
function test_five_active_sets(): void {
  const input = mkSolverInput(5, 1, [
    { setNumber: 5, codes: ['Q-005'] },
    { setNumber: 4, codes: ['Q-004'] },
    { setNumber: 3, codes: ['Q-003'] },
    { setNumber: 2, codes: ['Q-002'] },
    { setNumber: 1, codes: ['Q-001'] },
  ])
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  assert.equal(run.results.length, 5)
  for (let i = 0; i < 5; i++) {
    const res = run.results[i]!
    assert.equal(res.status, 'COMPLETE')
    if (res.status === 'COMPLETE') {
      assert.equal(res.assignment.setNumber, (i + 1) as 1 | 2 | 3 | 4 | 5)
    }
  }
}

// 4. Missing setProfiles
function test_missing_set_profiles(): void {
  const input = mkSolverInput(1, 2, [{ setNumber: 1, codes: ['Q-001', 'Q-002'] }], true)
  assert.throws(
    () => solvePhysicalAssignments(input, { maxNodesVisited: 10 }),
    (err: Error) => err.message.includes('setProfiles must be present')
  )
}

// 5. Missing active Set profile
function test_missing_active_set_profile(): void {
  // target.sets = 3, but only Set 1 + Set 3 profiles are provided
  const input = mkSolverInput(3, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 3, codes: ['Q-003', 'Q-004'] },
  ])
  assert.throws(
    () => solvePhysicalAssignments(input, { maxNodesVisited: 10 }),
    (err: Error) => err.message.includes('missing profile for active setNumber 2')
  )
}

// 6. Duplicate active Set profile
function test_duplicate_active_set_profile(): void {
  // Manually build a duplicate entry in setProfiles since mkSolverInput expects uniqueness
  const input = mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])

  // Inject duplicate profile for Set 2 by using type coercion / fresh assignment
  const profiles = input.setProfiles as PreTieSetCandidateProfiles[]
  const mutatedInput = {
    ...input,
    setProfiles: [...profiles, profiles[1]!],
  }

  assert.throws(
    () => solvePhysicalAssignments(mutatedInput, { maxNodesVisited: 10 }),
    (err: Error) => err.message.includes('duplicate profiles found for active setNumber 2')
  )
}

// 7. COMPLETE multi-Set independence
function test_multi_set_independence(): void {
  const input = mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-001', 'Q-003'] },
  ])
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  assert.equal(run.results[0]!.status, 'COMPLETE')
  assert.equal(run.results[1]!.status, 'COMPLETE')

  if (run.results[0]!.status === 'COMPLETE' && run.results[1]!.status === 'COMPLETE') {
    const codes1 = run.results[0]!.assignment.placements.map(p => p.candidate.questionCode)
    const codes2 = run.results[1]!.assignment.placements.map(p => p.candidate.questionCode)

    assert.ok(codes1.includes('Q-001'))
    assert.ok(codes2.includes('Q-001'))
  }
}

// 8. Per-Set cardinality
function test_per_set_cardinality(): void {
  const input = mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  for (const res of run.results) {
    assert.equal(res.status, 'COMPLETE')
    if (res.status === 'COMPLETE') {
      assert.equal(res.assignment.placements.length, 2)
    }
  }
}

// 9. Physical Set identity
function test_physical_set_identity(): void {
  const input = mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  for (let i = 0; i < run.results.length; i++) {
    const res = run.results[i]!
    assert.equal(res.status, 'COMPLETE')
    if (res.status === 'COMPLETE') {
      assert.equal(res.assignment.setNumber, i + 1)
      for (const placement of res.assignment.placements) {
        assert.equal(placement.position.setNumber, i + 1)
      }
    }
  }
}

// 10. Budget propagation
function test_budget_propagation(): void {
  const input = mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])
  
  // A budget of 1 node visit per Set is insufficient to fully allocate 2 candidates,
  // meaning each Set must exhaust budget independently instead of carrying over nodesVisited.
  const run = solvePhysicalAssignments(input, { maxNodesVisited: 1 })

  for (const res of run.results) {
    assert.equal(res.status, 'SEARCH_BUDGET_EXHAUSTED')
    assert.equal(res.diagnostics.nodesVisited, 1)
  }
}

// 11. Determinism
function test_determinism(): void {
  const mkInputData = () => mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])

  const run1 = solvePhysicalAssignments(mkInputData(), { maxNodesVisited: 10 })
  const run2 = solvePhysicalAssignments(mkInputData(), { maxNodesVisited: 10 })

  assert.deepEqual(run1, run2)
}

// 12. Immutability
function test_immutability(): void {
  const input = mkSolverInput(2, 2, [
    { setNumber: 1, codes: ['Q-001', 'Q-002'] },
    { setNumber: 2, codes: ['Q-003', 'Q-004'] },
  ])

  const originalJSON = JSON.stringify(input)
  solvePhysicalAssignments(input, { maxNodesVisited: 10 })

  assert.equal(JSON.stringify(input), originalJSON, 'solvePhysicalAssignments must not mutate PhysicalSolverInput or its nested snapshots')
}

// Run all tests
const tests = [
  test_one_active_set,
  test_three_active_sets,
  test_five_active_sets,
  test_missing_set_profiles,
  test_missing_active_set_profile,
  test_duplicate_active_set_profile,
  test_multi_set_independence,
  test_per_set_cardinality,
  test_physical_set_identity,
  test_budget_propagation,
  test_determinism,
  test_immutability,
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
