import {
  canonicalAmount,
  normalizeOcrText,
  normalizeRecipientName,
  normalizeReference,
  normalizeThaiDigits,
  tailMatches,
  uniqueStrings,
} from './verification-normalize'
import type {
  PaymentVerificationDecision,
  VerificationDestinationState,
  VerificationFieldState,
  VerificationImageDuplicateState,
  VerificationQrKind,
  VerificationReferenceState,
  VerificationTimestampState,
} from './verification-types'

export type OcrExtraction = {
  amountCandidates: string[]
  recipientCandidates: string[]
  destinationCandidates: string[]
  referenceCandidates: string[]
  timestampState: VerificationTimestampState
}

export type RuleEvaluation = {
  detectedAmount: string | null
  amountMatchState: VerificationFieldState
  recipientMatchState: VerificationFieldState
  destinationMatchState: VerificationDestinationState
  referenceState: VerificationReferenceState
  timestampState: VerificationTimestampState
  reasonCodes: string[]
}

const AMOUNT_LABEL = /(?:ยอด(?:เงิน)?|จำนวน(?:เงิน)?|amount|total|thb|บาท|฿)/iu
// Recipient authority is deliberately structural. These labels must begin a
// normalized OCR line and end at a field boundary; substring matches such as
// "หมายเหตุ: ถึง ..." or "ชื่อคนอื่น..." are not recipient evidence.
const RECIPIENT_FIELD_LABEL = /^(?:ชื่อผู้รับ|ผู้รับ|recipient|receiver)(?=\s|[:：\-–—]|$)/iu
const RECIPIENT_EXCLUDED_LINE = /^(?:หมายเหตุ|note|memo|message|ข้อความ|ผู้โอน|sender|from|ส่งถึง)(?=\s*(?:[:：\-–—]|\s|$))/iu
const DESTINATION_LABEL = /(?:เลขบัญชี|บัญชีปลายทาง|ปลายทาง|พร้อมเพย์|เบอร์รับเงิน|recipient|destination|wallet)/iu
const REFERENCE_LABEL = /(?:transaction|trans\.?\s*(?:id|no)?|reference|ref\.?|trace|เลขที่รายการ|รหัสรายการ|รหัสอ้างอิง|หมายเลขธุรกรรม)/iu
const TIMESTAMP_LABEL = /(?:date|time|วันที่|เวลา|เมื่อ|ทำรายการ)/iu
// Keep an unbroken integer together even when it is longer than three digits;
// the previous grouped-number pattern could split `1250.00` into `125` and
// `0.00`, creating a false ambiguity.
const DECIMAL_TOKEN = /[๐-๙\d][๐-๙\d,]*(?:[.,][๐-๙\d]+)?/gu
const INTEGER_TOKEN = /[๐-๙\d]{3,30}/gu

function normaliseNumberToken(value: string): string | null {
  const normalized = normalizeThaiDigits(value).replace(/\s/g, '')
  const lastDot = normalized.lastIndexOf('.')
  const lastComma = normalized.lastIndexOf(',')

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? '.' : ','
    const decimalIndex = normalized.lastIndexOf(decimalSeparator)
    const fraction = normalized.slice(decimalIndex + 1)
    if (fraction.length > 2) return null
    const whole = normalized.slice(0, decimalIndex).replace(/[.,]/g, '')
    return canonicalAmount(`${whole}.${fraction}`)
  }

  const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null
  if (!separator) return canonicalAmount(normalized)

  const parts = normalized.split(separator)
  const lastPart = parts[parts.length - 1]
  if (parts.length > 2) {
    if (lastPart.length > 2) return canonicalAmount(parts.join(''))
    return canonicalAmount(`${parts.slice(0, -1).join('')}.${lastPart}`)
  }

  // A three-digit suffix is treated as a thousands group; one or two digits
  // are the only accepted exact decimal fractions.
  if (lastPart.length === 3) return canonicalAmount(parts.join(''))
  return canonicalAmount(`${parts[0]}.${lastPart}`)
}

function candidateAfterLabel(line: string, pattern: RegExp): string {
  const match = line.match(pattern)
  if (!match || match.index === undefined) return line
  return line.slice(match.index + match[0].length).replace(/^\s*[:：\-–—]?\s*/u, '')
}

function extractAmountCandidates(lines: readonly string[]): string[] {
  const labelled: string[] = []
  const fallback: string[] = []

  for (const line of lines) {
    const target = AMOUNT_LABEL.test(line) ? labelled : fallback
    for (const token of line.match(DECIMAL_TOKEN) || []) {
      const candidate = normaliseNumberToken(token)
      if (candidate) target.push(candidate)
    }
  }

  return uniqueStrings(labelled.length > 0 ? labelled : fallback)
}

