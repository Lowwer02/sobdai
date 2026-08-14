/**
 * lib/engine/solver/search-expansion.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Search Single-Depth Expansion.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §8, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines pure single-depth expansion evaluating all candidate choices from a search node.
 *  - Disjoined from DFS recursion, backtracking execution, or state mutation.
 */

import type { CandidateProfile } from '../ranking/contracts'
import { orderCandidates } from './branch-ordering'
import type { JointAccountingState } from './joint-accounting'
import {
  transitionCandidate,
  type CandidateTransitionResult,
} from './search-transition'
import type { SetSolverInput } from './set-solver-input'

/**
 * Pure single-depth expansion function evaluating one level of candidate transitions from a parent search node.
 *
 * @param input Carried SetSolverInput
 * @param accounting Current parent JointAccountingState snapshot
 * @param remainingCandidates Pool of available unplaced CandidateProfiles
 * @returns Array of CandidateTransitionResults corresponding to every candidate choice in deterministic branch order
 * @throws Error if accounting.setNumber !== input.setNumber
 */
export function expandOneDepth(
  input: SetSolverInput,
  accounting: JointAccountingState,
  remainingCandidates: readonly CandidateProfile[]
): readonly CandidateTransitionResult[] {
  assertValidInputs(input, accounting, remainingCandidates)

  if (remainingCandidates.length === 0) {
    return Object.freeze([])
  }

  const orderedCandidates = orderCandidates(
    accounting,
    remainingCandidates,
    input.constraintSnapshot
  )

  const results: CandidateTransitionResult[] = []

  for (const candidate of orderedCandidates) {
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

    const result = transitionCandidate(
      accounting,
      candidate,
      input.constraintSnapshot,
      remainingTier1CandidatesAfterApply,
      remainingDistinctCandidatesAfterApply
    )

    results.push(result)
  }

  return Object.freeze(results)
}

function assertValidInputs(
  input: SetSolverInput,
  accounting: JointAccountingState,
  remainingCandidates: readonly CandidateProfile[]
): void {
  if (!input) {
    throw new Error('Fatal SearchExpansion error: input is required')
  }

  if (!accounting) {
    throw new Error('Fatal SearchExpansion error: accounting is required')
  }

  if (accounting.setNumber !== input.setNumber) {
    throw new Error(
      `Fatal SearchExpansion error: accounting.setNumber (${String(accounting.setNumber)}) does not match input.setNumber (${String(input.setNumber)})`
    )
  }

  if (!remainingCandidates || !Array.isArray(remainingCandidates)) {
    throw new Error('Fatal SearchExpansion error: remainingCandidates array is required')
  }
}
