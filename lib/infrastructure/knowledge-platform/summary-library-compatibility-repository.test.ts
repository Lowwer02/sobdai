import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SummaryLibraryCompatibilityRepositoryError,
  SupabaseSummaryLibraryCompatibilityRepository,
  type SummaryLibraryCompatibilitySupabaseClient,
} from './summary-library-compatibility-repository'

const SUMMARY_LEGACY = '00000000-0000-4000-8000-000000000001'
const SUMMARY_KP = '00000000-0000-4000-8000-000000000002'
const SUMMARY_KP_SECONDARY = '00000000-0000-4000-8000-000000000003'
const SUMMARY_LEGACY_RELEASE_NEW = '00000000-0000-4000-8000-000000000004'
const SUMMARY_LEGACY_UPDATED_NEW = '00000000-0000-4000-8000-000000000005'
const SUMMARY_LEGACY_UPDATED_OLD = '00000000-0000-4000-8000-000000000006'
const SUMMARY_LEGACY_CREATED_NEW = '00000000-0000-4000-8000-000000000007'
const SUMMARY_LEGACY_CREATED_OLD = '00000000-0000-4000-8000-000000000008'
const SUMMARY_LEGACY_ID_FIRST = '00000000-0000-4000-8000-000000000009'
const SUMMARY_LEGACY_ID_SECOND = '00000000-0000-4000-8000-000000000010'
const SUMMARY_LEGACY_RELEASE_NULL = '00000000-0000-4000-8000-000000000011'
const PACKAGE_ALPHA = '00000000-0000-4000-8000-000000000101'
const PACKAGE_BETA = '00000000-0000-4000-8000-000000000102'
const PACKAGE_GAMMA = '00000000-0000-4000-8000-000000000103'
const DOCUMENT_ONE = '00000000-0000-4000-8000-000000000201'
const VERSION_ONE = '00000000-0000-4000-8000-000000000301'

type Row = Record<string, unknown>

function kpRootRow(
  summaryId: string,
  title: string,
  updatedAt: string,
  published = true,
  sourceDocumentCount = 0
): Row {
  return {
    summary_id: summaryId,
    summary_code: `SUM-${summaryId.slice(-3)}`,
    canonical_slug: title.toLowerCase().replaceAll(' ', '-'),
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
    package_placement_count: summaryId === SUMMARY_KP ? 3 : 1,
    source_document_count: sourceDocumentCount,
  }
}

function legacyRootRow(overrides: Partial<Row> = {}): Row {
  return {
    id: SUMMARY_LEGACY,
    summary_code: null,
    package_id: PACKAGE_ALPHA,
    title: 'Legacy Administrative Act',
    slug: 'legacy-administrative-act',
    subject: 'law',
    topic: 'administration',
    law: null,
    document: 'Legacy Administrative Act',
    sort_order: 1,
    display_order: 1,
    released_at: '2026-07-01T00:00:00.000Z',
    is_published: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  }
}

function legacyDefaultOrderRows(): readonly Row[] {
  return [
    legacyRootRow({
      id: SUMMARY_LEGACY,
      title: 'Zeta display order',
      display_order: 2,
      released_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_RELEASE_NEW,
      title: 'Alpha release date',
      display_order: 1,
      released_at: '2026-12-01T00:00:00.000Z',
      updated_at: '2026-12-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_UPDATED_NEW,
      title: 'Bravo updated date',
      display_order: 1,
      released_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-12-31T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_UPDATED_OLD,
      title: 'Charlie updated date',
      display_order: 1,
      released_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_CREATED_NEW,
      title: 'Delta created date',
      display_order: 1,
      released_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-09-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_CREATED_OLD,
      title: 'Echo created date',
      display_order: 1,
      released_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_ID_FIRST,
      title: 'Foxtrot ID first',
      display_order: 1,
      released_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-07-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_ID_SECOND,
      title: 'Golf ID second',
      display_order: 1,
      released_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-07-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_RELEASE_NULL,
      title: 'Hotel null release',
      display_order: 1,
      released_at: null,
      updated_at: '2029-01-01T00:00:00.000Z',
      created_at: '2029-01-01T00:00:00.000Z',
    }),
  ]
}

function membershipRow(
  summaryId: string,
  packageId: string,
  marker: boolean
): Row {
  return {
    package_id: packageId,
    summary_id: summaryId,
    status: 'active',
    version_policy: 'latest_published',
    pinned_summary_version_id: null,
    sort_order: packageId === PACKAGE_ALPHA ? 1 : 2,
    display_order: packageId === PACKAGE_ALPHA ? 1 : 2,
    released_at: '2026-08-01T00:00:00.000Z',
    navigation_label: null,
    legacy_slug: 'contract-law',
    is_summary_bank_compatibility: marker,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
  }
}

