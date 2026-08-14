/**
 * lib/engine/solver/physical-search-result.ts
 * ----------------------------------------------------------------------------
 * Physical Search Result Contract & Driver.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §13.
 *   - Allocation Model Specification v1.0 §6.
 *
 * WHAT THIS MODULE IS.
 *  - The single bridge from a bounded search outcome to a physical position
 *    assignment: it runs the search exactly once and, on COMPLETE, maps the
 *    deterministically-ordered selected candidates onto physical PositionSlots.
 *  - Reuses runBoundedSearch, SearchBudget, SearchOutcome, SearchDiagnostics,
 *    SetSolverInput, PositionAssignment, and assignCandidatesToPositions.
 *  - Adds NO scoring/ranking, NO re-sorting, NO legacy Solver/Placement mapping,
 *    NO publish logic, NO cross-Set state, and NO new constraints.
 */

import { runBoundedSearch } from './bounded-search'
import { assignCandidatesToPositions, type PositionAssignment } from './position-assignment'
import type { SearchBudget, SearchDiagnostics, SearchOutcome } from './search-contracts'
import type { SetSolverInput } from './set-solver-input'

/**
 * Discriminated union result of a physical search for one active Set.
 *
 *  - COMPLETE: a satisfying allocation was found and mapped to physical positions.
 *  - PROVEN_INFEASIBLE: every branch was exhausted within budget; no allocation exists.
 *  - SEARCH_BUDGET_EXHAUSTED: the node budget ran out before proving either way.
 */
export type PhysicalSearchResult =
  | {
      readonly status: 'COMPLETE'
      readonly assignment: PositionAssignment
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'PROVEN_INFEASIBLE'
      readonly diagnostics: SearchDiagnostics
    }
  | {
      readonly status: 'SEARCH_BUDGET_EXHAUSTED'
      readonly diagnostics: SearchDiagnostics
    }

/**
 * Runs the bounded physical search for one active Set and, on COMPLETE, assigns
 * the selected candidates to physical positions.
 *
 * Flow:
 *  1. Run `runBoundedSearch(input, budget)` exactly once.
 *  2. PROVEN_INFEASIBLE / SEARCH_BUDGET_EXHAUSTED are propagated verbatim with
 *     their diagnostics.
 *  3. COMPLETE is mapped via `assignCandidatesToPositions`, preserving the
 *     deterministic selectedCandidates order exactly (no re-sort, no re-search).
 *
 * @param input SetSolverInput carrying the candidate universe and constraint snapshot
 * @param budget SearchBudget node limit
 * @returns PhysicalSearchResult
 */
export function runPhysicalSearch(
  input: SetSolverInput,
  budget: SearchBudget
): PhysicalSearchResult {
  const searchResult: SearchOutcome = runBoundedSearch(input, budget)

  switch (searchResult.status) {
    case 'PROVEN_INFEASIBLE':
      return {
        status: 'PROVEN_INFEASIBLE',
        diagnostics: searchResult.diagnostics,
      }
    case 'SEARCH_BUDGET_EXHAUSTED':
      return {
        status: 'SEARCH_BUDGET_EXHAUSTED',
        diagnostics: searchResult.diagnostics,
      }
    case 'COMPLETE':
      return {
        status: 'COMPLETE',
        assignment: assignCandidatesToPositions(
          input.setNumber,
          input.constraintSnapshot.target.perSet,
          searchResult.selectedCandidates
        ),
        diagnostics: searchResult.diagnostics,
      }
  }
}