function extractRecipientCandidates(lines: readonly string[]): string[] {
  const labelled: string[] = []

  for (const line of lines) {
    const normalizedLine = line.trim()
    if (RECIPIENT_EXCLUDED_LINE.test(normalizedLine)) continue
    if (!RECIPIENT_FIELD_LABEL.test(normalizedLine)) continue
    const candidate = normalizeRecipientName(candidateAfterLabel(normalizedLine, RECIPIENT_FIELD_LABEL))
    if (candidate) labelled.push(candidate)
  }

  return uniqueStrings(labelled)
}

function extractDestinationCandidates(lines: readonly string[]): string[] {
  const candidates: string[] = []
  for (const line of lines) {
    if (!DESTINATION_LABEL.test(line)) continue
    for (const token of line.match(INTEGER_TOKEN) || []) {
      const digits = normalizeThaiDigits(token)
      if (digits.length >= 3) candidates.push(digits)
    }
  }
  return uniqueStrings(candidates)
}

function extractReferenceCandidates(lines: readonly string[]): string[] {
  const candidates: string[] = []
  for (const line of lines) {
    if (!REFERENCE_LABEL.test(line)) continue
    const afterLabel = candidateAfterLabel(line, REFERENCE_LABEL)
    for (const token of afterLabel.match(/[A-Za-zก-๙๐-๙\d][A-Za-zก-๙๐-๙\d._\/-]{3,80}/gu) || []) {
      const normalized = normalizeReference(token)
      if (normalized.length >= 4) candidates.push(normalized)
    }
  }
  return uniqueStrings(candidates)
}

function extractTimestampState(lines: readonly string[]): VerificationTimestampState {
  const timestampLines = lines.filter((line) => TIMESTAMP_LABEL.test(line))
  if (timestampLines.length === 0) return 'UNKNOWN'

  const hasPlausibleDate = timestampLines.some((line) => {
    const digits = normalizeThaiDigits(line).match(/\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/)
    return Boolean(digits)
  })
  return hasPlausibleDate ? 'VALID' : 'ABNORMAL'
}

export function extractOcrFields(ocrText: string, _expectedRecipientName: string): OcrExtraction {
  const normalized = normalizeOcrText(ocrText)
  const lines = normalized.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)

  return {
    amountCandidates: extractAmountCandidates(lines),
    recipientCandidates: extractRecipientCandidates(lines),
    destinationCandidates: extractDestinationCandidates(lines),
    referenceCandidates: extractReferenceCandidates(lines),
    timestampState: extractTimestampState(lines),
  }
}

function compareSingleCandidate(
  candidates: readonly string[],
  matches: (candidate: string) => boolean,
): VerificationFieldState {
  const unique = uniqueStrings(candidates)
  if (unique.length === 0) return 'UNKNOWN'
  if (unique.length > 1) return 'AMBIGUOUS'
  return matches(unique[0]) ? 'MATCH' : 'MISMATCH'
}

