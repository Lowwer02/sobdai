/**
 * lib/assessment/attempt-order.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the deterministic attempt question order (Repeat Exam
 * Question Shuffle V1). No DB, no React. Uses Node's built-in test runner.
 *
 * RUN: npx jiti lib/assessment/attempt-order.test.ts
 *
 * The GOLDEN tests below pin the exact output of shuffle v1 for fixed session
 * ids. They are a FREEZE CONTRACT: if they fail after an edit to
 * lib/assessment/attempt-order.ts, the edit would silently reshuffle resumed
 * in-progress sessions and must be reverted. Never regenerate the golden
 * arrays to match a changed implementation — a new algorithm is version 2.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAttemptQuestionOrder,
  nextSessionOrderVersion,
  isSupportedQuestionOrderVersion,
  BASE_ORDER_VERSION,
  REPEAT_SHUFFLE_VERSION,
} from './attempt-order'
import { computeOutcome } from './outcome'

// ─── Fixtures (fixed constants — no randomness anywhere in this file) ───────

/** Golden session id A (uuid-shaped; frozen forever). */
const GOLDEN_SESSION_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001'
/** Golden session id B (uuid-shaped; frozen forever). */
const GOLDEN_SESSION_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002'

/** A typical 40-question Exam Set in base sort_order. */
const BASE_40 = Array.from({ length: 40 }, (_, i) => `q${String(i + 1).padStart(2, '0')}`)

/** FROZEN v1 output for GOLDEN_SESSION_A over BASE_40. */
const GOLDEN_ORDER_A = [
  'q19', 'q23', 'q37', 'q15', 'q01', 'q06', 'q11', 'q29', 'q28', 'q31',
  'q30', 'q12', 'q26', 'q20', 'q40', 'q09', 'q24', 'q36', 'q04', 'q10',
  'q03', 'q22', 'q39', 'q33', 'q25', 'q14', 'q34', 'q02', 'q32', 'q38',
  'q18', 'q08', 'q27', 'q07', 'q05', 'q21', 'q17', 'q13', 'q35', 'q16',
]

/** FROZEN v1 output for GOLDEN_SESSION_B over BASE_40. */
const GOLDEN_ORDER_B = [
  'q16', 'q15', 'q03', 'q02', 'q27', 'q28', 'q13', 'q33', 'q35', 'q18',
  'q14', 'q09', 'q05', 'q22', 'q38', 'q01', 'q08', 'q32', 'q40', 'q04',
  'q11', 'q29', 'q39', 'q07', 'q20', 'q31', 'q06', 'q36', 'q10', 'q21',
  'q17', 'q24', 'q26', 'q30', 'q25', 'q34', 'q19', 'q23', 'q12', 'q37',
]

/** Deterministically derive N distinct fixed session ids (no Math.random). */
function fixedSessionIds(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `f0000000-0000-4000-8000-${String(1000000000 + i).slice(-12)}`,
  )
}

// ─── Version 0: base order preserved ─────────────────────────────────────────

test('v0: preserves the exact input order (identity content)', () => {
  const out = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 0,
  })
  assert.deepEqual(out, BASE_40)
})

test('v0: returns a NEW array, not the input reference', () => {
  const out = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 0,
  })
  assert.notEqual(out, BASE_40)
  assert.deepEqual(out, BASE_40)
})

test('v0: ignores the session id entirely — an old session is never shuffled', () => {
  // Even a session id that "looks like" a repeat keeps base order at v0.
  for (const sessionId of fixedSessionIds(10)) {
    assert.deepEqual(
      applyAttemptQuestionOrder(BASE_40, { sessionId, questionOrderVersion: 0 }),
      BASE_40,
    )
  }
})

test('unknown version (e.g. a future 2 this code does not know) degrades to base order', () => {
  assert.deepEqual(
    applyAttemptQuestionOrder(BASE_40, {
      sessionId: GOLDEN_SESSION_A,
      questionOrderVersion: 2,
    }),
    BASE_40,
  )
  assert.deepEqual(
    applyAttemptQuestionOrder(BASE_40, {
      sessionId: GOLDEN_SESSION_A,
      questionOrderVersion: Number.NaN,
    }),
    BASE_40,
  )
})

// ─── Version 1: deterministic permutation ────────────────────────────────────

test('v1 GOLDEN: session A over the 40-question set produces the frozen order', () => {
  const out = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 1,
  })
  assert.deepEqual(out, GOLDEN_ORDER_A)
})

test('v1 GOLDEN: session B over the 40-question set produces a different frozen order', () => {
  const out = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_B,
    questionOrderVersion: 1,
  })
  assert.deepEqual(out, GOLDEN_ORDER_B)
  assert.notDeepEqual(GOLDEN_ORDER_A, GOLDEN_ORDER_B)
})

test('v1: same session id → identical order on every call (refresh/resume)', () => {
  const first = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 1,
  })
  const second = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 1,
  })
  assert.deepEqual(first, second)
})

test('v1: same session id + a freshly built copy of the input → identical order', () => {
  const freshInput = [...BASE_40]
  assert.deepEqual(
    applyAttemptQuestionOrder(freshInput, {
      sessionId: GOLDEN_SESSION_A,
      questionOrderVersion: 1,
    }),
    GOLDEN_ORDER_A,
  )
})

test('v1: output is always a permutation — same ids, none missing, none duplicated', () => {
  for (const sessionId of fixedSessionIds(50)) {
    const out = applyAttemptQuestionOrder(BASE_40, { sessionId, questionOrderVersion: 1 })
    assert.equal(out.length, 40)
    // Same multiset (catches both missing and duplicated ids).
    assert.deepEqual([...out].sort(), [...BASE_40].sort())
    // No duplicates.
    assert.equal(new Set(out).size, 40)
  }
})

