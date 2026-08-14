/**
 * lib/engine/solver/pruning-predicates.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Pruning Predicates.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §8, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines pure pruning predicates for early Search tree pruning.
 *  - Disjoined from search execution, branch ordering, or state mutation.
 */

import type { ConstraintSnapshot } from '../generator/contracts'
import type { JointAccountingState } from './joint-accounting'

/**
 * Pure pruning predicate evaluating whether Tier 4 ceiling has been exceeded.
 *
 * @param accounting JointAccountingState snapshot
 * @param constraintSnapshot Carried ConstraintSnapshot
 * @returns true if Tier 4 count exceeds tier4Ceiling (prune branch); false otherwise
 */
export function pruneTier4CeilingExceeded(
  accounting: JointAccountingState,
  constraintSnapshot: ConstraintSnapshot
): boolean {
  assertValidInputs(accounting, constraintSnapshot)

  const tier4Count = accounting.tierCounts.get(4) ?? 0
  const ceiling = constraintSnapshot.distributionConstraints.tier4Ceiling

  return tier4Count > ceiling
}

/**
 * Pure pruning predicate evaluating whether Tier 1 floor is mathematically unreachable.
 *
 * @param accounting JointAccountingState snapshot
 * @param remainingPositions Number of physical position slots left to fill (>= 0)
 * @param remainingTier1Candidates Number of unplaced Tier 1 candidates available (>= 0)
 * @param constraintSnapshot Carried ConstraintSnapshot
 * @returns true if maxReachableTier1 < tier1Floor (prune branch); false otherwise
 */
export function pruneTier1FloorUnreachable(
  accounting: JointAccountingState,
  remainingPositions: number,
  remainingTier1Candidates: number,
  constraintSnapshot: ConstraintSnapshot
): boolean {
  assertValidInputs(accounting, constraintSnapshot)

  if (
    typeof remainingPositions !== 'number' ||
    !Number.isInteger(remainingPositions) ||
    remainingPositions < 0
  ) {
    throw new Error(
      `Fatal Pruning error: remainingPositions must be a non-negative integer, received ${String(remainingPositions)}`
    )
  }

  if (
    typeof remainingTier1Candidates !== 'number' ||
    !Number.isInteger(remainingTier1Candidates) ||
    remainingTier1Candidates < 0
  ) {
    throw new Error(
      `Fatal Pruning error: remainingTier1Candidates must be a non-negative integer, received ${String(remainingTier1Candidates)}`
    )
  }

  if (typeof constraintSnapshot.distributionConstraints.tier1Floor !== 'number') {
    throw new Error(
      'Fatal Pruning error: constraintSnapshot.distributionConstraints.tier1Floor is required'
    )
  }

  const currentTier1 = accounting.tierCounts.get(1) ?? 0
  const floor = constraintSnapshot.distributionConstraints.tier1Floor

  const maxReachableTier1 =
    currentTier1 + Math.min(remainingPositions, remainingTier1Candidates)

  return maxReachableTier1 < floor
}

/**
 * Pure pruning predicate evaluating whether remaining candidate universe is smaller than remaining positions.
 *
 * @param remainingDistinctCandidates Count of unplaced distinct candidates available (>= 0)
 * @param remainingPositions Count of physical position slots left to fill (>= 0)
 * @returns true if remainingDistinctCandidates < remainingPositions (prune branch); false otherwise
 */
export function pruneUniverseInsufficient(
  remainingDistinctCandidates: number,
  remainingPositions: number
): boolean {
  if (
    typeof remainingDistinctCandidates !== 'number' ||
    !Number.isInteger(remainingDistinctCandidates) ||
    remainingDistinctCandidates < 0
  ) {
    throw new Error(
      `Fatal Pruning error: remainingDistinctCandidates must be a non-negative integer, received ${String(remainingDistinctCandidates)}`
    )
  }

  if (
    typeof remainingPositions !== 'number' ||
    !Number.isInteger(remainingPositions) ||
    remainingPositions < 0
  ) {
    throw new Error(
      `Fatal Pruning error: remainingPositions must be a non-negative integer, received ${String(remainingPositions)}`
    )
  }

  return remainingDistinctCandidates < remainingPositions
}

function assertValidInputs(
  accounting: JointAccountingState,
  constraintSnapshot: ConstraintSnapshot
): void {
  if (!accounting) {
    throw new Error('Fatal Pruning error: accounting is required')
  }

  if (
    !constraintSnapshot ||
    !constraintSnapshot.distributionConstraints ||
    typeof constraintSnapshot.distributionConstraints.tier4Ceiling !== 'number'
  ) {
    throw new Error('Fatal Pruning error: constraintSnapshot with tier4Ceiling is required')
  }
}
