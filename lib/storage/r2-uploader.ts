import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { buildPublicAssetUrl, createR2Client, getR2Config, type R2Config } from './r2-config.ts'
import type { ProcessedImageResult } from './image-processor'

export interface UploadImageResult {
  url: string
  key: string
  width: number
  height: number
  bytes: number
  contentType: 'image/webp'
}

export interface UploadOptions {
  config?: R2Config
  s3Client?: S3Client
}

/**
 * Uploads processed WebP image bytes to Cloudflare R2 with immutable cache headers.
 * Returns structured metadata and the public CDN URL.
 */
export async function uploadImageToR2(
  processed: ProcessedImageResult,
  key: string,
  options: UploadOptions = {},
): Promise<UploadImageResult> {
  const config = options.config ?? getR2Config()
  const client = options.s3Client ?? createR2Client(config)

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: processed.buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  })

  await client.send(command)

  const publicUrl = buildPublicAssetUrl(config.publicBaseUrl, key)

  return {
    url: publicUrl,
    key,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
    contentType: 'image/webp',
  }
}
