/**
 * lib/engine/solver/bounded-search.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Bounded Depth-First Search Driver.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §8, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines the public entrypoint for per-Set physical allocation DFS search execution.
 *  - Disjoined from state mutation or legacy solver execution.
 */

import type { PreTieCandidateProfile } from '../ranking/contracts'
import { orderCandidates } from './branch-ordering'
import { createJointAccounting, type JointAccountingState } from './joint-accounting'
import type { SearchBudget, SearchDiagnostics, SearchOutcome } from './search-contracts'
import {
  transitionCandidate,
  type CandidateTransitionResult,
} from './search-transition'
import type { SetSolverInput } from './set-solver-input'

export interface SearchRoot {
  readonly accounting: JointAccountingState
  readonly remainingCandidates: readonly PreTieCandidateProfile[]
}

/**
 * Creates the root state for the physical allocation search.
 *
 * @param input SetSolverInput containing set details and candidates universe
 * @returns SearchRoot containing the fresh empty accounting and shallow copy of candidate profiles
 */
export function createSearchRoot(
  input: SetSolverInput
): SearchRoot {
  if (!input) {
    throw new Error('Fatal BoundedSearch error: input is required for createSearchRoot')
  }
  return {
    accounting: createJointAccounting(input.setNumber),
    remainingCandidates: [...input.candidateUniverse.profiles],
  }
}

/**
 * Returns a fresh empty SearchDiagnostics at search start.
 *
 * @returns SearchDiagnostics with nodesVisited = 0 and backtracks = 0
 */
export function createSearchDiagnostics(): SearchDiagnostics {
  return {
    nodesVisited: 0,
    backtracks: 0,
  }
}

/**
 * Returns true when the search may visit the next node within budget.
 *
 * @param diagnostics Current SearchDiagnostics
 * @param budget SearchBudget
 * @returns true if nodesVisited < maxNodesVisited; false otherwise
 */
export function canVisitNextNode(
  diagnostics: SearchDiagnostics,
  budget: SearchBudget
): boolean {
  return diagnostics.nodesVisited < budget.maxNodesVisited
}

/**
 * Returns a new SearchDiagnostics with nodesVisited incremented by 1.
 * Does NOT mutate the input diagnostics.
 *
 * @param diagnostics Current SearchDiagnostics snapshot
 * @returns New SearchDiagnostics with nodesVisited + 1
 */
export function recordNodeVisit(
  diagnostics: SearchDiagnostics
): SearchDiagnostics {
  return {
    nodesVisited: diagnostics.nodesVisited + 1,
    backtracks: diagnostics.backtracks,
  }
}

/**
 * Returns a new SearchDiagnostics with backtracks incremented by 1.
 * Does NOT mutate the input diagnostics.
 *
 * @param diagnostics Current SearchDiagnostics snapshot
 * @returns New SearchDiagnostics with backtracks + 1
 */
export function recordBacktrack(
  diagnostics: SearchDiagnostics
): SearchDiagnostics {
  return {
    nodesVisited: diagnostics.nodesVisited,
    backtracks: diagnostics.backtracks + 1,
  }
}

// ─── Budgeted Transition ────────────────────────────────────────────────────

export type BudgetedTransitionResult =
  | {
      readonly status: 'SEARCH_BUDGET_EXHAUSTED'
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'ATTEMPTED'
      readonly transition: CandidateTransitionResult
      readonly remainingCandidates: readonly PreTieCandidateProfile[]
      readonly diagnostics: SearchDiagnostics
    }

/**
 * Attempts a single candidate transition under budget control.
 *
 * If budget is already exhausted, returns SEARCH_BUDGET_EXHAUSTED without
 * calling transitionCandidate. Otherwise records a node visit, evaluates
 * the transition, and returns ATTEMPTED with the child remainingCandidates
 * and updated diagnostics.
 *
 * One transitionCandidate call === one nodesVisited increment.
 *
 * @param input SetSolverInput carrying constraint snapshot
 * @param accounting Parent JointAccountingState snapshot
 * @param remainingCandidates Pool of unplaced candidates at parent node
 * @param candidate The candidate being evaluated in this branch
 * @param diagnostics Current SearchDiagnostics snapshot
 * @param budget SearchBudget
 * @returns BudgetedTransitionResult
 */
