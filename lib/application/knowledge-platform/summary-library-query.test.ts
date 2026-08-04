import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  SummaryLibraryItem,
  SummaryLibraryReadRepository,
} from './contracts'
import { SummaryLibraryQueryService } from './summary-library-query'

const item: SummaryLibraryItem = {
  summaryId: '00000000-0000-4000-8000-000000000001',
  summaryCode: 'SUM-000001',
  canonicalSlug: 'administrative-law',
  canonicalTitle: 'Administrative Law',
  subject: 'Law',
  topic: null,
  law: null,
  visibility: 'product_entitled',
  lifecycleStatus: 'active',
  currentPublishedVersionId: null,
  createdAt: '2026-08-02T00:00:00.000Z',
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

test('application library query delegates to the read repository', async () => {
  let calls = 0
  const repository: SummaryLibraryReadRepository = {
    async list() {
      calls += 1
      return [item]
    },
  }
  const query = new SummaryLibraryQueryService(repository)

  const result = await query.list()

  assert.equal(calls, 1)
  assert.deepEqual(result, [item])
})
