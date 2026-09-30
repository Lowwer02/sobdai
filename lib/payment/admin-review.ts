import { MANUAL_PAYMENT_PROVIDER } from './manual'

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
