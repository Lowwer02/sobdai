import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { getPublicSummaryRoute, listPublicPackageSummaries, mergePublicSummaryListRows, resolvePublicSummaryRouteRows } from './public-summary.ts'

const PACKAGE_A = '00000000-0000-4000-8000-0000000000a1'
const PACKAGE_B = '00000000-0000-4000-8000-0000000000b1'
const PACKAGE_C = '00000000-0000-4000-8000-0000000000c1'
const LEGACY_ID = '00000000-0000-4000-8000-000000000101'
const KP_ID = '00000000-0000-4000-8000-000000000201'
const KP_ID_2 = '00000000-0000-4000-8000-000000000202'
const KP_VERSION_V2_ID = '00000000-0000-4000-8000-000000000302'
const KP_VERSION_V3_ID = '00000000-0000-4000-8000-000000000303'

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEGACY_ID,
    summary_code: null,
    package_id: PACKAGE_A,
    title: 'Legacy Summary',
    slug: 'legacy-summary',
    subject: 'law',
    topic: 'legacy topic',
    law: null,
    content_md: '# Legacy content',
    read_time_minutes: 4,
    updated_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    display_order: 1,
    released_at: '2026-07-02T00:00:00.000Z',
    is_published: true,
    ...overrides,
  }
}

function kpRootRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KP_ID,
    summary_code: 'SUM-000201',
    is_published: true,
    lifecycle_status: 'active',
    current_published_version_id: KP_VERSION_V3_ID,
    ...overrides,
  }
}

function kpListRow(packageId: string, overrides: Record<string, unknown> = {}) {
  return {
    package_id: packageId,
    package_slug: `package-${packageId.slice(-2)}`,
    package_name: 'Package',
    package_is_published: true,
    summary_id: KP_ID,
    placement_status: 'active',
    version_policy: 'latest_published',
    pinned_summary_version_id: null,
    sort_order: 1,
    display_order: 10,
    released_at: '2026-08-03T00:00:00.000Z',
    navigation_label: null,
    legacy_slug: `local-${packageId.slice(-2)}`,
    summary_code: 'SUM-000201',
    canonical_slug: 'canonical-summary',
    canonical_title: 'Stale Root Title',
    subject: 'law',
    topic: 'root topic',
    law: null,
    visibility: 'product_entitled',
    lifecycle_status: 'active',
    summary_version_id: KP_VERSION_V3_ID,
    revision_number: 3,
    version_status: 'published',
    content_checksum: 'checksum-3',
    title_snapshot: 'Published Revision Title',
    subject_snapshot: 'law',
    topic_snapshot: 'published topic',
    law_snapshot: null,
    read_time_minutes: 9,
    version_published_at: '2026-08-04T00:00:00.000Z',
    ...overrides,
  }
}

function kpDetailRow(packageId: string, overrides: Record<string, unknown> = {}) {
  return {
    summary_id: KP_ID,
    summary_code: 'SUM-000201',
    canonical_slug: 'canonical-summary',
    canonical_title: 'Stale Root Title',
    subject: 'law',
    topic: 'root topic',
    law: null,
    visibility: 'product_entitled',
    summary_lifecycle_status: 'active',
    package_id: packageId,
    package_slug: `package-${packageId.slice(-2)}`,
    package_name: 'Package',
    placement_status: 'active',
    version_policy: 'latest_published',
    pinned_summary_version_id: null,
    sort_order: 1,
    display_order: 10,
    navigation_label: null,
    legacy_slug: `local-${packageId.slice(-2)}`,
    summary_version_id: KP_VERSION_V3_ID,
    revision_number: 3,
    version_status: 'published',
    version_title: 'Published Revision Title',
    version_subject: 'law',
    version_topic: 'published topic',
    version_law: null,
    content_md: '# Published V3 content',
    content_checksum: 'checksum-3',
    read_time_minutes: 9,
    version_published_at: '2026-08-04T00:00:00.000Z',
    source_citations: [{
      reference_document_id: '00000000-0000-4000-8000-000000000401',
      document_code: 'LAW-001',
      title: 'Reference Document',
      reference_document_version_id: null,
      version_label: null,
      source_url: null,
      role: 'primary',
      coverage_note: null,
      sort_order: 0,
    }],
    ...overrides,
  }
}

function request(packageId: string, packageSlug: string, summarySlug: string) {
  return {
    packageId,
    packageSlug,
    packageName: 'Package',
    summarySlug,
  }
}

test('published Legacy route keeps its existing Package-local URL and fields without KP root validation', () => {
  const result = resolvePublicSummaryRouteRows(
    [legacyRow()],
    [],
    request(PACKAGE_A, 'package-a', 'legacy-summary'),
    [],
  )

  assert.ok(result)
  assert.equal(result.kind, 'legacy')
  assert.equal(result.id, LEGACY_ID)
  assert.equal(result.slug, 'legacy-summary')
  assert.equal(result.content_md, '# Legacy content')
  assert.equal(result.summary_version_id, null)
})