export function tryBudgetedTransition(
  input: SetSolverInput,
  accounting: JointAccountingState,
  remainingCandidates: readonly PreTieCandidateProfile[],
  candidate: PreTieCandidateProfile,
  diagnostics: SearchDiagnostics,
  budget: SearchBudget
): BudgetedTransitionResult {
  if (!canVisitNextNode(diagnostics, budget)) {
    return {
      status: 'SEARCH_BUDGET_EXHAUSTED',
      diagnostics,
    }
  }

  const nextDiagnostics = recordNodeVisit(diagnostics)

  const remainingAfter = remainingCandidates.filter(
    (c) => c.questionCode !== candidate.questionCode
  )

  let remainingTier1CandidatesAfterApply = 0
  const distinctCodes = new Set<string>()
  for (const rem of remainingAfter) {
    if (rem.candidate.metadata.tier === 1) {
      remainingTier1CandidatesAfterApply++
    }
    distinctCodes.add(rem.questionCode)
  }
  const remainingDistinctCandidatesAfterApply = distinctCodes.size

  const transition = transitionCandidate(
    accounting,
    candidate,
    input.constraintSnapshot,
    remainingTier1CandidatesAfterApply,
    remainingDistinctCandidatesAfterApply
  )

  return {
    status: 'ATTEMPTED',
    transition,
    remainingCandidates: remainingAfter,
    diagnostics: nextDiagnostics,
  }
}

// ─── Search Frame ────────────────────────────────────────────────────────────

/**
 * Represents one level in the iterative DFS stack.
 *
 * - `accounting`: parent JointAccountingState snapshot at this depth
 * - `remainingCandidates`: pool of unplaced candidates at this depth
 * - `orderedCandidates`: branch-ordered snapshot computed once on frame creation
 * - `nextCandidateIndex`: cursor into orderedCandidates for the next branch to attempt
 * - `selectedCandidates`: path of CandidateProfiles chosen to reach this frame
 */
export interface SearchFrame {
  readonly accounting: JointAccountingState
  readonly remainingCandidates: readonly PreTieCandidateProfile[]
  readonly orderedCandidates: readonly PreTieCandidateProfile[]
  readonly nextCandidateIndex: number
  readonly selectedCandidates: readonly PreTieCandidateProfile[]
}

/**
 * Creates a fresh SearchFrame at a given DFS depth.
 *
 * Computes the branch-ordered candidate list once on creation.
 * Starts nextCandidateIndex at 0.
 * Copies remainingCandidates and selectedCandidates arrays shallowly.
 * Preserves accounting reference.
 *
 * @param input SetSolverInput carrying constraint snapshot
 * @param accounting Parent JointAccountingState snapshot
 * @param remainingCandidates Unplaced candidate pool at this depth
 * @param selectedCandidates Path of candidates selected to reach this depth
 * @returns A new SearchFrame
 */
export function createSearchFrame(
  input: SetSolverInput,
  accounting: JointAccountingState,
  remainingCandidates: readonly PreTieCandidateProfile[],
  selectedCandidates: readonly PreTieCandidateProfile[]
): SearchFrame {
  return {
    accounting,
    remainingCandidates: [...remainingCandidates],
    orderedCandidates: orderCandidates(
      accounting,
      remainingCandidates,
      input.constraintSnapshot
    ),
    nextCandidateIndex: 0,
    selectedCandidates: [...selectedCandidates],
  }
}

/**
 * Advances the frame cursor to the next sibling branch by returning a new SearchFrame
 * with nextCandidateIndex incremented by 1.
 *
 * All other fields (accounting, remainingCandidates, orderedCandidates, selectedCandidates)
 * are preserved by reference — no copies are made.
 *
 * Fails loud if called when the frame is already exhausted
 * (nextCandidateIndex >= orderedCandidates.length).
 *
 * @param frame Current SearchFrame
 * @returns New SearchFrame with nextCandidateIndex + 1
 * @throws Error if frame is already exhausted
 */
