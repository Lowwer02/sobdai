import type {
  SummaryLibraryItem,
  SummaryLibraryQueryRequest,
  SummaryLibrarySortKey,
  SummaryLibrarySortDirection,
  SummaryVersionStatus,
  SummaryVisibility,
  SummaryLifecycleStatus,
  PackageSummaryStatus,
  VersionPolicy,
  SourceRole,
  UUID,
} from './contracts'
import {
  normalizeSummaryLibraryQuery,
  type NormalizedSummaryLibraryQuery,
} from './summary-library-query'

export const SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT = '__unassigned__'

export type SummaryLibraryCompatibilityPublicationStatus = 'published' | 'draft'

export interface SummaryLibraryCompatibilityQueryRequest
  extends SummaryLibraryQueryRequest {
  readonly packageId?: UUID | null
  readonly publicationStatus?: SummaryLibraryCompatibilityPublicationStatus | null
  readonly document?: string | null
}

export interface NormalizedSummaryLibraryCompatibilityQuery
  extends NormalizedSummaryLibraryQuery {
  readonly packageId: UUID | null
  readonly publicationStatus: SummaryLibraryCompatibilityPublicationStatus | null
  readonly document: string | null
}

export interface SummaryLibraryCompatibilityPlacement {
  readonly packageId: UUID
  readonly packageName: string
  readonly packageSlug: string | null
  readonly status: PackageSummaryStatus
  readonly versionPolicy: VersionPolicy
  readonly pinnedSummaryVersionId: UUID | null
  readonly sortOrder: number
  readonly displayOrder: number
  readonly releasedAt: string | null
  readonly navigationLabel: string | null
  readonly legacySlug: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SummaryLibraryCompatibilityPackage {
  readonly id: UUID
  readonly name: string
  readonly slug: string | null
}

export type ReferenceDocumentLifecycleStatus =
  | 'active'
  | 'superseded'
  | 'repealed'
  | 'archived'

export type ReferenceDocumentVersionStatus =
  | 'draft'
  | 'verified'
  | 'superseded'
  | 'withdrawn'

export interface SummaryLibraryCompatibilitySource {
  readonly relationshipId: UUID
  readonly referenceDocumentId: UUID
  readonly referenceDocumentCode: string
  readonly referenceDocumentTitle: string
  readonly referenceDocumentShortTitle: string | null
  readonly referenceDocumentType: string
  readonly referenceDocumentIssuer: string
  readonly referenceDocumentJurisdiction: string
  readonly referenceDocumentLifecycleStatus: ReferenceDocumentLifecycleStatus
  readonly referenceDocumentVersionId: UUID | null
  readonly referenceDocumentVersionLabel: string | null
  readonly referenceDocumentVersionStatus: ReferenceDocumentVersionStatus | null
  readonly referenceDocumentPublicationDate: string | null
  readonly referenceDocumentEffectiveFromDate: string | null
  readonly referenceDocumentEffectiveToDate: string | null
  readonly role: SourceRole
  readonly coverageNote: string | null
  readonly sortOrder: number
}

export interface SummaryLibraryCompatibilityItem extends SummaryLibraryItem {
  /** Current Summary Bank row aliases. */
  readonly id: UUID
  readonly title: string
  readonly slug: string | null
  readonly packageId: UUID | null
  readonly packageName: string | null
  readonly packageSlug: string | null
  /** Product-facing Package membership. This is never derived from the marker. */
  readonly packageIds: readonly UUID[]
  readonly packages: readonly SummaryLibraryCompatibilityPackage[]
  readonly summaryKind: 'legacy' | 'kp_native'
  readonly subject: string | null
  readonly document: string | null
  readonly topic: string | null
  readonly sortOrder: number | null
  readonly displayOrder: number | null
  readonly releasedAt: string | null
  readonly isPublished: boolean
  readonly placements: readonly SummaryLibraryCompatibilityPlacement[]
  readonly sources: readonly SummaryLibraryCompatibilitySource[]
  readonly selection: {
    readonly summaryId: UUID
    readonly revisionId: UUID | null
  }
  readonly compatibilityWarnings: readonly SummaryLibraryCompatibilityWarning[]
}

export type SummaryLibraryCompatibilityWarning =
  | 'no_package_placement'
  | 'no_primary_reference_document'

export interface SummaryLibraryCompatibilityFacetPackage {
  readonly id: UUID
  readonly name: string
}

export interface SummaryLibraryCompatibilityFacets {
  readonly packageOptions: readonly SummaryLibraryCompatibilityFacetPackage[]
  readonly documentOptions: readonly string[]
}

export interface SummaryLibraryCompatibilityPage {
  readonly items: readonly SummaryLibraryCompatibilityItem[]
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
  readonly facets: SummaryLibraryCompatibilityFacets
}

export interface SummaryLibraryCompatibilityReadRepository {
  search(
    request?: SummaryLibraryCompatibilityQueryRequest
  ): Promise<SummaryLibraryCompatibilityPage>
  listFacets(): Promise<SummaryLibraryCompatibilityFacets>
}

export interface SummaryLibraryProjectionRow {
  readonly summary_id: unknown
  readonly summary_code: unknown
  readonly canonical_slug: unknown
  readonly canonical_title: unknown
  readonly subject: unknown
  readonly topic: unknown
  readonly law: unknown
  readonly visibility: unknown
  readonly lifecycle_status: unknown
  readonly legacy_is_published: unknown
  readonly current_published_version_id: unknown
  readonly created_at: unknown
  readonly updated_at: unknown
  readonly current_revision_number: unknown
  readonly current_revision_status: unknown
  readonly current_revision_title: unknown
  readonly current_revision_subject: unknown
  readonly current_revision_topic: unknown
  readonly current_revision_law: unknown
  readonly current_revision_read_time_minutes: unknown
  readonly current_revision_published_at: unknown
  readonly current_revision_content_checksum: unknown
  readonly package_placement_count: unknown
  readonly source_document_count: unknown
}

/**
 * The grandfathered Summary Bank rows predate the KP root projection. They
 * remain readable through their legacy root columns and intentionally have no
 * PackageSummary placement.
 */
export interface SummaryLibraryLegacyProjectionRow {
  readonly id: unknown
  readonly summary_code: unknown
  readonly package_id: unknown
  readonly title: unknown
  readonly slug: unknown
  readonly subject: unknown
  readonly topic: unknown
  readonly law: unknown
  readonly document: unknown
  readonly sort_order: unknown
  readonly display_order: unknown
  readonly released_at: unknown
  readonly is_published: unknown
  readonly created_at: unknown
  readonly updated_at: unknown
}

export interface SummaryLibraryPlacementRecord {
  readonly packageId: unknown
  readonly summaryId: unknown
  readonly packageName: unknown
  readonly packageSlug: unknown
  readonly status: unknown
  readonly versionPolicy: unknown
  readonly pinnedSummaryVersionId: unknown
  readonly sortOrder: unknown
  readonly displayOrder: unknown
  readonly releasedAt: unknown
  readonly navigationLabel: unknown
  readonly legacySlug: unknown
  readonly createdAt: unknown
  readonly updatedAt: unknown
}

export interface SummaryLibraryLegacyOwnershipRecord {
  readonly packageId: unknown
  readonly packageName: unknown
  readonly packageSlug: unknown
  readonly legacySlug: unknown
  readonly sortOrder: unknown
  readonly displayOrder: unknown
  readonly releasedAt: unknown
}

export interface SummaryLibrarySourceRecord {
  readonly relationshipId: unknown
  readonly referenceDocumentId: unknown
  readonly referenceDocumentCode: unknown
  readonly referenceDocumentTitle: unknown
  readonly referenceDocumentShortTitle: unknown
  readonly referenceDocumentType: unknown
  readonly referenceDocumentIssuer: unknown
  readonly referenceDocumentJurisdiction: unknown
  readonly referenceDocumentLifecycleStatus: unknown
  readonly referenceDocumentVersionId: unknown
  readonly referenceDocumentVersionLabel: unknown
  readonly referenceDocumentVersionStatus: unknown
  readonly referenceDocumentPublicationDate: unknown
  readonly referenceDocumentEffectiveFromDate: unknown
  readonly referenceDocumentEffectiveToDate: unknown
  readonly role: unknown
  readonly coverageNote: unknown
  readonly sortOrder: unknown
}

export type SummaryLibraryCompatibilityMappingErrorCode =
  | 'invalid_root_projection'
  | 'invalid_placement'
  | 'invalid_source'
  | 'ambiguous_placement'

export class SummaryLibraryCompatibilityMappingError extends Error {
  public readonly code: SummaryLibraryCompatibilityMappingErrorCode
  public readonly summaryId: string | null
  public readonly field: string | null

