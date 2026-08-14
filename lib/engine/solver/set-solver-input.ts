/**
 * lib/engine/solver/set-solver-input.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Input Contract.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines the immutable per-Set input contract for physical position allocation.
 *  - Combines the per-Set candidate universe (SetCandidateProfiles) and carried
 *    blueprint constraints (ConstraintSnapshot) for one active Set.
 *  - Provides pure fail-loud builder `buildSetSolverInput`.
 *  - Provides position slot bridge helper `buildSetSolverPositionSlots`.
 */

import type { ConstraintSnapshot, CandidateSet } from '../generator/contracts'
import type { PreTieSetCandidateProfiles } from '../ranking/contracts'
import { buildPositionSlots, type PositionSetNumber, type PositionSlot } from './position-slot'

/**
 * High-level Physical Solver input contract.
 */
export interface PhysicalSolverInput {
  readonly candidateSet: CandidateSet
  readonly setProfiles: readonly PreTieSetCandidateProfiles[]
}

/**
 * Per-Set physical Solver input contract.
 *
 * Carries the active `setNumber`, the complete per-Set candidate universe
 * (`PreTieSetCandidateProfiles`), and the carried blueprint constraints (`ConstraintSnapshot`).
 */
export interface SetSolverInput {
  readonly setNumber: PositionSetNumber
  readonly candidateUniverse: PreTieSetCandidateProfiles
  readonly constraintSnapshot: ConstraintSnapshot
}

/**
 * Pure fail-loud builder for SetSolverInput.
 *
 * Derives `setNumber` strictly from `candidateUniverse.setNumber` and validates:
 *  - constraintSnapshot.target.sets is an integer 1..5
 *  - constraintSnapshot.target.perSet is a positive integer (> 0)
 *  - candidateUniverse.setNumber <= constraintSnapshot.target.sets
 *  - duplicate questionCode inside candidateUniverse.profiles is forbidden
 *
 * Empty `profiles` and empty `suitabilityProfiles` are explicitly permitted.
 */
export function buildSetSolverInput(
  candidateUniverse: PreTieSetCandidateProfiles,
  constraintSnapshot: ConstraintSnapshot
): SetSolverInput {
  assertValidInputs(candidateUniverse, constraintSnapshot)

  return {
    setNumber: candidateUniverse.setNumber as PositionSetNumber,
    candidateUniverse,
    constraintSnapshot,
  }
}

/**
 * Pure helper deriving physical PositionSlots for a given SetSolverInput.
 *
 * Delegates construction directly to `buildPositionSlots` using the input's
 * `constraintSnapshot.target` and `setNumber`.
 */
export function buildSetSolverPositionSlots(
  input: SetSolverInput
): readonly PositionSlot[] {
  return buildPositionSlots(
    input.constraintSnapshot.target,
    input.setNumber
  )
}

function assertValidInputs(
  candidateUniverse: PreTieSetCandidateProfiles,
  constraintSnapshot: ConstraintSnapshot
): void {
  if (!candidateUniverse) {
    throw new Error('Fatal SetSolverInput error: candidateUniverse is required')
  }

  const setNumber = candidateUniverse.setNumber
  if (typeof setNumber !== 'number' || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > 5) {
    throw new Error(`Fatal SetSolverInput error: candidateUniverse.setNumber must be an integer (1..5), received ${String(setNumber)}`)
  }

  if (!candidateUniverse.profiles || !Array.isArray(candidateUniverse.profiles)) {
    throw new Error('Fatal SetSolverInput error: candidateUniverse.profiles must be an array')
  }

  if (!constraintSnapshot || !constraintSnapshot.target) {
    throw new Error('Fatal SetSolverInput error: constraintSnapshot with target is required')
  }

  const sets = constraintSnapshot.target.sets
  if (typeof sets !== 'number' || !Number.isInteger(sets) || sets < 1 || sets > 5) {
    throw new Error(`Fatal SetSolverInput error: constraintSnapshot.target.sets must be an integer (1..5), received ${String(sets)}`)
  }

  const perSet = constraintSnapshot.target.perSet
  if (typeof perSet !== 'number' || !Number.isInteger(perSet) || perSet <= 0) {
    throw new Error(`Fatal SetSolverInput error: constraintSnapshot.target.perSet must be a positive integer, received ${String(perSet)}`)
  }

  if (setNumber > sets) {
    throw new Error(`Fatal SetSolverInput error: candidateUniverse.setNumber ${setNumber} exceeds active target.sets ${sets}`)
  }

  const seenCodes = new Set<string>()
  for (const profile of candidateUniverse.profiles) {
    if (seenCodes.has(profile.questionCode)) {
      throw new Error(`Fatal SetSolverInput error: duplicate questionCode '${profile.questionCode}' in candidateUniverse.profiles`)
    }
    seenCodes.add(profile.questionCode)
  }
}