export function advanceSearchFrame(
  frame: SearchFrame
): SearchFrame {
  if (frame.nextCandidateIndex >= frame.orderedCandidates.length) {
    throw new Error(
      `Fatal BoundedSearch error: advanceSearchFrame called on exhausted frame (nextCandidateIndex=${String(frame.nextCandidateIndex)}, orderedCandidates.length=${String(frame.orderedCandidates.length)})`
    )
  }
  return {
    accounting: frame.accounting,
    remainingCandidates: frame.remainingCandidates,
    orderedCandidates: frame.orderedCandidates,
    nextCandidateIndex: frame.nextCandidateIndex + 1,
    selectedCandidates: frame.selectedCandidates,
  }
}

// ─── Search Stack ────────────────────────────────────────────────────────────

/**
 * Iterative DFS stack holding the active search path from root to current depth.
 *
 * Each frame is an already-advanced parent (sibling cursor moved) or the root.
 * Pushing a child after a CONTINUE attempt yields [advancedParentFrame, childFrame].
 */
export interface SearchStack {
  readonly frames: readonly SearchFrame[]
}

/**
 * Creates a fresh SearchStack containing only the root frame.
 *
 * @param rootFrame Root SearchFrame for the search
 * @returns SearchStack with frames = [rootFrame]
 */
export function createSearchStack(rootFrame: SearchFrame): SearchStack {
  return {
    frames: [rootFrame],
  }
}

/**
 * Returns a new SearchStack with childFrame appended to the top of the stack.
 *
 * Preserves all existing frame references. Does not mutate stack.frames.
 *
 * @param stack Current SearchStack
 * @param childFrame Child SearchFrame to push after a CONTINUE attempt
 * @returns New SearchStack with childFrame appended exactly once
 */
export function pushSearchFrame(
  stack: SearchStack,
  childFrame: SearchFrame
): SearchStack {
  return {
    frames: [...stack.frames, childFrame],
  }
}

/**
 * Returns a new SearchStack with the top frame replaced by replacement.
 *
 * Preserves all lower frame references exactly. Does not mutate stack or replacement.
 *
 * @param stack Current SearchStack
 * @param replacement SearchFrame to install as the new top frame
 * @returns New SearchStack with only the top frame replaced
 * @throws Error if stack.frames is empty
 */
export function replaceTopSearchFrame(
  stack: SearchStack,
  replacement: SearchFrame
): SearchStack {
  if (stack.frames.length === 0) {
    throw new Error(
      'Fatal BoundedSearch error: replaceTopSearchFrame called on empty stack'
    )
  }

  return {
    frames: [...stack.frames.slice(0, -1), replacement],
  }
}

/**
 * Result of retreating from an exhausted child subtree to its already-advanced parent.
 */
export interface BacktrackStep {
  readonly stack: SearchStack
  readonly diagnostics: SearchDiagnostics
}

/**
 * Pops the exhausted top child frame and returns the parent stack with backtrack recorded.
 *
 * Only valid when the stack has at least two frames and the top frame is exhausted
 * (nextCandidateIndex >= orderedCandidates.length). Root exhaustion is not handled here.
 *
 * @param stack Current SearchStack
 * @param diagnostics Current SearchDiagnostics snapshot
 * @returns BacktrackStep with top child removed and backtracks incremented by 1
 * @throws Error if stack is empty, has only one frame, or top frame is not exhausted
 */
export function backtrackExhaustedChild(
  stack: SearchStack,
  diagnostics: SearchDiagnostics
): BacktrackStep {
  if (stack.frames.length === 0) {
    throw new Error(
      'Fatal BoundedSearch error: backtrackExhaustedChild called on empty stack'
    )
  }

  if (stack.frames.length === 1) {
    throw new Error(
      'Fatal BoundedSearch error: backtrackExhaustedChild cannot pop root frame'
    )
  }

  const topFrame = stack.frames[stack.frames.length - 1]!

  if (topFrame.nextCandidateIndex < topFrame.orderedCandidates.length) {
    throw new Error(
      `Fatal BoundedSearch error: backtrackExhaustedChild requires exhausted top frame (nextCandidateIndex=${String(topFrame.nextCandidateIndex)}, orderedCandidates.length=${String(topFrame.orderedCandidates.length)})`
    )
  }

  return {
    stack: {
      frames: stack.frames.slice(0, -1),
    },
    diagnostics: recordBacktrack(diagnostics),
  }
}

