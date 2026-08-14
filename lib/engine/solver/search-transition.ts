/**
 * lib/engine/solver/search-transition.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Search Transition Contracts & Logic.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §8, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines discriminated union contract and transition evaluation for single candidate choices.
 *  - Disjoined from DFS recursion, search execution, or state mutation.
 */

import type { ConstraintSnapshot } from '../generator/contracts'
import type { PreTieCandidateProfile } from '../ranking/contracts'
import { evaluateAllocation } from './allocation-evaluator'
import { applyCandidate, type JointAccountingState } from './joint-accounting'
import {
  pruneTier1FloorUnreachable,
  pruneTier4CeilingExceeded,
  pruneUniverseInsufficient,
} from './pruning-predicates'

/**
 * Discriminated union outcome of evaluating a single candidate transition during physical search.
 */
export type CandidateTransitionResult =
  | {
      readonly status: 'CONTINUE'
      readonly candidate: PreTieCandidateProfile
      readonly accounting: JointAccountingState
    }
  | {
      readonly status: 'COMPLETE'
      readonly candidate: PreTieCandidateProfile
      readonly accounting: JointAccountingState
    }
  | {
      readonly status: 'PRUNED'
      readonly candidate: PreTieCandidateProfile
      readonly accounting: JointAccountingState
    }

/**
 * Pure transition evaluation function applying one candidate to the current accounting ledger.
 *
 * @param accounting Current JointAccountingState snapshot
 * @param candidate CandidateProfile to apply
 * @param constraintSnapshot Carried ConstraintSnapshot
 * @param remainingTier1CandidatesAfterApply Unplaced Tier 1 candidates available after candidate placement
 * @param remainingDistinctCandidatesAfterApply Unplaced distinct candidates available after candidate placement
 * @returns CandidateTransitionResult with 'PRUNED', 'COMPLETE', or 'CONTINUE' status
 */
export function transitionCandidate(
  accounting: JointAccountingState,
  candidate: PreTieCandidateProfile,
  constraintSnapshot: ConstraintSnapshot,
  remainingTier1CandidatesAfterApply: number,
  remainingDistinctCandidatesAfterApply: number
): CandidateTransitionResult {
  const nextAccounting = applyCandidate(accounting, candidate.candidate)

  // 1. Tier 4 ceiling prune
  if (pruneTier4CeilingExceeded(nextAccounting, constraintSnapshot)) {
    return {
      status: 'PRUNED',
      candidate,
      accounting: nextAccounting,
    }
  }

  const remainingPositions =
    constraintSnapshot.target.perSet - nextAccounting.placedCount

  // 2. Tier 1 floor unreachable prune
  if (
    pruneTier1FloorUnreachable(
      nextAccounting,
      remainingPositions,
      remainingTier1CandidatesAfterApply,
      constraintSnapshot
    )
  ) {
    return {
      status: 'PRUNED',
      candidate,
      accounting: nextAccounting,
    }
  }

  // 3. Universe insufficiency prune
  if (
    pruneUniverseInsufficient(
      remainingDistinctCandidatesAfterApply,
      remainingPositions
    )
  ) {
    return {
      status: 'PRUNED',
      candidate,
      accounting: nextAccounting,
    }
  }

  // 4. Evaluate allocation for COMPLETE status
  const verdict = evaluateAllocation({
    accounting: nextAccounting,
    constraintSnapshot,
  })

  if (
    verdict.perSetSatisfied &&
    verdict.withinSetUniquenessSatisfied &&
    verdict.tier1FloorSatisfied &&
    verdict.tier4CeilingSatisfied
  ) {
    return {
      status: 'COMPLETE',
      candidate,
      accounting: nextAccounting,
    }
  }

  return {
    status: 'CONTINUE',
    candidate,
    accounting: nextAccounting,
  }
}
