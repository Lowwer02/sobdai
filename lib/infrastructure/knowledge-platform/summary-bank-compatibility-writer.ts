import { createAdminClient } from '@/lib/supabase/admin'
import {
  SummaryBankCompatibilityWriterError,
  SummaryBankCompatibilityWriterService,
  type SummaryBankCompatibilityCreatePersistenceCommand,
  type SummaryBankCompatibilityCreatePersistenceResult,
  type SummaryBankCompatibilityDeletePersistenceCommand,
  type SummaryBankCompatibilityDeletePersistenceResult,
  type SummaryBankCompatibilityEditPersistenceCommand,
  type SummaryBankCompatibilityEditPersistenceResult,
  type SummaryBankCompatibilityImportPlacementLookupResult,
  type SummaryBankCompatibilityImportReplacementTarget,
  type SummaryBankCompatibilityImportSlugLookupInput,
  type SummaryBankCompatibilityPackageLookupInput,
  type SummaryBankCompatibilityPackageLookupResult,
  type SummaryBankCompatibilityPublishPersistenceCommand,
  type SummaryBankCompatibilityPublishPersistenceResult,
  type SummaryBankCompatibilityPersistence,
  type SummaryBankCompatibilityReplacePersistenceCommand,
  type SummaryBankCompatibilityReplacePersistenceResult,
  type SummaryBankCompatibilityUnpublishPersistenceCommand,
  type SummaryBankCompatibilityUnpublishPersistenceResult,
  type SummaryBankCompatibilityWriter,
} from '@/lib/application/knowledge-platform/summary-bank-compatibility-writer'

interface SupabaseErrorLike {
  readonly code?: string
  readonly message?: string
  readonly details?: string
  readonly hint?: string
}

interface QueryResponse {
  readonly data: unknown
  readonly error: SupabaseErrorLike | null
  readonly count?: number | null
}

interface NamespaceQuery {
  select(columns: string, options?: { count?: 'exact'; head?: boolean }): NamespaceQuery
  eq(column: string, value: unknown): NamespaceQuery
  in(column: string, values: readonly unknown[]): NamespaceQuery
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): NamespaceQuery
  range(from: number, to: number): NamespaceQuery
  maybeSingle(): PromiseLike<QueryResponse>
  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

export interface SummaryBankCompatibilitySupabaseClient {
  from(table: string): NamespaceQuery
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<QueryResponse>
}

const CREATE_RPC = 'kp_persist_create_compatibility_summary'
const EDIT_RPC = 'kp_persist_update_compatibility_summary'
const REPLACE_RPC = 'kp_persist_replace_compatibility_summary'
const PUBLISH_RPC = 'kp_persist_publish_compatibility_revision'
const UNPUBLISH_RPC = 'kp_persist_unpublish_compatibility_summary'
const DELETE_RPC = 'kp_persist_delete_compatibility_summary'
const SUMMARY_CODE_ALLOCATOR_RPC = 'allocate_summary_codes'
const SOURCE_SNAPSHOT_LOOKUP_LIMIT = 1_000
const OPEN_REVISION_LOOKUP_LIMIT = 2
const IMPORT_MARKER_LOOKUP_LIMIT = 2

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function errorText(error: SupabaseErrorLike): string {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ')
}

function isLegacySlugConflict(error: SupabaseErrorLike): boolean {
  const text = errorText(error).toLowerCase()
  return error.code === '23505' && (
    text.includes('legacy_slug') ||
    text.includes('legacy slug') ||
    text.includes('package_summaries_package_legacy_slug') ||
    text.includes('package and slug') ||
    (text.includes('package_id') && text.includes('slug'))
  )
}

function mapSupabaseError(
  operation: string,
  error: SupabaseErrorLike,
): SummaryBankCompatibilityWriterError {
  if (isLegacySlugConflict(error)) {
    return new SummaryBankCompatibilityWriterError(
      'duplicate_legacy_slug',
      'Slug already exists in this package.',
    )
  }

  const text = errorText(error)
  return new SummaryBankCompatibilityWriterError(
    'rpc_failed',
    text || `${operation} failed.`,
  )
}

function record(data: unknown, operation: string): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an invalid response.`,
    )
  }
  return data as Record<string, unknown>
}

function requiredString(
  value: unknown,
  field: string,
  operation: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an invalid ${field}.`,
    )
  }
  return value
}