  public constructor(
    code: SummaryLibraryCompatibilityMappingErrorCode,
    message: string,
    options?: { summaryId?: string | null; field?: string | null }
  ) {
    super(message)
    this.name = 'SummaryLibraryCompatibilityMappingError'
    this.code = code
    this.summaryId = options?.summaryId ?? null
    this.field = options?.field ?? null
  }
}

function invalid(
  code: SummaryLibraryCompatibilityMappingErrorCode,
  message: string,
  summaryId?: string | null,
  field?: string | null
): never {
  throw new SummaryLibraryCompatibilityMappingError(code, message, {
    summaryId,
    field,
  })
}

function requiredString(
  value: unknown,
  field: string,
  code: SummaryLibraryCompatibilityMappingErrorCode,
  summaryId?: string | null
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return invalid(code, `Knowledge Platform compatibility field ${field} is invalid.`, summaryId, field)
  }
  return value
}

function nullableString(value: unknown, field: string, code: SummaryLibraryCompatibilityMappingErrorCode, summaryId?: string | null): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') {
    return invalid(code, `Knowledge Platform compatibility field ${field} is invalid.`, summaryId, field)
  }
  return value
}

function requiredNumber(
  value: unknown,
  field: string,
  code: SummaryLibraryCompatibilityMappingErrorCode,
  summaryId?: string | null
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid(code, `Knowledge Platform compatibility field ${field} is invalid.`, summaryId, field)
  }
  return value
}

