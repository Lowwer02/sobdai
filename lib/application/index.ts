/**
 * Canonical public surface for Application Layer assessment execution.
 *
 * Transports and application features consume the service from this barrel.
 * Engine contracts are not re-exported; their canonical owner remains
 * `lib/engine`.
 */

export {
  AssessmentEngineService,
  AssessmentEngineServiceError,
} from './assessment-engine-service'

export type {
  AssessmentEngineServiceErrorCode,
} from './assessment-engine-service'

export { GenerateAssessmentAction } from './generate-assessment-action'

export {
  SummaryLibraryQueryService,
} from './knowledge-platform'

export type {
  ApproveRevisionCommand,
  AttachSummaryToPackageCommand,
  CreateRevisionCommand,
  CreateSummaryCommand,
  DetachSummaryFromPackageCommand,
  KnowledgePlatformRepositories,
  KnowledgePlatformUnitOfWork,
  MarkdownProcessor,
  PackageSummary,
  PackageSummaryRepository,
  PublishRevisionCommand,
  RetireRevisionCommand,
  SubmitRevisionForReviewCommand,
  Summary,
  SummaryAction,
  SummaryApplicationDependencies,
  SummaryLibraryItem,
  SummaryLibraryQuery,
  SummaryLibraryReadRepository,
  SummaryAuthorization,
  SummaryQuery,
  SummaryRepository,
  SummarySourceRepository,
  SummaryVersion,
  SummaryVersionRepository,
} from './knowledge-platform'