function requiredBoolean(
  value: unknown,
  field: string,
  operation: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an invalid ${field}.`,
    )
  }
  return value
}

function requiredUuid(
  value: unknown,
  field: string,
  operation: string,
): string {
  const uuid = requiredString(value, field, operation)
  if (!UUID_PATTERN.test(uuid)) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an invalid ${field}.`,
    )
  }
  return uuid
}

function expectedString(
  value: unknown,
  field: string,
  expected: string,
  operation: string,
): string {
  const actual = requiredString(value, field, operation)
  if (actual !== expected) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an unexpected ${field}.`,
    )
  }
  return actual
}

function requiredInteger(
  value: unknown,
  field: string,
  operation: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an invalid ${field}.`,
    )
  }
  return value
}

function optionalUuid(
  value: unknown,
  field: string,
  operation: string,
): string | null {
  if (value === null) return null
  return requiredUuid(value, field, operation)
}

interface SummaryPublicationStateRow {
  readonly id: unknown
  readonly current_published_version_id: unknown
  readonly is_published: unknown
}

interface MarkedPlacementStateRow {
  readonly package_id: unknown
  readonly is_summary_bank_compatibility: unknown
  readonly legacy_slug: unknown
  readonly status: unknown
}

interface OpenRevisionStateRow {
  readonly id: unknown
  readonly summary_id: unknown
  readonly status: unknown
}

interface SourceSnapshotStateRow {
  readonly reference_document_id: unknown
  readonly reference_document_version_id: unknown
  readonly role: unknown
  readonly coverage_note: unknown
  readonly sort_order: unknown
}

interface PackageLookupRow {
  readonly id: unknown
  readonly name: unknown
}

interface ImportPlacementStateRow {
  readonly summary_id: unknown
  readonly package_id: unknown
  readonly legacy_slug: unknown
  readonly is_summary_bank_compatibility: unknown
}

interface SummaryIdentityStateRow {
  readonly id: unknown
  readonly package_id: unknown
  readonly slug: unknown
  readonly lifecycle_status: unknown
}

interface PublicationTarget {
  readonly versionId: string
  readonly packageId: string
  readonly sourceSnapshots: readonly Record<string, unknown>[]
}

function queryLookupError(
  source: string,
  error: SupabaseErrorLike,
): SummaryBankCompatibilityWriterError {
  const text = errorText(error)
  return new SummaryBankCompatibilityWriterError(
    'lookup_failed',
    text || `${source} lookup failed.`,
  )
}

function queryBuilder(
  client: SummaryBankCompatibilitySupabaseClient,
  table: string,
): NamespaceQuery {
  return client.from(table)
}

