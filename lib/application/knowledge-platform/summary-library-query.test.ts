import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  SummaryLibraryItem,
  SummaryLibraryQueryRequest,
  SummaryLibraryReadRepository,
} from './contracts'
import {
  SUMMARY_LIBRARY_DEFAULT_PAGE_SIZE,
  SUMMARY_LIBRARY_MAX_PAGE,
  SUMMARY_LIBRARY_MAX_PAGE_SIZE,
  SUMMARY_LIBRARY_MAX_SEARCH_LENGTH,
  SummaryLibraryQueryService,
  normalizeSummaryLibraryQuery,
  parseSummaryLibraryQueryParams,
} from './summary-library-query'

const ITEM_BASE: SummaryLibraryItem = {
  summaryId: '00000000-0000-4000-8000-000000000001',
  summaryCode: 'SUM-000001',
  canonicalSlug: 'administrative-law',
  canonicalTitle: 'Administrative Law',
  subject: 'law',
  topic: 'public administration',
  law: null,
  visibility: 'product_entitled',
  lifecycleStatus: 'active',
  currentPublishedVersionId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  currentRevisionNumber: null,
  currentRevisionStatus: null,
  currentRevisionTitle: null,
  currentRevisionSubject: null,
  currentRevisionTopic: null,
  currentRevisionLaw: null,
  currentRevisionReadTimeMinutes: null,
  currentRevisionPublishedAt: null,
  currentRevisionContentChecksum: null,
  packagePlacementCount: 0,
  sourceDocumentCount: 0,
}

function item(overrides: Partial<SummaryLibraryItem>): SummaryLibraryItem {
  return { ...ITEM_BASE, ...overrides }
}

test('normalizes filters, invalid paging, sorting, and excessive search input', () => {
  const normalized = normalizeSummaryLibraryQuery({
    search: `  ${'x'.repeat(SUMMARY_LIBRARY_MAX_SEARCH_LENGTH + 20)}  `,
    subject: '  law  ',
    topic: ' ',
    lifecycleStatus: 'not-a-status' as never,
    visibility: 'not-a-visibility' as never,
    page: 0,
    pageSize: SUMMARY_LIBRARY_MAX_PAGE_SIZE + 1,
    sort: {
      key: 'not-a-sort-key' as never,
      direction: 'sideways' as never,
    },
  })

  assert.equal(normalized.search?.length, SUMMARY_LIBRARY_MAX_SEARCH_LENGTH)
  assert.equal(normalized.subject, 'law')
  assert.equal(normalized.topic, null)
  assert.equal(normalized.lifecycleStatus, null)
  assert.equal(normalized.visibility, null)
  assert.equal(normalized.page, 1)
  assert.equal(normalized.pageSize, SUMMARY_LIBRARY_MAX_PAGE_SIZE)
  assert.deepEqual(normalized.sort, { key: 'updatedAt', direction: 'desc' })

  assert.equal(
    normalizeSummaryLibraryQuery({ page: Number.MAX_SAFE_INTEGER }).page,
    SUMMARY_LIBRARY_MAX_PAGE
  )
})

test('maps URL query parameters through the same bounded contract', () => {
  const query = parseSummaryLibraryQueryParams({
    q: ['  treaty  ', 'ignored duplicate'],
    page: '3',
    pageSize: '50',
    lifecycleStatus: 'archived',
    visibility: 'authenticated',
    hasPublishedRevision: 'true',
    sort: 'canonicalTitle',
    direction: 'asc',
  })

  assert.equal(query.search, 'treaty')
  assert.equal(query.page, 3)
  assert.equal(query.pageSize, 50)
  assert.equal(query.lifecycleStatus, 'archived')
  assert.equal(query.visibility, 'authenticated')
  assert.equal(query.hasPublishedRevision, true)
  assert.deepEqual(query.sort, { key: 'canonicalTitle', direction: 'asc' })
})

test('passes normalized requests to a target-backed repository', async () => {
  const state: { request?: SummaryLibraryQueryRequest } = {}
  const page = {
    items: [],
    page: 1,
    pageSize: SUMMARY_LIBRARY_DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  }
  const repository: SummaryLibraryReadRepository = {
    async list() {
      return []
    },
    async search(request) {
      state.request = request
      return page
    },
  }

  await new SummaryLibraryQueryService(repository).search({
    search: '  law  ',
    page: 0,
    pageSize: 1000,
    sort: { key: 'summaryCode', direction: 'asc' },
  })

  const received = state.request
  assert.ok(received)
  assert.equal(received.search, 'law')
  assert.equal(received.page, 1)
  assert.equal(received.pageSize, SUMMARY_LIBRARY_MAX_PAGE_SIZE)
  assert.deepEqual(received.sort, { key: 'summaryCode', direction: 'asc' })
})

test('filters, sorts, and paginates through the F4.1 compatibility repository shape', async () => {
  const repository: SummaryLibraryReadRepository = {
    async list() {
      return [
        item({
          summaryId: '00000000-0000-4000-8000-000000000003',
          canonicalTitle: 'Zoning Law',
          canonicalSlug: 'zoning-law',
          updatedAt: '2026-08-04T00:00:00.000Z',
          packagePlacementCount: 1,
        }),
        item({
          summaryId: '00000000-0000-4000-8000-000000000002',
          canonicalTitle: 'Contract Law',
          canonicalSlug: 'contract-law',
          updatedAt: '2026-08-03T00:00:00.000Z',
        }),
      ]
    },
  }

  const result = await new SummaryLibraryQueryService(repository).search({
    search: 'law',
    hasPackages: false,
    page: 1,
    pageSize: 1,
    sort: { key: 'canonicalTitle', direction: 'asc' },
  })

  assert.equal(result.totalItems, 1)
  assert.equal(result.totalPages, 1)
  assert.equal(result.items[0]?.canonicalTitle, 'Contract Law')
})
