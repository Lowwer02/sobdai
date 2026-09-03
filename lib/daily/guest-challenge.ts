import { createHash } from 'node:crypto'
import type { DailyChoice, DailyQuestion, DailyState } from './types'

const GUEST_DAILY_QUEST = {
  id: 'complete-daily-five' as const,
  label: 'ทำ Daily 5 ให้ครบ',
  rewardExp: 50 as const,
}

function isDailyChoice(value: unknown): value is DailyChoice {
  return typeof value === 'string' && ['A', 'B', 'C', 'D'].includes(value)
}

/**
 * The guest read path deliberately selects only the fields needed to render
 * the quiz and to verify a submitted choice. `correct_answer` and
 * `full_explanation` stay inside the server action and are never part of the
 * initial guest state.
 */
export const GUEST_DAILY_QUESTION_SELECT = [
  'id',
  'content',
  'choice_a',
  'choice_b',
  'choice_c',
  'choice_d',
  'correct_answer',
  'status',
  'hint',
  'full_explanation',
].join(',')

export const GUEST_DAILY_CHALLENGE_SELECT = [
  'question_1_id',
  'question_2_id',
  'question_3_id',
  'question_4_id',
  'question_5_id',
].join(',')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface GuestDailyQuestionRow {
  id: string
  content: string
  choice_a: string
  choice_b: string
  choice_c: string
  choice_d: string
  correct_answer: DailyChoice
  status: string
  hint: string | null
  full_explanation: string | null
}

export type DailyQuestionIds = [string, string, string, string, string]

export interface GuestDailyChallenge {
  localDate: string
  questionIds: DailyQuestionIds
  questions: [
    GuestDailyQuestionRow,
    GuestDailyQuestionRow,
    GuestDailyQuestionRow,
    GuestDailyQuestionRow,
    GuestDailyQuestionRow,
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isDailyQuestionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isEligibleGuestDailyQuestion(value: unknown): value is GuestDailyQuestionRow {
  if (!isRecord(value)) return false
  if (!isDailyQuestionId(value.id) || value.status !== 'Published') return false
  if (!isNonEmptyString(value.content)) return false
  if (!isNonEmptyString(value.choice_a)
    || !isNonEmptyString(value.choice_b)
    || !isNonEmptyString(value.choice_c)
    || !isNonEmptyString(value.choice_d)) {
    return false
  }
  if (!isDailyChoice(value.correct_answer)) return false
  if (value.hint !== null && typeof value.hint !== 'string') return false
  if (value.full_explanation !== null && typeof value.full_explanation !== 'string') return false

  return true
}

/**
 * Mirrors migration 089's selection rule exactly: Bangkok date + question ID
 * MD5, then UUID as the deterministic tie-breaker. No random state is used.
 */
export function selectDeterministicDailyQuestionIds(
  localDate: string,
  rows: readonly unknown[],
): string[] {
  const candidates = rows
    .filter(isEligibleGuestDailyQuestion)
    .filter((row, index, eligibleRows) => eligibleRows.findIndex((candidate) => candidate.id === row.id) === index)
    .map((row) => ({
      id: row.id,
      selectionKey: createHash('md5').update(`${localDate}:${row.id}`).digest('hex'),
    }))

  candidates.sort((left, right) => {
    if (left.selectionKey < right.selectionKey) return -1
    if (left.selectionKey > right.selectionKey) return 1
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })

  return candidates.slice(0, 5).map((candidate) => candidate.id)
}

function asFiveQuestionIds(value: readonly string[]): DailyQuestionIds | null {
  if (value.length !== 5 || value.some((id) => !isDailyQuestionId(id))) return null
  if (new Set(value).size !== 5) return null
  return [...value] as DailyQuestionIds
}

export function buildGuestDailyChallenge(
  localDate: string,
  questionIds: readonly string[],
  rows: readonly unknown[],
): GuestDailyChallenge | null {
  const ids = asFiveQuestionIds(questionIds)
  if (!ids) return null

  const byId = new Map(
    rows
      .filter(isEligibleGuestDailyQuestion)
      .map((row) => [row.id, row]),
  )
  const orderedRows = ids.map((id) => byId.get(id) ?? null)
  if (orderedRows.some((row) => row === null)) return null

  return {
    localDate,
    questionIds: ids,
    questions: orderedRows as GuestDailyChallenge['questions'],
  }
}

export function getCurrentBangkokDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function toPublicDailyQuestion(row: GuestDailyQuestionRow): DailyQuestion {
  return {
    id: row.id,
    content: row.content,
    choices: {
      A: row.choice_a,
      B: row.choice_b,
      C: row.choice_c,
      D: row.choice_d,
    },
    hint: row.hint,
  }
}

export function createGuestDailyState(challenge: GuestDailyChallenge): DailyState {
  const questions = challenge.questions.map(toPublicDailyQuestion) as DailyState['questions']

  return {
    available: true,
    viewer: 'guest',
    guestClaimAvailable: false,
    localDate: challenge.localDate,
    questions,
    progress: {
      currentIndex: 0,
      answers: {},
      questionsAnswered: 0,
      correctAnswers: 0,
      dailyCompleted: false,
      expEarned: 0,
      completedAt: null,
    },
    lifetime: {
      totalExp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastQualifiedDate: null,
      totalDailyQuestions: 0,
      totalDailyCorrect: 0,
    },
    stats: {
      questionsAnswered: 0,
      correctAnswers: 0,
      accuracy: 0,
      expEarnedToday: 0,
      totalExp: 0,
      currentStreak: 0,
      longestStreak: 0,
    },
    results: [],
    quests: [{
      id: GUEST_DAILY_QUEST.id,
      label: GUEST_DAILY_QUEST.label,
      rewardExp: GUEST_DAILY_QUEST.rewardExp,
      completed: false,
    }],
  }
}
