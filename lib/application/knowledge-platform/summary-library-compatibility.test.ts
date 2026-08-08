import assert from 'node:assert/strict'
import test from 'node:test'

import type { SummaryLibraryItem } from './contracts'
import {
  SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT,
  SummaryLibraryCompatibilityMappingError,
  compareSummaryLibraryCompatibilityLegacyOrder,
  mapSummaryLibraryCompatibilityItem,
  mapSummaryLibraryPlacementRecord,
  mapSummaryLibraryProjectionRow,
  mapSummaryLibrarySourceRecord,
  normalizeSummaryLibraryCompatibilityQuery,
} from './summary-library-compatibility'

const ROOT_ROW = {
  summary_id: '00000000-0000-4000-8000-000000000001',
  summary_code: 'SUM-000001',
  canonical_slug: 'contract-law',
  canonical_title: 'Contract Law',
  subject: 'law',
  topic: 'contracts',
  law: null,
  visibility: 'product_entitled',
  lifecycle_status: 'active',
  legacy_is_published: true,
  current_published_version_id: '00000000-0000-4000-8000-000000000101',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  current_revision_number: 1,
  current_revision_status: 'published',
  current_revision_title: 'Contract Law',
  current_revision_subject: 'law',
  current_revision_topic: 'contracts',
  current_revision_law: null,
  current_revision_read_time_minutes: 6,
  current_revision_published_at: '2026-08-02T00:00:00.000Z',
  current_revision_content_checksum: 'checksum-1',
  package_placement_count: 1,
  source_document_count: 1,
} as const

const PLACEMENT_RECORD = {
  packageId: '00000000-0000-4000-8000-000000000201',
  summaryId: ROOT_ROW.summary_id,
  packageName: 'Public Administration',
  packageSlug: 'public-administration',
  status: 'active',
  versionPolicy: 'latest_published',
  pinnedSummaryVersionId: null,
  sortOrder: 4,
  displayOrder: 10,
  releasedAt: '2026-08-03T00:00:00.000Z',
  navigationLabel: null,
  legacySlug: 'contract-law',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
} as const

const SOURCE_RECORD = {
  relationshipId: '00000000-0000-4000-8000-000000000301',
  referenceDocumentId: '00000000-0000-4000-8000-000000000401',
  referenceDocumentCode: 'LAW-001',
  referenceDocumentTitle: 'Civil and Commercial Code',
  referenceDocumentShortTitle: 'CCC',
  referenceDocumentType: 'statute',
  referenceDocumentIssuer: 'Parliament',
  referenceDocumentJurisdiction: 'TH',
  referenceDocumentLifecycleStatus: 'active',
  referenceDocumentVersionId: '00000000-0000-4000-8000-000000000501',
  referenceDocumentVersionLabel: '2026 edition',
  referenceDocumentVersionStatus: 'verified',
  referenceDocumentPublicationDate: '2026-01-01',
  referenceDocumentEffectiveFromDate: '2026-01-01',
  referenceDocumentEffectiveToDate: null,
  role: 'primary',
  coverageNote: null,
  sortOrder: 0,
} as const

function rootItem(overrides: Partial<SummaryLibraryItem> = {}): SummaryLibraryItem {
  return {
    summaryId: ROOT_ROW.summary_id,
    summaryCode: ROOT_ROW.summary_code,
    canonicalSlug: ROOT_ROW.canonical_slug,
    canonicalTitle: ROOT_ROW.canonical_title,
    subject: ROOT_ROW.subject,
    topic: ROOT_ROW.topic,
    law: ROOT_ROW.law,
    visibility: ROOT_ROW.visibility,
    lifecycleStatus: ROOT_ROW.lifecycle_status,
    currentPublishedVersionId: ROOT_ROW.current_published_version_id,
    createdAt: ROOT_ROW.created_at,
    updatedAt: ROOT_ROW.updated_at,
    currentRevisionNumber: ROOT_ROW.current_revision_number,
    currentRevisionStatus: ROOT_ROW.current_revision_status,
    currentRevisionTitle: ROOT_ROW.current_revision_title,
    currentRevisionSubject: ROOT_ROW.current_revision_subject,
    currentRevisionTopic: ROOT_ROW.current_revision_topic,
    currentRevisionLaw: ROOT_ROW.current_revision_law,
    currentRevisionReadTimeMinutes: ROOT_ROW.current_revision_read_time_minutes,
    currentRevisionPublishedAt: ROOT_ROW.current_revision_published_at,
    currentRevisionContentChecksum: ROOT_ROW.current_revision_content_checksum,
    packagePlacementCount: ROOT_ROW.package_placement_count,
    sourceDocumentCount: ROOT_ROW.source_document_count,
    ...overrides,
  }
}

