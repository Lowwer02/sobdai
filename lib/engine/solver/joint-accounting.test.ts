/**
 * lib/engine/solver/joint-accounting.test.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Joint Accounting State Tests.
 *
 * RUN: npx jiti lib/engine/solver/joint-accounting.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, Difficulty, LearningObjective, QuestionPattern, Tier } from '../generator/contracts'
import {
  applyCandidate,
  createJointAccounting,
  NULL_BUCKET,
  removeCandidate,
} from './joint-accounting'

// ─── Test Fixture Helpers ───────────────────────────────────────────────────

function mkCandidate(
  questionCode: string,
  opts: {
    document?: string
    tier?: Tier
    difficulty?: Difficulty
    learningObjective?: LearningObjective | null
    questionPattern?: QuestionPattern | null
  } = {}
): Candidate {
  return {
    identity: { questionCode, questionId: questionCode },
    metadata: {
      document: opts.document ?? 'LAW-ACT-HED-2562',
      difficulty: opts.difficulty ?? 'Easy',
      topic: 'มาตรา 6',
      status: 'Published',
      tier: opts.tier ?? 1,
      blueprintType: 'Memory',
      learningObjective: opts.learningObjective !== undefined ? opts.learningObjective : 'LO1',
      questionPattern: opts.questionPattern !== undefined ? opts.questionPattern : 'Positive',
      section: 'ม.6',
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

// ─── Test 1. Empty ledger ───────────────────────────────────────────────────

function test_empty_ledger(): void {
  const state = createJointAccounting(1)

  assert.equal(state.setNumber, 1)
  assert.equal(state.placedCount, 0)
  assert.equal(state.selectedQuestionCodes.size, 0)
  assert.equal(state.documentCounts.size, 0)
  assert.equal(state.tierCounts.size, 0)
  assert.equal(state.difficultyCounts.size, 0)
  assert.equal(state.learningObjectiveCounts.size, 0)
  assert.equal(state.patternCounts.size, 0)
}

// ─── Test 2. Apply one candidate ───────────────────────────────────────────

function test_apply_one_candidate(): void {
  const s0 = createJointAccounting(1)
  const c1 = mkCandidate('Q-001', {
    document: 'DOC-A',
    tier: 1,
    difficulty: 'Easy',
    learningObjective: 'LO1',
    questionPattern: 'Positive',
  })

  const s1 = applyCandidate(s0, c1)

  assert.equal(s1.placedCount, 1)
  assert.equal(s1.selectedQuestionCodes.has('Q-001'), true)

  assert.equal(s1.documentCounts.get('DOC-A'), 1)
  assert.equal(s1.tierCounts.get(1), 1)
  assert.equal(s1.difficultyCounts.get('Easy'), 1)
  assert.equal(s1.learningObjectiveCounts.get('LO1'), 1)
  assert.equal(s1.patternCounts.get('Positive'), 1)

  assert.equal(s1.placedCount, s1.selectedQuestionCodes.size)
}

// ─── Test 3. Duplicate apply ───────────────────────────────────────────────

function test_duplicate_apply(): void {
  const s0 = createJointAccounting(1)
  const c1 = mkCandidate('Q-001')
  const s1 = applyCandidate(s0, c1)

  assert.throws(
    () => applyCandidate(s1, c1),
    (err: Error) => err.message.includes('Fatal JointAccounting error') && err.message.includes("candidate 'Q-001' is already selected"),
    'applying the same candidate twice must fail loud'
  )
}

// ─── Test 4. NULL metadata ──────────────────────────────────────────────────

function test_null_metadata(): void {
  const s0 = createJointAccounting(1)
  const cNull = mkCandidate('Q-NULL', {
    learningObjective: null,
    questionPattern: null,
  })

  const s1 = applyCandidate(s0, cNull)

  assert.equal(s1.learningObjectiveCounts.get(NULL_BUCKET), 1, 'null LO must increment NULL_BUCKET')
  assert.equal(s1.patternCounts.get(NULL_BUCKET), 1, 'null Pattern must increment NULL_BUCKET')
  assert.equal(s1.learningObjectiveCounts.size, 1)
  assert.equal(s1.patternCounts.size, 1)
}

// ─── Test 5. Remove candidate ───────────────────────────────────────────────

function test_remove_candidate(): void {
  const s0 = createJointAccounting(1)
  const c1 = mkCandidate('Q-001', {
    document: 'DOC-A',
    tier: 1,
    difficulty: 'Easy',
    learningObjective: 'LO1',
    questionPattern: 'Positive',
  })

  const s1 = applyCandidate(s0, c1)
  const s2 = removeCandidate(s1, c1)

  assert.equal(s2.placedCount, 0)
  assert.equal(s2.selectedQuestionCodes.has('Q-001'), false)
  assert.equal(s2.documentCounts.has('DOC-A'), false, 'zero bucket must be deleted from Map')
  assert.equal(s2.tierCounts.has(1), false)
  assert.equal(s2.difficultyCounts.has('Easy'), false)
  assert.equal(s2.learningObjectiveCounts.has('LO1'), false)
  assert.equal(s2.patternCounts.has('Positive'), false)
  assert.equal(s2.placedCount, s2.selectedQuestionCodes.size)
}

// ─── Test 6. Apply then remove (Symmetry) ───────────────────────────────────

function test_apply_remove_symmetry(): void {
  const s0 = createJointAccounting(1)
  const c1 = mkCandidate('Q-001')

  const s1 = applyCandidate(s0, c1)
  const s2 = removeCandidate(s1, c1)

  assert.equal(s2.placedCount, s0.placedCount)
  assert.equal(s2.selectedQuestionCodes.size, s0.selectedQuestionCodes.size)
  assert.equal(s2.documentCounts.size, s0.documentCounts.size)
  assert.equal(s2.tierCounts.size, s0.tierCounts.size)
  assert.equal(s2.difficultyCounts.size, s0.difficultyCounts.size)
  assert.equal(s2.learningObjectiveCounts.size, s0.learningObjectiveCounts.size)
  assert.equal(s2.patternCounts.size, s0.patternCounts.size)
}

// ─── Test 7. Remove absent candidate ───────────────────────────────────────

function test_remove_absent_candidate(): void {
  const s0 = createJointAccounting(1)
  const c1 = mkCandidate('Q-001')

  assert.throws(
    () => removeCandidate(s0, c1),
    (err: Error) => err.message.includes('Fatal JointAccounting error') && err.message.includes("candidate 'Q-001' is not selected"),
    'removing candidate not in ledger must fail loud'
  )
}

// ─── Test 8. Cross-Set isolation ────────────────────────────────────────────

function test_cross_set_isolation(): void {
  const set1 = createJointAccounting(1)
  const set2 = createJointAccounting(2)
  const c1 = mkCandidate('Q-001')

  const set1Applied = applyCandidate(set1, c1)
  const set2Applied = applyCandidate(set2, c1)

  assert.equal(set1Applied.setNumber, 1)
  assert.equal(set1Applied.selectedQuestionCodes.has('Q-001'), true)

  assert.equal(set2Applied.setNumber, 2)
  assert.equal(set2Applied.selectedQuestionCodes.has('Q-001'), true)

  assert.equal(set1Applied.placedCount, 1)
  assert.equal(set2Applied.placedCount, 1)
}

// ─── Test 9. placedCount invariant ──────────────────────────────────────────

function test_placed_count_invariant(): void {
  let state = createJointAccounting(1)
  assert.equal(state.placedCount, state.selectedQuestionCodes.size)

  const c1 = mkCandidate('Q-001')
  const c2 = mkCandidate('Q-002')
  const c3 = mkCandidate('Q-003')

  state = applyCandidate(state, c1)
  assert.equal(state.placedCount, state.selectedQuestionCodes.size)

  state = applyCandidate(state, c2)
  assert.equal(state.placedCount, state.selectedQuestionCodes.size)

  state = applyCandidate(state, c3)
  assert.equal(state.placedCount, state.selectedQuestionCodes.size)

  state = removeCandidate(state, c2)
  assert.equal(state.placedCount, state.selectedQuestionCodes.size)
  assert.equal(state.placedCount, 2)
}

// ─── Test 10. Immutability ──────────────────────────────────────────────────

function test_immutability(): void {
  const s0 = createJointAccounting(1)
  const c1 = mkCandidate('Q-001')

  const s1 = applyCandidate(s0, c1)
  assert.equal(s0.placedCount, 0, 's0 must not be mutated by applyCandidate')
  assert.equal(s0.selectedQuestionCodes.has('Q-001'), false)
  assert.equal(s0.documentCounts.size, 0)

  const s2 = removeCandidate(s1, c1)
  assert.equal(s1.placedCount, 1, 's1 must not be mutated by removeCandidate')
  assert.equal(s1.selectedQuestionCodes.has('Q-001'), true)
  assert.equal(s1.documentCounts.size, 1)
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Empty ledger', fn: test_empty_ledger },
  { name: '2. Apply one candidate', fn: test_apply_one_candidate },
  { name: '3. Duplicate apply fail-loud', fn: test_duplicate_apply },
  { name: '4. NULL metadata handling', fn: test_null_metadata },
  { name: '5. Remove candidate & zero-bucket cleanup', fn: test_remove_candidate },
  { name: '6. Apply/remove symmetry', fn: test_apply_remove_symmetry },
  { name: '7. Remove absent candidate fail-loud', fn: test_remove_absent_candidate },
  { name: '8. Cross-Set isolation', fn: test_cross_set_isolation },
  { name: '9. placedCount invariant', fn: test_placed_count_invariant },
  { name: '10. Immutability guaranteed', fn: test_immutability },
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
