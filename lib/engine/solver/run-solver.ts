/**
 * lib/engine/solver/run-solver.ts
 * ----------------------------------------------------------------------------
 * Production Runtime entry point for the Constraint Solver.
 *
 * `runSolver()` owns orchestration only. Every allocation, validation,
 * conflict, state-transition, finalization, audit, and emission decision
 * remains delegated to its existing production stage.
 */

import type { RankedCandidateSet } from '../ranking/contracts'
import { validateResolvedAllocation } from './allocation-validation'
import { applyAllocationState } from './allocation-state-application'
import { finalizeAllocationAudit } from './audit'
import { validateBlueprintConstraints } from './blueprint-validation'
import { detectAllocationConflicts } from './conflict-detection'
import { resolveDetectedConflicts } from './conflict-resolution'
import type {
  ConstraintSolverResult,
  SolverDiagnostic,
} from './contracts'
import { emitAllocatedCandidateSet } from './emission'
import { finalizeAllocationState } from './finalization'
import { initializeCandidatePlacement } from './placement'
import { initializeAllocationRuntime } from './runtime'

/**
 * Executes the complete production Solver pipeline.
 *
 * Fixed flow:
 *
 * Runtime Initialization → Blueprint Validation → Candidate Placement →
 * Conflict Detection → Conflict Resolution → Allocation State Application →
 * Allocation Validation → Allocation Finalization → Audit Finalization →
 * AllocatedCandidateSet Emission.
 *
 * Fatal diagnostics produced by a stage are forwarded unchanged and halt the
 * execution. Structural exceptions from production stages propagate unchanged;
 * this Runtime has no infrastructure failures to map.
 */
export function runSolver(
  rankedCandidateSet: RankedCandidateSet
): ConstraintSolverResult {
  const initialState = initializeAllocationRuntime(rankedCandidateSet)
  const blueprintValidation =
    validateBlueprintConstraints(initialState)
  if (blueprintValidation.fatalDiagnostics.length > 0) {
    return failure(blueprintValidation.fatalDiagnostics)
  }

  const placement = initializeCandidatePlacement(
    initialState,
    blueprintValidation,
    rankedCandidateSet
  )
  const conflictDetection = detectAllocationConflicts(
    placement,
    initialState,
    blueprintValidation
  )
  const conflictResolution = resolveDetectedConflicts(
    conflictDetection,
    placement,
    initialState
  )
  const appliedState = applyAllocationState(
    initialState,
    placement,
    conflictResolution
  )
  const allocationValidation = validateResolvedAllocation(
    conflictResolution,
    placement,
    appliedState
  )
  const allocationFatalDiagnostics = fatalDiagnostics(
    allocationValidation.validationDiagnostics
  )
  if (allocationFatalDiagnostics.length > 0) {
    return failure(allocationFatalDiagnostics)
  }

  const finalization = finalizeAllocationState(
    appliedState,
    allocationValidation
  )
  const finalizationFatalDiagnostics = fatalDiagnostics(
    finalization.finalizedDiagnostics
  )
  if (finalizationFatalDiagnostics.length > 0) {
    return failure(finalizationFatalDiagnostics)
  }

  const audit = finalizeAllocationAudit(finalization, appliedState)
  const auditFatalDiagnostics = fatalDiagnostics(
    audit.auditDiagnostics
  )
  if (auditFatalDiagnostics.length > 0) {
    return failure(auditFatalDiagnostics)
  }

  return {
    ok: true,
    allocatedCandidateSet: emitAllocatedCandidateSet(
      finalization,
      audit,
      appliedState
    ),
  }
}

function failure(
  fatalDiagnostics: readonly SolverDiagnostic[]
): ConstraintSolverResult {
  return {
    ok: false,
    fatalDiagnostics,
  }
}

function fatalDiagnostics(
  diagnostics: readonly SolverDiagnostic[]
): readonly SolverDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'Fatal'
  )
}
