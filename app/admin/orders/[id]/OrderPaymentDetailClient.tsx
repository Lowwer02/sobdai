'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, CheckCircle, ExternalLink, FileImage, Loader2, XCircle } from 'lucide-react'
import { approvePayment, rejectPayment } from '../actions'

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
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function OrderPaymentDetailClient({
  order,
  submissions,
}: {
  order: OrderDetail
  submissions: PaymentSubmission[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectionReason, setRejectionReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleApprove = (submissionId: string) => {
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await approvePayment(submissionId)
      if (result.success) {
        setMessage('อนุมัติการชำระเงินแล้ว และเปิดสิทธิ์แพ็กเกจผ่านคำสั่งซื้อเดิม')
        router.refresh()
      } else {
        setError(result.error || 'ไม่สามารถอนุมัติรายการได้')
      }
    })
  }

  const handleReject = (submissionId: string) => {
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await rejectPayment(submissionId, rejectionReason)
      if (result.success) {
        setMessage('ปฏิเสธสลิปแล้ว คำสั่งซื้อยังคงรอการชำระเงิน')
        setRejectionReason('')
        router.refresh()
      } else {
        setError(result.error || 'ไม่สามารถปฏิเสธรายการได้')
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
        <div className={`rounded-xl border p-4 text-sm ${
          error
            ? 'border-red-400/20 bg-red-400/10 text-red-300'
            : 'border-green-400/20 bg-green-400/10 text-green-300'
        }`}>
          {error || message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">Order</h2>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Buyer</span><span className="text-right text-[#F5E9D6]">{order.userEmail}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Package</span><span className="text-right text-[#F5E9D6]">{order.packageName}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Amount snapshot</span><span className="font-bold text-[#D4AF37]">฿{order.amount.toLocaleString()}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Order status</span><span className="font-semibold text-[#F5E9D6]">{order.status.toUpperCase()}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Provider</span><span className="text-[#F5E9D6]">{order.paymentProvider || '—'}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-[#A1866B]">Created</span><span className="text-right text-[#F5E9D6]">{formatDate(order.createdAt)}</span></div>
        </div>

        <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">Review rule</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#F5E9D6]">
            อนุมัติจะเปลี่ยน <span className="font-semibold">orders.status</span> ของ Order นี้เป็น <span className="font-semibold text-green-400">paid</span> แบบ atomic และจึงเปิดสิทธิ์เดิมของระบบ
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#A1866B]">
            ปฏิเสธจะบันทึกเหตุผลและคงสถานะ Order เป็น <span className="font-semibold text-[#D4AF37]">pending</span> เพื่อให้ผู้ใช้ส่งหลักฐานใหม่ได้
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#F5E9D6]">Payment evidence</h2>
            <p className="text-sm text-[#A1866B]">ไฟล์ถูกเสิร์ฟด้วย signed URL ชั่วคราวสำหรับผู้มี financial.manage เท่านั้น</p>
          </div>
          <span className="text-sm text-[#A1866B]">{submissions.length} submission{submissions.length === 1 ? '' : 's'}</span>
        </div>

        {submissions.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] p-8 text-center text-sm text-[#A1866B]">
            ยังไม่มีสลิปที่ส่งเข้ามา
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {submissions.map((submission) => {
              const isReviewable = submission.status === 'submitted' && order.status === 'pending'

              return (
                <article key={submission.id} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0F0B07] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileImage size={16} className="text-[#D4AF37]" />
                        <span className="font-medium text-[#F5E9D6]">{submission.originalFilename || 'payment-slip'}</span>
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

                  {isReviewable && (
                    <div className="mt-5 border-t border-[rgba(255,255,255,0.08)] pt-4">
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
                          onClick={() => handleApprove(submission.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-bold text-[#0F0B07] hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                          อนุมัติและเปิดสิทธิ์
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(submission.id)}
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
    </div>
  )
}
