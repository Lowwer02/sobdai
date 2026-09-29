import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import QRCode from 'qrcode'
import {
  buildSlipVerify,
  buildTrueMoneySlipVerify,
  payloadFor,
  ThaiQRPaymentBuilder,
} from '@thai-qr-payment/payload'
import { preparePaymentImage } from './verification-image'
import { decodePaymentQr } from './verification-qr'
import { deriveDecision } from './verification-rules'

test('ordinary PromptPay payment-request QR is valid but never slip-supported', async () => {
  const recipient = '012345678901853'
  const payload = payloadFor({ recipient, type: 'eWallet', amount: 1250 })
  const qrImage = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 480,
    margin: 4,
    errorCorrectionLevel: 'M',
  })
  const prepared = await preparePaymentImage(qrImage, 'image/png')
  const evidence = decodePaymentQr(prepared)

  assert.equal(evidence.kind, 'PAYMENT_REQUEST')
  assert.equal(evidence.structureValid, true)
  assert.equal(evidence.crcValid, true)
  assert.equal(evidence.format, 'PROMPTPAY_PAYMENT')
  assert.equal(evidence.amount, '1250.00')
  assert.equal(evidence.recipient, recipient)
})

test('ordinary payment-request merchant name remains review evidence only', async () => {
  const payload = new ThaiQRPaymentBuilder()
    .promptpay('012345678901853', 'eWallet')
    .amount(1250)
    .merchant({ name: 'กิตติพงษ์' })
    .build()
  const qrImage = await QRCode.toBuffer(payload, { type: 'png', width: 480, margin: 4 })
  const prepared = await preparePaymentImage(qrImage, 'image/png')
  const evidence = decodePaymentQr(prepared)

  assert.equal(evidence.kind, 'PAYMENT_REQUEST')
  assert.equal(evidence.structureValid, true)
  assert.equal(evidence.recipientName, 'กิตติพงษ์')
})

test('valid Thai bill and TrueMoney payment-request QRs cannot satisfy the slip gate', async () => {
  const payloads = [
    {
      payload: new ThaiQRPaymentBuilder()
        .billPayment({ billerId: '0105558123456', reference1: 'INV123456', reference2: '20260927' })
        .amount(1250)
        .build(),
      format: 'THAI_BILL_PAYMENT',
    },
    {
      payload: new ThaiQRPaymentBuilder()
        .trueMoney('0812345678', { amount: 1250 })
        .build(),
      format: 'TRUEMONEY_PAYMENT',
    },
  ]

  for (const { payload, format } of payloads) {
    const image = await QRCode.toBuffer(payload, { type: 'png', width: 480, margin: 4 })
    const evidence = decodePaymentQr(await preparePaymentImage(image, 'image/png'))
    assert.equal(evidence.kind, 'PAYMENT_REQUEST')
    assert.equal(evidence.structureValid, true)
    assert.equal(evidence.format, format)
    assert.equal(evidence.amount, '1250.00')
  }
})

test('genuine bank and TrueMoney slip-verification payloads remain supported', async () => {
  const payloads = [
    { payload: buildSlipVerify({ sendingBank: '004', transRef: 'BANKTXN123456' }), format: 'BANK_SLIP_VERIFY' },
    { payload: buildTrueMoneySlipVerify({ eventType: '01', transactionId: 'TM123456789', date: '27092569' }), format: 'TRUEMONEY_SLIP_VERIFY' },
  ]

  for (const { payload, format } of payloads) {
    const image = await QRCode.toBuffer(payload, { type: 'png', width: 480, margin: 4 })
    const evidence = decodePaymentQr(await preparePaymentImage(image, 'image/png'))
    assert.equal(evidence.kind, 'SLIP_VERIFICATION')
    assert.equal(evidence.structureValid, true)
    assert.equal(evidence.crcValid, true)
    assert.equal(evidence.authoritative, false)
    assert.equal(evidence.format, format)
  }
})

test('attacker-generated slip-verification QR is only internally consistent triage evidence', async () => {
  const payloads = [
    { payload: buildSlipVerify({ sendingBank: '004', transRef: 'ATTACKER-CHOSEN-REF-001' }), format: 'BANK_SLIP_VERIFY' },
    { payload: buildTrueMoneySlipVerify({ eventType: '01', transactionId: 'ATTACKER-TM-REF-001', date: '27092569' }), format: 'TRUEMONEY_SLIP_VERIFY' },
  ]

  for (const { payload, format } of payloads) {
    const image = await QRCode.toBuffer(payload, { type: 'png', width: 480, margin: 4 })
    const evidence = decodePaymentQr(await preparePaymentImage(image, 'image/png'))
    const decision = deriveDecision({
      amountMatchState: 'MATCH',
      recipientMatchState: 'MATCH',
      destinationMatchState: 'MATCH',
      qrKind: evidence.kind,
      qrStructureValid: evidence.structureValid,
      qrCrcValid: evidence.crcValid,
      referenceState: 'VALID_UNIQUE',
      imageDuplicateState: 'NONE',
      reasonCodes: [],
    })

    assert.equal(evidence.format, format)
    assert.equal(evidence.referenceExtracted, true)
    assert.equal(evidence.authoritative, false)
    assert.equal(decision.decision, 'STRONG_MATCH')
  }
})

test('invalid, unsupported, and missing QR evidence stay distinguishable', async () => {
  const validPayload = payloadFor({ recipient: '012345678901853', type: 'eWallet', amount: 1250 })
  const invalidPayload = `${validPayload.slice(0, -4)}0000`
  const invalidImage = await QRCode.toBuffer(invalidPayload, { type: 'png', width: 480, margin: 4 })
  const invalidEvidence = decodePaymentQr(await preparePaymentImage(invalidImage, 'image/png'))
  assert.equal(invalidEvidence.kind, 'PAYMENT_REQUEST')
  assert.equal(invalidEvidence.structureValid, false)
  assert.equal(invalidEvidence.crcValid, false)

  const unsupportedImage = await QRCode.toBuffer('not-a-thai-payment-payload', { type: 'png', width: 480, margin: 4 })
  const unsupportedEvidence = decodePaymentQr(await preparePaymentImage(unsupportedImage, 'image/png'))
  assert.equal(unsupportedEvidence.kind, 'UNKNOWN')
  assert.equal(unsupportedEvidence.structureValid, false)

  const blankImage = await sharp({
    create: { width: 480, height: 480, channels: 3, background: 'white' },
  }).png().toBuffer()
  const unreadableEvidence = decodePaymentQr(await preparePaymentImage(blankImage, 'image/png'))
  assert.equal(unreadableEvidence.kind, null)
  assert.equal(unreadableEvidence.structureValid, null)
})
