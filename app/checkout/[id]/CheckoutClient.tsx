'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Heart, PlayCircle, QrCode, ShieldCheck } from 'lucide-react'
import SupportDetails from '@/components/SupportDetails'
import PaymentStatusIllustration from '@/components/payment/PaymentStatusIllustration'
import { toastEvent } from '@/hooks/useToast'
import { freePackageClaimed } from '@/lib/analytics'
import type { SupportConfig } from '@/lib/homepageConfig'
import {
  isPaymentSlipMimeType,
  PAYMENT_SLIP_MAX_BYTES,
  PAYMENT_SUBMISSION_LIMIT_ERROR,
  PAYMENT_SUBMISSION_MAX_COUNT,
  sanitizeOriginalFilename,
  type PaymentSubmissionStatus,
} from '@/lib/payment/manual'
import {
  customerPaymentErrorMessage,
  getCustomerPaymentPresentation,
  isCustomerPaymentStaleStateError,
  type CustomerVerificationStatus,
} from '@/lib/payment/customer'

declare global {
  interface Window { OmiseCard: any }
}

export interface ManualPaymentOrder {
  id: string
  amount: number
  status: 'pending'
  submissionStatus: PaymentSubmissionStatus | null
  customerVerificationStatus: CustomerVerificationStatus | null
  submissionCount: number | null
  paymentEvidenceAvailable: boolean
  paymentSettingsAvailable: boolean
}

interface ManualPaymentQrDetails {
  amount: string
  displayName: string
  instructionText: string
}

interface CheckoutClientProps {
  pkg: any
  userEmail: string
  supportConfig?: SupportConfig
  initialManualOrder?: ManualPaymentOrder | null
  manualPaymentEnabled: boolean
}

