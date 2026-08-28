import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { cleanAffiliateUrl, cleanAffiliateTags, coerceMerchant, coerceAffiliateContentFields, validateAffiliateProductDraft, validateAffiliateProductForPublish, validateAffiliateCollectionDraft, validateAffiliateCollectionForPublish, AFFILIATE_MAX_RAIL_PRODUCTS } from './affiliate.ts'

const validPublishProduct = {
  name: 'ฟิสิกส์ ม.ปลาย พร้อมเฉลย',
  merchant: 'shopee',
  affiliate_url: 'https://shopee.co.th/product/123?af_siteid=sobdai&pid=affiliate',
  image_url: 'https://down-th.img.susercontent.com/file/abc.webp',
  image_alt: 'ปกหนังสือฟิสิกส์',
  short_description: 'เล่มเบา อ่านเข้าใจง่าย',
  tags: ['หนังสือเรียน', 'ฟิสิกส์'],
}

// ─── cleanAffiliateUrl: HTTPS-only outbound-link safety ─────────────────────

test('1. cleanAffiliateUrl accepts https URLs and preserves tracking params byte-for-byte', () => {
  const url = 'https://shopee.co.th/product/123?af_siteid=sobdai'
  assert.equal(cleanAffiliateUrl(`  ${url}  `), url)
  assert.equal(cleanAffiliateUrl('https://EXAMPLE.com/path'), 'https://EXAMPLE.com/path')
})

test('2. cleanAffiliateUrl rejects unsafe schemes', () => {
  assert.equal(cleanAffiliateUrl('http://shopee.co.th/x'), null)
  assert.equal(cleanAffiliateUrl('javascript:alert(1)'), null)
  assert.equal(cleanAffiliateUrl('data:text/html,hi'), null)
  assert.equal(cleanAffiliateUrl('ftp://example.com'), null)
  assert.equal(cleanAffiliateUrl('//example.com/x'), null)
})

test('3. cleanAffiliateUrl rejects malformed, credentialed, dotless, and over-length input', () => {
  assert.equal(cleanAffiliateUrl('not a url'), null)
  assert.equal(cleanAffiliateUrl('https://user:pass@example.com'), null)
  assert.equal(cleanAffiliateUrl('https://localhost/x'), null)
  assert.equal(cleanAffiliateUrl('https://intranet/x'), null)
  assert.equal(cleanAffiliateUrl(`https://example.com/${'a'.repeat(2100)}`), null)
  assert.equal(cleanAffiliateUrl(''), null)
  assert.equal(cleanAffiliateUrl(null), null)
  assert.equal(cleanAffiliateUrl(42), null)
})

test('4. cleanAffiliateUrl strips control characters before parsing', () => {
  // eslint-disable-next-line no-control-regex
  assert.equal(cleanAffiliateUrl('https://example.com/a\u0000b'), 'https://example.com/ab')
})

// ─── field coercion ─────────────────────────────────────────────────────────

test('5. coerceMerchant defaults to shopee and normalizes to a lowercase slug', () => {
  assert.equal(coerceMerchant(undefined), 'shopee')
  assert.equal(coerceMerchant(''), 'shopee')
  assert.equal(coerceMerchant('  Shopee '), 'shopee')
  assert.equal(coerceMerchant('TikTok Shop'), 'tiktok-shop')
})

test('6. cleanAffiliateTags parses arrays/strings, trims, dedupes, and caps', () => {
  assert.deepEqual(cleanAffiliateTags('หนังสือ, สเตชันเนอรี่ ,หนังสือ'), ['หนังสือ', 'สเตชันเนอรี่'])
  assert.deepEqual(cleanAffiliateTags(['a', 'b', 'b']), ['a', 'b'])
  assert.deepEqual(cleanAffiliateTags(null), [])
  assert.equal(cleanAffiliateTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 8)
})

test('7. coerceAffiliateContentFields coerces strictly (boolean + uuid-or-null)', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000'
  assert.deepEqual(coerceAffiliateContentFields({ affiliate_enabled: true, affiliate_collection_id: uuid }), {
    affiliate_enabled: true,
    affiliate_collection_id: uuid,
  })
  // Truthy-but-not-true and malformed ids must never reach the FK.
  assert.deepEqual(coerceAffiliateContentFields({ affiliate_enabled: 'yes', affiliate_collection_id: 'not-a-uuid' }), {
    affiliate_enabled: false,
    affiliate_collection_id: null,
  })
  assert.deepEqual(coerceAffiliateContentFields({}), { affiliate_enabled: false, affiliate_collection_id: null })
})

// ─── product validation tiers ───────────────────────────────────────────────

test('8. Product draft is forgiving: only the name is required', () => {
  const res = validateAffiliateProductDraft({ name: 'โน้ตบุ๊คสำหรับนักเรียน' })
  assert.equal(res.ok, true)
  assert.equal(res.clean?.merchant, 'shopee')
})

test('9. Product draft rejects a present-but-unsafe affiliate URL', () => {
  const res = validateAffiliateProductDraft({ name: 'x', affiliate_url: 'http://shopee.co.th/i' })
  assert.equal(res.ok, false)
  assert.match(res.errors.affiliate_url, /https/)
  const imgRes = validateAffiliateProductDraft({ name: 'x', image_url: 'javascript:alert(1)' })
  assert.equal(imgRes.ok, false)
  assert.ok(imgRes.errors.image_url)
})

test('10. Product publish gate requires name + https affiliate_url + https image', () => {
  assert.equal(validateAffiliateProductForPublish(validPublishProduct).ok, true)

  const noUrl = validateAffiliateProductForPublish({ ...validPublishProduct, affiliate_url: '' })
  assert.equal(noUrl.ok, false)
  assert.ok(noUrl.errors.affiliate_url)

  const badUrl = validateAffiliateProductForPublish({ ...validPublishProduct, affiliate_url: 'javascript:alert(1)' })
  assert.equal(badUrl.ok, false)
  assert.ok(badUrl.errors.affiliate_url)

  const noImage = validateAffiliateProductForPublish({ ...validPublishProduct, image_url: null })
  assert.equal(noImage.ok, false)
  assert.ok(noImage.errors.image_url)

  const noName = validateAffiliateProductForPublish({ ...validPublishProduct, name: '' })
  assert.equal(noName.ok, false)
  assert.ok(noName.errors.name)
})

// ─── collection validation tiers ────────────────────────────────────────────

test('11. Collection draft requires only a name; publish additionally requires >=1 item', () => {
  assert.equal(validateAffiliateCollectionDraft({ name: 'อุปกรณ์เตรียมสอบ ก.พ.' }).ok, true)
  assert.equal(validateAffiliateCollectionDraft({ name: '' }).ok, false)

  const empty = validateAffiliateCollectionForPublish({ name: 'อุปกรณ์เตรียมสอบ ก.พ.' }, [])
  assert.equal(empty.ok, false)
  assert.ok(empty.errors.items)

  const withItem = validateAffiliateCollectionForPublish(
    { name: 'อุปกรณ์เตรียมสอบ ก.พ.' },
    ['123e4567-e89b-42d3-a456-426614174000'],
  )
  assert.equal(withItem.ok, true)
})

// ─── rail bound ─────────────────────────────────────────────────────────────

test('12. Public rail is hard-capped at 5 products (spec: 3–5 maximum)', () => {
  assert.equal(AFFILIATE_MAX_RAIL_PRODUCTS, 5)
})
