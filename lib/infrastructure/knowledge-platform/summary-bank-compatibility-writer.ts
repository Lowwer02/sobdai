import { createAdminClient } from '@/lib/supabase/admin'
import {
  SummaryBankCompatibilityWriterError,
  SummaryBankCompatibilityWriterService,
  type SummaryBankCompatibilityCreatePersistenceCommand,
  type SummaryBankCompatibilityCreatePersistenceResult,
  type SummaryBankCompatibilityEditPersistenceCommand,
  type SummaryBankCompatibilityEditPersistenceResult,
  type SummaryBankCompatibilityPersistence,
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
}

interface NamespaceQuery {
  select(columns: string): NamespaceQuery
  eq(column: string, value: unknown): NamespaceQuery
  maybeSingle(): PromiseLike<QueryResponse>
}

export interface SummaryBankCompatibilitySupabaseClient {
  from(table: string): NamespaceQuery
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<QueryResponse>
}

const CREATE_RPC = 'kp_persist_create_compatibility_summary'
const EDIT_RPC = 'kp_persist_update_compatibility_summary'
const SUMMARY_CODE_ALLOCATOR_RPC = 'allocate_summary_codes'

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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
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

class SupabaseSummaryBankCompatibilityPersistence
  implements SummaryBankCompatibilityPersistence {
  public constructor(
    private readonly client: SummaryBankCompatibilitySupabaseClient,
  ) {}

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
