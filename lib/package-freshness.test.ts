import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { computePackageContentFreshness, formatFreshExamSetLabel, formatFreshSummaryLabel, GENERIC_FRESHNESS_LABEL, PACKAGE_CONTENT_FRESH_DAYS } from './package-freshness.ts'

const NOW = new Date('2026-09-06T00:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const ts = (iso: string | null, created: string | null = null) => ({ released_at: iso, created_at: created })

test('no recent content produces no freshness UI data', () => {
  const result = computePackageContentFreshness(
    [ts(daysAgo(45)), ts(null, daysAgo(90))],
    [ts(daysAgo(31)), ts(null, daysAgo(400))],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 0, newSummaryCount: 0, hasFreshContent: false })
})

test('recent exam sets only count published sets within the window', () => {
  const result = computePackageContentFreshness(
    [ts(daysAgo(2)), ts(daysAgo(10)), ts(daysAgo(40))],
    [],
    NOW,
  )

  assert.equal(result.newExamSetCount, 2)
  assert.equal(result.newSummaryCount, 0)
  assert.equal(result.hasFreshContent, true)
  assert.equal(formatFreshExamSetLabel(result.newExamSetCount), 'ข้อสอบใหม่ 2 ชุด')
})

test('recent summaries only fall back to created_at when released_at is null', () => {
  const result = computePackageContentFreshness(
    [],
    [ts(daysAgo(5)), ts(null, daysAgo(7)), ts(null, daysAgo(60))],
    NOW,
  )

  assert.equal(result.newExamSetCount, 0)
  assert.equal(result.newSummaryCount, 2)
  assert.equal(result.hasFreshContent, true)
  assert.equal(formatFreshSummaryLabel(result.newSummaryCount), 'สรุปใหม่ 2 เรื่อง')
})

test('both fresh content types are counted independently', () => {
  const result = computePackageContentFreshness(
    [ts(daysAgo(1)), ts(daysAgo(2)), ts(daysAgo(3))],
    [ts(daysAgo(4)), ts(daysAgo(5))],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 3, newSummaryCount: 2, hasFreshContent: true })
})

test('a package price/title edit cannot create freshness: package recency is never an input', () => {
  // Only old content timestamps are provided — a package updated_at value has
  // no parameter to land in, so editing the package alone can never badge it.
  const result = computePackageContentFreshness(
    [ts(daysAgo(200))],
    [ts(daysAgo(365))],
    NOW,
  )

  assert.equal(result.hasFreshContent, false)
})

test('content edits do not count as new content (updated_at is not an input)', () => {
  // released_at/created_at are the only availability signals; a recently
  // edited but originally old set stays old.
  const result = computePackageContentFreshness([ts(daysAgo(120), daysAgo(200))], [], NOW)

  assert.equal(result.newExamSetCount, 0)
})

test('the window boundary itself is inclusive', () => {
  const result = computePackageContentFreshness([ts(daysAgo(PACKAGE_CONTENT_FRESH_DAYS))], [], NOW)

  assert.equal(result.newExamSetCount, 1)
})

test('malformed timestamps fail safe to "not fresh"', () => {
  const result = computePackageContentFreshness(
    [ts('not-a-date'), ts(null, null)],
    [ts('also-bad')],
    NOW,
  )

  assert.deepEqual(result, { newExamSetCount: 0, newSummaryCount: 0, hasFreshContent: false })
})

test('the generic chip label is the compact homepage variant', () => {
  assert.equal(GENERIC_FRESHNESS_LABEL, 'อัปเดตใหม่')
})
