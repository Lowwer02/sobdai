import { requirePermission } from '@/lib/auth/server-protect'
import { createAdminClient } from '@/lib/supabase/admin'
import { ORDER_STATUS } from '@/lib/orderUtils'
import { MANUAL_PAYMENT_PROVIDER, PAYMENT_SUBMISSION_MAX_COUNT } from '@/lib/payment/manual'
import {
  ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH,
  ADMIN_REVIEW_ORDER_BATCH_SIZE,
  ADMIN_REVIEW_ORDER_SELECT,
  ADMIN_REVIEW_PAGE_SIZE,
  fetchAdminReviewVerificationRows,
  collectBoundedAdminReviewMatches,
  getAdminReviewCapabilities,
  getAdminReviewCursor,
  getAdminReviewSubmissionAnomaly,
  getAdminReviewState,
  latestByOrder,
  matchesAdminReviewQueue,
  normalizeAdminReviewFilter,
  normalizeAnalyzerTriageFilter,
  parseAdminReviewCursor,
  serializeAdminReviewCursor,
  type AdminReviewQueueOrder,
  type AdminReviewQueuePackage,
  type AdminReviewQueueUser,
  type AdminReviewFilter,
  type AnalyzerTriageFilter,
} from '@/lib/payment/admin-review'
import OrdersClient from './OrdersClient'

function relationObject(value: any) {
  return Array.isArray(value) ? value[0] : value
}