async function readRows<T>(
  source: string,
  builder: NamespaceQuery,
  limit: number,
): Promise<{ readonly rows: readonly T[]; readonly count: number }> {
  const response = await builder.range(0, limit - 1)
  if (response.error) throw queryLookupError(source, response.error)
  if (!Array.isArray(response.data)) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${source} lookup returned a non-array response.`,
    )
  }
  if (typeof response.count !== 'number') {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${source} lookup did not return an exact count.`,
    )
  }
  if (response.count > limit) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${source} lookup exceeded its bounded limit of ${limit} rows.`,
    )
  }
  return { rows: response.data as readonly T[], count: response.count }
}

async function readSingle(
  source: string,
  builder: NamespaceQuery,
): Promise<Record<string, unknown> | null> {
  const response = await builder.maybeSingle()
  if (response.error) throw queryLookupError(source, response.error)
  if (response.data === null) return null
  return record(response.data, source)
}

function invalidState(message: string): never {
  throw new SummaryBankCompatibilityWriterError('invalid_response', message)
}

async function resolvePublicationTarget(
  client: SummaryBankCompatibilitySupabaseClient,
  summaryId: string,
): Promise<PublicationTarget> {
  const summaryRecord = await readSingle(
    'summaries',
    queryBuilder(client, 'summaries')
      .select('id, current_published_version_id, is_published')
      .eq('id', summaryId),
  )
  if (!summaryRecord) return invalidState('Summary publication target does not exist.')

  const summary = summaryRecord as unknown as SummaryPublicationStateRow
  const resolvedSummaryId = requiredUuid(summary.id, 'summary_id', PUBLISH_RPC)
  matchingIdentity(resolvedSummaryId, 'summary_id', summaryId, PUBLISH_RPC)
  const currentPublishedVersionId = optionalUuid(
    summary.current_published_version_id,
    'current_published_version_id',
    PUBLISH_RPC,
  )
  const isPublished = requiredBoolean(summary.is_published, 'is_published', PUBLISH_RPC)

  const placementResult = await readRows<MarkedPlacementStateRow>(
    'package_summaries',
    queryBuilder(client, 'package_summaries')
      .select(
        'package_id, is_summary_bank_compatibility, legacy_slug, status',
        { count: 'exact' },
      )
      .eq('summary_id', summaryId)
      .eq('is_summary_bank_compatibility', true),
    OPEN_REVISION_LOOKUP_LIMIT,
  )
  if (placementResult.count !== 1) {
    return invalidState(
      'Summary publication requires exactly one marked compatibility placement.',
    )
  }
  const placement = placementResult.rows[0] as MarkedPlacementStateRow
  if (placement.is_summary_bank_compatibility !== true) {
    return invalidState('Summary publication found a malformed compatibility marker.')
  }
  const packageId = requiredUuid(placement.package_id, 'package_id', PUBLISH_RPC)

  let currentVersion: OpenRevisionStateRow | null = null
  if (currentPublishedVersionId !== null) {
    const currentRecord = await readSingle(
      'summary_versions',
      queryBuilder(client, 'summary_versions')
        .select('id, summary_id, status')
        .eq('id', currentPublishedVersionId)
        .eq('summary_id', summaryId),
    )
    if (!currentRecord) {
      return invalidState('Summary publication found a missing current published revision.')
    }
    currentVersion = currentRecord as unknown as OpenRevisionStateRow
    const currentId = requiredUuid(currentVersion.id, 'summary_version_id', PUBLISH_RPC)
    matchingIdentity(currentId, 'summary_version_id', currentPublishedVersionId, PUBLISH_RPC)
    matchingIdentity(
      requiredUuid(currentVersion.summary_id, 'summary_id', PUBLISH_RPC),
      'summary_id',
      summaryId,
      PUBLISH_RPC,
    )
    expectedString(currentVersion.status, 'status', 'published', PUBLISH_RPC)
  } else if (isPublished) {
    return invalidState('Published Summary has no current published revision.')
  }

  const openResult = await readRows<OpenRevisionStateRow>(
    'summary_versions',
    queryBuilder(client, 'summary_versions')
      .select('id, summary_id, status', { count: 'exact' })
      .eq('summary_id', summaryId)
      .in('status', ['draft', 'in_review'])
      .order('revision_number', { ascending: false }),
    OPEN_REVISION_LOOKUP_LIMIT,
  )
  if (openResult.count > 1) {
    return invalidState('Summary publication found multiple open revision candidates.')
  }

  const openVersion = openResult.rows[0] as OpenRevisionStateRow | undefined
  const targetVersion = openVersion ?? currentVersion
  if (!targetVersion) {
    return invalidState('Summary publication found no valid revision target.')
  }

  const versionId = requiredUuid(targetVersion.id, 'summary_version_id', PUBLISH_RPC)
  matchingIdentity(
    requiredUuid(targetVersion.summary_id, 'summary_id', PUBLISH_RPC),
    'summary_id',
    summaryId,
    PUBLISH_RPC,
  )
  if (openVersion) {
    const status = requiredString(openVersion.status, 'status', PUBLISH_RPC)
    if (status !== 'draft' && status !== 'in_review') {
      return invalidState('Summary publication found an invalid open revision state.')
    }
  }

  const snapshotResult = await readRows<SourceSnapshotStateRow>(
    'summary_version_reference_documents',
    queryBuilder(client, 'summary_version_reference_documents')
      .select(
        'reference_document_id, reference_document_version_id, role, coverage_note, sort_order',
        { count: 'exact' },
      )
      .eq('summary_version_id', versionId)
      .order('sort_order', { ascending: true })
      .order('reference_document_id', { ascending: true }),
    SOURCE_SNAPSHOT_LOOKUP_LIMIT,
  )

  const sourceSnapshots = snapshotResult.rows.map((row, index) => {
    const snapshot = row as SourceSnapshotStateRow
    const role = requiredString(snapshot.role, `source_snapshots[${index}].role`, PUBLISH_RPC)
    if (role !== 'primary' && role !== 'supporting') {
      return invalidState(`Summary publication found an invalid source role at index ${index}.`)
    }
    const coverageNote = snapshot.coverage_note === null
      ? null
      : requiredString(
          snapshot.coverage_note,
          `source_snapshots[${index}].coverage_note`,
          PUBLISH_RPC,
        )
    return {
      reference_document_id: requiredUuid(
        snapshot.reference_document_id,
        `source_snapshots[${index}].reference_document_id`,
        PUBLISH_RPC,
      ),
      reference_document_version_id: optionalUuid(
        snapshot.reference_document_version_id,
        `source_snapshots[${index}].reference_document_version_id`,
        PUBLISH_RPC,
      ),
      role,
      coverage_note: coverageNote,
      sort_order: requiredInteger(
        snapshot.sort_order,
        `source_snapshots[${index}].sort_order`,
        PUBLISH_RPC,
      ),
    }
  })

  return { versionId, packageId, sourceSnapshots }
}

function expectedBoolean(
  value: unknown,
  field: string,
  expected: boolean,
  operation: string,
): boolean {
  const actual = requiredBoolean(value, field, operation)
  if (actual !== expected) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned an unexpected ${field}.`,
    )
  }
  return actual
}

