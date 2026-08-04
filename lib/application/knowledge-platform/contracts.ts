export type UUID = string

export type SummaryVisibility =
  | 'public_indexable'
  | 'authenticated'
  | 'product_entitled'

export type SummaryLifecycleStatus = 'active' | 'archived'
export type SummaryVersionStatus =
  | 'draft'
  | 'in_review'
  | 'published'
  | 'retired'
export type PackageSummaryStatus = 'draft' | 'active' | 'hidden'
export type VersionPolicy = 'latest_published' | 'pinned'
export type SourceRole = 'primary' | 'supporting'

export interface Summary {
  readonly id: UUID
  readonly summaryCode: string
  readonly canonicalSlug: string
  readonly canonicalTitle: string
  readonly subject: string | null
  readonly topic: string | null
  readonly law: string | null
  readonly visibility: SummaryVisibility
  readonly lifecycleStatus: SummaryLifecycleStatus
  readonly currentPublishedVersionId: UUID | null
  readonly createdBy: UUID
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Markdown-free Summary Library read DTO.
 *
 * This shape follows the deployed `kp_read_admin_library` projection. It is
 * intentionally separate from the Summary aggregate so library consumers do
 * not infer lifecycle or revision state from legacy Summary columns.
 */
export interface SummaryLibraryItem {
  readonly summaryId: UUID
  readonly summaryCode: string
  readonly canonicalSlug: string
  readonly canonicalTitle: string
  readonly subject: string | null
  readonly topic: string | null
  readonly law: string | null
  readonly visibility: SummaryVisibility
  readonly lifecycleStatus: SummaryLifecycleStatus
  readonly currentPublishedVersionId: UUID | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly currentRevisionNumber: number | null
  readonly currentRevisionStatus: SummaryVersionStatus | null
  readonly currentRevisionTitle: string | null
  readonly currentRevisionSubject: string | null
  readonly currentRevisionTopic: string | null
  readonly currentRevisionLaw: string | null
  readonly currentRevisionReadTimeMinutes: number | null
  readonly currentRevisionPublishedAt: string | null
  readonly currentRevisionContentChecksum: string | null
  readonly packagePlacementCount: number
  readonly sourceDocumentCount: number
}

export type SummaryLibrarySortKey =
  | 'updatedAt'
  | 'canonicalTitle'
  | 'summaryCode'
  | 'lifecycleStatus'
  | 'currentRevisionNumber'

export type SummaryLibrarySortDirection = 'asc' | 'desc'

export interface SummaryLibrarySort {
  readonly key: SummaryLibrarySortKey
  readonly direction: SummaryLibrarySortDirection
}

/**
 * Transport-neutral request for the Summary Library read model.
 *
 * All fields are optional at the boundary so URL/query-string consumers can
 * omit empty filters. The Application query normalizes this shape before it
 * reaches a repository.
 */
export interface SummaryLibraryQueryRequest {
  readonly search?: string | null
  readonly subject?: string | null
  readonly topic?: string | null
  readonly law?: string | null
  readonly lifecycleStatus?: SummaryLifecycleStatus | null
  readonly visibility?: SummaryVisibility | null
  readonly hasPublishedRevision?: boolean | null
  readonly hasPackages?: boolean | null
  readonly hasSources?: boolean | null
  readonly sort?: SummaryLibrarySort | null
  readonly page?: number | null
  readonly pageSize?: number | null
}

export interface SummaryLibraryPage {
  readonly items: readonly SummaryLibraryItem[]
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
}

/**
 * Stable references carried by Summary Library selection state.
 *
 * The Summary identity remains stable across revisions. A nullable revision
 * reference keeps the hybrid legacy adapter honest until a migrated row has a
 * Knowledge Platform revision available.
 */
export interface SummaryLibrarySelectionReference {
  readonly summaryId: UUID
  readonly revisionId: UUID | null
}

export interface SummaryVersion {
  readonly id: UUID
  readonly summaryId: UUID
  readonly revisionNumber: number
  readonly status: SummaryVersionStatus
  readonly contentMd: string
  readonly contentChecksum: string
  readonly titleSnapshot: string
  readonly subjectSnapshot: string | null
  readonly topicSnapshot: string | null
  readonly lawSnapshot: string | null
  readonly seoTitle: string | null
  readonly seoDescription: string | null
  readonly socialImageBucket: string | null
  readonly socialImagePath: string | null
  readonly readTimeMinutes: number
  readonly readTimePolicyVersion: string
  readonly contentSchemaVersion: string
  readonly changeNote: string
  readonly authoredBy: UUID
  readonly createdAt: string
  readonly updatedAt: string
  readonly submittedForReviewAt: string | null
  readonly reviewedBy: UUID | null
  readonly reviewedAt: string | null
  readonly publishedBy: UUID | null
  readonly publishedAt: string | null
  readonly retiredBy: UUID | null
  readonly retiredAt: string | null
  readonly retirementReason: string | null
}

export interface PackageSummary {
  readonly packageId: UUID
  readonly summaryId: UUID
  readonly status: PackageSummaryStatus
  readonly versionPolicy: VersionPolicy
  readonly pinnedSummaryVersionId: UUID | null
  readonly sortOrder: number
  readonly displayOrder: number
  readonly releasedAt: string | null
  readonly navigationLabel: string | null
  readonly legacySlug: string | null
  readonly createdBy: UUID
  readonly createdAt: string
  readonly updatedAt: string
  readonly activatedBy: UUID | null
  readonly activatedAt: string | null
  readonly hiddenBy: UUID | null
  readonly hiddenAt: string | null
}

export interface PackageIdentity {
  readonly id: UUID
  readonly isPublished: boolean
}

export interface PublicationSource {
  readonly id: UUID
  readonly referenceDocumentId: UUID
  readonly referenceDocumentVersionId: UUID | null
  readonly referenceDocumentLifecycle:
    | 'active'
    | 'superseded'
    | 'repealed'
    | 'archived'
  readonly referenceDocumentVersionStatus:
    | 'draft'
    | 'verified'
    | 'superseded'
    | 'withdrawn'
    | null
  readonly role: SourceRole
  readonly coverageNote: string | null
  readonly sortOrder: number
}

export interface VersionSourceSnapshot {
  readonly id: UUID
  readonly summaryVersionId: UUID
  readonly referenceDocumentId: UUID
  readonly referenceDocumentVersionId: UUID | null
  readonly role: SourceRole
  readonly coverageNote: string | null
  readonly sortOrder: number
  readonly createdAt: string
}

export interface CreateSummaryCommand {
  readonly actorId: UUID
  readonly canonicalSlug: string
  readonly canonicalTitle: string
  readonly subject?: string | null
  readonly topic?: string | null
  readonly law?: string | null
  readonly visibility: SummaryVisibility
}

export interface CreateRevisionCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
  readonly markdown: string
  readonly contentSchemaVersion: string
  readonly changeNote: string
  readonly seoTitle?: string | null
  readonly seoDescription?: string | null
  readonly socialImageBucket?: string | null
  readonly socialImagePath?: string | null
}

export interface SubmitRevisionForReviewCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
  readonly versionId: UUID
}

export interface ApproveRevisionCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
  readonly versionId: UUID
}

export interface PublishRevisionCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
  readonly versionId: UUID
}

export interface RetireRevisionCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
  readonly versionId: UUID
  readonly reason: string
  readonly replacementVersionId?: UUID | null
}

export interface AttachSummaryToPackageCommand {
  readonly actorId: UUID
  readonly packageId: UUID
  readonly summaryId: UUID
  readonly status: PackageSummaryStatus
  readonly versionPolicy: VersionPolicy
  readonly pinnedSummaryVersionId?: UUID | null
  readonly sortOrder?: number
  readonly displayOrder?: number
  readonly releasedAt?: string | null
  readonly navigationLabel?: string | null
  readonly legacySlug?: string | null
}

export interface DetachSummaryFromPackageCommand {
  readonly actorId: UUID
  readonly packageId: UUID
  readonly summaryId: UUID
}

export interface SummaryRepository {
  findById(id: UUID): Promise<Summary | null>
  findByCode(code: string): Promise<Summary | null>
  findByCanonicalSlug(slug: string): Promise<Summary | null>
  allocateSummaryCode(): Promise<string>
  insert(summary: Summary): Promise<void>
  setCurrentPublishedVersion(
    summaryId: UUID,
    versionId: UUID | null,
    updatedAt: string
  ): Promise<void>
}

