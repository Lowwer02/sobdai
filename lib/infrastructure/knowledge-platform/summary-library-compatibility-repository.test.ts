import assert from 'node:assert/strict'
import test from 'node:test'
import { isDeepStrictEqual } from 'node:util'

import {
  SummaryLibraryCompatibilityRepositoryError,
  SupabaseSummaryLibraryCompatibilityRepository,
  type SummaryLibraryCompatibilitySupabaseClient,
} from './summary-library-compatibility-repository'

const SUMMARY_ONE = '00000000-0000-4000-8000-000000000001'
const SUMMARY_TWO = '00000000-0000-4000-8000-000000000002'
const PACKAGE_ONE = '00000000-0000-4000-8000-000000000101'
const RELATIONSHIP_ONE = '00000000-0000-4000-8000-000000000301'
const DOCUMENT_ONE = '00000000-0000-4000-8000-000000000401'
const VERSION_ONE = '00000000-0000-4000-8000-000000000501'
const ALIAS_ONE = '00000000-0000-4000-8000-000000000601'

function rootRow(
  summaryId: string,
  title: string,
  published: boolean,
  updatedAt: string,
  sourceDocumentCount = 0
) {
  return {
    summary_id: summaryId,
    summary_code: `SUM-${summaryId.slice(-3)}`,
    canonical_slug: title.toLocaleLowerCase().replaceAll(' ', '-'),
    canonical_title: title,
    subject: 'law',
    topic: 'contracts',
    law: null,
    visibility: 'product_entitled',
    lifecycle_status: 'active',
    legacy_is_published: published,
    current_published_version_id: published ? `version-${summaryId}` : null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: updatedAt,
    current_revision_number: published ? 1 : null,
    current_revision_status: published ? 'published' : null,
    current_revision_title: published ? title : null,
    current_revision_subject: published ? 'law' : null,
    current_revision_topic: published ? 'contracts' : null,
    current_revision_law: null,
    current_revision_read_time_minutes: published ? 5 : null,
    current_revision_published_at: published ? updatedAt : null,
    current_revision_content_checksum: published ? `checksum-${summaryId}` : null,
    package_placement_count: 1,
    source_document_count: sourceDocumentCount,
  }
}

function placementRow(summaryId: string) {
  return {
    package_id: PACKAGE_ONE,
    summary_id: summaryId,
    status: 'active',
    version_policy: 'latest_published',
    pinned_summary_version_id: null,
    sort_order: 2,
    display_order: 5,
    released_at: '2026-08-04T00:00:00.000Z',
    navigation_label: null,
    legacy_slug: 'contract-law',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
  }
}

function relationshipRow(summaryId: string) {
  return {
    id: RELATIONSHIP_ONE,
    summary_id: summaryId,
    reference_document_id: DOCUMENT_ONE,
    reference_document_version_id: VERSION_ONE,
    role: 'primary',
    coverage_note: null,
    sort_order: 0,
  }
}

const DOCUMENT_ROW = {
  id: DOCUMENT_ONE,
  document_code: 'LAW-001',
  canonical_title: 'Civil and Commercial Code',
  short_title: 'CCC',
  document_type: 'statute',
  issuer: 'Parliament',
  jurisdiction: 'TH',
  lifecycle_status: 'active',
}

const VERSION_ROW = {
  id: VERSION_ONE,
  reference_document_id: DOCUMENT_ONE,
  version_label: '2026 edition',
  status: 'verified',
  publication_date: '2026-01-01',
  effective_from_date: '2026-01-01',
  effective_to_date: null,
}

const LEGACY_DOCUMENT_ALIAS_ROW = {
  id: ALIAS_ONE,
  reference_document_id: DOCUMENT_ONE,
  alias_type: 'legacy_key',
  alias_value: 'Legacy Administrative Act',
  status: 'active',
}

const PACKAGE_ROW = {
  id: PACKAGE_ONE,
  name: 'General Law',
  slug: 'general-law',
}

interface PlannedResponse {
  readonly data?: readonly unknown[] | null
  readonly count?: number | null
  readonly error?: {
    readonly message: string
    readonly code?: string
  } | null
}

interface Operation {
  readonly name: string
  readonly args: readonly unknown[]
}

