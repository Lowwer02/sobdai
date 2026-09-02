import type { DailyAnswers, DailyChoice, DailyLifetimeProgress, DailyProgressSnapshot } from './types'

const DAILY_CHOICE_KEYS = ['A', 'B', 'C', 'D'] as const

export const DAILY_REWARDS = {
  dailyCompletion: 50,
  scoreQuest: 20,
  bothQuests: 30,
  maximumPerDay: 100,
} as const

export const DAILY_QUESTS = [
  {
    id: 'complete-daily-five',
    label: 'ทำ Daily 5 ให้ครบ',
    rewardExp: DAILY_REWARDS.dailyCompletion,
  },
  {
    id: 'score-three-of-five',
    label: 'ทำถูกอย่างน้อย 3/5',
    rewardExp: DAILY_REWARDS.scoreQuest,
  },
] as const

export function isDailyChoice(value: unknown): value is DailyChoice {
  return typeof value === 'string' && (DAILY_CHOICE_KEYS as readonly string[]).includes(value)
}

/**
 * The browser is allowed to send only a compact answer snapshot. The server
 * still validates the question IDs against today's persisted challenge and
 * reads correctness from the database; this helper only rejects malformed
 * transport input early.
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
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
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
  lastQualifiedDate: string
}

/**
 * Pure model of the database streak transition. The RPC applies the same
 * rules while holding the user's lifetime row lock.
 */
export function computeStreakTransition(
  lifetime: Pick<DailyLifetimeProgress, 'currentStreak' | 'longestStreak' | 'lastQualifiedDate'>,
  today: string,
): StreakTransition {
  const yesterday = getPreviousDateKey(today)
  if (!yesterday) throw new Error('Invalid Bangkok date key')

  if (lifetime.lastQualifiedDate === today) {
    return {
      currentStreak: lifetime.currentStreak,
      longestStreak: lifetime.longestStreak,
      lastQualifiedDate: today,
    }
  }

  const currentStreak = lifetime.lastQualifiedDate === yesterday
    ? lifetime.currentStreak + 1
    : 1

  return {
    currentStreak,
    longestStreak: Math.max(lifetime.longestStreak, currentStreak),
    lastQualifiedDate: today,
  }
}

export interface DailyCompletionTransition {
  progress: DailyProgressSnapshot
  lifetime: DailyLifetimeProgress
  expDelta: number
}

/**
 * Pure idempotency/reward model used by focused tests and presentation code.
 * The production authority is the daily_finalize branch in the SQL RPC.
 */
export function applyDailyCompletion(
  progress: DailyProgressSnapshot,
  lifetime: DailyLifetimeProgress,
  localDate: string,
): DailyCompletionTransition {
  if (progress.dailyCompleted) {
    return { progress, lifetime, expDelta: 0 }
  }

  if (progress.questionsAnswered !== 5) {
    throw new Error('Daily 5 must have five answered questions before completion')
  }

  const scoreQuestCompleted = progress.correctAnswers >= 3
  const expDelta = DAILY_REWARDS.dailyCompletion
    + (scoreQuestCompleted ? DAILY_REWARDS.scoreQuest : 0)
    + (scoreQuestCompleted ? DAILY_REWARDS.bothQuests : 0)
  const streak = computeStreakTransition(lifetime, localDate)

  const nextProgress: DailyProgressSnapshot = {
    ...progress,
    dailyCompleted: true,
    questOneCompleted: true,
    questTwoCompleted: scoreQuestCompleted,
    bothQuestsCompleted: scoreQuestCompleted,
    expEarned: progress.expEarned + expDelta,
    completedAt: progress.completedAt ?? `${localDate}T00:00:00.000Z`,
  }
  const nextLifetime: DailyLifetimeProgress = {
    ...lifetime,
    ...streak,
    totalExp: lifetime.totalExp + expDelta,
    totalDailyQuestions: lifetime.totalDailyQuestions + 5,
    totalDailyCorrect: lifetime.totalDailyCorrect + progress.correctAnswers,
  }

  return { progress: nextProgress, lifetime: nextLifetime, expDelta }
}
