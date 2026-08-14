/**
 * lib/engine/solver/allocation-evaluator.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Allocation Evaluator.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §8.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines input/verdict contracts and evaluation logic for single-Set physical allocation.
 *  - Evaluates perSet cardinality target, withinSet candidate uniqueness, Tier 1 floor, and Tier 4 ceiling.
 *  - Disjoined from search execution, backtracking, or state mutation.
 */

import type { ConstraintSnapshot } from '../generator/contracts'
import type { JointAccountingState } from './joint-accounting'
import type { PositionSetNumber } from './position-slot'

/**
 * Input contract for per-Set physical allocation evaluation.
 */
export interface AllocationEvaluatorInput {
  readonly accounting: JointAccountingState
  readonly constraintSnapshot: ConstraintSnapshot
}

/**
 * Verdict contract for per-Set physical allocation evaluation.
 */
export interface AllocationEvaluatorVerdict {
  readonly setNumber: PositionSetNumber
  readonly perSetSatisfied: boolean
  readonly withinSetUniquenessSatisfied: boolean
  readonly tier1FloorSatisfied: boolean
  readonly tier4CeilingSatisfied: boolean
}

/**
 * Evaluates cardinality, within-set uniqueness, Tier 1 floor, and Tier 4 ceiling constraints over a JointAccountingState.
 *
 * @param input AllocationEvaluatorInput containing accounting state and constraint snapshot
 * @returns AllocationEvaluatorVerdict
 * @throws Error if input parameters fail basic validation guards
 */
export function evaluateAllocation(
  input: AllocationEvaluatorInput
): AllocationEvaluatorVerdict {
  assertValidInput(input)

  const { accounting, constraintSnapshot } = input

  const perSetSatisfied = accounting.placedCount === constraintSnapshot.target.perSet
  const withinSetUniquenessSatisfied =
    accounting.placedCount === accounting.selectedQuestionCodes.size

  const tier1Count = accounting.tierCounts.get(1) ?? 0
  const tier1Floor = constraintSnapshot.distributionConstraints.tier1Floor
  const tier1FloorSatisfied = tier1Count >= tier1Floor

  const tier4Count = accounting.tierCounts.get(4) ?? 0
  const tier4Ceiling = constraintSnapshot.distributionConstraints.tier4Ceiling
  const tier4CeilingSatisfied = tier4Count <= tier4Ceiling

  return {
    setNumber: accounting.setNumber,
    perSetSatisfied,
    withinSetUniquenessSatisfied,
    tier1FloorSatisfied,
    tier4CeilingSatisfied,
  }
}

function assertValidInput(input: AllocationEvaluatorInput): void {
  if (!input) {
    throw new Error('Fatal AllocationEvaluator error: input is required')
  }

  const { accounting, constraintSnapshot } = input

  if (!accounting) {
    throw new Error('Fatal AllocationEvaluator error: input.accounting is required')
  }

  const setNumber = accounting.setNumber
  if (typeof setNumber !== 'number' || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > 5) {
    throw new Error(
      `Fatal AllocationEvaluator error: accounting.setNumber must be an integer (1..5), received ${String(setNumber)}`
    )
  }

  if (!constraintSnapshot || !constraintSnapshot.target) {
    throw new Error('Fatal AllocationEvaluator error: input.constraintSnapshot with target is required')
  }

  const perSet = constraintSnapshot.target.perSet
  if (typeof perSet !== 'number' || !Number.isInteger(perSet) || perSet <= 0) {
    throw new Error(
      `Fatal AllocationEvaluator error: constraintSnapshot.target.perSet must be a positive integer, received ${String(perSet)}`
    )
  }

  if (
    !constraintSnapshot.distributionConstraints ||
    typeof constraintSnapshot.distributionConstraints.tier1Floor !== 'number' ||
    typeof constraintSnapshot.distributionConstraints.tier4Ceiling !== 'number'
  ) {
    throw new Error(
      'Fatal AllocationEvaluator error: input.constraintSnapshot.distributionConstraints (tier1Floor, tier4Ceiling) is required'
    )
  }
}