test('v1: distinct fixed session ids give distinct permutations (fixed inputs, not probabilistic)', () => {
  const orders = new Set(
    fixedSessionIds(50).map(
      (sessionId) =>
        JSON.stringify(applyAttemptQuestionOrder(BASE_40, { sessionId, questionOrderVersion: 1 })),
    ),
  )
  // All inputs are fixed constants, so this count is fully deterministic.
  assert.equal(orders.size, 50)
})

test('v1: does not mutate the input array', () => {
  const input = [...BASE_40]
  const snapshot = JSON.stringify(input)
  applyAttemptQuestionOrder(input, { sessionId: GOLDEN_SESSION_A, questionOrderVersion: 1 })
  assert.equal(JSON.stringify(input), snapshot)
})

test('v1: edge sizes — empty and single-element sets pass through safely', () => {
  assert.deepEqual(applyAttemptQuestionOrder([], { sessionId: GOLDEN_SESSION_A, questionOrderVersion: 1 }), [])
  assert.deepEqual(
    applyAttemptQuestionOrder(['only'], { sessionId: GOLDEN_SESSION_A, questionOrderVersion: 1 }),
    ['only'],
  )
})

// ─── Creation-time decision (nextSessionOrderVersion) ────────────────────────

test('new session with NO prior completed attempt → version 0 (first attempt stays normal)', () => {
  assert.equal(nextSessionOrderVersion(false), BASE_ORDER_VERSION)
})

test('new session WITH a prior completed attempt → version 1 (repeat shuffles)', () => {
  assert.equal(nextSessionOrderVersion(true), REPEAT_SHUFFLE_VERSION)
})

test('version guard accepts 0 and 1, rejects everything else', () => {
  assert.equal(isSupportedQuestionOrderVersion(0), true)
  assert.equal(isSupportedQuestionOrderVersion(1), true)
  assert.equal(isSupportedQuestionOrderVersion(2), false)
  assert.equal(isSupportedQuestionOrderVersion(undefined), false)
  assert.equal(isSupportedQuestionOrderVersion('1'), false)
})

// ─── Resume equivalence: same index → same question ──────────────────────────

test('resume: a saved current_index points at the SAME question after re-applying the order', () => {
  // Simulate: attempt saves current_index = 17 against the v1 order; a later
  // resume reconstructs the order deterministically and re-clamps the index.
  const attempt1 = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 1,
  })
  const savedIndex = 17
  const savedQuestionId = attempt1[savedIndex]

  const attempt2 = applyAttemptQuestionOrder(BASE_40, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 1,
  })
  assert.equal(attempt2[savedIndex], savedQuestionId)
  // And it is generally NOT the question sort_order would put there.
  assert.notEqual(BASE_40[savedIndex], savedQuestionId)
})

// ─── Scoring / answers are order-independent (questionId-keyed) ──────────────

test('computeOutcome: identical score/verdict under base vs shuffled order', () => {
  const questions = BASE_40.map((id, i) => ({
    id,
    correct_answer: ['A', 'B', 'C', 'D'][i % 4],
    subject: i % 2 === 0 ? 'กฎหมาย' : 'ภาษี',
    law: null,
    topic: i % 3 === 0 ? 'สัญญา' : null,
  }))
  // Answer keyed by questionId: correct for even ids, wrong for odd, one gap.
  const answers: Record<string, string> = {}
  for (const q of questions) {
    if (q.id === 'q40') continue // leave one unanswered
    answers[q.id] = Number(q.id.slice(1)) % 2 === 0 ? q.correct_answer : 'A'
  }

  const base = computeOutcome({
    examSetId: 'es1', packageId: 'pkg1', mode: 'simulation',
    passingScore: 60, timeUsedSeconds: 100, questions, answers, flagged: {},
  })
  const shuffledInput = applyAttemptQuestionOrder(questions, {
    sessionId: GOLDEN_SESSION_A,
    questionOrderVersion: 1,
  })
  const shuffled = computeOutcome({
    examSetId: 'es1', packageId: 'pkg1', mode: 'simulation',
    passingScore: 60, timeUsedSeconds: 100, questions: shuffledInput, answers, flagged: {},
  })

  // Headline numbers must be identical.
  assert.equal(shuffled.score, base.score)
  assert.equal(shuffled.answeredCount, base.answeredCount)
  assert.equal(shuffled.accuracy, base.accuracy)
  assert.equal(shuffled.passed, base.passed)
  assert.equal(shuffled.total, base.total)

  // Per-question verdicts must be identical, keyed by questionId.
  const byId = (list: typeof base.questions) =>
    Object.fromEntries(list.map((e) => [e.questionId, `${e.selected}|${e.correct}|${e.isCorrect}`]))
  assert.deepEqual(byId(shuffled.questions), byId(base.questions))

  // Derived diagnostics identical (order-insensitive comparison).
  assert.deepEqual(
    [...shuffled.weakTopics].sort((a, b) => a.name.localeCompare(b.name)),
    [...base.weakTopics].sort((a, b) => a.name.localeCompare(b.name)),
  )
  assert.deepEqual(
    [...shuffled.subjectBreakdown].sort((a, b) => a.subject.localeCompare(b.subject)),
    [...base.subjectBreakdown].sort((a, b) => a.subject.localeCompare(b.subject)),
  )
})
