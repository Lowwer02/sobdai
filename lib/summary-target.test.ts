import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { findPublicSummaryTargets, getVerifiedSummaryHref, mapSummaryRelationsToTargets, matchPublicSummaryTarget, resolvePublicSummaryTargets } from './summary-target.ts'

const LEGACY_ID = 'legacy-summary'
const KP_ID = 'kp-summary'
const PACKAGE_LEGACY = 'legacy-package'
const PACKAGE_KP_A = 'kp-package-a'
const PACKAGE_KP_Z = 'kp-package-z'
const LEGACY_UNPUBLISHED_ID = 'legacy-unpublished'
const KP_WIDE_ID = 'kp-wide-summary'
const V2 = 'summary-version-v2'
const V3 = 'summary-version-v3'

function legacyRoot(overrides: Record<string, unknown> = {}) {
  return {
    id: LEGACY_ID,
    summary_code: null,
    package_id: PACKAGE_LEGACY,
    title: 'Legacy authoritative title',
    slug: 'legacy-authoritative-slug',
    subject: 'legacy subject',
    topic: 'legacy topic',
    read_time_minutes: 7,
    is_published: true,
    ...overrides,
  }
}

function kpRoot(id = KP_ID, overrides: Record<string, unknown> = {}) {
  return {
    id,
    summary_code: `KP-${id}`,
    is_published: true,
    lifecycle_status: 'active',
    current_published_version_id: V3,
    // These fields model stale root data. The resolver must not read them for
    // title, slug, read time, topic, or content authority.
    package_id: 'stale-root-package',
    title: 'STALE ROOT TITLE',
    slug: 'stale-root-slug',
    read_time_minutes: 1,
    content_md: '# stale root content',
    ...overrides,
  }
}

function kpRow(
  id = KP_ID,
  packageId = PACKAGE_KP_Z,
  packageSlug = 'z-package',
  overrides: Record<string, unknown> = {},
) {
  return {
    package_id: packageId,
    package_slug: packageSlug,
    package_is_published: true,
    summary_id: id,
    placement_status: 'active',
    version_policy: 'latest_published',
    pinned_summary_version_id: null,
    summary_code: `KP-${id}`,
    subject: 'STALE ROOT SUBJECT',
    topic: 'STALE ROOT TOPIC',
    visibility: 'public_indexable',
    lifecycle_status: 'active',
    summary_version_id: V3,
    version_status: 'published',
    content_checksum: `checksum-${id}`,
    title_snapshot: 'Current revision title',
    subject_snapshot: 'Current revision subject',
    topic_snapshot: 'Current revision topic',
    read_time_minutes: 13,
    version_published_at: '2026-08-04T00:00:00.000Z',
    legacy_slug: 'package-local-current-slug',
    // Explicitly present to prove the target resolver does not use the old
    // compatibility marker as an eligibility predicate.
    compatibility_marker: false,
    ...overrides,
  }
}

type FakeCall = {
  table: string
  selected: string
  inFilters: Array<{ column: string; values: readonly unknown[] }>
}

