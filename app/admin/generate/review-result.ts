import type { generateAssessmentAdminAction } from './actions'

type GenerateActionResult = Awaited<
  ReturnType<typeof generateAssessmentAdminAction>
>

/**
 * Canonical Product view of the successful Generate transport result.
 *
 * This alias is derived from the existing action instead of redefining any
 * Engine contract. Review, Approval, and Publish share this exact type.
 */
export type AssessmentReviewResult = Extract<
  GenerateActionResult,
  { readonly success: true }
>['result']
