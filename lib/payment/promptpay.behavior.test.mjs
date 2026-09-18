import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePayload } from '@thai-qr-payment/payload'
import {
  buildPromptPayPayload,
  normalizeOrderAmount,
  renderPromptPayQr,
} from './promptpay.ts'

const recipient = '123456789012345'

test('PromptPay payloads are dynamic THB E-Wallet payloads with valid CRC', () => {
  for (const [input, expected] of [[69, '69.00'], [99, '99.00'], [129, '129.00'], ['69.5', '69.50']]) {
    const result = buildPromptPayPayload(recipient, input)
    const parsed = parsePayload(result.wire)

    assert.equal(result.amount, expected)
    assert.equal(parsed.amount, Number(expected))
    assert.equal(parsed.pointOfInitiation, 'dynamic')
    assert.equal(parsed.currency, '764')
    assert.equal(parsed.country, 'TH')
    assert.equal(parsed.crc.valid, true)
    assert.deepEqual(parsed.merchant, {
      kind: 'promptpay',
      recipientType: 'eWallet',
      recipient,
    })
  }
})

test('same recipient and amount produce a deterministic payload and PNG data URL', async () => {
  const first = buildPromptPayPayload(recipient, '69.00')
  const second = buildPromptPayPayload(recipient, 69)
  assert.equal(first.wire, second.wire)

  const rendered = await renderPromptPayQr(recipient, '69.00')
  assert.match(rendered.dataUrl, /^data:image\/png;base64,/)
})

test('amount and recipient validation rejects unsafe QR inputs', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'NaN', '1.001', '1e3', ' 69', '']) {
    assert.throws(() => normalizeOrderAmount(value))
  }

  assert.throws(() => buildPromptPayPayload('0812345678', 69))
  assert.throws(() => buildPromptPayPayload('123456789012345', 0))
})
