import { hasPermission } from '../auth/rbac'
import {
  isUuid,
  MANUAL_PAYMENT_PROVIDER,
  PAYMENT_SUBMISSION_MAX_COUNT,
  type PaymentSubmissionStatus,
} from './manual'

export const ADMIN_REVIEW_PAGE_SIZE = 15
export const ADMIN_REVIEW_ORDER_BATCH_SIZE = 50
export const ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST = 8
export const ADMIN_REVIEW_MAX_ORDERS_PER_REQUEST =
  ADMIN_REVIEW_ORDER_BATCH_SIZE * ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST
export const ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH =
  ADMIN_REVIEW_ORDER_BATCH_SIZE * PAYMENT_SUBMISSION_MAX_COUNT
export const ADMIN_REVIEW_VERIFICATION_ID_CHUNK_SIZE = 50
export const PAYMENT_EVIDENCE_SIGNED_URL_TTL_SECONDS = 300
export const ADMIN_REVIEW_SUBMISSION_INTEGRITY_MESSAGE =
  'ไม่สามารถโหลดคิวตรวจสอบได้ เนื่องจากพบข้อมูลหลักฐานที่ต้องตรวจสอบเพิ่มเติม'

/**
 * Keep the admin list projection explicit. The relation fields are limited to
 * the display labels required by the queue; mutation forms are loaded only for
 * financial managers.
 */
export const ADMIN_REVIEW_ORDER_SELECT =
  'id, amount, status, payment_provider, created_at, profiles!inner(email), packages!inner(name)'

export const ADMIN_REVIEW_QUEUE_CAP_MESSAGE =
  'แสดงผลคิวที่ตรวจสอบแล้วภายในขอบเขตความปลอดภัย กรุณาใช้ตัวกรองหรือค้นหาให้แคบลงเพื่อดูรายการเพิ่มเติม'

export const ADMIN_REVIEW_TERMINAL_ORDER_STATUSES = [
  'paid',
  'free',
  'cancelled',
  'refunded',
  'revoked',
] as const

export type AdminReviewTerminalOrderStatus = typeof ADMIN_REVIEW_TERMINAL_ORDER_STATUSES[number]

export const PAYMENT_REVIEW_AUDIT_ACTIONS = {
  approveAttempt: 'APPROVE_PAYMENT_SUBMISSION_ATTEMPT',
  rejectAttempt: 'REJECT_PAYMENT_SUBMISSION_ATTEMPT',
} as const

export type AdminReviewCapabilities = {
  canViewOrders: boolean
  canManageFinancial: boolean
}

export type AdminReviewQueueOrder = {
  id: string
  amount: number | string
  status: string
  payment_provider: string | null
  created_at: string
  user_email: string
  package_name: string
  manual_payment_status: PaymentSubmissionStatus | null
  manual_payment_submitted_at: string | null
  manual_payment_submission_count: number
  manual_payment_all_rejected: boolean
  manual_payment_analyzer_state: string | null
  manual_payment_analyzer_attempt_count: number | null
  manual_payment_review_state: string
}

export type AdminReviewQueueUser = {
  id: string
  email: string
}

export type AdminReviewQueuePackage = {
  id: string
  name: string
}

export function getAdminReviewCapabilities(role: string | null | undefined): AdminReviewCapabilities {
  return {
    canViewOrders: hasPermission(role, 'orders.read'),
    canManageFinancial: hasPermission(role, 'financial.manage'),
  }
}

export const ADMIN_REVIEW_FILTERS = [
  'needs_review',
  'checking',
  'rejected',
  'no_evidence',
  'all',
] as const

export type AdminReviewFilter = typeof ADMIN_REVIEW_FILTERS[number]

export const ANALYZER_TRIAGE_FILTERS = [
  'STRONG_MATCH',
  'MANUAL_REVIEW',
  'SUSPICIOUS',
  'ANALYZER_ERROR',
  'not_analyzed',
  'all',
] as const

export type AnalyzerTriageFilter = typeof ANALYZER_TRIAGE_FILTERS[number]
export type AnalyzerTriageState = Exclude<AnalyzerTriageFilter, 'not_analyzed' | 'all'>

export type ReviewOrderedRow = {
  id: string
  order_id: string
  created_at: string | null
}

export type AdminReviewCursor = {
  createdAt: string
  id: string
}

export function getAdminReviewCursor(row: { id: string; created_at: string | null }): AdminReviewCursor | null {
  if (!row.created_at || !row.id) return null
  return { createdAt: row.created_at, id: row.id }
}

export function serializeAdminReviewCursor(cursor: AdminReviewCursor): string {
  return `${cursor.createdAt}|${cursor.id}`
}