function sourceRow(summaryId: string): Row {
  return {
    id: `relationship-${summaryId}`,
    summary_id: summaryId,
    reference_document_id: DOCUMENT_ONE,
    reference_document_version_id: VERSION_ONE,
    role: 'primary',
    coverage_note: null,
    sort_order: 0,
  }
}

const DOCUMENT_ROW: Row = {
  id: DOCUMENT_ONE,
  document_code: 'LAW-001',
  canonical_title: 'Civil and Commercial Code',
  short_title: 'CCC',
  document_type: 'statute',
  issuer: 'Parliament',
  jurisdiction: 'TH',
  lifecycle_status: 'active',
}

const VERSION_ROW: Row = {
  id: VERSION_ONE,
  reference_document_id: DOCUMENT_ONE,
  version_label: '2026 edition',
  status: 'verified',
  publication_date: '2026-01-01',
  effective_from_date: '2026-01-01',
  effective_to_date: null,
}

const ALIAS_ROW: Row = {
  id: '00000000-0000-4000-8000-000000000401',
  reference_document_id: DOCUMENT_ONE,
  alias_type: 'legacy_key',
  alias_value: 'Civil Code',
  status: 'active',
}

const PACKAGE_ROWS: readonly Row[] = [
  { id: PACKAGE_ALPHA, name: 'Alpha Package', slug: 'alpha-package' },
  { id: PACKAGE_BETA, name: 'Beta Package', slug: 'beta-package' },
  { id: PACKAGE_GAMMA, name: 'Gamma Package', slug: 'gamma-package' },
]

interface Operation {
  readonly name: string
  readonly args: readonly unknown[]
}

interface Call {
  readonly table: string
  readonly operations: Operation[]
}

interface QueryFailure {
  readonly message: string
  readonly code?: string
}