function nullableNumber(value: unknown, field: string, summaryId?: string | null): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid('invalid_root_projection', `Knowledge Platform compatibility field ${field} is invalid.`, summaryId, field)
  }
  return value
}

function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  code: SummaryLibraryCompatibilityMappingErrorCode,
  summaryId?: string | null
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return invalid(code, `Knowledge Platform compatibility field ${field} is invalid.`, summaryId, field)
  }
  return value as T
}

function nullableEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  summaryId?: string | null
): T | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return invalid('invalid_root_projection', `Knowledge Platform compatibility field ${field} is invalid.`, summaryId, field)
  }
  return value as T
}

function nullableDate(value: unknown, field: string, code: SummaryLibraryCompatibilityMappingErrorCode, summaryId?: string | null): string | null {
  return nullableString(value, field, code, summaryId)
}

const SUMMARY_VISIBILITIES = [
  'public_indexable',
  'authenticated',
  'product_entitled',
] as const satisfies readonly SummaryVisibility[]

const SUMMARY_LIFECYCLE_STATUSES = ['active', 'archived'] as const satisfies readonly SummaryLifecycleStatus[]
const SUMMARY_VERSION_STATUSES = ['draft', 'in_review', 'published', 'retired'] as const satisfies readonly SummaryVersionStatus[]
const PACKAGE_SUMMARY_STATUSES = ['draft', 'active', 'hidden'] as const satisfies readonly PackageSummaryStatus[]
const VERSION_POLICIES = ['latest_published', 'pinned'] as const satisfies readonly VersionPolicy[]
const SOURCE_ROLES = ['primary', 'supporting'] as const satisfies readonly SourceRole[]
const DOCUMENT_LIFECYCLE_STATUSES = ['active', 'superseded', 'repealed', 'archived'] as const
const DOCUMENT_VERSION_STATUSES = ['draft', 'verified', 'superseded', 'withdrawn'] as const