interface RecordedCall {
  readonly table: string
  readonly operations: Operation[]
}

class FakeQueryBuilder implements PromiseLike<{
  readonly data: readonly unknown[] | null
  readonly error: PlannedResponse['error']
  readonly count: number | null
}> {
  public constructor(
    private readonly response: PlannedResponse,
    public readonly operations: Operation[]
  ) {}

  private record(name: string, ...args: readonly unknown[]): FakeQueryBuilder {
    this.operations.push({ name, args })
    return this
  }

  public select(columns: string, options?: unknown): FakeQueryBuilder {
    return this.record('select', columns, options)
  }

  public eq(column: string, value: unknown): FakeQueryBuilder {
    return this.record('eq', column, value)
  }

  public gt(column: string, value: unknown): FakeQueryBuilder {
    return this.record('gt', column, value)
  }

  public is(column: string, value: unknown): FakeQueryBuilder {
    return this.record('is', column, value)
  }

  public not(column: string, operator: string, value: unknown): FakeQueryBuilder {
    return this.record('not', column, operator, value)
  }

  public or(filters: string, options?: unknown): FakeQueryBuilder {
    return this.record('or', filters, options)
  }

  public in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    return this.record('in', column, values)
  }

  public ilike(column: string, pattern: string): FakeQueryBuilder {
    return this.record('ilike', column, pattern)
  }

  public order(column: string, options?: unknown): FakeQueryBuilder {
    return this.record('order', column, options)
  }

  public range(from: number, to: number): FakeQueryBuilder {
    return this.record('range', from, to)
  }

  public then<
    TResult1 = {
      readonly data: readonly unknown[] | null
      readonly error: PlannedResponse['error']
      readonly count: number | null
    },
    TResult2 = never,
  >(
    onfulfilled?: ((value: {
      readonly data: readonly unknown[] | null
      readonly error: PlannedResponse['error']
      readonly count: number | null
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.response.data ?? [],
      error: this.response.error ?? null,
      count: this.response.count ?? null,
    }).then(onfulfilled, onrejected)
  }
}

function fakeClient(
  plans: Readonly<Record<string, readonly PlannedResponse[]>>
): {
  readonly client: SummaryLibraryCompatibilitySupabaseClient
  readonly calls: RecordedCall[]
} {
  const remaining = new Map(
    Object.entries(plans).map(([table, responses]) => [table, [...responses]])
  )
  const calls: RecordedCall[] = []
  const client = {
    from(table: string) {
      const operations: Operation[] = []
      calls.push({ table, operations })
      const response = remaining.get(table)?.shift() ?? { data: [] }
      return new FakeQueryBuilder(response, operations)
    },
  } as unknown as SummaryLibraryCompatibilitySupabaseClient
  return { client, calls }
}

function callFor(
  calls: readonly RecordedCall[],
  table: string,
  index = 0
): RecordedCall {
  const call = calls.filter((candidate) => candidate.table === table)[index]
  assert.ok(call, `Expected call ${index + 1} for ${table}`)
  return call
}

function hasOperation(
  call: RecordedCall,
  name: string,
  ...args: readonly unknown[]
): boolean {
  return call.operations.some((operation) => (
    operation.name === name &&
    args.every((value, index) => isDeepStrictEqual(operation.args[index], value))
  ))
}

