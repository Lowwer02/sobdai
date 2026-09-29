export const PAYMENT_VERIFICATION_ANALYZER_VERSION = 'm1.3a-shadow-1' as const

export const DEFAULT_VERIFICATION_RECIPIENT_NAME = 'กิตติพงษ์'
export const DEFAULT_VERIFICATION_DESTINATION_SUFFIXES = ['1853', '853'] as const

export const PAYMENT_VERIFICATION_STATES = [
  'AUTO_CHECKING',
  'STRONG_MATCH',
  'MANUAL_REVIEW',
  'SUSPICIOUS',
  'ANALYZER_ERROR',
  'AUTO_APPROVED',
  'APPROVED_MANUAL',
  'REJECTED_MANUAL',
] as const

export type PaymentVerificationState = typeof PAYMENT_VERIFICATION_STATES[number]
export type PaymentVerificationDecision =
  | 'STRONG_MATCH'
  | 'MANUAL_REVIEW'
  | 'SUSPICIOUS'
  | 'ANALYZER_ERROR'

export type VerificationFieldState =
  | 'MATCH'
  | 'MISMATCH'
  | 'UNKNOWN'
  | 'AMBIGUOUS'

export type VerificationDestinationState = VerificationFieldState

export type VerificationQrKind = 'PAYMENT_REQUEST' | 'SLIP_VERIFICATION' | 'UNKNOWN'

export type PaymentProviderAttestationState =
  | 'NOT_CHECKED'
  | 'VERIFIED'
  | 'FAILED'
  | 'UNAVAILABLE'

export type VerificationReferenceState =
  | 'VALID_UNIQUE'
  | 'DUPLICATE_APPROVED'
  | 'UNKNOWN'
  | 'AMBIGUOUS'

export type VerificationImageDuplicateState =
  | 'NONE'
  | 'EXACT_APPROVED'
  | 'NORMALIZED_APPROVED'
  | 'NEAR_MATCH'

export type VerificationTimestampState = 'VALID' | 'UNKNOWN' | 'ABNORMAL'

export type PaymentAnalyzerInput = {
  image: Buffer
  mimeType: string
  expectedAmount: string
  expectedRecipientName?: string
  destinationSuffixes?: readonly string[]
  approvedReferenceFingerprints?: readonly string[]
  approvedRawImageHashes?: readonly string[]
  approvedNormalizedImageHashes?: readonly string[]
  approvedPerceptualHashes?: readonly string[]
  /** Legacy alias retained for internal callers during the v1 config cutover. */
  referenceHmacSecret?: string
  referenceHmacSecretV1?: string
  referenceHmacActiveVersion?: string
}

export type PaymentAnalyzerResult = {
  analyzerVersion: typeof PAYMENT_VERIFICATION_ANALYZER_VERSION
  decision: PaymentVerificationDecision
  state: Extract<PaymentVerificationState, 'STRONG_MATCH' | 'MANUAL_REVIEW' | 'SUSPICIOUS' | 'ANALYZER_ERROR'>
  detectedAmount: string | null
  amountMatchState: VerificationFieldState
  recipientMatchState: VerificationFieldState
  destinationMatchState: VerificationDestinationState
  qrKind: VerificationQrKind | null
  qrStructureValid: boolean | null
  qrCrcValid: boolean | null
  referenceExtracted: boolean
  qrFormat: string | null
  providerAttestation: PaymentProviderAttestationState
  referenceState: VerificationReferenceState
  referenceFingerprint: string | null
  rawImageHash: string | null
  normalizedImageHash: string | null
  perceptualHash: string | null
  imageDuplicateState: VerificationImageDuplicateState
  timestampState: VerificationTimestampState
  reasonCodes: string[]
  durationMs: number
}

export type PaymentVerificationMetrics = {
  totalAnalyzed: number
  strongMatch: number
  manualReview: number
  suspicious: number
  analyzerError: number
  averageDurationMs: number | null
  reasonCodes: Record<string, number>
}

export function isPaymentVerificationState(value: unknown): value is PaymentVerificationState {
  return typeof value === 'string'
    && (PAYMENT_VERIFICATION_STATES as readonly string[]).includes(value)
}
