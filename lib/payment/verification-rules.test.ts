import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRecipientName } from './verification-normalize'
import { deriveDecision, evaluateOcrRules, extractOcrFields } from './verification-rules'

const expectedAmount = '1250.00'
const expectedRecipient = 'กิตติพงษ์'

function evaluate(overrides: Partial<Parameters<typeof evaluateOcrRules>[0]> = {}) {
  return evaluateOcrRules({
    extraction: {
      amountCandidates: [expectedAmount],
      recipientCandidates: [normalizeRecipientName(expectedRecipient)],
      destinationCandidates: ['0123456781853'],
      referenceCandidates: ['TXN123456'],
      timestampState: 'VALID',
    },
    expectedAmount,
    expectedRecipientName: expectedRecipient,
    destinationSuffixes: ['1853', '853'],
    qrAmount: expectedAmount,
    qrRecipient: '0123456781853',
    qrReference: 'TXN123456',
    ...overrides,
  })
}

test('Thai/English OCR extraction supports the deterministic hard-rule fields', () => {
  const extraction = extractOcrFields(
    'ยอดเงิน: ฿1,250.00\nผู้รับ: คุณ กิตติพงษ์\nปลายทาง: 0123456781853\nReference: TXN123456\nวันที่: 27/09/2569',
    expectedRecipient,
  )

  assert.deepEqual(extraction.amountCandidates, [expectedAmount])
  assert.deepEqual(extraction.recipientCandidates, [normalizeRecipientName(expectedRecipient)])
  assert.deepEqual(extraction.destinationCandidates, ['0123456781853'])
  assert.deepEqual(extraction.referenceCandidates, ['TXN123456'])
  assert.equal(extraction.timestampState, 'VALID')

  const ungroupedAmount = extractOcrFields('Amount: 1250.00', expectedRecipient)
  assert.deepEqual(ungroupedAmount.amountCandidates, ['1250.00'])
})

test('recipient matching only accepts a structurally labelled recipient line', () => {
  const unlabeled = extractOcrFields('วันที่: 27/09/2569\nหมายเหตุ: โอนเงินให้กิตติพงษ์', expectedRecipient)
  assert.deepEqual(unlabeled.recipientCandidates, [])

  const senderOnly = extractOcrFields('ผู้โอน: กิตติพงษ์\nเลขที่รายการ: TXN123456', expectedRecipient)
  assert.deepEqual(senderOnly.recipientCandidates, [])

  const embeddedInTranscript = extractOcrFields('รายละเอียดการโอน กิตติพงษ์ 1250.00 0123456781853', expectedRecipient)
  assert.deepEqual(embeddedInTranscript.recipientCandidates, [])
})

test('recipient extractor rejects adversarial labels and accepts only anchored field aliases', () => {
  const adversarialLines = [
    'หมายเหตุ: ถึง กิตติพงษ์',
    'note: กิตติพงษ์',
    'ผู้โอน: กิตติพงษ์',
    'ข้อความ กิตติพงษ์',
    'ส่งถึง กิตติพงษ์',
    'ชื่อคนอื่นกิตติพงษ์',
    'รับเงิน: กิตติพงษ์',
    'ถึง กิตติพงษ์',
  ]

  for (const line of adversarialLines) {
    assert.deepEqual(extractOcrFields(line, expectedRecipient).recipientCandidates, [], line)
  }

  for (const line of ['ชื่อผู้รับ: กิตติพงษ์', 'ผู้รับ กิตติพงษ์', 'recipient: กิตติพงษ์', 'receiver - กิตติพงษ์']) {
    assert.deepEqual(extractOcrFields(line, expectedRecipient).recipientCandidates, [normalizeRecipientName(expectedRecipient)], line)
  }
})

test('all internally consistent offline hard rules produce STRONG_MATCH only', () => {
  const rules = evaluate()
  const decision = deriveDecision({
    amountMatchState: rules.amountMatchState,
    recipientMatchState: rules.recipientMatchState,
    destinationMatchState: rules.destinationMatchState,
    qrKind: 'SLIP_VERIFICATION',
    qrStructureValid: true,
    qrCrcValid: true,
    referenceState: rules.referenceState,
    imageDuplicateState: 'NONE',
    reasonCodes: rules.reasonCodes,
  })

  assert.equal(decision.decision, 'STRONG_MATCH')
  assert.equal(decision.suspicious, false)
})

