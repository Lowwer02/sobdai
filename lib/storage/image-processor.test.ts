import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { MAX_IMAGE_INPUT_BYTES, MAX_IMAGE_INPUT_PIXELS, MAX_IMAGE_OUTPUT_WIDTH, WEBP_OUTPUT_QUALITY, validateAndProcessImage } from './image-processor.ts'

test('validateAndProcessImage accepts and converts JPEG to WebP', async () => {
  const jpegBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer()

  const result = await validateAndProcessImage(jpegBuffer)

  assert.equal(result.format, 'webp')
  assert.equal(result.contentType, 'image/webp')
  assert.equal(result.width, 800)
  assert.equal(result.height, 600)
  assert.ok(result.bytes > 0)
  assert.equal(result.bytes, result.buffer.byteLength)

  const metadata = await sharp(result.buffer).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, 800)
  assert.equal(metadata.height, 600)
})

test('validateAndProcessImage accepts and converts PNG to WebP', async () => {
  const pngBuffer = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 0.8 },
    },
  })
    .png()
    .toBuffer()

  const result = await validateAndProcessImage(pngBuffer)

  assert.equal(result.format, 'webp')
  assert.equal(result.contentType, 'image/webp')
  assert.equal(result.width, 400)
  assert.equal(result.height, 300)
})

test('validateAndProcessImage accepts and optimizes existing WebP', async () => {
  const webpBuffer = await sharp({
    create: {
      width: 600,
      height: 400,
      channels: 3,
      background: { r: 50, g: 200, b: 50 },
    },
  })
    .webp({ quality: 90 })
    .toBuffer()

  const result = await validateAndProcessImage(webpBuffer)

  assert.equal(result.format, 'webp')
  assert.equal(result.width, 600)
  assert.equal(result.height, 400)
})

test('validateAndProcessImage downscales oversized dimensions to max 1200px preserving aspect ratio', async () => {
  const largeJpeg = await sharp({
    create: {
      width: 2400,
      height: 1200,
      channels: 3,
      background: { r: 100, g: 100, b: 100 },
    },
  })
    .jpeg()
    .toBuffer()

  const result = await validateAndProcessImage(largeJpeg)

  assert.equal(result.width, MAX_IMAGE_OUTPUT_WIDTH) // 1200
  assert.equal(result.height, 600) // Preserved 2:1 aspect ratio
  assert.equal(result.format, 'webp')
})

test('validateAndProcessImage does not upscale smaller images', async () => {
  const smallBuffer = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: 20, g: 40, b: 80 },
    },
  })
    .png()
    .toBuffer()

  const result = await validateAndProcessImage(smallBuffer)

  assert.equal(result.width, 320)
  assert.equal(result.height, 240)
})

test('validateAndProcessImage rejects GIF format', async () => {
  const gifBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .gif()
    .toBuffer()

  await assert.rejects(
    async () => validateAndProcessImage(gifBuffer),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'UNSUPPORTED_FORMAT')
      assert.match(err.message, /Unsupported image format: "gif"/)
      return true
    },
  )
})

test('validateAndProcessImage rejects SVG, plain text, and arbitrary binary files', async () => {
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
  await assert.rejects(
    async () => validateAndProcessImage(svgBuffer),
    (err: Error & { code?: string }) => {
      assert.ok(err.code === 'UNSUPPORTED_FORMAT' || err.code === 'CORRUPTED_IMAGE')
      return true
    },
  )

  const textBuffer = Buffer.from('console.log("malicious code")')
  await assert.rejects(
    async () => validateAndProcessImage(textBuffer),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'CORRUPTED_IMAGE')
      return true
    },
  )

  const emptyBuffer = Buffer.alloc(0)
  await assert.rejects(
    async () => validateAndProcessImage(emptyBuffer),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'EMPTY_BUFFER')
      return true
    },
  )
})

test('validateAndProcessImage rejects oversized inputs exceeding 4 MiB limit', async () => {
  assert.equal(MAX_IMAGE_INPUT_BYTES, 4 * 1024 * 1024)
  const oversizedBuffer = Buffer.alloc(MAX_IMAGE_INPUT_BYTES + 1024)

  await assert.rejects(
    async () => validateAndProcessImage(oversizedBuffer),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'OVERSIZED_INPUT')
      assert.match(err.message, /exceeds maximum allowed size/)
      return true
    },
  )
})

test('validateAndProcessImage enforces 50 Megapixel ceiling on decoded images', async () => {
  assert.equal(MAX_IMAGE_INPUT_PIXELS, 50_000_000)

  // 8000 x 7000 = 56,000,000 pixels (> 50 MP ceiling)
  const hugeBuffer = await sharp({
    create: {
      width: 8000,
      height: 7000,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer()

  await assert.rejects(
    async () => validateAndProcessImage(hugeBuffer),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'EXCESSIVE_PIXELS')
      assert.match(err.message, /exceed.*(pixel limit|megapixels)/i)
      return true
    },
  )
})