export function evaluateOcrRules(input: {
  extraction: OcrExtraction
  expectedAmount: string
  expectedRecipientName: string
  destinationSuffixes: readonly string[]
  qrAmount?: string | null
  qrRecipient?: string | null
  qrRecipientName?: string | null
  qrReference?: string | null
  /** OCR-only destination candidates before QR evidence is merged in. */
  ocrDestinationCandidates?: readonly string[]
  approvedReference?: boolean
}): RuleEvaluation {
  const expectedRecipient = normalizeRecipientName(input.expectedRecipientName)
  const qrRecipientName = input.qrRecipientName
    ? normalizeRecipientName(input.qrRecipientName)
    : null
  const amountCandidates = uniqueStrings([
    ...input.extraction.amountCandidates,
    input.qrAmount,
  ])
  const recipientCandidates = uniqueStrings([
    ...input.extraction.recipientCandidates,
    qrRecipientName,
  ])
  const amountMatchState = compareSingleCandidate(
    amountCandidates,
    (candidate) => candidate === input.expectedAmount,
  )
  const recipientMatchState = compareSingleCandidate(
    recipientCandidates,
    (candidate) => candidate === expectedRecipient,
  )
  const destinationMatchState = compareSingleCandidate(
    input.extraction.destinationCandidates,
    (candidate) => tailMatches(candidate, input.destinationSuffixes),
  )

  const reasons: string[] = []
  if (amountMatchState === 'MISMATCH') reasons.push('AMOUNT_MISMATCH')
  if (amountMatchState === 'UNKNOWN') reasons.push('AMOUNT_UNREADABLE')
  if (amountMatchState === 'AMBIGUOUS') reasons.push('AMOUNT_AMBIGUOUS')
  if (recipientMatchState === 'MISMATCH') reasons.push('RECIPIENT_MISMATCH')
  if (recipientMatchState === 'UNKNOWN') reasons.push('RECIPIENT_UNREADABLE')
  if (recipientMatchState === 'AMBIGUOUS') reasons.push('RECIPIENT_AMBIGUOUS')
  if (destinationMatchState === 'MISMATCH') reasons.push('DESTINATION_MISMATCH')
  if (destinationMatchState === 'UNKNOWN') reasons.push('DESTINATION_UNREADABLE')
  if (destinationMatchState === 'AMBIGUOUS') reasons.push('DESTINATION_AMBIGUOUS')

  if (input.qrAmount && input.extraction.amountCandidates.length > 0 && !input.extraction.amountCandidates.includes(input.qrAmount)) {
    reasons.push('QR_OCR_AMOUNT_CONTRADICTION')
  }
  if (qrRecipientName && input.extraction.recipientCandidates.length > 0 && !input.extraction.recipientCandidates.includes(qrRecipientName)) {
    reasons.push('QR_OCR_RECIPIENT_CONTRADICTION')
  }
  const ocrDestinationCandidates = input.ocrDestinationCandidates || input.extraction.destinationCandidates
  if (input.qrRecipient && ocrDestinationCandidates.length > 0 && !ocrDestinationCandidates.some((candidate) => candidate.endsWith(input.qrRecipient!.slice(-4)))) {
    reasons.push('QR_OCR_DESTINATION_CONTRADICTION')
  }
  if (input.qrReference && input.extraction.referenceCandidates.length > 0 && !input.extraction.referenceCandidates.includes(input.qrReference)) {
    reasons.push('QR_OCR_REFERENCE_CONTRADICTION')
  }
  if (input.approvedReference) reasons.push('DUPLICATE_APPROVED_REFERENCE')
  if (input.extraction.timestampState === 'ABNORMAL') reasons.push('TIMESTAMP_ABNORMAL')

  const referenceCandidates = uniqueStrings([
    ...input.extraction.referenceCandidates,
    input.qrReference,
  ])
  let referenceState: VerificationReferenceState = 'UNKNOWN'
  if (referenceCandidates.length > 1) referenceState = 'AMBIGUOUS'
  else if (referenceCandidates.length === 1) referenceState = input.approvedReference ? 'DUPLICATE_APPROVED' : 'VALID_UNIQUE'

  return {
    detectedAmount: amountCandidates.length === 1
      ? amountCandidates[0]
      : input.qrAmount || null,
    amountMatchState,
    recipientMatchState,
    destinationMatchState,
    referenceState,
    timestampState: input.extraction.timestampState,
    reasonCodes: uniqueStrings(reasons),
  }
}

export function deriveDecision(input: {
  amountMatchState: VerificationFieldState
  recipientMatchState: VerificationFieldState
  destinationMatchState: VerificationDestinationState
  qrKind: VerificationQrKind | null
  qrStructureValid: boolean | null
  qrCrcValid: boolean | null
  referenceState: VerificationReferenceState
  imageDuplicateState: VerificationImageDuplicateState
  reasonCodes: readonly string[]
}): { decision: PaymentVerificationDecision; suspicious: boolean; reasons: string[] } {
  const reasons = uniqueStrings(input.reasonCodes)
  const suspiciousReason = reasons.some((reason) => [
    'DUPLICATE_APPROVED_REFERENCE',
    'EXACT_APPROVED_IMAGE',
    'NORMALIZED_APPROVED_IMAGE',
    'NEAR_DUPLICATE_IMAGE',
    'QR_OCR_AMOUNT_CONTRADICTION',
    'QR_OCR_RECIPIENT_CONTRADICTION',
    'QR_OCR_DESTINATION_CONTRADICTION',
    'QR_OCR_REFERENCE_CONTRADICTION',
    'DESTINATION_MISMATCH',
    'RECIPIENT_AMBIGUOUS',
    'DESTINATION_AMBIGUOUS',
    'AMOUNT_AMBIGUOUS',
    'TIMESTAMP_ABNORMAL',
  ].includes(reason))

  if (suspiciousReason || input.imageDuplicateState !== 'NONE' || input.qrStructureValid === false) {
    if (input.imageDuplicateState === 'EXACT_APPROVED') reasons.push('EXACT_APPROVED_IMAGE')
    if (input.imageDuplicateState === 'NORMALIZED_APPROVED') reasons.push('NORMALIZED_APPROVED_IMAGE')
    if (input.imageDuplicateState === 'NEAR_MATCH') reasons.push('NEAR_DUPLICATE_IMAGE')
    return { decision: 'SUSPICIOUS', suspicious: true, reasons: uniqueStrings(reasons) }
  }

  const strongMatch = input.amountMatchState === 'MATCH'
    && input.recipientMatchState === 'MATCH'
    && input.destinationMatchState === 'MATCH'
    && input.qrKind === 'SLIP_VERIFICATION'
    && input.qrStructureValid === true
    && input.qrCrcValid === true
    && input.referenceState === 'VALID_UNIQUE'

  return {
    decision: strongMatch ? 'STRONG_MATCH' : 'MANUAL_REVIEW',
    suspicious: false,
    reasons,
  }
}