test('ordinary payment-request QR stays manual even when every other field matches', () => {
  const rules = evaluate()
  const decision = deriveDecision({
    amountMatchState: rules.amountMatchState,
    recipientMatchState: rules.recipientMatchState,
    destinationMatchState: rules.destinationMatchState,
    qrKind: 'PAYMENT_REQUEST',
    qrStructureValid: true,
    qrCrcValid: true,
    referenceState: rules.referenceState,
    imageDuplicateState: 'NONE',
    reasonCodes: rules.reasonCodes,
  })

  assert.equal(decision.decision, 'MANUAL_REVIEW')
})

test('QR amount and merchant name can complete otherwise unreadable OCR fields', () => {
  const rules = evaluate({
    extraction: {
      amountCandidates: [],
      recipientCandidates: [],
      destinationCandidates: ['0123456781853'],
      referenceCandidates: [],
      timestampState: 'UNKNOWN',
    },
    qrRecipientName: expectedRecipient,
  })

  assert.equal(rules.amountMatchState, 'MATCH')
  assert.equal(rules.recipientMatchState, 'MATCH')
  assert.equal(rules.referenceState, 'VALID_UNIQUE')
  assert.equal(deriveDecision({
    amountMatchState: rules.amountMatchState,
    recipientMatchState: rules.recipientMatchState,
    destinationMatchState: rules.destinationMatchState,
    qrKind: 'SLIP_VERIFICATION',
    qrStructureValid: true,
    qrCrcValid: true,
    referenceState: rules.referenceState,
    imageDuplicateState: 'NONE',
    reasonCodes: rules.reasonCodes,
  }).decision, 'STRONG_MATCH')
})

test('wrong amount is suspicious when QR evidence contradicts OCR, and ambiguity is suspicious', () => {
  const wrongAmount = evaluate({
    extraction: {
      amountCandidates: ['1251.00'],
      recipientCandidates: [normalizeRecipientName(expectedRecipient)],
      destinationCandidates: ['0123456781853'],
      referenceCandidates: ['TXN123456'],
      timestampState: 'VALID',
    },
  })
  assert.equal(wrongAmount.amountMatchState, 'AMBIGUOUS')
  assert.equal(deriveDecision({
    amountMatchState: wrongAmount.amountMatchState,
    recipientMatchState: wrongAmount.recipientMatchState,
    destinationMatchState: wrongAmount.destinationMatchState,
    qrKind: 'SLIP_VERIFICATION',
    qrStructureValid: true,
    qrCrcValid: true,
    referenceState: wrongAmount.referenceState,
    imageDuplicateState: 'NONE',
    reasonCodes: wrongAmount.reasonCodes,
  }).decision, 'SUSPICIOUS')

  const ambiguous = evaluate({
    extraction: {
      amountCandidates: [expectedAmount],
      recipientCandidates: [normalizeRecipientName(expectedRecipient), 'anotherperson'],
      destinationCandidates: ['0123456781853'],
      referenceCandidates: ['TXN123456'],
      timestampState: 'VALID',
    },
  })
  const contradictory = evaluate({
    extraction: {
      amountCandidates: [expectedAmount],
      recipientCandidates: [normalizeRecipientName(expectedRecipient)],
      destinationCandidates: ['01234567819999'],
      referenceCandidates: ['TXN123456'],
      timestampState: 'VALID',
    },
  })
  const wrongDestinationWithoutQrContradiction = evaluate({
    qrAmount: null,
    qrRecipient: null,
    qrReference: null,
    extraction: {
      amountCandidates: [expectedAmount],
      recipientCandidates: [normalizeRecipientName(expectedRecipient)],
      destinationCandidates: ['01234567819999'],
      referenceCandidates: ['TXN123456'],
      timestampState: 'VALID',
    },
  })

  for (const result of [ambiguous, contradictory, wrongDestinationWithoutQrContradiction]) {
    const decision = deriveDecision({
      amountMatchState: result.amountMatchState,
      recipientMatchState: result.recipientMatchState,
      destinationMatchState: result.destinationMatchState,
    qrKind: 'SLIP_VERIFICATION',
    qrStructureValid: true,
    qrCrcValid: true,
      referenceState: result.referenceState,
      imageDuplicateState: 'NONE',
      reasonCodes: result.reasonCodes,
    })
    assert.equal(decision.decision, 'SUSPICIOUS')
  }
})

test('unreadable timestamp is not a hard rejection by itself', () => {
  const rules = evaluate({
    extraction: {
      amountCandidates: [expectedAmount],
      recipientCandidates: [normalizeRecipientName(expectedRecipient)],
      destinationCandidates: ['0123456781853'],
      referenceCandidates: ['TXN123456'],
      timestampState: 'UNKNOWN',
    },
  })
  assert.equal(rules.timestampState, 'UNKNOWN')
  assert.equal(rules.reasonCodes.includes('TIMESTAMP_ABNORMAL'), false)
})