class FakeQueryBuilder implements PromiseLike<{
  readonly data: readonly Row[] | null
  readonly error: QueryFailure | null
  readonly count: number | null
}> {
  private rangeValue: readonly [number, number] | null = null

  public constructor(
    private readonly rows: readonly Row[],
    public readonly operations: Operation[],
    private readonly failure: QueryFailure | null = null
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
    this.rangeValue = [from, to]
    return this.record('range', from, to)
  }

  private valueFor(row: Row, column: string): unknown {
    return row[column]
  }

  private filteredRows(applyRange = true): readonly Row[] {
    let rows = [...this.rows]
    for (const operation of this.operations) {
      const [column, value] = operation.args
      const field = String(column)
      if (operation.name === 'eq') {
        rows = rows.filter((row) => this.valueFor(row, field) === value)
      } else if (operation.name === 'in') {
        const values = Array.isArray(value) ? value : []
        rows = rows.filter((row) => values.includes(this.valueFor(row, field)))
      } else if (operation.name === 'is') {
        rows = rows.filter((row) => value === null
          ? row[field] === null || row[field] === undefined
          : row[field] === value)
      } else if (operation.name === 'not' && operation.args[1] === 'is' && value === null) {
        rows = rows.filter((row) => row[field] !== null && row[field] !== undefined)
      } else if (operation.name === 'gt') {
        rows = rows.filter((row) => (
          typeof row[field] === 'number' && row[field] > Number(value)
        ))
      } else if (operation.name === 'ilike') {
        const needle = String(value).replaceAll('%', '').toLocaleLowerCase()
        rows = rows.filter((row) => String(row[field] ?? '').toLocaleLowerCase().includes(needle))
      } else if (operation.name === 'or' && field === 'subject.is.null,subject.eq.') {
        rows = rows.filter((row) => row.subject === null || row.subject === undefined)
      }
    }

    const orderOperations = this.operations.filter((operation) => operation.name === 'order')
    for (const operation of [...orderOperations].reverse()) {
      const [column, options] = operation.args
      const ascending = typeof options === 'object' && options !== null &&
        (options as { ascending?: boolean }).ascending !== false
      const nullsFirst = typeof options === 'object' && options !== null &&
        (options as { nullsFirst?: boolean }).nullsFirst === true
      rows.sort((left, right) => {
        const leftValue = left[String(column)]
        const rightValue = right[String(column)]
        if (leftValue === rightValue) return 0
        if (leftValue === null || leftValue === undefined) return nullsFirst ? -1 : 1
        if (rightValue === null || rightValue === undefined) return nullsFirst ? 1 : -1
        const comparison = String(leftValue).localeCompare(String(rightValue))
        return ascending ? comparison : -comparison
      })
    }

    if (!applyRange || !this.rangeValue) return rows
    const [from, to] = this.rangeValue
    return rows.slice(from, to + 1)
  }

  public then<TResult1 = {
    readonly data: readonly Row[] | null
    readonly error: QueryFailure | null
    readonly count: number | null
  }, TResult2 = never>(
    onfulfilled?: ((value: {
      readonly data: readonly Row[] | null
      readonly error: QueryFailure | null
      readonly count: number | null
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const value = this.failure
      ? { data: null, error: this.failure, count: 0 }
      : { data: this.filteredRows(), error: null, count: this.filteredRows(false).length }
    return Promise.resolve(value).then(onfulfilled, onrejected)
  }
}

function makeClient(
  failureTable: string | null = null,
  overrides: Partial<Record<string, readonly Row[]>> = {}
): {
  readonly client: SummaryLibraryCompatibilitySupabaseClient
  readonly calls: readonly Call[]
} {
  const data: Readonly<Record<string, readonly Row[]>> = {
    kp_read_admin_library: [
      kpRootRow(SUMMARY_KP, 'Contract Law', '2026-08-03T00:00:00.000Z', true, 1),
      kpRootRow(SUMMARY_KP_SECONDARY, 'Beta Administrative Law', '2026-08-04T00:00:00.000Z', false),
    ],
    summaries: [legacyRootRow()],
    package_summaries: [
      membershipRow(SUMMARY_KP, PACKAGE_ALPHA, true),
      membershipRow(SUMMARY_KP, PACKAGE_BETA, false),
      membershipRow(SUMMARY_KP, PACKAGE_GAMMA, false),
      membershipRow(SUMMARY_KP_SECONDARY, PACKAGE_GAMMA, false),
    ],
    packages: PACKAGE_ROWS,
    summary_reference_documents: [sourceRow(SUMMARY_KP)],
    reference_documents: [DOCUMENT_ROW],
    reference_document_versions: [VERSION_ROW],
    reference_document_aliases: [ALIAS_ROW],
    ...overrides,
  }
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const operations: Operation[] = []
      calls.push({ table, operations })
      return new FakeQueryBuilder(
        data[table] ?? [],
        operations,
        table === failureTable ? { message: `failed ${table}`, code: 'PGRST999' } : null
      )
    },
  } as unknown as SummaryLibraryCompatibilitySupabaseClient
  return { client, calls }
}

function callsFor(calls: readonly Call[], table: string): readonly Call[] {
  return calls.filter((call) => call.table === table)
}

function hasOperation(
  calls: readonly Call[],
  name: string,
  column: string,
  value?: unknown
): boolean {
  return calls.some((call) => call.operations.some((operation) => (
    operation.name === name &&
    operation.args[0] === column &&
    (value === undefined || operation.args[1] === value)
  )))
}

test('reads one root row per Summary and hydrates legacy ownership plus every KP membership', async () => {
  const { client, calls } = makeClient()
  const result = await new SupabaseSummaryLibraryCompatibilityRepository(client).search({
    pageSize: 10,
    sort: { key: 'canonicalTitle', direction: 'asc' },
  })

  assert.equal(result.totalItems, 3)
  assert.equal(result.items.length, 3)
  assert.deepEqual(new Set(result.items.map((item) => item.id)), new Set([
    SUMMARY_LEGACY,
    SUMMARY_KP,
    SUMMARY_KP_SECONDARY,
  ]))

  const legacy = result.items.find((item) => item.id === SUMMARY_LEGACY)
  assert.equal(legacy?.summaryKind, 'legacy')
  assert.deepEqual(legacy?.packageIds, [PACKAGE_ALPHA])
  assert.deepEqual(legacy?.placements, [])
  assert.equal(legacy?.slug, 'legacy-administrative-act')

  const kp = result.items.find((item) => item.id === SUMMARY_KP)
  assert.equal(kp?.summaryKind, 'kp_native')
  assert.equal(kp?.placements.length, 3)
  assert.deepEqual(kp?.packageIds, [PACKAGE_ALPHA, PACKAGE_BETA, PACKAGE_GAMMA])
  assert.deepEqual(kp?.packages.map((currentPackage) => currentPackage.name), [
    'Alpha Package',
    'Beta Package',
    'Gamma Package',
  ])

  assert.equal(hasOperation(calls, 'eq', 'is_summary_bank_compatibility', true), false)
  assert.equal(callsFor(calls, 'summaries').length > 0, true)
  assert.equal(callsFor(calls, 'kp_read_admin_library').length > 0, true)
})

test('package filtering matches any membership, including marker=false secondary memberships', async () => {
  const { client, calls } = makeClient()
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  const beta = await repository.search({
    packageId: PACKAGE_BETA,
    search: 'contract',
    publicationStatus: 'published',
    pageSize: 10,
  })
  assert.deepEqual(beta.items.map((item) => item.id), [SUMMARY_KP])
  assert.equal(beta.items[0]?.placements.length, 3)
  assert.equal(hasOperation(calls, 'eq', 'package_id', PACKAGE_BETA), true)
  assert.equal(hasOperation(calls, 'eq', 'is_summary_bank_compatibility', true), false)

  const alpha = await repository.search({ packageId: PACKAGE_ALPHA, pageSize: 10 })
  assert.deepEqual(new Set(alpha.items.map((item) => item.id)), new Set([
    SUMMARY_LEGACY,
    SUMMARY_KP,
  ]))
  assert.equal(alpha.items.length, 2)

  const gamma = await repository.search({ packageId: PACKAGE_GAMMA, pageSize: 10 })
  assert.equal(gamma.items.filter((item) => item.id === SUMMARY_KP).length, 1)
  assert.equal(gamma.items.find((item) => item.id === SUMMARY_KP)?.placements.length, 3)
})

test('keeps root-level counts and pagination distinct across hybrid branches', async () => {
  const { client } = makeClient()
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  const pageOne = await repository.search({
    page: 1,
    pageSize: 1,
    sort: { key: 'canonicalTitle', direction: 'asc' },
  })
  const pageTwo = await repository.search({
    page: 2,
    pageSize: 1,
    sort: { key: 'canonicalTitle', direction: 'asc' },
  })

  assert.equal(pageOne.totalItems, 3)
  assert.equal(pageOne.totalPages, 3)
  assert.equal(pageTwo.totalItems, 3)
  assert.equal(pageTwo.totalPages, 3)
  assert.equal(pageOne.items.length, 1)
  assert.equal(pageTwo.items.length, 1)
  assert.notEqual(pageOne.items[0]?.id, pageTwo.items[0]?.id)
})

test('restores the Legacy default ordering precedence and null handling', async () => {
  const { client, calls } = makeClient(null, {
    kp_read_admin_library: [],
    summaries: legacyDefaultOrderRows(),
    package_summaries: [],
  })
  const result = await new SupabaseSummaryLibraryCompatibilityRepository(client).search({
    pageSize: 100,
  })

  assert.deepEqual(result.items.map((item) => item.id), [
    SUMMARY_LEGACY,
    SUMMARY_LEGACY_RELEASE_NEW,
    SUMMARY_LEGACY_UPDATED_NEW,
    SUMMARY_LEGACY_UPDATED_OLD,
    SUMMARY_LEGACY_CREATED_NEW,
    SUMMARY_LEGACY_CREATED_OLD,
    SUMMARY_LEGACY_ID_FIRST,
    SUMMARY_LEGACY_ID_SECOND,
    SUMMARY_LEGACY_RELEASE_NULL,
  ])

  const rootCall = callsFor(calls, 'summaries').find((call) => (
    call.operations.some((operation) => (
      operation.name === 'select' && String(operation.args[0]).includes('display_order')
    ))
  ))
  assert.ok(rootCall)
  assert.deepEqual(
    rootCall.operations
      .filter((operation) => operation.name === 'order')
      .map((operation) => operation.args),
    [
      ['display_order', { ascending: false }],
      ['released_at', { ascending: false, nullsFirst: false }],
      ['updated_at', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: true }],
    ]
  )
})

