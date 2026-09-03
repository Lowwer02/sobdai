import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createGuestDailyState,
  selectDeterministicDailyQuestionIds,
  buildGuestDailyChallenge,
} from './guest-challenge.ts'

const rows = [
  ['11111111-1111-4111-8111-111111111111', 'A'],
  ['22222222-2222-4222-8222-222222222222', 'B'],
  ['33333333-3333-4333-8333-333333333333', 'C'],
  ['44444444-4444-4444-8444-444444444444', 'D'],
  ['55555555-5555-4555-8555-555555555555', 'A'],
  ['66666666-6666-4666-8666-666666666666', 'B'],
].map(([id, correct_answer], index) => ({
  id,
  content: `คำถาม ${index + 1}`,
  choice_a: 'ตัวเลือก A',
  choice_b: 'ตัวเลือก B',
  choice_c: 'ตัวเลือก C',
  choice_d: 'ตัวเลือก D',
  correct_answer,
  status: 'Published',
  hint: null,
  full_explanation: `คำอธิบาย ${index + 1}`,
}))

test('guest selection is deterministic, distinct, and independent of row order', () => {
  const date = '2026-09-03'
  const first = selectDeterministicDailyQuestionIds(date, rows)
  const second = selectDeterministicDailyQuestionIds(date, [...rows].reverse())

  assert.equal(first.length, 5)
  assert.equal(new Set(first).size, 5)
  assert.deepEqual(second, first)
})

test('guest state projects questions without answer keys or progress writes', () => {
  const ids = selectDeterministicDailyQuestionIds('2026-09-03', rows)
  const challenge = buildGuestDailyChallenge('2026-09-03', ids, rows)
  assert.ok(challenge)

  const state = createGuestDailyState(challenge)
  assert.equal(state.viewer, 'guest')
  assert.equal(state.questions.length, 5)
  assert.deepEqual(state.progress.answers, {})
  assert.deepEqual(state.results, [])
  assert.equal(JSON.stringify(state).includes('correct_answer'), false)
  assert.equal(JSON.stringify(state).includes('full_explanation'), false)
})
