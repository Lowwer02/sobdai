import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exactImageHash,
  fingerprintReference,
  isValidPaymentVerificationHmacSecretV1,
  perceptualHashDistance,
} from './verification-hashes'

const VALID_SECRET = '8d1f2a3b4c5d6e7f9012a3b4c5d6e7f8a9b0c1d2e3f405162738495a6b7c8d9e'
const FIXED_VECTOR_SECRET = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const FIXED_VECTOR_REFERENCE = 'BANK:KBANK:TXN1234'
// Independently precomputed with OpenSSL HMAC-SHA256 using the decoded 32-byte key.
const FIXED_VECTOR_FINGERPRINT = 'hmac-sha256:v1:6aad5583346be8208cff446ec894c635437dbec5e4ec2fe8851122f62f203524'

test('v1 HMAC uses decoded key bytes and is hex-case invariant', () => {
  const lower = fingerprintReference(FIXED_VECTOR_REFERENCE, {
    secret: FIXED_VECTOR_SECRET,
    activeVersion: 'v1',
  })
  const upper = fingerprintReference(FIXED_VECTOR_REFERENCE, {
    secret: FIXED_VECTOR_SECRET.toUpperCase(),
    activeVersion: 'v1',
  })
  const differentReference = fingerprintReference('BANK:KBANK:TXN1235', {
    secret: FIXED_VECTOR_SECRET,
    activeVersion: 'v1',
  })

  assert.equal(lower?.fingerprint, FIXED_VECTOR_FINGERPRINT)
  assert.equal(upper?.fingerprint, FIXED_VECTOR_FINGERPRINT)
  assert.equal(lower?.fingerprint, upper?.fingerprint)
  assert.notEqual(differentReference?.fingerprint, FIXED_VECTOR_FINGERPRINT)
})

test('reference fingerprints require a versioned HMAC configuration', () => {
  const hmac = fingerprintReference('BANK:KBANK:TXN1234', {
    secret: VALID_SECRET,
    activeVersion: 'v1',
  })
  const missing = fingerprintReference('BANK:KBANK:TXN1234', { secret: '', activeVersion: 'v1' })
  const weak = fingerprintReference('BANK:KBANK:TXN1234', { secret: 'too-short', activeVersion: 'v1' })
  const repeated = fingerprintReference('BANK:KBANK:TXN1234', { secret: 'a'.repeat(64), activeVersion: 'v1' })
  const malformed = fingerprintReference('BANK:KBANK:TXN1234', { secret: `${'a'.repeat(63)}g`, activeVersion: 'v1' })
  const wrongVersion = fingerprintReference('BANK:KBANK:TXN1234', {
    secret: VALID_SECRET,
    activeVersion: 'v2',
  })

  assert.ok(hmac)
  assert.equal(hmac.algorithm, 'hmac-sha256')
  assert.equal(hmac.version, 'v1')
  assert.match(hmac.fingerprint, /^hmac-sha256:v1:[0-9a-f]{64}$/)
  assert.equal(
    fingerprintReference('BANK:KBANK:TXN1234', {
      secret: VALID_SECRET,
      activeVersion: 'v1',
    })?.fingerprint,
    hmac.fingerprint,
  )
  assert.notEqual(
    fingerprintReference('BANK:KBANK:TXN1235', {
      secret: VALID_SECRET,
      activeVersion: 'v1',
    })?.fingerprint,
    hmac.fingerprint,
  )
  assert.equal(missing, null)
  assert.equal(weak, null)
  assert.equal(repeated, null)
  assert.equal(malformed, null)
  assert.equal(wrongVersion, null)
})

test('v1 HMAC secret validation requires 32 random-looking bytes and rejects examples', () => {
  assert.equal(isValidPaymentVerificationHmacSecretV1(undefined), false)
  assert.equal(isValidPaymentVerificationHmacSecretV1(''), false)
  assert.equal(isValidPaymentVerificationHmacSecretV1('0'.repeat(64)), false)
  assert.equal(isValidPaymentVerificationHmacSecretV1('0123456789abcdef'.repeat(4)), false)
  assert.equal(isValidPaymentVerificationHmacSecretV1('deadbeef'.repeat(8)), false)
  assert.equal(isValidPaymentVerificationHmacSecretV1(`${'a'.repeat(63)}g`), false)
  assert.equal(isValidPaymentVerificationHmacSecretV1(VALID_SECRET), true)
})

test('reference fingerprint output never contains the secret or raw reference', () => {
  const secret = VALID_SECRET
  const reference = 'BANK:KBANK:RAW-REFERENCE-1234'
  const fingerprint = fingerprintReference(reference, { secret, activeVersion: 'v1' })

  assert.ok(fingerprint)
  assert.equal(fingerprint.fingerprint.includes(secret), false)
  assert.equal(fingerprint.fingerprint.includes(reference), false)
})

test('raw image hashes and perceptual distances are deterministic', () => {
  assert.equal(exactImageHash(Buffer.from('same')), exactImageHash(Buffer.from('same')))
  assert.notEqual(exactImageHash(Buffer.from('same')), exactImageHash(Buffer.from('changed')))
  assert.equal(perceptualHashDistance('phash:v1:' + '0'.repeat(64), 'phash:v1:' + '0'.repeat(64)), 0)
  assert.equal(perceptualHashDistance('phash:v1:invalid', 'phash:v1:' + '0'.repeat(64)), null)
})
