import jsQR from 'jsqr'
import {
  parsePayload,
  parseSlipVerify,
  parseTrueMoneySlipVerify,
  type ParsedPayload,
} from '@thai-qr-payment/payload'
import { canonicalAmount, normalizeReference } from './verification-normalize'
import type { PreparedPaymentImage } from './verification-image'
import type { VerificationQrKind } from './verification-types'

export type QrEvidence = {
  kind: VerificationQrKind | null
  structureValid: boolean | null
  crcValid: boolean | null
  format: string | null
  amount: string | null
  recipient: string | null
  recipientName: string | null
  reference: string | null
  referenceNamespace: string | null
  referenceExtracted: boolean
  // QR/OCR evidence is never a provider attestation, even for a valid
  // slip-verification payload with a valid CRC.
  authoritative: false
}

function emptyEvidence(overrides: Partial<QrEvidence> = {}): QrEvidence {
  return {
    kind: null,
    structureValid: null,
    crcValid: null,
    format: null,
    amount: null,
    recipient: null,
    recipientName: null,
    reference: null,
    referenceNamespace: null,
    referenceExtracted: false,
    authoritative: false,
    ...overrides,
  }
}

function parsedPaymentReference(parsed: ParsedPayload): { reference: string; namespace: string } | null {
  const additional = parsed.additionalData
  const candidates = [
    additional?.billNumber,
    additional?.referenceLabel,
    additional?.customerLabel,
    parsed.merchant?.kind === 'billPayment' ? parsed.merchant.reference1 : null,
    parsed.merchant?.kind === 'billPayment' ? parsed.merchant.reference2 : null,
  ].filter((value): value is string => Boolean(value))
  const normalized = candidates.map(normalizeReference).find((value) => value.length >= 4)
  if (!normalized) return null

  if (parsed.merchant?.kind === 'trueMoney') return { reference: normalized, namespace: 'TRUEMONEY' }
  return { reference: normalized, namespace: 'BANK:THAIQR' }
}

function parsedWireAmount(parsed: ParsedPayload): string | null {
  // Compare the EMV tag's decimal string directly. ParsedPayload.amount is a
  // number convenience field and must not be used for payment equality.
  const wireAmount = parsed.getTagValue('54')
  return wireAmount ? canonicalAmount(wireAmount) : null
}

function parseDecodedPayload(data: string): QrEvidence {
  const slipVerify = parseSlipVerify(data)
  if (slipVerify) {
    const reference = normalizeReference(slipVerify.transRef)
    return emptyEvidence({
      kind: 'SLIP_VERIFICATION',
      structureValid: true,
      crcValid: true,
      format: 'BANK_SLIP_VERIFY',
      reference,
      referenceNamespace: `BANK:${normalizeReference(slipVerify.sendingBank)}`,
      referenceExtracted: reference.length >= 4,
    })
  }

  const trueMoneySlipVerify = parseTrueMoneySlipVerify(data)
  if (trueMoneySlipVerify) {
    const reference = normalizeReference(trueMoneySlipVerify.transactionId)
    return emptyEvidence({
      kind: 'SLIP_VERIFICATION',
      structureValid: true,
      crcValid: true,
      format: 'TRUEMONEY_SLIP_VERIFY',
      reference,
      referenceNamespace: 'TRUEMONEY',
      referenceExtracted: reference.length >= 4,
    })
  }

  try {
    const parsed = parsePayload(data, { strict: true })
    if (!parsed.crc.valid) {
      return emptyEvidence({
        kind: 'PAYMENT_REQUEST',
        structureValid: false,
        crcValid: false,
        format: 'THAI_QR_PAYMENT',
      })
    }

    const reference = parsedPaymentReference(parsed)
    const merchant = parsed.merchant
    if (!merchant) {
      return emptyEvidence({
        kind: 'PAYMENT_REQUEST',
        structureValid: true,
        crcValid: true,
        format: 'THAI_QR_PAYMENT',
        amount: parsedWireAmount(parsed),
        recipientName: parsed.merchantName || null,
        reference: reference?.reference || null,
        referenceNamespace: reference?.namespace || null,
        referenceExtracted: Boolean(reference),
      })
    }

    // A payment-request QR proves what a payer was asked to pay, not that a
    // completed bank/wallet slip exists. It is useful corroborating evidence
    // for manual review, but it must never satisfy the slip evidence gate.
    return emptyEvidence({
      kind: 'PAYMENT_REQUEST',
      structureValid: true,
      crcValid: true,
      format: merchant.kind === 'trueMoney'
        ? 'TRUEMONEY_PAYMENT'
        : merchant.kind === 'promptpay'
          ? 'PROMPTPAY_PAYMENT'
          : 'THAI_BILL_PAYMENT',
      amount: parsedWireAmount(parsed),
      recipient: merchant.kind === 'promptpay'
        ? merchant.recipient
        : merchant.kind === 'trueMoney'
          ? merchant.mobileNo
          : null,
      recipientName: parsed.merchantName || null,
      reference: reference?.reference || null,
      referenceNamespace: reference?.namespace || null,
      referenceExtracted: Boolean(reference),
    })
  } catch {
    const looksLikeEmvPayment = /^00\d{2}/u.test(data) || /63\d{2}[0-9A-F]{0,4}$/iu.test(data)
    return emptyEvidence({
      kind: looksLikeEmvPayment ? 'PAYMENT_REQUEST' : 'UNKNOWN',
      structureValid: false,
      crcValid: looksLikeEmvPayment ? false : null,
      format: looksLikeEmvPayment ? 'THAI_QR_PAYMENT' : 'UNKNOWN_QR',
    })
  }
}

export function decodePaymentQr(image: PreparedPaymentImage): QrEvidence {
  const decoded = jsQR(image.rgba, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  if (!decoded || !decoded.data.trim()) return emptyEvidence()
  return parseDecodedPayload(decoded.data.trim())
}
