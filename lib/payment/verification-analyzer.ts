import { exactImageHash, fingerprintReference, perceptualHashDistance } from './verification-hashes'
import { PaymentImageError, preparePaymentImage } from './verification-image'
import { extractPaymentSlipText, PaymentOcrError } from './verification-ocr'
import { decodePaymentQr } from './verification-qr'
import { canonicalAmount, uniqueStrings } from './verification-normalize'
import { deriveDecision, evaluateOcrRules } from './verification-rules'
import {
  DEFAULT_VERIFICATION_DESTINATION_SUFFIXES,
  DEFAULT_VERIFICATION_RECIPIENT_NAME,
  PAYMENT_VERIFICATION_ANALYZER_VERSION,
  type PaymentAnalyzerInput,
  type PaymentAnalyzerResult,
} from './verification-types'

function emptyErrorResult(input: {
  reasonCode: string
  durationMs: number
  rawImageHash: string | null
  normalizedImageHash?: string | null
  perceptualHash?: string | null
}): PaymentAnalyzerResult {
  return {
    analyzerVersion: PAYMENT_VERIFICATION_ANALYZER_VERSION,
    decision: 'ANALYZER_ERROR',
    state: 'ANALYZER_ERROR',
    detectedAmount: null,
    amountMatchState: 'UNKNOWN',
    recipientMatchState: 'UNKNOWN',
    destinationMatchState: 'UNKNOWN',
    qrKind: null,
    qrStructureValid: null,
    qrCrcValid: null,
    referenceExtracted: false,
    qrFormat: null,
    providerAttestation: 'NOT_CHECKED',
    referenceState: 'UNKNOWN',
    referenceFingerprint: null,
    rawImageHash: input.rawImageHash,
    normalizedImageHash: input.normalizedImageHash || null,
    perceptualHash: input.perceptualHash || null,
    imageDuplicateState: 'NONE',
    timestampState: 'UNKNOWN',
    reasonCodes: [input.reasonCode],
    durationMs: input.durationMs,
  }
}

function approvedImageDuplicateState(input: {
  rawImageHash: string
  normalizedImageHash: string
  perceptualHash: string
  approvedRawImageHashes: readonly string[]
  approvedNormalizedImageHashes: readonly string[]
  approvedPerceptualHashes: readonly string[]
}): PaymentAnalyzerResult['imageDuplicateState'] {
  if (input.approvedRawImageHashes.includes(input.rawImageHash)) return 'EXACT_APPROVED'
  if (input.approvedNormalizedImageHashes.includes(input.normalizedImageHash)) return 'NORMALIZED_APPROVED'
  if (input.approvedPerceptualHashes.some((candidate) => {
    const distance = perceptualHashDistance(input.perceptualHash, candidate)
    return distance !== null && distance <= 4
  })) return 'NEAR_MATCH'
  return 'NONE'
}

function canonicalReference(qr: ReturnType<typeof decodePaymentQr>, ocrReference: string | null): string | null {
  const reference = qr.reference || ocrReference
  if (!reference) return null
  const namespace = qr.referenceNamespace || 'BANK:OCR'
  return `${namespace}:${reference}`
}

export type ApprovedReplayMatches = {
  reference: boolean
  rawImage: boolean
  normalizedImage: boolean
  nearImage: boolean
}

/**
 * Apply replay-ledger results after analysis. The runner deliberately queries
 * each identity with an indexed point lookup instead of loading the ledger;
 * this pure second phase keeps the expensive OCR work single-pass.
 */
export function applyApprovedReplayProtection(
  result: PaymentAnalyzerResult,
  matches: ApprovedReplayMatches,
): PaymentAnalyzerResult {
  if (result.decision === 'ANALYZER_ERROR') return result

  const referenceState = matches.reference && result.referenceFingerprint
    ? 'DUPLICATE_APPROVED' as const
    : result.referenceState
  const imageDuplicateState = matches.rawImage
    ? 'EXACT_APPROVED' as const
    : matches.normalizedImage
      ? 'NORMALIZED_APPROVED' as const
      : matches.nearImage
        ? 'NEAR_MATCH' as const
        : result.imageDuplicateState
  const reasonCodes = [
    ...result.reasonCodes,
    ...(referenceState === 'DUPLICATE_APPROVED' ? ['DUPLICATE_APPROVED_REFERENCE'] : []),
  ]
  const derived = deriveDecision({
    amountMatchState: result.amountMatchState,
    recipientMatchState: result.recipientMatchState,
    destinationMatchState: result.destinationMatchState,
    qrKind: result.qrKind,
    qrStructureValid: result.qrStructureValid,
    qrCrcValid: result.qrCrcValid,
    referenceState,
    imageDuplicateState,
    reasonCodes,
  })

  return {
    ...result,
    decision: derived.decision,
    state: derived.decision,
    referenceState,
    imageDuplicateState,
    reasonCodes: derived.reasons,
  }
}

/**
 * Deterministic shadow analyzer. It deliberately returns a decision only;
 * database state changes happen in the lease/result RPCs, never in this pure
 * evidence-processing layer.
 */
