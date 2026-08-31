import { S3Client } from '@aws-sdk/client-s3'

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicBaseUrl: string
}

export const R2_ENV_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
] as const

export type R2EnvVarName = (typeof R2_ENV_VARS)[number]

/**
 * Validates and normalizes the public base URL for R2 assets.
 * Guarantees:
 * - Must be a valid absolute URL
 * - Requires https: protocol for production URLs (http: allowed only for localhost / 127.0.0.1)
 * - Prohibits internal S3/R2 storage endpoints (*.r2.cloudflarestorage.com) from leaking as public URLs
 * - Deterministically normalizes trailing slashes
 */
export function validatePublicBaseUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Missing or empty R2_PUBLIC_BASE_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(urlStr.trim())
  } catch {
    throw new Error(`Invalid R2_PUBLIC_BASE_URL: "${urlStr}". Must be a valid absolute URL.`)
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && (!isLocal || parsed.protocol !== 'http:')) {
    throw new Error(`Invalid R2_PUBLIC_BASE_URL protocol: "${parsed.protocol}". Must use "https:" for public asset URLs.`)
  }

  if (parsed.hostname.endsWith('.r2.cloudflarestorage.com')) {
    throw new Error(
      `Invalid R2_PUBLIC_BASE_URL: Internal R2 storage endpoint "${parsed.hostname}" cannot be used as public asset URL. Use a custom domain (e.g., https://assets.sobdai.com).`,
    )
  }

  // Normalize origin + path without trailing slash
  const cleanPath = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${cleanPath}`
}

/**
 * Validates and retrieves the server-side Cloudflare R2 configuration.
 * Fails closed with an explicit error naming missing environment variables.
 *
 * Credentials MUST remain server-only and should never be exposed with NEXT_PUBLIC_ prefix.
 */
export function getR2Config(env: Record<string, string | undefined> = process.env): R2Config {
  const accountId = env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim()
  const bucketName = env.R2_BUCKET_NAME?.trim()
  const rawPublicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim()

  const missing: string[] = []
  if (!accountId) missing.push('R2_ACCOUNT_ID')
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY')
  if (!bucketName) missing.push('R2_BUCKET_NAME')
  if (!rawPublicBaseUrl) missing.push('R2_PUBLIC_BASE_URL')

  if (missing.length > 0) {
    throw new Error(`Missing required R2 environment variables: ${missing.join(', ')}`)
  }

  const publicBaseUrl = validatePublicBaseUrl(rawPublicBaseUrl!)

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucketName: bucketName!,
    publicBaseUrl,
  }
}

/**
 * Initializes an S3Client configured for Cloudflare R2's S3-compatible API.
 * Uses region 'auto' and the Cloudflare R2 endpoint.
 */
export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

/**
 * Builds the immutable public CDN/Asset URL from the validated public base URL and object key.
 * Never returns the internal S3 credential endpoint.
 */
export function buildPublicAssetUrl(publicBaseUrl: string, objectKey: string): string {
  const cleanBase = validatePublicBaseUrl(publicBaseUrl)
  const cleanKey = objectKey.trim().replace(/^\/+/, '')
  return `${cleanBase}/${cleanKey}`
}