export interface SummaryVersionRepository {
  findById(id: UUID): Promise<SummaryVersion | null>
  findOpenBySummaryId(summaryId: UUID): Promise<SummaryVersion | null>
  listBySummaryId(summaryId: UUID): Promise<readonly SummaryVersion[]>
  nextRevisionNumber(summaryId: UUID): Promise<number>
  insert(version: SummaryVersion): Promise<void>
  update(version: SummaryVersion): Promise<void>
}

export interface PackageSummaryRepository {
  find(packageId: UUID, summaryId: UUID): Promise<PackageSummary | null>
  listByPackageId(packageId: UUID): Promise<readonly PackageSummary[]>
  listActiveSelectingVersion(
    summaryId: UUID,
    versionId: UUID
  ): Promise<readonly PackageSummary[]>
  insert(placement: PackageSummary): Promise<void>
  delete(packageId: UUID, summaryId: UUID): Promise<void>
}

export interface PackageRepository {
  findById(id: UUID): Promise<PackageIdentity | null>
}

export interface SummarySourceRepository {
  listPublicationSources(summaryId: UUID): Promise<readonly PublicationSource[]>
  replaceVersionSnapshots(
    versionId: UUID,
    snapshots: readonly VersionSourceSnapshot[]
  ): Promise<void>
}

export interface SummaryLibraryReadRepository {
  list(): Promise<readonly SummaryLibraryItem[]>
  /**
   * Optional during the hybrid transition so the F4.1 list contract remains
   * source-compatible. Target-backed repositories should implement this
   * method to translate the normalized request into indexed projection
   * predicates and server-side pagination.
   */
  search?(request: SummaryLibraryQueryRequest): Promise<SummaryLibraryPage>
}

export interface KnowledgePlatformRepositories {
  readonly summaries: SummaryRepository
  readonly versions: SummaryVersionRepository
  readonly packageSummaries: PackageSummaryRepository
  readonly packages: PackageRepository
  readonly sources: SummarySourceRepository
}

export interface KnowledgePlatformUnitOfWork {
  transaction<T>(
    operation: (repositories: KnowledgePlatformRepositories) => Promise<T>
  ): Promise<T>
  readonly queries: KnowledgePlatformRepositories
}

export type SummaryAction =
  | 'summary.create'
  | 'summary.revision.create'
  | 'summary.revision.review.submit'
  | 'summary.revision.review.approve'
  | 'summary.revision.publish'
  | 'summary.revision.retire'
  | 'package.summary.attach'
  | 'package.summary.detach'

export interface SummaryAuthorization {
  assertAllowed(actorId: UUID, action: SummaryAction): Promise<void>
}

export interface MarkdownProcessor {
  validate(markdown: string): readonly string[]
  checksum(markdown: string): Promise<string>
  readTime(markdown: string): {
    readonly minutes: number
    readonly policyVersion: string
  }
}

export interface SummaryApplicationDependencies {
  readonly unitOfWork: KnowledgePlatformUnitOfWork
  readonly authorization: SummaryAuthorization
  readonly markdown: MarkdownProcessor
  readonly createId: () => UUID
  readonly now: () => string
}

export interface SummaryQuery {
  getSummary(summaryId: UUID): Promise<Summary>
  getSummaryByCode(summaryCode: string): Promise<Summary>
  getSummaryByCanonicalSlug(canonicalSlug: string): Promise<Summary>
  getVersion(versionId: UUID): Promise<SummaryVersion>
  listVersions(summaryId: UUID): Promise<readonly SummaryVersion[]>
  listPackageAttachments(packageId: UUID): Promise<readonly PackageSummary[]>
}

export interface SummaryLibraryQuery {
  list(): Promise<readonly SummaryLibraryItem[]>
  search(request?: SummaryLibraryQueryRequest): Promise<SummaryLibraryPage>
}
