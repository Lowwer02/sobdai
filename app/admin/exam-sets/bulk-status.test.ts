// Unit tests for the Bulk Publish / Bulk Archive helpers (Phase 3A).
//
// Run with:  npx jiti app/admin/exam-sets/bulk-status.test.ts
//
// Mirrors the style of ./status-filter.test.ts and ./exam-set-selection.test.ts
// (node:test + node:assert/strict, no Jest/Vitest).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_BULK_EXAM_SET_IDS,
  BULK_REASON,
  BULK_EXAM_SET_TARGETS,
  normalizeBulkIds,
  isBulkExamSetTarget,
  classifyTransitionEligibility,
  concurrentUpdateSourceStatuses,
  planBulkFeedback,
  formatAggregatedReasons,
  type BulkStatusSuccess,
  type BulkStatusItemResult,
} from './bulk-status'

// ─── constants ───────────────────────────────────────────────────────────────
test('MAX_BULK_EXAM_SET_IDS mirrors the page size of 15', () => {
  assert.equal(MAX_BULK_EXAM_SET_IDS, 15)
})

test('BULK_EXAM_SET_TARGETS only contains published and archived', () => {
  assert.deepEqual([...BULK_EXAM_SET_TARGETS], ['published', 'archived'])
})

// ─── isBulkExamSetTarget ─────────────────────────────────────────────────────
test('isBulkExamSetTarget rejects draft and arbitrary strings', () => {
  assert.equal(isBulkExamSetTarget('published'), true)
  assert.equal(isBulkExamSetTarget('archived'), true)
  assert.equal(isBulkExamSetTarget('draft'), false)
  assert.equal(isBulkExamSetTarget('Draft'), false)
  assert.equal(isBulkExamSetTarget('delete'), false)
  assert.equal(isBulkExamSetTarget(''), false)
  assert.equal(isBulkExamSetTarget(null), false)
  assert.equal(isBulkExamSetTarget(undefined), false)
  assert.equal(isBulkExamSetTarget(123), false)
  assert.equal(isBulkExamSetTarget({}), false)
  assert.equal(isBulkExamSetTarget(['published']), false)
})

// ─── normalizeBulkIds ────────────────────────────────────────────────────────
test('normalizeBulkIds: malformed non-array input is rejected', () => {
  for (const bad of [null, undefined, 'abc', 42, {}, true]) {
    const r = normalizeBulkIds(bad)
    assert.equal(r.ok, false, `expected reject for ${JSON.stringify(bad)}`)
    if (!r.ok) assert.ok(r.error.length > 0)
  }
})

test('normalizeBulkIds: empty array is rejected', () => {
  const r = normalizeBulkIds([])
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /selected/i)
})

test('normalizeBulkIds: whitespace-only ids are dropped, then rejected if all empty', () => {
  const r = normalizeBulkIds(['   ', '', ' \t '])
  assert.equal(r.ok, false)
})

test('normalizeBulkIds: ids are trimmed, de-duplicated, non-strings dropped', () => {
  const r = normalizeBulkIds([
    'a',
    '  a  ', // duplicate after trim
    'b',
    123, // non-string dropped
    null, // non-string dropped
    { id: 'c' }, // non-string dropped
    '  c  ', // 'c' after trim
    '', // empty dropped
    '   ', // whitespace dropped
  ])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.ids.length, 3)
    assert.ok(r.ids.includes('a'))
    assert.ok(r.ids.includes('b'))
    assert.ok(r.ids.includes('c'))
  }
})

test('normalizeBulkIds: exactly 15 ids accepted', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `id-${i}`)
  const r = normalizeBulkIds(ids)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.ids.length, 15)
})

test('normalizeBulkIds: 16 ids rejected for exceeding the page-scoped limit', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `id-${i}`)
  const r = normalizeBulkIds(ids)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /15/)
})

test('normalizeBulkIds: 16 ids that collapse to <= 15 after dedup are accepted', () => {
  // 16 raw entries but two are duplicates → 15 unique → ok.
  const ids = Array.from({ length: 15 }, (_, i) => `id-${i}`)
  ids.push('id-0') // duplicate of first
  const r = normalizeBulkIds(ids)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.ids.length, 15)
})

// ─── classifyTransitionEligibility ──────────────────────────────────────────
test('classifyTransitionEligibility: publish allows only draft', () => {
  assert.deepEqual(classifyTransitionEligibility('draft', 'published'), {
    eligible: true,
  })
  assert.deepEqual(classifyTransitionEligibility('published', 'published'), {
    eligible: false,
    reason: BULK_REASON.ALREADY_PUBLISHED,
  })
  assert.deepEqual(classifyTransitionEligibility('archived', 'published'), {
    eligible: false,
    reason: BULK_REASON.CANNOT_PUBLISH_FROM_ARCHIVED,
  })
})

test('classifyTransitionEligibility: archive allows draft and published', () => {
  assert.deepEqual(classifyTransitionEligibility('draft', 'archived'), {
    eligible: true,
  })
  assert.deepEqual(classifyTransitionEligibility('published', 'archived'), {
    eligible: true,
  })
  assert.deepEqual(classifyTransitionEligibility('archived', 'archived'), {
    eligible: false,
    reason: BULK_REASON.ALREADY_ARCHIVED,
  })
})

