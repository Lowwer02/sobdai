import type {
  PackageIdentity,
  PackageSummary,
  PackageSummaryRepository,
  PublicationSource,
  Summary,
  SummaryLibraryItem,
  SummaryLibraryReadRepository,
  SummaryRepository,
  SummarySourceRepository,
  SummaryVersion,
  SummaryVersionRepository,
  UUID,
  VersionSourceSnapshot,
} from '../../application/knowledge-platform/contracts'
import {
  mapPackageSummaryRow,
  mapPublicationSourceRow,
  mapSummaryRow,
  mapSummaryLibraryRow,
  mapSummaryVersionRow,
  PACKAGE_SUMMARY_COLUMNS,
  SUMMARY_COLUMNS,
  SUMMARY_LIBRARY_COLUMNS,
  SUMMARY_VERSION_COLUMNS,
  toPackageSummaryRow,
  toSummaryRow,
  toSummaryVersionRow,
  toVersionSourceSnapshotRow,
} from './mapping'
import {
  adaptSupabaseClient,
  PersistenceAdapterError,
  SupabasePersistenceClient,
  SupabasePersistenceQuery,
  SupabasePersistenceResult,
  throwIfPersistenceError,
  requiredUuid,
} from './persistence'

type DbRow = Record<string, unknown>

function tableQuery(client: SupabasePersistenceClient, table: string): SupabasePersistenceQuery<DbRow[]> {
  return client.from(table) as unknown as SupabasePersistenceQuery<DbRow[]>
}

async function readMany(query: SupabasePersistenceQuery<DbRow[]>): Promise<readonly DbRow[]> {
  const result = (await query) as SupabasePersistenceResult<unknown>
  throwIfPersistenceError('Supabase query', result)
  return Array.isArray(result.data) ? (result.data as DbRow[]) : []
}

async function readOne(query: SupabasePersistenceQuery<DbRow[]>): Promise<DbRow | null> {
  const result = (await query.maybeSingle()) as SupabasePersistenceResult<unknown>
  throwIfPersistenceError('Supabase query', result)
  return result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? (result.data as DbRow)
    : null
}

async function write(query: SupabasePersistenceQuery<DbRow[]> , operation: string): Promise<void> {
  const result = (await query) as SupabasePersistenceResult<unknown>
  throwIfPersistenceError(operation, result)
}

async function writeAndRequireRow(
  query: SupabasePersistenceQuery<DbRow[]>,
  operation: string
): Promise<void> {
  const row = await readOne(query)
  if (!row) {
    throw new PersistenceAdapterError(
      'PERSISTENCE_ERROR',
      `${operation} did not affect a visible row.`
    )
  }
}

function targetSummaryQuery(client: SupabasePersistenceClient): SupabasePersistenceQuery<DbRow[]> {
  return tableQuery(client, 'summaries')
    .select(SUMMARY_COLUMNS)
    // Rows before target identity backfill are not Summary aggregate rows yet.
    .not('summary_code', 'is', null)
    .not('canonical_slug', 'is', null)
    .not('canonical_title', 'is', null)
}

export class SupabaseSummaryRepository implements SummaryRepository {
  public constructor(private readonly client: SupabasePersistenceClient) {}

  public async findById(id: UUID): Promise<Summary | null> {
    const row = await readOne(targetSummaryQuery(this.client).eq('id', id))
    return row ? mapSummaryRow(row) : null
  }

  public async findByCode(code: string): Promise<Summary | null> {
    const row = await readOne(targetSummaryQuery(this.client).eq('summary_code', code))
    return row ? mapSummaryRow(row) : null
  }

  public async findByCanonicalSlug(slug: string): Promise<Summary | null> {
    const row = await readOne(targetSummaryQuery(this.client).eq('canonical_slug', slug))
    return row ? mapSummaryRow(row) : null
  }

  public async allocateSummaryCode(): Promise<string> {
    const result = await this.client.rpc('allocate_summary_codes', { n: 1 })
    throwIfPersistenceError('allocate_summary_codes', result)
    if (!Array.isArray(result.data) || typeof result.data[0] !== 'string') {
      throw new PersistenceAdapterError(
        'PERSISTENCE_ERROR',
        'allocate_summary_codes returned no Summary code.'
      )
    }
    return result.data[0]
  }

