import type {
  DailyAnswers,
  DailyChoice,
  DailyLifetimeProgress,
  DailyProgressSnapshot,
  DailyQuestionResult,
} from './types'

export const DAILY_REWARDS = {
  dailyCompletion: 50,
  maximumPerDay: 50,
} as const

export const DAILY_QUESTS = [
  {
    id: 'complete-daily-five',
    label: 'ทำ Daily 5 ให้ครบ',
    rewardExp: DAILY_REWARDS.dailyCompletion,
  },
] as const

const DAILY_CHOICE_KEYS = ['A', 'B', 'C', 'D'] as const

export function isDailyChoice(value: unknown): value is DailyChoice {
  return typeof value === 'string' && (DAILY_CHOICE_KEYS as readonly string[]).includes(value)
}

/**
 * Only terminal answers are sent to the database. This helper rejects
 * malformed transport input; the RPC still validates challenge membership and
 * reads correctness from the database.
 */
export function sanitizeDailyAnswers(value: unknown): DailyAnswers | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 5) return null

  const answers: DailyAnswers = {}
  for (const [questionId, choice] of entries) {
    if (!questionId || !isDailyChoice(choice)) return null
    answers[questionId] = choice
  }
  return answers
}

function dateToUtcDay(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null
  return timestamp
}

function utcDayToDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function getPreviousDateKey(dateKey: string): string | null {
  const timestamp = dateToUtcDay(dateKey)
  return timestamp === null ? null : utcDayToDateKey(timestamp - 86_400_000)
}

export interface StreakTransition {
  currentStreak: number
  longestStreak: number
  lastQualifiedDate: string | null
}

/**
 * Recomputes streaks from the authoritative set of completed Daily dates.
 * Supplying the same set in either completion order therefore produces the
 * same result, while the stored longest streak and last date never decrease.
 */
export function recomputeStreakTransition(
  lifetime: Pick<DailyLifetimeProgress, 'currentStreak' | 'longestStreak' | 'lastQualifiedDate'>,
  completedDates: readonly string[],
): StreakTransition {
  const dates = [...new Set(completedDates)]
    .filter((dateKey) => dateToUtcDay(dateKey) !== null)
    .sort()

  if (dates.length === 0) return { ...lifetime }

  let runLength = 1
  let longestStreak = 1
  for (let index = 1; index < dates.length; index += 1) {
    if (getPreviousDateKey(dates[index]) === dates[index - 1]) {
      runLength += 1
    } else {
      runLength = 1
    }
    longestStreak = Math.max(longestStreak, runLength)
  }

  let currentStreak = 1
  for (let index = dates.length - 1; index > 0; index -= 1) {
    if (getPreviousDateKey(dates[index]) !== dates[index - 1]) break
    currentStreak += 1
  }

  const latestDate = dates[dates.length - 1]
  const lastQualifiedDate = lifetime.lastQualifiedDate && lifetime.lastQualifiedDate > latestDate
    ? lifetime.lastQualifiedDate
    : latestDate

  return {
    currentStreak,
    longestStreak: Math.max(lifetime.longestStreak, longestStreak),
    lastQualifiedDate,
  }
}

export interface DailyCompletionTransition {
  progress: DailyProgressSnapshot
  lifetime: DailyLifetimeProgress
  expDelta: number
}

/**
 * Pure model of the one consistency reward. Correct answers remain
 * informational and never influence EXP or streak eligibility.
 */
export function applyDailyCompletion(
  progress: DailyProgressSnapshot,
  lifetime: DailyLifetimeProgress,
  localDate: string,
): DailyCompletionTransition {
  if (progress.dailyCompleted) {
    return { progress, lifetime, expDelta: 0 }
  }

  if (progress.questionsAnswered !== 5 || Object.keys(progress.answers).length !== 5) {
    throw new Error('Daily 5 must have five terminal answers before completion')
  }

  const streak = recomputeStreakTransition(
    lifetime,
    lifetime.lastQualifiedDate ? [lifetime.lastQualifiedDate, localDate] : [localDate],
  )
  const nextProgress: DailyProgressSnapshot = {
    ...progress,
    dailyCompleted: true,
    expEarned: DAILY_REWARDS.dailyCompletion,
    completedAt: progress.completedAt ?? `${localDate}T00:00:00.000Z`,
  }
  const nextLifetime: DailyLifetimeProgress = {
    ...lifetime,
    ...streak,
    totalExp: lifetime.totalExp + DAILY_REWARDS.dailyCompletion,
    totalDailyQuestions: lifetime.totalDailyQuestions + 5,
    totalDailyCorrect: lifetime.totalDailyCorrect + progress.correctAnswers,
  }

  return {
    progress: nextProgress,
    lifetime: nextLifetime,
    expDelta: DAILY_REWARDS.dailyCompletion,
  }
}

export interface DailyAnswerTransition {
  progress: DailyProgressSnapshot
  lifetime: DailyLifetimeProgress
  expDelta: number
  idempotent: boolean
  result: DailyQuestionResult
}

/**
 * Pure model of one terminal answer mutation. The SQL RPC is the production
 * authority; this model protects the merge/idempotency contract in focused
 * tests without creating an answer-event ledger.
 */
export function applyDailyAnswer(
  progress: DailyProgressSnapshot,
  lifetime: DailyLifetimeProgress,
  questionId: string,
  selected: DailyChoice,
  correctAnswersById: Readonly<Record<string, DailyChoice>>,
  challengeQuestionIds: readonly string[],
  nextIndex: number,
  localDate: string,
  explanation: string | null = null,
): DailyAnswerTransition {
  if (!challengeQuestionIds.includes(questionId)) {
    throw new Error('Answer is outside today\'s challenge')
  }

  const correctAnswer = correctAnswersById[questionId]
  if (!isDailyChoice(correctAnswer)) throw new Error('Correct answer is unavailable')

  const result: DailyQuestionResult = {
    id: questionId,
    selected,
    correctAnswer,
    isCorrect: selected === correctAnswer,
    explanation,
  }
  const existing = progress.answers[questionId]
  if (existing) {
    if (existing !== selected) throw new Error('Answer is already terminal')
    return { progress, lifetime, expDelta: 0, idempotent: true, result }
  }

  const answers: DailyAnswers = { ...progress.answers, [questionId]: selected }
  const correctAnswers = Object.entries(answers)
    .filter(([id, choice]) => correctAnswersById[id] === choice)
    .length
  const nextProgress: DailyProgressSnapshot = {
    ...progress,
    currentIndex: nextIndex,
    answers,
    questionsAnswered: Object.keys(answers).length,
    correctAnswers,
  }

  if (nextProgress.questionsAnswered !== challengeQuestionIds.length) {
    return { progress: nextProgress, lifetime, expDelta: 0, idempotent: false, result }
  }

  const completion = applyDailyCompletion(nextProgress, lifetime, localDate)
  return {
    ...completion,
    idempotent: false,
    result,
  }
}
