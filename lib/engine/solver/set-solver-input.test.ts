/**
 * lib/engine/solver/set-solver-input.test.ts
 * ----------------------------------------------------------------------------
 * SetSolverInput Contract & Bridge Helper Tests.
 *
 * RUN: npx jiti lib/engine/solver/set-solver-input.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot } from '../generator/contracts'
import type { PreTieAxisProfile, PreTieCandidateProfile, PreTieSetCandidateProfiles } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import {
  buildSetSolverInput,
  buildSetSolverPositionSlots,
  type SetSolverInput,
} from './set-solver-input'

// ─── Test Fixture Helpers ───────────────────────────────────────────────────

function mkCandidate(questionCode: string): Candidate {
  return {
    identity: { questionCode, questionId: questionCode },
    metadata: {
      document: 'LAW-ACT-HED-2562',
      difficulty: 'Easy',
      topic: 'Topic A',
      status: 'Published',
      tier: 1,
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

function mkProfile(questionCode: string, suitabilityProfiles: readonly PreTieAxisProfile[] = []): PreTieCandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode),
    suitabilityProfiles,
  }
}

function mkUniverse(setNumber: 1 | 2 | 3 | 4 | 5, profiles: readonly PreTieCandidateProfile[] = []): PreTieSetCandidateProfiles {
  return {
    setNumber,
    profiles,
  }
}

function mkSnapshot(sets = 5, perSet = 100): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    target: { sets, perSet },
  }
}

// ─── Test 1. Valid Set 1 ────────────────────────────────────────────────────

function test_valid_set_1(): void {
  const snapshot = mkSnapshot(1, 100)
  const universe = mkUniverse(1, [mkProfile('Q-001'), mkProfile('Q-002')])

  const input = buildSetSolverInput(universe, snapshot)
  assert.equal(input.setNumber, 1, 'input.setNumber must equal 1')
  assert.equal(input.candidateUniverse, universe)
  assert.equal(input.constraintSnapshot, snapshot)

  const slots = buildSetSolverPositionSlots(input)
  assert.equal(slots.length, 100, 'must derive exactly 100 physical position slots')
  for (let i = 0; i < 100; i++) {
    assert.equal(slots[i]!.setNumber, 1)
    assert.equal(slots[i]!.positionNumber, i + 1)
  }
}

// ─── Test 2. Valid Set 3 ────────────────────────────────────────────────────

function test_valid_set_3(): void {
  const snapshot = mkSnapshot(3, 100)
  const universe = mkUniverse(3, [mkProfile('Q-001')])

  const input = buildSetSolverInput(universe, snapshot)
  assert.equal(input.setNumber, 3, 'input.setNumber must equal 3')

  const slots = buildSetSolverPositionSlots(input)
  assert.equal(slots.length, 100)
  assert.equal(slots[0]!.setNumber, 3)
  assert.equal(slots[0]!.positionNumber, 1)
  assert.equal(slots[99]!.positionNumber, 100)
}

// ─── Test 3. Inactive Set ───────────────────────────────────────────────────

function test_inactive_set(): void {
  const snapshot = mkSnapshot(3, 100)
  const universe = mkUniverse(4, [mkProfile('Q-001')])

  assert.throws(
    () => buildSetSolverInput(universe, snapshot),
    (err: Error) => err.message.includes('Fatal SetSolverInput error') && err.message.includes('exceeds active target.sets'),
    'candidateUniverse.setNumber = 4 when target.sets = 3 must fail loud'
  )
}

// ─── Test 4. Duplicate questionCode within universe ─────────────────────────

function test_duplicate_question_code(): void {
  const snapshot = mkSnapshot(3, 100)
  const universe = mkUniverse(1, [mkProfile('Q-001'), mkProfile('Q-001')])

  assert.throws(
    () => buildSetSolverInput(universe, snapshot),
    (err: Error) => err.message.includes('Fatal SetSolverInput error') && err.message.includes('duplicate questionCode'),
    'duplicate questionCode inside universe.profiles must fail loud'
  )
}

// ─── Test 5. Empty profiles=[] ─────────────────────────────────────────────

function test_empty_profiles_allowed(): void {
  const snapshot = mkSnapshot(3, 100)
  const universe = mkUniverse(1, [])

  const input = buildSetSolverInput(universe, snapshot)
  assert.equal(input.setNumber, 1)
  assert.equal(input.candidateUniverse.profiles.length, 0, 'empty profiles array is explicitly allowed')
}

// ─── Test 6. Candidate with suitabilityProfiles=[] ──────────────────────────

function test_empty_suitability_profiles_allowed(): void {
  const snapshot = mkSnapshot(3, 100)
  const universe = mkUniverse(1, [mkProfile('Q-UNMATCHED', [])])

  const input = buildSetSolverInput(universe, snapshot)
  assert.equal(input.candidateUniverse.profiles.length, 1)
  assert.equal(input.candidateUniverse.profiles[0]!.suitabilityProfiles.length, 0, 'empty suitabilityProfiles array is explicitly allowed')
}

// ─── Test 7. Cross-Set reuse ────────────────────────────────────────────────

function test_cross_set_reuse(): void {
  const snapshot = mkSnapshot(3, 100)
  const universeSet1 = mkUniverse(1, [mkProfile('Q-001')])
  const universeSet2 = mkUniverse(2, [mkProfile('Q-001')])

  const input1 = buildSetSolverInput(universeSet1, snapshot)
  const input2 = buildSetSolverInput(universeSet2, snapshot)

  assert.equal(input1.setNumber, 1)
  assert.equal(input2.setNumber, 2)
  assert.equal(input1.candidateUniverse.profiles[0]!.questionCode, 'Q-001')
  assert.equal(input2.candidateUniverse.profiles[0]!.questionCode, 'Q-001')
}

// ─── Test 8. Reference preservation ────────────────────────────────────────

function test_reference_preservation(): void {
  const snapshot = mkSnapshot(3, 100)
  const universe = mkUniverse(1, [mkProfile('Q-001')])

  const input = buildSetSolverInput(universe, snapshot)

  assert.strictEqual(input.candidateUniverse, universe, 'candidateUniverse reference must be preserved by identity')
  assert.strictEqual(input.constraintSnapshot, snapshot, 'constraintSnapshot reference must be preserved by identity')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Valid Set 1', fn: test_valid_set_1 },
  { name: '2. Valid Set 3', fn: test_valid_set_3 },
  { name: '3. Inactive Set', fn: test_inactive_set },
  { name: '4. Duplicate questionCode within universe', fn: test_duplicate_question_code },
  { name: '5. Empty profiles=[] allowed', fn: test_empty_profiles_allowed },
  { name: '6. Candidate with suitabilityProfiles=[] allowed', fn: test_empty_suitability_profiles_allowed },
  { name: '7. Cross-Set reuse allowed', fn: test_cross_set_reuse },
  { name: '8. Reference preservation', fn: test_reference_preservation },
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(err as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
