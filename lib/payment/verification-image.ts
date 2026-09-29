import sharp, { type Metadata } from 'sharp'
import { PAYMENT_SLIP_MAX_BYTES } from './manual'
import { exactImageHash, perceptualImageHash } from './verification-hashes'

export const PAYMENT_ANALYZER_MAX_BYTES = PAYMENT_SLIP_MAX_BYTES
export const PAYMENT_ANALYZER_MAX_PIXELS = 20_000_000
export const PAYMENT_ANALYZER_MAX_DIMENSION = 8_000
export const PAYMENT_ANALYZER_MAX_FRAMES = 1

export class PaymentImageError extends Error {
  readonly reasonCode: string

  constructor(reasonCode: string, message = reasonCode) {
    super(message)
    this.name = 'PaymentImageError'
    this.reasonCode = reasonCode
  }
}

export type PreparedPaymentImage = {
  normalizedImage: Buffer
  ocrImage: Buffer
  rgba: Uint8ClampedArray
  width: number
  height: number
  rawImageHash: string
  normalizedImageHash: string
  perceptualHash: string
}

function expectedSharpFormat(mimeType: string): 'jpeg' | 'png' | 'webp' | null {
  switch (mimeType) {
    case 'image/jpeg': return 'jpeg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    default: return null
  }
}

/**
 * Decode and canonicalize one-frame raster evidence. MIME and magic bytes are
 * not authoritative: Sharp must successfully decode the actual content.
 */
export async function preparePaymentImage(input: Buffer, mimeType: string): Promise<PreparedPaymentImage> {
  const expectedFormat = expectedSharpFormat(mimeType)
  if (!expectedFormat) throw new PaymentImageError('PDF_MANUAL_ONLY')
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new PaymentImageError('IMAGE_EMPTY')
  }
  if (input.length > PAYMENT_ANALYZER_MAX_BYTES) {
    throw new PaymentImageError('IMAGE_TOO_LARGE')
  }

  let metadata: Metadata
  try {
    metadata = await sharp(input, {
      limitInputPixels: PAYMENT_ANALYZER_MAX_PIXELS,
      sequentialRead: true,
    }).metadata()
  } catch {
    throw new PaymentImageError('IMAGE_DECODE_FAILED')
  }

  if (metadata.format !== expectedFormat) {
    throw new PaymentImageError('IMAGE_FORMAT_MISMATCH')
  }
  if (!metadata.width || !metadata.height || metadata.width > PAYMENT_ANALYZER_MAX_DIMENSION || metadata.height > PAYMENT_ANALYZER_MAX_DIMENSION) {
    throw new PaymentImageError('IMAGE_DIMENSIONS_UNSUPPORTED')
  }
  if ((metadata.pages ?? 1) > PAYMENT_ANALYZER_MAX_FRAMES || (metadata.pageHeight && metadata.pageHeight !== metadata.height)) {
    throw new PaymentImageError('IMAGE_MULTIFRAME_UNSUPPORTED')
  }

  try {
    const base = sharp(input, {
      limitInputPixels: PAYMENT_ANALYZER_MAX_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: PAYMENT_ANALYZER_MAX_DIMENSION,
        height: PAYMENT_ANALYZER_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .toColourspace('srgb')

    const { data: rawData, info } = await base.clone().raw().toBuffer({ resolveWithObject: true })
    const normalizedImage = await base.clone()
      .removeAlpha()
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer()
    const ocrImage = await base.clone()
      .flatten({ background: '#ffffff' })
      .png({ compressionLevel: 6, adaptiveFiltering: false, force: true })
      .toBuffer()

    return {
      normalizedImage,
      ocrImage,
      rgba: new Uint8ClampedArray(rawData),
      width: info.width,
      height: info.height,
      rawImageHash: exactImageHash(input),
      normalizedImageHash: exactImageHash(normalizedImage),
      perceptualHash: await perceptualImageHash(normalizedImage),
    }
  } catch {
    throw new PaymentImageError('IMAGE_PROCESSING_FAILED')
  }
}