export function mapSummaryLibraryProjectionRow(
  row: SummaryLibraryProjectionRow
): SummaryLibraryItem {
  const summaryId = requiredString(row.summary_id, 'summary_id', 'invalid_root_projection')
  return {
    summaryId,
    summaryCode: requiredString(row.summary_code, 'summary_code', 'invalid_root_projection', summaryId),
    canonicalSlug: requiredString(row.canonical_slug, 'canonical_slug', 'invalid_root_projection', summaryId),
    canonicalTitle: requiredString(row.canonical_title, 'canonical_title', 'invalid_root_projection', summaryId),
    subject: nullableString(row.subject, 'subject', 'invalid_root_projection', summaryId),
    topic: nullableString(row.topic, 'topic', 'invalid_root_projection', summaryId),
    law: nullableString(row.law, 'law', 'invalid_root_projection', summaryId),
    visibility: requiredEnum(row.visibility, 'visibility', SUMMARY_VISIBILITIES, 'invalid_root_projection', summaryId),
    lifecycleStatus: requiredEnum(row.lifecycle_status, 'lifecycle_status', SUMMARY_LIFECYCLE_STATUSES, 'invalid_root_projection', summaryId),
    currentPublishedVersionId: nullableString(row.current_published_version_id, 'current_published_version_id', 'invalid_root_projection', summaryId),
    createdAt: requiredString(row.created_at, 'created_at', 'invalid_root_projection', summaryId),
    updatedAt: requiredString(row.updated_at, 'updated_at', 'invalid_root_projection', summaryId),
    currentRevisionNumber: nullableNumber(row.current_revision_number, 'current_revision_number', summaryId),
    currentRevisionStatus: nullableEnum(row.current_revision_status, 'current_revision_status', SUMMARY_VERSION_STATUSES, summaryId),
    currentRevisionTitle: nullableString(row.current_revision_title, 'current_revision_title', 'invalid_root_projection', summaryId),
    currentRevisionSubject: nullableString(row.current_revision_subject, 'current_revision_subject', 'invalid_root_projection', summaryId),
    currentRevisionTopic: nullableString(row.current_revision_topic, 'current_revision_topic', 'invalid_root_projection', summaryId),
    currentRevisionLaw: nullableString(row.current_revision_law, 'current_revision_law', 'invalid_root_projection', summaryId),
    currentRevisionReadTimeMinutes: nullableNumber(row.current_revision_read_time_minutes, 'current_revision_read_time_minutes', summaryId),
    currentRevisionPublishedAt: nullableDate(row.current_revision_published_at, 'current_revision_published_at', 'invalid_root_projection', summaryId),
    currentRevisionContentChecksum: nullableString(row.current_revision_content_checksum, 'current_revision_content_checksum', 'invalid_root_projection', summaryId),
    packagePlacementCount: requiredNumber(row.package_placement_count, 'package_placement_count', 'invalid_root_projection', summaryId),
    sourceDocumentCount: requiredNumber(row.source_document_count, 'source_document_count', 'invalid_root_projection', summaryId),
  }
}

export function mapSummaryLibraryLegacyProjectionRow(
  row: SummaryLibraryLegacyProjectionRow
): SummaryLibraryItem {
  const summaryId = requiredString(row.id, 'id', 'invalid_root_projection')
  return {
    summaryId,
    summaryCode: null,
    canonicalSlug: nullableString(row.slug, 'slug', 'invalid_root_projection', summaryId),
    canonicalTitle: requiredString(row.title, 'title', 'invalid_root_projection', summaryId),
    subject: nullableString(row.subject, 'subject', 'invalid_root_projection', summaryId),
    topic: nullableString(row.topic, 'topic', 'invalid_root_projection', summaryId),
    law: nullableString(row.law, 'law', 'invalid_root_projection', summaryId),
    visibility: null,
    lifecycleStatus: null,
    currentPublishedVersionId: null,
    createdAt: requiredString(row.created_at, 'created_at', 'invalid_root_projection', summaryId),
    updatedAt: requiredString(row.updated_at, 'updated_at', 'invalid_root_projection', summaryId),
    currentRevisionNumber: null,
    currentRevisionStatus: null,
    currentRevisionTitle: null,
    currentRevisionSubject: null,
    currentRevisionTopic: null,
    currentRevisionLaw: null,
    currentRevisionReadTimeMinutes: null,
    currentRevisionPublishedAt: null,
    currentRevisionContentChecksum: null,
    packagePlacementCount: 0,
    sourceDocumentCount: 0,
  }
}