test('delegates legacy search, filters, count, ordering, and pagination to the server', async () => {
  const { client, calls } = fakeClient({
    package_summaries: [
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
    ],
    summary_reference_documents: [
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
    ],
    reference_documents: [
      { data: [DOCUMENT_ROW], count: 1 },
      { data: [DOCUMENT_ROW], count: 1 },
    ],
    reference_document_versions: [{ data: [VERSION_ROW], count: 1 }],
    reference_document_aliases: [
      { data: [LEGACY_DOCUMENT_ALIAS_ROW], count: 1 },
      { data: [LEGACY_DOCUMENT_ALIAS_ROW], count: 1 },
    ],
    packages: [
      { data: [{ id: PACKAGE_ONE, name: 'General Law' }], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
    kp_read_admin_library: [
      { data: [rootRow(SUMMARY_TWO, 'Contract Law', false, '2026-08-03T00:00:00.000Z', 1)], count: 1 },
    ],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({
    search: 'contract',
    publicationStatus: 'draft',
    hasPackages: true,
  })

  assert.equal(result.totalItems, 1)
  assert.equal(result.items[0]?.title, 'Contract Law')
  assert.equal(result.items[0]?.document, 'Legacy Administrative Act')

  const root = callFor(calls, 'kp_read_admin_library')
  const select = root.operations.find((operation) => operation.name === 'select')
  assert.deepEqual(select?.args[1], { count: 'exact' })
  assert.ok(hasOperation(root, 'ilike', 'canonical_title', '%contract%'))
  assert.ok(hasOperation(root, 'eq', 'legacy_is_published', false))
  assert.ok(hasOperation(root, 'gt', 'package_placement_count', 0))
  assert.ok(hasOperation(root, 'range', 0, 14))
  assert.deepEqual(
    root.operations.filter((operation) => operation.name === 'order').map((operation) => operation.args),
    [
      ['placements(display_order)', { ascending: false }],
      ['placements(released_at)', { ascending: false, nullsFirst: false }],
      ['updated_at', { ascending: false }],
      ['created_at', { ascending: false }],
      ['summary_id', { ascending: true }],
    ]
  )

  const placements = callFor(calls, 'package_summaries')
  assert.ok(hasOperation(placements, 'select', 'package_id, summary_id, status, version_policy, pinned_summary_version_id, sort_order, display_order, released_at, navigation_label, legacy_slug, created_at, updated_at', { count: 'exact' }))
  assert.ok(hasOperation(placements, 'range', 0, 999))
  const relationships = callFor(calls, 'summary_reference_documents')
  assert.ok(hasOperation(relationships, 'range', 0, 9_999))

  assert.equal(calls.filter((call) => call.table === 'summaries').length, 0)
  assert.equal(calls.filter((call) => call.table === 'package_summaries').length, 1)
  assert.equal(calls.filter((call) => call.table === 'summary_reference_documents').length, 2)
})

test('applies document and Package candidates before server pagination', async () => {
  const { client, calls } = fakeClient({
    reference_documents: [
      { data: [DOCUMENT_ROW], count: 1 },
      { data: [], count: 0 },
      { data: [DOCUMENT_ROW], count: 1 },
      { data: [DOCUMENT_ROW], count: 1 },
    ],
    reference_document_aliases: [
      { data: [], count: 0 },
      { data: [LEGACY_DOCUMENT_ALIAS_ROW], count: 1 },
      { data: [LEGACY_DOCUMENT_ALIAS_ROW], count: 1 },
    ],
    summary_reference_documents: [
      { data: [{ summary_id: SUMMARY_TWO }], count: 1 },
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
    ],
    package_summaries: [{ data: [placementRow(SUMMARY_TWO)], count: 1 }],
    reference_document_versions: [{ data: [VERSION_ROW], count: 1 }],
    kp_read_admin_library: [{
      data: [rootRow(SUMMARY_TWO, 'Contract Law', false, '2026-08-03T00:00:00.000Z', 1)],
      count: 2,
    }],
    packages: [
      { data: [{ id: PACKAGE_ONE, name: 'General Law' }], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({
    document: 'Legacy Administrative Act',
    packageId: PACKAGE_ONE,
    page: 2,
    pageSize: 1,
    sort: { key: 'canonicalTitle', direction: 'asc' },
  })

  assert.equal(result.totalItems, 2)
  assert.equal(result.totalPages, 2)
  assert.equal(result.page, 2)

  const documentTitleLookup = callFor(calls, 'reference_documents')
  assert.ok(hasOperation(documentTitleLookup, 'eq', 'canonical_title', 'Legacy Administrative Act'))
  const documentCandidates = callFor(calls, 'summary_reference_documents')
  assert.ok(hasOperation(documentCandidates, 'eq', 'role', 'primary'))
  assert.ok(hasOperation(documentCandidates, 'in', 'reference_document_id', [DOCUMENT_ONE]))

  const root = callFor(calls, 'kp_read_admin_library')
  assert.ok(hasOperation(root, 'in', 'summary_id', [SUMMARY_TWO]))
  assert.ok(hasOperation(root, 'eq', 'placements.package_id', PACKAGE_ONE))
  assert.ok(hasOperation(root, 'range', 1, 1))
  assert.deepEqual(
    root.operations.filter((operation) => operation.name === 'order').map((operation) => operation.args),
    [
      ['canonical_title', { ascending: true }],
      ['summary_id', { ascending: true }],
    ]
  )
  assert.equal(calls.filter((call) => call.table === 'summaries').length, 0)
})

test('preserves the legacy compatibility document over the normalized Primary Reference Document', async () => {
  const { client } = fakeClient({
    package_summaries: [{ data: [placementRow(SUMMARY_ONE)], count: 1 }],
    summary_reference_documents: [
      { data: [relationshipRow(SUMMARY_ONE)], count: 1 },
      { data: [relationshipRow(SUMMARY_ONE)], count: 1 },
    ],
    packages: [
      { data: [{ id: PACKAGE_ONE, name: 'General Law' }], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
    reference_documents: [
      { data: [DOCUMENT_ROW], count: 1 },
      { data: [DOCUMENT_ROW], count: 1 },
    ],
    reference_document_versions: [{ data: [VERSION_ROW], count: 1 }],
    reference_document_aliases: [
      { data: [{ ...LEGACY_DOCUMENT_ALIAS_ROW, alias_value: 'Legacy Civil Code' }], count: 1 },
      { data: [{ ...LEGACY_DOCUMENT_ALIAS_ROW, alias_value: 'Legacy Civil Code' }], count: 1 },
    ],
    kp_read_admin_library: [{
      data: [rootRow(SUMMARY_ONE, 'Zoning Law', true, '2026-08-04T00:00:00.000Z', 1)],
      count: 1,
    }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.equal(result.items[0]?.document, 'Legacy Civil Code')
  assert.equal(result.items[0]?.sources[0]?.referenceDocumentTitle, 'Civil and Commercial Code')
  assert.equal(result.items[0]?.sources.length, 1)
})

test('does not synthesize a legacy document from the normalized Reference Document title', async () => {
  const { client } = fakeClient({
    package_summaries: [{ data: [placementRow(SUMMARY_ONE)], count: 1 }],
    summary_reference_documents: [
      { data: [relationshipRow(SUMMARY_ONE)], count: 1 },
      { data: [relationshipRow(SUMMARY_ONE)], count: 1 },
    ],
    packages: [
      { data: [{ id: PACKAGE_ONE, name: 'General Law' }], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
    reference_documents: [
      { data: [DOCUMENT_ROW], count: 1 },
      { data: [DOCUMENT_ROW], count: 1 },
    ],
    reference_document_versions: [{ data: [VERSION_ROW], count: 1 }],
    reference_document_aliases: [
      { data: [], count: 0 },
      { data: [], count: 0 },
    ],
    kp_read_admin_library: [{
      data: [rootRow(SUMMARY_ONE, 'Zoning Law', true, '2026-08-04T00:00:00.000Z', 1)],
      count: 1,
    }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.equal(result.items[0]?.document, null)
  assert.equal(result.items[0]?.sources[0]?.referenceDocumentTitle, 'Civil and Commercial Code')
})

test('returns an empty server page without issuing per-Summary reads', async () => {
  const { client, calls } = fakeClient({
    kp_read_admin_library: [{ data: [], count: 0 }],
    packages: [{ data: [], count: 0 }],
    summary_reference_documents: [{ data: [], count: 0 }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.equal(result.items.length, 0)
  assert.equal(result.totalItems, 0)
  assert.equal(result.totalPages, 0)
  assert.equal(calls.filter((call) => call.table === 'kp_read_admin_library').length, 1)
  assert.equal(calls.filter((call) => call.table === 'package_summaries').length, 0)
  assert.equal(calls.filter((call) => call.table === 'summary_reference_documents').length, 1)
  assert.equal(calls.filter((call) => call.table === 'summaries').length, 0)
})

test('does not suppress repository errors', async () => {
  const { client } = fakeClient({
    kp_read_admin_library: [{
      error: { message: 'failed kp_read_admin_library', code: 'PGRST999' },
      count: 0,
    }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  await assert.rejects(
    () => repository.search({ hasPackages: true }),
    (error: unknown) => error instanceof SummaryLibraryCompatibilityRepositoryError &&
      error.code === 'query_failed' &&
      error.source === 'kp_read_admin_library'
  )
})