function createFakeClient(tables: Record<string, readonly Record<string, unknown>[]>) {
  const calls: FakeCall[] = []
  const client = {
    calls,
    from(table: string) {
      const state: {
        selected: string
        equals: Array<{ column: string; value: unknown }>
        nulls: Array<{ column: string; value: unknown }>
        inFilters: Array<{ column: string; values: readonly unknown[] }>
        orFilter: string | null
        maxRows: number | null
      } = {
        selected: '*',
        equals: [],
        nulls: [],
        inFilters: [],
        orFilter: null,
        maxRows: null,
      }

      const builder: any = {
        select(selected: string) {
          state.selected = selected
          return builder
        },
        eq(column: string, value: unknown) {
          state.equals.push({ column, value })
          return builder
        },
        is(column: string, value: unknown) {
          state.nulls.push({ column, value })
          return builder
        },
        in(column: string, values: readonly unknown[]) {
          state.inFilters.push({ column, values })
          return builder
        },
        or(filter: string) {
          state.orFilter = filter
          return builder
        },
        limit(maxRows: number) {
          state.maxRows = maxRows
          return builder
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          const sourceRows = [...(tables[table] ?? [])]
          const rows = sourceRows
            .filter((row) => state.equals.every(({ column, value }) => row[column] === value))
            .filter((row) => state.nulls.every(({ column, value }) => row[column] === value))
            .filter((row) => state.inFilters.every(({ column, values }) => values.includes(row[column])))
            .filter((row) => {
              if (!state.orFilter) return true
              return state.orFilter.split(',').some((clause) => {
                const parts = clause.split('.')
                const column = parts[0]
                const operator = parts[1]
                const value = parts.slice(2).join('.')
                return operator === 'eq' && String(row[column]) === value
              })
            })
            .slice(0, state.maxRows ?? Number.POSITIVE_INFINITY)

          calls.push({ table, selected: state.selected, inFilters: state.inFilters })
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
  return client
}

test('Legacy and KP targets use their own authoritative branches in one batch', async () => {
  const client = createFakeClient({
    summaries: [
      legacyRoot(),
      legacyRoot({ id: LEGACY_UNPUBLISHED_ID, is_published: false }),
      kpRoot(),
    ],
    kp_read_package_summaries: [kpRow()],
    packages: [{ id: PACKAGE_LEGACY, slug: 'legacy-package-slug', is_published: true }],
  })

  const targets = await resolvePublicSummaryTargets(client, [LEGACY_ID, LEGACY_UNPUBLISHED_ID, LEGACY_ID, KP_ID])
  const legacy = targets.get(LEGACY_ID)
  const kp = targets.get(KP_ID)

  assert.equal(targets.size, 2)
  assert.equal(targets.has(LEGACY_UNPUBLISHED_ID), false)
  assert.equal(legacy?.kind, 'legacy')
  assert.equal(legacy?.title, 'Legacy authoritative title')
  assert.equal(legacy?.href, '/package/legacy-package-slug/summary/legacy-authoritative-slug')
  assert.equal(kp?.kind, 'kp_native')
  assert.equal(kp?.title, 'Current revision title')
  assert.equal(kp?.topic, 'Current revision topic')
  assert.equal(kp?.readTimeMinutes, 13)
  assert.equal(kp?.href, '/package/z-package/summary/package-local-current-slug')
  assert.equal(kp ? 'contentMd' in kp : false, false)

  const kpCalls = client.calls.filter((call) => call.table === 'kp_read_package_summaries')
  assert.equal(kpCalls.length, 1)
  assert.deepEqual(kpCalls[0]?.inFilters[0]?.values, [LEGACY_ID, LEGACY_UNPUBLISHED_ID, KP_ID])
})

test('KP selection is deterministic, markerless memberships are accepted, and root package/slug are ignored', async () => {
  const client = createFakeClient({
    summaries: [kpRoot()],
    kp_read_package_summaries: [
      kpRow(KP_ID, PACKAGE_KP_Z, 'z-package', { legacy_slug: 'z-local-slug' }),
      kpRow(KP_ID, PACKAGE_KP_A, 'a-package', { legacy_slug: 'a-local-slug' }),
    ],
    packages: [],
  })

  const target = (await resolvePublicSummaryTargets(client, [KP_ID])).get(KP_ID)
  assert.equal(target?.packageId, PACKAGE_KP_A)
  assert.equal(target?.packageSlug, 'a-package')
  assert.equal(target?.summarySlug, 'a-local-slug')
  assert.equal(target?.href, '/package/a-package/summary/a-local-slug')
  assert.deepEqual(
    mapSummaryRelationsToTargets([KP_ID, KP_ID], new Map([[KP_ID, target!]])).map((item) => item.summaryId),
    [KP_ID],
  )
})

test('finder bounds distinct Summary roots, then selects from the complete membership set independent of row order', async () => {
  const earlyMemberships = Array.from({ length: 50 }, (_, index) =>
    kpRow(KP_WIDE_ID, `z-package-${index}`, `z-package-${index}`, {
      legacy_slug: `z-local-slug-${index}`,
    }),
  )
  const preferredMembership = kpRow(KP_WIDE_ID, 'a-package-id', 'a-package', {
    legacy_slug: 'a-local-slug',
  })

  const resolve = async (membershipRows: readonly Record<string, unknown>[]) => {
    const client = createFakeClient({
      summaries: [kpRoot(KP_WIDE_ID)],
      kp_read_package_summaries: membershipRows,
      packages: [],
    })
    return findPublicSummaryTargets(client, {
      subjects: ['Current revision subject'],
      limit: 1,
    })
  }

  const forward = await resolve([...earlyMemberships, preferredMembership])
  const reverse = await resolve([preferredMembership, ...earlyMemberships].reverse())
  const forwardTarget = forward.get(KP_WIDE_ID)
  const reverseTarget = reverse.get(KP_WIDE_ID)

  assert.equal(forward.size, 1)
  assert.equal(reverse.size, 1)
  assert.equal(forwardTarget?.packageSlug, 'a-package')
  assert.equal(forwardTarget?.summarySlug, 'a-local-slug')
  assert.deepEqual(reverseTarget, forwardTarget)
})

test('unpublished, inactive, missing-pointer, stale-pinned, and invalid memberships fail closed', async () => {
  const invalidIds = ['unpublished', 'archived', 'missing-pointer', 'stale-pinned', 'private-package', 'inactive-membership']
  const roots = [
    kpRoot('unpublished', { is_published: false }),
    kpRoot('archived', { lifecycle_status: 'archived' }),
    kpRoot('missing-pointer', { current_published_version_id: null }),
    kpRoot('stale-pinned'),
    kpRoot('private-package'),
    kpRoot('inactive-membership'),
  ]
  const rows = [
    kpRow('unpublished'),
    kpRow('archived'),
    kpRow('missing-pointer'),
    kpRow('stale-pinned', PACKAGE_KP_Z, 'z-package', {
      version_policy: 'pinned',
      pinned_summary_version_id: V2,
      summary_version_id: V2,
    }),
    kpRow('private-package', PACKAGE_KP_Z, 'z-package', { package_is_published: false }),
    kpRow('inactive-membership', PACKAGE_KP_Z, 'z-package', { placement_status: 'inactive' }),
  ]
  const client = createFakeClient({
    summaries: roots,
    kp_read_package_summaries: rows,
    packages: [],
  })

  const targets = await resolvePublicSummaryTargets(client, invalidIds)
  assert.equal(targets.size, 0)
})

test('search and recommendation matching use current revision metadata, with no routable target for invalid state', async () => {
  const client = createFakeClient({
    summaries: [
      kpRoot('search-kp', {
        subject: 'stale-root-subject',
        topic: 'stale-root-topic',
      }),
    ],
    kp_read_package_summaries: [kpRow('search-kp', PACKAGE_KP_A, 'a-package', {
      subject_snapshot: 'current subject',
      topic_snapshot: 'current topic',
      legacy_slug: 'current-local-slug',
    })],
    packages: [],
  })

  const current = await findPublicSummaryTargets(client, {
    subjects: ['current subject'],
    limit: 10,
  })
  const currentTarget = current.get('search-kp')
  assert.equal(currentTarget?.subject, 'current subject')
  assert.equal(currentTarget?.href, '/package/a-package/summary/current-local-slug')
  assert.equal((await findPublicSummaryTargets(client, {
    subjects: ['stale-root-subject'],
    limit: 10,
  })).size, 0)

  assert.equal(matchPublicSummaryTarget([...current.values()], { topic: 'current topic' }), currentTarget)
  assert.equal(matchPublicSummaryTarget([...current.values()], { topic: 'missing' }), null)
})

test('CTA href lookup returns only the verified final href and never reconstructs stale fields', () => {
  const href = '/package/a-package/summary/current-local-slug'
  const target = {
    summaryId: KP_ID,
    href,
  }
  assert.equal(getVerifiedSummaryHref([target], KP_ID), href)
  assert.equal(getVerifiedSummaryHref([target], 'missing-summary'), null)
  assert.equal(getVerifiedSummaryHref([target], null), null)
})
