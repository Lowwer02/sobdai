import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { SummaryProvider } from './summary-provider.ts'

const ROOT_ID = 'provider-kp-summary'
const VERSION_ID = 'provider-v3'

function createClient(rootOverrides: Record<string, unknown> = {}, rowOverrides: Record<string, unknown> = {}) {
  const tables: Record<string, readonly Record<string, unknown>[]> = {
    summaries: [{
      id: ROOT_ID,
      summary_code: 'KP-PROVIDER',
      is_published: true,
      lifecycle_status: 'active',
      current_published_version_id: VERSION_ID,
      title: 'stale root provider title',
      slug: 'stale-root-provider-slug',
      ...rootOverrides,
    }],
    kp_read_package_summaries: [{
      package_id: 'provider-package',
      package_slug: 'provider-package-slug',
      package_is_published: true,
      summary_id: ROOT_ID,
      placement_status: 'active',
      version_policy: 'latest_published',
      pinned_summary_version_id: null,
      summary_code: 'KP-PROVIDER',
      subject: 'stale root subject',
      topic: 'stale root topic',
      visibility: 'public_indexable',
      lifecycle_status: 'active',
      summary_version_id: VERSION_ID,
      version_status: 'published',
      content_checksum: 'provider-checksum',
      title_snapshot: 'current provider title',
      subject_snapshot: 'current provider subject',
      topic_snapshot: 'current provider topic',
      read_time_minutes: 11,
      version_published_at: '2026-08-04T00:00:00.000Z',
      legacy_slug: 'provider-local-slug',
      ...rowOverrides,
    }],
    packages: [],
  }

  return {
    from(table: string) {
      const state: any = { equals: [], nulls: [], ins: [], or: null, limit: null }
      const builder: any = {
        select() { return builder },
        eq(column: string, value: unknown) { state.equals.push({ column, value }); return builder },
        is(column: string, value: unknown) { state.nulls.push({ column, value }); return builder },
        in(column: string, values: readonly unknown[]) { state.ins.push({ column, values }); return builder },
        or(filter: string) { state.or = filter; return builder },
        limit(value: number) { state.limit = value; return builder },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const rows = [...(tables[table] ?? [])]
            .filter((row) => state.equals.every(({ column, value }: any) => row[column] === value))
            .filter((row) => state.nulls.every(({ column, value }: any) => row[column] === value))
            .filter((row) => state.ins.every(({ column, values }: any) => values.includes(row[column])))
            .filter((row) => !state.or || state.or.split(',').some((clause: string) => {
              const parts = clause.split('.')
              return parts[1] === 'eq' && String(row[parts[0]]) === parts.slice(2).join('.')
            }))
            .slice(0, state.limit ?? Number.POSITIVE_INFINITY)
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

test('SummaryProvider emits only verified current Package-local targets', async () => {
  const provider = new SummaryProvider(createClient())
  const refs = await provider.find({
    contentType: 'summary',
    filters: { subjects: ['current provider subject'] },
    limit: 10,
  })

  assert.deepEqual(refs, [{
    contentId: ROOT_ID,
    contentType: 'summary',
    title: 'current provider title',
    slug: 'provider-local-slug',
    packageId: 'provider-package',
    subject: 'current provider subject',
    topic: 'current provider topic',
    difficulty: null,
  }])
})

test('SummaryProvider safely returns no target for a stale pinned revision', async () => {
  const provider = new SummaryProvider(createClient({}, {
    version_policy: 'pinned',
    pinned_summary_version_id: 'provider-v2',
    summary_version_id: 'provider-v2',
  }))
  const refs = await provider.find({
    contentType: 'summary',
    filters: { topics: ['current provider topic'] },
    limit: 10,
  })
  assert.deepEqual(refs, [])
})