test('unpublished Legacy content is blocked without requiring any KP placement', () => {
  const result = resolvePublicSummaryRouteRows(
    [legacyRow({ is_published: false })],
    [],
    request(PACKAGE_A, 'package-a', 'legacy-summary'),
    [],
  )

  assert.equal(result, null)
})

test('production-shaped KP canonical route requires a published root and resolves its current V3 revision', () => {
  const row = kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'canonical-local' })
  const result = resolvePublicSummaryRouteRows(
    [],
    [row],
    request(PACKAGE_A, 'package-a', 'canonical-local'),
    [kpRootRow()],
  )

  assert.equal('summary_is_published' in row, false)
  assert.equal('current_published_version_id' in row, false)
  assert.ok(result)
  assert.equal(result.kind, 'kp_native')
  assert.equal(result.id, KP_ID)
  assert.equal(result.summary_version_id, KP_VERSION_V3_ID)
  assert.equal(result.title, 'Published Revision Title')
  assert.equal(result.content_md, '# Published V3 content')
})

test('KP root publication states fail closed for listing and detail', () => {
  const listRow = kpListRow(PACKAGE_A, { legacy_slug: 'local-a' })
  const detailRow = kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'local-a' })
  const invalidRoots = [
    [],
    [kpRootRow({ is_published: false })],
    [kpRootRow({ lifecycle_status: 'archived' })],
    [kpRootRow({ lifecycle_status: 'draft' })],
    [kpRootRow({ current_published_version_id: null })],
    [kpRootRow({ summary_code: null })],
  ]

  for (const roots of invalidRoots) {
    assert.equal(mergePublicSummaryListRows([], [listRow], PACKAGE_A, roots).length, 0)
    assert.equal(
      resolvePublicSummaryRouteRows([], [detailRow], request(PACKAGE_A, 'package-a', 'local-a'), roots),
      null,
    )
  }
})

test('KP divergent root identity fails closed', () => {
  const root = kpRootRow({ summary_code: 'SUM-DIFFERENT' })
  assert.equal(
    mergePublicSummaryListRows([], [kpListRow(PACKAGE_A)], PACKAGE_A, [root]).length,
    0,
  )
  assert.equal(
    resolvePublicSummaryRouteRows(
      [],
      [kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'local-a' })],
      request(PACKAGE_A, 'package-a', 'local-a'),
      [root],
    ),
    null,
  )
})

test('membership-selected V2 cannot override the root current V3 revision', () => {
  const listRow = kpListRow(PACKAGE_A, {
    legacy_slug: 'local-a',
    version_policy: 'pinned',
    pinned_summary_version_id: KP_VERSION_V2_ID,
    summary_version_id: KP_VERSION_V2_ID,
    title_snapshot: 'Pinned V2 title',
  })
  const detailRow = kpDetailRow(PACKAGE_A, {
    package_slug: 'package-a',
    legacy_slug: 'local-a',
    version_policy: 'pinned',
    pinned_summary_version_id: KP_VERSION_V2_ID,
    summary_version_id: KP_VERSION_V2_ID,
    version_title: 'Pinned V2 title',
    content_md: '# Pinned V2 content',
  })
  const roots = [kpRootRow({ current_published_version_id: KP_VERSION_V3_ID })]

  assert.equal(mergePublicSummaryListRows([], [listRow], PACKAGE_A, roots).length, 0)
  assert.equal(
    resolvePublicSummaryRouteRows([], [detailRow], request(PACKAGE_A, 'package-a', 'local-a'), roots),
    null,
  )
})

test('canonical and secondary marker=false memberships expose the same shared V3 revision', () => {
  const root = kpRootRow()
  const canonical = resolvePublicSummaryRouteRows(
    [],
    [kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'canonical-local' })],
    request(PACKAGE_A, 'package-a', 'canonical-local'),
    [root],
  )
  const secondaryRow = kpDetailRow(PACKAGE_B, {
    package_slug: 'package-b',
    legacy_slug: 'secondary-local',
  })
  const secondary = resolvePublicSummaryRouteRows(
    [],
    [secondaryRow],
    request(PACKAGE_B, 'package-b', 'secondary-local'),
    [root],
  )

  assert.equal('is_summary_bank_compatibility' in secondaryRow, false)
  assert.ok(canonical)
  assert.ok(secondary)
  assert.equal(secondary.id, canonical.id)
  assert.equal(secondary.summary_version_id, canonical.summary_version_id)
  assert.equal(secondary.content_md, canonical.content_md)
  assert.equal(secondary.title, 'Published Revision Title')
  assert.equal(secondary.slug, 'secondary-local')
})

test('A/B/C active memberships all list the shared root once with Package-local slugs', () => {
  const root = kpRootRow()
  const packageRows = [
    [PACKAGE_A, 'local-a'],
    [PACKAGE_B, 'local-b'],
    [PACKAGE_C, 'local-c'],
  ] as const

  for (const [packageId, localSlug] of packageRows) {
    const result = mergePublicSummaryListRows(
      [],
      [kpListRow(packageId, { legacy_slug: localSlug })],
      packageId,
      [root],
    )
    assert.equal(result.length, 1)
    assert.equal(result[0]?.id, KP_ID)
    assert.equal(result[0]?.slug, localSlug)
    assert.equal(result[0]?.updated_at, '2026-08-04T00:00:00.000Z')
  }
})

