/**
 * lib/engine/solver/physical-solver-orchestrator.ts
 * ----------------------------------------------------------------------------
 * Physical Multi-Set Orchestrator.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §13.
 *
 * WHAT THIS MODULE IS.
 *  - Orchestrates physical search and assignment across all active Sets.
 *  - Reads active set count from ConstraintSnapshot target.sets.
 *  - Requires and parses candidate-centric profiles from `setProfiles`.
 *  - Executes `runPhysicalSearch` for each Set, preserving Set ordering.
 */

import type { PreTieSetCandidateProfiles } from '../ranking/contracts'
import type { SearchBudget } from './search-contracts'
import { runPhysicalSearch, type PhysicalSearchResult } from './physical-search-result'
import { buildSetSolverInput, type PhysicalSolverInput } from './set-solver-input'

export interface PhysicalSolverRun {
  readonly results: readonly PhysicalSearchResult[]
}

/**
 * Solves physical assignments for all active Sets in a PhysicalSolverInput.
 *
 * Flow:
 *  1. Read active set count from input.candidateSet.constraintSnapshot.target.sets.
 *  2. Require input.setProfiles to be defined, fail-loud if missing.
 *  3. Loop setNumber from 1 to active set count:
 *     - Find exactly one PreTieSetCandidateProfiles matching setNumber.
 *     - Fail-loud if missing or if duplicate exists.
 *  4. Construct SetSolverInput using buildSetSolverInput.
 *  5. Call runPhysicalSearch exactly once per Set.
 *  6. Return physical solver run results preserving Set order (results[0] for Set 1, etc.).
 *
 * @param input Input PhysicalSolverInput containing set profiles and candidateSet snapshot
 * @param budget Search budget max node visits
 * @returns PhysicalSolverRun
 */
export function solvePhysicalAssignments(
  input: PhysicalSolverInput,
  budget: SearchBudget
): PhysicalSolverRun {
  if (!input) {
    throw new Error('Fatal PhysicalSolverOrchestrator error: input is required')
  }

  const snapshot = input.candidateSet?.constraintSnapshot
  if (!snapshot || !snapshot.target) {
    throw new Error('Fatal PhysicalSolverOrchestrator error: constraintSnapshot with target is required')
  }

  const activeSets = snapshot.target.sets
  if (typeof activeSets !== 'number' || activeSets < 1 || activeSets > 5) {
    throw new Error(`Fatal PhysicalSolverOrchestrator error: active sets target must be 1..5, received ${activeSets}`)
  }

  const setProfiles = input.setProfiles
  if (!setProfiles) {
    throw new Error('Fatal PhysicalSolverOrchestrator error: setProfiles must be present on rankedCandidateSet')
  }

  const results: PhysicalSearchResult[] = []

  for (let setNumber = 1; setNumber <= activeSets; setNumber++) {
    const matchingProfiles = setProfiles.filter(p => p.setNumber === setNumber)

    if (matchingProfiles.length === 0) {
      throw new Error(`Fatal PhysicalSolverOrchestrator error: missing profile for active setNumber ${setNumber}`)
    }
    if (matchingProfiles.length > 1) {
      throw new Error(`Fatal PhysicalSolverOrchestrator error: duplicate profiles found for active setNumber ${setNumber}`)
    }

    const setCandidateProfiles = matchingProfiles[0]!
    const setSolverInput = buildSetSolverInput(setCandidateProfiles, snapshot)
    const result = runPhysicalSearch(setSolverInput, budget)

    results.push(result)
  }

  return {
    results: Object.freeze(results),
  }
}
