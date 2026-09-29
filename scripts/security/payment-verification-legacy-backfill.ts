import { createAdminClient } from '../../lib/supabase/admin'
import { analyzePaymentSlip } from '../../lib/payment/verification-analyzer'
import {
  isValidPaymentVerificationHmacSecretV1,
  PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION,
} from '../../lib/payment/verification-hashes'
import {
  DEFAULT_VERIFICATION_DESTINATION_SUFFIXES,
  DEFAULT_VERIFICATION_RECIPIENT_NAME,
} from '../../lib/payment/verification-types'

const CONFIRMATION_ENV = 'PAYMENT_VERIFICATION_LEGACY_BACKFILL_CONFIRM'
const CONFIRMATION_VALUE = 'YES_I_AM_RUNNING_SOBDAI_PAYMENT_M13A_LEGACY_BACKFILL'

type BackfillStatus =
  | 'BACKFILLED'
  | 'PDF_MANUAL_ONLY'
  | 'MISSING_OBJECT'
  | 'UNSUPPORTED_REFERENCE'
  | 'UNREADABLE_EVIDENCE'
  | 'ANALYZER_ERROR'

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] || null : data
}

function safeReason(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 100)
  return normalized || fallback
}

function requireOperatorConfiguration() {
  if (process.env[CONFIRMATION_ENV] !== CONFIRMATION_VALUE) {
    throw new Error(`${CONFIRMATION_ENV} must equal the explicit operator confirmation string`)
  }

  const secret = process.env.PAYMENT_VERIFICATION_HMAC_SECRET_V1
  const activeVersion = process.env.PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION
  if (activeVersion !== PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION
      || !isValidPaymentVerificationHmacSecretV1(secret)) {
    throw new Error('PAYMENT_VERIFICATION_HMAC_SECRET_V1 / PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION are not valid for v1 backfill')
  }
}

async function record(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  status: BackfillStatus,
  reasonCode: string,
  result: {
    referenceFingerprint?: string | null
    rawImageHash?: string | null
    normalizedImageHash?: string | null
    perceptualHash?: string | null
  } = {},
) {
  const { data, error } = await admin.rpc('record_payment_verification_legacy_backfill', {
    p_submission_id: submissionId,
    p_status: status,
    p_reason_code: reasonCode,
    p_reference_fingerprint: result.referenceFingerprint || null,
    p_raw_image_hash: result.rawImageHash || null,
    p_normalized_image_hash: result.normalizedImageHash || null,
    p_perceptual_hash: result.perceptualHash || null,
  })
  if (error) throw error
  return firstRow(data as any)
}