test('hidden, archived, and non-published KP projection rows fail closed', () => {
  const base = kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'local-a' })
  const invalidRows = [
    { placement_status: 'hidden' },
    { summary_lifecycle_status: 'archived' },
    { version_status: 'draft' },
    { summary_code: null },
  ]

  for (const override of invalidRows) {
    assert.equal(
      resolvePublicSummaryRouteRows(
        [],
        [{ ...base, ...override }],
        request(PACKAGE_A, 'package-a', 'local-a'),
        [kpRootRow()],
      ),
      null,
    )
  }
})

test('KP V3 revision content and metadata are authoritative over stale root-compatible fields', () => {
  const row = kpDetailRow(PACKAGE_A, {
    package_slug: 'package-a',
    legacy_slug: 'local-a',
    canonical_title: 'STALE root title',
    canonical_slug: 'stale-root-slug',
    version_title: 'Current V3 title',
    version_topic: 'Current V3 topic',
    content_md: '# Current V3 content',
  })
  const result = resolvePublicSummaryRouteRows(
    [],
    [row],
    request(PACKAGE_A, 'package-a', 'local-a'),
    [kpRootRow()],
  )

  assert.ok(result)
  assert.equal(result.title, 'Current V3 title')
  assert.equal(result.topic, 'Current V3 topic')
  assert.equal(result.content_md, '# Current V3 content')
  assert.equal(result.content_md.includes('STALE'), false)
})

test('same Package and slug collisions fail closed instead of resolving the wrong root', () => {
  const collision = resolvePublicSummaryRouteRows(
    [legacyRow({ slug: 'same-slug' })],
    [kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'same-slug' })],
    request(PACKAGE_A, 'package-a', 'same-slug'),
    [kpRootRow()],
  )

  assert.equal(collision, null)
})

test('repository reads KP roots in one batch for multiple candidate Summary IDs', async () => {
  const rootBatchIds: string[][] = []
  const rootRows = [
    kpRootRow(),
    kpRootRow({ id: KP_ID_2, summary_code: 'SUM-000202' }),
  ]
  const secondListRow = kpListRow(PACKAGE_A, {
    summary_id: KP_ID_2,
    summary_code: 'SUM-000202',
    legacy_slug: 'local-second',
    title_snapshot: 'Second V3 title',
  })
  const calls: string[] = []
  const fakeClient = {
    from(relation: string) {
      calls.push(`from:${relation}`)
      let selectedColumns = ''
      const builder = {
        select(columns: string) {
          selectedColumns = columns
          return builder
        },
        eq() { return builder },
        is() { return builder },
        in(field: string, values: string[]) {
          if (relation === 'summaries' && field === 'id') rootBatchIds.push([...values])
          return builder
        },
        order() { return builder },
        limit() { return builder },
        then(resolve: (value: unknown) => unknown) {
          const data = relation === 'summaries'
            ? selectedColumns.includes('current_published_version_id') ? rootRows : [legacyRow()]
            : [kpListRow(PACKAGE_A), secondListRow]
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return builder
    },
    rpc() {
      return Promise.resolve({ data: [kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'local-a1' })], error: null })
    },
  }

  const list = await listPublicPackageSummaries(fakeClient, PACKAGE_A)

  assert.equal(list.length, 3)
  assert.deepEqual(rootBatchIds, [[KP_ID, KP_ID_2]])
  assert.equal(calls.filter((call) => call === 'from:summaries').length, 2)
})

test('repository uses the frozen KP projection and route RPC plus batched root validation', async () => {
  const calls: string[] = []
  const fakeClient = {
    from(relation: string) {
      calls.push(`from:${relation}`)
      let selectedColumns = ''
      const builder = {
        select(columns: string) {
          selectedColumns = columns
          return builder
        },
        eq() { return builder },
        is() { return builder },
        in() { return builder },
        order() { return builder },
        limit() { return builder },
        then(resolve: (value: unknown) => unknown) {
          const data = relation === 'summaries'
            ? selectedColumns.includes('current_published_version_id') ? [kpRootRow()] : [legacyRow()]
            : [kpListRow(PACKAGE_A)]
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return builder
    },
    rpc(functionName: string) {
      calls.push(`rpc:${functionName}`)
      return Promise.resolve({
        data: [kpDetailRow(PACKAGE_A, { package_slug: 'package-a', legacy_slug: 'local-a1' })],
        error: null,
      })
    },
  }

  const list = await listPublicPackageSummaries(fakeClient, PACKAGE_A)
  const detail = await getPublicSummaryRoute(fakeClient, request(PACKAGE_A, 'package-a', 'local-a1'))

  assert.equal(list.length, 2)
  assert.ok(list.some((row) => row.id === KP_ID))
  assert.equal(detail?.kind, 'kp_native')
  assert.ok(calls.includes('from:kp_read_package_summaries'))
  assert.ok(calls.includes('rpc:kp_read_summary_route'))
  assert.equal(calls.filter((call) => call === 'from:summaries').length, 4)
})
