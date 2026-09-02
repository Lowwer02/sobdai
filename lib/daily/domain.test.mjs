import assert from 'node:assert/strict'
import test from 'node:test'
import { getBangkokDateKey } from '../activity/date.ts'
import {
  DAILY_QUESTS,
  applyDailyCompletion,
  computeStreakTransition,
  sanitizeDailyAnswers,
} from './domain.ts'

function pendingProgress(correctAnswers = 0) {
  return {
    currentIndex: 4,
    answers: {},
    questionsAnswered: 5,
    correctAnswers,
    dailyCompleted: false,
    questOneCompleted: false,
    questTwoCompleted: false,
    bothQuestsCompleted: false,
    expEarned: 0,
    completedAt: null,
  }
}

function lifetime(lastQualifiedDate = null) {
  return {
    totalExp: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastQualifiedDate,
    totalDailyQuestions: 0,
    totalDailyCorrect: 0,
  }
}

test('the Daily contract contains exactly two quests and no deferred quest', () => {
  assert.deepEqual(
    DAILY_QUESTS.map((quest) => [quest.id, quest.rewardExp]),
    [
      ['complete-daily-five', 50],
      ['score-three-of-five', 20],
    ],
  )
})

test('Bangkok date changes at the correct UTC boundary', () => {
  assert.equal(getBangkokDateKey('2026-09-01T16:59:59.999Z'), '2026-09-01')
  assert.equal(getBangkokDateKey('2026-09-01T17:00:00.000Z'), '2026-09-02')
})

test('streak is unchanged today, increments from yesterday, and resets for older/null', () => {
  assert.deepEqual(
    computeStreakTransition(lifetime('2026-09-02'), '2026-09-02'),
    { currentStreak: 0, longestStreak: 0, lastQualifiedDate: '2026-09-02' },
  )
  assert.deepEqual(
    computeStreakTransition({ ...lifetime('2026-09-01'), currentStreak: 4, longestStreak: 4 }, '2026-09-02'),
    { currentStreak: 5, longestStreak: 5, lastQualifiedDate: '2026-09-02' },
  )
  assert.deepEqual(
    computeStreakTransition({ ...lifetime('2026-08-31'), currentStreak: 4, longestStreak: 4 }, '2026-09-02'),
    { currentStreak: 1, longestStreak: 4, lastQualifiedDate: '2026-09-02' },
  )
  assert.deepEqual(
    computeStreakTransition(lifetime(), '2026-09-02'),
    { currentStreak: 1, longestStreak: 1, lastQualifiedDate: '2026-09-02' },
  )
})

test('completion awards 50 EXP below the score quest threshold', () => {
  const result = applyDailyCompletion(pendingProgress(2), lifetime(), '2026-09-02')
  assert.equal(result.expDelta, 50)
  assert.equal(result.progress.questOneCompleted, true)
  assert.equal(result.progress.questTwoCompleted, false)
  assert.equal(result.progress.bothQuestsCompleted, false)
  assert.equal(result.progress.expEarned, 50)
  assert.equal(result.lifetime.totalExp, 50)
})

test('completion awards 100 EXP when both quests and the bonus qualify', () => {
  const result = applyDailyCompletion(pendingProgress(3), lifetime(), '2026-09-02')
  assert.equal(result.expDelta, 100)
  assert.equal(result.progress.questOneCompleted, true)
  assert.equal(result.progress.questTwoCompleted, true)
  assert.equal(result.progress.bothQuestsCompleted, true)
  assert.equal(result.progress.expEarned, 100)
  assert.equal(result.lifetime.totalExp, 100)
})

test('repeating terminal completion is idempotent and produces no second delta', () => {
  const first = applyDailyCompletion(pendingProgress(5), lifetime(), '2026-09-02')
  const retry = applyDailyCompletion(first.progress, first.lifetime, '2026-09-02')
  assert.equal(first.expDelta, 100)
  assert.equal(retry.expDelta, 0)
  assert.deepEqual(retry.progress, first.progress)
  assert.deepEqual(retry.lifetime, first.lifetime)
})

test('transport answers accept only a compact choice snapshot', () => {
  assert.deepEqual(sanitizeDailyAnswers({ q1: 'A', q2: 'D' }), { q1: 'A', q2: 'D' })
  assert.equal(sanitizeDailyAnswers({ q1: 'X' }), null)
  assert.equal(sanitizeDailyAnswers({ q1: null }), null)
  assert.equal(sanitizeDailyAnswers(['A']), null)
})