function matchingIdentity(
  value: unknown,
  field: string,
  expected: string,
  operation: string,
): string {
  const actual = requiredString(value, field, operation)
  if (actual !== expected) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_response',
      `${operation} returned a mismatched ${field}.`,
    )
  }
  return actual
}

async function readImportPlacement(
  client: SummaryBankCompatibilitySupabaseClient,
  input: SummaryBankCompatibilityImportSlugLookupInput,
): Promise<SummaryBankCompatibilityImportPlacementLookupResult | null> {
  const operation = 'compatibility import slug lookup'
  const placementResult = await readRows<ImportPlacementStateRow>(
    'package_summaries',
    queryBuilder(client, 'package_summaries')
      .select(
        'summary_id, package_id, legacy_slug, is_summary_bank_compatibility',
        { count: 'exact' },
      )
      .eq('package_id', input.packageId)
      .eq('legacy_slug', input.legacySlug)
      .eq('is_summary_bank_compatibility', true),
    IMPORT_MARKER_LOOKUP_LIMIT,
  )

  if (placementResult.count === 0) return null
  if (placementResult.count !== 1) {
    return invalidState(
      'Compatibility import lookup found multiple marked placements for the requested Package and slug.',
    )
  }

  const placement = placementResult.rows[0] as ImportPlacementStateRow
  expectedBoolean(
    placement.is_summary_bank_compatibility,
    'is_summary_bank_compatibility',
    true,
    operation,
  )
  const summaryId = requiredUuid(placement.summary_id, 'summary_id', operation)
  matchingIdentity(
    requiredUuid(placement.package_id, 'package_id', operation),
    'package_id',
    input.packageId,
    operation,
  )
  matchingIdentity(
    requiredString(placement.legacy_slug, 'legacy_slug', operation),
    'legacy_slug',
    input.legacySlug,
    operation,
  )

  const summaryRecord = await readSingle(
    'summaries',
    queryBuilder(client, 'summaries')
      .select('id, package_id, slug, lifecycle_status')
      .eq('id', summaryId),
  )
  if (!summaryRecord) {
    return invalidState(
      'Compatibility import lookup found a marked placement without its Summary root.',
    )
  }

  const summary = summaryRecord as unknown as SummaryIdentityStateRow
  matchingIdentity(
    requiredUuid(summary.id, 'summary_id', operation),
    'summary_id',
    summaryId,
    operation,
  )
  matchingIdentity(
    requiredUuid(summary.package_id, 'package_id', operation),
    'package_id',
    input.packageId,
    operation,
  )
  matchingIdentity(
    requiredString(summary.slug, 'slug', operation),
    'slug',
    input.legacySlug,
    operation,
  )
  expectedString(summary.lifecycle_status, 'lifecycle_status', 'active', operation)

  return { summaryId }
}