export function mapSummaryLibraryPlacementRecord(
  record: SummaryLibraryPlacementRecord,
  summaryId: string | null = null
): SummaryLibraryCompatibilityPlacement {
  const resolvedSummaryId = nullableString(record.summaryId, 'summary_id', 'invalid_placement', summaryId)
  if (resolvedSummaryId === null) {
    return invalid('invalid_placement', 'Package placement has no Summary ID.', summaryId, 'summary_id')
  }
  const packageId = requiredString(record.packageId, 'package_id', 'invalid_placement', resolvedSummaryId)
  return {
    packageId,
    packageName: requiredString(record.packageName, 'package_name', 'invalid_placement', resolvedSummaryId),
    packageSlug: nullableString(record.packageSlug, 'package_slug', 'invalid_placement', resolvedSummaryId),
    status: requiredEnum(record.status, 'status', PACKAGE_SUMMARY_STATUSES, 'invalid_placement', resolvedSummaryId),
    versionPolicy: requiredEnum(record.versionPolicy, 'version_policy', VERSION_POLICIES, 'invalid_placement', resolvedSummaryId),
    pinnedSummaryVersionId: nullableString(record.pinnedSummaryVersionId, 'pinned_summary_version_id', 'invalid_placement', resolvedSummaryId),
    sortOrder: requiredNumber(record.sortOrder, 'sort_order', 'invalid_placement', resolvedSummaryId),
    displayOrder: requiredNumber(record.displayOrder, 'display_order', 'invalid_placement', resolvedSummaryId),
    releasedAt: nullableDate(record.releasedAt, 'released_at', 'invalid_placement', resolvedSummaryId),
    navigationLabel: nullableString(record.navigationLabel, 'navigation_label', 'invalid_placement', resolvedSummaryId),
    legacySlug: nullableString(record.legacySlug, 'legacy_slug', 'invalid_placement', resolvedSummaryId),
    createdAt: requiredString(record.createdAt, 'created_at', 'invalid_placement', resolvedSummaryId),
    updatedAt: requiredString(record.updatedAt, 'updated_at', 'invalid_placement', resolvedSummaryId),
  }
}

export function mapSummaryLibrarySourceRecord(
  record: SummaryLibrarySourceRecord,
  summaryId: string | null = null
): SummaryLibraryCompatibilitySource {
  const resolvedSummaryId = nullableString(record.referenceDocumentId, 'reference_document_id', 'invalid_source', summaryId)
  if (resolvedSummaryId === null) {
    return invalid('invalid_source', 'Summary source has no Reference Document ID.', summaryId, 'reference_document_id')
  }
  const relationshipId = requiredString(record.relationshipId, 'relationship_id', 'invalid_source', summaryId)
  return {
    relationshipId,
    referenceDocumentId: resolvedSummaryId,
    referenceDocumentCode: requiredString(record.referenceDocumentCode, 'document_code', 'invalid_source', summaryId),
    referenceDocumentTitle: requiredString(record.referenceDocumentTitle, 'canonical_title', 'invalid_source', summaryId),
    referenceDocumentShortTitle: nullableString(record.referenceDocumentShortTitle, 'short_title', 'invalid_source', summaryId),
    referenceDocumentType: requiredString(record.referenceDocumentType, 'document_type', 'invalid_source', summaryId),
    referenceDocumentIssuer: requiredString(record.referenceDocumentIssuer, 'issuer', 'invalid_source', summaryId),
    referenceDocumentJurisdiction: requiredString(record.referenceDocumentJurisdiction, 'jurisdiction', 'invalid_source', summaryId),
    referenceDocumentLifecycleStatus: requiredEnum(record.referenceDocumentLifecycleStatus, 'lifecycle_status', DOCUMENT_LIFECYCLE_STATUSES, 'invalid_source', summaryId),
    referenceDocumentVersionId: nullableString(record.referenceDocumentVersionId, 'reference_document_version_id', 'invalid_source', summaryId),
    referenceDocumentVersionLabel: nullableString(record.referenceDocumentVersionLabel, 'version_label', 'invalid_source', summaryId),
    referenceDocumentVersionStatus: nullableEnum(record.referenceDocumentVersionStatus, 'version_status', DOCUMENT_VERSION_STATUSES, summaryId),
    referenceDocumentPublicationDate: nullableDate(record.referenceDocumentPublicationDate, 'publication_date', 'invalid_source', summaryId),
    referenceDocumentEffectiveFromDate: nullableDate(record.referenceDocumentEffectiveFromDate, 'effective_from_date', 'invalid_source', summaryId),
    referenceDocumentEffectiveToDate: nullableDate(record.referenceDocumentEffectiveToDate, 'effective_to_date', 'invalid_source', summaryId),
    role: requiredEnum(record.role, 'role', SOURCE_ROLES, 'invalid_source', summaryId),
    coverageNote: nullableString(record.coverageNote, 'coverage_note', 'invalid_source', summaryId),
    sortOrder: requiredNumber(record.sortOrder, 'sort_order', 'invalid_source', summaryId),
  }
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left < right ? -1 : 1
}

