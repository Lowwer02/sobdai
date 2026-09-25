import type { AssessmentMode } from './types'

export type MockAutoAdvanceStatus = 'IN_PROGRESS' | 'CONFIRM_SUBMIT' | 'REVIEW'

export interface MockAutoAdvanceState {
  mode: AssessmentMode
  status: MockAutoAdvanceStatus
  currentIndex: number
  sourceIndex: number
  questionCount: number
  isMounted: boolean
  hasPendingTimer: boolean
}

/**
 * Resolve the only target a delayed Mock auto-advance may use.
 *
 * The caller captures sourceIndex when the answer is selected. Every guard is
 * re-evaluated when the timer fires so a manual navigation, mode/status change,
 * unmount, or duplicate selection cannot move the learner from a stale state.
 */
export function resolveMockAutoAdvanceTarget(state: MockAutoAdvanceState): number | null {
  if (state.hasPendingTimer) return null
  if (!state.isMounted || state.mode !== 'simulation' || state.status !== 'IN_PROGRESS') return null
  if (!Number.isInteger(state.sourceIndex) || !Number.isInteger(state.currentIndex)) return null
  if (!Number.isInteger(state.questionCount) || state.questionCount <= 0) return null
  if (state.sourceIndex < 0 || state.sourceIndex >= state.questionCount - 1) return null
  if (state.currentIndex !== state.sourceIndex) return null

  return state.sourceIndex + 1
}
