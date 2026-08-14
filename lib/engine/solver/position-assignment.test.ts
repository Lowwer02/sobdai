/**
 * lib/engine/solver/position-assignment.test.ts
 * ----------------------------------------------------------------------------
 * Physical Position Assignment Tests.
 *
 * RUN: npx jiti lib/engine/solver/position-assignment.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, Tier } from '../generator/contracts'
import type { PreTieCandidateProfile } from '../ranking/contracts'
import { assignCandidatesToPositions } from './position-assignment'

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

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. Basic assignment — order preserved exactly, NOT sorted by questionCode.
function test_basic_assignment_order_preserved(): void {
  const selected = [mkProfile('Q-003'), mkProfile('Q-001'), mkProfile('Q-002')]
  const assignment = assignCandidatesToPositions(1, 3, selected)

  assert.equal(assignment.placements.length, 3, 'placements.length === perSet')
  assert.deepEqual(
    assignment.placements.map((p) => p.position.positionNumber),
    [1, 2, 3],
    'positionNumbers must be [1, 2, 3]'
  )
  // Order must remain EXACTLY [Q-003, Q-001, Q-002] — must NOT sort by questionCode.
  assert.deepEqual(
    assignment.placements.map((p) => p.candidate.questionCode),
    ['Q-003', 'Q-001', 'Q-002'],
    'candidate order must be preserved exactly, not sorted'
  )
}

// 2. Set identity — setNumber propagated to assignment and every placement.
function test_set_identity(): void {
  const selected = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const assignment = assignCandidatesToPositions(3, 3, selected)

  assert.equal(assignment.setNumber, 3, 'assignment.setNumber === 3')
  for (const placement of assignment.placements) {
    assert.equal(placement.position.setNumber, 3, 'every placement.position.setNumber === 3')
  }
}

// 3. Cardinality mismatch — fail loud.
function test_cardinality_mismatch_fail_loud(): void {
  const selected = [mkProfile('Q-001'), mkProfile('Q-002')] // length 2

  assert.throws(
    () => assignCandidatesToPositions(1, 3, selected),
    (err: Error) =>
      err.message.includes('Fatal PositionAssignment error') &&
      err.message.includes('must equal perSet'),
    'selectedCandidates.length != perSet must fail loud'
  )
}

// 4. Invalid perSet (0, negative, non-integer) — fail loud.
function test_invalid_perset_fail_loud(): void {
  const invalidPerSets = [0, -5, 2.5]
  for (const perSet of invalidPerSets) {
    assert.throws(
      () => assignCandidatesToPositions(1, perSet, [mkProfile('Q-001')]),
      (err: Error) =>
        err.message.includes('Fatal PositionAssignment error') &&
        err.message.includes('perSet must be a positive integer'),
      `invalid perSet ${perSet} must fail loud`
    )
  }
}

// 5. Duplicate questionCode — fail loud.
function test_duplicate_question_code_fail_loud(): void {
  const selected = [mkProfile('Q-001'), mkProfile('Q-001'), mkProfile('Q-002')]

  assert.throws(
    () => assignCandidatesToPositions(1, 3, selected),
    (err: Error) =>
      err.message.includes('Fatal PositionAssignment error') &&
      err.message.includes('duplicate questionCode'),
    'duplicate questionCode must fail loud'
  )
}

// 6. PositionSlot delegation — physical numbering comes from buildPositionSlots.
function test_position_slot_delegation(): void {
  const selected = Array.from({ length: 5 }, (_, i) =>
    mkProfile(`Q-${String(i + 1).padStart(3, '0')}`)
  )
  const assignment = assignCandidatesToPositions(1, 5, selected)

  assert.deepEqual(
    assignment.placements.map((p) => p.position.positionNumber),
    [1, 2, 3, 4, 5],
    'physical numbering must come from the existing PositionSlot builder contract'
  )
}

// 7. Candidate reference preservation — exact same object reference per index.
function test_candidate_reference_preservation(): void {
  const selected = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const assignment = assignCandidatesToPositions(1, 3, selected)

  for (let i = 0; i < selected.length; i++) {
    assert.equal(
      assignment.placements[i]!.candidate,
      selected[i],
      `placements[${i}].candidate must be the SAME object reference as selectedCandidates[${i}]`
    )
  }
}

// 8. Immutability — selectedCandidates array and CandidateProfile objects unchanged.
function test_immutability(): void {
  const selected = [mkProfile('Q-003'), mkProfile('Q-001'), mkProfile('Q-002')]
  const codesBefore = selected.map((p) => p.questionCode)
  const lenBefore = selected.length
  const candidateRefsBefore = selected.map((p) => p.candidate)
  const firstDocBefore = selected[0]!.candidate.metadata.document

  assignCandidatesToPositions(1, 3, selected)

  assert.equal(selected.length, lenBefore, 'selectedCandidates array length must not change')
  assert.deepEqual(
    selected.map((p) => p.questionCode),
    codesBefore,
    'selectedCandidates contents/order must not change'
  )
  for (let i = 0; i < selected.length; i++) {
    assert.equal(
      selected[i]!.candidate,
      candidateRefsBefore[i],
      `CandidateProfile object reference [${i}] must be unchanged (not replaced/swapped)`
    )
  }
  assert.equal(
    selected[0]!.candidate.metadata.document,
    firstDocBefore,
    'Candidate object fields must not be mutated'
  )
}

// 9. Determinism — same logical input yields structurally identical assignment.
function test_determinism(): void {
  const mk = (): PreTieCandidateProfile[] => [mkProfile('Q-003'), mkProfile('Q-001'), mkProfile('Q-002')]
  const a1 = assignCandidatesToPositions(1, 3, mk())
  const a2 = assignCandidatesToPositions(1, 3, mk())

  assert.equal(a1.setNumber, a2.setNumber, 'setNumber must match')
  assert.deepEqual(
    a1.placements.map((p) => p.position.positionNumber),
    a2.placements.map((p) => p.position.positionNumber),
    'positionNumbers must match across runs'
  )
  assert.deepEqual(
    a1.placements.map((p) => p.candidate.questionCode),
    a2.placements.map((p) => p.candidate.questionCode),
    'candidate order must match across runs'
  )
}

// 10. Cross-Set independence — same Q-001 may be assigned independently per Set.
function test_cross_set_independence(): void {
  const set1 = [mkProfile('Q-001'), mkProfile('Q-002'), mkProfile('Q-003')]
  const set2 = [mkProfile('Q-001'), mkProfile('Q-004'), mkProfile('Q-005')]

  const a1 = assignCandidatesToPositions(1, 3, set1)
  const a2 = assignCandidatesToPositions(2, 3, set2)

  assert.equal(a1.setNumber, 1)
  assert.equal(a2.setNumber, 2)
  assert.ok(
    a1.placements.some((p) => p.candidate.questionCode === 'Q-001'),
    'Set 1 may assign Q-001'
  )
  assert.ok(
    a2.placements.some((p) => p.candidate.questionCode === 'Q-001'),
    'Set 2 may independently assign Q-001 — no cross-Set uniqueness enforcement'
  )
  // Each Set independently owns positionNumber 1.
  assert.equal(a1.placements[0]!.position.positionNumber, 1)
  assert.equal(a2.placements[0]!.position.positionNumber, 1)
  assert.equal(a1.placements[0]!.position.setNumber, 1)
  assert.equal(a2.placements[0]!.position.setNumber, 2)
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Basic assignment — order preserved exactly (not sorted)', fn: test_basic_assignment_order_preserved },
  { name: '2. Set identity — setNumber propagated', fn: test_set_identity },
  { name: '3. Cardinality mismatch — fail loud', fn: test_cardinality_mismatch_fail_loud },
  { name: '4. Invalid perSet (0, negative, non-integer) — fail loud', fn: test_invalid_perset_fail_loud },
  { name: '5. Duplicate questionCode — fail loud', fn: test_duplicate_question_code_fail_loud },
  { name: '6. PositionSlot delegation — [1,2,3,4,5]', fn: test_position_slot_delegation },
  { name: '7. Candidate reference preservation — same object refs', fn: test_candidate_reference_preservation },
  { name: '8. Immutability — no input mutation', fn: test_immutability },
  { name: '9. Determinism — identical order across runs', fn: test_determinism },
  { name: '10. Cross-Set independence — Q-001 in both Sets', fn: test_cross_set_independence },
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