// ─── Frame Attempt ───────────────────────────────────────────────────────────

export type FrameAttemptResult =
  | {
      readonly status: 'FRAME_EXHAUSTED'
      readonly frame: SearchFrame
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'SEARCH_BUDGET_EXHAUSTED'
      readonly frame: SearchFrame
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'ATTEMPTED'
      readonly parentFrame: SearchFrame
      readonly candidate: PreTieCandidateProfile
      readonly transition: CandidateTransitionResult
      readonly remainingCandidates: readonly PreTieCandidateProfile[]
      readonly diagnostics: SearchDiagnostics
    }

/**
 * Attempts the current sibling candidate from a SearchFrame under budget control.
 *
 * Returns FRAME_EXHAUSTED (no budget consumption) when there are no more
 * candidates to attempt in this frame.
 *
 * Returns SEARCH_BUDGET_EXHAUSTED (frame NOT advanced) when the budget is
 * exhausted before the candidate can be attempted.
 *
 * Returns ATTEMPTED (frame advanced by one) after a successful transition
 * attempt, regardless of whether the transition was CONTINUE, PRUNED, or COMPLETE.
 *
 * Invariant: frame advances by exactly one if and only if a transition was
 * actually attempted.
 *
 * @param input SetSolverInput carrying constraint snapshot
 * @param frame Current SearchFrame
 * @param diagnostics Current SearchDiagnostics
 * @param budget SearchBudget
 * @returns FrameAttemptResult
 */
export function attemptCurrentFrameCandidate(
  input: SetSolverInput,
  frame: SearchFrame,
  diagnostics: SearchDiagnostics,
  budget: SearchBudget
): FrameAttemptResult {
  // Step 1: Frame exhausted — no sibling left to attempt.
  if (frame.nextCandidateIndex >= frame.orderedCandidates.length) {
    return {
      status: 'FRAME_EXHAUSTED',
      frame,
      diagnostics,
    }
  }

  // Step 2: Resolve current candidate.
  const currentCandidate = frame.orderedCandidates[frame.nextCandidateIndex]!

  // Step 3: Attempt transition under budget.
  const budgetedResult = tryBudgetedTransition(
    input,
    frame.accounting,
    frame.remainingCandidates,
    currentCandidate,
    diagnostics,
    budget
  )

  // Step 4: Budget exhausted — do NOT advance frame.
  if (budgetedResult.status === 'SEARCH_BUDGET_EXHAUSTED') {
    return {
      status: 'SEARCH_BUDGET_EXHAUSTED',
      frame,
      diagnostics: budgetedResult.diagnostics,
    }
  }

  // Step 5: Transition attempted — advance frame cursor.
  const parentFrame = advanceSearchFrame(frame)

  return {
    status: 'ATTEMPTED',
    parentFrame,
    candidate: currentCandidate,
    transition: budgetedResult.transition,
    remainingCandidates: budgetedResult.remainingCandidates,
    diagnostics: budgetedResult.diagnostics,
  }
}

// ─── Child Frame Creation ────────────────────────────────────────────────────

/**
 * Creates a child SearchFrame from a successful CONTINUE transition attempt.
 *
 * Accepts only ATTEMPTED results whose `transition.status === 'CONTINUE'`.
 * Fails loud if transition is PRUNED or COMPLETE.
 *
 * Child state:
 *  - accounting: from attempt.transition.accounting (the post-apply child state)
 *  - remainingCandidates: from attempt.remainingCandidates (candidate excluded)
 *  - selectedCandidates: [...attempt.parentFrame.selectedCandidates, attempt.candidate]
 *  - orderedCandidates: re-ordered by createSearchFrame using new child accounting
 *  - nextCandidateIndex: 0
 *
 * parentFrame is the already-advanced parent — it is NOT modified.
 *
 * @param input SetSolverInput carrying constraint snapshot
 * @param attempt An ATTEMPTED FrameAttemptResult whose transition is CONTINUE
 * @returns New child SearchFrame
 * @throws Error if attempt.transition.status is not 'CONTINUE'
 */