  public async insert(summary: Summary): Promise<void> {
    await write(
      tableQuery(this.client, 'summaries').insert(toSummaryRow(summary)),
      'insert Summary'
    )
  }

  public async setCurrentPublishedVersion(
    summaryId: UUID,
    versionId: UUID | null,
    updatedAt: string
  ): Promise<void> {
    await writeAndRequireRow(
      tableQuery(this.client, 'summaries')
        .update({ current_published_version_id: versionId, updated_at: updatedAt })
        .eq('id', summaryId)
        .select('id'),
      'set current published SummaryVersion'
    )
  }
}

/**
 * Read adapter for the target-owned Summary Library projection.
 *
 * This is deliberately separate from the aggregate SummaryRepository: the
 * Library is a denormalized read model and must not acquire command-side
 * ownership of revision, placement, or legacy publication behavior.
 */
export class SupabaseSummaryLibraryReadRepository
  implements SummaryLibraryReadRepository
{
  public constructor(private readonly client: SupabasePersistenceClient) {}

  public async list(): Promise<readonly SummaryLibraryItem[]> {
    const rows = await readMany(
      tableQuery(this.client, 'kp_read_admin_library')
        .select(SUMMARY_LIBRARY_COLUMNS)
        .order('updated_at', { ascending: false })
        .order('summary_id', { ascending: true })
    )
    return rows.map(mapSummaryLibraryRow)
  }
}

export class SupabaseSummaryVersionRepository implements SummaryVersionRepository {
  public constructor(private readonly client: SupabasePersistenceClient) {}

  private query(): SupabasePersistenceQuery<DbRow[]> {
    return tableQuery(this.client, 'summary_versions').select(SUMMARY_VERSION_COLUMNS)
  }

  public async findById(id: UUID): Promise<SummaryVersion | null> {
    const row = await readOne(this.query().eq('id', id))
    return row ? mapSummaryVersionRow(row) : null
  }

  public async findOpenBySummaryId(summaryId: UUID): Promise<SummaryVersion | null> {
    const row = await readOne(
      this.query().eq('summary_id', summaryId).in('status', ['draft', 'in_review'])
    )
    return row ? mapSummaryVersionRow(row) : null
  }

  public async listBySummaryId(summaryId: UUID): Promise<readonly SummaryVersion[]> {
    const rows = await readMany(
      this.query().eq('summary_id', summaryId).order('revision_number', { ascending: false })
    )
    return rows.map(mapSummaryVersionRow)
  }

  public async nextRevisionNumber(summaryId: UUID): Promise<number> {
    const query = tableQuery(this.client, 'summary_versions')
      .select('revision_number')
      .eq('summary_id', summaryId)
      .order('revision_number', { ascending: false })
      .limit(1)
    const row = await readOne(query)
    if (!row) return 1
    return Number(row.revision_number) + 1
  }

  public async insert(version: SummaryVersion): Promise<void> {
    await write(
      tableQuery(this.client, 'summary_versions').insert(toSummaryVersionRow(version)),
      'insert SummaryVersion'
    )
  }

  public async update(version: SummaryVersion): Promise<void> {
    await writeAndRequireRow(
      tableQuery(this.client, 'summary_versions')
        .update(toSummaryVersionRow(version))
        .eq('id', version.id)
        .eq('summary_id', version.summaryId)
        .select('id'),
      'update SummaryVersion'
    )
  }
}

export class SupabasePackageSummaryRepository implements PackageSummaryRepository {
  public constructor(private readonly client: SupabasePersistenceClient) {}

  private query(): SupabasePersistenceQuery<DbRow[]> {
    return tableQuery(this.client, 'package_summaries').select(PACKAGE_SUMMARY_COLUMNS)
  }

  public async find(packageId: UUID, summaryId: UUID): Promise<PackageSummary | null> {
    const row = await readOne(this.query().eq('package_id', packageId).eq('summary_id', summaryId))
    return row ? mapPackageSummaryRow(row) : null
  }

  public async listByPackageId(packageId: UUID): Promise<readonly PackageSummary[]> {
    const rows = await readMany(
      this.query().eq('package_id', packageId).order('sort_order', { ascending: true })
    )
    return rows.map(mapPackageSummaryRow)
  }

