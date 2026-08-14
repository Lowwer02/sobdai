/**
 * lib/engine/solver/search-contracts.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Search Contracts.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3, §8, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines immutable contracts for per-Set physical search execution.
 *  - Disjoined from search execution, branch ordering, or state mutation.
 */

import type { PreTieCandidateProfile } from '../ranking/contracts'
import type { JointAccountingState } from './joint-accounting'

/**
 * Search budget configuration (input only).
 */
export interface SearchBudget {
  readonly maxNodesVisited: number
}

/**
 * Search diagnostics component recording search statistics.
 */
export interface SearchDiagnostics {
  readonly nodesVisited: number
  readonly backtracks: number
}

/**
 * Discriminated union outcome of a per-Set physical allocation search.
 */
export type SearchOutcome =
  | {
      readonly status: 'COMPLETE'
      readonly selectedCandidates: readonly PreTieCandidateProfile[]
      readonly finalAccounting: JointAccountingState
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
