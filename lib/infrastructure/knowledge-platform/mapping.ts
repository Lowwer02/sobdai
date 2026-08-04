import type {
  PackageSummary,
  PublicationSource,
  Summary,
  SummaryLibraryItem,
  SummaryLifecycleStatus,
  SummaryVersion,
  SummaryVersionStatus,
  SummaryVisibility,
  VersionSourceSnapshot,
} from '../../application/knowledge-platform/contracts'
import {
  assertRecord,
  optionalInteger,
  optionalString,
  optionalUuid,
  PersistenceAdapterError,
  relatedObject,
  requiredInteger,
  requiredString,
  requiredUuid,
} from './persistence'

export const SUMMARY_COLUMNS = [
  'id',
  'summary_code',
  'canonical_slug',
  'canonical_title',
  'subject',
  'topic',
  'law',
  'visibility',
  'lifecycle_status',
  'current_published_version_id',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

export const SUMMARY_VERSION_COLUMNS = [
  'id',
  'summary_id',
  'revision_number',
  'status',
  'content_md',
  'content_checksum',
  'title_snapshot',
  'subject_snapshot',
  'topic_snapshot',
  'law_snapshot',
  'seo_title',
  'seo_description',
  'social_image_bucket',
  'social_image_path',
  'read_time_minutes',
  'read_time_policy_version',
  'content_schema_version',
  'change_note',
  'authored_by',
  'created_at',
  'updated_at',
  'submitted_for_review_at',
  'reviewed_by',
  'reviewed_at',
  'published_by',
  'published_at',
  'retired_by',
  'retired_at',
  'retirement_reason',
].join(', ')

export const PACKAGE_SUMMARY_COLUMNS = [
  'package_id',
  'summary_id',
  'status',
  'version_policy',
  'pinned_summary_version_id',
  'sort_order',
  'display_order',
  'released_at',
  'navigation_label',
  'legacy_slug',
  'created_by',
  'created_at',
  'updated_at',
  'activated_by',
  'activated_at',
  'hidden_by',
  'hidden_at',
].join(', ')

/**
 * Explicit column allow-list for the deployed target Summary Library view.
 * Markdown and the view's compatibility-only legacy publication boolean are
 * deliberately excluded from this read contract.
 */
export const SUMMARY_LIBRARY_COLUMNS = [
  'summary_id',
  'summary_code',
  'canonical_slug',
  'canonical_title',
  'subject',
  'topic',
  'law',
  'visibility',
  'lifecycle_status',
  'current_published_version_id',
  'created_at',
  'updated_at',
  'current_revision_number',
  'current_revision_status',
  'current_revision_title',
  'current_revision_subject',
  'current_revision_topic',
  'current_revision_law',
  'current_revision_read_time_minutes',
  'current_revision_published_at',
  'current_revision_content_checksum',
  'package_placement_count',
  'source_document_count',
].join(', ')

function parseSummaryVisibility(value: string, entity: string): SummaryVisibility {
  if (!['public_indexable', 'authenticated', 'product_entitled'].includes(value)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map ${entity}: invalid visibility ${value}.`)
  }
  return value as SummaryVisibility
}

function parseSummaryLifecycleStatus(value: string, entity: string): SummaryLifecycleStatus {
  if (!['active', 'archived'].includes(value)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map ${entity}: invalid lifecycle status ${value}.`)
  }
  return value as SummaryLifecycleStatus
}

