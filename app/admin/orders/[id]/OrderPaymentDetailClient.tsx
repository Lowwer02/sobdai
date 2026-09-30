'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, CheckCircle, ExternalLink, FileImage, Loader2, XCircle } from 'lucide-react'
import { cancelManualPaymentOrder, approvePayment, rejectPayment, resumePaymentVerification } from '../actions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { getPaymentStatusPresentation, MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import {
  getAdminReviewState,
  getAnalyzerTriagePresentation,
  STALE_REVIEW_ACTION_MESSAGE,
} from '@/lib/payment/admin-review'

interface OrderDetail {
  id: string
  userId: string
  packageId: string
  amount: number
  status: string
  paymentProvider: string | null
  createdAt: string
  updatedAt: string
  userEmail: string
  packageName: string
  packageSlug: string | null
}

interface PaymentSubmission {
  id: string
  status: 'submitted' | 'approved' | 'rejected'
  originalFilename: string | null
  mimeType: string
  fileSizeBytes: number
  submittedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  rejectionReason: string | null
  createdAt: string
  signedUrl: string | null
  verification: PaymentVerification | null
}

interface PaymentVerification {
  state: string
  decision: string | null
  analyzerVersion: string
  attemptCount: number | null
  detectedAmount: number | null
  amountMatchState: string
  recipientMatchState: string
  destinationMatchState: string
  qrKind: string | null
  qrStructureValid: boolean | null
  qrCrcValid: boolean | null
  referenceExtracted: boolean
  qrFormat: string | null
  referenceState: string
  imageDuplicateState: string
  timestampState: string
  reasonCodes: string[]
  durationMs: number | null
  completedAt: string | null
}

interface ShadowMetrics {
  totalAnalyzed: number
  strongMatch: number
  manualReview: number
  suspicious: number
  analyzerError: number
  averageDurationMs: number | null
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function verificationTone(state: string) {
  return getAnalyzerTriagePresentation(state).tone
}

function verificationLabel(state: string) {
  return getAnalyzerTriagePresentation(state).label
}

function verificationFieldLabel(value: string) {
  switch (value) {
    case 'MATCH': return 'match'
    case 'MISMATCH': return 'mismatch'
    case 'AMBIGUOUS': return 'ambiguous'
    case 'UNKNOWN': return 'not available'
    case 'true': return 'valid'
    case 'false': return 'invalid'
    case 'VALID_UNIQUE': return 'unique'
    case 'NONE': return 'none'
    case 'ABNORMAL': return 'abnormal'
    default: return value.toLowerCase()
  }
}

export default function OrderPaymentDetailClient({
  order,
  submissions,
  submissionsLoaded,
  shadowMetrics,
}: {
  order: OrderDetail
  submissions: PaymentSubmission[]
  submissionsLoaded: boolean
  shadowMetrics: ShadowMetrics | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectionReason, setRejectionReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [approveConfirm, setApproveConfirm] = useState<{ isOpen: boolean, submissionId: string | null }>({ isOpen: false, submissionId: null })
  const [rejectConfirm, setRejectConfirm] = useState<{ isOpen: boolean, submissionId: string | null }>({ isOpen: false, submissionId: null })

  const paymentStatus = getPaymentStatusPresentation({
    orderStatus: order.status,
    paymentProvider: order.paymentProvider,
    submissionCount: submissions.length,
    latestSubmissionStatus: submissions[0]?.status || null,
    evidenceReadAvailable: submissionsLoaded,
  })
  const hasOnlyRejectedEvidence =
    submissions.length > 0
    && submissions.every((submission) => submission.status === 'rejected')
  const canCancelUnpaidManualOrder =
    order.paymentProvider === MANUAL_PAYMENT_PROVIDER
    && order.status === 'pending'
    && submissionsLoaded
    && (submissions.length === 0 || hasOnlyRejectedEvidence)

  const latestSubmission = submissions[0] || null
  const currentReviewState = getAdminReviewState({
    orderStatus: order.status,
    paymentProvider: order.paymentProvider,
    latestSubmissionStatus: latestSubmission?.status || null,
    submissionCount: submissions.length,
    analyzerState: latestSubmission?.verification?.state || null,
  })
  const currentReviewStateLabel = currentReviewState === 'needs_review'
    ? 'Needs review'
    : currentReviewState === 'checking'
      ? 'กำลังตรวจสอบ'
      : currentReviewState === 'rejected'
        ? 'Rejected / resubmitted'
        : currentReviewState === 'no_evidence'
          ? 'No evidence'
          : currentReviewState === 'paid'
            ? 'Already paid'
            : currentReviewState === 'cancelled'
              ? 'Cancelled'
              : 'Not a manual review item'

  const showSafeActionError = (actionError: string | undefined, fallback: string) => {
    setError(`${actionError || fallback} ${STALE_REVIEW_ACTION_MESSAGE}`)
  }

  const requestApprove = (submissionId: string) => {
    setApproveConfirm({ isOpen: true, submissionId })
  }

  const handleApprove = () => {
    if (!approveConfirm.submissionId) return
    const submissionId = approveConfirm.submissionId
    setApproveConfirm({ isOpen: false, submissionId: null })
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await approvePayment(submissionId)
      if (result.success) {
        setMessage('อนุมัติการชำระเงินแล้ว และเปิดสิทธิ์แพ็กเกจผ่านคำสั่งซื้อเดิม')
        router.refresh()
      } else {
        showSafeActionError(result.error, 'ไม่สามารถอนุมัติรายการได้')
      }
    })
  }

