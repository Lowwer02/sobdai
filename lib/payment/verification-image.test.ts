import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { PaymentImageError, preparePaymentImage } from './verification-image'

test('image preparation verifies actual format, bounds pixels, and creates replay hashes', async () => {
  const input = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer()

  const prepared = await preparePaymentImage(input, 'image/png')
  assert.equal(prepared.width, 32)
  assert.equal(prepared.height, 24)
  assert.match(prepared.rawImageHash, /^sha256:v1:/)
  assert.match(prepared.normalizedImageHash, /^sha256:v1:/)
  assert.match(prepared.perceptualHash, /^phash:v1:/)
  assert.notEqual(prepared.rawImageHash, prepared.normalizedImageHash)
})

test('PDF and MIME/content masquerades never enter the raster analyzer', async () => {
  await assert.rejects(
    () => preparePaymentImage(Buffer.from('%PDF-1.7'), 'application/pdf'),
    (error: unknown) => error instanceof PaymentImageError && error.reasonCode === 'PDF_MANUAL_ONLY',
  )

  const jpeg = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).jpeg().toBuffer()

  await assert.rejects(
    () => preparePaymentImage(jpeg, 'image/png'),
    (error: unknown) => error instanceof PaymentImageError && error.reasonCode === 'IMAGE_FORMAT_MISMATCH',
  )
})