function parseSummaryVersionStatus(value: string, entity: string): SummaryVersionStatus {
  if (!['draft', 'in_review', 'published', 'retired'].includes(value)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map ${entity}: invalid status ${value}.`)
  }
  return value as SummaryVersionStatus
}

function requireNonNegativeInteger(
  row: Record<string, unknown>,
  column: string,
  entity: string
): number {
  const value = requiredInteger(row, column, entity)
  if (value < 0) {
    throw new PersistenceAdapterError(
      'MAPPING_ERROR',
      `Cannot map ${entity}: ${column} must be non-negative.`
    )
  }
  return value
}

export function mapSummaryRow(value: unknown): Summary {
  const row = assertRecord(value, 'Summary')
  const visibility = parseSummaryVisibility(
    requiredString(row, 'visibility', 'Summary'),
    'Summary'
  )
  const lifecycleStatus = parseSummaryLifecycleStatus(
    requiredString(row, 'lifecycle_status', 'Summary'),
    'Summary'
  )

  const currentPublishedVersionId = optionalUuid(row, 'current_published_version_id', 'Summary')
  const createdBy = requiredUuid(row, 'created_by', 'Summary')

  return {
    id: requiredUuid(row, 'id', 'Summary'),
    summaryCode: requiredString(row, 'summary_code', 'Summary'),
    canonicalSlug: requiredString(row, 'canonical_slug', 'Summary'),
    canonicalTitle: requiredString(row, 'canonical_title', 'Summary'),
    subject: optionalString(row, 'subject'),
    topic: optionalString(row, 'topic'),
    law: optionalString(row, 'law'),
    visibility,
    lifecycleStatus,
    currentPublishedVersionId,
    createdBy,
    createdAt: requiredString(row, 'created_at', 'Summary'),
    updatedAt: requiredString(row, 'updated_at', 'Summary'),
  }
}

export function mapSummaryLibraryRow(value: unknown): SummaryLibraryItem {
  const row = assertRecord(value, 'SummaryLibraryItem')
  const visibility = parseSummaryVisibility(
    requiredString(row, 'visibility', 'SummaryLibraryItem'),
    'SummaryLibraryItem'
  )
  const lifecycleStatus = parseSummaryLifecycleStatus(
    requiredString(row, 'lifecycle_status', 'SummaryLibraryItem'),
    'SummaryLibraryItem'
  )
  const currentRevisionStatusValue = optionalString(row, 'current_revision_status')
  const currentRevisionStatus = currentRevisionStatusValue === null
    ? null
    : parseSummaryVersionStatus(currentRevisionStatusValue, 'SummaryLibraryItem')
  const currentRevisionNumber = optionalInteger(row, 'current_revision_number')
  if (currentRevisionNumber !== null && currentRevisionNumber <= 0) {
    throw new PersistenceAdapterError(
      'MAPPING_ERROR',
      'Cannot map SummaryLibraryItem: current_revision_number must be positive.'
    )
  }
  const currentRevisionReadTimeMinutes = optionalInteger(
    row,
    'current_revision_read_time_minutes'
  )
  if (
    currentRevisionReadTimeMinutes !== null &&
    currentRevisionReadTimeMinutes <= 0
  ) {
    throw new PersistenceAdapterError(
      'MAPPING_ERROR',
      'Cannot map SummaryLibraryItem: current_revision_read_time_minutes must be positive.'
    )
  }

  return {
    summaryId: requiredUuid(row, 'summary_id', 'SummaryLibraryItem'),
    summaryCode: requiredString(row, 'summary_code', 'SummaryLibraryItem'),
    canonicalSlug: requiredString(row, 'canonical_slug', 'SummaryLibraryItem'),
    canonicalTitle: requiredString(row, 'canonical_title', 'SummaryLibraryItem'),
    subject: optionalString(row, 'subject'),
    topic: optionalString(row, 'topic'),
    law: optionalString(row, 'law'),
    visibility,
    lifecycleStatus,
    currentPublishedVersionId: optionalUuid(
      row,
      'current_published_version_id',
      'SummaryLibraryItem'
    ),
    createdAt: requiredString(row, 'created_at', 'SummaryLibraryItem'),
    updatedAt: requiredString(row, 'updated_at', 'SummaryLibraryItem'),
    currentRevisionNumber,
    currentRevisionStatus,
    currentRevisionTitle: optionalString(row, 'current_revision_title'),
    currentRevisionSubject: optionalString(row, 'current_revision_subject'),
    currentRevisionTopic: optionalString(row, 'current_revision_topic'),
    currentRevisionLaw: optionalString(row, 'current_revision_law'),
    currentRevisionReadTimeMinutes,
    currentRevisionPublishedAt: optionalString(row, 'current_revision_published_at'),
    currentRevisionContentChecksum: optionalString(
      row,
      'current_revision_content_checksum'
    ),
    packagePlacementCount: requireNonNegativeInteger(
      row,
      'package_placement_count',
      'SummaryLibraryItem'
    ),
    sourceDocumentCount: requireNonNegativeInteger(
      row,
      'source_document_count',
      'SummaryLibraryItem'
    ),
  }
}

export function toSummaryRow(summary: Summary): Record<string, unknown> {
  // Legacy package/content columns are deliberately not synthesized here.
  // They remain required by the pre-backfill schema; inserting a new reusable
  // Summary therefore fails at the database boundary until the approved
  // compatibility persistence API is deployed.
  return {
    id: summary.id,
    summary_code: summary.summaryCode,
    canonical_slug: summary.canonicalSlug,
    canonical_title: summary.canonicalTitle,
    subject: summary.subject,
    topic: summary.topic,
    law: summary.law,
    visibility: summary.visibility,
    lifecycle_status: summary.lifecycleStatus,
    current_published_version_id: summary.currentPublishedVersionId,
    created_by: summary.createdBy,
    created_at: summary.createdAt,
    updated_at: summary.updatedAt,
  }
}

export function mapSummaryVersionRow(value: unknown): SummaryVersion {
  const row = assertRecord(value, 'SummaryVersion')
  const status = parseSummaryVersionStatus(
    requiredString(row, 'status', 'SummaryVersion'),
    'SummaryVersion'
  )

  const contentMd = requiredString(row, 'content_md', 'SummaryVersion')
  const contentChecksum = requiredString(row, 'content_checksum', 'SummaryVersion')
  const readTimeMinutes = optionalInteger(row, 'read_time_minutes')
  if (readTimeMinutes === null || readTimeMinutes <= 0) {
    throw new PersistenceAdapterError('MAPPING_ERROR', 'Cannot map SummaryVersion: read_time_minutes must be positive.')
  }

  return {
    id: requiredUuid(row, 'id', 'SummaryVersion'),
    summaryId: requiredUuid(row, 'summary_id', 'SummaryVersion'),
    revisionNumber: requiredInteger(row, 'revision_number', 'SummaryVersion'),
    status,
    contentMd,
    contentChecksum,
    titleSnapshot: requiredString(row, 'title_snapshot', 'SummaryVersion'),
    subjectSnapshot: optionalString(row, 'subject_snapshot'),
    topicSnapshot: optionalString(row, 'topic_snapshot'),
    lawSnapshot: optionalString(row, 'law_snapshot'),
    seoTitle: optionalString(row, 'seo_title'),
    seoDescription: optionalString(row, 'seo_description'),
    socialImageBucket: optionalString(row, 'social_image_bucket'),
    socialImagePath: optionalString(row, 'social_image_path'),
    readTimeMinutes,
    readTimePolicyVersion: requiredString(row, 'read_time_policy_version', 'SummaryVersion'),
    contentSchemaVersion: requiredString(row, 'content_schema_version', 'SummaryVersion'),
    changeNote: requiredString(row, 'change_note', 'SummaryVersion'),
    authoredBy: requiredUuid(row, 'authored_by', 'SummaryVersion'),
    createdAt: requiredString(row, 'created_at', 'SummaryVersion'),
    updatedAt: requiredString(row, 'updated_at', 'SummaryVersion'),
    submittedForReviewAt: optionalString(row, 'submitted_for_review_at'),
    reviewedBy: optionalUuid(row, 'reviewed_by', 'SummaryVersion'),
    reviewedAt: optionalString(row, 'reviewed_at'),
    publishedBy: optionalUuid(row, 'published_by', 'SummaryVersion'),
    publishedAt: optionalString(row, 'published_at'),
    retiredBy: optionalUuid(row, 'retired_by', 'SummaryVersion'),
    retiredAt: optionalString(row, 'retired_at'),
    retirementReason: optionalString(row, 'retirement_reason'),
  }
}

export function toSummaryVersionRow(version: SummaryVersion): Record<string, unknown> {
  return {
    id: version.id,
    summary_id: version.summaryId,
    revision_number: version.revisionNumber,
    status: version.status,
    content_md: version.contentMd,
    content_checksum: version.contentChecksum,
    title_snapshot: version.titleSnapshot,
    subject_snapshot: version.subjectSnapshot,
    topic_snapshot: version.topicSnapshot,
    law_snapshot: version.lawSnapshot,
    seo_title: version.seoTitle,
    seo_description: version.seoDescription,
    social_image_bucket: version.socialImageBucket,
    social_image_path: version.socialImagePath,
    read_time_minutes: version.readTimeMinutes,
    read_time_policy_version: version.readTimePolicyVersion,
    content_schema_version: version.contentSchemaVersion,
    change_note: version.changeNote,
    authored_by: version.authoredBy,
    created_at: version.createdAt,
    updated_at: version.updatedAt,
    submitted_for_review_at: version.submittedForReviewAt,
    reviewed_by: version.reviewedBy,
    reviewed_at: version.reviewedAt,
    published_by: version.publishedBy,
    published_at: version.publishedAt,
    retired_by: version.retiredBy,
    retired_at: version.retiredAt,
    retirement_reason: version.retirementReason,
  }
}

export function mapPackageSummaryRow(value: unknown): PackageSummary {
  const row = assertRecord(value, 'PackageSummary')
  const status = requiredString(row, 'status', 'PackageSummary') as PackageSummary['status']
  const versionPolicy = requiredString(row, 'version_policy', 'PackageSummary') as PackageSummary['versionPolicy']
  if (!['draft', 'active', 'hidden'].includes(status)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map PackageSummary: invalid status ${status}.`)
  }
  if (!['latest_published', 'pinned'].includes(versionPolicy)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map PackageSummary: invalid version policy ${versionPolicy}.`)
  }

  return {
    packageId: requiredUuid(row, 'package_id', 'PackageSummary'),
    summaryId: requiredUuid(row, 'summary_id', 'PackageSummary'),
    status,
    versionPolicy,
    pinnedSummaryVersionId: optionalUuid(row, 'pinned_summary_version_id', 'PackageSummary'),
    sortOrder: requiredInteger(row, 'sort_order', 'PackageSummary'),
    displayOrder: requiredInteger(row, 'display_order', 'PackageSummary'),
    releasedAt: optionalString(row, 'released_at'),
    navigationLabel: optionalString(row, 'navigation_label'),
    legacySlug: optionalString(row, 'legacy_slug'),
    createdBy: requiredUuid(row, 'created_by', 'PackageSummary'),
    createdAt: requiredString(row, 'created_at', 'PackageSummary'),
    updatedAt: requiredString(row, 'updated_at', 'PackageSummary'),
    activatedBy: optionalUuid(row, 'activated_by', 'PackageSummary'),
    activatedAt: optionalString(row, 'activated_at'),
    hiddenBy: optionalUuid(row, 'hidden_by', 'PackageSummary'),
    hiddenAt: optionalString(row, 'hidden_at'),
  }
}

export function toPackageSummaryRow(placement: PackageSummary): Record<string, unknown> {
  return {
    package_id: placement.packageId,
    summary_id: placement.summaryId,
    status: placement.status,
    version_policy: placement.versionPolicy,
    pinned_summary_version_id: placement.pinnedSummaryVersionId,
    sort_order: placement.sortOrder,
    display_order: placement.displayOrder,
    released_at: placement.releasedAt,
    navigation_label: placement.navigationLabel,
    legacy_slug: placement.legacySlug,
    created_by: placement.createdBy,
    created_at: placement.createdAt,
    updated_at: placement.updatedAt,
    activated_by: placement.activatedBy,
    activated_at: placement.activatedAt,
    hidden_by: placement.hiddenBy,
    hidden_at: placement.hiddenAt,
  }
}

export function mapPublicationSourceRow(value: unknown): PublicationSource {
  const row = assertRecord(value, 'PublicationSource')
  const document = relatedObject(row.reference_documents)
  if (!document) {
    throw new PersistenceAdapterError('MAPPING_ERROR', 'Cannot map PublicationSource: ReferenceDocument relation is missing.')
  }
  const version = relatedObject(row.reference_document_versions)
  const role = requiredString(row, 'role', 'PublicationSource') as PublicationSource['role']
  if (!['primary', 'supporting'].includes(role)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map PublicationSource: invalid role ${role}.`)
  }

  const referenceDocumentVersionId = optionalString(row, 'reference_document_version_id')
  const referenceDocumentLifecycle = requiredString(
    document,
    'lifecycle_status',
    'ReferenceDocument'
  ) as PublicationSource['referenceDocumentLifecycle']
  const referenceDocumentVersionStatus = version
    ? (requiredString(version, 'status', 'ReferenceDocumentVersion') as PublicationSource['referenceDocumentVersionStatus'])
    : null
  if (!['active', 'superseded', 'repealed', 'archived'].includes(referenceDocumentLifecycle)) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map PublicationSource: invalid ReferenceDocument lifecycle ${referenceDocumentLifecycle}.`)
  }
  if (
    referenceDocumentVersionStatus !== null &&
    !['draft', 'verified', 'superseded', 'withdrawn'].includes(referenceDocumentVersionStatus)
  ) {
    throw new PersistenceAdapterError('MAPPING_ERROR', `Cannot map PublicationSource: invalid ReferenceDocumentVersion status ${referenceDocumentVersionStatus}.`)
  }
  return {
    id: requiredUuid(row, 'id', 'PublicationSource'),
    referenceDocumentId: requiredUuid(row, 'reference_document_id', 'PublicationSource'),
    referenceDocumentVersionId,
    referenceDocumentLifecycle,
    referenceDocumentVersionStatus,
    role,
    coverageNote: optionalString(row, 'coverage_note'),
    sortOrder: requiredInteger(row, 'sort_order', 'PublicationSource'),
  }
}

export function toVersionSourceSnapshotRow(snapshot: VersionSourceSnapshot): Record<string, unknown> {
  return {
    id: snapshot.id,
    summary_version_id: snapshot.summaryVersionId,
    reference_document_id: snapshot.referenceDocumentId,
    reference_document_version_id: snapshot.referenceDocumentVersionId,
    role: snapshot.role,
    coverage_note: snapshot.coverageNote,
    sort_order: snapshot.sortOrder,
    created_at: snapshot.createdAt,
  }
}