export function createChildFrameFromAttempt(
  input: SetSolverInput,
  attempt: Extract<FrameAttemptResult, { status: 'ATTEMPTED' }>
): SearchFrame {
  if (attempt.transition.status !== 'CONTINUE') {
    throw new Error(
      `Fatal BoundedSearch error: createChildFrameFromAttempt requires a CONTINUE transition, received '${attempt.transition.status}'`
    )
  }

  const childAccounting = attempt.transition.accounting
  const childRemainingCandidates = attempt.remainingCandidates
  const childSelectedCandidates = [
    ...attempt.parentFrame.selectedCandidates,
    attempt.candidate,
  ]

  return createSearchFrame(
    input,
    childAccounting,
    childRemainingCandidates,
    childSelectedCandidates
  )
}

// ─── Traversal Step ──────────────────────────────────────────────────────────

export type TraversalStepResult =
  | {
      readonly status: 'ADVANCED'
      readonly stack: SearchStack
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'COMPLETE'
      readonly selectedCandidates: readonly PreTieCandidateProfile[]
      readonly finalAccounting: JointAccountingState
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'SEARCH_BUDGET_EXHAUSTED'
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'ROOT_EXHAUSTED'
      readonly diagnostics: SearchDiagnostics
    }

/**
 * Performs exactly ONE deterministic DFS traversal action per call.
 *
 * Resolves the top SearchFrame, attempts its current candidate, and returns the
 * resulting TraversalStepResult without any internal loop or recursion.
 *
 * Outcomes:
 *  - ROOT_EXHAUSTED: stack holds only the (exhausted) root frame; diagnostics
 *    unchanged; backtrack is NOT incremented.
 *  - ADVANCED (frame backtrack): a CONTINUE child subtree is exhausted; one child
 *    is popped and backtracks is incremented exactly once.
 *  - SEARCH_BUDGET_EXHAUSTED: budget exhausted before an attempt; propagated
 *    immediately; stack is NOT mutated.
 *  - ADVANCED (PRUNED): one node already consumed by the attempt; parent advanced;
 *    NOT a backtrack.
 *  - ADVANCED (CONTINUE): parent advanced and exactly one child frame pushed.
 *  - COMPLETE: a satisfying transition reached; selectedCandidates and
 *    finalAccounting returned; no child is pushed.
 *
 * Everything remains immutable: all stack and diagnostics values are replaced,
 * never mutated.
 *
 * @param input SetSolverInput carrying constraint snapshot
 * @param stack Current immutable SearchStack
 * @param diagnostics Current immutable SearchDiagnostics
 * @param budget SearchBudget
 * @returns TraversalStepResult for exactly one DFS action
 * @throws Error if stack.frames is empty
 */
