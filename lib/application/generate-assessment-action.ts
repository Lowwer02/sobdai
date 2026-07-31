/**
 * Canonical Application Use Case for generating an assessment.
 *
 * Every transport invokes this action. The action delegates request validation,
 * Engine invocation, and Application-level error translation to the completed
 * AssessmentEngineService so those responsibilities retain one implementation.
 */

import { AssessmentEngineService } from './assessment-engine-service'

/**
 * The only Application Use Case permitted to generate an assessment.
 *
 * Its request and response types are derived from AssessmentEngineService
 * instead of being redeclared. AssessmentEngineServiceError values propagate
 * unchanged because no additional Action-specific failure model is required.
 */
export class GenerateAssessmentAction {
  /**
   * Composes the canonical use case without requiring transports to import the
   * lower-level service. Dependencies retain their Engine public-API type
   * through the AssessmentEngineService constructor.
   */
  public static create(
    dependencies: ConstructorParameters<typeof AssessmentEngineService>[0]
  ): GenerateAssessmentAction {
    return new GenerateAssessmentAction(
      new AssessmentEngineService(dependencies)
    )
  }

  public constructor(
    private readonly assessmentEngineService: AssessmentEngineService
  ) {}

  public execute(
    request: Parameters<AssessmentEngineService['execute']>[0]
  ): ReturnType<AssessmentEngineService['execute']> {
    return this.assessmentEngineService.execute(request)
  }
}
