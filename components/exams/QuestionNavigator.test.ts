// Unit tests for QuestionNavigator component logic (Phase 2A).
//
// Run with: npx jiti components/exams/QuestionNavigator.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveQuestionStatus,
  computeQuestionNavigatorStats,
} from './QuestionNavigator'

test('deriveQuestionStatus computes correct status for basic question', () => {
  const status = deriveQuestionStatus(
    7, // 0-based index (Question 8)
    'q-8',
    7, // currentIndex = 7
    { 'q-8': 'B' }, // answers
    { 'q-8': true } // flagged
  )

  assert.equal(status.index, 7)
  assert.equal(status.questionNumber, 8)
  assert.equal(status.questionId, 'q-8')
  assert.equal(status.isCurrent, true)
  assert.equal(status.isAnswered, true)
  assert.equal(status.isFlagged, true)
})

test('deriveQuestionStatus handles unanswered and unflagged question', () => {
  const status = deriveQuestionStatus(
    3,
    'q-4',
    0, // currentIndex is 0
    {},
    {}
  )

  assert.equal(status.questionNumber, 4)
  assert.equal(status.isCurrent, false)
  assert.equal(status.isAnswered, false)
  assert.equal(status.isFlagged, false)
})

test('computeQuestionNavigatorStats handles array of questions (40 items)', () => {
  const mockQuestions = Array.from({ length: 40 }, (_, i) => ({ id: `q-${i + 1}` }))
  const answers: Record<string, string> = { 'q-1': 'A', 'q-2': 'C', 'q-8': 'B' }
  const flagged: Record<string, boolean> = { 'q-8': true, 'q-15': true }
  const currentIndex = 7 // Question 8

  const result = computeQuestionNavigatorStats(mockQuestions, answers, flagged, currentIndex)

  assert.equal(result.total, 40)
  assert.equal(result.answeredCount, 3) // q-1, q-2, q-8
  assert.equal(result.unansweredCount, 37)
  assert.equal(result.flaggedCount, 2) // q-8, q-15
  assert.equal(result.items.length, 40)

  // Verify item #8 (index 7) combined state
  const item8 = result.items[7]
  assert.equal(item8.questionNumber, 8)
  assert.equal(item8.isCurrent, true)
  assert.equal(item8.isAnswered, true)
  assert.equal(item8.isFlagged, true)
})

test('computeQuestionNavigatorStats handles array of questions (100 items)', () => {
  const mockQuestions = Array.from({ length: 100 }, (_, i) => ({ id: `q-${i + 1}` }))
  const answers: Record<string, string> = {}
  for (let i = 1; i <= 50; i++) {
    answers[`q-${i}`] = 'A'
  }
  const flagged: Record<string, boolean> = { 'q-11': true, 'q-21': true }

  const result = computeQuestionNavigatorStats(mockQuestions, answers, flagged, 20)

  assert.equal(result.total, 100)
  assert.equal(result.answeredCount, 50)
  assert.equal(result.unansweredCount, 50)
  assert.equal(result.flaggedCount, 2)
  assert.equal(result.items.length, 100)

  // Verify item #21 (index 20, q-21) combined state: Current + Answered + Flagged
  const item21 = result.items[20]
  assert.equal(item21.questionNumber, 21)
  assert.equal(item21.questionId, 'q-21')
  assert.equal(item21.isCurrent, true)
  assert.equal(item21.isAnswered, true)
  assert.equal(item21.isFlagged, true)
})
