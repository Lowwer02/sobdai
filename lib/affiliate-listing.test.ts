import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { AFFILIATE_LISTING_MIN_ITEMS, AFFILIATE_LISTING_INSERT_AFTER, AFFILIATE_LISTING_KEYS, AFFILIATE_LISTING_DEFAULTS, AFFILIATE_LISTING_CONTENT, isAffiliateListingKey, shouldRenderListingStrip, splitForListingStrip, normalizeAffiliateListingSlot, validateAffiliateListingSettings } from './affiliate-listing.ts'

// ─── Frozen rendering rules ─────────────────────────────────────────────────

test('1. shouldRenderListingStrip: ≤6 items → no strip, ≥7 → strip', () => {
  assert.equal(AFFILIATE_LISTING_MIN_ITEMS, 7)
  assert.equal(AFFILIATE_LISTING_INSERT_AFTER, 6)
  assert.equal(shouldRenderListingStrip(0), false)
  assert.equal(shouldRenderListingStrip(1), false)
  assert.equal(shouldRenderListingStrip(6), false)
  assert.equal(shouldRenderListingStrip(7), true)
  assert.equal(shouldRenderListingStrip(9), true)
  assert.equal(shouldRenderListingStrip(100), true)
  // Defensive: garbage input never renders a strip.
  assert.equal(shouldRenderListingStrip(Number.NaN), false)
  assert.equal(shouldRenderListingStrip(-3), false)
})

test('2. splitForListingStrip cuts exactly after item #6', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] // 9 items (PAGE_SIZE)
  const { before, after } = splitForListingStrip(items)
  assert.deepEqual(before, ['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(after, ['g', 'h', 'i'])
  // Splitting is non-mutating and lossless.
  assert.equal(before.length + after.length, items.length)
})

test('3. splitForListingStrip: ≤6 items → everything stays in `before`', () => {
  const six = [1, 2, 3, 4, 5, 6]
  const { before, after } = splitForListingStrip(six)
  assert.deepEqual(before, six)
  assert.deepEqual(after, [])
  const { before: b1, after: a1 } = splitForListingStrip([1])
  assert.deepEqual(b1, [1])
  assert.deepEqual(a1, [])
})

// ─── Analytics context mapping ──────────────────────────────────────────────

test('4. each listing maps to a distinct, stable affiliate_click context', () => {
  assert.equal(AFFILIATE_LISTING_KEYS.length, 2)
  assert.deepEqual(AFFILIATE_LISTING_CONTENT.news_list, {
    contentType: 'news',
    contentSlug: 'news-list',
  })
  assert.deepEqual(AFFILIATE_LISTING_CONTENT.articles_list, {
    contentType: 'article',
    contentSlug: 'articles-list',
  })
})

test('5. isAffiliateListingKey narrows only the frozen keys', () => {
  assert.equal(isAffiliateListingKey('news_list'), true)
  assert.equal(isAffiliateListingKey('articles_list'), true)
  assert.equal(isAffiliateListingKey('homepage'), false)
  assert.equal(isAffiliateListingKey(''), false)
  assert.equal(isAffiliateListingKey(null), false)
})

// ─── Normalization (defaults are OFF; bad config never breaks a listing) ────

test('6. defaults: both slots disabled with no collection', () => {
  for (const key of AFFILIATE_LISTING_KEYS) {
    assert.equal(AFFILIATE_LISTING_DEFAULTS[key].enabled, false)
    assert.equal(AFFILIATE_LISTING_DEFAULTS[key].collection_id, null)
  }
})

test('7. normalizeAffiliateListingSlot coerces malformed values to safe defaults', () => {
  const good = '123e4567-e89b-12d3-a456-426614174000'
  assert.deepEqual(normalizeAffiliateListingSlot({ enabled: true, collection_id: good }, 'news_list'), {
    listing_key: 'news_list',
    enabled: true,
    collection_id: good,
  })
  // Non-boolean enabled → false; bad uuid → null.
  assert.deepEqual(normalizeAffiliateListingSlot({ enabled: 'yes', collection_id: 'DROP TABLE' }, 'news_list'), {
    listing_key: 'news_list',
    enabled: false,
    collection_id: null,
  })
  // Absent row / null row → disabled defaults.
  assert.deepEqual(normalizeAffiliateListingSlot(null, 'articles_list'), {
    listing_key: 'articles_list',
    enabled: false,
    collection_id: null,
  })
  // A non-empty string uuid keeps its value (trimmed).
  assert.equal(
    normalizeAffiliateListingSlot({ enabled: true, collection_id: ` ${good} ` }, 'articles_list')
      .collection_id,
    good,
  )
})

// ─── Validation (admin save payload) ────────────────────────────────────────

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

test('8. validateAffiliateListingSettings accepts both slots; enabled needs no collection (M1 semantics)', () => {
  const res = validateAffiliateListingSettings({
    news_list: { enabled: true, collection_id: UUID_A },
    articles_list: { enabled: false, collection_id: '' },
  })
  assert.equal(res.ok, true)
  assert.deepEqual(res.clean, {
    news_list: { enabled: true, collection_id: UUID_A },
    articles_list: { enabled: false, collection_id: null },
  })
  // Enabled with no collection is saveable — the strip renders nothing (the
  // same hide-when-empty contract as the M1 rail).
  const res2 = validateAffiliateListingSettings({
    news_list: { enabled: true, collection_id: null },
    articles_list: { enabled: true, collection_id: UUID_B },
  })
  assert.equal(res2.ok, true)
  assert.equal(res2.clean!.news_list.collection_id, null)
})

test('9. validateAffiliateListingSettings rejects payloads missing either slot', () => {
  // Missing articles_list entirely.
  const partial = validateAffiliateListingSettings({
    news_list: { enabled: true, collection_id: UUID_A },
  })
  assert.equal(partial.ok, false)
  assert.match(String(partial.errors.articles_list), /ครบทั้งสอง/)

  // Non-object payload.
  assert.equal(validateAffiliateListingSettings(null).ok, false)
  assert.equal(validateAffiliateListingSettings('x').ok, false)
})

test('10. validateAffiliateListingSettings coerces each slot independently', () => {
  // A malformed uuid in ONE slot must not block the other.
  const res = validateAffiliateListingSettings({
    news_list: { enabled: true, collection_id: 'not-a-uuid' },
    articles_list: { enabled: true, collection_id: UUID_B },
  })
  assert.equal(res.ok, true)
  assert.equal(res.clean!.news_list.collection_id, null)
  assert.equal(res.clean!.articles_list.collection_id, UUID_B)
})
