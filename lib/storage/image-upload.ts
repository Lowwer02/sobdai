// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { generateAssetKey, type AssetScope } from './asset-key.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { ImageProcessingError, MAX_IMAGE_INPUT_BYTES, validateAndProcessImage, type ProcessedImageResult } from './image-processor.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { uploadImageToR2, type UploadImageResult, type UploadOptions } from './r2-uploader.ts'

export interface ProcessAndUploadImageInput {
  file: File | Blob | ArrayBuffer | Buffer | Uint8Array
  scope: unknown
  entityId?: string | null
}

export type ProcessAndUploadImageOptions = UploadOptions & {
  now?: Date
}

/**
 * Full image processing and R2 upload pipeline.
 *
 * Sequence:
 * 1. Validates scope and entityId; generates immutable object key.
 * 2. Enforces input size limit (<= 4 MiB) on file/buffer.
 * 3. Decodes format, validates <= 50 MP, resizes to max-width 1200, auto-orients, and converts to WebP q78.
 * 4. Uploads processed bytes to Cloudflare R2 with immutable cache-control headers.
 * 5. Returns structured metadata with public CDN URL.
 */
export async function processAndUploadImage(
  input: ProcessAndUploadImageInput,
  options: ProcessAndUploadImageOptions = {},
): Promise<UploadImageResult> {
  const { scope, entityId } = input

  // 1. Generate key (validates scope & entityId fail-closed before any processing or upload)
  const key = generateAssetKey({
    scope,
    entityId,
    now: options.now,
  })

  // 2. Fail fast on Blob/File size before memory allocation
  if (typeof (input.file as Blob)?.size === 'number' && (input.file as Blob).size > MAX_IMAGE_INPUT_BYTES) {
    throw new ImageProcessingError(
      'OVERSIZED_INPUT',
      `Image exceeds maximum allowed size of ${MAX_IMAGE_INPUT_BYTES / (1024 * 1024)}MB.`,
    )
  }

  // 3. Extract buffer from File/Blob/ArrayBuffer
  let rawBuffer: Buffer
  if (Buffer.isBuffer(input.file)) {
    rawBuffer = input.file
  } else if (input.file instanceof ArrayBuffer) {
    rawBuffer = Buffer.from(input.file)
  } else if (input.file instanceof Uint8Array) {
    rawBuffer = Buffer.from(input.file.buffer, input.file.byteOffset, input.file.byteLength)
  } else if (typeof (input.file as Blob)?.arrayBuffer === 'function') {
    const arrayBuf = await (input.file as Blob).arrayBuffer()
    rawBuffer = Buffer.from(arrayBuf)
  } else {
    throw new Error('Invalid file input. Must be a File, Blob, Buffer, or ArrayBuffer.')
  }

  // 4. Process image (validates format, limits to 50 MP, downscales to 1200px max, converts to WebP q78, strips metadata)
  const processed: ProcessedImageResult = await validateAndProcessImage(rawBuffer)

  // 5. Upload to Cloudflare R2
  return uploadImageToR2(processed, key, options)
}