function decorateOrders(
  rawOrders: any[],
  paymentRows: any[],
  verificationBySubmissionId: Map<string, any>,
): AdminReviewQueueOrder[] {
  const latestPaymentByOrder = latestByOrder(paymentRows)
  const paymentSubmissionCountByOrder = new Map<string, number>()
  const paymentSubmissionsByOrder = new Map<string, any[]>()

  for (const payment of paymentRows) {
    paymentSubmissionCountByOrder.set(
      payment.order_id,
      (paymentSubmissionCountByOrder.get(payment.order_id) || 0) + 1,
    )
    const submissions = paymentSubmissionsByOrder.get(payment.order_id) || []
    submissions.push(payment)
    paymentSubmissionsByOrder.set(payment.order_id, submissions)
  }

  return rawOrders.map((order: any) => {
    const latestPayment = latestPaymentByOrder.get(order.id)
    const latestVerification = latestPayment
      ? verificationBySubmissionId.get(latestPayment.id)
      : null
    const submissions = paymentSubmissionsByOrder.get(order.id) || []
    const profile = relationObject(order.profiles)
    const pkg = relationObject(order.packages)

    return {
      id: order.id,
      amount: order.amount,
      status: order.status,
      payment_provider: order.payment_provider || null,
      created_at: order.created_at,
      user_email: profile?.email || 'Unknown User',
      package_name: pkg?.name || 'Unknown Package',
      manual_payment_status: latestPayment?.status || null,
      manual_payment_submitted_at: latestPayment?.submitted_at || null,
      manual_payment_submission_count: paymentSubmissionCountByOrder.get(order.id) || 0,
      manual_payment_all_rejected: submissions.length > 0
        && submissions.every((payment: any) => payment.status === 'rejected'),
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
}

function applyOrderFilters(
  query: any,
  input: {
    search: string
    statusFilter: string
    reviewFilter: AdminReviewFilter
    analyzerFilter: AnalyzerTriageFilter
  },
) {
  let nextQuery = query

  if (input.search) nextQuery = nextQuery.ilike('profiles.email', `%${input.search}%`)

  if (input.reviewFilter !== 'all' || input.analyzerFilter !== 'all') {
    nextQuery = nextQuery
      .eq('status', ORDER_STATUS.PENDING)
      .eq('payment_provider', MANUAL_PAYMENT_PROVIDER)
  }

  if (input.statusFilter && input.statusFilter !== 'all' && input.statusFilter !== 'payment_submitted') {
    nextQuery = nextQuery.eq('status', input.statusFilter)
  }

  return nextQuery
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('orders.read')
  const params = await searchParams
  const requestedPage = typeof params.page === 'string' ? parseInt(params.page, 10) : 1
  const safeRequestedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const search = typeof params.q === 'string' ? params.q.trim() : ''
  const requestedStatusFilter = typeof params.status === 'string' ? params.status : ''
  const normalizedStatusFilter = requestedStatusFilter.toLowerCase()
  const { canManageFinancial } = getAdminReviewCapabilities(profile.role)
  const reviewFilter = normalizeAdminReviewFilter(
    params.review ?? (
      normalizedStatusFilter === 'payment_submitted'
        ? 'needs_review'
        : normalizedStatusFilter && normalizedStatusFilter !== 'all'
          ? 'all'
          : undefined
    ),
    canManageFinancial,
  )
  const analyzerFilter = normalizeAnalyzerTriageFilter(params.triage, canManageFinancial)
  const statusFilter = normalizedStatusFilter === 'payment_submitted'
    ? 'all'
    : (normalizedStatusFilter || 'all')
  const needsQueueProjection = canManageFinancial && (reviewFilter !== 'all' || analyzerFilter !== 'all')
  const requestedQueueCursor = parseAdminReviewCursor(params.cursor)
  const queueStartCursor = requestedQueueCursor ? serializeAdminReviewCursor(requestedQueueCursor) : null
  const page = needsQueueProjection && safeRequestedPage > 1 && !requestedQueueCursor
    ? 1
    : safeRequestedPage
  const from = (page - 1) * ADMIN_REVIEW_PAGE_SIZE
  const to = from + ADMIN_REVIEW_PAGE_SIZE

  let paymentReviewUnavailable = false
  let analyzerDataLoaded = !canManageFinancial
  let paymentEvidenceLoaded = false
  let queueHasMore = false
  let queueResultCapped = false
  let queueNextCursor: string | null = null
  let paymentReviewIntegrityAnomaly = false
  let totalPages = 0
  let orders: AdminReviewQueueOrder[] = []
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

  if (needsQueueProjection) {
    const needsVerificationRows = reviewFilter === 'needs_review'
      || reviewFilter === 'checking'
      || analyzerFilter !== 'all'

    if (needsVerificationRows) {
      analyzerDataLoaded = Boolean(getAdminSupabase())
      if (!analyzerDataLoaded) paymentReviewUnavailable = true
    } else {
      analyzerDataLoaded = true
    }

    let batchQueryError: any = null
    const boundedResult = !paymentReviewUnavailable
      ? await collectBoundedAdminReviewMatches({
        targetCount: ADMIN_REVIEW_PAGE_SIZE,
        startCursor: queueStartCursor,
        fetchBatch: async (cursor) => {
          let orderQuery = supabase
            .from('orders')
            .select(ADMIN_REVIEW_ORDER_SELECT)

          orderQuery = applyOrderFilters(orderQuery, {
            search,
            statusFilter,
            reviewFilter,
            analyzerFilter,
          })

          const parsedCursor = parseAdminReviewCursor(cursor)
          if (cursor && !parsedCursor) {
            batchQueryError = new Error('Invalid admin review cursor')
            return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
          }

          if (parsedCursor) {
            orderQuery = orderQuery.or(
              `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},id.lt.${parsedCursor.id})`,
            )
          }

          const { data: rawBatchOrders, error: orderError } = await orderQuery
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(ADMIN_REVIEW_ORDER_BATCH_SIZE + 1)

          if (orderError) {
            batchQueryError = orderError
            return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
          }

          const rawCandidateOrders = rawBatchOrders || []
          const hasMoreCandidates = rawCandidateOrders.length > ADMIN_REVIEW_ORDER_BATCH_SIZE
          const candidateOrders = rawCandidateOrders.slice(0, ADMIN_REVIEW_ORDER_BATCH_SIZE)
          if (candidateOrders.length === 0) {
            return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
          }

          const orderIds = candidateOrders.map((order: any) => order.id)
          const { data: paymentRows, error: paymentError } = await supabase
            .from('payment_submissions')
            .select('id, order_id, status, submitted_at, created_at')
            .in('order_id', orderIds)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH + 1)

          if (paymentError) {
            batchQueryError = paymentError
            return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
          }

          const paymentRowsForBatch = paymentRows || []
          const submissionAnomaly = getAdminReviewSubmissionAnomaly(
            paymentRowsForBatch,
            ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH,
          )
          if (submissionAnomaly) {
            paymentReviewIntegrityAnomaly = true
            batchQueryError = new Error('submission-integrity-anomaly')
            return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
          }

          const verificationBySubmissionId = new Map<string, any>()
          if (needsVerificationRows && paymentRowsForBatch.length > 0) {
            const queueAdminSupabase = getAdminSupabase()
            if (!queueAdminSupabase) {
              batchQueryError = new Error('Admin verification client unavailable')
              return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
            }

            const verificationResult = await fetchAdminReviewVerificationRows({
              submissionIds: paymentRowsForBatch.map((payment: any) => payment.id),
              fetchChunk: async (verificationIds) => queueAdminSupabase
                .from('payment_verifications')
                .select('submission_id, order_id, state, decision, attempt_count, created_at, updated_at')
                .in('submission_id', verificationIds),
            })

            if (verificationResult.error) {
              batchQueryError = verificationResult.error
              return { matches: [], matchCursors: [], candidateCount: 0, nextCursor: null, hasMore: false }
            }

            for (const verification of verificationResult.data) {
              verificationBySubmissionId.set(verification.submission_id, verification)
            }
          }

          const latestPaymentByOrder = latestByOrder(paymentRowsForBatch)
          const paymentCountByOrder = new Map<string, number>()
          for (const payment of paymentRowsForBatch) {
            paymentCountByOrder.set(payment.order_id, (paymentCountByOrder.get(payment.order_id) || 0) + 1)
          }

          const matchedIds = new Set(candidateOrders.filter((order: any) => {
            const latestPayment = latestPaymentByOrder.get(order.id)
            const latestVerification = latestPayment
              ? verificationBySubmissionId.get(latestPayment.id)
              : null

            return matchesAdminReviewQueue({
              orderStatus: order.status,
              paymentProvider: order.payment_provider,
              latestSubmissionStatus: latestPayment?.status || null,
              submissionCount: paymentCountByOrder.get(order.id) || 0,
              analyzerState: latestVerification?.state || null,
              reviewFilter,
              analyzerFilter,
            })
          }).map((order: any) => order.id))

          const decorated = decorateOrders(candidateOrders, paymentRowsForBatch, verificationBySubmissionId)
          const decoratedById = new Map(decorated.map((order) => [order.id, order]))
          const matchedOrders: AdminReviewQueueOrder[] = []
          const matchCursors: string[] = []
          for (const candidate of candidateOrders) {
            if (!matchedIds.has(candidate.id)) continue
            const cursorForMatch = getAdminReviewCursor({
              id: candidate.id,
              created_at: candidate.created_at,
            })
            const decoratedOrder = decoratedById.get(candidate.id)
            if (!cursorForMatch || !decoratedOrder) continue
            matchedOrders.push(decoratedOrder)
            matchCursors.push(serializeAdminReviewCursor(cursorForMatch))
          }
          const lastOrder = candidateOrders[candidateOrders.length - 1]
          const lastCursor = getAdminReviewCursor({
            id: lastOrder.id,
            created_at: lastOrder.created_at,
          })

          return {
            matches: matchedOrders,
            matchCursors,
            candidateCount: candidateOrders.length,
            nextCursor: lastCursor ? serializeAdminReviewCursor(lastCursor) : null,
            hasMore: Boolean(lastCursor && hasMoreCandidates),
          }
        },
      })
      : null

    if (batchQueryError) {
      console.error('[PAYMENT] bounded payment review queue query failed:', batchQueryError.message || batchQueryError)
      paymentReviewUnavailable = true
    } else if (boundedResult) {
      orders = boundedResult.matches
      queueHasMore = boundedResult.hasMore
      queueResultCapped = boundedResult.capReached
      queueNextCursor = boundedResult.nextCursor
      totalPages = page + (queueHasMore ? 1 : 0)
      paymentEvidenceLoaded = true
    }
  } else {
    let orderQuery = supabase
      .from('orders')
      .select(ADMIN_REVIEW_ORDER_SELECT, { count: 'exact' })

    orderQuery = applyOrderFilters(orderQuery, {
      search,
      statusFilter,
      reviewFilter,
      analyzerFilter,
    })

    const { data: rawOrders, count, error: orderError } = await orderQuery
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to - 1)

    if (orderError) {
      console.error('[PAYMENT] orders queue query failed:', orderError.message)
    }

    const visibleOrders = rawOrders || []
    const orderIds = visibleOrders.map((order: any) => order.id)
    const paymentRowsQuery = canManageFinancial && orderIds.length > 0
      ? await supabase
        .from('payment_submissions')
        .select('id, order_id, status, submitted_at, created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(ADMIN_REVIEW_PAGE_SIZE * PAYMENT_SUBMISSION_MAX_COUNT + 1)
      : { data: [] as any[], error: null }
    const { data: paymentRows, error: paymentRowsError } = paymentRowsQuery
    const paymentRowsForPage = paymentRows || []

    if (paymentRowsError) {
      paymentReviewUnavailable = true
    } else if (getAdminReviewSubmissionAnomaly(
      paymentRowsForPage,
      ADMIN_REVIEW_PAGE_SIZE * PAYMENT_SUBMISSION_MAX_COUNT,
    )) {
      paymentReviewIntegrityAnomaly = true
      paymentReviewUnavailable = true
    }

    const verificationBySubmissionId = new Map<string, any>()
    const visibleSubmissionIds = paymentRowsForPage.map((payment: any) => payment.id)
    if (!paymentReviewUnavailable && canManageFinancial && visibleSubmissionIds.length > 0) {
      const visibleAdminSupabase = getAdminSupabase()
      if (visibleAdminSupabase) {
        const verificationResult = await fetchAdminReviewVerificationRows({
          submissionIds: visibleSubmissionIds,
          fetchChunk: async (verificationIds) => visibleAdminSupabase
            .from('payment_verifications')
            .select('submission_id, order_id, state, decision, attempt_count, created_at, updated_at')
            .in('submission_id', verificationIds),
        })

        if (verificationResult.error) {
          console.error('[PAYMENT VERIFICATION] visible queue chunk unavailable:', verificationResult.failedChunkIndex)
          paymentReviewUnavailable = true
        } else {
          analyzerDataLoaded = true
          for (const verification of verificationResult.data) {
            verificationBySubmissionId.set(verification.submission_id, verification)
          }
        }
      } else {
        paymentReviewUnavailable = true
      }
    } else if (!paymentReviewUnavailable && canManageFinancial) {
      analyzerDataLoaded = true
    }

    orders = decorateOrders(visibleOrders, paymentRowsForPage, verificationBySubmissionId)
    totalPages = count ? Math.ceil(count / ADMIN_REVIEW_PAGE_SIZE) : 0
    paymentEvidenceLoaded = canManageFinancial && !paymentRowsError && !paymentReviewUnavailable
  }

  if (paymentReviewUnavailable) {
    orders = []
    totalPages = 0
  }

  const users: AdminReviewQueueUser[] = canManageFinancial
    ? ((await supabase.from('profiles').select('id, email').order('email')).data || []) as AdminReviewQueueUser[]
    : []
  const packages: AdminReviewQueuePackage[] = canManageFinancial
    ? ((await supabase.from('packages').select('id, name').order('name')).data || []) as AdminReviewQueuePackage[]
    : []

  return (
    <OrdersClient
      orders={orders}
      users={users}
      packages={packages}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      reviewFilter={reviewFilter}
      analyzerFilter={analyzerFilter}
      canManageFinancial={canManageFinancial}
      paymentEvidenceLoaded={paymentEvidenceLoaded}
      analyzerDataLoaded={analyzerDataLoaded}
      paymentReviewUnavailable={paymentReviewUnavailable}
      paymentReviewIntegrityAnomaly={paymentReviewIntegrityAnomaly}
      queueHasMore={queueHasMore}
      queueResultCapped={queueResultCapped}
      queueNextCursor={queueNextCursor}
      isBoundedQueue={needsQueueProjection}
    />
  )
}