export function parseAdminReviewCursor(value: unknown): AdminReviewCursor | null {
  if (typeof value !== 'string') return null
  const separatorIndex = value.lastIndexOf('|')
  if (separatorIndex <= 0) return null

  const createdAt = value.slice(0, separatorIndex)
  const id = value.slice(separatorIndex + 1)
  if (!createdAt || !isUuid(id) || Number.isNaN(Date.parse(createdAt))) return null
  return { createdAt, id }
}

export function compareReviewRowsLatest<T extends ReviewOrderedRow>(a: T, b: T): number {
  const aTime = a.created_at ? Date.parse(a.created_at) : Number.NEGATIVE_INFINITY
  const bTime = b.created_at ? Date.parse(b.created_at) : Number.NEGATIVE_INFINITY

  if (aTime !== bTime) return bTime - aTime
  return b.id.localeCompare(a.id)
}

export function latestByOrder<T extends ReviewOrderedRow>(rows: T[]): Map<string, T> {
  const latest = new Map<string, T>()
  for (const row of [...rows].sort(compareReviewRowsLatest)) {
    if (!latest.has(row.order_id)) latest.set(row.order_id, row)
  }
  return latest
}

export type AdminReviewQueueMatchInput = {
  orderStatus: string | null | undefined
  paymentProvider: string | null | undefined
  latestSubmissionStatus: string | null | undefined
  submissionCount: number
  analyzerState: string | null | undefined
  reviewFilter: AdminReviewFilter
  analyzerFilter: AnalyzerTriageFilter
}

export function matchesAdminReviewQueue(input: AdminReviewQueueMatchInput): boolean {
  if (input.reviewFilter !== 'all' || input.analyzerFilter !== 'all') {
    if (input.orderStatus !== 'pending' || input.paymentProvider !== MANUAL_PAYMENT_PROVIDER) return false
  }

  const reviewState = getAdminReviewState(input)
  const reviewMatches = input.reviewFilter === 'all' || reviewState === input.reviewFilter
  const analyzerMatches = input.analyzerFilter === 'all'
    || (input.analyzerFilter === 'not_analyzed'
      && input.latestSubmissionStatus === 'submitted'
      && !input.analyzerState)
    || (input.latestSubmissionStatus === 'submitted' && input.analyzerState === input.analyzerFilter)

  return reviewMatches && analyzerMatches
}

export function isTerminalAdminReviewOrderStatus(
  status: string | null | undefined,
): status is AdminReviewTerminalOrderStatus {
  return (ADMIN_REVIEW_TERMINAL_ORDER_STATUSES as readonly string[]).includes(status || '')
}

export function canReviewPaymentSubmission(input: {
  orderStatus: string | null | undefined
  paymentProvider: string | null | undefined
  submissionStatus: PaymentSubmissionStatus | string | null | undefined
  isLatestSubmission: boolean
}): boolean {
  return input.isLatestSubmission
    && input.orderStatus === 'pending'
    && input.paymentProvider === MANUAL_PAYMENT_PROVIDER
    && input.submissionStatus === 'submitted'
    && !isTerminalAdminReviewOrderStatus(input.orderStatus)
}

export function canAccessPaymentEvidence(input: {
  role: string | null | undefined
  requestedOrderId: string
  submissionId: string | null | undefined
  submissionOrderId: string | null | undefined
}): boolean {
  return hasPermission(input.role, 'financial.manage')
    && isUuid(input.requestedOrderId)
    && isUuid(input.submissionId)
    && input.requestedOrderId === input.submissionOrderId
}

