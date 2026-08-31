import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { processAndUploadImage } from './image-upload.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { uploadImageToR2 } from './r2-uploader.ts'
import type { R2Config } from './r2-config'

const mockConfig: R2Config = {
  accountId: 'test-account-12345',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucketName: 'sobdai-assets-test',
  publicBaseUrl: 'https://assets.sobdai.com',
}

test('uploadImageToR2 sends PutObjectCommand with immutable cache headers and returns structured metadata', async () => {
  const sentCommands: unknown[] = []

  const mockS3Client = {
    async send(command: unknown) {
      sentCommands.push(command)
      return {}
    },
  } as unknown as S3Client

  const dummyProcessed = {
    buffer: Buffer.from('fake-webp-bytes'),
    width: 800,
    height: 600,
    bytes: 15,
    format: 'webp' as const,
    contentType: 'image/webp' as const,
  }

  const result = await uploadImageToR2(dummyProcessed, 'news/2026-08/asset-1.webp', {
    config: mockConfig,
    s3Client: mockS3Client,
  })

  assert.equal(sentCommands.length, 1)
  const cmd = sentCommands[0] as PutObjectCommand
  assert.equal(cmd.input.Bucket, 'sobdai-assets-test')
  assert.equal(cmd.input.Key, 'news/2026-08/asset-1.webp')
  assert.equal(cmd.input.ContentType, 'image/webp')
  assert.equal(cmd.input.CacheControl, 'public, max-age=31536000, immutable')
  assert.deepEqual(cmd.input.Body, Buffer.from('fake-webp-bytes'))

  // Return structure checks
  assert.equal(result.key, 'news/2026-08/asset-1.webp')
  assert.equal(result.url, 'https://assets.sobdai.com/news/2026-08/asset-1.webp')
  assert.equal(result.width, 800)
  assert.equal(result.height, 600)
  assert.equal(result.bytes, 15)
  assert.equal(result.contentType, 'image/webp')

  // Verify internal S3 endpoint is NEVER exposed
  assert.ok(!result.url.includes('r2.cloudflarestorage.com'))
})

test('processAndUploadImage end-to-end runs pipeline and uploads to R2', async () => {
  const sentCommands: unknown[] = []

  const mockS3Client = {
    async send(command: unknown) {
      sentCommands.push(command)
      return {}
    },
  } as unknown as S3Client

  // Create real 1600x1200 JPEG
  const rawJpeg = await sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 120, g: 180, b: 240 },
    },
  })
    .jpeg()
    .toBuffer()

  const result = await processAndUploadImage(
    {
      file: rawJpeg,
      scope: 'articles',
      entityId: 'e2b5c0d1-1234-4567-89ab-cdef01234567',
    },
    {
      config: mockConfig,
      s3Client: mockS3Client,
    },
  )

  assert.equal(sentCommands.length, 1)
  const cmd = sentCommands[0] as PutObjectCommand
  assert.equal(cmd.input.Bucket, 'sobdai-assets-test')
  assert.match(cmd.input.Key as string, /^articles\/e2b5c0d1-1234-4567-89ab-cdef01234567\/[0-9a-f-]+\.webp$/)
  assert.equal(cmd.input.ContentType, 'image/webp')
  assert.equal(cmd.input.CacheControl, 'public, max-age=31536000, immutable')

  // Downscaled from 1600 to 1200 width, aspect ratio 4:3 -> 1200x900
  assert.equal(result.width, 1200)
  assert.equal(result.height, 900)
  assert.equal(result.contentType, 'image/webp')
  assert.ok(result.url.startsWith('https://assets.sobdai.com/articles/e2b5c0d1-1234-4567-89ab-cdef01234567/'))
  assert.ok(result.url.endsWith('.webp'))
})

test('processAndUploadImage rejects file exceeding 4 MiB before R2 write', async () => {
  const sentCommands: unknown[] = []

  const mockS3Client = {
    async send(command: unknown) {
      sentCommands.push(command)
      return {}
    },
  } as unknown as S3Client

  const oversizedBlob = {
    size: 4 * 1024 * 1024 + 100,
    async arrayBuffer() {
      return new ArrayBuffer(4 * 1024 * 1024 + 100)
    },
  } as unknown as Blob

  await assert.rejects(
    async () =>
      processAndUploadImage(
        {
          file: oversizedBlob,
          scope: 'news',
        },
        { config: mockConfig, s3Client: mockS3Client },
      ),
    /exceeds maximum allowed size/,
  )
  assert.equal(sentCommands.length, 0, 'No R2 write should occur on oversized input')
})

test('processAndUploadImage aborts without R2 write when scope or format is invalid', async () => {
  const sentCommands: unknown[] = []

  const mockS3Client = {
    async send(command: unknown) {
      sentCommands.push(command)
      return {}
    },
  } as unknown as S3Client

  // 1. Invalid scope
  await assert.rejects(
    async () =>
      processAndUploadImage(
        {
          file: Buffer.from('test'),
          scope: 'invalid-scope',
        },
        { config: mockConfig, s3Client: mockS3Client },
      ),
    /Invalid asset scope/,
  )
  assert.equal(sentCommands.length, 0, 'No R2 write should occur on invalid scope')

  // 2. Unsupported format (text file)
  await assert.rejects(
    async () =>
      processAndUploadImage(
        {
          file: Buffer.from('plain text file content'),
          scope: 'news',
        },
        { config: mockConfig, s3Client: mockS3Client },
      ),
    /Failed to decode image/,
  )
  assert.equal(sentCommands.length, 0, 'No R2 write should occur on invalid image')
})

test('processAndUploadImage propagates S3 upload failure cleanly without returning fake URL', async () => {
  const failingS3Client = {
    async send() {
      throw new Error('R2 Network Timeout: Connection refused')
    },
  } as unknown as S3Client

  const validJpeg = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .jpeg()
    .toBuffer()

  await assert.rejects(
    async () =>
      processAndUploadImage(
        {
          file: validJpeg,
          scope: 'news',
        },
        { config: mockConfig, s3Client: failingS3Client },
      ),
    /R2 Network Timeout: Connection refused/,
  )
})