function compareNumbers(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function comparePlacements(
  left: SummaryLibraryCompatibilityPlacement,
  right: SummaryLibraryCompatibilityPlacement
): number {
  return compareNumbers(left.packageId.localeCompare(right.packageId), 0)
}

function compareSources(
  left: SummaryLibraryCompatibilitySource,
  right: SummaryLibraryCompatibilitySource
): number {
  const order = compareNumbers(left.sortOrder, right.sortOrder)
  return order !== 0 ? order : left.relationshipId.localeCompare(right.relationshipId)
}

export function mapSummaryLibraryCompatibilityItem(
  root: SummaryLibraryItem,
  placementRecords: readonly SummaryLibraryPlacementRecord[] = [],
  sourceRecords: readonly SummaryLibrarySourceRecord[] = [],
  projectedPublicationState: boolean,
  legacyDocument: string | null = null,
  legacyOwnership: SummaryLibraryLegacyOwnershipRecord | null = null
): SummaryLibraryCompatibilityItem {
  const placements = placementRecords
    .map((record) => mapSummaryLibraryPlacementRecord(record, root.summaryId))
    .sort(comparePlacements)

  const sources = sourceRecords
    .map((record) => mapSummaryLibrarySourceRecord(record, root.summaryId))
    .sort(compareSources)
  const primarySource = sources.find((source) => source.role === 'primary') ?? null
  const placement = placements[0] ?? null
  const summaryKind = root.summaryCode === null ? 'legacy' : 'kp_native'
  const legacyPackageId = legacyOwnership
    ? requiredString(legacyOwnership.packageId, 'package_id', 'invalid_placement', root.summaryId)
    : null
  const legacyPackageName = legacyOwnership
    ? nullableString(legacyOwnership.packageName, 'package_name', 'invalid_placement', root.summaryId)
    : null
  const legacyPackageSlug = legacyOwnership
    ? nullableString(legacyOwnership.packageSlug, 'package_slug', 'invalid_placement', root.summaryId)
    : null
  const packages = new Map<string, SummaryLibraryCompatibilityPackage>()
  for (const currentPlacement of placements) {
    packages.set(currentPlacement.packageId, {
      id: currentPlacement.packageId,
      name: currentPlacement.packageName,
      slug: currentPlacement.packageSlug,
    })
  }
  if (legacyPackageId) {
    packages.set(legacyPackageId, {
      id: legacyPackageId,
      name: legacyPackageName ?? legacyPackageId,
      slug: legacyPackageSlug,
    })
  }
  const packageList = [...packages.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name)
    return byName !== 0 ? byName : left.id.localeCompare(right.id)
  })
  const packageIds = packageList.map((currentPackage) => currentPackage.id)
  const warnings: SummaryLibraryCompatibilityWarning[] = []

  if (!placement && !legacyPackageId) warnings.push('no_package_placement')
  if (!primarySource) warnings.push('no_primary_reference_document')

  const document = legacyDocument
  const title = root.canonicalTitle

  return {
    ...root,
    id: root.summaryId,
    title,
    slug: summaryKind === 'legacy'
      ? nullableString(legacyOwnership?.legacySlug, 'slug', 'invalid_placement', root.summaryId)
      : root.canonicalSlug ?? placement?.legacySlug ?? null,
    packageId: legacyPackageId ?? placement?.packageId ?? null,
    packageName: legacyPackageName ?? placement?.packageName ?? null,
    packageSlug: legacyPackageSlug ?? placement?.packageSlug ?? null,
    packageIds,
    packages: packageList,
    summaryKind,
    document,
    sortOrder: legacyOwnership
      ? nullableNumber(legacyOwnership.sortOrder, 'sort_order', root.summaryId)
      : placement?.sortOrder ?? null,
    displayOrder: legacyOwnership
      ? nullableNumber(legacyOwnership.displayOrder, 'display_order', root.summaryId)
      : placement?.displayOrder ?? null,
    releasedAt: legacyOwnership
      ? nullableDate(legacyOwnership.releasedAt, 'released_at', 'invalid_placement', root.summaryId)
      : placement?.releasedAt ?? null,
    isPublished: projectedPublicationState,
    placements,
    sources,
    selection: {
      summaryId: root.summaryId,
      revisionId: root.currentPublishedVersionId,
    },
    compatibilityWarnings: warnings,
  }
}