export async function createSignedPaymentEvidenceUrl(input: {
  role: string | null | undefined
  requestedOrderId: string
  submissionId: string | null | undefined
  submissionOrderId: string | null | undefined
  storageObjectPath: string | null | undefined
  createSignedUrl: (
    storageObjectPath: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl?: string | null } | null; error: unknown }>
}): Promise<string | null> {
  if (!canAccessPaymentEvidence(input) || !input.storageObjectPath) return null

  const { data, error } = await input.createSignedUrl(
    input.storageObjectPath,
    PAYMENT_EVIDENCE_SIGNED_URL_TTL_SECONDS,
  )
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export function normalizePaymentRejectionReason(value: unknown): {
  valid: boolean
  value: string
} {
  const normalized = typeof value === 'string' ? value.trim().slice(0, 1000) : ''
  return { valid: normalized.length > 0, value: normalized }
}

export function getReviewActionFailureMessage(actionError: string | undefined, fallback: string): string {
  return `${actionError?.trim() || fallback} ${STALE_REVIEW_ACTION_MESSAGE}`
}

export function getPaymentReviewAuditEvent(
  kind: 'approve' | 'reject',
  input: { submissionId: string; orderId: string; status: string; reason?: string },
) {
  const isApprove = kind === 'approve'
  return {
    action: isApprove
      ? PAYMENT_REVIEW_AUDIT_ACTIONS.approveAttempt
      : PAYMENT_REVIEW_AUDIT_ACTIONS.rejectAttempt,
    entity: 'payment_submissions',
    entity_id: input.submissionId,
    new_value: {
      order_id: input.orderId,
      status: input.status,
      audit_semantics: 'action_attempt_not_state_transition',
      canonical_rpc: isApprove ? 'approve_payment_submission' : 'reject_payment_submission',
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
  }
}

export type BoundedAdminReviewBatch<T> = {
  matches: T[]
  matchCursors: string[]
  candidateCount: number
  nextCursor: string | null
  hasMore: boolean
}

export function chunkAdminReviewVerificationIds(ids: string[]): string[][] {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  const chunks: string[][] = []
  for (let index = 0; index < uniqueIds.length; index += ADMIN_REVIEW_VERIFICATION_ID_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(index, index + ADMIN_REVIEW_VERIFICATION_ID_CHUNK_SIZE))
  }
  return chunks
}

export type AdminReviewVerificationRow = {
  submission_id: string
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchAdminReviewVerificationRows<
  T extends AdminReviewVerificationRow,
>({
  submissionIds,
  fetchChunk,
}: {
  submissionIds: string[]
  fetchChunk: (submissionIds: string[]) => Promise<{ data: T[] | null; error: unknown }>
}): Promise<{
  data: T[]
  error: unknown | null
  failedChunkIndex: number | null
}> {
  const rows: T[] = []
  const chunks = chunkAdminReviewVerificationIds(submissionIds)

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const result = await fetchChunk(chunks[chunkIndex])
    if (result.error) {
      return { data: [], error: result.error, failedChunkIndex: chunkIndex }
    }
    rows.push(...(result.data || []))
  }

  rows.sort((a, b) => {
    const submissionOrder = a.submission_id.localeCompare(b.submission_id)
    if (submissionOrder !== 0) return submissionOrder

    const aCreatedAt = a.created_at || ''
    const bCreatedAt = b.created_at || ''
    const createdOrder = aCreatedAt.localeCompare(bCreatedAt)
    if (createdOrder !== 0) return createdOrder

    return (a.updated_at || '').localeCompare(b.updated_at || '')
  })

  return { data: rows, error: null, failedChunkIndex: null }
}

export type AdminReviewSubmissionAnomaly = 'global_overflow' | 'per_order_overflow'

export function getAdminReviewSubmissionAnomaly(
  rows: Array<{ order_id: string }>,
  maxRows: number,
): AdminReviewSubmissionAnomaly | null {
  if (rows.length > maxRows) return 'global_overflow'

  const rowsByOrder = new Map<string, number>()
  for (const row of rows) {
    const count = (rowsByOrder.get(row.order_id) || 0) + 1
    if (count > PAYMENT_SUBMISSION_MAX_COUNT) return 'per_order_overflow'
    rowsByOrder.set(row.order_id, count)
  }

  return null
}

export async function collectBoundedAdminReviewMatches<T>({
  targetCount,
  startCursor = null,
  fetchBatch,
}: {
  targetCount: number
  startCursor?: string | null
  fetchBatch: (cursor: string | null) => Promise<BoundedAdminReviewBatch<T>>
}) {
  const matches: T[] = []
  const matchCursors: string[] = []
  let cursor: string | null = startCursor
  let candidateOrdersProcessed = 0

  for (let batchIndex = 0; batchIndex < ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST; batchIndex += 1) {
    const batch = await fetchBatch(cursor)
    candidateOrdersProcessed += batch.candidateCount
    matches.push(...batch.matches)
    matchCursors.push(...batch.matchCursors.slice(0, batch.matches.length))

    const canContinue = batch.hasMore && Boolean(batch.nextCursor)
    if (matches.length >= targetCount) {
      const lastDisplayedMatchCursor = matchCursors[targetCount - 1] || batch.nextCursor
      const hasUnconsumedMatches = matches.length > targetCount
      const hasMore = Boolean(
        lastDisplayedMatchCursor
        && (hasUnconsumedMatches || canContinue),
      )

      return {
        matches: matches.slice(0, targetCount),
        batchesProcessed: batchIndex + 1,
        candidateOrdersProcessed,
        nextCursor: hasMore ? lastDisplayedMatchCursor : null,
        hasMore,
        capReached: false,
      }
    }

    if (!canContinue) {
      return {
        matches,
        batchesProcessed: batchIndex + 1,
        candidateOrdersProcessed,
        nextCursor: null,
        hasMore: false,
        capReached: false,
      }
    }

    cursor = batch.nextCursor
  }

  return {
    matches,
    batchesProcessed: ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST,
    candidateOrdersProcessed,
    nextCursor: cursor,
    hasMore: true,
    capReached: true,
  }
}

export const STALE_REVIEW_ACTION_MESSAGE =
  'รายการอาจถูกตรวจสอบหรือเปลี่ยนสถานะโดยผู้ดูแลรายอื่นแล้ว กรุณารีเฟรชเพื่อดูสถานะล่าสุดก่อนลองอีกครั้ง'

export function normalizeAdminReviewFilter(
  value: unknown,
  canManagePayments: boolean,
): AdminReviewFilter {
  if (!canManagePayments) return 'all'
  return typeof value === 'string' && (ADMIN_REVIEW_FILTERS as readonly string[]).includes(value)
    ? value as AdminReviewFilter
    : 'needs_review'
}

export function normalizeAnalyzerTriageFilter(
  value: unknown,
  canManagePayments: boolean,
): AnalyzerTriageFilter {
  if (!canManagePayments) return 'all'
  return typeof value === 'string' && (ANALYZER_TRIAGE_FILTERS as readonly string[]).includes(value)
    ? value as AnalyzerTriageFilter
    : 'all'
}

export function getAnalyzerTriagePresentation(state: string | null | undefined) {
  switch (state) {
    case 'STRONG_MATCH':
      return {
        key: 'STRONG_MATCH' as const,
        label: 'Offline match',
        description: 'สัญญาณจากการตรวจแบบออฟไลน์ ไม่ใช่การยืนยันจากธนาคารหรือผู้ให้บริการ',
        tone: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
      }
    case 'MANUAL_REVIEW':
      return {
        key: 'MANUAL_REVIEW' as const,
        label: 'ตรวจสอบด้วยเจ้าหน้าที่',
        description: 'ผลอัตโนมัติเป็นเพียงข้อมูลประกอบ ต้องตรวจหลักฐานด้วยตนเอง',
        tone: 'border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#F1D17A]',
      }
    case 'SUSPICIOUS':
      return {
        key: 'SUSPICIOUS' as const,
        label: 'ควรตรวจละเอียด',
        description: 'ควรตรวจสอบเพิ่มเติม ผลนี้ไม่ปฏิเสธหรือเปลี่ยนสถานะคำสั่งซื้อโดยอัตโนมัติ',
        tone: 'border-orange-300/25 bg-orange-300/10 text-orange-200',
      }
    case 'ANALYZER_ERROR':
      return {
        key: 'ANALYZER_ERROR' as const,
        label: 'วิเคราะห์อัตโนมัติไม่สำเร็จ',
        description: 'วิเคราะห์อัตโนมัติไม่สำเร็จ — กรุณาตรวจหลักฐานด้วยตนเอง',
        tone: 'border-red-300/25 bg-red-300/10 text-red-200',
      }
    case 'AUTO_CHECKING':
      return {
        key: 'AUTO_CHECKING' as const,
        label: 'กำลังวิเคราะห์',
        description: 'กำลังประมวลผลใน Shadow mode และยังไม่เปลี่ยนสิทธิ์',
        tone: 'border-violet-300/25 bg-violet-300/10 text-violet-200',
      }
    default:
      return {
        key: 'not_analyzed' as const,
        label: 'ยังไม่วิเคราะห์',
        description: 'ยังไม่มีผลวิเคราะห์ที่ใช้ประกอบการตรวจสอบ',
        tone: 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[#A1866B]',
      }
  }
}

export function getAdminReviewState({
  orderStatus,
  paymentProvider,
  latestSubmissionStatus,
  submissionCount,
  analyzerState,
}: {
  orderStatus: string | null | undefined
  paymentProvider: string | null | undefined
  latestSubmissionStatus: string | null | undefined
  submissionCount: number
  analyzerState: string | null | undefined
}) {
  if (orderStatus === 'paid' || orderStatus === 'free') return 'paid' as const
  if (orderStatus === 'cancelled') return 'cancelled' as const
  if (orderStatus === 'refunded') return 'refunded' as const
  if (orderStatus === 'revoked') return 'revoked' as const
  if (paymentProvider !== MANUAL_PAYMENT_PROVIDER) return 'other' as const
  if (submissionCount === 0) return 'no_evidence' as const
  if (latestSubmissionStatus === 'rejected') return 'rejected' as const
  if (latestSubmissionStatus === 'submitted' && analyzerState === 'AUTO_CHECKING') return 'checking' as const
  if (latestSubmissionStatus === 'submitted') return 'needs_review' as const
  return 'other' as const
}

export function getReviewFilterLabel(filter: AdminReviewFilter) {
  switch (filter) {
    case 'needs_review': return 'Needs review'
    case 'checking': return 'กำลังตรวจสอบ'
    case 'rejected': return 'Rejected / resubmitted'
    case 'no_evidence': return 'No evidence'
    default: return 'All payment states'
  }
}
