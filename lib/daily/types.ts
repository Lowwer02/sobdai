export const DAILY_CHOICE_KEYS = ['A', 'B', 'C', 'D'] as const
export type DailyChoice = (typeof DAILY_CHOICE_KEYS)[number]

export type DailyAnswers = Record<string, DailyChoice>

export interface DailyQuestion {
  id: string
  content: string
  choices: Record<DailyChoice, string>
  hint: string | null
}

export interface DailyProgressSnapshot {
  currentIndex: number
  answers: DailyAnswers
  questionsAnswered: number
  correctAnswers: number
  dailyCompleted: boolean
  expEarned: number
  completedAt: string | null
}

export interface DailyLifetimeProgress {
  totalExp: number
  currentStreak: number
  longestStreak: number
  lastQualifiedDate: string | null
  totalDailyQuestions: number
  totalDailyCorrect: number
}

export interface DailyStats {
  questionsAnswered: number
  correctAnswers: number
  accuracy: number
  expEarnedToday: number
  totalExp: number
  currentStreak: number
  longestStreak: number
}

export interface DailyQuest {
  id: 'complete-daily-five'
  label: string
  rewardExp: 50
  completed: boolean
}

export interface DailyState {
  available: true
  viewer: 'authenticated' | 'guest'
  /** True only when the request carries a server-issued guest completion proof. */
  guestClaimAvailable?: boolean
  localDate: string
  questions: [DailyQuestion, DailyQuestion, DailyQuestion, DailyQuestion, DailyQuestion]
  progress: DailyProgressSnapshot
  lifetime: DailyLifetimeProgress
  stats: DailyStats
  results: DailyQuestionResult[]
  quests: [DailyQuest]
}

export interface DailyUnavailableState {
  available: false
  localDate: string
  reason: 'not-enough-eligible-questions' | 'challenge-invalid'
}

export type DailyLoadResult =
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'unavailable'; state: DailyUnavailableState }
  | { status: 'ready'; state: DailyState }

export interface SubmitDailyAnswerInput {
  questionId: unknown
  choice: unknown
  nextIndex: unknown
}

export interface DailyQuestionResult {
  id: string
  selected: DailyChoice
  correctAnswer: DailyChoice
  isCorrect: boolean
  explanation: string | null
}

export interface DailySubmissionResult {
  finalized: boolean
  idempotent: boolean
  expDelta: number
  state: DailyState
  result: DailyQuestionResult
}

export type DailyMutationResult =
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: DailySubmissionResult }

export interface DailyGuestAnswerResult {
  status: 'ready'
  result: DailyQuestionResult
}

export type DailyGuestMutationResult =
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | DailyGuestAnswerResult

export type DailyGuestCompletionResult =
  | { status: 'ready' }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

export type DailyGuestClaimResult =
  | { status: 'none' }
  | { status: 'unauthenticated' }
  | { status: 'invalid-proof' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      state: DailyState
      expDelta: number
    }