export function normalizeSummaryLibraryCompatibilityQuery(
  request: SummaryLibraryCompatibilityQueryRequest = {}
): NormalizedSummaryLibraryCompatibilityQuery {
  const normalized = normalizeSummaryLibraryQuery(request)
  const packageId = typeof request.packageId === 'string' && request.packageId.trim() !== ''
    ? request.packageId.trim()
    : null
  const document = typeof request.document === 'string'
    ? request.document.trim() || null
    : null
  const publicationStatus = request.publicationStatus === 'published' || request.publicationStatus === 'draft'
    ? request.publicationStatus
    : null

  return {
    ...normalized,
    packageId,
    document,
    publicationStatus,
  }
}

export function isUnassignedDocumentFilter(value: string | null): boolean {
  return value === SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT
}

export function buildSummaryLibraryDocumentOptions(
  sources: readonly SummaryLibraryCompatibilitySource[]
): readonly string[] {
  return [...new Set(
    sources
      .map((source) => source.referenceDocumentTitle.trim())
      .filter((value) => value.length > 0)
  )].sort((left, right) => left.localeCompare(right))
}

export function buildSummaryLibraryPackageOptions(
  placements: readonly SummaryLibraryCompatibilityPlacement[]
): readonly SummaryLibraryCompatibilityFacetPackage[] {
  const packages = new Map<string, SummaryLibraryCompatibilityFacetPackage>()
  for (const placement of placements) {
    packages.set(placement.packageId, {
      id: placement.packageId,
      name: placement.packageName,
    })
  }
  return [...packages.values()].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name)
    return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id)
  })
}

export function matchesSummaryLibraryCompatibilityDocument(
  item: SummaryLibraryCompatibilityItem,
  value: string | null
): boolean {
  if (!value) return true
  if (isUnassignedDocumentFilter(value)) {
    return item.document === null && item.sources.length === 0
  }
  return item.document === value || item.sources.some((source) => (
    source.referenceDocumentCode === value ||
    source.referenceDocumentTitle === value
  ))
}

export function compareSummaryLibraryCompatibilityItems(
  left: SummaryLibraryCompatibilityItem,
  right: SummaryLibraryCompatibilityItem,
  sortKey: SummaryLibrarySortKey,
  direction: SummaryLibrarySortDirection
): number {
  let result = 0
  switch (sortKey) {
    case 'canonicalTitle':
      result = left.canonicalTitle.localeCompare(right.canonicalTitle)
      break
    case 'summaryCode':
      result = compareNullableText(left.summaryCode, right.summaryCode)
      break
    case 'lifecycleStatus':
      result = compareNullableText(left.lifecycleStatus, right.lifecycleStatus)
      break
    case 'currentRevisionNumber':
      result = compareNullableNumber(left.currentRevisionNumber, right.currentRevisionNumber)
      break
    case 'updatedAt':
    default:
      result = left.updatedAt.localeCompare(right.updatedAt)
      break
  }

  if (result !== 0) return direction === 'asc' ? result : -result
  return left.summaryId.localeCompare(right.summaryId)
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left < right ? -1 : 1
}

export function compareSummaryLibraryCompatibilityLegacyOrder(
  left: SummaryLibraryCompatibilityItem,
  right: SummaryLibraryCompatibilityItem
): number {
  const displayOrder = compareNullableNumber(right.displayOrder, left.displayOrder)
  if (displayOrder !== 0) return displayOrder

  const leftReleased = left.releasedAt
  const rightReleased = right.releasedAt
  if (leftReleased !== rightReleased) {
    if (leftReleased === null) return 1
    if (rightReleased === null) return -1
    return rightReleased.localeCompare(leftReleased)
  }

  const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
  if (updatedOrder !== 0) return updatedOrder

  const createdOrder = right.createdAt.localeCompare(left.createdAt)
  if (createdOrder !== 0) return createdOrder

  return left.summaryId.localeCompare(right.summaryId)
}
