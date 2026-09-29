import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzePaymentSlip, applyApprovedReplayProtection, type ApprovedReplayMatches } from './verification-analyzer'
import { perceptualHashDistance } from './verification-hashes'
import {
  DEFAULT_VERIFICATION_DESTINATION_SUFFIXES,
  DEFAULT_VERIFICATION_RECIPIENT_NAME,
  PAYMENT_VERIFICATION_ANALYZER_VERSION,
  type PaymentAnalyzerResult,
} from './verification-types'

type AdminClient = ReturnType<typeof createAdminClient>

type VerificationRunnerResult = {
  submissionId: string
  verificationId: string | null
  state: string
  decision: string | null
  leaseAcquired: boolean
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] || null : data
}

function errorResult(reasonCode: string): PaymentAnalyzerResult {
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
    rawImageHash: null,
    normalizedImageHash: null,
    perceptualHash: null,
    imageDuplicateState: 'NONE',
    timestampState: 'UNKNOWN',
    reasonCodes: [reasonCode],
    durationMs: 0,
  }
}

const APPROVED_PERCEPTUAL_HASH_SCAN_LIMIT = 200

async function hasApprovedIdentity(admin: AdminClient, column: string, value: string | null): Promise<boolean> {
  if (!value) return false
  const { data, error } = await admin
    .from('approved_payment_evidence')
    .select('id')
    .eq(column, value)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

async function findApprovedReplayMatches(admin: AdminClient, result: PaymentAnalyzerResult): Promise<ApprovedReplayMatches> {
  const [reference, rawImage, normalizedImage] = await Promise.all([
    hasApprovedIdentity(admin, 'reference_fingerprint', result.referenceFingerprint),
    hasApprovedIdentity(admin, 'raw_image_hash', result.rawImageHash),
    hasApprovedIdentity(admin, 'normalized_image_hash', result.normalizedImageHash),
  ])

  let nearImage = false
  if (result.perceptualHash) {
    const { data, error } = await admin
      .from('approved_payment_evidence')
      .select('perceptual_hash')
      .not('perceptual_hash', 'is', null)
      .order('approved_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(APPROVED_PERCEPTUAL_HASH_SCAN_LIMIT)
    if (error) throw error
    nearImage = (data || []).some((row: any) => {
      const distance = perceptualHashDistance(result.perceptualHash!, row.perceptual_hash)
      return distance !== null && distance <= 4
    })
  }

  return { reference, rawImage, normalizedImage, nearImage }
}

async function complete(
  admin: AdminClient,
  verificationId: string,
  leaseToken: string,
  result: PaymentAnalyzerResult,
) {
  const { data, error } = await admin.rpc('complete_payment_verification', {
    p_verification_id: verificationId,
    p_lease_token: leaseToken,
    p_result: result,
  })
  if (error) throw error
  return firstRow(data as any)
}

/**
 * Claim, analyze, and durably complete one submission. The claim/result RPCs
 * make this safe to call from upload retries, an admin resume action, or a
 * future worker without relying on Next.js after() semantics.
 */
export async function runPaymentVerificationForSubmission(
  submissionId: string,
  options: { adminClient?: AdminClient; force?: boolean } = {},
): Promise<VerificationRunnerResult> {
  const admin = options.adminClient || createAdminClient()
  const leaseToken = randomUUID()
  const { data: claimData, error: claimError } = await admin.rpc('start_payment_verification', {
    p_submission_id: submissionId,
    p_lease_token: leaseToken,
    p_force: options.force === true,
  })

  if (claimError) throw claimError
  const claim = firstRow(claimData as any) as {
    verification_id?: string
    state?: string
    decision?: string | null
    lease_acquired?: boolean
    order_id?: string
  } | null

  if (!claim?.verification_id || claim.lease_acquired !== true) {
    return {
      submissionId,
      verificationId: claim?.verification_id || null,
      state: claim?.state || 'UNKNOWN',
      decision: claim?.decision || null,
      leaseAcquired: false,
    }
  }

  let result: PaymentAnalyzerResult
  try {
    const { data: submission, error: submissionError } = await admin
      .from('payment_submissions')
      .select('id, order_id, storage_object_path, mime_type, status, orders!inner(amount, status, payment_provider)')
      .eq('id', submissionId)
      .maybeSingle()
    if (submissionError || !submission) throw submissionError || new Error('submission_missing')

    const order = Array.isArray((submission as any).orders)
      ? (submission as any).orders[0]
      : (submission as any).orders
    const amount = String(order?.amount ?? '')
    const { data: settings, error: settingsError } = await admin
      .from('payment_settings')
      .select('verification_recipient_name, verification_destination_suffixes')
      .eq('id', 1)
      .maybeSingle()
    if (settingsError || !settings) throw settingsError || new Error('verification_settings_missing')

    const { data: object, error: downloadError } = await admin.storage
      .from('payment-slips')
      .download((submission as any).storage_object_path)
    if (downloadError || !object) throw downloadError || new Error('payment_slip_download_failed')

    result = await analyzePaymentSlip({
      image: Buffer.from(await object.arrayBuffer()),
      mimeType: String((submission as any).mime_type || ''),
      expectedAmount: amount,
      expectedRecipientName: String((settings as any).verification_recipient_name || DEFAULT_VERIFICATION_RECIPIENT_NAME),
      destinationSuffixes: Array.isArray((settings as any).verification_destination_suffixes)
        ? (settings as any).verification_destination_suffixes
        : DEFAULT_VERIFICATION_DESTINATION_SUFFIXES,
      referenceHmacSecretV1: process.env.PAYMENT_VERIFICATION_HMAC_SECRET_V1,
      referenceHmacActiveVersion: process.env.PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION,
    })
    result = applyApprovedReplayProtection(result, await findApprovedReplayMatches(admin, result))
  } catch (error) {
    // Do not leak private paths, OCR text, QR payloads, or object URLs. The
    // durable reason is intentionally bounded and operator-readable.
    result = errorResult(error instanceof Error && error.message === 'PDF_MANUAL_ONLY'
      ? 'PDF_MANUAL_ONLY'
      : 'ANALYZER_RUNTIME_ERROR')
  }

  const completed = await complete(admin, claim.verification_id, leaseToken, result)
  const completedState = String((completed as any)?.state || result.state)
  const completedDecision = (completed as any)?.decision || result.decision

  return {
    submissionId,
    verificationId: claim.verification_id,
    state: completedState,
    decision: completedDecision,
    leaseAcquired: true,
  }
}
