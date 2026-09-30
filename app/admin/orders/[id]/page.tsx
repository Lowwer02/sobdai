import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/payment/manual'
import OrderPaymentDetailClient from './OrderPaymentDetailClient'

function relationObject(value: any) {
  return Array.isArray(value) ? value[0] : value
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && code.length > 0) return code.slice(0, 64)
  }
  return 'unknown'
}
export default async function OrderPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!isUuid(id)) return notFound()

  const { supabase } = await requirePermission('financial.manage')
  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  try {
    adminSupabase = createAdminClient()
  } catch (error) {
    console.error('[PAYMENT] private service client unavailable:', safeErrorCode(error))
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, package_id, amount, status, payment_provider, created_at, updated_at, profiles!inner(email), packages!inner(name, slug)')
    .eq('id', id)
    .maybeSingle()

  if (orderError || !order) return notFound()

  const { data: rawSubmissions, error: submissionsError } = await supabase
    .from('payment_submissions')
    .select('id, order_id, storage_object_path, original_filename, mime_type, file_size_bytes, status, submitted_at, reviewed_at, reviewed_by, rejection_reason, created_at')
    .eq('order_id', id)
    .order('created_at', { ascending: false })

  if (submissionsError) {
    console.error('[PAYMENT] payment detail query failed:', safeErrorCode(submissionsError))
  }

  const submissionIds = (rawSubmissions || []).map((submission: any) => submission.id)
  let rawVerifications: any[] = []
  if (submissionIds.length > 0 && adminSupabase) {
    const { data, error } = await adminSupabase
      .from('payment_verifications')
      .select('submission_id, state, decision, analyzer_version, attempt_count, detected_amount, amount_match_state, recipient_match_state, destination_match_state, qr_kind, qr_structure_valid, qr_crc_valid, reference_extracted, qr_format, reference_state, image_duplicate_state, timestamp_state, reason_codes, duration_ms, completed_at')
      .in('submission_id', submissionIds)

    if (error) {
      // The page remains compatible with the pre-M1.3 schema during a
      // DB-first rollout; only the optional QA panel is unavailable.
      console.error('[PAYMENT VERIFICATION] detail query unavailable:', error.code || 'unknown')
    } else {
      rawVerifications = data || []
    }
  }

  let shadowMetrics: any = null
  const { data: rawShadowMetrics, error: shadowMetricsError } = await supabase
    .rpc('get_payment_verification_shadow_metrics')
  if (shadowMetricsError) {
    console.error('[PAYMENT VERIFICATION] shadow metrics unavailable:', shadowMetricsError.code || 'unknown')
  } else {
    shadowMetrics = Array.isArray(rawShadowMetrics) ? rawShadowMetrics[0] || null : rawShadowMetrics
  }

  const verificationBySubmissionId = new Map(
    rawVerifications.map((verification) => [verification.submission_id, verification]),
  )

  const submissions = await Promise.all((rawSubmissions || []).map(async (submission: any) => {
    let signedUrl: string | null = null

    if (adminSupabase) {
      const { data, error } = await adminSupabase.storage
        .from('payment-slips')
        .createSignedUrl(submission.storage_object_path, 300)

      if (error) {
        console.error('[PAYMENT] payment slip signed URL failed:', safeErrorCode(error))
      } else {
        signedUrl = data?.signedUrl || null
      }
    }

    return {
      id: submission.id,
      status: submission.status,
      originalFilename: submission.original_filename,
      mimeType: submission.mime_type,
      fileSizeBytes: Number(submission.file_size_bytes),
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at,
      reviewedBy: submission.reviewed_by,
      rejectionReason: submission.rejection_reason,
      createdAt: submission.created_at,
      signedUrl,
      verification: verificationBySubmissionId.get(submission.id) ? {
        state: verificationBySubmissionId.get(submission.id).state,
        decision: verificationBySubmissionId.get(submission.id).decision,
        analyzerVersion: verificationBySubmissionId.get(submission.id).analyzer_version,
        attemptCount: verificationBySubmissionId.get(submission.id).attempt_count == null
          ? null
          : Number(verificationBySubmissionId.get(submission.id).attempt_count),
        detectedAmount: verificationBySubmissionId.get(submission.id).detected_amount === null
          ? null
          : Number(verificationBySubmissionId.get(submission.id).detected_amount),
        amountMatchState: verificationBySubmissionId.get(submission.id).amount_match_state,
        recipientMatchState: verificationBySubmissionId.get(submission.id).recipient_match_state,
        destinationMatchState: verificationBySubmissionId.get(submission.id).destination_match_state,
        qrKind: verificationBySubmissionId.get(submission.id).qr_kind,
        qrStructureValid: verificationBySubmissionId.get(submission.id).qr_structure_valid,
        qrCrcValid: verificationBySubmissionId.get(submission.id).qr_crc_valid,
        referenceExtracted: verificationBySubmissionId.get(submission.id).reference_extracted,
        qrFormat: verificationBySubmissionId.get(submission.id).qr_format,
        referenceState: verificationBySubmissionId.get(submission.id).reference_state,
        imageDuplicateState: verificationBySubmissionId.get(submission.id).image_duplicate_state,
        timestampState: verificationBySubmissionId.get(submission.id).timestamp_state,
        reasonCodes: Array.isArray(verificationBySubmissionId.get(submission.id).reason_codes)
          ? verificationBySubmissionId.get(submission.id).reason_codes.slice(0, 24)
          : [],
        durationMs: verificationBySubmissionId.get(submission.id).duration_ms,
        completedAt: verificationBySubmissionId.get(submission.id).completed_at,
      } : null,
    }
  }))

  const profile = relationObject(order.profiles)
  const pkg = relationObject(order.packages)

  return (
    <OrderPaymentDetailClient
      order={{
        id: order.id,
        userId: order.user_id,
        packageId: order.package_id,
        amount: Number(order.amount),
        status: order.status,
        paymentProvider: order.payment_provider,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        userEmail: profile?.email || 'Unknown User',
        packageName: pkg?.name || 'Unknown Package',
        packageSlug: pkg?.slug || null,
      }}
      submissions={submissions}
      submissionsLoaded={!submissionsError}
      shadowMetrics={shadowMetrics ? {
        totalAnalyzed: Number(shadowMetrics.total_analyzed || 0),
        strongMatch: Number(shadowMetrics.strong_match || 0),
        manualReview: Number(shadowMetrics.manual_review || 0),
        suspicious: Number(shadowMetrics.suspicious || 0),
        analyzerError: Number(shadowMetrics.analyzer_error || 0),
        averageDurationMs: shadowMetrics.average_duration_ms === null
          ? null
          : Number(shadowMetrics.average_duration_ms),
      } : null}
    />
  )
}
