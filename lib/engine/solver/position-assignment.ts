/**
 * lib/engine/solver/position-assignment.ts
 * ----------------------------------------------------------------------------
 * Physical Position Assignment Contracts.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3, §13.
 *   - Allocation Model Specification v1.0 §6.
 *
 * WHAT THIS MODULE IS.
 *  - Defines the immutable contracts that map a completed search's selected
 *    candidates onto physical PositionSlots.
 *  - Reuses existing PositionSlot / PositionSetNumber / CandidateProfile; adds no
 *    new identity, scoring, ranking, or duplicate questionCode fields.
 *  - Disjoined from assignment execution, search logic, publish logic, and
 *    cross-Set state.
 */

import type { PreTieCandidateProfile } from '../ranking/contracts'
import { buildPositionSlots, type PositionSetNumber, type PositionSlot } from './position-slot'

/**
 * A single physical placement: one PreTieCandidateProfile assigned to one PositionSlot.
 *
 * Carries no scores, no re-ranked ordering, and no duplicate questionCode field
 * (the questionCode remains accessible via `candidate.identity.questionCode`).
 */
export interface PhysicalPlacement {
  readonly position: PositionSlot
  readonly candidate: PreTieCandidateProfile
}

/**
 * Result contract for assigning DFS-selected candidates to physical positions
 * within one active Set.
 *
 * `placements` MUST preserve the deterministic selectedCandidates order returned
 * by the bounded search — it MUST NOT be re-ranked or re-sorted.
 */
export interface PositionAssignment {
  readonly setNumber: PositionSetNumber
  readonly placements: readonly PhysicalPlacement[]
}

/**
 * Assigns DFS-selected candidates to physical PositionSlots, preserving the
 * deterministic selectedCandidates order exactly.
 *
 * selectedCandidates[i] is mapped to positionNumber (i + 1). Physical positions
 * are built exclusively via buildPositionSlots — no manual PositionSlot construction.
 *
 * Fail-loud guards (executed before any placement):
 *  - perSet is not a positive integer
 *  - selectedCandidates.length !== perSet
 *  - selectedCandidates contains a duplicate questionCode
 *
 * setNumber range / structural PositionSlot validation is delegated to
 * buildPositionSlots.
 *
 * Does NOT re-rank, re-sort, or mutate selectedCandidates.
 *
 * @param setNumber Active set number (1..5)
 * @param perSet Total placements required for this Set
 * @param selectedCandidates Deterministically ordered DFS-selected candidates
 * @returns PositionAssignment containing physical placements
 */
export function assignCandidatesToPositions(
  setNumber: PositionSetNumber,
  perSet: number,
  selectedCandidates: readonly PreTieCandidateProfile[]
): PositionAssignment {
  // 1. perSet must be a positive integer.
  if (
    typeof perSet !== 'number' ||
    !Number.isInteger(perSet) ||
    perSet <= 0
  ) {
    throw new Error(
      `Fatal PositionAssignment error: perSet must be a positive integer, received ${String(perSet)}`
    )
  }

  // 2. Selected cardinality must equal perSet.
  if (selectedCandidates.length !== perSet) {
    throw new Error(
      `Fatal PositionAssignment error: selectedCandidates.length (${selectedCandidates.length}) must equal perSet (${perSet})`
    )
  }

  // 3. No duplicate questionCode within the Set.
  const seenCodes = new Set<string>()
  for (const profile of selectedCandidates) {
    const code = profile.questionCode
    if (seenCodes.has(code)) {
      throw new Error(
        `Fatal PositionAssignment error: duplicate questionCode '${code}' in selectedCandidates`
      )
    }
    seenCodes.add(code)
  }

  // 4. Build physical positions via the existing authority; setNumber/perSet
  //    structural validation remains owned by buildPositionSlots.
  const positions = buildPositionSlots({ sets: setNumber, perSet }, setNumber)

  // 5. Preserve selectedCandidates order exactly: positions[i].positionNumber === i + 1.
  const placements: PhysicalPlacement[] = positions.map((position, index) => ({
    position,
    candidate: selectedCandidates[index]!,
  }))

  return {
    setNumber,
    placements,
  }
}
