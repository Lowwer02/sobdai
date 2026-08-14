/**
 * lib/engine/solver/physical-acceptance.test.ts
 * ----------------------------------------------------------------------------
 * Physical 100/300 Acceptance Tests (PHASE 3F4-A).
 *
 * RUN: npx jiti lib/engine/solver/physical-acceptance.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { PreTieCandidateProfile, PreTieSetCandidateProfiles } from '../ranking/contracts'
import type { PhysicalSolverInput } from './set-solver-input'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { solvePhysicalAssignments } from './physical-solver-orchestrator'

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

function mkPreTieProfile(questionCode: string, tier: Tier = 1): PreTieCandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode, tier),
    suitabilityProfiles: [],
  }
}

function mkSnapshot(sets: number, perSet = 100): ConstraintSnapshot {
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
  profilesList: { setNumber: 1 | 2 | 3 | 4 | 5; codes: string[] }[]
): PhysicalSolverInput {
  const constraintSnapshot = mkSnapshot(sets, perSet)

  const setProfiles: PreTieSetCandidateProfiles[] = profilesList.map(p => ({
    setNumber: p.setNumber,
    profiles: p.codes.map(c => mkPreTieProfile(c)),
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
    setProfiles,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// TEST 1 — ONE SET = 100
function test_one_set_100_acceptance(): void {
  // Generate 100 unique candidates
  const codes = Array.from({ length: 100 }, (_, i) => `Q-${String(i + 1).padStart(3, '0')}`)
  const input = mkSolverInput(1, 100, [{ setNumber: 1, codes }])
  const budget = { maxNodesVisited: 500 }

  const run = solvePhysicalAssignments(input, budget)

  assert.equal(run.results.length, 1)
  const res = run.results[0]!
  assert.equal(res.status, 'COMPLETE')
  if (res.status === 'COMPLETE') {
    assert.equal(res.assignment.setNumber, 1)
    assert.equal(res.assignment.placements.length, 100)
    
    // Position numbers are exactly 1..100
    const positionNumbers = res.assignment.placements.map(p => p.position.positionNumber)
    const expectedPositions = Array.from({ length: 100 }, (_, i) => i + 1)
    assert.deepEqual(positionNumbers, expectedPositions)

    // 100 unique question codes within Set 1
    const setCodes = res.assignment.placements.map(p => p.candidate.questionCode)
    assert.equal(new Set(setCodes).size, 100)

    // Diagnostics limits
    assert.ok(res.diagnostics.nodesVisited <= budget.maxNodesVisited)
  }
}

// TEST 2 — THREE SETS = 300 PLACEMENTS
function test_three_sets_300_placements_acceptance(): void {
  // We want to prove that:
  // - each Set has exactly 100 placements (total 300)
  // - each Set has 100 unique questionCodes
  // - at least one questionCode (e.g. Q-001) appears in multiple Sets
  const codesSet1 = Array.from({ length: 100 }, (_, i) => `Q-${String(i + 1).padStart(3, '0')}`)
  // Set 2 uses Q-001 (shared) and then 99 other unique codes
  const codesSet2 = ['Q-001', ...Array.from({ length: 99 }, (_, i) => `Q-${String(i + 101).padStart(3, '0')}`)]
  // Set 3 uses Q-001 (shared) and then 99 other unique codes
  const codesSet3 = ['Q-001', ...Array.from({ length: 99 }, (_, i) => `Q-${String(i + 201).padStart(3, '0')}`)]

  const input = mkSolverInput(3, 100, [
    { setNumber: 1, codes: codesSet1 },
    { setNumber: 2, codes: codesSet2 },
    { setNumber: 3, codes: codesSet3 },
  ])
  const budget = { maxNodesVisited: 500 }

  const run = solvePhysicalAssignments(input, budget)

  assert.equal(run.results.length, 3)

  let totalPlacements = 0
  const questionCodeOccurrences: Record<string, number> = {}

  for (let i = 0; i < 3; i++) {
    const res = run.results[i]!
    assert.equal(res.status, 'COMPLETE')

    if (res.status === 'COMPLETE') {
      const setNumber = i + 1
      assert.equal(res.assignment.setNumber, setNumber)
      assert.equal(res.assignment.placements.length, 100)
      totalPlacements += res.assignment.placements.length

      const positionNumbers = res.assignment.placements.map(p => p.position.positionNumber)
      const expectedPositions = Array.from({ length: 100 }, (_, i) => i + 1)
      assert.deepEqual(positionNumbers, expectedPositions)

      const placementCodes = res.assignment.placements.map(p => p.candidate.questionCode)
      // Verify internal uniqueness within the Set
      assert.equal(new Set(placementCodes).size, 100)

      for (const p of res.assignment.placements) {
        assert.equal(p.position.setNumber, setNumber)
        questionCodeOccurrences[p.candidate.questionCode] = (questionCodeOccurrences[p.candidate.questionCode] ?? 0) + 1
      }
    }
  }

  assert.equal(totalPlacements, 300)
  // Prove at least one questionCode appears in more than one Set
  assert.equal(questionCodeOccurrences['Q-001'], 3, 'Q-001 must appear in all 3 Sets')
}

// TEST 3 — DETERMINISM
function test_determinism_acceptance(): void {
  const codesSet1 = Array.from({ length: 100 }, (_, i) => `Q-${String(i + 1).padStart(3, '0')}`)
  const codesSet2 = Array.from({ length: 100 }, (_, i) => `Q-${String(i + 101).padStart(3, '0')}`)
  const codesSet3 = Array.from({ length: 100 }, (_, i) => `Q-${String(i + 201).padStart(3, '0')}`)

  const mkInput = () => mkSolverInput(3, 100, [
    { setNumber: 1, codes: codesSet1 },
    { setNumber: 2, codes: codesSet2 },
    { setNumber: 3, codes: codesSet3 },
  ])
  const budget = { maxNodesVisited: 500 }

  const run1 = solvePhysicalAssignments(mkInput(), budget)
  const run2 = solvePhysicalAssignments(mkInput(), budget)

  assert.deepEqual(run1, run2)
}

// TEST 4 — INPUT IMMUTABILITY
function test_input_immutability_acceptance(): void {
  const codesSet1 = Array.from({ length: 100 }, (_, i) => `Q-${String(i + 1).padStart(3, '0')}`)
  const input = mkSolverInput(1, 100, [{ setNumber: 1, codes: codesSet1 }])
  const budget = { maxNodesVisited: 500 }
  const originalJSON = JSON.stringify(input)

  solvePhysicalAssignments(input, budget)

  assert.equal(JSON.stringify(input), originalJSON, 'Acceptance run must not mutate PhysicalSolverInput or its nested properties')
}

// Run all tests
const tests = [
  test_one_set_100_acceptance,
  test_three_sets_300_placements_acceptance,
  test_determinism_acceptance,
  test_input_immutability_acceptance,
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