  const requestReject = (submissionId: string) => {
    if (!rejectionReason.trim()) return
    setRejectConfirm({ isOpen: true, submissionId })
  }

  const handleReject = () => {
    if (!rejectConfirm.submissionId) return
    const submissionId = rejectConfirm.submissionId
    setRejectConfirm({ isOpen: false, submissionId: null })
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await rejectPayment(submissionId, rejectionReason)
      if (result.success) {
        setMessage('ปฏิเสธสลิปแล้ว คำสั่งซื้อยังคงรอการชำระเงิน')
        setRejectionReason('')
        router.refresh()
      } else {
        showSafeActionError(result.error, 'ไม่สามารถปฏิเสธรายการได้')
      }
    })
  }

  const handleCancelUnpaidOrder = () => {
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await cancelManualPaymentOrder(order.id)
      if (result.success) {
        setMessage('ยกเลิกคำสั่งซื้อแล้ว และไม่ได้เปิดสิทธิ์แพ็กเกจให้ผู้ซื้อ')
        setCancelConfirmOpen(false)
        router.refresh()
      } else {
        showSafeActionError(result.error, 'ไม่สามารถยกเลิกคำสั่งซื้อได้')
      }
    })
  }

  const handleResumeVerification = (submissionId: string) => {
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await resumePaymentVerification(submissionId)
      if (result.success) {
        setMessage(result.leaseAcquired
          ? 'วิเคราะห์หลักฐานซ้ำแล้ว ผลยังอยู่ใน Shadow mode และคำสั่งซื้อยังไม่เปลี่ยนสถานะ'
          : 'รายการนี้กำลังถูกวิเคราะห์อยู่ หรือมีผลลัพธ์ที่บันทึกไว้แล้ว')
        router.refresh()
      } else {
        showSafeActionError(result.error, 'ไม่สามารถวิเคราะห์หลักฐานซ้ำได้')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-sm text-[#A1866B] hover:text-[#D4AF37]">
        <ArrowLeft size={16} /> กลับไป Orders
      </Link>

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6]">Payment review</h1>
          <p className="mt-1 text-sm text-[#A1866B]">ตรวจสอบหลักฐานก่อนเปลี่ยนคำสั่งซื้อเดิมเป็น paid</p>
        </div>
        <span className="font-mono text-xs text-[#A1866B]">Order {order.id}</span>
      </div>

      {(message || error) && (
        <div
          role={error ? 'alert' : 'status'}
          aria-live="polite"
          className={`rounded-xl border p-4 text-sm ${
          error
            ? 'border-red-400/20 bg-red-400/10 text-red-300'
            : 'border-green-400/20 bg-green-400/10 text-green-300'
        }`}
        >
          {error || message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">Order</h2>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Order reference</span><span className="font-mono text-right text-xs text-[#F5E9D6]">{order.id}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Buyer</span><span className="text-right text-[#F5E9D6]">{order.userEmail}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Package</span><span className="text-right text-[#F5E9D6]">{order.packageName}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Amount snapshot</span><span className="font-bold text-[#D4AF37]">฿{order.amount.toLocaleString()}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Order status</span><span className="font-semibold text-[#F5E9D6]">{order.status.toUpperCase()}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Payment state</span><span className="text-right font-semibold text-[#F5E9D6]">{paymentStatus.label}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Provider</span><span className="text-[#F5E9D6]">{order.paymentProvider || '—'}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Created</span><span className="text-right text-[#F5E9D6]">{formatDate(order.createdAt)}</span></div>
          {paymentStatus.description && (
            <p className="pt-2 text-xs leading-relaxed text-[#A1866B]">{paymentStatus.description}</p>
          )}
          {canCancelUnpaidManualOrder && (
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(true)}
              disabled={isPending}
              className="mt-3 inline-flex items-center justify-center rounded-lg border border-red-400/30 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {hasOnlyRejectedEvidence
                ? 'ยกเลิกคำสั่งซื้อหลังหลักฐานไม่ผ่าน'
                : 'ยกเลิกคำสั่งซื้อนี้'}
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 md:sticky md:top-4 md:self-start">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">Current review state</h2>
          <div className="mt-3 inline-flex rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-bold text-[#F1D17A]">
            {currentReviewStateLabel}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#F5E9D6]">
            อนุมัติจะเปลี่ยน <span className="font-semibold">orders.status</span> ของ Order นี้เป็น <span className="font-semibold text-green-400">paid</span> แบบ atomic และจึงเปิดสิทธิ์เดิมของระบบ
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#A1866B]">
            ปฏิเสธจะบันทึกเหตุผลและคงสถานะ Order เป็น <span className="font-semibold text-[#D4AF37]">pending</span> เพื่อให้ผู้ใช้ส่งหลักฐานใหม่ได้
          </p>
          {latestSubmission?.verification?.state === 'STRONG_MATCH' && (
            <p className="mt-4 rounded-lg border border-sky-400/25 bg-sky-400/10 p-3 text-xs leading-relaxed text-sky-100">
              ข้อมูลในหลักฐานสอดคล้องกันจากการตรวจแบบออฟไลน์ แต่ยังไม่ใช่การยืนยันธุรกรรมจากธนาคารหรือผู้ให้บริการ
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#F5E9D6]">Latest payment evidence</h2>
            <p className="text-sm text-[#A1866B]">ไฟล์ถูกเสิร์ฟด้วย signed URL ชั่วคราวสำหรับผู้มี financial.manage เท่านั้น</p>
          </div>
          <div className="text-right text-sm text-[#A1866B]">
            <div>{submissions.length} submission{submissions.length === 1 ? '' : 's'}</div>
            {shadowMetrics && (
            <div className="mt-1 text-xs">Shadow analyzed {shadowMetrics.totalAnalyzed} · strong match {shadowMetrics.strongMatch}</div>
            )}
          </div>
        </div>

        {!submissionsLoaded ? (
          <div className="mt-6 rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] p-8 text-center text-sm text-[#A1866B]">
            ไม่สามารถตรวจสอบหลักฐานการชำระเงินได้ กรุณารีเฟรชแล้วลองใหม่
          </div>
        ) : submissions.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] p-8 text-center text-sm text-[#A1866B]">
            ยังไม่มีสลิปที่ส่งเข้ามา
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">Submission history</div>
            {submissions.map((submission, submissionIndex) => {
              const isLatestSubmission = submissionIndex === 0
              const isReviewable = isLatestSubmission && submission.status === 'submitted' && order.status === 'pending'
              const attemptNumber = submissions.length - submissionIndex
              const analyzerTriage = submission.verification
                ? getAnalyzerTriagePresentation(submission.verification.state)
                : getAnalyzerTriagePresentation(null)

              return (
                <article key={submission.id} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0F0B07] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileImage size={16} className="text-[#D4AF37]" />
                        <span className="font-medium text-[#F5E9D6]">Attempt {attemptNumber} · {submission.originalFilename || 'payment-slip'}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${
                          submission.status === 'submitted'
                            ? 'border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#D4AF37]'
                            : submission.status === 'approved'
                              ? 'border-green-400/20 bg-green-400/10 text-green-400'
                              : 'border-red-400/20 bg-red-400/10 text-red-400'
                        }`}>{submission.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-[#A1866B]">
                        {submission.mimeType} · {formatBytes(submission.fileSizeBytes)} · submitted {formatDate(submission.submittedAt)}
                      </div>
                    </div>
                    {submission.reviewedAt && (
                      <div className="text-xs text-[#A1866B]">reviewed {formatDate(submission.reviewedAt)}</div>
                    )}
                  </div>

                  {submission.signedUrl ? (
                    submission.mimeType.startsWith('image/') ? (
                      <img src={submission.signedUrl} alt="Payment slip" className="mt-4 max-h-[520px] w-full rounded-lg bg-white object-contain" />
                    ) : (
                      <a href={submission.signedUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#F1D17A]">
                        เปิดไฟล์ PDF <ExternalLink size={15} />
                      </a>
                    )
                  ) : (
                    <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">ไม่สามารถเปิดไฟล์หลักฐานได้</div>
                  )}

                  {submission.rejectionReason && (
                    <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">
                      เหตุผลที่ปฏิเสธ: {submission.rejectionReason}
                    </div>
                  )}

                  {submission.verification && (
                    <div className="mt-4 rounded-lg border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-[#F5E9D6]">Analyzer triage · advisory only</div>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${verificationTone(submission.verification.state)}`}>
                          {verificationLabel(submission.verification.state)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-[#A1866B] sm:grid-cols-2">
                        <span>จำนวนเงิน: {verificationFieldLabel(submission.verification.amountMatchState)}{submission.verification.detectedAmount === null ? '' : ` · ฿${submission.verification.detectedAmount.toFixed(2)}`}</span>
                        <span>ผู้รับเงิน: {verificationFieldLabel(submission.verification.recipientMatchState)}</span>
                        <span>ปลายทาง: {verificationFieldLabel(submission.verification.destinationMatchState)}</span>
                        <span>Reference / QR: {submission.verification.referenceExtracted ? 'พบ' : 'ไม่พบ'} · {verificationFieldLabel(submission.verification.referenceState)}</span>
                        <span>QR structure: {verificationFieldLabel(String(submission.verification.qrStructureValid))} · CRC {verificationFieldLabel(String(submission.verification.qrCrcValid))}</span>
                        <span>Duplicate: {verificationFieldLabel(submission.verification.imageDuplicateState)}</span>
                        <span>Time signal: {verificationFieldLabel(submission.verification.timestampState)}</span>
                        <span>analysis duration: {submission.verification.durationMs === null ? '—' : `${submission.verification.durationMs} ms`}</span>
                      </div>
                      {submission.verification.state === 'STRONG_MATCH' ? (
                        <p className="mt-3 rounded-lg border border-sky-400/25 bg-sky-400/10 p-3 text-xs leading-relaxed text-sky-100">
                          Offline evidence match — not bank/provider confirmed. This Shadow result keeps the order pending and never opens entitlement.
                        </p>
                      ) : submission.verification.state === 'SUSPICIOUS' ? (
                        <p className="mt-3 rounded-lg border border-orange-300/25 bg-orange-300/10 p-3 text-xs leading-relaxed text-orange-100">
                          ควรตรวจสอบเพิ่มเติม ผลอัตโนมัติไม่ปฏิเสธและไม่เปลี่ยนสถานะคำสั่งซื้อ
                        </p>
                      ) : submission.verification.state === 'ANALYZER_ERROR' ? (
                        <p className="mt-3 rounded-lg border border-red-300/25 bg-red-300/10 p-3 text-xs leading-relaxed text-red-100">วิเคราะห์อัตโนมัติไม่สำเร็จ — กรุณาตรวจหลักฐานด้วยตนเอง</p>
                      ) : (
                        <p className="mt-3 text-xs leading-relaxed text-[#A1866B]">{analyzerTriage.description} ผลนี้ไม่ใช่คำสั่งอนุมัติหรือปฏิเสธ และไม่เปลี่ยนสิทธิ์ของผู้ซื้อ</p>
                      )}
                      {submission.verification.reasonCodes.length > 0 && (
                        <div className="mt-2 text-xs text-[#A1866B]">
                          reasons: {submission.verification.reasonCodes.join(', ')}
                        </div>
                      )}
                      {submission.status === 'submitted'
                        && order.status === 'pending'
                        && submission.verification.state !== 'STRONG_MATCH'
                        && submission.verification.state !== 'AUTO_CHECKING'
                        && (
                          <button
                            type="button"
                            onClick={() => handleResumeVerification(submission.id)}
                            disabled={isPending}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-bold text-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                            วิเคราะห์ซ้ำ (Shadow)
                          </button>
                        )}
                    </div>
                  )}

                  {isReviewable && (
                    <div className="mt-5 border-t border-[rgba(255,255,255,0.08)] pt-4">
                      <div className="mb-4 rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-3 text-xs leading-relaxed text-[#F1D17A]">
                        การอนุมัติเป็นการตัดสินใจของเจ้าหน้าที่และจะเปิดสิทธิ์แพ็กเกจตามคำสั่งซื้อเดิม
                        {submission.verification?.state === 'STRONG_MATCH' && ' ผล Offline match ไม่ใช่การยืนยันจากธนาคารหรือผู้ให้บริการ'}
                      </div>
                      <label className="block text-sm font-medium text-[#F5E9D6]" htmlFor={`rejection-${submission.id}`}>
                        เหตุผลเมื่อปฏิเสธ
                      </label>
                      <textarea
                        id={`rejection-${submission.id}`}
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        maxLength={1000}
                        rows={3}
                        placeholder="เช่น ยอดเงินไม่ตรงกับคำสั่งซื้อ"
                        className="mt-2 w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1A140E] px-3 py-2 text-sm text-[#F5E9D6] outline-none focus:border-[#D4AF37]/50"
                      />
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => requestApprove(submission.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-bold text-[#0F0B07] hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                          อนุมัติและเปิดสิทธิ์
                        </button>
                        <button
                          type="button"
                          onClick={() => requestReject(submission.id)}
                          disabled={isPending || !rejectionReason.trim()}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <XCircle size={16} /> ปฏิเสธสลิป
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={approveConfirm.isOpen}
        onClose={() => setApproveConfirm({ isOpen: false, submissionId: null })}
        onConfirm={handleApprove}
        title="ยืนยันการอนุมัติการชำระเงิน?"
        description={`Order ${order.id} · ${order.packageName} · ฿${order.amount.toLocaleString()}\n\nเมื่ออนุมัติแล้ว ระบบจะเปิดสิทธิ์แพ็กเกจให้ผู้ใช้ผ่านคำสั่งซื้อเดิม การตรวจแบบออฟไลน์ไม่ใช่การยืนยันจากธนาคารหรือผู้ให้บริการ`}
        confirmText="อนุมัติและเปิดสิทธิ์"
        cancelText="กลับไปตรวจสอบ"
        isLoading={isPending}
      />

      <ConfirmDialog
        isOpen={rejectConfirm.isOpen}
        onClose={() => setRejectConfirm({ isOpen: false, submissionId: null })}
        onConfirm={handleReject}
        title="ยืนยันการปฏิเสธหลักฐาน?"
        description="เหตุผลที่กรอกจะถูกบันทึกในประวัติการตรวจสอบ และคำสั่งซื้อจะยังคง pending เพื่อให้ผู้ซื้อส่งหลักฐานใหม่ตามกติกาเดิม"
        confirmText="ยืนยันการปฏิเสธ"
        cancelText="กลับไปตรวจสอบ"
        isDestructive
        isLoading={isPending}
      />

      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancelUnpaidOrder}
        title="ยกเลิกคำสั่งซื้อที่ยังไม่ชำระ"
        description={hasOnlyRejectedEvidence
          ? 'หลักฐานการชำระเงินทั้งหมดถูกปฏิเสธแล้ว การยกเลิกจะเก็บหลักฐานไว้เป็นประวัติ ไม่เปิดสิทธิ์แพ็กเกจ และผู้ซื้อสามารถเริ่มคำสั่งซื้อใหม่ได้'
          : 'คำสั่งซื้อนี้ยังไม่มีหลักฐานการชำระเงิน การยกเลิกจะไม่เปิดสิทธิ์แพ็กเกจ และผู้ซื้อสามารถเริ่มคำสั่งซื้อใหม่ได้'}
        confirmText="ยกเลิกคำสั่งซื้อนี้"
        cancelText="กลับ"
        isDestructive
        isLoading={isPending}
      />
    </div>
  )
}
