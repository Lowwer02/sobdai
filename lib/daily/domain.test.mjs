import assert from 'node:assert/strict'
import test from 'node:test'
import { getBangkokDateKey } from '../activity/date.ts'
import {
  DAILY_QUESTS,
  DAILY_REWARDS,
  applyDailyAnswer,
  applyDailyCompletion,
  recomputeStreakTransition,
  sanitizeDailyAnswers,
} from './domain.ts'

const questionIds = ['q1', 'q2', 'q3', 'q4', 'q5']
const correctAnswers = { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'A' }

function pendingProgress() {
  return {
    currentIndex: 0,
    answers: {},
    questionsAnswered: 0,
    correctAnswers: 0,
    dailyCompleted: false,
    expEarned: 0,
    completedAt: null,
  }
}

function lifetime(lastQualifiedDate = null, longestStreak = 0) {
  return {
    totalExp: 0,
    currentStreak: 0,
    longestStreak,
    lastQualifiedDate,
    totalDailyQuestions: 0,
    totalDailyCorrect: 0,
  }
}

function submitAll(choices, localDate = '2026-09-02', order = questionIds) {
  let progress = pendingProgress()
  let userLifetime = lifetime()
  let last = null
  for (const [index, questionId] of order.entries()) {
    last = applyDailyAnswer(
      progress,
      userLifetime,
      questionId,
      choices[questionId],
      correctAnswers,
      questionIds,
      index,
      localDate,
    )
    progress = last.progress
    userLifetime = last.lifetime
  }
  return { progress, lifetime: userLifetime, last }
}

test('the Daily contract contains exactly one consistency quest', () => {
  assert.deepEqual(
    DAILY_QUESTS.map((quest) => [quest.id, quest.rewardExp]),
    [['complete-daily-five', 50]],
  )
  assert.equal(DAILY_REWARDS.maximumPerDay, 50)
})

test('Bangkok date changes at the correct UTC boundary', () => {
  assert.equal(getBangkokDateKey('2026-09-01T16:59:59.999Z'), '2026-09-01')
  assert.equal(getBangkokDateKey('2026-09-01T17:00:00.000Z'), '2026-09-02')
})

test('each answer merges into the aggregate and retrying the same answer is idempotent', () => {
  const first = applyDailyAnswer(
    pendingProgress(),
    lifetime(),
    'q1',
    'A',
    correctAnswers,
    questionIds,
    0,
    '2026-09-02',
  )
  const second = applyDailyAnswer(
    first.progress,
    first.lifetime,
    'q2',
    'D',
    correctAnswers,
    questionIds,
    1,
    '2026-09-02',
  )
  const retry = applyDailyAnswer(
    second.progress,
    second.lifetime,
    'q1',
    'A',
    correctAnswers,
    questionIds,
    0,
    '2026-09-02',
  )

  assert.deepEqual(second.progress.answers, { q1: 'A', q2: 'D' })
  assert.equal(second.progress.questionsAnswered, 2)
  assert.equal(second.progress.correctAnswers, 1)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.expDelta, 0)
  assert.deepEqual(retry.progress.answers, second.progress.answers)
  assert.deepEqual(retry.lifetime, second.lifetime)
  assert.throws(
    () => applyDailyAnswer(second.progress, second.lifetime, 'q1', 'B', correctAnswers, questionIds, 0, '2026-09-02'),
    /already terminal/,
  )
})

test('correctness is informational and cannot change the +50 completion reward', () => {
  const allCorrect = submitAll({ q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'A' })
  const allWrong = submitAll({ q1: 'B', q2: 'A', q3: 'A', q4: 'A', q5: 'B' })

  assert.equal(allCorrect.progress.correctAnswers, 5)
  assert.equal(allWrong.progress.correctAnswers, 0)
  assert.equal(allCorrect.last.expDelta, 50)
  assert.equal(allWrong.last.expDelta, 50)
  assert.equal(allCorrect.progress.expEarned, 50)
  assert.equal(allWrong.progress.expEarned, 50)
  assert.equal(allCorrect.lifetime.totalExp, 50)
  assert.equal(allWrong.lifetime.totalExp, 50)
})

test('terminal completion and a repeated fifth-answer request do not add EXP twice', () => {
  const completed = submitAll({ q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'A' })
  const retry = applyDailyAnswer(
    completed.progress,
    completed.lifetime,
    'q5',
    'A',
    correctAnswers,
    questionIds,
    4,
    '2026-09-02',
  )
  assert.equal(completed.progress.dailyCompleted, true)
  assert.equal(completed.progress.expEarned, 50)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.expDelta, 0)
  assert.deepEqual(retry.progress, completed.progress)
  assert.deepEqual(retry.lifetime, completed.lifetime)
})

test('a delayed retry cannot erase other terminal answers', () => {
  const first = applyDailyAnswer(pendingProgress(), lifetime(), 'q1', 'A', correctAnswers, questionIds, 0, '2026-09-02')
  const newer = applyDailyAnswer(first.progress, first.lifetime, 'q2', 'B', correctAnswers, questionIds, 1, '2026-09-02')
  const delayedRetry = applyDailyAnswer(first.progress, first.lifetime, 'q1', 'A', correctAnswers, questionIds, 0, '2026-09-02')

  assert.deepEqual(newer.progress.answers, { q1: 'A', q2: 'B' })
  assert.deepEqual(delayedRetry.progress.answers, { q1: 'A' })
  assert.notDeepEqual(delayedRetry.progress.answers, newer.progress.answers)
  assert.equal(delayedRetry.idempotent, true)
})

test('completion requires five terminal answers and no answer is reward-bearing by itself', () => {
  const partial = applyDailyAnswer(pendingProgress(), lifetime(), 'q1', 'A', correctAnswers, questionIds, 0, '2026-09-02')
  assert.equal(partial.expDelta, 0)
  assert.equal(partial.progress.dailyCompleted, false)
  assert.throws(() => applyDailyCompletion(partial.progress, partial.lifetime, '2026-09-02'), /five terminal answers/)
})

test('adjacent completed days converge in either commit order', () => {
  const dayThenNext = recomputeStreakTransition(
    recomputeStreakTransition(lifetime(), ['2026-09-02']),
    ['2026-09-02', '2026-09-03'],
  )
  const nextThenDay = recomputeStreakTransition(
    recomputeStreakTransition(lifetime(), ['2026-09-03']),
    ['2026-09-02', '2026-09-03'],
  )

  assert.deepEqual(dayThenNext, { currentStreak: 2, longestStreak: 2, lastQualifiedDate: '2026-09-03' })
  assert.deepEqual(nextThenDay, dayThenNext)
})

test('longest streak is monotonic while current streak follows the latest completed island', () => {
  const result = recomputeStreakTransition(
    { currentStreak: 1, longestStreak: 5, lastQualifiedDate: '2026-09-10' },
    ['2026-09-10', '2026-09-12'],
  )
  assert.equal(result.currentStreak, 1)
  assert.equal(result.longestStreak, 5)
  assert.equal(result.lastQualifiedDate, '2026-09-12')
})

test('transport answers accept only a compact choice object', () => {
  assert.deepEqual(sanitizeDailyAnswers({ q1: 'A', q2: 'D' }), { q1: 'A', q2: 'D' })
  assert.equal(sanitizeDailyAnswers({ q1: 'X' }), null)
  assert.equal(sanitizeDailyAnswers({ q1: null }), null)
  assert.equal(sanitizeDailyAnswers(['A']), null)
})