  public async listActiveSelectingVersion(
    summaryId: UUID,
    versionId: UUID
  ): Promise<readonly PackageSummary[]> {
    const pointerResult = (await tableQuery(this.client, 'summaries')
      .select('current_published_version_id')
      .eq('id', summaryId)
      .maybeSingle()) as SupabasePersistenceResult<unknown>
    throwIfPersistenceError('read current published SummaryVersion', pointerResult)
    const pointerRow = pointerResult.data as DbRow | null
    const currentPublishedVersionId = pointerRow
      ? String(pointerRow.current_published_version_id ?? '')
      : ''

    const rows = await readMany(this.query().eq('summary_id', summaryId).eq('status', 'active'))
    return rows
      .map(mapPackageSummaryRow)
      .filter((placement) =>
        placement.versionPolicy === 'pinned'
          ? placement.pinnedSummaryVersionId === versionId
          : currentPublishedVersionId === versionId
      )
  }

  public async insert(placement: PackageSummary): Promise<void> {
    await write(
      tableQuery(this.client, 'package_summaries').insert(toPackageSummaryRow(placement)),
      'insert PackageSummary'
    )
  }

  public async delete(packageId: UUID, summaryId: UUID): Promise<void> {
    await writeAndRequireRow(
      tableQuery(this.client, 'package_summaries')
        .delete()
        .eq('package_id', packageId)
        .eq('summary_id', summaryId)
        .select('package_id, summary_id'),
      'delete PackageSummary'
    )
  }
}

export class SupabasePackageRepository {
  public constructor(private readonly client: SupabasePersistenceClient) {}

  public async findById(id: UUID): Promise<PackageIdentity | null> {
    const query = tableQuery(this.client, 'packages').select('id, is_published').eq('id', id)
    const row = await readOne(query)
    if (!row) return null
    if (typeof row.is_published !== 'boolean') {
      throw new PersistenceAdapterError('MAPPING_ERROR', 'Cannot map Package: is_published is not boolean.')
    }
    return { id: requiredUuid(row, 'id', 'Package'), isPublished: row.is_published }
  }
}

export class SupabaseSummarySourceRepository implements SummarySourceRepository {
  public constructor(private readonly client: SupabasePersistenceClient) {}

  public async listPublicationSources(summaryId: UUID): Promise<readonly PublicationSource[]> {
    const query = tableQuery(this.client, 'summary_reference_documents')
      .select(
        'id, reference_document_id, reference_document_version_id, role, coverage_note, sort_order, reference_documents!inner(lifecycle_status), reference_document_versions(status)'
      )
      .eq('summary_id', summaryId)
      .order('sort_order', { ascending: true })
    const rows = await readMany(query)
    return rows.map(mapPublicationSourceRow)
  }

  public async replaceVersionSnapshots(
    versionId: UUID,
    snapshots: readonly VersionSourceSnapshot[]
  ): Promise<void> {
    await write(
      tableQuery(this.client, 'summary_version_reference_documents')
        .delete()
        .eq('summary_version_id', versionId),
      'delete SummaryVersion source snapshots'
    )
    if (snapshots.length === 0) return
    await write(
      tableQuery(this.client, 'summary_version_reference_documents').insert(
        snapshots.map(toVersionSourceSnapshotRow)
      ),
      'insert SummaryVersion source snapshots'
    )
  }
}

export interface KnowledgePlatformRepositorySet {
  readonly summaries: SummaryRepository
  readonly versions: SummaryVersionRepository
  readonly packageSummaries: PackageSummaryRepository
  readonly packages: SupabasePackageRepository
  readonly sources: SummarySourceRepository
}

export function createSupabaseKnowledgePlatformRepositories(
  client: unknown
): KnowledgePlatformRepositorySet {
  const adaptedClient = adaptSupabaseClient(client)
  return {
    summaries: new SupabaseSummaryRepository(adaptedClient),
    versions: new SupabaseSummaryVersionRepository(adaptedClient),
    packageSummaries: new SupabasePackageSummaryRepository(adaptedClient),
    packages: new SupabasePackageRepository(adaptedClient),
    sources: new SupabaseSummarySourceRepository(adaptedClient),
  }
}

export function createSupabaseSummaryLibraryReadRepository(
  client: unknown
): SummaryLibraryReadRepository {
  return new SupabaseSummaryLibraryReadRepository(adaptSupabaseClient(client))
}
