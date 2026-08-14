import {
  resolveBlueprintPhysicalSolverBudget,
  type AdminAssessmentBlueprintKey,
} from './config'

export interface AdminGenerateAssessmentInput {
  readonly blueprintKey: AdminAssessmentBlueprintKey
  readonly targetSetCount?: 1 | 2 | 3 | 4 | 5
  readonly overFetchFactor: number
  readonly auditVerbosity: 'summary' | 'full'
  readonly physicalSolverMaxNodesVisited?: number
}

export function mapAdminOptions(input: AdminGenerateAssessmentInput) {
  return {
    overFetchFactor: input.overFetchFactor,
    performanceBudgetMs: null,
    parallelismHint: null,
    auditVerbosity: input.auditVerbosity,
    targetSetCount: input.targetSetCount,
    ...(input.physicalSolverMaxNodesVisited !== undefined
      ? {
          physicalSolver: {
            maxNodesVisited: input.physicalSolverMaxNodesVisited,
          },
        }
      : {}),
  }
}

/**
 * Resolve the effective Engine execution options for an Admin generation
 * request.
 *
 * The registry policy is authoritative: the characterized Physical Solver
 * budget for `blueprintKey` always wins over any caller-supplied
 * `physicalSolverMaxNodesVisited`. An uncharacterized blueprint resolves to
 * `undefined`, which leaves the Physical Solver unrequested (fail-closed).
 */
export function resolveAdminExecutionOptions(
  input: AdminGenerateAssessmentInput,
  blueprintKey: string
): ReturnType<typeof mapAdminOptions> {
  const resolvedPolicy = resolveBlueprintPhysicalSolverBudget(blueprintKey)
  return mapAdminOptions({
    ...input,
    physicalSolverMaxNodesVisited: resolvedPolicy,
  })
}

export function validateAdminGenerateInput(
  input: AdminGenerateAssessmentInput
): string | null {
  const value: unknown = input
  if (typeof value !== 'object' || value === null) {
    return 'Generation settings are required.'
  }

  if (
    typeof input.blueprintKey !== 'string' ||
    input.blueprintKey.trim().length === 0
  ) {
    return 'Select a supported Assessment Blueprint.'
  }

  if (
    ![1, 1.5, 2, 3].includes(input.overFetchFactor)
  ) {
    return 'Candidate headroom must be one of the supported values.'
  }

  if (
    input.targetSetCount !== undefined &&
    (!Number.isInteger(input.targetSetCount) ||
      input.targetSetCount < 1 ||
      input.targetSetCount > 5)
  ) {
    return 'Target set count must be between 1 and 5 sets.'
  }

  if (
    input.auditVerbosity !== 'summary' &&
    input.auditVerbosity !== 'full'
  ) {
    return 'Audit detail must be summary or full.'
  }

  if (
    input.physicalSolverMaxNodesVisited !== undefined &&
    (typeof input.physicalSolverMaxNodesVisited !== 'number' ||
      !Number.isFinite(input.physicalSolverMaxNodesVisited) ||
      !Number.isInteger(input.physicalSolverMaxNodesVisited) ||
      input.physicalSolverMaxNodesVisited <= 0)
  ) {
    return 'Physical solver budget must be a positive integer.'
  }

  return null
}
