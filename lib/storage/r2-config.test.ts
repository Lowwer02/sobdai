import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { buildPublicAssetUrl, createR2Client, getR2Config, validatePublicBaseUrl } from './r2-config.ts'

test('validatePublicBaseUrl accepts valid https production URLs and strips trailing slash', () => {
  assert.equal(validatePublicBaseUrl('https://assets.sobdai.com/'), 'https://assets.sobdai.com')
  assert.equal(validatePublicBaseUrl('https://cdn.sobdai.com/subpath/'), 'https://cdn.sobdai.com/subpath')
})

test('validatePublicBaseUrl permits http only for localhost or 127.0.0.1', () => {
  assert.equal(validatePublicBaseUrl('http://localhost:3000/'), 'http://localhost:3000')
  assert.equal(validatePublicBaseUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
})

test('validatePublicBaseUrl rejects malformed URLs and non-https production protocols', () => {
  assert.throws(() => validatePublicBaseUrl('not-a-url'), /Invalid R2_PUBLIC_BASE_URL/)
  assert.throws(() => validatePublicBaseUrl('http://assets.sobdai.com'), /Must use "https:"/)
  assert.throws(() => validatePublicBaseUrl('ftp://assets.sobdai.com'), /Must use "https:"/)
})

test('validatePublicBaseUrl rejects internal R2 storage endpoints', () => {
  assert.throws(
    () => validatePublicBaseUrl('https://acc123.r2.cloudflarestorage.com'),
    /Internal R2 storage endpoint/,
  )
})

test('getR2Config resolves valid configuration from complete env', () => {
  const env = {
    R2_ACCOUNT_ID: 'cf-acc-12345',
    R2_ACCESS_KEY_ID: 'cf-key-id',
    R2_SECRET_ACCESS_KEY: 'cf-secret-key',
    R2_BUCKET_NAME: 'sobdai-assets',
    R2_PUBLIC_BASE_URL: 'https://assets.sobdai.com/',
  }

  const config = getR2Config(env)

  assert.equal(config.accountId, 'cf-acc-12345')
  assert.equal(config.accessKeyId, 'cf-key-id')
  assert.equal(config.secretAccessKey, 'cf-secret-key')
  assert.equal(config.bucketName, 'sobdai-assets')
  assert.equal(config.publicBaseUrl, 'https://assets.sobdai.com')
})

test('getR2Config fails closed when any required variable is missing', () => {
  assert.throws(
    () => getR2Config({}),
    (err: Error) => {
      assert.match(err.message, /Missing required R2 environment variables/)
      assert.match(err.message, /R2_ACCOUNT_ID/)
      assert.match(err.message, /R2_ACCESS_KEY_ID/)
      assert.match(err.message, /R2_SECRET_ACCESS_KEY/)
      assert.match(err.message, /R2_BUCKET_NAME/)
      assert.match(err.message, /R2_PUBLIC_BASE_URL/)
      return true
    },
  )
})

test('buildPublicAssetUrl generates clean public CDN URL without double slashes', () => {
  const url1 = buildPublicAssetUrl('https://assets.sobdai.com', 'news/2026-08/sample.webp')
  assert.equal(url1, 'https://assets.sobdai.com/news/2026-08/sample.webp')

  const url2 = buildPublicAssetUrl('https://assets.sobdai.com/', '/articles/2026-08/sample.webp')
  assert.equal(url2, 'https://assets.sobdai.com/articles/2026-08/sample.webp')
})

test('createR2Client creates client targeting R2 endpoint with region auto', async () => {
  const config = {
    accountId: 'test-account-id',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucketName: 'test-bucket',
    publicBaseUrl: 'https://assets.sobdai.com',
  }

  const client = createR2Client(config)
  assert.ok(client)
  const region = await client.config.region()
  assert.equal(region, 'auto')
})