// ─── concurrentUpdateSourceStatuses ─────────────────────────────────────────
test('concurrentUpdateSourceStatuses returns the eligible source statuses', () => {
  assert.deepEqual(concurrentUpdateSourceStatuses('published'), ['draft'])
  assert.deepEqual(concurrentUpdateSourceStatuses('archived'), [
    'draft',
    'published',
  ])
})

// ─── planBulkFeedback ───────────────────────────────────────────────────────
function okResult(
  target: 'published' | 'archived',
  n: number,
  extra: { skipped?: BulkStatusItemResult[]; failed?: BulkStatusItemResult[] } = {}
): BulkStatusSuccess {
  return {
    success: true,
    target,
    succeeded: Array.from({ length: n }, (_, i) => ({
      id: `s-${i}`,
      name: `S${i}`,
    })),
    skipped: extra.skipped ?? [],
    failed: extra.failed ?? [],
  }
}

test('planBulkFeedback: full success → single success toast', () => {
  const f = planBulkFeedback(okResult('published', 8))
  assert.equal(f.primary.type, 'success')
  assert.match(f.primary.message, /เผยแพร่ 8 ชุดข้อสอบ/)
  assert.equal(f.reasons, undefined)
})

test('planBulkFeedback: full success archive → archive wording', () => {
  const f = planBulkFeedback(okResult('archived', 3))
  assert.equal(f.primary.type, 'success')
  assert.match(f.primary.message, /จัดเก็บ 3 ชุดข้อสอบ/)
  assert.equal(f.reasons, undefined)
})

test('planBulkFeedback: partial success → summary + reasons toasts', () => {
  const f = planBulkFeedback(
    okResult('published', 8, {
      skipped: [{ id: 'k1', name: 'K1', reason: BULK_REASON.ALREADY_PUBLISHED }],
      failed: [{ id: 'f1', name: 'F1', reason: BULK_REASON.NOT_READY_TO_PUBLISH }],
    })
  )
  assert.equal(f.primary.type, 'warning')
  assert.match(f.primary.message, /สำเร็จ 8/)
  assert.match(f.primary.message, /ข้าม 1/)
  assert.match(f.primary.message, /ไม่สำเร็จ 1/)
  assert.ok(f.reasons, 'expected a reasons toast')
  assert.equal(f.reasons!.type, 'warning')
  assert.ok(f.reasons!.message.length > 0)
})

test('planBulkFeedback: zero succeeded with only skipped/failed still warns', () => {
  const f = planBulkFeedback(
    okResult('published', 0, {
      skipped: [{ id: 'k1', name: 'K1', reason: BULK_REASON.ALREADY_PUBLISHED }],
    })
  )
  assert.equal(f.primary.type, 'warning')
  assert.match(f.primary.message, /สำเร็จ 0/)
  assert.match(f.primary.message, /ข้าม 1/)
  assert.ok(f.reasons)
})

// ─── formatAggregatedReasons ────────────────────────────────────────────────

test('formatAggregatedReasons: empty input → empty string', () => {
  assert.equal(formatAggregatedReasons([], []), '')
})

test('formatAggregatedReasons: groups identical reasons with counts', () => {
  // Use short controlled reasons so grouping is isolated from per-reason
  // truncation.
  const skipped: BulkStatusItemResult[] = []
  const failed: BulkStatusItemResult[] = [
    { id: '1', name: 'a', reason: 'Short reason A' },
    { id: '2', name: 'b', reason: 'Short reason A' },
    { id: '3', name: 'c', reason: 'Short reason B' },
  ]
  const out = formatAggregatedReasons(skipped, failed)
  assert.match(out, /Short reason A \(2\)/) // appears twice → count
  assert.ok(out.includes('Short reason B'))
  // No count appended to a unique reason.
  assert.ok(!out.includes('Short reason B ('))
})

test('formatAggregatedReasons: shows at most 3 unique reasons and indicates more', () => {
  // 5 unique SHORT reasons → 3 shown + 2 hidden, indicated.
  const failed: BulkStatusItemResult[] = [
    { id: '1', name: 'a', reason: 'Reason one' },
    { id: '2', name: 'b', reason: 'Reason two' },
    { id: '3', name: 'c', reason: 'Reason three' },
    { id: '4', name: 'd', reason: 'Reason four' },
    { id: '5', name: 'e', reason: 'Reason five' },
  ]
  const out = formatAggregatedReasons([], failed)
  assert.match(out, /อีก 2 สาเหตุ/) // 5 unique, 3 shown, 2 hidden
  assert.ok(out.includes('Reason one'))
})

test('formatAggregatedReasons: truncates to a concise length', () => {
  // Build many distinct reasons to force length truncation.
  const failed: BulkStatusItemResult[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    name: `n${i}`,
    reason: `Reason-number-${i}-padding-it-out-to-be-quite-long-indeed`,
  }))
  const out = formatAggregatedReasons([], failed)
  assert.ok(out.length <= 181, `got ${out.length}`)
  assert.ok(out.endsWith('…'))
})
