/**
 * lib/assessment/attempt-review-data.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the pure validation/filter/count helpers in the attempt-review
 * data layer. No DB, no React. Uses Node's built-in test runner.
 *
 * RUN: npx jiti lib/assessment/attempt-review-data.test.ts
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAnswerSummary,
  normalizeView,
  filterSummary,
  summaryCounts,
} from './attempt-review-data'

// ─── validateAnswerSummary ───────────────────────────────────────────────────

test('validateAnswerSummary: accepts a well-formed array and preserves order', () => {
  const out = validateAnswerSummary([
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false, subject: 'กฎหมาย', law: null, topic: null },
    { questionId: 'q2', selected: 'C', correct: 'A', isCorrect: false, flagged: true, subject: null, law: null, topic: 'สัญญา' },
    { questionId: 'q3', selected: null, correct: 'B', isCorrect: false, flagged: false, subject: null, law: null, topic: null },
  ])
  assert.equal(out.length, 3)
  assert.deepEqual(out.map((e) => e.questionId), ['q1', 'q2', 'q3'])
  assert.equal(out[0].isCorrect, true)
  assert.equal(out[1].selected, 'C')
  assert.equal(out[2].selected, null)
})

test('validateAnswerSummary: returns [] for non-array input', () => {
  assert.deepEqual(validateAnswerSummary(null), [])
  assert.deepEqual(validateAnswerSummary({}), [])
  assert.deepEqual(validateAnswerSummary('not an array'), [])
  assert.deepEqual(validateAnswerSummary(undefined), [])
})

test('validateAnswerSummary: skips malformed entries without throwing', () => {
  const out = validateAnswerSummary([
    { questionId: '', correct: 'A', isCorrect: true, flagged: false }, // empty id
    { correct: 'A', isCorrect: true, flagged: false }, // missing id
    { questionId: 'q1', correct: 'X', isCorrect: true, flagged: false }, // bad correct
    { questionId: 'q2', correct: 'A', isCorrect: 'yes', flagged: false }, // non-bool isCorrect
    { questionId: 'q3', correct: 'A', isCorrect: true, flagged: 'true' }, // non-bool flagged
    { questionId: 'q4', correct: 'A', isCorrect: true, flagged: false, selected: 'Z' }, // bad selected
    'garbage',
    null,
    { questionId: 'q5', correct: 'A', isCorrect: true, flagged: false }, // valid
  ])
  assert.deepEqual(out.map((e) => e.questionId), ['q5'])
})

test('validateAnswerSummary: dedupes duplicate question ids, keeping first valid', () => {
  const out = validateAnswerSummary([
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false },
    { questionId: 'q1', selected: 'B', correct: 'B', isCorrect: true, flagged: true }, // dup
    { questionId: 'q2', selected: null, correct: 'B', isCorrect: false, flagged: false },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].questionId, 'q1')
  assert.equal(out[0].flagged, false) // first valid occurrence wins
})

test('validateAnswerSummary: lowercases choice letters normalized to upper', () => {
  const out = validateAnswerSummary([
    { questionId: 'q1', selected: 'a', correct: 'c', isCorrect: false, flagged: false },
  ])
  assert.equal(out[0].selected, 'A')
  assert.equal(out[0].correct, 'C')
})

test('validateAnswerSummary: normalizes non-string subject/law/topic to null', () => {
  const out = validateAnswerSummary([
    { questionId: 'q1', selected: null, correct: 'A', isCorrect: false, flagged: false, subject: 42 as unknown as string, law: undefined as unknown as string, topic: {} as unknown as string },
  ])
  assert.equal(out[0].subject, null)
  assert.equal(out[0].law, null)
  assert.equal(out[0].topic, null)
})

// ─── normalizeView ───────────────────────────────────────────────────────────

test('normalizeView: maps known and unknown values safely', () => {
  assert.equal(normalizeView('all'), 'all')
  assert.equal(normalizeView('incorrect'), 'incorrect')
  assert.equal(normalizeView(undefined), 'incorrect')
  assert.equal(normalizeView('garbage'), 'incorrect')
  assert.equal(normalizeView('ALL'), 'incorrect') // case-sensitive; falls back
})

// ─── filterSummary ───────────────────────────────────────────────────────────

test('filterSummary: incorrect view includes wrong + unanswered, excludes correct', () => {
  const summary = validateAnswerSummary([
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false }, // correct → excluded
    { questionId: 'q2', selected: 'C', correct: 'A', isCorrect: false, flagged: false }, // wrong → included
    { questionId: 'q3', selected: null, correct: 'B', isCorrect: false, flagged: false }, // unanswered → included
  ])
  const out = filterSummary(summary, 'incorrect')
  assert.deepEqual(out.map((e) => e.questionId), ['q2', 'q3'])
})

test('filterSummary: all view returns every entry in original order', () => {
  const summary = validateAnswerSummary([
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false },
    { questionId: 'q2', selected: 'C', correct: 'A', isCorrect: false, flagged: false },
    { questionId: 'q3', selected: null, correct: 'B', isCorrect: false, flagged: false },
  ])
  const out = filterSummary(summary, 'all')
  assert.deepEqual(out.map((e) => e.questionId), ['q1', 'q2', 'q3'])
})

test('filterSummary: empty summary yields empty for both views', () => {
  assert.deepEqual(filterSummary([], 'incorrect'), [])
  assert.deepEqual(filterSummary([], 'all'), [])
})

// ─── summaryCounts ───────────────────────────────────────────────────────────

test('summaryCounts: counts correct/wrong/unanswered safely', () => {
  const summary = validateAnswerSummary([
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false },
    { questionId: 'q2', selected: 'C', correct: 'A', isCorrect: false, flagged: false },
    { questionId: 'q3', selected: null, correct: 'B', isCorrect: false, flagged: false },
    { questionId: 'q4', selected: 'B', correct: 'B', isCorrect: true, flagged: false },
  ])
  assert.deepEqual(summaryCounts(summary), { correct: 2, wrong: 1, unanswered: 1 })
})

test('summaryCounts: empty summary yields zeros', () => {
  assert.deepEqual(summaryCounts([]), { correct: 0, wrong: 0, unanswered: 0 })
})

test('summaryCounts: perfect attempt yields zero wrong/unanswered', () => {
  const summary = validateAnswerSummary([
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false },
    { questionId: 'q2', selected: 'B', correct: 'B', isCorrect: true, flagged: false },
  ])
  assert.deepEqual(summaryCounts(summary), { correct: 2, wrong: 0, unanswered: 0 })
})
