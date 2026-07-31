import type { AssessmentReviewResult } from './review-result'

export interface PublishableAssessmentSet {
  readonly setNumber: number
  readonly questionCodes: readonly string[]
  readonly expectedQuestionCount: number
}

export interface PublishableAssessment {
  readonly executionId: string
  readonly blueprint: string
  readonly sets: readonly PublishableAssessmentSet[]
}

/**
 * Product adapter from the approved Review result to numbered Exam Set inputs.
 *
 * It reads Solver placements without changing or re-running the Engine. The
 * database-facing action later resolves Question Codes to the existing
 * questions.id foreign-key contract.
 */
export function adaptReviewResultForPublish(
  result: AssessmentReviewResult
): PublishableAssessment {
  const allocation = result.allocatedCandidateSet
  const request = result.assemblyRequest
  if (!allocation || !request) {
    return {
      executionId: result.execution.executionId,
      blueprint: `${result.execution.blueprintId}@${result.execution.blueprintVersion}`,
      sets: [],
    }
  }

  const sets = Array.from(
    { length: request.target.sets },
    (_, index): PublishableAssessmentSet => {
      const setNumber = index + 1
      const questionCodes = allocation.placements
        .filter(
          (placement) =>
            placement.state === 'allocated' &&
            placement.slot.setNumber === setNumber
        )
        .map((placement) =>
          placement.state === 'allocated'
            ? placement.assignedCandidate.code
            : ''
        )

      return {
        setNumber,
        questionCodes,
        expectedQuestionCount: request.target.perSet,
      }
    }
  )

  return {
    executionId: result.execution.executionId,
    blueprint: `${result.execution.blueprintId}@${result.execution.blueprintVersion}`,
    sets,
  }
}