async function run() {
  requireOperatorConfiguration()
  const admin = createAdminClient()

  const { data: started, error: startError } = await admin.rpc('start_payment_verification_legacy_backfill')
  if (startError) throw startError
  const start = firstRow(started as any) as {
    cutoff_at?: string
    already_complete?: boolean
    processed_count?: number
    unresolved_count?: number
  } | null
  if (!start?.cutoff_at) throw new Error('legacy replay backfill did not return a cutoff')

  if (start.already_complete === true) {
    console.log(JSON.stringify({ status: 'PASS', backfill: 'already-complete', processed: 0 }, null, 2))
    return
  }

  const { data: settings, error: settingsError } = await admin
    .from('payment_settings')
    .select('verification_recipient_name, verification_destination_suffixes')
    .eq('id', 1)
    .maybeSingle()
  if (settingsError || !settings) throw settingsError || new Error('verification settings are missing')

  let pageCount = 0
  let processedThisRun = 0
  let backfilled = Number(start.processed_count || 0)
  let unsupported = Number(start.unresolved_count || 0)
  while (true) {
    const { data: page, error: pageError } = await admin.rpc('get_payment_verification_legacy_backfill_page', {
      p_page_size: 100,
    })
    if (pageError) throw pageError
    const submissions = Array.isArray(page) ? page : []
    if (submissions.length === 0) break
    pageCount += 1

    for (const submission of submissions) {
    const priorBackfillStatus = ((submission as any).backfill_status ?? null) as BackfillStatus | null
    const mimeType = String((submission as any).mime_type || '')

    if (mimeType === 'application/pdf') {
      await record(admin, submission.id, 'PDF_MANUAL_ONLY', 'PDF_MANUAL_ONLY')
      if (priorBackfillStatus === null) unsupported += 1
      processedThisRun += 1
      continue
    }

    const { data: object, error: downloadError } = await admin.storage
      .from('payment-slips')
      .download((submission as any).storage_object_path)
    if (downloadError || !object) {
      await record(admin, submission.id, 'MISSING_OBJECT', 'STORAGE_OBJECT_MISSING')
      if (priorBackfillStatus === null) unsupported += 1
      processedThisRun += 1
      continue
    }

    let result
    try {
      result = await analyzePaymentSlip({
        image: Buffer.from(await object.arrayBuffer()),
        mimeType,
        expectedAmount: String((submission as any).amount ?? ''),
        expectedRecipientName: String((settings as any).verification_recipient_name || DEFAULT_VERIFICATION_RECIPIENT_NAME),
        destinationSuffixes: Array.isArray((settings as any).verification_destination_suffixes)
          ? (settings as any).verification_destination_suffixes
          : DEFAULT_VERIFICATION_DESTINATION_SUFFIXES,
        referenceHmacSecretV1: process.env.PAYMENT_VERIFICATION_HMAC_SECRET_V1,
        referenceHmacActiveVersion: process.env.PAYMENT_VERIFICATION_HMAC_ACTIVE_VERSION,
      })
    } catch {
      await record(admin, submission.id, 'ANALYZER_ERROR', 'ANALYZER_RUNTIME_ERROR')
      if (priorBackfillStatus === null) unsupported += 1
      processedThisRun += 1
      continue
    }

    if (result.decision === 'ANALYZER_ERROR') {
      await record(admin, submission.id, 'ANALYZER_ERROR', safeReason(result.reasonCodes[0], 'ANALYZER_ERROR'))
      if (priorBackfillStatus === null) unsupported += 1
      processedThisRun += 1
      continue
    }

    if (result.referenceFingerprint && result.rawImageHash && result.normalizedImageHash) {
      await record(admin, submission.id, 'BACKFILLED', 'MACHINE_IDENTITY_REPLAY_SAFE', result)
      backfilled += 1
      if (priorBackfillStatus !== null && priorBackfillStatus !== 'BACKFILLED') unsupported -= 1
      processedThisRun += 1
      continue
    }

    const status: BackfillStatus = result.referenceFingerprint
      ? 'UNREADABLE_EVIDENCE'
      : 'UNSUPPORTED_REFERENCE'
    await record(admin, submission.id, status, safeReason(result.reasonCodes[0], status), result)
    if (priorBackfillStatus === null) unsupported += 1
    processedThisRun += 1
    }
  }

  const { data: completed, error: completeError } = await admin.rpc('complete_payment_verification_legacy_backfill', {
    // The RPC reconciles these counters against its durable result table.
    p_total_count: backfilled + unsupported,
    p_backfilled_count: backfilled,
    p_unsupported_count: unsupported,
  })
  if (completeError) throw completeError
  const summary = firstRow(completed as any) as {
    complete?: boolean
    total_count?: number
    backfilled_count?: number
    unsupported_count?: number
  } | null

  console.log(JSON.stringify({
    status: summary?.complete === true ? 'PASS' : 'BLOCKED',
    cutoff: start.cutoff_at,
    pages: pageCount,
    processed_this_run: processedThisRun,
    total: summary?.total_count ?? start.processed_count ?? 0,
    backfilled: summary?.backfilled_count ?? backfilled,
    unsupported: summary?.unsupported_count ?? unsupported,
    activation_fence: summary?.complete === true,
  }, null, 2))

  if (summary?.complete !== true) process.exitCode = 2
}

run().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || 'unknown').slice(0, 64)
    : 'operator_backfill_failed'
  console.error(JSON.stringify({ status: 'FAIL', code }, null, 2))
  process.exitCode = 1
})