async function readImportReplacementTarget(
  client: SummaryBankCompatibilitySupabaseClient,
  input: SummaryBankCompatibilityImportSlugLookupInput,
): Promise<SummaryBankCompatibilityImportReplacementTarget | null> {
  const placement = await readImportPlacement(client, input)
  if (!placement) return null

  const operation = 'compatibility import replacement target lookup'
  const draftResult = await readRows<OpenRevisionStateRow>(
    'summary_versions',
    queryBuilder(client, 'summary_versions')
      .select('id, summary_id, status', { count: 'exact' })
      .eq('summary_id', placement.summaryId)
      .eq('status', 'draft')
      .order('revision_number', { ascending: false }),
    OPEN_REVISION_LOOKUP_LIMIT,
  )
  if (draftResult.count > 1) {
    return invalidState(
      'Compatibility import replacement found multiple editable draft revisions.',
    )
  }
  if (draftResult.count === 0) {
    return { summaryId: placement.summaryId, replacementVersionId: null }
  }

  const draft = draftResult.rows[0] as OpenRevisionStateRow
  const replacementVersionId = requiredUuid(
    draft.id,
    'summary_version_id',
    operation,
  )
  matchingIdentity(
    requiredUuid(draft.summary_id, 'summary_id', operation),
    'summary_id',
    placement.summaryId,
    operation,
  )
  expectedString(draft.status, 'status', 'draft', operation)

  return { summaryId: placement.summaryId, replacementVersionId }
}

