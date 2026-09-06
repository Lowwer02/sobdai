import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { computePackageContentFreshness, formatFreshExamSetLabel, formatFreshSummaryLabel, GENERIC_FRESHNESS_LABEL, PACKAGE_CONTENT_FRESH_DAYS } from './package-freshness.ts'
// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { getPackageContentFreshness } from './package-freshness.ts'

const NOW = new Date('2026-09-06T00:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

// Behavioral inputs per content type. updated_at is deliberately NOT an input
// anywhere: an edit timestamp has no way to reach the rule (scenario 6).
const examRow = (released_at: string | null, created_at: string | null = null) => ({ released_at, created_at })
const placementRow = (activated_at: string | null) => ({ activated_at })
const legacyRow = (released_at: string | null, created_at: string | null = null) => ({ released_at, created_at })

test('1. no recent content produces no freshness', () => {
  const result = computePackageContentFreshness(
    [examRow(daysAgo(45)), examRow(null, daysAgo(90))],
    [placementRow(daysAgo(31))],
    [legacyRow(daysAgo(60)), legacyRow(null, daysAgo(400))],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 0, newSummaryCount: 0, hasFreshContent: false })
})

test('2. recent exam only counts published sets within the window', () => {
  const result = computePackageContentFreshness(
    [examRow(daysAgo(2)), examRow(daysAgo(10)), examRow(daysAgo(40))],
    [],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 2)
  assert.equal(result.newSummaryCount, 0)
  assert.equal(result.hasFreshContent, true)
  assert.equal(formatFreshExamSetLabel(result.newExamSetCount), 'ข้อสอบใหม่ 2 ชุด')
})

test('3. recent summary only (KP placement activation)', () => {
  const result = computePackageContentFreshness(
    [],
    [placementRow(daysAgo(5)), placementRow(daysAgo(7)), placementRow(daysAgo(60))],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 0)
  assert.equal(result.newSummaryCount, 2)
  assert.equal(result.hasFreshContent, true)
  assert.equal(formatFreshSummaryLabel(result.newSummaryCount), 'สรุปใหม่ 2 เรื่อง')
})

test('4. both fresh content types are counted independently', () => {
  const result = computePackageContentFreshness(
    [examRow(daysAgo(1)), examRow(daysAgo(2)), examRow(daysAgo(3))],
    [placementRow(daysAgo(4))],
    [legacyRow(daysAgo(5))],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 3, newSummaryCount: 2, hasFreshContent: true })
})

test('5. package price/title edit alone can never create freshness', () => {
  // Package metadata fields have no parameter to land in — only content
  // availability timestamps are inputs, and all of them are old here.
  const result = computePackageContentFreshness(
    [examRow(daysAgo(200))],
    [placementRow(daysAgo(365))],
    [legacyRow(daysAgo(365))],
    NOW,
  )

  assert.equal(result.hasFreshContent, false)
})

test('6. updated_at-only edit does not badge (edit time is not an availability input)', () => {
  // An exam set published long ago and edited today: released_at is unchanged,
  // created_at is unchanged. updated_at would be "now" but is not an input.
  const result = computePackageContentFreshness(
    [examRow(daysAgo(120), daysAgo(200))],
    [],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 0)
})

test('7. old exam draft created 60d ago and published today MUST be fresh', () => {
  // The audit failure case: released_at is stamped by the publish action at
  // the availability moment, so created_at being old no longer hides it.
  const result = computePackageContentFreshness(
    [examRow(NOW.toISOString(), daysAgo(60))],
    [],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 1)
  assert.equal(result.hasFreshContent, true)
})

test('8. exam republished today MUST be fresh', () => {
  // published → unpublished → published: the transition stamps a new
  // released_at even though the row itself is old.
  const result = computePackageContentFreshness(
    [examRow(NOW.toISOString(), daysAgo(300))],
    [],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 1)
})

test('9. old summary made available today MUST be fresh', () => {
  // KP-native: placement activated today for a summary created long ago.
  const kpResult = computePackageContentFreshness(
    [],
    [placementRow(NOW.toISOString())],
    [],
    NOW,
  )
  assert.equal(kpResult.newSummaryCount, 1)

  // Legacy: published today via the 091-stamped released_at.
  const legacyResult = computePackageContentFreshness(
    [],
    [],
    [legacyRow(NOW.toISOString(), daysAgo(60))],
    NOW,
  )
  assert.equal(legacyResult.newSummaryCount, 1)
})

