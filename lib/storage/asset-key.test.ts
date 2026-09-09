import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import * as assetKey from './asset-key.ts'

const {
  ALLOWED_ASSET_PURPOSES,
  generateAssetKey,
  isValidAssetPurpose,
  isValidAssetScope,
  isValidEntityUuid,
} = assetKey

test('isValidAssetScope accepts only news and articles', () => {
  assert.equal(isValidAssetScope('news'), true)
  assert.equal(isValidAssetScope('articles'), true)

  assert.equal(isValidAssetScope(''), false)
  assert.equal(isValidAssetScope('users'), false)
  assert.equal(isValidAssetScope('admin'), false)
  assert.equal(isValidAssetScope('../news'), false)
  assert.equal(isValidAssetScope(null), false)
  assert.equal(isValidAssetScope(undefined), false)
  assert.equal(isValidAssetScope(123), false)
})

test('isValidAssetPurpose accepts only inline and cover', () => {
  assert.deepEqual(ALLOWED_ASSET_PURPOSES, ['inline', 'cover'])
  assert.equal(isValidAssetPurpose('inline'), true)
  assert.equal(isValidAssetPurpose('cover'), true)

  assert.equal(isValidAssetPurpose(''), false)
  assert.equal(isValidAssetPurpose('avatar'), false)
  assert.equal(isValidAssetPurpose('../cover'), false)
  assert.equal(isValidAssetPurpose(null), false)
  assert.equal(isValidAssetPurpose(undefined), false)
})

test('isValidEntityUuid validates canonical UUID v4 shapes', () => {
  assert.equal(isValidEntityUuid('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'), true)
  assert.equal(isValidEntityUuid('A1B2C3D4-E5F6-7A8B-9C0D-1E2F3A4B5C6D'), true)

  assert.equal(isValidEntityUuid('not-a-uuid'), false)
  assert.equal(isValidEntityUuid('../path-traversal'), false)
  assert.equal(isValidEntityUuid('12345'), false)
  assert.equal(isValidEntityUuid(''), false)
  assert.equal(isValidEntityUuid(null), false)
})

test('generateAssetKey produces safe partitioned key in create flow (no entityId)', () => {
  const fixedDate = new Date('2026-08-30T12:00:00Z')
  const key = generateAssetKey({
    scope: 'news',
    now: fixedDate,
  })

  // Format: news/2026-08/<uuid>.webp
  const parts = key.split('/')
  assert.equal(parts.length, 3)
  assert.equal(parts[0], 'news')
  assert.equal(parts[1], '2026-08')
  assert.match(parts[2], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/)
  assert.ok(key.endsWith('.webp'))
})

test('generateAssetKey produces stable entity partition in edit flow (with valid entityId)', () => {
  const entityId = '12345678-1234-1234-1234-123456789abc'
  const key = generateAssetKey({
    scope: 'articles',
    entityId,
  })

  const parts = key.split('/')
  assert.equal(parts.length, 3)
  assert.equal(parts[0], 'articles')
  assert.equal(parts[1], entityId)
  assert.match(parts[2], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/)
  assert.ok(key.endsWith('.webp'))
})

test('generateAssetKey keeps omitted purpose backward compatible with inline keys', () => {
  const key = generateAssetKey({
    scope: 'articles',
    entityId: '12345678-1234-1234-1234-123456789abc',
  })

  assert.match(key, /^articles\/12345678-1234-1234-1234-123456789abc\/[0-9a-f-]+\.webp$/)
  assert.doesNotMatch(key, /\/cover\//)
})

test('generateAssetKey produces distinguishable cover key for date and entity partitions', () => {
  const dateKey = generateAssetKey({
    scope: 'news',
    purpose: 'cover',
    now: new Date('2026-09-09T10:00:00Z'),
  })
  const entityKey = generateAssetKey({
    scope: 'articles',
    purpose: 'cover',
    entityId: '12345678-1234-1234-1234-123456789abc',
  })

  assert.match(dateKey, /^news\/2026-09\/cover\/[0-9a-f-]+\.webp$/)
  assert.match(entityKey, /^articles\/12345678-1234-1234-1234-123456789abc\/cover\/[0-9a-f-]+\.webp$/)
})

test('generateAssetKey produces unique collision-free keys on repeated calls', () => {
  const key1 = generateAssetKey({ scope: 'news' })
  const key2 = generateAssetKey({ scope: 'news' })

  assert.notEqual(key1, key2)
})

test('generateAssetKey rejects invalid scopes fail-closed', () => {
  assert.throws(
    () => generateAssetKey({ scope: 'invalid_scope' }),
    /Invalid asset scope/,
  )

  assert.throws(
    () => generateAssetKey({ scope: '../../../etc/passwd' }),
    /Invalid asset scope/,
  )

  assert.throws(
    () => generateAssetKey({ scope: 'avatars', purpose: 'cover' }),
    /Invalid asset scope/,
  )
})

test('generateAssetKey rejects invalid purposes fail-closed', () => {
  assert.throws(
    () => generateAssetKey({ scope: 'news', purpose: 'avatar' }),
    /Invalid asset purpose/,
  )

  assert.throws(
    () => generateAssetKey({ scope: 'articles', purpose: '../../cover' }),
    /Invalid asset purpose/,
  )
})

test('generateAssetKey rejects non-UUID entity IDs fail-closed', () => {
  assert.throws(
    () => generateAssetKey({ scope: 'news', entityId: 'my-custom-thai-slug-ข่าวใหม่' }),
    /Invalid entity ID format/,
  )

  assert.throws(
    () => generateAssetKey({ scope: 'articles', entityId: '../../malicious' }),
    /Invalid entity ID format/,
  )
})
