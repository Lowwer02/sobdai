/**
 * lib/engine/solver/branch-ordering.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Candidate Branch Ordering.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §8, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines deterministic branch ordering for candidate exploration in physical allocation search.
 *  - Prioritizes Tier 1 candidates when Tier 1 floor is unsatisfied; uses stable lexical tie-breaking.
 *  - Disjoined from candidate filtering, pruning, or state mutation.
 */

import type { ConstraintSnapshot } from '../generator/contracts'
import type { PreTieCandidateProfile } from '../ranking/contracts'
import type { JointAccountingState } from './joint-accounting'

/**
 * Deterministically orders candidates for branch exploration during physical allocation search.
 *
 * Ordering v1 rules:
 *  1. If current Tier 1 count is below tier1Floor, Tier 1 candidates are ordered first, followed by non-Tier 1 candidates.
 *  2. Within each group (or overall if Tier 1 floor is satisfied), candidates are sorted in ascending lexical order by questionCode.
 *
 * Does NOT drop or filter any candidate from the input list. Returns a fresh sorted array.
 *
 * @param accounting Current JointAccountingState
 * @param candidates Array of available CandidateProfiles to order
 * @param constraintSnapshot Carried ConstraintSnapshot
 * @returns Ordered array containing all input candidates without omission
 */
export function orderCandidates(
  accounting: JointAccountingState,
  candidates: readonly PreTieCandidateProfile[],
  constraintSnapshot: ConstraintSnapshot
): readonly PreTieCandidateProfile[] {
  assertValidInputs(accounting, candidates, constraintSnapshot)

  if (candidates.length <= 1) {
    return [...candidates]
  }

  const currentTier1 = accounting.tierCounts.get(1) ?? 0
  const floor = constraintSnapshot.distributionConstraints.tier1Floor
  const tier1Needed = currentTier1 < floor

  const sorted = [...candidates].sort((a, b) => {
    if (tier1Needed) {
      const aIsTier1 = a.candidate.metadata.tier === 1 ? 0 : 1
      const bIsTier1 = b.candidate.metadata.tier === 1 ? 0 : 1
      if (aIsTier1 !== bIsTier1) {
        return aIsTier1 - bIsTier1
      }
    }
    return compareStrings(a.questionCode, b.questionCode)
  })

  return Object.freeze(sorted)
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function assertValidInputs(
  accounting: JointAccountingState,
  candidates: readonly PreTieCandidateProfile[],
  constraintSnapshot: ConstraintSnapshot
): void {
  if (!accounting) {
    throw new Error('Fatal BranchOrdering error: accounting is required')
  }

  if (!candidates || !Array.isArray(candidates)) {
    throw new Error('Fatal BranchOrdering error: candidates array is required')
  }

  if (
    !constraintSnapshot ||
    !constraintSnapshot.distributionConstraints ||
    typeof constraintSnapshot.distributionConstraints.tier1Floor !== 'number'
  ) {
    throw new Error(
      'Fatal BranchOrdering error: constraintSnapshot with distributionConstraints.tier1Floor is required'
    )
  }
}
