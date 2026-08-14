/**
 * lib/engine/solver/position-slot.ts
 * ----------------------------------------------------------------------------
 * Physical PositionSlot Foundation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3, §13.
 *   - Allocation Model Specification v1.0 §6.
 *
 * WHAT THIS MODULE IS.
 *  - Represents physical exam positions (1..target.perSet per active Set).
 *  - Disjoined from BlueprintSlot / AxisTarget (which are planning/suitability concepts).
 *  - Pure deterministic position slot builder.
 */

import type { RunTarget } from '../reader/contracts'

/**
 * Valid set numbers supported by the Assessment Engine (1..5).
 */
export type PositionSetNumber = 1 | 2 | 3 | 4 | 5

/**
 * Physical Exam Position Slot.
 *
 * Represents physical position `positionNumber` (1..100) inside exam Set `setNumber`.
 * It carries NO planning slot identity (BlueprintSlot / slotId / AxisTarget), NO candidate
 * identity, NO scores, and NO metadata. It is pure physical identity.
 */
export interface PositionSlot {
  readonly setNumber: PositionSetNumber
  readonly positionNumber: number
}

/**
 * Builds the array of physical PositionSlots for a given active Set.
 *
 * @param target RunTarget defining `sets` and `perSet`
 * @param setNumber 1-based active Set number (1..target.sets)
 * @returns Array of exactly `target.perSet` PositionSlots numbered 1..target.perSet
 */
export function buildPositionSlots(
  target: RunTarget,
  setNumber: number
): readonly PositionSlot[] {
  assertValidInputs(target, setNumber)

  const count = target.perSet
  const validSetNumber = setNumber as PositionSetNumber
  const slots: PositionSlot[] = []

  for (let i = 1; i <= count; i++) {
    slots.push({
      setNumber: validSetNumber,
      positionNumber: i,
    })
  }

  return Object.freeze(slots)
}

function assertValidInputs(target: RunTarget, setNumber: number): void {
  if (
    !target ||
    typeof target.perSet !== 'number' ||
    !Number.isInteger(target.perSet) ||
    target.perSet <= 0
  ) {
    throw new Error(
      `Fatal PositionSlot error: target.perSet must be a positive integer, received ${String(target?.perSet)}`
    )
  }

  if (
    typeof target.sets !== 'number' ||
    !Number.isInteger(target.sets) ||
    target.sets < 1 ||
    target.sets > 5
  ) {
    throw new Error(
      `Fatal PositionSlot error: target.sets must be an integer between 1 and 5, received ${String(target?.sets)}`
    )
  }

  if (
    typeof setNumber !== 'number' ||
    !Number.isInteger(setNumber) ||
    setNumber < 1 ||
    setNumber > 5
  ) {
    throw new Error(
      `Fatal PositionSlot error: setNumber must be a valid set number (1..5), received ${String(setNumber)}`
    )
  }

  if (setNumber > target.sets) {
    throw new Error(
      `Fatal PositionSlot error: setNumber ${setNumber} exceeds active target.sets ${target.sets}`
    )
  }
}
