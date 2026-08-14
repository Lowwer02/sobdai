import type { createClient } from '../../supabase/server'
import type {
  NormalizedSummaryLibraryCompatibilityQuery,
  SummaryLibraryCompatibilityFacets,
  SummaryLibraryCompatibilityItem,
  SummaryLibraryCompatibilityPage,
  SummaryLibraryCompatibilityQueryRequest,
  SummaryLibraryCompatibilityReadRepository,
  SummaryLibraryLegacyOwnershipRecord,
  SummaryLibraryLegacyProjectionRow,
  SummaryLibraryPlacementRecord,
  SummaryLibraryProjectionRow,
  SummaryLibrarySourceRecord,
} from '../../application/knowledge-platform/summary-library-compatibility'
import {
  SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT,
  mapSummaryLibraryCompatibilityItem,
  mapSummaryLibraryLegacyProjectionRow,
  mapSummaryLibraryProjectionRow,
  normalizeSummaryLibraryCompatibilityQuery,
  SummaryLibraryCompatibilityMappingError,
} from '../../application/knowledge-platform/summary-library-compatibility'

const ADMIN_LIBRARY_ROOT = 'kp_read_admin_library'
const SUMMARIES = 'summaries'
const PACKAGE_PLACEMENTS = 'package_summaries'
const PACKAGES = 'packages'
const SOURCE_RELATIONSHIPS = 'summary_reference_documents'
const REFERENCE_DOCUMENTS = 'reference_documents'
const REFERENCE_DOCUMENT_VERSIONS = 'reference_document_versions'
const REFERENCE_DOCUMENT_ALIASES = 'reference_document_aliases'
const COMPATIBILITY_PAGE_SIZE = 15
const DOCUMENT_LOOKUP_LIMIT = 100
const DOCUMENT_FILTER_SUMMARY_LIMIT = 10_000
const FACET_OPTION_LIMIT = 1_000
const FACET_RELATIONSHIP_LIMIT = 10_000
const PAGE_ALIAS_LIMIT = 1_000
const PAGE_PLACEMENT_LIMIT = 1_000
const PAGE_RELATIONSHIP_LIMIT = 10_000

