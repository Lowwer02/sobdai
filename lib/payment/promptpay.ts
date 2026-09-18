import { ThaiQRPaymentBuilder, parsePayload } from '@thai-qr-payment/payload'
import QRCode from 'qrcode'

export const PROMPTPAY_CURRENCY = '764'
export const PROMPTPAY_COUNTRY = 'TH'
export const PROMPTPAY_QR_ERROR = 'ไม่สามารถสร้าง QR PromptPay ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง'

// The payload library's maximum is 9,999,999,999.99 THB. Keeping the same
// upper bound here lets validation happen before the library sees any value.
const MAX_AMOUNT_SATANG = BigInt('999999999999')

export class InvalidPaymentAmountError extends Error {
  constructor() {
    super('The persisted payment amount is invalid.')
    this.name = 'InvalidPaymentAmountError'
  }
}

export class InvalidPromptPayRecipientError extends Error {
  constructor() {
    super('The configured PromptPay E-Wallet recipient is invalid.')
    this.name = 'InvalidPromptPayRecipientError'
  }
}

/**
 * Normalize a Postgres numeric value without using floating point arithmetic.
 * The returned string is the canonical THB amount that belongs in a QR.
 */
export function normalizeOrderAmount(value: unknown): string {
  const raw = typeof value === 'number'
    ? (Number.isFinite(value) ? value.toString() : '')
    : typeof value === 'string'
      ? value
      : ''

  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(raw)) {
    throw new InvalidPaymentAmountError()
  }

  const [wholePart, fractionPart = ''] = raw.split('.')
  const whole = BigInt(wholePart)
  const satang = whole * BigInt(100) + BigInt(fractionPart.padEnd(2, '0') || '0')

  if (satang <= BigInt(0) || satang > MAX_AMOUNT_SATANG) {
    throw new InvalidPaymentAmountError()
  }

  return `${whole.toString()}.${fractionPart.padEnd(2, '0')}`
}

export function normalizeEWalletRecipient(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{15}$/.test(value)) {
    throw new InvalidPromptPayRecipientError()
  }

  return value
}

export type PromptPayPayload = {
  wire: string
  amount: string
}

/**
 * Build and immediately parse the payload again. The round-trip check locks
 * this application to dynamic THB E-Wallet PromptPay QR semantics and makes
 * CRC failures visible before an image is rendered.
 */
export function buildPromptPayPayload(recipient: unknown, amount: unknown): PromptPayPayload {
  const normalizedRecipient = normalizeEWalletRecipient(recipient)
  const normalizedAmount = normalizeOrderAmount(amount)
  const amountNumber = Number(normalizedAmount)

  const wire = new ThaiQRPaymentBuilder()
    .promptpay(normalizedRecipient, 'eWallet')
    .amount(amountNumber)
    .build()

  const parsed = parsePayload(wire)
  const merchant = parsed.merchant

  if (
    parsed.pointOfInitiation !== 'dynamic'
    || parsed.currency !== PROMPTPAY_CURRENCY
    || parsed.country !== PROMPTPAY_COUNTRY
    || parsed.amount !== amountNumber
    || !parsed.crc.valid
    || !merchant
    || merchant.kind !== 'promptpay'
    || merchant.recipientType !== 'eWallet'
    || merchant.recipient !== normalizedRecipient
  ) {
    throw new Error('Generated PromptPay payload failed its integrity checks.')
  }

  return { wire, amount: normalizedAmount }
}

export async function renderPromptPayQr(recipient: unknown, amount: unknown): Promise<PromptPayPayload & { dataUrl: string }> {
  const payload = buildPromptPayPayload(recipient, amount)
  const dataUrl = await QRCode.toDataURL(payload.wire, {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  })

  return { ...payload, dataUrl }
}