export async function analyzePaymentSlip(input: PaymentAnalyzerInput): Promise<PaymentAnalyzerResult> {
  const startedAt = Date.now()
  const rawImageHash = Buffer.isBuffer(input.image) && input.image.length > 0
    ? exactImageHash(input.image)
    : null
  const expectedAmount = canonicalAmount(input.expectedAmount)
  if (!expectedAmount) {
    return emptyErrorResult({ reasonCode: 'EXPECTED_AMOUNT_INVALID', durationMs: Date.now() - startedAt, rawImageHash })
  }

  if (input.mimeType === 'application/pdf') {
    return {
      ...emptyErrorResult({ reasonCode: 'PDF_MANUAL_ONLY', durationMs: Date.now() - startedAt, rawImageHash }),
      decision: 'MANUAL_REVIEW',
      state: 'MANUAL_REVIEW',
      reasonCodes: ['PDF_MANUAL_ONLY'],
    }
  }

  try {
    const expectedRecipientName = input.expectedRecipientName || DEFAULT_VERIFICATION_RECIPIENT_NAME
    const destinationSuffixes = input.destinationSuffixes?.length
      ? input.destinationSuffixes
      : DEFAULT_VERIFICATION_DESTINATION_SUFFIXES
    const prepared = await preparePaymentImage(input.image, input.mimeType)
    const qr = decodePaymentQr(prepared)
    const extraction = await extractPaymentSlipText(prepared.ocrImage, expectedRecipientName)

    // QR destination is independent evidence. It is merged into the field
    // candidates so a wrong-but-readable destination becomes MISMATCH, while
    // an absent destination remains UNKNOWN and therefore manual-only.
    const destinationCandidates = uniqueStrings([
      ...extraction.destinationCandidates,
      qr.recipient,
    ])
    const qrReference = qr.reference
    const ocrReference = extraction.referenceCandidates.length === 1
      ? extraction.referenceCandidates[0]
      : null
    const canonical = canonicalReference(qr, ocrReference)
    const fingerprint = canonical
      ? fingerprintReference(canonical, {
        secret: input.referenceHmacSecretV1 ?? input.referenceHmacSecret,
        activeVersion: input.referenceHmacActiveVersion,
      })
      : null
    const referenceFingerprint = fingerprint?.fingerprint || null
    const approvedReference = Boolean(referenceFingerprint && input.approvedReferenceFingerprints?.includes(referenceFingerprint))
    const imageDuplicateState = approvedImageDuplicateState({
      rawImageHash: prepared.rawImageHash,
      normalizedImageHash: prepared.normalizedImageHash,
      perceptualHash: prepared.perceptualHash,
      approvedRawImageHashes: input.approvedRawImageHashes || [],
      approvedNormalizedImageHashes: input.approvedNormalizedImageHashes || [],
      approvedPerceptualHashes: input.approvedPerceptualHashes || [],
    })

    const rules = evaluateOcrRules({
      extraction: { ...extraction, destinationCandidates },
      expectedAmount,
      expectedRecipientName,
      destinationSuffixes,
      qrAmount: qr.amount,
      qrRecipient: qr.recipient,
      qrRecipientName: qr.recipientName,
      qrReference,
      ocrDestinationCandidates: extraction.destinationCandidates,
      approvedReference,
    })
    const qrReason = qr.structureValid === false
      ? ['QR_INVALID_CRC_OR_STRUCTURE']
      : qr.structureValid === null
        ? ['QR_UNREADABLE']
        : qr.kind === 'PAYMENT_REQUEST'
          ? ['QR_PAYMENT_REQUEST_NOT_TRANSACTION_EVIDENCE']
          : qr.kind === 'UNKNOWN'
            ? ['QR_UNSUPPORTED_FORMAT']
          : []
    const referenceState = fingerprint || !canonical
      ? rules.referenceState
      : 'UNKNOWN'
    const derived = deriveDecision({
      amountMatchState: rules.amountMatchState,
      recipientMatchState: rules.recipientMatchState,
      destinationMatchState: rules.destinationMatchState,
      qrKind: qr.kind,
      qrStructureValid: qr.structureValid,
      qrCrcValid: qr.crcValid,
      referenceState,
      imageDuplicateState,
      reasonCodes: [
        ...rules.reasonCodes,
        ...qrReason,
        ...(canonical && !fingerprint ? ['REFERENCE_FINGERPRINT_UNAVAILABLE'] : []),
      ],
    })

    return {
      analyzerVersion: PAYMENT_VERIFICATION_ANALYZER_VERSION,
      decision: derived.decision,
      state: derived.decision,
      detectedAmount: rules.detectedAmount,
      amountMatchState: rules.amountMatchState,
      recipientMatchState: rules.recipientMatchState,
      destinationMatchState: rules.destinationMatchState,
      qrKind: qr.kind,
      qrStructureValid: qr.structureValid,
      qrCrcValid: qr.crcValid,
      referenceExtracted: qr.referenceExtracted,
      qrFormat: qr.format,
      providerAttestation: 'NOT_CHECKED',
      referenceState,
      referenceFingerprint,
      rawImageHash: prepared.rawImageHash,
      normalizedImageHash: prepared.normalizedImageHash,
      perceptualHash: prepared.perceptualHash,
      imageDuplicateState,
      timestampState: rules.timestampState,
      reasonCodes: derived.reasons,
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    const reasonCode = error instanceof PaymentImageError
      ? error.reasonCode
      : error instanceof PaymentOcrError
        ? error.reasonCode
      : 'ANALYZER_RUNTIME_ERROR'
    return emptyErrorResult({
      reasonCode,
      durationMs: Date.now() - startedAt,
      rawImageHash,
    })
  }
}
