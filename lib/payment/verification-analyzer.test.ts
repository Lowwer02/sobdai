import assert from 'node:assert/strict'
import test from 'node:test'
import { applyApprovedReplayProtection } from './verification-analyzer'
import type { PaymentAnalyzerResult } from './verification-types'

function result(): PaymentAnalyzerResult {
  return {
    analyzerVersion: 'm1.3a-shadow-1',
    decision: 'STRONG_MATCH',
    state: 'STRONG_MATCH',
    detectedAmount: '1250.00',
    amountMatchState: 'MATCH',
    recipientMatchState: 'MATCH',
    destinationMatchState: 'MATCH',
    qrKind: 'SLIP_VERIFICATION',
    qrStructureValid: true,
    qrCrcValid: true,
    referenceExtracted: true,
    qrFormat: 'BANK_SLIP_VERIFY',
    providerAttestation: 'NOT_CHECKED',
    referenceState: 'VALID_UNIQUE',
    referenceFingerprint: 'hmac-sha256:v1:' + 'a'.repeat(64),
    rawImageHash: 'sha256:v1:' + 'b'.repeat(64),
    normalizedImageHash: 'sha256:v1:' + 'c'.repeat(64),
    perceptualHash: 'phash:v1:' + '0'.repeat(64),
    imageDuplicateState: 'NONE',
    timestampState: 'VALID',
    reasonCodes: [],
    durationMs: 1,
  }
}

test('replay protection applies point-lookup results without loading the ledger', () => {
  const protectedResult = applyApprovedReplayProtection(result(), {
    reference: true,
    rawImage: false,
    normalizedImage: true,
    nearImage: false,
  })

  assert.equal(protectedResult.decision, 'SUSPICIOUS')
  assert.equal(protectedResult.referenceState, 'DUPLICATE_APPROVED')
  assert.equal(protectedResult.imageDuplicateState, 'NORMALIZED_APPROVED')
  assert.ok(protectedResult.reasonCodes.includes('DUPLICATE_APPROVED_REFERENCE'))
  assert.ok(protectedResult.reasonCodes.includes('NORMALIZED_APPROVED_IMAGE'))
})
