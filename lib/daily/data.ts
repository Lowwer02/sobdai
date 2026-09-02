import {
  DAILY_QUESTS,
  sanitizeDailyAnswers,
} from './domain'
import type {
  DailyLoadResult,
  DailyMutationResult,
  DailyState,
  DailyUnavailableState,
  SaveDailyProgressInput,
} from './types'

type RpcError = { message: string; code?: string } | null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asFiniteInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function asNonNegativeInteger(value: unknown, fallback: number): number {
  const integer = asFiniteInteger(value, fallback)
  return integer >= 0 ? integer : fallback
}

function normalizeUnavailable(value: unknown): DailyUnavailableState | null {
  if (!isRecord(value) || value.available !== false || typeof value.localDate !== 'string') return null
  const reason = value.reason === 'challenge-invalid'
    ? 'challenge-invalid'
    : value.reason === 'not-enough-eligible-questions'
      ? 'not-enough-eligible-questions'
      : null
  return reason ? { available: false, localDate: value.localDate, reason } : null
}

function normalizeReady(value: unknown): DailyState | null {
  if (!isRecord(value) || value.available !== true) return null
  if (typeof value.localDate !== 'string' || !Array.isArray(value.questions) || value.questions.length !== 5) {
    return null
  }
  if (!isRecord(value.progress) || !isRecord(value.lifetime) || !isRecord(value.stats)) return null

  const questions = value.questions.map((rawQuestion) => {
    if (!isRecord(rawQuestion) || typeof rawQuestion.id !== 'string' || typeof rawQuestion.content !== 'string') {
      return null
    }
    if (!isRecord(rawQuestion.choices)) return null
    const choices = rawQuestion.choices
    if (!['A', 'B', 'C', 'D'].every((key) => typeof choices[key] === 'string')) return null
    return {
      id: rawQuestion.id,
      content: rawQuestion.content,
      choices: {
        A: choices.A as string,
        B: choices.B as string,
        C: choices.C as string,
        D: choices.D as string,
      },
      hint: typeof rawQuestion.hint === 'string' ? rawQuestion.hint : null,
    }
  })
  if (questions.some((question) => question === null)) return null

  const progress = value.progress
  const lifetime = value.lifetime
  const stats = value.stats
  if (!isRecord(progress.answers)) return null

  const answers = sanitizeDailyAnswers(progress.answers)
  if (!answers) return null

  const quests = Array.isArray(value.quests) ? value.quests : []
  if (quests.length !== DAILY_QUESTS.length) return null
  if (!quests.every((quest, index) => {
    if (!isRecord(quest)) return false
    return quest.id === DAILY_QUESTS[index].id
      && quest.label === DAILY_QUESTS[index].label
      && quest.rewardExp === DAILY_QUESTS[index].rewardExp
      && typeof quest.completed === 'boolean'
  })) return null

  return {
    available: true,
    localDate: value.localDate,
    questions: questions as DailyState['questions'],
    progress: {
      currentIndex: Math.min(4, Math.max(0, asFiniteInteger(progress.currentIndex, 0))),
      answers,
      questionsAnswered: Math.min(5, asNonNegativeInteger(progress.questionsAnswered, 0)),
      correctAnswers: Math.min(5, asNonNegativeInteger(progress.correctAnswers, 0)),
      dailyCompleted: progress.dailyCompleted === true,
      questOneCompleted: progress.questOneCompleted === true,
      questTwoCompleted: progress.questTwoCompleted === true,
      bothQuestsCompleted: progress.bothQuestsCompleted === true,
      expEarned: Math.min(100, asNonNegativeInteger(progress.expEarned, 0)),
      completedAt: typeof progress.completedAt === 'string' ? progress.completedAt : null,
    },
    lifetime: {
      totalExp: asNonNegativeInteger(lifetime.totalExp, 0),
      currentStreak: asNonNegativeInteger(lifetime.currentStreak, 0),
      longestStreak: asNonNegativeInteger(lifetime.longestStreak, 0),
      lastQualifiedDate: typeof lifetime.lastQualifiedDate === 'string' ? lifetime.lastQualifiedDate : null,
      totalDailyQuestions: asNonNegativeInteger(lifetime.totalDailyQuestions, 0),
      totalDailyCorrect: asNonNegativeInteger(lifetime.totalDailyCorrect, 0),
    },
    stats: {
      questionsAnswered: Math.min(5, asNonNegativeInteger(stats.questionsAnswered, 0)),
      correctAnswers: Math.min(5, asNonNegativeInteger(stats.correctAnswers, 0)),
      accuracy: Math.min(100, asNonNegativeInteger(stats.accuracy, 0)),
      expEarnedToday: Math.min(100, asNonNegativeInteger(stats.expEarnedToday, 0)),
      totalExp: asNonNegativeInteger(stats.totalExp, 0),
      currentStreak: asNonNegativeInteger(stats.currentStreak, 0),
      longestStreak: asNonNegativeInteger(stats.longestStreak, 0),
    },
    quests: quests as DailyState['quests'],
  }
}

export function parseDailyStateRpc(data: unknown): DailyLoadResult {
  const unavailable = normalizeUnavailable(data)
  if (unavailable) return { status: 'unavailable', state: unavailable }

  const ready = normalizeReady(data)
  return ready
    ? { status: 'ready', state: ready }
    : { status: 'error', message: 'Daily response was invalid.' }
}

export function parseDailyMutationRpc(data: unknown): DailyMutationResult {
  if (!isRecord(data) || typeof data.finalized !== 'boolean' || !isRecord(data.state)) {
    return { status: 'error', message: 'Daily submission response was invalid.' }
  }

  const stateResult = parseDailyStateRpc(data.state)
  if (stateResult.status !== 'ready') {
    return { status: 'error', message: 'Daily submission state was invalid.' }
  }

  const rawResults = Array.isArray(data.results) ? data.results : []
  const results = rawResults.flatMap((rawResult) => {
    if (!isRecord(rawResult)) return []
    if (
      typeof rawResult.id !== 'string'
      || !['A', 'B', 'C', 'D'].includes(String(rawResult.selected))
      || !['A', 'B', 'C', 'D'].includes(String(rawResult.correctAnswer))
      || typeof rawResult.isCorrect !== 'boolean'
    ) return []
    return [{
      id: rawResult.id,
      selected: rawResult.selected as 'A' | 'B' | 'C' | 'D',
      correctAnswer: rawResult.correctAnswer as 'A' | 'B' | 'C' | 'D',
      isCorrect: rawResult.isCorrect,
      explanation: typeof rawResult.explanation === 'string' ? rawResult.explanation : null,
    }]
  })

  return {
    status: 'ready',
    result: {
      finalized: data.finalized,
      idempotent: data.idempotent === true,
      expDelta: asNonNegativeInteger(data.expDelta, 0),
      state: stateResult.state,
      results,
    },
  }
}

export function normalizeDailyInput(input: SaveDailyProgressInput): {
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>
  currentIndex: number
  finalize: boolean
} | null {
  const answers = sanitizeDailyAnswers(input?.answers)
  const currentIndex = input?.currentIndex
  if (!answers || typeof currentIndex !== 'number' || !Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex > 4) {
    return null
  }
  return { answers, currentIndex, finalize: input?.finalize === true }
}

export function rpcErrorMessage(error: RpcError): string {
  if (!error) return 'Daily request failed.'
  if (error.code === '42501') return 'Daily access is unavailable for this account.'
  if (error.code === 'P0001') return error.message
  return 'Daily request failed. Please try again.'
}
