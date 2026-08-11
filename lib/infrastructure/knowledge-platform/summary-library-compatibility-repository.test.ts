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
    is_summary_bank_compatibility: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
  }
}

function legacyOrderedPlacementRow(
  summaryId: string,
  title: string,
  published: boolean,
  updatedAt: string,
  sourceDocumentCount = 0
  ) {
  return {
    package_id: PACKAGE_ONE,
    summary_id: summaryId,
    display_order: 5,
    released_at: '2026-08-04T00:00:00.000Z',
    legacy_slug: 'contract-law',
    is_summary_bank_compatibility: true,
    root: rootRow(summaryId, title, published, updatedAt, sourceDocumentCount),
  }
}

function targetOnlyPlacementRow(summaryId: string) {
  return {
    ...placementRow(summaryId),
    package_id: '00000000-0000-4000-8000-000000000102',
    legacy_slug: 'target-only-summary',
    is_summary_bank_compatibility: false,
  }
}

function targetOnlyOrderedPlacementRow(
  summaryId: string,
  title: string,
  published: boolean,
  updatedAt: string
) {
  return {
    ...legacyOrderedPlacementRow(summaryId, title, published, updatedAt),
    package_id: '00000000-0000-4000-8000-000000000102',
    legacy_slug: 'target-only-summary',
    is_summary_bank_compatibility: false,
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

  private filteredData(): readonly unknown[] {
    let rows = [...(this.response.data ?? [])]
    const valueForColumn = (row: unknown, column: string): unknown => {
      if (typeof row !== 'object' || row === null) return undefined
      if (column.startsWith('root.')) {
        const nested = (row as Record<string, unknown>).root
        return typeof nested === 'object' && nested !== null
          ? (nested as Record<string, unknown>)[column.slice('root.'.length)]
          : undefined
      }
      return (row as Record<string, unknown>)[column]
    }
    for (const operation of this.operations) {
      if (operation.name === 'eq') {
        const [column, value] = operation.args
        rows = rows.filter((row) => (
          valueForColumn(row, String(column)) === value
        ))
      }
      if (operation.name === 'in') {
        const [column, values] = operation.args
        const allowed = Array.isArray(values) ? values : []
        rows = rows.filter((row) => (
          allowed.includes(valueForColumn(row, String(column)))
        ))
      }
    }
    return rows
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
      data: this.filteredData(),
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

function singleSummaryPlans(root: unknown, placement: unknown) {
  return {
    package_summaries: [
      { data: [root], count: 1 },
      { data: [placement], count: 1 },
      { data: [placement], count: 1 },
      { data: [placement], count: 1 },
    ],
    summary_reference_documents: [
      { data: [], count: 0 },
      { data: [], count: 0 },
    ],
    packages: [
      { data: [PACKAGE_ROW], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
  }
}

test('delegates legacy search, filters, count, ordering, and pagination to the server', async () => {
  const { client, calls } = fakeClient({
    package_summaries: [
      {
        data: [legacyOrderedPlacementRow(
          SUMMARY_TWO,
          'Contract Law',
          false,
          '2026-08-03T00:00:00.000Z',
          1
        )],
        count: 1,
      },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
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

  const root = callFor(calls, 'package_summaries')
  const select = root.operations.find((operation) => operation.name === 'select')
  assert.deepEqual(select?.args[1], { count: 'exact' })
  assert.ok(String(select?.args[0]).includes('root:kp_read_admin_library!inner('))
  assert.ok(hasOperation(root, 'eq', 'is_summary_bank_compatibility', true))
  assert.ok(hasOperation(root, 'ilike', 'root.canonical_title', '%contract%'))
  assert.ok(hasOperation(root, 'eq', 'root.legacy_is_published', false))
  assert.ok(hasOperation(root, 'gt', 'root.package_placement_count', 0))
  assert.ok(hasOperation(root, 'range', 0, 14))
  assert.deepEqual(
    root.operations.filter((operation) => operation.name === 'order').map((operation) => operation.args),
    [
      ['display_order', { ascending: false }],
      ['released_at', { ascending: false, nullsFirst: false }],
      ['root(updated_at)', { ascending: false }],
      ['root(created_at)', { ascending: false }],
      ['summary_id', { ascending: true }],
    ]
  )
  assert.ok(root.operations.findIndex((operation) => operation.name === 'order') <
    root.operations.findIndex((operation) => operation.name === 'range'))
  assert.equal(
    root.operations.some((operation) => operation.name === 'order' &&
      String(operation.args[0]).startsWith('placements(')),
    false
  )

  const placements = callFor(calls, 'package_summaries', 1)
  assert.ok(hasOperation(placements, 'select', 'package_id, summary_id, status, version_policy, pinned_summary_version_id, sort_order, display_order, released_at, navigation_label, legacy_slug, is_summary_bank_compatibility, created_at, updated_at', { count: 'exact' }))
  assert.ok(hasOperation(placements, 'eq', 'is_summary_bank_compatibility', true))
  assert.ok(hasOperation(placements, 'range', 0, 999))
  const relationships = callFor(calls, 'summary_reference_documents')
  assert.ok(hasOperation(relationships, 'range', 0, 9_999))

  assert.equal(calls.filter((call) => call.table === 'summaries').length, 0)
  assert.equal(calls.filter((call) => call.table === 'package_summaries').length, 4)
  assert.equal(calls.filter((call) => call.table === 'summary_reference_documents').length, 2)
  assert.equal(calls.filter((call) => call.table === 'packages').length, 2)
  assert.equal(calls.filter((call) => call.table === 'reference_documents').length, 2)
  assert.equal(calls.filter((call) => call.table === 'reference_document_versions').length, 1)
  assert.equal(calls.filter((call) => call.table === 'reference_document_aliases').length, 2)
})

test('uses the compatibility marker to exclude target-only placements with legacy slugs', async () => {
  const marked = legacyOrderedPlacementRow(
    SUMMARY_ONE,
    'Marked Summary',
    true,
    '2026-08-04T00:00:00.000Z'
  )
  const targetOnly = targetOnlyOrderedPlacementRow(
    SUMMARY_ONE,
    'Target-only Summary',
    true,
    '2026-08-05T00:00:00.000Z'
  )
  const { client, calls } = fakeClient({
    package_summaries: [
      { data: [targetOnly, marked], count: 1 },
      { data: [targetOnlyPlacementRow(SUMMARY_ONE), placementRow(SUMMARY_ONE)], count: 1 },
      { data: [targetOnlyPlacementRow(SUMMARY_ONE), placementRow(SUMMARY_ONE)], count: 1 },
      { data: [targetOnlyPlacementRow(SUMMARY_ONE), placementRow(SUMMARY_ONE)], count: 1 },
    ],
    summary_reference_documents: [
      { data: [], count: 0 },
      { data: [], count: 0 },
    ],
    packages: [
      { data: [PACKAGE_ROW], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.deepEqual(result.items.map((item) => item.id), [SUMMARY_ONE])
  assert.equal(result.items[0]?.packageId, PACKAGE_ONE)
  assert.deepEqual(result.facets.packageOptions, [{ id: PACKAGE_ONE, name: 'General Law' }])
  assert.ok(hasOperation(callFor(calls, 'package_summaries'), 'eq', 'is_summary_bank_compatibility', true))
  assert.ok(hasOperation(callFor(calls, 'package_summaries', 1), 'eq', 'is_summary_bank_compatibility', true))
})

test('uses the marker-qualified root for updatedAt ascending and canonicalTitle descending sorts', async () => {
  const cases = [
    {
      sort: { key: 'updatedAt' as const, direction: 'asc' as const },
      expected: ['root(updated_at)', { ascending: true }],
    },
    {
      sort: { key: 'canonicalTitle' as const, direction: 'desc' as const },
      expected: ['root(canonical_title)', { ascending: false }],
    },
  ] as const

  for (const testCase of cases) {
    const { client, calls } = fakeClient(singleSummaryPlans(
      legacyOrderedPlacementRow(
        SUMMARY_ONE,
        'Marked Summary',
        true,
        '2026-08-04T00:00:00.000Z'
      ),
      placementRow(SUMMARY_ONE)
    ))
    const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
    await repository.search({ hasPackages: true, sort: testCase.sort })

    const root = callFor(calls, 'package_summaries')
    assert.ok(hasOperation(root, 'eq', 'is_summary_bank_compatibility', true))
    assert.deepEqual(
      root.operations
        .filter((operation) => operation.name === 'order')
        .map((operation) => operation.args),
      [testCase.expected, ['summary_id', { ascending: true }]]
    )
  }
})

test('scopes package and document facets to marker-qualified summaries', async () => {
  const markedRoot = legacyOrderedPlacementRow(
    SUMMARY_ONE,
    'Marked Summary',
    true,
    '2026-08-04T00:00:00.000Z',
    1
  )
  const { client, calls } = fakeClient({
    package_summaries: [
      { data: [markedRoot], count: 1 },
      { data: [targetOnlyPlacementRow(SUMMARY_TWO), placementRow(SUMMARY_ONE)], count: 1 },
      { data: [targetOnlyPlacementRow(SUMMARY_TWO), placementRow(SUMMARY_ONE)], count: 1 },
      { data: [targetOnlyPlacementRow(SUMMARY_TWO), placementRow(SUMMARY_ONE)], count: 1 },
    ],
    summary_reference_documents: [
      { data: [relationshipRow(SUMMARY_ONE), relationshipRow(SUMMARY_TWO)], count: 1 },
      { data: [relationshipRow(SUMMARY_ONE), relationshipRow(SUMMARY_TWO)], count: 1 },
    ],
    packages: [
      { data: [PACKAGE_ROW], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
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
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.deepEqual(result.facets.packageOptions, [{ id: PACKAGE_ONE, name: 'General Law' }])
  assert.deepEqual(result.facets.documentOptions, ['Legacy Administrative Act'])
  const markerCalls = calls.filter((call) => call.table === 'package_summaries')
  assert.ok(markerCalls.every((call) => hasOperation(call, 'eq', 'is_summary_bank_compatibility', true)))
  const relationshipCalls = calls.filter((call) => call.table === 'summary_reference_documents')
  assert.ok(relationshipCalls.every((call) => hasOperation(call, 'in', 'summary_id', [SUMMARY_ONE])))
})

test('applies document and Package candidates before server pagination', async () => {
  const { client, calls } = fakeClient({
    reference_documents: [
      { data: [{ ...DOCUMENT_ROW, canonical_title: 'Legacy Administrative Act' }], count: 1 },
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
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
      { data: [relationshipRow(SUMMARY_TWO)], count: 1 },
    ],
    package_summaries: [
      { data: [{ summary_id: SUMMARY_TWO, is_summary_bank_compatibility: true }], count: 1 },
      {
        data: [legacyOrderedPlacementRow(
          SUMMARY_TWO,
          'Contract Law',
          false,
          '2026-08-03T00:00:00.000Z',
          1
        )],
        count: 2,
      },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
    ],
    reference_document_versions: [{ data: [VERSION_ROW], count: 1 }],
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

  const markerCandidates = callFor(calls, 'package_summaries')
  assert.ok(hasOperation(markerCandidates, 'eq', 'is_summary_bank_compatibility', true))
  assert.ok(hasOperation(markerCandidates, 'range', 0, 9_999))
  const root = callFor(calls, 'package_summaries', 1)
  assert.ok(hasOperation(root, 'in', 'summary_id', [SUMMARY_TWO]))
  assert.ok(hasOperation(root, 'eq', 'is_summary_bank_compatibility', true))
  assert.ok(hasOperation(root, 'eq', 'package_id', PACKAGE_ONE))
  assert.ok(hasOperation(root, 'range', 1, 1))
  assert.deepEqual(
    root.operations.filter((operation) => operation.name === 'order').map((operation) => operation.args),
    [
      ['root(canonical_title)', { ascending: true }],
      ['summary_id', { ascending: true }],
    ]
  )
  assert.equal(calls.filter((call) => call.table === 'summaries').length, 0)
})

test('preserves the legacy compatibility document over the normalized Primary Reference Document', async () => {
  const { client } = fakeClient({
    package_summaries: [
      { data: [legacyOrderedPlacementRow(SUMMARY_ONE, 'Zoning Law', true, '2026-08-04T00:00:00.000Z', 1)], count: 1 },
      { data: [placementRow(SUMMARY_ONE)], count: 1 },
      { data: [placementRow(SUMMARY_ONE)], count: 1 },
      { data: [placementRow(SUMMARY_ONE)], count: 1 },
    ],
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
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.equal(result.items[0]?.document, 'Legacy Civil Code')
  assert.equal(result.items[0]?.sources[0]?.referenceDocumentTitle, 'Civil and Commercial Code')
  assert.equal(result.items[0]?.sources.length, 1)
})

test('does not synthesize a legacy document from the normalized Reference Document title', async () => {
  const { client } = fakeClient({
    package_summaries: [
      { data: [legacyOrderedPlacementRow(SUMMARY_ONE, 'Zoning Law', true, '2026-08-04T00:00:00.000Z', 1)], count: 1 },
      { data: [placementRow(SUMMARY_ONE)], count: 1 },
      { data: [placementRow(SUMMARY_ONE)], count: 1 },
      { data: [placementRow(SUMMARY_ONE)], count: 1 },
    ],
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
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.equal(result.items[0]?.document, null)
  assert.equal(result.items[0]?.sources[0]?.referenceDocumentTitle, 'Civil and Commercial Code')
})

test('returns an empty server page without issuing per-Summary reads', async () => {
  const { client, calls } = fakeClient({
    package_summaries: [
      { data: [], count: 0 },
      { data: [], count: 0 },
      { data: [], count: 0 },
    ],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({ hasPackages: true })

  assert.equal(result.items.length, 0)
  assert.equal(result.totalItems, 0)
  assert.equal(result.totalPages, 0)
  assert.equal(calls.filter((call) => call.table === 'kp_read_admin_library').length, 0)
  assert.equal(calls.filter((call) => call.table === 'package_summaries').length, 3)
  assert.equal(calls.filter((call) => call.table === 'summary_reference_documents').length, 0)
  assert.equal(calls.filter((call) => call.table === 'summaries').length, 0)
})

test('does not suppress repository errors', async () => {
  const { client } = fakeClient({
    package_summaries: [{
      error: { message: 'failed package_summaries', code: 'PGRST999' },
      count: 0,
    }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  await assert.rejects(
    () => repository.search({ hasPackages: true }),
    (error: unknown) => error instanceof SummaryLibraryCompatibilityRepositoryError &&
      error.code === 'query_failed' &&
      error.source === 'package_summaries'
  )
})

test('paginates one compatibility placement per Summary before hydration', async () => {
  const { client, calls } = fakeClient({
    package_summaries: [
      {
        data: [legacyOrderedPlacementRow(
          SUMMARY_TWO,
          'Second Summary',
          false,
          '2026-08-03T00:00:00.000Z'
        )],
        count: 2,
      },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
      { data: [placementRow(SUMMARY_TWO)], count: 1 },
    ],
    summary_reference_documents: [
      { data: [], count: 0 },
      { data: [], count: 0 },
    ],
    packages: [
      { data: [{ id: PACKAGE_ONE, name: 'General Law' }], count: 1 },
      { data: [PACKAGE_ROW], count: 1 },
    ],
    reference_document_aliases: [{ data: [], count: 0 }],
    reference_documents: [{ data: [], count: 0 }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)
  const result = await repository.search({
    hasPackages: true,
    page: 2,
    pageSize: 1,
  })

  assert.equal(result.totalItems, 2)
  assert.equal(result.totalPages, 2)
  assert.deepEqual(result.items.map((item) => item.id), [SUMMARY_TWO])

  const orderedPlacements = callFor(calls, 'package_summaries')
  assert.ok(hasOperation(orderedPlacements, 'eq', 'is_summary_bank_compatibility', true))
  assert.ok(hasOperation(orderedPlacements, 'range', 1, 1))
  assert.deepEqual(
    orderedPlacements.operations
      .filter((operation) => operation.name === 'order')
      .map((operation) => operation.args),
    [
      ['display_order', { ascending: false }],
      ['released_at', { ascending: false, nullsFirst: false }],
      ['root(updated_at)', { ascending: false }],
      ['root(created_at)', { ascending: false }],
      ['summary_id', { ascending: true }],
    ]
  )
  const hydratedPlacements = callFor(calls, 'package_summaries', 1)
  assert.ok(hasOperation(hydratedPlacements, 'in', 'summary_id', [SUMMARY_TWO]))
  assert.ok(hasOperation(hydratedPlacements, 'eq', 'is_summary_bank_compatibility', true))
  assert.equal(calls.filter((call) => call.table === 'package_summaries').length, 4)
})

test('rejects duplicate marker-qualified compatibility placements instead of duplicating Summary rows', async () => {
  const duplicate = legacyOrderedPlacementRow(
    SUMMARY_ONE,
    'Duplicate Summary',
    false,
    '2026-08-03T00:00:00.000Z'
  )
  const { client } = fakeClient({
    package_summaries: [{ data: [duplicate, duplicate], count: 2 }],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  await assert.rejects(
    () => repository.search({ hasPackages: true }),
    (error: unknown) => error instanceof SummaryLibraryCompatibilityRepositoryError &&
      error.code === 'invalid_response' &&
      error.source === 'package_summaries' &&
      error.message.includes('multiple marker-qualified compatibility Package placements')
  )
})