test('maps target root, Package placement, and Reference Document data without fabrication', () => {
  const root = mapSummaryLibraryProjectionRow(ROOT_ROW)
  const item = mapSummaryLibraryCompatibilityItem(
    root,
    [PLACEMENT_RECORD],
    [SOURCE_RECORD],
    true,
    'Civil and Commercial Code'
  )

  assert.equal(item.id, ROOT_ROW.summary_id)
  assert.equal(item.title, 'Contract Law')
  assert.equal(item.slug, 'contract-law')
  assert.equal(item.packageId, PLACEMENT_RECORD.packageId)
  assert.equal(item.packageName, 'Public Administration')
  assert.equal(item.sortOrder, 4)
  assert.equal(item.document, 'Civil and Commercial Code')
  assert.equal(item.isPublished, true)
  assert.equal(item.selection.revisionId, ROOT_ROW.current_published_version_id)
  assert.deepEqual(item.compatibilityWarnings, [])
})

test('preserves unassigned Package and legacy Document fallback values', () => {
  const root = mapSummaryLibraryProjectionRow({
    ...ROOT_ROW,
    current_published_version_id: null,
    current_revision_status: null,
    package_placement_count: 0,
    source_document_count: 0,
  })
  const item = mapSummaryLibraryCompatibilityItem(
    root,
    [],
    [],
    false,
    'Legacy Administrative Act'
  )

  assert.equal(item.packageId, null)
  assert.equal(item.packageName, null)
  assert.equal(item.slug, null)
  assert.equal(item.sortOrder, null)
  assert.equal(item.document, 'Legacy Administrative Act')
  assert.equal(item.isPublished, false)
  assert.ok(item.compatibilityWarnings.includes('no_package_placement'))
  assert.ok(item.compatibilityWarnings.includes('no_primary_reference_document'))
  assert.equal(normalizeSummaryLibraryCompatibilityQuery({
    document: SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT,
  }).document, SUMMARY_LIBRARY_UNASSIGNED_DOCUMENT)
})

test('returns typed errors for invalid projection and ambiguous placement data', () => {
  assert.throws(
    () => mapSummaryLibraryProjectionRow({ ...ROOT_ROW, canonical_title: null }),
    (error: unknown) => error instanceof SummaryLibraryCompatibilityMappingError &&
      error.code === 'invalid_root_projection' &&
      error.field === 'canonical_title'
  )

  const root = mapSummaryLibraryProjectionRow(ROOT_ROW)
  assert.throws(
    () => mapSummaryLibraryCompatibilityItem(root, [PLACEMENT_RECORD, {
      ...PLACEMENT_RECORD,
      packageId: '00000000-0000-4000-8000-000000000202',
    }], [], true),
    (error: unknown) => error instanceof SummaryLibraryCompatibilityMappingError &&
      error.code === 'ambiguous_placement'
  )
})

test('maps placement and source records through validated DTO boundaries', () => {
  const placement = mapSummaryLibraryPlacementRecord(PLACEMENT_RECORD)
  const source = mapSummaryLibrarySourceRecord(SOURCE_RECORD)

  assert.equal(placement.packageId, PLACEMENT_RECORD.packageId)
  assert.equal(placement.displayOrder, 10)
  assert.equal(source.referenceDocumentCode, 'LAW-001')
  assert.equal(source.role, 'primary')
})

test('uses deterministic legacy ordering with placement metadata', () => {
  const newer = mapSummaryLibraryCompatibilityItem(rootItem({
    summaryId: '00000000-0000-4000-8000-000000000002',
    updatedAt: '2026-08-04T00:00:00.000Z',
  }), [PLACEMENT_RECORD], [SOURCE_RECORD], true)
  const promoted = mapSummaryLibraryCompatibilityItem(rootItem({
    summaryId: '00000000-0000-4000-8000-000000000003',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }), [{ ...PLACEMENT_RECORD, displayOrder: 99 }], [SOURCE_RECORD], true)

  assert.ok(compareSummaryLibraryCompatibilityLegacyOrder(promoted, newer) < 0)
})
