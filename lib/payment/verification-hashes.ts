import { createHash, createHmac } from 'node:crypto'
import sharp from 'sharp'

export type ReferenceFingerprint = {
  fingerprint: string
  algorithm: 'hmac-sha256'
  version: 'v1'
}

export const PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION = 'v1' as const
export const PAYMENT_VERIFICATION_HMAC_SECRET_BYTES = 32
export const PAYMENT_VERIFICATION_HMAC_SECRET_HEX_LENGTH = PAYMENT_VERIFICATION_HMAC_SECRET_BYTES * 2
// Kept as a compatibility alias for operator tooling; validation is now exact,
// not a minimum-length check.
export const PAYMENT_VERIFICATION_HMAC_MIN_LENGTH = PAYMENT_VERIFICATION_HMAC_SECRET_HEX_LENGTH

const DOCUMENTED_HMAC_SECRET_PLACEHOLDERS = new Set([
  '0123456789abcdef'.repeat(4),
  'abcdef0123456789'.repeat(4),
  'deadbeef'.repeat(8),
  'cafebabe'.repeat(8),
])

export type ReferenceFingerprintConfig = {
  secret?: string | null
  activeVersion?: string | null
}

export function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function isValidPaymentVerificationHmacSecretV1(secret: unknown): secret is string {
  if (typeof secret !== 'string' || !/^[0-9a-fA-F]{64}$/.test(secret)) return false

  const bytes = Buffer.from(secret, 'hex')
  if (bytes.length !== PAYMENT_VERIFICATION_HMAC_SECRET_BYTES) return false
  if (bytes.every((value) => value === bytes[0])) return false
  if (DOCUMENTED_HMAC_SECRET_PLACEHOLDERS.has(secret.toLowerCase())) return false

  // Repeated short byte patterns are common copy/paste examples and are not
  // an acceptable operator secret. A random 32-byte value will not match this.
  for (const patternLength of [1, 2, 4, 8]) {
    const pattern = bytes.subarray(0, patternLength)
    let repeated = true
    for (let offset = patternLength; offset < bytes.length; offset += patternLength) {
      if (!bytes.subarray(offset, offset + patternLength).equals(pattern)) {
        repeated = false
        break
      }
    }
    if (repeated) return false
  }

  return true
}

/**
 * Reference identity is a keyed value. Missing, weak, or incorrectly
 * versioned configuration deliberately returns null so the caller can keep
 * the result manual-only. Plain SHA-256 is appropriate for image bytes, but
 * is not an acceptable reference identity because it is dictionary-searchable.
 */
export function fingerprintReference(
  canonicalReference: string,
  config: ReferenceFingerprintConfig = {},
): ReferenceFingerprint | null {
  const secret = config.secret !== undefined
    ? config.secret
    : process.env.PAYMENT_VERIFICATION_HMAC_SECRET_V1
  const activeVersion = config.activeVersion !== undefined
    ? config.activeVersion
    : process.env.PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION

  if (activeVersion !== PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION
      || !isValidPaymentVerificationHmacSecretV1(secret)) {
    return null
  }

  // Operators provide a 64-character hex encoding of the 32-byte key. The
  // encoding is configuration syntax only; HMAC must receive the decoded key
  // bytes so every caller shares one stable identity contract.
  const keyBytes = Buffer.from(secret, 'hex')

  return {
    algorithm: 'hmac-sha256',
    version: PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION,
    fingerprint: `hmac-sha256:${PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION}:${createHmac('sha256', keyBytes).update(canonicalReference).digest('hex')}`,
  }
}

export function exactImageHash(bytes: Buffer): string {
  return `sha256:v1:${sha256Hex(bytes)}`
}

/** A perceptual hash is a review signal only; it is never a uniqueness key. */
export async function perceptualImageHash(normalizedImage: Buffer): Promise<string> {
  const { data, info } = await sharp(normalizedImage)
    .resize(16, 16, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let total = 0
  for (const value of data) total += value
  const average = total / Math.max(1, info.width * info.height)
  let bits = ''
  for (const value of data) bits += value >= average ? '1' : '0'
  return `phash:v1:${BigInt(`0b${bits}`).toString(16).padStart(64, '0')}`
}

export function perceptualHashDistance(left: string, right: string): number | null {
  const leftBits = left.replace(/^phash:v1:/, '')
  const rightBits = right.replace(/^phash:v1:/, '')
  if (!/^[0-9a-f]{64}$/i.test(leftBits) || !/^[0-9a-f]{64}$/i.test(rightBits)) return null

  let distance = 0
  for (let index = 0; index < leftBits.length; index += 1) {
    const xor = Number.parseInt(leftBits[index], 16) ^ Number.parseInt(rightBits[index], 16)
    distance += xor.toString(2).split('1').length - 1
  }
  return distance
}