function formatAmount(value: number | string) {
  return Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function CheckoutClient({
  pkg,
  userEmail: _userEmail,
  supportConfig,
  initialManualOrder = null,
  manualPaymentEnabled,
}: CheckoutClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [omiseLoaded, setOmiseLoaded] = useState(false)
  const [payMethod, setPayMethod] = useState<'card' | 'promptpay'>('promptpay')
  const [claimedSuccess, setClaimedSuccess] = useState(false)
  const [manualOrder, setManualOrder] = useState<ManualPaymentOrder | null>(initialManualOrder)
  const [manualQrDetails, setManualQrDetails] = useState<ManualPaymentQrDetails | null>(null)
  const [manualQrState, setManualQrState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>(
    initialManualOrder && manualPaymentEnabled ? 'loading' : 'idle',
  )
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipSubmitting, setSlipSubmitting] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const currentPrice = Number(pkg.current_price)
  const originalPrice = Number(pkg.original_price)
  const displayedAmount = manualOrder?.amount ?? currentPrice
  const presentation = manualOrder
    ? getCustomerPaymentPresentation({
        orderStatus: manualOrder.status,
        paymentProvider: 'promptpay_manual',
        submissionCount: manualOrder.submissionCount,
        latestSubmissionStatus: manualOrder.submissionStatus,
        verificationStatus: manualOrder.customerVerificationStatus,
        paymentSettingsAvailable: manualOrder.paymentSettingsAvailable,
        evidenceReadAvailable: manualOrder.paymentEvidenceAvailable,
      })
    : null

  const showError = (value: unknown, fallback: string) => {
    const message = customerPaymentErrorMessage(value, fallback)
    setError(message)
    toastEvent(message, 'error')
    if (isCustomerPaymentStaleStateError(value)) router.refresh()
  }

  // Preserve the existing non-manual payment path for server-side compatibility.
  // M1.3B intentionally does not expose this legacy method in the customer UI;
  // PromptPay is the only rendered paid method for the manual-payment flow.
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.omise.co/omise.js'
    script.onload = () => setOmiseLoaded(true)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  useEffect(() => {
    if (!manualOrder || !manualPaymentEnabled) {
      setManualQrState('idle')
      setManualQrDetails(null)
      return
    }

    let cancelled = false
    setManualQrState('loading')
    setManualQrDetails(null)

    fetch(`/api/payment/manual/order/${manualOrder.id}/details`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.success) throw data || new Error('payment details unavailable')
        if (!cancelled) {
          setManualQrDetails({
            amount: String(data.amount),
            displayName: String(data.displayName || ''),
            instructionText: String(data.instructionText || ''),
          })
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setManualQrState('unavailable')
          showError(reason, 'ขณะนี้ยังไม่สามารถรับชำระเงินได้ กรุณาลองใหม่ภายหลัง')
        }
      })

    return () => { cancelled = true }
  }, [manualOrder?.id, manualPaymentEnabled])

  const handleCardPayment = () => {
    if (!omiseLoaded || !window.OmiseCard) {
      showError(null, 'กำลังโหลดระบบชำระเงิน กรุณารอสักครู่')
      return
    }

    setError('')
    window.OmiseCard.configure({
      publicKey: process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
    })

    window.OmiseCard.open({
      frameLabel: 'Sobdai - สอบได้',
      amount: currentPrice * 100,
      currency: 'THB',
      defaultPaymentMethod: 'credit_card',
      submitLabel: `ชำระ ฿${currentPrice.toLocaleString()}`,
      onCreateTokenSuccess: async (token: string) => {
        setLoading(true)
        try {
          const response = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: pkg.id, token }),
          })
          const data = await response.json().catch(() => ({}))
          if (response.ok && data.success) {
            router.push(`/package/${pkg.slug}?success=1`)
          } else {
            showError(data, 'การชำระเงินไม่สำเร็จ กรุณาลองใหม่')
          }
        } catch (reason) {
          showError(reason, 'การชำระเงินไม่สำเร็จ กรุณาลองใหม่')
        } finally {
          setLoading(false)
        }
      },
      onFormClosed: () => setLoading(false),
    })
  }

  const handlePromptPay = async () => {
    if (loading || manualOrder || !manualPaymentEnabled) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/payment/manual/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.success) {
        showError(data, 'ไม่สามารถสร้างคำสั่งซื้อ PromptPay ได้')
        return
      }

      setManualOrder({
        id: data.orderId,
        amount: Number(data.amount),
        status: 'pending',
        submissionStatus: null,
        customerVerificationStatus: null,
        submissionCount: 0,
        paymentEvidenceAvailable: true,
        paymentSettingsAvailable: true,
      })
    } catch (reason) {
      showError(reason, 'สร้างคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const handleSlipSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!manualOrder || slipSubmitting || manualOrder.submissionStatus === 'submitted') return

    if (!manualPaymentEnabled) {
      showError(null, 'ขณะนี้ยังไม่สามารถรับชำระเงินได้ กรุณาลองใหม่ภายหลัง')
      return
    }

    if (!manualOrder.paymentEvidenceAvailable) {
      showError(null, 'ไม่สามารถตรวจสอบสถานะสลิปได้ในขณะนี้ กรุณารีเฟรชแล้วลองใหม่')
      return
    }

    if (manualOrder.submissionCount !== null && manualOrder.submissionCount >= PAYMENT_SUBMISSION_MAX_COUNT) {
      showError(PAYMENT_SUBMISSION_LIMIT_ERROR, PAYMENT_SUBMISSION_LIMIT_ERROR)
      return
    }

    if (!slipFile) {
      showError(null, 'กรุณาเลือกไฟล์สลิป')
      return
    }

    if (!isPaymentSlipMimeType(slipFile.type) || slipFile.size <= 0 || slipFile.size > PAYMENT_SLIP_MAX_BYTES) {
      showError(slipFile.size > PAYMENT_SLIP_MAX_BYTES ? 'ไฟล์มีขนาดใหญ่เกินไป' : 'ชนิดไฟล์ไม่รองรับ', 'ส่งหลักฐานไม่สำเร็จ กรุณาตรวจสอบไฟล์')
      return
    }

    setSlipSubmitting(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('orderId', manualOrder.id)
      formData.append('idempotencyKey', crypto.randomUUID())
      formData.append('file', slipFile, sanitizeOriginalFilename(slipFile.name))

      const response = await fetch('/api/payment/manual/slip', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.success) {
        showError(data, 'ส่งหลักฐานไม่สำเร็จ กรุณาลองอีกครั้ง')
        return
      }

      setManualOrder((current) => current
        ? {
            ...current,
            submissionStatus: 'submitted',
            customerVerificationStatus: 'checking',
            submissionCount: (current.submissionCount ?? 0) + 1,
            paymentEvidenceAvailable: true,
          }
        : current)
      setSlipFile(null)
      setFileInputKey((key) => key + 1)
      toastEvent('ส่งหลักฐานเรียบร้อยแล้ว กำลังตรวจสอบหลักฐานการชำระเงิน', 'success')
    } catch (reason) {
      showError(reason, 'ส่งหลักฐานไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setSlipSubmitting(false)
    }
  }

  const handleFreeCheckout = async () => {
    if (loading || claimedSuccess) return
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, token: 'free_token' }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        showError(data, 'เปิดใช้งานแพ็กเกจไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      if (data.success) {
        setClaimedSuccess(true)
        freePackageClaimed(pkg.id, pkg.name)
        toastEvent('เปิดใช้งานแพ็กเกจเรียบร้อยแล้ว', 'success')
        return
      }

      showError(data, 'เปิดใช้งานแพ็กเกจไม่สำเร็จ กรุณาลองใหม่')
    } catch (reason) {
      showError(reason, 'เปิดใช้งานแพ็กเกจไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const showSupportSection = claimedSuccess && Boolean(supportConfig?.enabled) && Boolean(supportConfig?.qr_image_url?.trim())

  const packageImage = pkg.cover_image_url || pkg.logo_url || pkg.organizations?.logo_url
  const packageImageAlt = pkg.positions?.name || pkg.name

  return (
    <div className="min-h-screen bg-background pb-20 font-sans text-foreground">
      <div className="sticky top-0 z-50 border-b border-border-subtle bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-4 px-4">
          <Link
            href={`/package/${pkg.slug}`}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-hover hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"
            aria-label="กลับไปหน้าแพ็กเกจ"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="font-bold text-foreground">{claimedSuccess ? 'รับแพ็กเกจสำเร็จ' : 'ยืนยันคำสั่งซื้อ'}</div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-xl space-y-6 px-4">
        <section className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">สรุปแพ็กเกจ</h2>

          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface p-2">
              {packageImage ? (
                <Image src={packageImage} alt={packageImageAlt} width={64} height={64} className="h-full w-full object-contain" />
              ) : (
                <span className="font-display text-xl font-bold text-brand">{pkg.organizations?.name?.charAt(0) || 'S'}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{pkg.organizations?.name}</div>
              <div className="mt-1 font-bold leading-snug text-foreground">{pkg.positions?.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{pkg.name}</div>
            </div>
          </div>

          <div className="my-6 h-px bg-border-subtle" />
          <div className="flex items-end justify-between gap-4">
            <div className="font-medium text-muted-foreground">ยอดชำระสุทธิ</div>
            <div className="text-right">
              {!manualOrder && originalPrice > currentPrice && (
                <div className="mb-1 text-sm text-muted-foreground line-through">฿{originalPrice.toLocaleString()}</div>
              )}
              <div className="font-display text-3xl font-bold text-brand">฿{formatAmount(displayedAmount)}</div>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-success-border bg-success-bg p-3 text-sm text-success">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <span className="font-bold">
                {claimedSuccess ? 'เปิดใช้งานสิทธิ์เรียบร้อยแล้ว' : currentPrice === 0 ? 'แพ็กเกจนี้เปิดให้ใช้งานฟรี' : 'สิทธิ์ใช้งานแพ็กเกจนี้ตลอดชีพ'}
              </span>
              <div className="mt-1 text-xs opacity-80">
                {currentPrice === 0 ? 'ปลดล็อกเนื้อหาทั้งหมดในแพ็กเกจนี้ทันที' : 'ชำระครั้งเดียว ไม่มีค่ารายเดือน'}
              </div>
            </div>
          </div>
        </section>

        {currentPrice === 0 ? (
          claimedSuccess ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-success-border bg-card p-6 text-center shadow-sm">
                <PaymentStatusIllustration state="free" />
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">คุณได้รับสิทธิ์เข้าถึงเนื้อหาและชุดข้อสอบทั้งหมดในแพ็กเกจนี้แล้ว</p>
                <Link
                  href={`/package/${pkg.slug}#resources`}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-5 py-4 font-bold text-success-foreground transition-colors hover:bg-success-hover focus:outline-none focus:ring-4 focus:ring-success/30"
                >
                  <PlayCircle size={20} aria-hidden="true" />
                  เริ่มเรียน
                </Link>
              </section>

              {showSupportSection && supportConfig && (
                <section className="rounded-2xl border border-border-subtle bg-card p-6 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-brand/20 bg-wash">
                    <Heart size={18} className="text-brand" fill="currentColor" aria-hidden="true" />
                  </div>
                  <h2 className="mt-3 font-bold text-foreground">{supportConfig.title || 'สนับสนุน Sobdai'}</h2>
                  {supportConfig.description && <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{supportConfig.description}</p>}
                  <div className="py-4">
                    <SupportDetails
                      qr_image_url={supportConfig.qr_image_url}
                      promptpay_name={supportConfig.promptpay_name}
                      bank_name={supportConfig.bank_name}
                      account_number={supportConfig.account_number}
                      showPlaceholderIfEmpty={false}
                      qrSize={180}
                    />
                  </div>
                  {supportConfig.footer_message && <p className="text-xs leading-relaxed text-brand">{supportConfig.footer_message}</p>}
                  <p className="mt-4 border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-muted-foreground">การสนับสนุนเป็นทางเลือก ไม่จำเป็นต่อการรับหรือใช้งานแพ็กเกจฟรี</p>
                </section>
              )}
            </div>
          ) : (
            <section className="rounded-2xl border border-border-subtle bg-card p-6 text-center">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">รับสิทธิ์ใช้งาน</h2>
              <p className="mb-6 text-foreground">แพ็กเกจนี้เปิดให้ใช้งานฟรี กดปุ่มด้านล่างเพื่อรับสิทธิ์ใช้งานทันที</p>
              {error && <div className="mb-6 rounded-xl border border-destructive-border bg-destructive-bg p-4 text-left text-sm font-medium text-destructive" role="alert">{error}</div>}
              <div className="mb-6 flex gap-3 rounded-xl border border-border-subtle bg-surface p-3.5 text-left text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>ฉันเข้าใจและยอมรับว่า <strong className="font-medium text-foreground">สินค้าดิจิทัลไม่สามารถขอคืนเงินได้</strong> หลังจากได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว</span>
              </div>
              <button
                type="button"
                onClick={handleFreeCheckout}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-solid py-4 font-bold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-brand/30"
              >
                {loading ? 'กำลังดำเนินการ...' : 'รับแพ็กเกจฟรี'}
              </button>
            </section>
          )
        ) : (
          <>
            {/* Paid Checkout Panel */}
            <section className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">ช่องทางชำระเงิน</h2>

            <div className="mb-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPayMethod('promptpay')}
                aria-pressed={payMethod === 'promptpay'}
                className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-brand bg-wash p-4 text-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                <QrCode size={24} aria-hidden="true" />
                <span className="text-sm font-bold">พร้อมเพย์</span>
              </button>
            </div>

            {error && <div className="mb-6 rounded-xl border border-destructive-border bg-destructive-bg p-4 text-sm font-medium text-destructive" role="alert">{error}</div>}

            {!manualPaymentEnabled && !manualOrder ? (
              <div className="rounded-xl border border-destructive-border bg-destructive-bg p-5">
                <PaymentStatusIllustration state="payment_disabled" compact />
              </div>
            ) : manualOrder && presentation ? (
              <div className="space-y-5">
                {(presentation.state === 'auto_checking' || presentation.state === 'under_review' || presentation.state === 'payment_disabled') && (
                  <div className="rounded-xl border border-border-subtle bg-surface p-5">
                    <PaymentStatusIllustration state={presentation.state} title={presentation.title} description={presentation.description} />
                    <Link
                      href={`/orders/${manualOrder.id}`}
                      className="mx-auto mt-5 inline-flex w-full max-w-sm items-center justify-center rounded-xl border border-brand/40 px-4 py-3 text-sm font-bold text-brand transition-colors hover:bg-wash focus:outline-none focus:ring-2 focus:ring-brand/50"
                    >
                      ดูรายละเอียดคำสั่งซื้อ
                    </Link>
                  </div>
                )}

                {(presentation.state === 'awaiting_upload' || presentation.state === 'rejected') && (
                  <>
                    <PaymentStatusIllustration state={presentation.state} title={presentation.title} description={presentation.description} compact />

                    {manualPaymentEnabled && !(presentation.state === 'rejected' && manualOrder.paymentSettingsAvailable === false) ? (
                      <>
                        <div className="rounded-xl border border-border-subtle bg-surface p-4 text-center">
                          <h3 className="text-lg font-bold text-foreground">โอนเงินผ่าน PromptPay</h3>
                          <p className="mt-1 text-sm text-muted-foreground">กรุณาโอนยอดให้ตรงกับคำสั่งซื้อ</p>
                          <p className="mt-2 text-3xl font-bold text-brand">฿{formatAmount(manualQrDetails?.amount ?? manualOrder.amount)}</p>
                        </div>

                        <div className="rounded-lg border border-border-subtle bg-white p-4 text-center">
                          {manualQrState === 'loading' && <div className="py-12 text-sm text-slate-600">กำลังเตรียม QR สำหรับคำสั่งซื้อนี้...</div>}
                          {manualQrState !== 'unavailable' && (
                            <img
                              src={`/api/payment/manual/order/${manualOrder.id}/qr`}
                              alt={`QR PromptPay สำหรับชำระเงิน ฿${manualQrDetails?.amount ?? formatAmount(manualOrder.amount)}`}
                              width={280}
                              height={280}
                              className={`mx-auto h-auto w-[280px] max-w-full ${manualQrState === 'loading' ? 'hidden' : ''}`}
                              onLoad={() => setManualQrState('ready')}
                              onError={() => setManualQrState('unavailable')}
                            />
                          )}
                          {manualQrState === 'unavailable' && <div className="py-8 text-sm text-red-700">ขณะนี้การชำระเงินผ่าน PromptPay ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง</div>}
                        </div>

                        {manualQrState === 'ready' && manualQrDetails && (
                          <div className="space-y-2 text-center">
                            {manualQrDetails.displayName && <p className="font-bold text-foreground">{manualQrDetails.displayName}</p>}
                            {manualQrDetails.instructionText && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{manualQrDetails.instructionText}</p>}
                          </div>
                        )}

                        {manualQrState !== 'ready' || !manualQrDetails ? (
                          <div className="rounded-lg border border-border-subtle bg-surface p-4 text-center text-sm text-muted-foreground">
                            {manualQrState === 'unavailable' ? 'ยังไม่สามารถดำเนินการส่งหลักฐานได้ กรุณาลองใหม่ภายหลัง' : 'กำลังตรวจสอบข้อมูลการชำระเงิน...'}
                          </div>
                        ) : manualOrder.paymentEvidenceAvailable && manualOrder.submissionCount !== null && manualOrder.submissionCount >= PAYMENT_SUBMISSION_MAX_COUNT ? (
                          <div className="rounded-lg border border-destructive-border bg-destructive-bg p-3 text-center text-sm text-destructive" role="alert">{PAYMENT_SUBMISSION_LIMIT_ERROR}</div>
                        ) : manualOrder.paymentEvidenceAvailable ? (
                          <form onSubmit={handleSlipSubmit} className="space-y-3">
                            <label htmlFor="payment-slip" className="block text-sm font-semibold text-foreground">แนบสลิปการโอนเงิน</label>
                            <input
                              key={fileInputKey}
                              id="payment-slip"
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              onChange={(event) => {
                                setSlipFile(event.target.files?.[0] || null)
                                setError('')
                              }}
                              className="block w-full rounded-lg border border-border-subtle bg-input p-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-brand-solid file:px-3 file:py-2 file:font-semibold file:text-brand-foreground"
                            />
                            <p className="text-xs text-muted-foreground">รองรับไฟล์ JPG, PNG, WebP หรือ PDF ขนาดไม่เกิน 4 MB</p>
                            <button
                              type="submit"
                              disabled={slipSubmitting || !slipFile}
                              className="w-full rounded-lg bg-brand-solid py-3 font-bold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/50"
                            >
                              {slipSubmitting ? 'กำลังอัปโหลดสลิป...' : 'ส่งสลิปให้ผู้ดูแลตรวจสอบ'}
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <div className="rounded-xl border border-destructive-border bg-destructive-bg p-4 text-sm text-destructive" role="alert">
                        {presentation.state === 'rejected' && manualOrder.paymentSettingsAvailable === false
                          ? 'ขณะนี้ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณากลับมาลองใหม่ภายหลัง'
                          : 'ขณะนี้ยังไม่สามารถรับชำระเงินได้ กรุณาลองใหม่ภายหลัง'}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-border-subtle bg-surface p-3.5 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>ระบบจะตรวจสอบยอดและหลักฐานก่อนเปิดสิทธิ์แพ็กเกจ กรุณาเก็บสลิปไว้จนกว่าการตรวจสอบจะเสร็จสิ้น</span>
                </div>
                <button
                  type="button"
                  onClick={handlePromptPay}
                  disabled={loading || !manualPaymentEnabled}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-solid py-4 font-bold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-brand/30"
                >
                  <QrCode size={20} aria-hidden="true" />
                  {loading ? 'กำลังสร้างคำสั่งซื้อ...' : 'สร้าง QR PromptPay เพื่อชำระเงิน'}
                </button>
              </>
            )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