export function stepSearchTraversal(
  input: SetSolverInput,
  stack: SearchStack,
  diagnostics: SearchDiagnostics,
  budget: SearchBudget
): TraversalStepResult {
  // Step 1: Fail-loud on empty stack.
  if (stack.frames.length === 0) {
    throw new Error(
      'Fatal BoundedSearch error: stepSearchTraversal called on empty stack'
    )
  }

  // Step 2: Resolve current top frame.
  const currentFrame = stack.frames[stack.frames.length - 1]!

  // Step 3: Attempt the current candidate of the top frame under budget.
  const result = attemptCurrentFrameCandidate(
    input,
    currentFrame,
    diagnostics,
    budget
  )

  // Step 4: FRAME_EXHAUSTED — backtrack, or signal root exhaustion.
  if (result.status === 'FRAME_EXHAUSTED') {
    if (stack.frames.length === 1) {
      // Only root remains and it is exhausted — do NOT increment backtrack.
      return {
        status: 'ROOT_EXHAUSTED',
        diagnostics,
      }
    }

    const backtracked = backtrackExhaustedChild(stack, diagnostics)
    return {
      status: 'ADVANCED',
      stack: backtracked.stack,
      diagnostics: backtracked.diagnostics,
    }
  }

  // Step 5: SEARCH_BUDGET_EXHAUSTED — propagate without stack mutation.
  if (result.status === 'SEARCH_BUDGET_EXHAUSTED') {
    return {
      status: 'SEARCH_BUDGET_EXHAUSTED',
      diagnostics: result.diagnostics,
    }
  }

  // Step 6: ATTEMPTED — replace top with the already-advanced parent, then
  // branch on the transition status. `result` is narrowed to ATTEMPTED here.
  const attempt = result
  const replacedStack = replaceTopSearchFrame(stack, attempt.parentFrame)

  switch (attempt.transition.status) {
    case 'PRUNED': {
      // One node already consumed by the attempt; parent advanced; NOT a backtrack.
      return {
        status: 'ADVANCED',
        stack: replacedStack,
        diagnostics: attempt.diagnostics,
      }
    }
    case 'CONTINUE': {
      const childFrame = createChildFrameFromAttempt(input, attempt)
      const nextStack = pushSearchFrame(replacedStack, childFrame)
      return {
        status: 'ADVANCED',
        stack: nextStack,
        diagnostics: attempt.diagnostics,
      }
    }
    case 'COMPLETE': {
      return {
        status: 'COMPLETE',
        selectedCandidates: [
          ...attempt.parentFrame.selectedCandidates,
          attempt.candidate,
        ],
        finalAccounting: attempt.transition.accounting,
        diagnostics: attempt.diagnostics,
      }
    }
  }
}

/**
 * Executes a depth-first search to find a valid per-Set physical allocation under budget.
 *
 * @param input SetSolverInput containing candidate universe and constraint snapshot
 * @param budget SearchBudget configuring node budget limits
 * @returns SearchOutcome
 * @throws Error if input or budget parameters fail validation
 */
export function runBoundedSearch(
  input: SetSolverInput,
  budget: SearchBudget
): SearchOutcome {
  assertValidInputs(input, budget)

  const root = createSearchRoot(input)
  const rootFrame = createSearchFrame(
    input,
    root.accounting,
    root.remainingCandidates,
    []
  )
  let currentStack = createSearchStack(rootFrame)
  let currentDiagnostics = createSearchDiagnostics()

  while (true) {
    const step = stepSearchTraversal(
      input,
      currentStack,
      currentDiagnostics,
      budget
    )

    switch (step.status) {
      case 'ADVANCED':
        currentStack = step.stack
        currentDiagnostics = step.diagnostics
        break
      case 'COMPLETE':
        return {
          status: 'COMPLETE',
          selectedCandidates: step.selectedCandidates,
          finalAccounting: step.finalAccounting,
          diagnostics: step.diagnostics,
        }
      case 'SEARCH_BUDGET_EXHAUSTED':
        return {
          status: 'SEARCH_BUDGET_EXHAUSTED',
          diagnostics: step.diagnostics,
        }
      case 'ROOT_EXHAUSTED':
        return {
          status: 'PROVEN_INFEASIBLE',
          diagnostics: step.diagnostics,
        }
    }
  }
}

function assertValidInputs(input: SetSolverInput, budget: SearchBudget): void {
  if (!input) {
    throw new Error('Fatal BoundedSearch error: input is required')
  }

  if (!budget) {
    throw new Error('Fatal BoundedSearch error: budget is required')
  }

  const maxNodesVisited = budget.maxNodesVisited
  if (
    typeof maxNodesVisited !== 'number' ||
    !Number.isInteger(maxNodesVisited) ||
    maxNodesVisited <= 0
  ) {
    throw new Error(
      `Fatal BoundedSearch error: budget.maxNodesVisited must be a positive integer, received ${String(maxNodesVisited)}`
    )
  }
}