class SupabaseSummaryBankCompatibilityPersistence
  implements SummaryBankCompatibilityPersistence {
  public constructor(
    private readonly client: SummaryBankCompatibilitySupabaseClient,
  ) {}

  public async resolvePackage(
    input: SummaryBankCompatibilityPackageLookupInput,
  ): Promise<SummaryBankCompatibilityPackageLookupResult | null> {
    const referenceType = input.referenceType
    if (referenceType !== 'slug' && referenceType !== 'code' && referenceType !== 'ambiguous') {
      return null
    }

    const resolveBy = async (
      column: 'slug' | 'package_code',
      resolvedBy: 'slug' | 'code',
    ): Promise<SummaryBankCompatibilityPackageLookupResult | null> => {
      const packageRecord = await readSingle(
        'packages',
        queryBuilder(this.client, 'packages')
          .select('id, name')
          .eq(column, input.reference),
      )
      if (!packageRecord) return null

      const row = packageRecord as unknown as PackageLookupRow
      return {
        packageId: requiredUuid(row.id, 'package_id', 'packages lookup'),
        packageName: requiredString(row.name, 'package_name', 'packages lookup'),
        resolvedBy,
      }
    }

    if (referenceType === 'slug' || referenceType === 'ambiguous') {
      const bySlug = await resolveBy('slug', 'slug')
      if (bySlug) return bySlug
    }
    if (referenceType === 'code' || referenceType === 'ambiguous') {
      return resolveBy('package_code', 'code')
    }
    return null
  }

  public async findCompatibilityByLegacySlug(
    input: SummaryBankCompatibilityImportSlugLookupInput,
  ): Promise<SummaryBankCompatibilityImportPlacementLookupResult | null> {
    return readImportPlacement(this.client, input)
  }

  public async resolveImportReplacementTarget(
    input: SummaryBankCompatibilityImportSlugLookupInput,
  ): Promise<SummaryBankCompatibilityImportReplacementTarget | null> {
    return readImportReplacementTarget(this.client, input)
  }

  public async allocateSummaryCode(): Promise<string> {
    const { data, error } = await this.client.rpc(
      SUMMARY_CODE_ALLOCATOR_RPC,
      { n: 1 },
    )
    if (error) throw mapSupabaseError(SUMMARY_CODE_ALLOCATOR_RPC, error)

    if (!Array.isArray(data) || data.length !== 1) {
      throw new SummaryBankCompatibilityWriterError(
        'invalid_allocator_result',
        'The Summary-code allocator must return exactly one code.',
      )
    }

    const code = data[0]
    if (typeof code !== 'string' || !/^SUM-[0-9]{6,}$/.test(code)) {
      throw new SummaryBankCompatibilityWriterError(
        'invalid_allocator_result',
        'The Summary-code allocator returned an invalid code.',
      )
    }

    return code
  }

  public async canonicalSlugExists(candidate: string): Promise<boolean> {
    const [canonical, alias] = await Promise.all([
      this.client
        .from('summaries')
        .select('id')
        .eq('canonical_slug', candidate)
        .maybeSingle(),
      this.client
        .from('summary_aliases')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle(),
    ])

    if (canonical.error) {
      throw new SummaryBankCompatibilityWriterError(
        'namespace_lookup_failed',
        errorText(canonical.error) || 'Canonical Summary slug lookup failed.',
      )
    }
    if (alias.error) {
      throw new SummaryBankCompatibilityWriterError(
        'namespace_lookup_failed',
        errorText(alias.error) || 'Summary alias slug lookup failed.',
      )
    }
    return canonical.data !== null || alias.data !== null
  }

  public async create(
    command: SummaryBankCompatibilityCreatePersistenceCommand,
  ): Promise<SummaryBankCompatibilityCreatePersistenceResult> {
    const { data, error } = await this.client.rpc(CREATE_RPC, {
      p_summary_id: command.summaryId,
      p_summary_code: command.summaryCode,
      p_canonical_slug: command.canonicalSlug,
      p_canonical_title: command.title,
      p_subject: command.subject,
      p_topic: command.topic,
      p_law: command.law,
      p_visibility: 'product_entitled',
      p_package_id: command.packageId,
      p_legacy_slug: command.legacySlug,
      p_content_md: command.contentMd,
      p_content_checksum: command.contentChecksum,
      p_read_time_minutes: command.readTimeMinutes,
      p_read_time_policy_version: command.readTimePolicyVersion,
      p_content_schema_version: command.contentSchemaVersion,
      p_change_note: command.changeNote,
      p_actor_id: command.actorId,
      p_version_id: command.versionId,
      p_sort_order: command.sortOrder,
      p_display_order: command.displayOrder,
      p_navigation_label: command.navigationLabel,
      p_document: command.document,
      p_is_published: command.isPublished,
    })
    if (error) throw mapSupabaseError(CREATE_RPC, error)

    const response = record(data, CREATE_RPC)
    expectedString(response.outcome, 'outcome', 'created', CREATE_RPC)

    const summaryId = requiredUuid(response.summary_id, 'summary_id', CREATE_RPC)
    const summaryVersionId = requiredUuid(
      response.summary_version_id,
      'summary_version_id',
      CREATE_RPC,
    )
    const packageId = requiredUuid(response.package_id, 'package_id', CREATE_RPC)
    const legacySlug = requiredString(response.legacy_slug, 'legacy_slug', CREATE_RPC)
    const isPublished = requiredBoolean(response.is_published, 'is_published', CREATE_RPC)
    const idempotentRetry = requiredBoolean(
      response.idempotent_retry,
      'idempotent_retry',
      CREATE_RPC,
    )

    matchingIdentity(summaryId, 'summary_id', command.summaryId, CREATE_RPC)
    matchingIdentity(summaryVersionId, 'summary_version_id', command.versionId, CREATE_RPC)
    matchingIdentity(packageId, 'package_id', command.packageId, CREATE_RPC)
    matchingIdentity(legacySlug, 'legacy_slug', command.legacySlug, CREATE_RPC)
    expectedBoolean(isPublished, 'is_published', command.isPublished, CREATE_RPC)

    return {
      summaryId,
      summaryVersionId,
      packageId,
      legacySlug,
      isPublished,
      idempotentRetry,
    }
  }

  public async update(
    command: SummaryBankCompatibilityEditPersistenceCommand,
  ): Promise<SummaryBankCompatibilityEditPersistenceResult> {
    const { data, error } = await this.client.rpc(EDIT_RPC, {
      p_summary_id: command.summaryId,
      p_package_id: command.packageId,
      p_legacy_slug: command.legacySlug,
      p_title: command.title,
      p_subject: command.subject,
      p_document: command.document,
      p_law: command.law,
      p_topic: command.topic,
      p_content_md: command.contentMd,
      p_content_checksum: command.contentChecksum,
      p_read_time_minutes: command.readTimeMinutes,
      p_read_time_policy_version: command.readTimePolicyVersion,
      p_content_schema_version: command.contentSchemaVersion,
      p_change_note: command.changeNote,
      p_actor_id: command.actorId,
      p_sort_order: command.sortOrder,
      p_display_order: command.displayOrder,
      p_navigation_label: command.navigationLabel,
    })
    if (error) throw mapSupabaseError(EDIT_RPC, error)

    const response = record(data, EDIT_RPC)
    expectedBoolean(response.success, 'success', true, EDIT_RPC)
    expectedString(response.outcome, 'outcome', 'updated', EDIT_RPC)

    const summaryId = requiredUuid(response.summary_id, 'summary_id', EDIT_RPC)
    const summaryVersionId = requiredUuid(
      response.summary_version_id,
      'summary_version_id',
      EDIT_RPC,
    )
    const packageId = requiredUuid(response.package_id, 'package_id', EDIT_RPC)
    const legacySlug = requiredString(response.legacy_slug, 'legacy_slug', EDIT_RPC)
    const revisionCreated = requiredBoolean(
      response.revision_created,
      'revision_created',
      EDIT_RPC,
    )
    const packageReassigned = requiredBoolean(
      response.package_reassigned,
      'package_reassigned',
      EDIT_RPC,
    )

    matchingIdentity(summaryId, 'summary_id', command.summaryId, EDIT_RPC)
    matchingIdentity(packageId, 'package_id', command.packageId, EDIT_RPC)
    matchingIdentity(legacySlug, 'legacy_slug', command.legacySlug, EDIT_RPC)

    return {
      summaryId,
      summaryVersionId,
      packageId,
      legacySlug,
      revisionCreated,
      packageReassigned,
    }
  }

  public async replace(
    command: SummaryBankCompatibilityReplacePersistenceCommand,
  ): Promise<SummaryBankCompatibilityReplacePersistenceResult> {
    const { data, error } = await this.client.rpc(REPLACE_RPC, {
      p_summary_id: command.summaryId,
      p_package_id: command.packageId,
      p_legacy_slug: command.legacySlug,
      p_replacement_version_id: command.replacementVersionId,
      p_canonical_title: command.title,
      p_subject: command.subject,
      p_document: command.document,
      p_law: command.law,
      p_topic: command.topic,
      p_content_md: command.contentMd,
      p_content_checksum: command.contentChecksum,
      p_read_time_minutes: command.readTimeMinutes,
      p_read_time_policy_version: command.readTimePolicyVersion,
      p_content_schema_version: command.contentSchemaVersion,
      p_change_note: command.changeNote,
      p_actor_id: command.actorId,
      p_sort_order: command.sortOrder,
      p_display_order: command.displayOrder,
      p_is_published: command.isPublished,
    })
    if (error) throw mapSupabaseError(REPLACE_RPC, error)

    const response = record(data, REPLACE_RPC)
    expectedString(response.outcome, 'outcome', 'replaced', REPLACE_RPC)

    const summaryId = requiredUuid(response.summary_id, 'summary_id', REPLACE_RPC)
    const summaryVersionId = requiredUuid(
      response.summary_version_id,
      'summary_version_id',
      REPLACE_RPC,
    )
    const packageId = requiredUuid(response.package_id, 'package_id', REPLACE_RPC)
    const legacySlug = requiredString(response.legacy_slug, 'legacy_slug', REPLACE_RPC)
    const isPublished = requiredBoolean(response.is_published, 'is_published', REPLACE_RPC)
    const idempotentRetry = requiredBoolean(
      response.idempotent_retry,
      'idempotent_retry',
      REPLACE_RPC,
    )

    let revisionCreated: boolean
    if (idempotentRetry) {
      expectedBoolean(isPublished, 'is_published', true, REPLACE_RPC)
      if (response.revision_created === undefined) {
        // Migration 071 omits revision_created on its immutable published retry
        // result; the absence is an explicit part of that result shape.
        revisionCreated = false
      } else {
        revisionCreated = expectedBoolean(
          response.revision_created,
          'revision_created',
          false,
          REPLACE_RPC,
        )
      }
    } else {
      revisionCreated = requiredBoolean(
        response.revision_created,
        'revision_created',
        REPLACE_RPC,
      )
    }

    matchingIdentity(summaryId, 'summary_id', command.summaryId, REPLACE_RPC)
    matchingIdentity(
      summaryVersionId,
      'summary_version_id',
      command.replacementVersionId,
      REPLACE_RPC,
    )
    matchingIdentity(packageId, 'package_id', command.packageId, REPLACE_RPC)
    matchingIdentity(legacySlug, 'legacy_slug', command.legacySlug, REPLACE_RPC)
    expectedBoolean(isPublished, 'is_published', command.isPublished, REPLACE_RPC)

    return {
      summaryId,
      summaryVersionId,
      packageId,
      legacySlug,
      isPublished,
      revisionCreated,
      idempotentRetry,
    }
  }

  public async publish(
    command: SummaryBankCompatibilityPublishPersistenceCommand,
  ): Promise<SummaryBankCompatibilityPublishPersistenceResult> {
    const target = await resolvePublicationTarget(this.client, command.summaryId)
    const { data, error } = await this.client.rpc(PUBLISH_RPC, {
      p_summary_id: command.summaryId,
      p_version_id: target.versionId,
      p_actor_id: command.actorId,
      p_source_snapshots: target.sourceSnapshots,
    })
    if (error) throw mapSupabaseError(PUBLISH_RPC, error)

    const response = record(data, PUBLISH_RPC)
    const summaryId = requiredUuid(response.summary_id, 'summary_id', PUBLISH_RPC)
    const summaryVersionId = requiredUuid(
      response.summary_version_id,
      'summary_version_id',
      PUBLISH_RPC,
    )
    const packageId = requiredUuid(response.package_id, 'package_id', PUBLISH_RPC)
    const idempotentRetry = requiredBoolean(
      response.idempotent_retry,
      'idempotent_retry',
      PUBLISH_RPC,
    )
    const republished = requiredBoolean(response.republished, 'republished', PUBLISH_RPC)

    matchingIdentity(summaryId, 'summary_id', command.summaryId, PUBLISH_RPC)
    matchingIdentity(summaryVersionId, 'summary_version_id', target.versionId, PUBLISH_RPC)
    matchingIdentity(packageId, 'package_id', target.packageId, PUBLISH_RPC)
    if (idempotentRetry && republished) {
      throw new SummaryBankCompatibilityWriterError(
        'invalid_response',
        `${PUBLISH_RPC} returned contradictory lifecycle flags.`,
      )
    }

    return {
      summaryId,
      summaryVersionId,
      packageId,
      idempotentRetry,
      republished,
    }
  }

  public async unpublish(
    command: SummaryBankCompatibilityUnpublishPersistenceCommand,
  ): Promise<SummaryBankCompatibilityUnpublishPersistenceResult> {
    const { data, error } = await this.client.rpc(UNPUBLISH_RPC, {
      p_summary_id: command.summaryId,
      p_actor_id: command.actorId,
    })
    if (error) throw mapSupabaseError(UNPUBLISH_RPC, error)

    const response = record(data, UNPUBLISH_RPC)
    const summaryId = requiredUuid(response.summary_id, 'summary_id', UNPUBLISH_RPC)
    const summaryVersionId = requiredUuid(
      response.summary_version_id,
      'summary_version_id',
      UNPUBLISH_RPC,
    )
    const packageId = requiredUuid(response.package_id, 'package_id', UNPUBLISH_RPC)
    const idempotentRetry = requiredBoolean(
      response.idempotent_retry,
      'idempotent_retry',
      UNPUBLISH_RPC,
    )

    matchingIdentity(summaryId, 'summary_id', command.summaryId, UNPUBLISH_RPC)

    return {
      summaryId,
      summaryVersionId,
      packageId,
      idempotentRetry,
    }
  }

  public async delete(
    command: SummaryBankCompatibilityDeletePersistenceCommand,
  ): Promise<SummaryBankCompatibilityDeletePersistenceResult> {
    const { data, error } = await this.client.rpc(DELETE_RPC, {
      p_summary_id: command.summaryId,
      p_actor_id: command.actorId,
    })
    if (error) throw mapSupabaseError(DELETE_RPC, error)

    const response = record(data, DELETE_RPC)
    const summaryId = requiredUuid(response.summary_id, 'summary_id', DELETE_RPC)
    const outcome = requiredString(response.outcome, 'outcome', DELETE_RPC)
    if (outcome !== 'deleted' && outcome !== 'archived') {
      throw new SummaryBankCompatibilityWriterError(
        'invalid_response',
        `${DELETE_RPC} returned an unexpected outcome.`,
      )
    }
    const idempotentRetry = requiredBoolean(
      response.idempotent_retry,
      'idempotent_retry',
      DELETE_RPC,
    )

    if (outcome === 'deleted' && idempotentRetry) {
      throw new SummaryBankCompatibilityWriterError(
        'invalid_response',
        `${DELETE_RPC} returned an impossible hard-delete retry result.`,
      )
    }

    matchingIdentity(summaryId, 'summary_id', command.summaryId, DELETE_RPC)

    return { summaryId, outcome, idempotentRetry }
  }
}

export function createSummaryBankCompatibilityWriter(
  client: SummaryBankCompatibilitySupabaseClient =
    createAdminClient() as unknown as SummaryBankCompatibilitySupabaseClient,
): SummaryBankCompatibilityWriter {
  return new SummaryBankCompatibilityWriterService(
    new SupabaseSummaryBankCompatibilityPersistence(client),
  )
}

export { SupabaseSummaryBankCompatibilityPersistence }