test('keeps explicit non-default Legacy sort modes unchanged', async () => {
  const rows = [
    legacyRootRow({
      id: SUMMARY_LEGACY,
      title: 'Zulu title',
      display_order: 9,
      updated_at: '2026-08-01T00:00:00.000Z',
    }),
    legacyRootRow({
      id: SUMMARY_LEGACY_RELEASE_NEW,
      title: 'Alpha title',
      display_order: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
    }),
  ]
  const { client } = makeClient(null, {
    kp_read_admin_library: [],
    summaries: rows,
    package_summaries: [],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  const canonicalTitle = await repository.search({
    pageSize: 100,
    sort: { key: 'canonicalTitle', direction: 'asc' },
  })
  assert.deepEqual(canonicalTitle.items.map((item) => item.id), [
    SUMMARY_LEGACY_RELEASE_NEW,
    SUMMARY_LEGACY,
  ])

  const updatedAtAscending = await repository.search({
    pageSize: 100,
    sort: { key: 'updatedAt', direction: 'asc' },
  })
  assert.deepEqual(updatedAtAscending.items.map((item) => item.id), [
    SUMMARY_LEGACY_RELEASE_NEW,
    SUMMARY_LEGACY,
  ])
})

test('keeps hybrid default ordering stable across merge, dedupe, and pagination', async () => {
  const { client } = makeClient(null, {
    kp_read_admin_library: [
      kpRootRow(SUMMARY_KP, 'KP Contract Law', '2026-08-03T00:00:00.000Z', true, 1),
      kpRootRow(SUMMARY_KP_SECONDARY, 'KP Administrative Law', '2026-08-04T00:00:00.000Z'),
    ],
    summaries: [
      legacyRootRow({
        id: SUMMARY_LEGACY,
        title: 'Legacy promoted',
        display_order: 2,
        released_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
      legacyRootRow({
        id: SUMMARY_LEGACY_RELEASE_NEW,
        title: 'Legacy secondary',
        display_order: 1,
        released_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-12-01T00:00:00.000Z',
      }),
    ],
    package_summaries: [
      membershipRow(SUMMARY_KP, PACKAGE_ALPHA, true),
      membershipRow(SUMMARY_KP, PACKAGE_BETA, false),
      membershipRow(SUMMARY_KP, PACKAGE_GAMMA, false),
      membershipRow(SUMMARY_KP_SECONDARY, PACKAGE_GAMMA, false),
    ],
  })
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  const pagedIds: string[] = []
  for (const page of [1, 2, 3, 4]) {
    const result = await repository.search({ page, pageSize: 1 })
    assert.equal(result.totalItems, 4)
    assert.equal(result.totalPages, 4)
    pagedIds.push(...result.items.map((item) => item.id))
  }

  const full = await repository.search({ pageSize: 100 })
  const fullIds = full.items.map((item) => item.id)
  assert.deepEqual(fullIds, [
    SUMMARY_KP_SECONDARY,
    SUMMARY_KP,
    SUMMARY_LEGACY,
    SUMMARY_LEGACY_RELEASE_NEW,
  ])
  assert.deepEqual(pagedIds, fullIds)
  assert.equal(new Set(fullIds).size, fullIds.length)
  assert.equal(full.items.find((item) => item.id === SUMMARY_KP)?.placements.length, 3)
})

test('preserves publication, search, and document filters for both root families', async () => {
  const { client } = makeClient()
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  const legacy = await repository.search({
    search: 'legacy administrative',
    publicationStatus: 'published',
    subject: 'law',
    document: 'Legacy Administrative Act',
    pageSize: 10,
  })
  assert.deepEqual(legacy.items.map((item) => item.id), [SUMMARY_LEGACY])

  const kp = await repository.search({
    search: 'contract',
    publicationStatus: 'published',
    subject: 'law',
    document: 'Civil Code',
    pageSize: 10,
  })
  assert.deepEqual(kp.items.map((item) => item.id), [SUMMARY_KP])
})

test('builds package and document facets from all product memberships and legacy roots', async () => {
  const { client } = makeClient()
  const result = await new SupabaseSummaryLibraryCompatibilityRepository(client).listFacets()

  assert.deepEqual(result.packageOptions, [
    { id: PACKAGE_ALPHA, name: 'Alpha Package' },
    { id: PACKAGE_BETA, name: 'Beta Package' },
    { id: PACKAGE_GAMMA, name: 'Gamma Package' },
  ])
  assert.deepEqual(result.documentOptions, [
    'Civil Code',
    'Legacy Administrative Act',
  ])
})

test('returns repository errors without suppressing the failed read', async () => {
  const { client } = makeClient('kp_read_admin_library')
  const repository = new SupabaseSummaryLibraryCompatibilityRepository(client)

  await assert.rejects(
    () => repository.search({ pageSize: 10 }),
    (error: unknown) => error instanceof SummaryLibraryCompatibilityRepositoryError &&
      error.code === 'query_failed' &&
      error.source === 'kp_read_admin_library'
  )
})
