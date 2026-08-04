import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  SupabasePersistenceClient,
  SupabasePersistenceQuery,
  SupabasePersistenceResult,
} from './persistence'
import { PersistenceAdapterError } from './persistence'
import {
  mapSummaryLibraryRow,
  SUMMARY_LIBRARY_COLUMNS,
} from './mapping'
import { SupabaseSummaryLibraryReadRepository } from './supabase-repositories'

type DbRow = Record<string, unknown>

const SUMMARY_ID = '00000000-0000-4000-8000-000000000001'
const VERSION_ID = '00000000-0000-4000-8000-000000000004'

const libraryRow: DbRow = {
  summary_id: SUMMARY_ID,
  summary_code: 'SUM-000001',
  canonical_slug: 'administrative-law',
  canonical_title: 'Administrative Law',
  subject: 'Law',
  topic: 'Public administration',
  law: null,
  visibility: 'product_entitled',
  lifecycle_status: 'active',
  legacy_is_published: true,
  current_published_version_id: VERSION_ID,
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
  current_revision_number: 2,
  current_revision_status: 'published',
  current_revision_title: 'Administrative Law',
  current_revision_subject: 'Law',
  current_revision_topic: 'Public administration',
  current_revision_law: null,
  current_revision_read_time_minutes: 3,
  current_revision_published_at: '2026-08-03T00:00:00.000Z',
  current_revision_content_checksum: 'sha256:library',
  package_placement_count: 2,
  source_document_count: 1,
}

function createRecordingClient(rows: readonly DbRow[]) {
  const calls: {
    table: string | null
    selectedColumns: string | undefined
    orders: Array<{ column: string; ascending: boolean | undefined }>
  } = {
    table: null,
    selectedColumns: undefined,
    orders: [],
  }

  const query = {
    select(columns?: string) {
      calls.selectedColumns = columns
      return query
    },
    order(column: string, options?: { readonly ascending?: boolean }) {
      calls.orders.push({ column, ascending: options?.ascending })
      return query
    },
    then<TResult1 = SupabasePersistenceResult<DbRow[]>, TResult2 = never>(
      onfulfilled?:
        | ((value: SupabasePersistenceResult<DbRow[]>) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: [...rows], error: null }).then(
        onfulfilled,
        onrejected
      )
    },
  } as unknown as SupabasePersistenceQuery<DbRow[]>

  const client = {
    from(table: string) {
      calls.table = table
      return query
    },
    async rpc(): Promise<SupabasePersistenceResult<unknown>> {
      return { data: null, error: null }
    },
  } as unknown as SupabasePersistenceClient

  return { client, calls }
}

test('maps the target library projection without legacy or Markdown authority', () => {
  const item = mapSummaryLibraryRow(libraryRow)

  assert.equal(item.summaryId, SUMMARY_ID)
  assert.equal(item.currentPublishedVersionId, VERSION_ID)
  assert.equal(item.currentRevisionStatus, 'published')
  assert.equal(item.packagePlacementCount, 2)
  assert.equal(item.sourceDocumentCount, 1)
  assert.equal('contentMd' in item, false)
  assert.equal('legacyIsPublished' in item, false)
})

test('rejects invalid library lifecycle and count values', () => {
  assert.throws(
    () => mapSummaryLibraryRow({ ...libraryRow, lifecycle_status: 'published' }),
    (error: unknown) => {
      assert.ok(error instanceof PersistenceAdapterError)
      assert.equal(error.code, 'MAPPING_ERROR')
      return true
    }
  )

  assert.throws(
    () => mapSummaryLibraryRow({ ...libraryRow, package_placement_count: -1 }),
    (error: unknown) => {
      assert.ok(error instanceof PersistenceAdapterError)
      assert.equal(error.code, 'MAPPING_ERROR')
      return true
    }
  )
})

test('reads the target admin library view with deterministic default ordering', async () => {
  const { client, calls } = createRecordingClient([libraryRow])
  const repository = new SupabaseSummaryLibraryReadRepository(client)

  const items = await repository.list()

  assert.equal(calls.table, 'kp_read_admin_library')
  assert.equal(calls.selectedColumns, SUMMARY_LIBRARY_COLUMNS)
  assert.doesNotMatch(calls.selectedColumns ?? '', /content_md/)
  assert.doesNotMatch(calls.selectedColumns ?? '', /legacy_is_published/)
  assert.deepEqual(calls.orders, [
    { column: 'updated_at', ascending: false },
    { column: 'summary_id', ascending: true },
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0]?.summaryCode, 'SUM-000001')
})
