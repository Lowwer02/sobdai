import type { PublishableAssessmentSet } from './publish-adapter'
import type { PublishApprovedAssessmentInput } from './publish-contracts'

/**
 * Runtime validation for the public Publish Server Action boundary.
 *
 * TypeScript types do not protect Server Actions from forged POST payloads,
 * so this validates the unknown runtime shape before any values are trusted.
 */
export function validatePublishInput(
  input: PublishApprovedAssessmentInput
): string | null {
  const value: unknown = input
  if (!isRecord(value)) {
    return 'Publish settings are required.'
  }

  if (!isRecord(value.approval)) {
    return 'Publish requires an approved Review result.'
  }
  if (
    value.approval.decision !== 'approved' ||
    typeof value.approval.executionId !== 'string' ||
    value.approval.executionId.trim().length === 0
  ) {
    return 'Publish requires an approved Review result.'
  }
  if (
    typeof value.packageId !== 'string' ||
    value.packageId.trim().length === 0
  ) {
    return 'A destination Package is required.'
  }
  if (
    typeof value.baseName !== 'string' ||
    value.baseName.trim().length === 0
  ) {
    return 'An Exam Set name is required.'
  }
  if (value.baseName.trim().length > 200) {
    return 'Exam Set names cannot exceed 200 characters.'
  }
  if (
    typeof value.description !== 'string' ||
    value.description.length > 2_000
  ) {
    return 'Exam Set descriptions cannot exceed 2,000 characters.'
  }
  if (
    !Number.isInteger(value.durationMinutes) ||
    (value.durationMinutes as number) < 1
  ) {
    return 'Duration must be a positive whole number of minutes.'
  }
  if (
    !Number.isInteger(value.sortOrder) ||
    !Number.isInteger(value.displayOrder)
  ) {
    return 'Sort and display order must be whole numbers.'
  }
  if (typeof value.isSample !== 'boolean') {
    return 'Exam Set availability is invalid.'
  }
  if (!Array.isArray(value.sets) || value.sets.length === 0) {
    return 'The approved result contains no publishable assessment sets.'
  }
  if (value.sets.length > 20) {
    return 'The approved result contains too many assessment sets.'
  }

  const seenSetNumbers = new Set<number>()
  for (const setValue of value.sets) {
    if (!isRecord(setValue)) {
      return 'The approved result contains an invalid assessment set.'
    }
    const set = setValue as unknown as PublishableAssessmentSet
    if (
      !Number.isInteger(set.setNumber) ||
      set.setNumber < 1 ||
      seenSetNumbers.has(set.setNumber)
    ) {
      return 'Assessment Set numbers must be unique positive integers.'
    }
    seenSetNumbers.add(set.setNumber)

    if (!Array.isArray(set.questionCodes) || set.questionCodes.length === 0) {
      return `Assessment Set ${set.setNumber} contains no allocated questions.`
    }
    if (
      !Number.isInteger(set.expectedQuestionCount) ||
      set.expectedQuestionCount < 1 ||
      set.expectedQuestionCount > 1_000
    ) {
      return `Assessment Set ${set.setNumber} has an invalid question target.`
    }
    if (set.questionCodes.length > set.expectedQuestionCount) {
      return `Assessment Set ${set.setNumber} exceeds its approved question target.`
    }
    if (
      set.questionCodes.some(
        (questionCode) =>
          typeof questionCode !== 'string' ||
          questionCode.trim().length === 0 ||
          questionCode.length > 100
      )
    ) {
      return `Assessment Set ${set.setNumber} contains an invalid Question Code.`
    }
    if (new Set(set.questionCodes).size !== set.questionCodes.length) {
      return `Assessment Set ${set.setNumber} contains duplicate Question Codes.`
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