const ROOT_COLUMNS = [
  'summary_id',
  'summary_code',
  'canonical_slug',
  'canonical_title',
  'subject',
  'topic',
  'law',
  'visibility',
  'lifecycle_status',
  'legacy_is_published',
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


const LEGACY_ROOT_COLUMNS = [
  'id',
  'summary_code',
  'package_id',
  'title',
  'slug',
  'subject',
  'topic',
  'law',
  'document',
  'sort_order',
  'display_order',
  'released_at',
  'is_published',
  'created_at',
  'updated_at',
].join(', ')

const PLACEMENT_COLUMNS = [
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
  'created_at',
  'updated_at',
].join(', ')

const PACKAGE_COLUMNS = 'id, name, slug'
const SOURCE_RELATIONSHIP_COLUMNS = [
  'id',
  'summary_id',
  'reference_document_id',
  'reference_document_version_id',
  'role',
  'coverage_note',
  'sort_order',
].join(', ')
const REFERENCE_DOCUMENT_COLUMNS = [
  'id',
  'document_code',
  'canonical_title',
  'short_title',
  'document_type',
  'issuer',
  'jurisdiction',
  'lifecycle_status',
].join(', ')
const REFERENCE_DOCUMENT_VERSION_COLUMNS = [
  'id',
  'reference_document_id',
  'version_label',
  'status',
  'publication_date',
  'effective_from_date',
  'effective_to_date',
].join(', ')
const REFERENCE_DOCUMENT_ALIAS_COLUMNS = [
  'id',
  'reference_document_id',
  'alias_type',
  'alias_value',
  'status',
].join(', ')

type SupabaseResponse<T> = {
  readonly data: T[] | null
  readonly error: {
    readonly code?: string
    readonly message: string
    readonly details?: string | null
    readonly hint?: string | null
  } | null
  readonly count?: number | null
}

interface QueryBuilder {
  select(columns: string, options?: { count?: 'exact'; head?: boolean }): QueryBuilder
  eq(column: string, value: unknown): QueryBuilder
  gt(column: string, value: unknown): QueryBuilder
  is(column: string, value: null | boolean): QueryBuilder
  not(column: string, operator: string, value: unknown): QueryBuilder
  or(filters: string, options?: { referencedTable?: string }): QueryBuilder
  in(column: string, values: readonly unknown[]): QueryBuilder
  ilike(column: string, pattern: string): QueryBuilder
  order(
    column: string,
    options?: {
      ascending?: boolean
      nullsFirst?: boolean
      referencedTable?: string
    }
  ): QueryBuilder
  range(from: number, to: number): QueryBuilder
  then<TResult1 = SupabaseResponse<unknown>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResponse<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type SummaryLibraryCompatibilitySupabaseClient = Pick<SupabaseServerClient, 'from'>

export type SummaryLibraryCompatibilityRepositoryErrorCode =
  | 'query_failed'
  | 'invalid_response'

export class SummaryLibraryCompatibilityRepositoryError extends Error {
  public readonly code: SummaryLibraryCompatibilityRepositoryErrorCode
  public readonly source: string
  public readonly causeCode: string | null

  public constructor(
    code: SummaryLibraryCompatibilityRepositoryErrorCode,
    source: string,
    message: string,
    causeCode: string | null = null
  ) {
    super(message)
    this.name = 'SummaryLibraryCompatibilityRepositoryError'
    this.code = code
    this.source = source
    this.causeCode = causeCode
  }
}

interface QueryResult<T> {
  readonly rows: readonly T[]
  readonly count: number | null
}

interface PackageRow {
  readonly id: unknown
  readonly name: unknown
  readonly slug: unknown
}

interface PlacementRow {
  readonly package_id: unknown
  readonly summary_id: unknown
  readonly status: unknown
  readonly version_policy: unknown
  readonly pinned_summary_version_id: unknown
  readonly sort_order: unknown
  readonly display_order: unknown
  readonly released_at: unknown
  readonly navigation_label: unknown
  readonly legacy_slug: unknown
  readonly created_at: unknown
  readonly updated_at: unknown
}

interface SourceRelationshipRow {
  readonly id: unknown
  readonly summary_id: unknown
  readonly reference_document_id: unknown
  readonly reference_document_version_id: unknown
  readonly role: unknown
  readonly coverage_note: unknown
  readonly sort_order: unknown
}

interface ReferenceDocumentRow {
  readonly id: unknown
  readonly document_code: unknown
  readonly canonical_title: unknown
  readonly short_title: unknown
  readonly document_type: unknown
  readonly issuer: unknown
  readonly jurisdiction: unknown
  readonly lifecycle_status: unknown
}

interface ReferenceDocumentVersionRow {
  readonly id: unknown
  readonly reference_document_id: unknown
  readonly version_label: unknown
  readonly status: unknown
  readonly publication_date: unknown
  readonly effective_from_date: unknown
  readonly effective_to_date: unknown
}

interface LegacyDocumentRow {
  readonly id: unknown
  readonly reference_document_id: unknown
  readonly alias_type: unknown
  readonly alias_value: unknown
  readonly status: unknown
}

interface MappedSourceRecord {
  readonly summaryId: string
  readonly record: SummaryLibrarySourceRecord
}

interface RootPage {
  readonly rows: readonly RootRecord[]
  readonly totalItems: number
}

interface RootRecord {
  readonly kind: 'legacy' | 'kp_native'
  readonly row: SummaryLibraryProjectionRow | SummaryLibraryLegacyProjectionRow
}

interface LegacyPackageFacetRow {
  readonly package_id: unknown
  readonly summary_code: unknown
}

function queryBuilder(
  client: SummaryLibraryCompatibilitySupabaseClient,
  table: string
): QueryBuilder {
  return client.from(table) as unknown as QueryBuilder
}

function readErrorMessage(error: SupabaseResponse<unknown>['error']): string {
  if (!error) return 'Unknown Supabase read error.'
  const details = error.details ? ` Details: ${error.details}` : ''
  const hint = error.hint ? ` Hint: ${error.hint}` : ''
  return `${error.message}${details}${hint}`
}

async function executeQuery<T>(
  source: string,
  builder: QueryBuilder
): Promise<QueryResult<T>> {
  const response = await builder
  if (response.error) {
    throw new SummaryLibraryCompatibilityRepositoryError(
      'query_failed',
      source,
      readErrorMessage(response.error),
      response.error.code ?? null
    )
  }
  if (response.data !== null && !Array.isArray(response.data)) {
    throw new SummaryLibraryCompatibilityRepositoryError(
      'invalid_response',
      source,
      `Supabase returned a non-array response for ${source}.`
    )
  }
  return {
    rows: (response.data ?? []) as readonly T[],
    count: typeof response.count === 'number' ? response.count : null,
  }
}

function exactCount(result: QueryResult<unknown>, source: string): number {
  if (result.count === null) {
    throw new SummaryLibraryCompatibilityRepositoryError(
      'invalid_response',
      source,
      `Supabase did not return the requested exact count for ${source}.`
    )
  }
  return result.count
}

function stringId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function legacyDocumentValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function assertBoundedResult(
  result: QueryResult<unknown>,
  source: string,
  limit: number
): void {
  const count = exactCount(result, source)
  if (count > limit) {
    throw new SummaryLibraryCompatibilityRepositoryError(
      'invalid_response',
      source,
      `Supabase returned ${count} rows for ${source}; the compatibility repository refuses reads above its bounded limit of ${limit}.`
    )
  }
}

function uniqueIds(values: readonly unknown[]): readonly string[] {
  return [...new Set(values.map(stringId).filter((value): value is string => value !== null))]
}

function applyCandidateIds(
  builder: QueryBuilder,
  summaryIds: readonly string[] | null,
  column = 'summary_id'
): QueryBuilder {
  return summaryIds === null ? builder : builder.in(column, summaryIds)
}

function applyRootFilters(
  builder: QueryBuilder,
  request: NormalizedSummaryLibraryCompatibilityQuery,
  prefix = ''
): QueryBuilder {
  let query = builder
  const column = (name: string) => `${prefix}${name}`
  const referencedTable = prefix.endsWith('.') ? prefix.slice(0, -1) : undefined

  // The legacy Summary Bank searched only the displayed Summary title.
  if (request.search) query = query.ilike(column('canonical_title'), `%${request.search}%`)
  if (request.publicationStatus) {
    query = query.eq(column('legacy_is_published'), request.publicationStatus === 'published')
  }
  if (request.subject) {
    query = request.subject === SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT
      ? query.or('subject.is.null,subject.eq.', referencedTable ? { referencedTable } : undefined)
      : query.eq(column('subject'), request.subject)
  }
  if (request.topic) query = query.eq(column('topic'), request.topic)
  if (request.law) query = query.eq(column('law'), request.law)
  if (request.lifecycleStatus) query = query.eq(column('lifecycle_status'), request.lifecycleStatus)
  if (request.visibility) query = query.eq(column('visibility'), request.visibility)
  if (request.hasPublishedRevision !== null) {
    query = request.hasPublishedRevision
      ? query.not(column('current_published_version_id'), 'is', null)
      : query.is(column('current_published_version_id'), null)
  }
  if (request.hasPackages !== null) {
    query = request.hasPackages
      ? query.gt(column('package_placement_count'), 0)
      : query.eq(column('package_placement_count'), 0)
  }
  if (request.hasSources !== null) {
    query = request.hasSources
      ? query.gt(column('source_document_count'), 0)
      : query.eq(column('source_document_count'), 0)
  }
  if (request.document === SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT) {
    query = query.eq(column('source_document_count'), 0)
  }

  return query
}

function applyLegacyRootFilters(
  builder: QueryBuilder,
  request: NormalizedSummaryLibraryCompatibilityQuery
): QueryBuilder {
  let query = builder

  if (request.search) query = query.ilike('title', `%${request.search}%`)
  if (request.publicationStatus) {
    query = query.eq('is_published', request.publicationStatus === 'published')
  }
  if (request.subject) {
    query = request.subject === SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT
      ? query.is('subject', null)
      : query.eq('subject', request.subject)
  }
  if (request.topic) query = query.eq('topic', request.topic)
  if (request.law) query = query.eq('law', request.law)

  // Legacy rows have no target lifecycle, visibility, revision, PackageSummary,
  // or normalized source state. Keep those filters root-scoped and fail closed
  // for the legacy branch instead of inferring KP state from the marker.
  if (request.lifecycleStatus || request.visibility) {
    query = query.eq('summary_code', '__kp_native_only__')
  }
  if (request.hasPublishedRevision === true || request.hasPackages === false) {
    query = query.eq('summary_code', '__kp_native_only__')
  }
  if (request.hasSources === true) {
    query = query.eq('summary_code', '__kp_native_only__')
  }
  if (request.document === SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT) {
    query = query.is('document', null)
  }

  return query
}

function applyRootOrder(
  builder: QueryBuilder,
  request: NormalizedSummaryLibraryCompatibilityQuery,
  kind: RootRecord['kind']
): QueryBuilder {
  if (kind === 'legacy' && isLegacyDefaultSort(request)) {
    return applyLegacyDefaultOrder(builder)
  }

  const column = kind === 'legacy'
    ? request.sort.key === 'canonicalTitle' ? 'title' : request.sort.key === 'summaryCode' ? 'summary_code' : request.sort.key === 'lifecycleStatus' ? 'summary_code' : request.sort.key === 'currentRevisionNumber' ? 'summary_code' : 'updated_at'
    : request.sort.key === 'canonicalTitle' ? 'canonical_title' : request.sort.key === 'summaryCode' ? 'summary_code' : request.sort.key === 'lifecycleStatus' ? 'lifecycle_status' : request.sort.key === 'currentRevisionNumber' ? 'current_revision_number' : 'updated_at'

  return builder
    .order(column, { ascending: request.sort.direction === 'asc', nullsFirst: false })
    .order(kind === 'legacy' ? 'id' : 'summary_id', { ascending: true })
}

function isLegacyDefaultSort(
  request: NormalizedSummaryLibraryCompatibilityQuery
): boolean {
  return request.sort.key === 'updatedAt' && request.sort.direction === 'desc'
}

function applyLegacyDefaultOrder(builder: QueryBuilder): QueryBuilder {
  return builder
    .order('display_order', { ascending: false })
    .order('released_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
}

async function readBoundedRows<T>(
  source: string,
  builder: QueryBuilder,
  limit: number
): Promise<readonly T[]> {
  const result = await executeQuery<T>(source, builder.range(0, limit - 1))
  assertBoundedResult(result, source, limit)
  return result.rows
}

async function readReferenceDocumentIdsByValue(
  client: SummaryLibraryCompatibilitySupabaseClient,
  document: string
): Promise<readonly string[]> {
  const [titleRows, codeRows, aliasRows] = await Promise.all([
    readBoundedRows<ReferenceDocumentRow>(
      REFERENCE_DOCUMENTS,
      queryBuilder(client, REFERENCE_DOCUMENTS)
        .select('id', { count: 'exact' })
        .eq('canonical_title', document),
      DOCUMENT_LOOKUP_LIMIT
    ),
    readBoundedRows<ReferenceDocumentRow>(
      REFERENCE_DOCUMENTS,
      queryBuilder(client, REFERENCE_DOCUMENTS)
        .select('id', { count: 'exact' })
        .eq('document_code', document),
      DOCUMENT_LOOKUP_LIMIT
    ),
    readBoundedRows<LegacyDocumentRow>(
      REFERENCE_DOCUMENT_ALIASES,
      queryBuilder(client, REFERENCE_DOCUMENT_ALIASES)
        .select(REFERENCE_DOCUMENT_ALIAS_COLUMNS, { count: 'exact' })
        .eq('alias_value', document)
        .eq('status', 'active'),
      DOCUMENT_LOOKUP_LIMIT
    ),
  ])

  return uniqueIds([
    ...titleRows.map((row) => row.id),
    ...codeRows.map((row) => row.id),
    ...aliasRows.map((row) => row.reference_document_id),
  ])
}

async function readDocumentSummaryIds(
  client: SummaryLibraryCompatibilitySupabaseClient,
  document: string | null
): Promise<readonly string[] | null> {
  if (!document || document === SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT) return null
  const documentIds = await readReferenceDocumentIdsByValue(client, document)
  const sourceSummaryIds = documentIds.length === 0
    ? []
    : await (async () => {
      const query = queryBuilder(client, SOURCE_RELATIONSHIPS)
        .select('summary_id', { count: 'exact' })
        .eq('role', 'primary')
        .in('reference_document_id', documentIds)
        .order('summary_id', { ascending: true })
      const result = await executeQuery<SourceRelationshipRow>(
        SOURCE_RELATIONSHIPS,
        query.range(0, DOCUMENT_FILTER_SUMMARY_LIMIT - 1)
      )
      assertBoundedResult(result, SOURCE_RELATIONSHIPS, DOCUMENT_FILTER_SUMMARY_LIMIT)
      return uniqueIds(result.rows.map((row) => row.summary_id))
    })()

  const legacyQuery = queryBuilder(client, SUMMARIES)
    .select('id, summary_code, document', { count: 'exact' })
    .is('summary_code', null)
    .eq('document', document)
  const legacyResult = await executeQuery<{
    readonly id: unknown
    readonly summary_code: unknown
    readonly document: unknown
  }>(SUMMARIES, legacyQuery.range(0, DOCUMENT_FILTER_SUMMARY_LIMIT - 1))
  assertBoundedResult(legacyResult, SUMMARIES, DOCUMENT_FILTER_SUMMARY_LIMIT)

  return uniqueIds([
    ...sourceSummaryIds,
    ...legacyResult.rows.map((row) => row.id),
  ])
}

async function readPackageSummaryIds(
  client: SummaryLibraryCompatibilitySupabaseClient,
  packageId: string
): Promise<readonly string[]> {
  const query = queryBuilder(client, PACKAGE_PLACEMENTS)
    .select('summary_id, package_id', { count: 'exact' })
    .eq('package_id', packageId)
    .order('summary_id', { ascending: true })
  const result = await executeQuery<{ readonly summary_id: unknown }>(
    PACKAGE_PLACEMENTS,
    query.range(0, DOCUMENT_FILTER_SUMMARY_LIMIT - 1)
  )
  assertBoundedResult(result, PACKAGE_PLACEMENTS, DOCUMENT_FILTER_SUMMARY_LIMIT)
  return uniqueIds(result.rows.map((row) => row.summary_id))
}

async function readProjectionRootPage(
  client: SummaryLibraryCompatibilitySupabaseClient,
  request: NormalizedSummaryLibraryCompatibilityQuery,
  packageSummaryIds: readonly string[] | null,
  documentSummaryIds: readonly string[] | null,
  to: number
): Promise<RootPage> {
  if (
    (request.packageId !== null && packageSummaryIds !== null && packageSummaryIds.length === 0) ||
    (documentSummaryIds !== null && documentSummaryIds.length === 0)
  ) {
    return { rows: [], totalItems: 0 }
  }

  let query = queryBuilder(client, ADMIN_LIBRARY_ROOT)
    .select(ROOT_COLUMNS, { count: 'exact' })
    .not('summary_code', 'is', null)
  query = applyRootFilters(query, request)
  query = applyCandidateIds(query, documentSummaryIds)
  query = applyCandidateIds(query, packageSummaryIds)
  query = applyRootOrder(query, request, 'kp_native')
  const result = await executeQuery<SummaryLibraryProjectionRow>(
    ADMIN_LIBRARY_ROOT,
    query.range(0, to)
  )
  const rows = result.rows.filter((row) => row.summary_code !== null && row.summary_code !== undefined)
  return {
    rows: rows.map((row) => ({ kind: 'kp_native', row })),
    totalItems: exactCount(result, ADMIN_LIBRARY_ROOT),
  }
}

async function readLegacyRootPage(
  client: SummaryLibraryCompatibilitySupabaseClient,
  request: NormalizedSummaryLibraryCompatibilityQuery,
  documentSummaryIds: readonly string[] | null,
  to: number
): Promise<RootPage> {
  if (
    (documentSummaryIds !== null && documentSummaryIds.length === 0) ||
    request.hasPackages === false ||
    request.hasPublishedRevision === true ||
    request.hasSources === true
  ) {
    return { rows: [], totalItems: 0 }
  }

  let query = queryBuilder(client, SUMMARIES)
    .select(LEGACY_ROOT_COLUMNS, { count: 'exact' })
    .is('summary_code', null)
  query = applyLegacyRootFilters(query, request)
  query = applyCandidateIds(query, documentSummaryIds, 'id')
  if (request.packageId) query = query.eq('package_id', request.packageId)
  query = applyRootOrder(query, request, 'legacy')
  const result = await executeQuery<SummaryLibraryLegacyProjectionRow>(
    SUMMARIES,
    query.range(0, to)
  )
  const rows = result.rows.filter((row) => row.summary_code === null || row.summary_code === undefined)
  return {
    rows: rows.map((row) => ({ kind: 'legacy', row })),
    totalItems: exactCount(result, SUMMARIES),
  }
}

function rootRecordSummaryId(record: RootRecord): string {
  const value = stringId(record.kind === 'legacy'
    ? (record.row as SummaryLibraryLegacyProjectionRow).id
    : (record.row as SummaryLibraryProjectionRow).summary_id)
  if (!value) {
    throw new SummaryLibraryCompatibilityRepositoryError(
      'invalid_response',
      record.kind === 'legacy' ? SUMMARIES : ADMIN_LIBRARY_ROOT,
      'A Summary Library root row has no Summary ID.'
    )
  }
  return value
}

function rootRecordValue(record: RootRecord, field: string): unknown {
  if (record.kind === 'legacy') {
    const row = record.row as SummaryLibraryLegacyProjectionRow
    if (field === 'summary_id') return row.id
    if (field === 'canonical_title') return row.title
    if (field === 'canonical_slug') return row.slug
    if (field === 'summary_code') return null
    if (field === 'lifecycle_status' || field === 'current_revision_number') return null
    return row[field as keyof SummaryLibraryLegacyProjectionRow]
  }
  return (record.row as SummaryLibraryProjectionRow)[field as keyof SummaryLibraryProjectionRow]
}

function compareNullableRootValues(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left === null || left === undefined) return 1
  if (right === null || right === undefined) return -1
  if (typeof left === 'number' && typeof right === 'number') {
    return left < right ? -1 : 1
  }
  return String(left).localeCompare(String(right))
}

function compareDescendingRootValues(
  left: unknown,
  right: unknown,
  nullsFirst = false
): number {
  if (left === right) return 0
  if (left === null || left === undefined) return nullsFirst ? -1 : 1
  if (right === null || right === undefined) return nullsFirst ? 1 : -1
  return -compareNullableRootValues(left, right)
}

function compareLegacyDefaultRootRecords(
  left: RootRecord,
  right: RootRecord
): number {
  const leftRow = left.row as SummaryLibraryLegacyProjectionRow
  const rightRow = right.row as SummaryLibraryLegacyProjectionRow
  const fields = [
    ['display_order', false],
    ['released_at', false],
    ['updated_at', false],
    ['created_at', false],
  ] as const

  for (const [field, nullsFirst] of fields) {
    const result = compareDescendingRootValues(
      leftRow[field],
      rightRow[field],
      nullsFirst
    )
    if (result !== 0) return result
  }

  return rootRecordSummaryId(left).localeCompare(rootRecordSummaryId(right))
}

function compareRootRecords(
  left: RootRecord,
  right: RootRecord,
  request: NormalizedSummaryLibraryCompatibilityQuery
): number {
  if (
    isLegacyDefaultSort(request) &&
    left.kind === 'legacy' &&
    right.kind === 'legacy'
  ) {
    return compareLegacyDefaultRootRecords(left, right)
  }

  const field = request.sort.key === 'canonicalTitle'
    ? 'canonical_title'
    : request.sort.key === 'summaryCode'
      ? 'summary_code'
      : request.sort.key === 'lifecycleStatus'
        ? 'lifecycle_status'
        : request.sort.key === 'currentRevisionNumber'
          ? 'current_revision_number'
          : 'updated_at'
  const result = compareNullableRootValues(
    rootRecordValue(left, field),
    rootRecordValue(right, field)
  )
  if (result !== 0) return request.sort.direction === 'asc' ? result : -result
  return rootRecordSummaryId(left).localeCompare(rootRecordSummaryId(right))
}

function deduplicateRootRecords(records: readonly RootRecord[]): readonly RootRecord[] {
  const bySummaryId = new Map<string, RootRecord>()
  for (const record of records) {
    const summaryId = rootRecordSummaryId(record)
    if (!bySummaryId.has(summaryId)) bySummaryId.set(summaryId, record)
  }
  return [...bySummaryId.values()]
}

function mergeDefaultRootRecords(
  kpRows: readonly RootRecord[],
  legacyRows: readonly RootRecord[],
  request: NormalizedSummaryLibraryCompatibilityQuery
): readonly RootRecord[] {
  const merged: RootRecord[] = []
  let kpIndex = 0
  let legacyIndex = 0

  while (kpIndex < kpRows.length || legacyIndex < legacyRows.length) {
    if (kpIndex >= kpRows.length) {
      merged.push(legacyRows[legacyIndex++] as RootRecord)
      continue
    }
    if (legacyIndex >= legacyRows.length) {
      merged.push(kpRows[kpIndex++] as RootRecord)
      continue
    }

    const kpRow = kpRows[kpIndex] as RootRecord
    const legacyRow = legacyRows[legacyIndex] as RootRecord
    if (compareRootRecords(kpRow, legacyRow, request) <= 0) {
      merged.push(kpRow)
      kpIndex += 1
    } else {
      merged.push(legacyRow)
      legacyIndex += 1
    }
  }

  return merged
}

async function readRootPage(
  client: SummaryLibraryCompatibilitySupabaseClient,
  request: NormalizedSummaryLibraryCompatibilityQuery
): Promise<RootPage> {
  const [packageSummaryIds, documentSummaryIds] = await Promise.all([
    request.packageId ? readPackageSummaryIds(client, request.packageId) : Promise.resolve(null),
    readDocumentSummaryIds(client, request.document),
  ])
  const to = (request.page * request.pageSize) - 1
  const [kpPage, legacyPage] = await Promise.all([
    readProjectionRootPage(client, request, packageSummaryIds, documentSummaryIds, to),
    readLegacyRootPage(client, request, documentSummaryIds, to),
  ])
  const deduplicated = deduplicateRootRecords([...kpPage.rows, ...legacyPage.rows])
  const sorted = isLegacyDefaultSort(request)
    ? mergeDefaultRootRecords(
      deduplicated.filter((record) => record.kind === 'kp_native'),
      deduplicated.filter((record) => record.kind === 'legacy'),
      request
    )
    : [...deduplicated].sort((left, right) => compareRootRecords(left, right, request))
  const from = (request.page - 1) * request.pageSize
  return {
    rows: sorted.slice(from, from + request.pageSize),
    totalItems: kpPage.totalItems + legacyPage.totalItems,
  }
}

async function readRowsByIds<T>(
  client: SummaryLibraryCompatibilitySupabaseClient,
  source: string,
  columns: string,
  column: string,
  ids: readonly string[],
  limit: number
): Promise<readonly T[]> {
  if (ids.length === 0) return []
  if (ids.length > limit) {
    throw new SummaryLibraryCompatibilityRepositoryError(
      'invalid_response',
      source,
      `The compatibility repository received ${ids.length} IDs for ${source}; the bounded read limit is ${limit}.`
    )
  }
  const query = queryBuilder(client, source)
    .select(columns, { count: 'exact' })
    .in(column, ids)
    .range(0, limit - 1)
  const result = await executeQuery<T>(source, query)
  assertBoundedResult(result, source, limit)
  return result.rows
}

async function readCompatibilityPlacementsBySummaryIds(
  client: SummaryLibraryCompatibilitySupabaseClient,
  summaryIds: readonly string[]
): Promise<readonly PlacementRow[]> {
  if (summaryIds.length === 0) return []
  const query = queryBuilder(client, PACKAGE_PLACEMENTS)
    .select(PLACEMENT_COLUMNS, { count: 'exact' })
    .in('summary_id', summaryIds)
    .order('summary_id', { ascending: true })
    .order('package_id', { ascending: true })
    .range(0, PAGE_PLACEMENT_LIMIT - 1)
  const result = await executeQuery<PlacementRow>(PACKAGE_PLACEMENTS, query)
  assertBoundedResult(result, PACKAGE_PLACEMENTS, PAGE_PLACEMENT_LIMIT)
  for (const row of result.rows) {
    if (
      !stringId(row.summary_id) ||
      !stringId(row.package_id)
    ) {
      throw new SummaryLibraryCompatibilityRepositoryError(
        'invalid_response',
        PACKAGE_PLACEMENTS,
        'A Package membership read was incomplete.'
      )
    }
  }
  return result.rows
}

function mapPackageRows(
  rows: readonly PackageRow[]
): ReadonlyMap<string, { readonly name: string; readonly slug: string | null }> {
  const packages = new Map<string, { readonly name: string; readonly slug: string | null }>()
  for (const row of rows) {
    const id = stringId(row.id)
    if (!id || typeof row.name !== 'string' || row.name.trim() === '') continue
    packages.set(id, {
      name: row.name,
      slug: typeof row.slug === 'string' && row.slug.trim() !== '' ? row.slug : null,
    })
  }
  return packages
}

function mapPlacementRecords(
  rows: readonly PlacementRow[],
  packages: ReadonlyMap<string, { readonly name: string; readonly slug: string | null }>
): readonly SummaryLibraryPlacementRecord[] {
  return rows.map((row) => {
    const packageId = stringId(row.package_id)
    const packageDetails = packageId ? packages.get(packageId) : undefined
    return {
      packageId,
      summaryId: row.summary_id,
      packageName: packageDetails?.name,
      packageSlug: packageDetails?.slug ?? null,
      status: row.status,
      versionPolicy: row.version_policy,
      pinnedSummaryVersionId: row.pinned_summary_version_id,
      sortOrder: row.sort_order,
      displayOrder: row.display_order,
      releasedAt: row.released_at,
      navigationLabel: row.navigation_label,
      legacySlug: row.legacy_slug,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

function mapDocumentRows(
  rows: readonly ReferenceDocumentRow[]
): ReadonlyMap<string, ReferenceDocumentRow> {
  const documents = new Map<string, ReferenceDocumentRow>()
  for (const row of rows) {
    const id = stringId(row.id)
    if (id) documents.set(id, row)
  }
  return documents
}

function mapVersionRows(
  rows: readonly ReferenceDocumentVersionRow[]
): ReadonlyMap<string, ReferenceDocumentVersionRow> {
  const versions = new Map<string, ReferenceDocumentVersionRow>()
  for (const row of rows) {
    const id = stringId(row.id)
    if (id) versions.set(id, row)
  }
  return versions
}

function mapSourceRecords(
  rows: readonly SourceRelationshipRow[],
  documents: ReadonlyMap<string, ReferenceDocumentRow>,
  versions: ReadonlyMap<string, ReferenceDocumentVersionRow>
): readonly MappedSourceRecord[] {
  return rows.map((row) => {
    const summaryId = stringId(row.summary_id)
    if (!summaryId) {
      throw new SummaryLibraryCompatibilityMappingError(
        'invalid_source',
        'Summary source has no Summary ID.',
        { field: 'summary_id' }
      )
    }
    const documentId = stringId(row.reference_document_id)
    const document = documentId ? documents.get(documentId) : undefined
    const versionId = stringId(row.reference_document_version_id)
    const version = versionId ? versions.get(versionId) : undefined

    return {
      summaryId,
      record: {
        relationshipId: row.id,
        referenceDocumentId: documentId,
        referenceDocumentCode: document?.document_code,
        referenceDocumentTitle: document?.canonical_title,
        referenceDocumentShortTitle: document?.short_title ?? null,
        referenceDocumentType: document?.document_type,
        referenceDocumentIssuer: document?.issuer,
        referenceDocumentJurisdiction: document?.jurisdiction,
        referenceDocumentLifecycleStatus: document?.lifecycle_status,
        referenceDocumentVersionId: versionId,
        referenceDocumentVersionLabel: version?.version_label ?? null,
        referenceDocumentVersionStatus: version?.status ?? null,
        referenceDocumentPublicationDate: version?.publication_date ?? null,
        referenceDocumentEffectiveFromDate: version?.effective_from_date ?? null,
        referenceDocumentEffectiveToDate: version?.effective_to_date ?? null,
        role: row.role,
        coverageNote: row.coverage_note,
        sortOrder: row.sort_order,
      },
    }
  })
}

function groupBySummaryId<T>(
  rows: readonly T[],
  getSummaryId: (row: T) => unknown
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const summaryId = stringId(getSummaryId(row))
    if (!summaryId) continue
    const existing = grouped.get(summaryId)
    if (existing) existing.push(row)
    else grouped.set(summaryId, [row])
  }
  return grouped
}

function rootPublicationState(
  row: SummaryLibraryProjectionRow,
  summaryId: string
): boolean {
  if (typeof row.legacy_is_published !== 'boolean') {
    throw new SummaryLibraryCompatibilityMappingError(
      'invalid_root_projection',
      'Knowledge Platform compatibility projection legacy_is_published is invalid.',
      { summaryId, field: 'legacy_is_published' }
    )
  }
  return row.legacy_is_published
}

function legacyPublicationState(
  row: SummaryLibraryLegacyProjectionRow,
  summaryId: string
): boolean {
  if (typeof row.is_published !== 'boolean') {
    throw new SummaryLibraryCompatibilityMappingError(
      'invalid_root_projection',
      'Legacy Summary compatibility publication state is invalid.',
      { summaryId, field: 'is_published' }
    )
  }
  return row.is_published
}

async function composePageItems(
  client: SummaryLibraryCompatibilitySupabaseClient,
  rootRows: readonly RootRecord[]
): Promise<readonly SummaryLibraryCompatibilityItem[]> {
  const summaryIds = uniqueIds(rootRows.map((record) => rootRecordSummaryId(record)))
  if (summaryIds.length === 0) return []

  const [placementRows, relationshipRows] = await Promise.all([
    readCompatibilityPlacementsBySummaryIds(client, summaryIds),
    readRowsByIds<SourceRelationshipRow>(
      client,
      SOURCE_RELATIONSHIPS,
      SOURCE_RELATIONSHIP_COLUMNS,
      'summary_id',
      summaryIds,
      PAGE_RELATIONSHIP_LIMIT
    ),
  ])

  const legacyRows = rootRows
    .filter((record): record is RootRecord & { readonly kind: 'legacy'; readonly row: SummaryLibraryLegacyProjectionRow } => record.kind === 'legacy')
    .map((record) => record.row)
  const packageIds = uniqueIds([
    ...placementRows.map((row) => row.package_id),
    ...legacyRows.map((row) => row.package_id),
  ])
  const documentIds = uniqueIds(relationshipRows.map((row) => row.reference_document_id))
  const versionIds = uniqueIds(relationshipRows.map((row) => row.reference_document_version_id))
  const [packageRows, documentRows, versionRows, aliasRows] = await Promise.all([
    readRowsByIds<PackageRow>(
      client,
      PACKAGES,
      PACKAGE_COLUMNS,
      'id',
      packageIds,
      PAGE_PLACEMENT_LIMIT
    ),
    readRowsByIds<ReferenceDocumentRow>(
      client,
      REFERENCE_DOCUMENTS,
      REFERENCE_DOCUMENT_COLUMNS,
      'id',
      documentIds,
      PAGE_RELATIONSHIP_LIMIT
    ),
    readRowsByIds<ReferenceDocumentVersionRow>(
      client,
      REFERENCE_DOCUMENT_VERSIONS,
      REFERENCE_DOCUMENT_VERSION_COLUMNS,
      'id',
      versionIds,
      PAGE_RELATIONSHIP_LIMIT
    ),
    readCompatibilityAliasRows(client, documentIds, PAGE_ALIAS_LIMIT),
  ])

  const packages = mapPackageRows(packageRows)
  const placements = mapPlacementRecords(placementRows, packages)
  const documents = mapDocumentRows(documentRows)
  const versions = mapVersionRows(versionRows)
  const sources = mapSourceRecords(relationshipRows, documents, versions)
  const placementsBySummary = groupBySummaryId(placements, (record) => record.summaryId)
  const sourcesBySummary = groupBySummaryId(sources, (record) => record.summaryId)
  const compatibilityDocumentsByReferenceDocument = mapLegacyDocumentValues(aliasRows)

  for (const record of rootRows) {
    const summaryId = rootRecordSummaryId(record)
    const summaryPlacements = placementsBySummary.get(summaryId) ?? []
    if (record.kind === 'legacy' && summaryPlacements.length !== 0) {
      throw new SummaryLibraryCompatibilityRepositoryError(
        'invalid_response',
        PACKAGE_PLACEMENTS,
        `Legacy Summary ${summaryId} has ${summaryPlacements.length} Package memberships; Legacy roots must have zero placements.`
      )
    }
    if (record.kind === 'kp_native' && summaryPlacements.length === 0) {
      throw new SummaryLibraryCompatibilityRepositoryError(
        'invalid_response',
        PACKAGE_PLACEMENTS,
        `KP-native Summary ${summaryId} has no Package memberships.`
      )
    }
  }

  return rootRows.map((record) => {
    const summaryId = rootRecordSummaryId(record)
    const root = record.kind === 'legacy'
      ? mapSummaryLibraryLegacyProjectionRow(record.row as SummaryLibraryLegacyProjectionRow)
      : mapSummaryLibraryProjectionRow(record.row as SummaryLibraryProjectionRow)
    const sourceRecords = (sourcesBySummary.get(root.summaryId) ?? [])
      .map((entry) => entry.record)
    const primaryReferenceDocumentId = primaryDocumentId(sourceRecords)
    const legacyRow = record.kind === 'legacy'
      ? record.row as SummaryLibraryLegacyProjectionRow
      : null
    const legacyPackageDetails = legacyRow
      ? packages.get(stringId(legacyRow.package_id) ?? '')
      : undefined
    const legacyOwnership: SummaryLibraryLegacyOwnershipRecord | null = legacyRow
      ? {
          packageId: legacyRow.package_id,
          packageName: legacyPackageDetails?.name ?? null,
          packageSlug: legacyPackageDetails?.slug ?? null,
          legacySlug: legacyRow.slug,
          sortOrder: legacyRow.sort_order,
          displayOrder: legacyRow.display_order,
          releasedAt: legacyRow.released_at,
        }
      : null
    return mapSummaryLibraryCompatibilityItem(
      root,
      placementsBySummary.get(root.summaryId) ?? [],
      sourceRecords,
      record.kind === 'legacy'
        ? legacyPublicationState(legacyRow!, summaryId)
        : rootPublicationState(record.row as SummaryLibraryProjectionRow, root.summaryId),
      record.kind === 'legacy'
        ? typeof legacyRow!.document === 'string' && legacyRow!.document !== ''
          ? legacyRow!.document
          : null
        : primaryReferenceDocumentId
          ? compatibilityDocumentsByReferenceDocument.get(primaryReferenceDocumentId) ?? null
          : null,
      legacyOwnership
    )
  })
}

function primaryDocumentId(
  records: readonly SummaryLibrarySourceRecord[]
): string | null {
  const ordered = [...records].sort((left, right) => {
    const leftOrder = typeof left.sortOrder === 'number' ? left.sortOrder : 0
    const rightOrder = typeof right.sortOrder === 'number' ? right.sortOrder : 0
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    const leftId = stringId(left.relationshipId) ?? ''
    const rightId = stringId(right.relationshipId) ?? ''
    return leftId.localeCompare(rightId)
  })
  const primary = ordered.find((record) => record.role === 'primary') ?? null
  return primary ? stringId(primary.referenceDocumentId) : null
}

async function readCompatibilityAliasRows(
  client: SummaryLibraryCompatibilitySupabaseClient,
  documentIds: readonly string[],
  limit: number
): Promise<readonly LegacyDocumentRow[]> {
  if (documentIds.length === 0) return []
  const query = queryBuilder(client, REFERENCE_DOCUMENT_ALIASES)
    .select(REFERENCE_DOCUMENT_ALIAS_COLUMNS, { count: 'exact' })
    .in('reference_document_id', documentIds)
    .eq('alias_type', 'legacy_key')
    .eq('status', 'active')
    .order('alias_value', { ascending: true })
    .order('id', { ascending: true })
    .range(0, limit - 1)
  const result = await executeQuery<LegacyDocumentRow>(
    REFERENCE_DOCUMENT_ALIASES,
    query
  )
  assertBoundedResult(result, REFERENCE_DOCUMENT_ALIASES, limit)
  return result.rows
}

function mapLegacyDocumentValues(
  aliasRows: readonly LegacyDocumentRow[]
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>()
  for (const row of aliasRows) {
    const documentId = stringId(row.reference_document_id)
    const aliasValue = legacyDocumentValue(row.alias_value)
    if (documentId && aliasValue && !titles.has(documentId)) {
      titles.set(documentId, aliasValue)
    }
  }
  return titles
}

async function readPackageFacets(
  client: SummaryLibraryCompatibilitySupabaseClient
): Promise<SummaryLibraryCompatibilityFacets['packageOptions']> {
  const [membershipResult, legacyResult] = await Promise.all([
    executeQuery<{ readonly package_id: unknown }>(
      PACKAGE_PLACEMENTS,
      queryBuilder(client, PACKAGE_PLACEMENTS)
        .select('package_id', { count: 'exact' })
        .order('package_id', { ascending: true })
        .range(0, FACET_RELATIONSHIP_LIMIT - 1)
    ),
    executeQuery<LegacyPackageFacetRow>(
      SUMMARIES,
      queryBuilder(client, SUMMARIES)
        .select('package_id, summary_code', { count: 'exact' })
        .is('summary_code', null)
        .order('package_id', { ascending: true })
        .range(0, FACET_RELATIONSHIP_LIMIT - 1)
    ),
  ])
  assertBoundedResult(membershipResult, PACKAGE_PLACEMENTS, FACET_RELATIONSHIP_LIMIT)
  assertBoundedResult(legacyResult, SUMMARIES, FACET_RELATIONSHIP_LIMIT)
  const packageIds = uniqueIds([
    ...membershipResult.rows.map((row) => row.package_id),
    ...legacyResult.rows.map((row) => row.package_id),
  ])
  const packageRows = await readRowsByIds<PackageRow>(
    client,
    PACKAGES,
    PACKAGE_COLUMNS,
    'id',
    packageIds,
    FACET_OPTION_LIMIT
  )
  const packages = mapPackageRows(packageRows)
  return [...packages.entries()]
    .map(([id, packageDetails]) => ({ id, name: packageDetails.name }))
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name)
      return byName !== 0 ? byName : left.id.localeCompare(right.id)
    })
}

async function readDocumentFacets(
  client: SummaryLibraryCompatibilitySupabaseClient
): Promise<readonly string[]> {
  const relationshipQuery = queryBuilder(client, SOURCE_RELATIONSHIPS)
    .select('reference_document_id', { count: 'exact' })
    .eq('role', 'primary')
    .order('reference_document_id', { ascending: true })
    .range(0, FACET_RELATIONSHIP_LIMIT - 1)
  const relationshipResult = await executeQuery<SourceRelationshipRow>(
    SOURCE_RELATIONSHIPS,
    relationshipQuery
  )
  assertBoundedResult(relationshipResult, SOURCE_RELATIONSHIPS, FACET_RELATIONSHIP_LIMIT)

  const documentIds = uniqueIds(
    relationshipResult.rows.map((row) => row.reference_document_id)
  )
  const [aliasRows, legacyRows] = await Promise.all([
    readCompatibilityAliasRows(client, documentIds, FACET_OPTION_LIMIT),
    executeQuery<{ readonly document: unknown }>(
      SUMMARIES,
      queryBuilder(client, SUMMARIES)
        .select('document', { count: 'exact' })
        .is('summary_code', null)
        .range(0, FACET_RELATIONSHIP_LIMIT - 1)
    ),
  ])
  assertBoundedResult(legacyRows, SUMMARIES, FACET_RELATIONSHIP_LIMIT)
  const compatibilityTitles = mapLegacyDocumentValues(aliasRows)
  const legacyDocuments = legacyRows.rows
    .map((row) => legacyDocumentValue(row.document))
    .filter((value): value is string => value !== null)
  return [...new Set([
    documentIds.flatMap((id) => {
      const value = compatibilityTitles.get(id)
      return value ? [value] : []
    }),
    ...legacyDocuments,
  ].flat())].sort((left, right) => left.localeCompare(right))
}

export class SupabaseSummaryLibraryCompatibilityRepository
  implements SummaryLibraryCompatibilityReadRepository {
  public constructor(
    private readonly supabase: SummaryLibraryCompatibilitySupabaseClient
  ) {}

  public async listFacets(): Promise<SummaryLibraryCompatibilityFacets> {
    const [packageOptions, documentOptions] = await Promise.all([
      readPackageFacets(this.supabase),
      readDocumentFacets(this.supabase),
    ])
    return { packageOptions, documentOptions }
  }

  public async search(
    request: SummaryLibraryCompatibilityQueryRequest = {}
  ): Promise<SummaryLibraryCompatibilityPage> {
    const normalized = normalizeSummaryLibraryCompatibilityQuery({
      ...request,
      pageSize: request.pageSize ?? COMPATIBILITY_PAGE_SIZE,
    })
    const rootPage = await readRootPage(this.supabase, normalized)
    const [items, facets] = await Promise.all([
      composePageItems(this.supabase, rootPage.rows),
      this.listFacets(),
    ])
    const totalPages = rootPage.totalItems === 0
      ? 0
      : Math.ceil(rootPage.totalItems / normalized.pageSize)

    return {
      items,
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalItems: rootPage.totalItems,
      totalPages,
      facets,
    }
  }
}

export function createSummaryLibraryCompatibilityRepository(
  supabase: SummaryLibraryCompatibilitySupabaseClient
): SummaryLibraryCompatibilityReadRepository {
  return new SupabaseSummaryLibraryCompatibilityRepository(supabase)
}
