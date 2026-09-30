import { requirePermission } from '@/lib/auth/server-protect'
import { hasPermission } from '@/lib/auth/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { ORDER_STATUS } from '@/lib/orderUtils'
import { MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import {
  getAdminReviewState,
  normalizeAdminReviewFilter,
  normalizeAnalyzerTriageFilter,
} from '@/lib/payment/admin-review'
import OrdersClient from './OrdersClient'

const EMPTY_ORDER_ID = '00000000-0000-0000-0000-000000000000'

function latestByOrder(rows: any[]) {
  const latest = new Map<string, any>()
  for (const row of rows) {
    if (!latest.has(row.order_id)) latest.set(row.order_id, row)
  }
  return latest
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('orders.read')
  const params = await searchParams

  const requestedPage = typeof params.page === 'string' ? parseInt(params.page, 10) : 1
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const search = typeof params.q === 'string' ? params.q.trim() : ''
  const requestedStatusFilter = typeof params.status === 'string' ? params.status : ''
  const normalizedStatusFilter = requestedStatusFilter.toLowerCase()
  const canReviewPayments = hasPermission(profile.role, 'financial.manage')
  const reviewFilter = normalizeAdminReviewFilter(
    params.review ?? (
      normalizedStatusFilter === 'payment_submitted'
        ? 'needs_review'
        : normalizedStatusFilter && normalizedStatusFilter !== 'all'
          ? 'all'
          : undefined
    ),
    canReviewPayments,
  )
  const analyzerFilter = normalizeAnalyzerTriageFilter(params.triage, canReviewPayments)
  const statusFilter = normalizedStatusFilter === 'payment_submitted'
    ? 'all'
    : (requestedStatusFilter || 'all')

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let paymentReviewOrderIds: string[] | null = null
  let paymentReviewUnavailable = false
  let adminSupabase: ReturnType<typeof createAdminClient> | null = null

  const getAdminSupabase = () => {
    if (adminSupabase) return adminSupabase
    try {
      adminSupabase = createAdminClient()
      return adminSupabase
    } catch (error) {
      console.error('[PAYMENT VERIFICATION] admin queue client unavailable:', error)
      return null
    }
  }

  const needsQueueProjection = canReviewPayments && (reviewFilter !== 'all' || analyzerFilter !== 'all')

  if (needsQueueProjection) {
    if (reviewFilter === 'needs_review' && analyzerFilter === 'all') {
      const { data: submittedPayments, error: paymentReviewError } = await supabase
        .from('payment_submissions')
        .select('order_id')
        .eq('status', 'submitted')

      if (paymentReviewError) {
        console.error('[PAYMENT] payment review queue query failed:', paymentReviewError.message)
        paymentReviewUnavailable = true
      } else {
        paymentReviewOrderIds = Array.from(
          new Set((submittedPayments || []).map((payment: any) => payment.order_id)),
        )
        const submittedOrderIds = new Set(paymentReviewOrderIds)
        const { data: latestQueuePayments, error: latestQueueError } = await supabase
          .from('payment_submissions')
          .select('id, order_id, status, submitted_at, created_at')
          .order('created_at', { ascending: false })

        if (latestQueueError) {
          console.error('[PAYMENT] payment review queue query failed:', latestQueueError.message)
          paymentReviewUnavailable = true
        } else {
          const latestQueueRows = latestByOrder(latestQueuePayments || [])
          paymentReviewOrderIds = Array.from(
            new Set(
              Array.from(latestQueueRows.values())
                .filter((payment: any) => payment.status === 'submitted' && submittedOrderIds.has(payment.order_id))
                .map((payment: any) => payment.order_id),
            ),
          )
        }
      }
    } else {
      const { data: queuePayments, error: queuePaymentsError } = await supabase
        .from('payment_submissions')
        .select('id, order_id, status, submitted_at, created_at')
        .order('created_at', { ascending: false })

      if (queuePaymentsError) {
        console.error('[PAYMENT] payment review queue query failed:', queuePaymentsError.message)
        paymentReviewUnavailable = true
      } else {
        const paymentRows = queuePayments || []
        const latestPayments = latestByOrder(paymentRows)
        const verificationBySubmissionId = new Map<string, any>()
        const needsVerificationRows = reviewFilter === 'checking' || analyzerFilter !== 'all'

        if (needsVerificationRows && paymentRows.length > 0) {
          const queueAdminSupabase = getAdminSupabase()
          if (!queueAdminSupabase) {
            paymentReviewUnavailable = true
          } else {
            const { data: verificationRows, error: verificationError } = await queueAdminSupabase
              .from('payment_verifications')
              .select('submission_id, order_id, state, decision, attempt_count, created_at, updated_at')
              .in('submission_id', paymentRows.map((payment: any) => payment.id))

            if (verificationError) {
              console.error('[PAYMENT VERIFICATION] admin queue query failed:', verificationError.code || 'unknown')
              paymentReviewUnavailable = true
            } else {
              for (const verification of verificationRows || []) {
                verificationBySubmissionId.set(verification.submission_id, verification)
              }
            }
          }
        }

        if (!paymentReviewUnavailable) {
          const candidateOrderIds = new Set<string>()

          if (reviewFilter === 'no_evidence') {
            const { data: pendingManualOrders, error: pendingManualError } = await supabase
              .from('orders')
              .select('id')
              .eq('status', ORDER_STATUS.PENDING)
              .eq('payment_provider', MANUAL_PAYMENT_PROVIDER)

            if (pendingManualError) {
              console.error('[PAYMENT] no-evidence queue query failed:', pendingManualError.message)
              paymentReviewUnavailable = true
            } else {
              const ordersWithEvidence = new Set(paymentRows.map((payment: any) => payment.order_id))
              for (const order of pendingManualOrders || []) {
                if (!ordersWithEvidence.has(order.id)) candidateOrderIds.add(order.id)
              }
            }
          } else {
            for (const payment of latestPayments.values()) {
              const verification = verificationBySubmissionId.get(payment.id)
              const reviewMatches = reviewFilter === 'all'
                || (reviewFilter === 'needs_review' && payment.status === 'submitted')
                || (reviewFilter === 'checking' && payment.status === 'submitted' && verification?.state === 'AUTO_CHECKING')
                || (reviewFilter === 'rejected' && payment.status === 'rejected')
              const triageMatches = analyzerFilter === 'all'
                || (analyzerFilter === 'not_analyzed' && payment.status === 'submitted' && !verification)
                || (payment.status === 'submitted' && verification?.state === analyzerFilter)

              if (reviewMatches && triageMatches) candidateOrderIds.add(payment.order_id)
            }
          }

          paymentReviewOrderIds = Array.from(candidateOrderIds)
        }
      }
    }
  }

  let query = supabase
    .from('orders')
    .select('*, profiles!inner(email), packages!inner(name)', { count: 'exact' })

  if (search) query = query.ilike('profiles.email', `%${search}%`)

  if (paymentReviewUnavailable) {
    query = query.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (paymentReviewOrderIds) {
    if (reviewFilter !== 'all' || analyzerFilter !== 'all') {
      query = query
        .eq('status', ORDER_STATUS.PENDING)
        .eq('payment_provider', MANUAL_PAYMENT_PROVIDER)
    }
    if (normalizedStatusFilter && normalizedStatusFilter !== 'all' && normalizedStatusFilter !== 'payment_submitted') {
      query = query.eq('status', normalizedStatusFilter)
    }
    query = paymentReviewOrderIds.length > 0
      ? query.in('id', paymentReviewOrderIds)
      : query.eq('id', EMPTY_ORDER_ID)
  } else if (normalizedStatusFilter && normalizedStatusFilter !== 'all') {
    if (normalizedStatusFilter !== 'payment_submitted') {
      query = query.eq('status', normalizedStatusFilter)
    }
  } else if (reviewFilter !== 'all' || analyzerFilter !== 'all') {
    query = query
      .eq('status', ORDER_STATUS.PENDING)
      .eq('payment_provider', MANUAL_PAYMENT_PROVIDER)
  }

  query = query.range(from, to).order('created_at', { ascending: false })
  const { data: rawOrders, count } = await query

  const orderIds = (rawOrders || []).map((order: any) => order.id)
  const paymentRowsQuery = canReviewPayments && orderIds.length > 0
    ? await supabase
      .from('payment_submissions')
      .select('id, order_id, status, submitted_at, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
    : { data: [] as any[], error: null }
  const { data: paymentRows, error: paymentRowsError } = paymentRowsQuery

  const latestPaymentByOrder = latestByOrder(paymentRows || [])
  const paymentSubmissionCountByOrder = new Map<string, number>()
  const paymentSubmissionsByOrder = new Map<string, any[]>()
  for (const payment of paymentRows || []) {
    paymentSubmissionCountByOrder.set(
      payment.order_id,
      (paymentSubmissionCountByOrder.get(payment.order_id) || 0) + 1,
    )
    const submissions = paymentSubmissionsByOrder.get(payment.order_id) || []
    submissions.push(payment)
    paymentSubmissionsByOrder.set(payment.order_id, submissions)
  }

  let analyzerDataLoaded = false
  const verificationBySubmissionId = new Map<string, any>()
  const visibleSubmissionIds = (paymentRows || []).map((payment: any) => payment.id)
  if (canReviewPayments && visibleSubmissionIds.length > 0) {
    const visibleAdminSupabase = getAdminSupabase()
    if (visibleAdminSupabase) {
      const { data: verificationRows, error: verificationError } = await visibleAdminSupabase
        .from('payment_verifications')
        .select('submission_id, order_id, state, decision, attempt_count, created_at, updated_at')
        .in('submission_id', visibleSubmissionIds)

      if (verificationError) {
        console.error('[PAYMENT VERIFICATION] visible queue query failed:', verificationError.code || 'unknown')
      } else {
        analyzerDataLoaded = true
        for (const verification of verificationRows || []) {
          verificationBySubmissionId.set(verification.submission_id, verification)
        }
      }
    }
  } else if (canReviewPayments && !paymentRowsError) {
    analyzerDataLoaded = true
  }

  const orders = (rawOrders || []).map((order: any) => {
    const latestPayment = latestPaymentByOrder.get(order.id)
    const latestVerification = latestPayment
      ? verificationBySubmissionId.get(latestPayment.id)
      : null
    const submissions = paymentSubmissionsByOrder.get(order.id) || []

    return {
      ...order,
      user_email: order.profiles?.email || 'Unknown User',
      package_name: order.packages?.name || 'Unknown Package',
      manual_payment_status: latestPayment?.status || null,
      manual_payment_submitted_at: latestPayment?.submitted_at || null,
      manual_payment_submission_count: paymentSubmissionCountByOrder.get(order.id) || 0,
      manual_payment_all_rejected: submissions.length > 0 && submissions.every((payment: any) => payment.status === 'rejected'),
      manual_payment_analyzer_state: latestVerification?.state || null,
      manual_payment_analyzer_attempt_count: latestVerification?.attempt_count == null
        ? null
        : Number(latestVerification.attempt_count),
      manual_payment_review_state: getAdminReviewState({
        orderStatus: order.status,
        paymentProvider: order.payment_provider,
        latestSubmissionStatus: latestPayment?.status || null,
        submissionCount: submissions.length,
        analyzerState: latestVerification?.state || null,
      }),
    }
  })

  const totalPages = count ? Math.ceil(count / limit) : 0
  const { data: users } = await supabase.from('profiles').select('id, email').order('email')
  const { data: packages } = await supabase.from('packages').select('id, name').order('name')

  return (
    <OrdersClient
      orders={orders}
      users={users || []}
      packages={packages || []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      reviewFilter={reviewFilter}
      analyzerFilter={analyzerFilter}
      canManagePayments={canReviewPayments}
      paymentEvidenceLoaded={canReviewPayments && !paymentRowsError}
      analyzerDataLoaded={analyzerDataLoaded}
      paymentReviewUnavailable={paymentReviewUnavailable}
    />
  )
}
