import sharp, { type Metadata } from 'sharp'

export const MAX_IMAGE_INPUT_BYTES = 4 * 1024 * 1024 // 4 MiB
export const MAX_IMAGE_INPUT_PIXELS = 50_000_000 // 50 Megapixels ceiling
export const MAX_IMAGE_OUTPUT_WIDTH = 1200
export const WEBP_OUTPUT_QUALITY = 78

export const ACCEPTED_INPUT_FORMATS = ['jpeg', 'jpg', 'png', 'webp'] as const
export type AcceptedInputFormat = (typeof ACCEPTED_INPUT_FORMATS)[number]

export interface ProcessedImageResult {
  buffer: Buffer
  width: number
  height: number
  bytes: number
  format: 'webp'
  contentType: 'image/webp'
}

export type ImageProcessingErrorType =
  | 'EMPTY_BUFFER'
  | 'OVERSIZED_INPUT'
  | 'EXCESSIVE_PIXELS'
  | 'UNSUPPORTED_FORMAT'
  | 'CORRUPTED_IMAGE'
  | 'PROCESSING_FAILED'

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingErrorType

  constructor(code: ImageProcessingErrorType, message: string) {
    super(message)
    this.name = 'ImageProcessingError'
    this.code = code
  }
}

/**
 * Validates and processes an uploaded image using Sharp.
 *
 * Security & Processing Pipeline:
 * 1. Checks buffer byte size against conservative input limit (4 MiB).
 * 2. Enforces explicit 50 MP input pixel limit (prevents decompression bomb / memory exhaustion).
 * 3. Decodes image metadata to verify genuine JPEG/PNG/WebP format.
 *    (Rejects SVG, GIF, PDF, HTML, shell scripts, and corrupt binaries).
 * 4. Checks pixel count (width * height <= 50 MP) before executing heavy image operations.
 * 5. Applies auto-orientation from EXIF metadata (.rotate()).
 * 6. Resizes to max width 1200px while strictly preserving aspect ratio and never upscaling.
 * 7. Strips extraneous EXIF / geolocation / camera metadata.
 * 8. Converts to optimized WebP at quality 78.
 * 9. Returns deterministic dimensions and byte size.
 */
export async function validateAndProcessImage(
  input: Buffer | Uint8Array | ArrayBuffer,
): Promise<ProcessedImageResult> {
  const buffer: Buffer = Buffer.isBuffer(input)
    ? input
    : input instanceof ArrayBuffer
      ? Buffer.from(input)
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength)

  if (!buffer || buffer.byteLength === 0) {
    throw new ImageProcessingError('EMPTY_BUFFER', 'Image buffer is empty.')
  }

  if (buffer.byteLength > MAX_IMAGE_INPUT_BYTES) {
    throw new ImageProcessingError(
      'OVERSIZED_INPUT',
      `Image exceeds maximum allowed size of ${MAX_IMAGE_INPUT_BYTES / (1024 * 1024)}MB (received ${Math.round(buffer.byteLength / 1024)}KB).`,
    )
  }

  let metadata: Metadata
  try {
    const probe = sharp(buffer, { limitInputPixels: MAX_IMAGE_INPUT_PIXELS })
    metadata = await probe.metadata()
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : ''
    if (errMessage.toLowerCase().includes('pixel limit') || errMessage.toLowerCase().includes('exceeds')) {
      throw new ImageProcessingError(
        'EXCESSIVE_PIXELS',
        `Image exceeds maximum decoded pixel limit of ${MAX_IMAGE_INPUT_PIXELS / 1_000_000} megapixels.`,
      )
    }
    throw new ImageProcessingError(
      'CORRUPTED_IMAGE',
      'Failed to decode image. The file is either corrupted or not a valid image format.',
    )
  }

  const detectedFormat = metadata.format?.toLowerCase()

  if (!detectedFormat || !ACCEPTED_INPUT_FORMATS.includes(detectedFormat as AcceptedInputFormat)) {
    throw new ImageProcessingError(
      'UNSUPPORTED_FORMAT',
      `Unsupported image format: "${detectedFormat || 'unknown'}". Only JPEG, PNG, and WebP images are permitted (SVG, GIF, PDF, and other files are rejected).`,
    )
  }

  if (metadata.width && metadata.height) {
    const totalPixels = metadata.width * metadata.height
    if (totalPixels > MAX_IMAGE_INPUT_PIXELS) {
      throw new ImageProcessingError(
        'EXCESSIVE_PIXELS',
        `Image dimensions (${metadata.width}x${metadata.height}) exceed the maximum allowed limit of ${MAX_IMAGE_INPUT_PIXELS / 1_000_000} megapixels.`,
      )
    }
  }

  try {
    const pipeline = sharp(buffer, { limitInputPixels: MAX_IMAGE_INPUT_PIXELS })
      // Auto-orient based on EXIF orientation tag before stripping metadata
      .rotate()
      // Resize to max width 1200px, preserve aspect ratio, never upscale smaller images
      .resize({
        width: MAX_IMAGE_OUTPUT_WIDTH,
        withoutEnlargement: true,
        fit: 'inside',
      })
      // Convert to WebP, quality 78, strip unnecessary metadata
      .webp({
        quality: WEBP_OUTPUT_QUALITY,
        effort: 4,
      })

    const { data: outputBuffer, info } = await pipeline.toBuffer({ resolveWithObject: true })

    if (!info.width || !info.height) {
      throw new Error('Image dimensions could not be determined after processing.')
    }

    return {
      buffer: outputBuffer,
      width: info.width,
      height: info.height,
      bytes: outputBuffer.byteLength,
      format: 'webp',
      contentType: 'image/webp',
    }
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error
    }
    const errMsg = error instanceof Error ? error.message : ''
    if (errMsg.toLowerCase().includes('pixel limit') || errMsg.toLowerCase().includes('exceeds')) {
      throw new ImageProcessingError(
        'EXCESSIVE_PIXELS',
        `Image exceeds maximum decoded pixel limit of ${MAX_IMAGE_INPUT_PIXELS / 1_000_000} megapixels.`,
      )
    }
    throw new ImageProcessingError(
      'PROCESSING_FAILED',
      `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}