test('10. legacy old rows with no recent availability signal must NOT become fresh', () => {
  // Pre-091 rows carry released_at = created_at (migration 019 backfill) or
  // NULL — both resolve to the historical creation instant, which is outside
  // the window. Time passing alone never makes content fresh.
  const result = computePackageContentFreshness(
    [examRow(daysAgo(400), daysAgo(400)), examRow(null, daysAgo(400))],
    [],
    [legacyRow(daysAgo(400), daysAgo(400)), legacyRow(null, daysAgo(400))],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 0, newSummaryCount: 0, hasFreshContent: false })
})

test('the window boundary itself is inclusive', () => {
  const result = computePackageContentFreshness(
    [examRow(daysAgo(PACKAGE_CONTENT_FRESH_DAYS))],
    [],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 1)
})

test('malformed availability timestamps fail safe to "not fresh"', () => {
  const result = computePackageContentFreshness(
    [examRow('not-a-date', 'also-bad')],
    [placementRow('bad')],
    [legacyRow(null, null)],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 0, newSummaryCount: 0, hasFreshContent: false })
})

test('the generic chip label is the compact homepage variant', () => {
  assert.equal(GENERIC_FRESHNESS_LABEL, 'อัปเดตใหม่')
})

/* -------------------------------------------------------------------------- */
/* Batched read behavior (fake Supabase client — no network, no N+1)          */
/* -------------------------------------------------------------------------- */

type FakeTable = { name: string; rows: Record<string, unknown>[]; error?: { message: string } }

/**
 * Minimal thenable query builder mirroring the three batched reads:
 * from(table).select(columns).in('package_id', ids)[.eq(col, v)|.is(col, null)]
 */
function fakeClient(tables: FakeTable[]) {
  return {
    from(name: string) {
      const table = tables.find((t) => t.name === name)
      if (!table) throw new Error(`unexpected table ${name}`)
      return {
        select() {
          return {
            in(_column: string, ids: readonly string[]) {
              let rows = table.rows.filter((row) => ids.includes(row.package_id as string))
              const builder: any = {
                eq(column: string, value: unknown) {
                  rows = rows.filter((row) => row[column] === value)
                  return builder
                },
                is(column: string, value: null) {
                  assert.equal(value, null)
                  rows = rows.filter((row) => row[column] === null || row[column] === undefined)
                  return builder
                },
                then(onFulfilled: any, onRejected: any) {
                  const result = table.error
                    ? { data: null, error: table.error }
                    : { data: rows, error: null }
                  return Promise.resolve(result).then(onFulfilled, onRejected)
                },
              }
              return builder
            },
          }
        },
      }
    },
  }
}

test('batch read groups KP placements and legacy rows per package without double counting', async () => {
  const client = fakeClient([
    {
      name: 'exam_sets',
      rows: [
        { package_id: 'p1', released_at: daysAgo(1), created_at: daysAgo(60), status: 'published' },
        { package_id: 'p1', released_at: daysAgo(120), created_at: daysAgo(200), status: 'published' },
        { package_id: 'p2', released_at: daysAgo(1), created_at: daysAgo(1), status: 'published' },
      ],
    },
    {
      name: 'package_summaries',
      rows: [
        { package_id: 'p1', activated_at: daysAgo(3), status: 'active' },
        { package_id: 'p2', activated_at: daysAgo(90), status: 'active' },
      ],
    },
    {
      name: 'summaries',
      rows: [
        { package_id: 'p1', released_at: daysAgo(2), created_at: daysAgo(90), summary_code: null, is_published: true },
        // KP-native rows live behind placements; the legacy read must skip them.
        { package_id: 'p1', released_at: daysAgo(1), created_at: daysAgo(90), summary_code: 'S-000001', is_published: true },
      ],
    },
  ])

  const freshness = await getPackageContentFreshness(['p1', 'p2', 'p3'], client as any)

  assert.equal(freshness.p1.newExamSetCount, 1)
  assert.equal(freshness.p1.newSummaryCount, 2) // placement + legacy only; KP-native summary row excluded
  assert.equal(freshness.p2.newExamSetCount, 1)
  assert.equal(freshness.p2.newSummaryCount, 0)
  assert.equal(freshness.p3, undefined)
})

test('batch read fails safe to no badges when a read errors', async () => {
  const client = fakeClient([
    { name: 'exam_sets', rows: [], error: { message: 'connection refused' } },
    { name: 'package_summaries', rows: [] },
    { name: 'summaries', rows: [] },
  ])

  const freshness = await getPackageContentFreshness(['p1'], client as any)

  assert.deepEqual(freshness, {})
})

test('batch read with no package ids performs no queries', async () => {
  const freshness = await getPackageContentFreshness([], fakeClient([]) as any)

  assert.deepEqual(freshness, {})
})
