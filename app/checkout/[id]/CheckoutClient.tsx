'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ShieldCheck, QrCode, CheckCircle2, PlayCircle, Heart } from 'lucide-react'
import SupportDetails from '@/components/SupportDetails'
import { freePackageClaimed } from '@/lib/analytics'
import type { SupportConfig } from '@/lib/homepageConfig'
import {
  isPaymentSlipMimeType,
  PAYMENT_SLIP_MAX_BYTES,
  sanitizeOriginalFilename,
  type PaymentSubmissionStatus,
} from '@/lib/payment/manual'

export interface ManualPaymentOrder {
  id: string
  amount: number
  status: 'pending'
  submissionStatus: PaymentSubmissionStatus | null
  rejectionReason: string | null
}

interface CheckoutClientProps {
  pkg: any
  userEmail: string
  supportConfig?: SupportConfig
  initialManualOrder?: ManualPaymentOrder | null
}

declare global {
  interface Window { OmiseCard: any }
}

export default function CheckoutClient({ pkg, userEmail, supportConfig, initialManualOrder = null }: CheckoutClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [omiseLoaded, setOmiseLoaded] = useState(false)
  const [payMethod, setPayMethod] = useState<'card' | 'promptpay'>('promptpay')
  const [claimedSuccess, setClaimedSuccess] = useState(false)
  const [manualOrder, setManualOrder] = useState<ManualPaymentOrder | null>(initialManualOrder)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipSubmitting, setSlipSubmitting] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const discount = pkg.original_price > pkg.current_price 
    ? Math.round(((pkg.original_price - pkg.current_price) / pkg.original_price) * 100) 
    : 0

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.omise.co/omise.js'
    script.onload = () => setOmiseLoaded(true)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handleCardPayment = () => {
    if (manualOrder?.submissionStatus === 'submitted') {
      setError('ระบบได้รับสลิป PromptPay แล้ว กรุณารอการตรวจสอบ')
      return
    }

    if (!omiseLoaded || !window.OmiseCard) {
      setError('กำลังโหลดระบบชำระเงิน กรุณารอสักครู่')
      return
    }

    setError('')
    window.OmiseCard.configure({
      publicKey: process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
    })

    window.OmiseCard.open({
      frameLabel: 'Sobdai - สอบได้',
      amount: pkg.current_price * 100, // Satang
      currency: 'THB',
      defaultPaymentMethod: 'credit_card',
      submitLabel: `ชำระ ฿${pkg.current_price.toLocaleString()}`,
      onCreateTokenSuccess: async (token: string) => {
        setLoading(true)
        try {
          const res = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: pkg.id, token }),
          })
          const data = await res.json()
          if (data.success) {
            router.push(`/package/${pkg.slug}?success=1`)
          } else {
            setError(data.error || 'การชำระเงินไม่สำเร็จ')
          }
        } catch {
          setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
          setLoading(false)
        }
      },
      onFormClosed: () => setLoading(false),
    })
  }

  const handlePromptPay = async () => {
    if (loading || manualOrder) return

    if (!supportConfig?.qr_image_url?.trim()) {
      setError('ช่องทาง PromptPay ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/payment/manual/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'ไม่สามารถสร้างคำสั่งซื้อ PromptPay ได้')
        return
      }

      setManualOrder({
        id: data.orderId,
        amount: Number(data.amount),
        status: 'pending',
        submissionStatus: null,
        rejectionReason: null,
      })
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const handleSlipSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!manualOrder || slipSubmitting || manualOrder.submissionStatus === 'submitted') return

    if (!slipFile) {
      setError('กรุณาเลือกไฟล์สลิป')
      return
    }

    if (!isPaymentSlipMimeType(slipFile.type) || slipFile.size <= 0 || slipFile.size > PAYMENT_SLIP_MAX_BYTES) {
      setError('รองรับไฟล์ JPG, PNG, WEBP หรือ PDF ขนาดไม่เกิน 4 MB')
      return
    }

    setSlipSubmitting(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('orderId', manualOrder.id)
      formData.append('idempotencyKey', crypto.randomUUID())
      formData.append('file', slipFile, sanitizeOriginalFilename(slipFile.name))

      const res = await fetch('/api/payment/manual/slip', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'ไม่สามารถส่งสลิปได้ กรุณาลองใหม่')
        return
      }

      setManualOrder((current) => current
        ? { ...current, submissionStatus: 'submitted', rejectionReason: null }
        : current)
      setSlipFile(null)
      setFileInputKey((key) => key + 1)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSlipSubmitting(false)
    }
  }

  const handleFreeCheckout = async () => {
    if (loading || claimedSuccess) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, token: 'free_token' }), // Token can be anything for free
      })
      const data = await res.json()
      if (data.success) {
        setClaimedSuccess(true)
        freePackageClaimed(pkg.id, pkg.name)
      } else {
        setError(data.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  // Voluntary Support is rendered only after successful claim, when enabled and QR exists
  const showSupportSection =
    claimedSuccess &&
    Boolean(supportConfig?.enabled) &&
    Boolean(supportConfig?.qr_image_url?.trim())

  return (
    <div className="min-h-screen bg-[#0F0B07] font-sans pb-20">
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0F0B07] border-b border-[rgba(212,175,55,0.1)] h-16 flex items-center px-4">
        <div className="max-w-2xl mx-auto w-full flex items-center gap-4">
          <Link href={`/package/${pkg.slug}`} className="text-[#A1866B] hover:text-[#D4AF37] transition-colors p-2 -ml-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)]">
            <ChevronLeft size={20} />
          </Link>
          <div className="font-bold text-[#F5E9D6]">
            {claimedSuccess ? 'รับแพ็กเกจสำเร็จ' : 'ยืนยันคำสั่งซื้อ'}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-8 space-y-6">
        
        {/* Order Summary Card */}
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-2xl p-6">
          <h2 className="text-[#A1866B] text-sm font-bold uppercase tracking-wider mb-4">สรุปแพ็กเกจ</h2>
          
          <div className="flex gap-4 items-start mb-6">
            <div className="w-16 h-16 rounded-full bg-[#0F0B07] border border-[rgba(212,175,55,0.2)] flex-shrink-0 overflow-hidden shadow-[0_0_12px_rgba(212,175,55,0.1)]">
              {pkg.cover_image_url ? (
                <Image src={pkg.cover_image_url} alt={pkg.positions?.name || pkg.name} width={64} height={64} className="w-full h-full object-cover" />
              ) : pkg.logo_url || pkg.organizations?.logo_url ? (
                <Image src={pkg.logo_url || pkg.organizations?.logo_url} alt="logo" width={64} height={64} className="w-full h-full object-contain p-2" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xl font-display font-bold text-[#D4AF37]">{pkg.organizations?.name?.charAt(0) || 'O'}</span>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-[#A1866B] mb-1">{pkg.organizations?.name}</div>
              <div className="font-bold text-[#F5E9D6] mb-1 leading-snug">{pkg.positions?.name}</div>
              <div className="text-sm text-[#A1866B]">{pkg.name}</div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-[rgba(212,175,55,0.2)] to-transparent my-6" />

          <div className="flex justify-between items-end">
            <div className="text-[#A1866B] font-medium">ยอดชำระสุทธิ</div>
            <div className="text-right">
              {pkg.original_price > pkg.current_price && (
                <div className="text-sm text-[#A1866B] line-through mb-1">฿{pkg.original_price.toLocaleString()}</div>
              )}
              <div className="text-3xl font-display font-bold text-[#D4AF37]">
                ฿{pkg.current_price.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3 text-sm text-green-400">
            <ShieldCheck size={18} className="flex-shrink-0" />
            <div>
              <span className="font-bold">
                {claimedSuccess
                  ? 'เปิดใช้งานสิทธิ์เรียบร้อยแล้ว'
                  : pkg.current_price === 0
                    ? 'แพ็กเกจนี้เปิดให้ใช้งานฟรี'
                    : 'สิทธิ์ใช้งานแพ็กเกจนี้ตลอดชีพ'}
              </span>
              <div className="text-xs opacity-80">
                {pkg.current_price === 0
                  ? 'ปลดล็อคเนื้อหาทั้งหมดในแพ็กเกจนี้ทันที'
                  : 'ชำระครั้งเดียว ไม่มีค่ารายเดือน'}
              </div>
            </div>
          </div>
        </div>

        {/* Free or Paid Condition */}
        {pkg.current_price === 0 ? (
          claimedSuccess ? (
            /* ── Claim Success Panel ── */
            <div className="space-y-6">
              <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.25)] rounded-2xl p-6 text-center shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4 text-green-400">
                  <CheckCircle2 size={24} />
                </div>
                <h2 className="text-xl font-bold text-[#F5E9D6] mb-2 font-display">
                  เปิดใช้งานแพ็กเกจเรียบร้อยแล้ว
                </h2>
                <p className="text-sm text-[#A1866B] mb-6">
                  คุณได้รับสิทธิ์เข้าถึงเนื้อหาและชุดข้อสอบทั้งหมดในแพ็กเกจนี้แล้ว
                </p>

                {/* Primary CTA: Start Learning */}
                <Link
                  href={`/package/${pkg.slug}#resources`}
                  className="w-full py-4 rounded-xl font-bold text-white bg-[#22C55E] hover:bg-[#1EA950] shadow-[0_10px_25px_rgba(34,197,94,0.25)] transition-all flex items-center justify-center gap-2 text-[16px] font-display hover:scale-[1.01]"
                >
                  <PlayCircle size={20} />
                  เริ่มเรียน
                </Link>
              </div>

              {/* ── Voluntary Support Section (Optional, below Primary CTA) ── */}
              {showSupportSection && supportConfig && (
                <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.06)] rounded-2xl p-6 text-center space-y-4">
                  {/* Heart & Title */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: 'rgba(212,175,55,0.08)',
                        border: '1px solid rgba(212,175,55,0.15)',
                      }}
                    >
                      <Heart size={18} className="text-[#D4AF37]" fill="rgba(212,175,55,0.2)" />
                    </div>
                    <h3 className="text-base font-bold text-[#F5E9D6] font-display">
                      {supportConfig.title || 'สนับสนุน Sobdai'}
                    </h3>
                    {supportConfig.description && (
                      <p className="text-xs text-[#A1866B] max-w-sm leading-relaxed">
                        {supportConfig.description}
                      </p>
                    )}
                  </div>

                  {/* Shared Support QR & Details */}
                  <div className="py-2">
                    <SupportDetails
                      qr_image_url={supportConfig.qr_image_url}
                      promptpay_name={supportConfig.promptpay_name}
                      bank_name={supportConfig.bank_name}
                      account_number={supportConfig.account_number}
                      showPlaceholderIfEmpty={false}
                      qrSize={180}
                    />
                  </div>

                  {/* Optional CMS footer message */}
                  {supportConfig.footer_message && (
                    <p className="text-center text-[#D4AF37]/70 text-[12px] leading-relaxed">
                      {supportConfig.footer_message}
                    </p>
                  )}

                  {/* Static Checkout Disclosure */}
                  <p className="text-[11px] text-[#A1866B]/60 leading-relaxed pt-2 border-t border-[rgba(255,255,255,0.05)]">
                    การสนับสนุนเป็นทางเลือก ไม่จำเป็นต่อการรับหรือใช้งานแพ็กเกจฟรี
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* ── Before Claim ── */
            <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6 text-center">
              <h2 className="text-[#A1866B] text-sm font-bold uppercase tracking-wider mb-4">รับสิทธิ์ใช้งาน</h2>
              <p className="text-[#F5E9D6] mb-6">แพ็กเกจนี้เปิดให้ใช้งานฟรี กดปุ่มด้านล่างเพื่อรับสิทธิ์ใช้งานทันที</p>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="mb-6 text-[12px] text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] p-3.5 rounded-xl flex gap-2.5 text-left leading-relaxed">
                <ShieldCheck size={16} className="text-[#A1866B] flex-shrink-0 mt-0.5" />
                <span>ฉันเข้าใจและยอมรับว่า <strong className="text-[#F5E9D6] font-medium">สินค้าดิจิทัลไม่สามารถขอคืนเงินได้</strong> หลังจากที่ได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว</span>
              </div>

              <button type="button"
                onClick={handleFreeCheckout}
                disabled={loading}
                className={`w-full py-4 rounded-xl font-bold text-[#1A140E] transition-all flex justify-center items-center gap-2 ${
                  loading
                    ? 'bg-[#A1866B] cursor-not-allowed opacity-70'
                    : 'bg-[#D4AF37] hover:bg-[#F1D17A] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-[#1A140E]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังดำเนินการ...
                  </>
                ) : (
                  'รับแพ็กเกจฟรี'
                )}
              </button>
            </div>
          )
        ) : (
          /* ── Paid Checkout Panel (Unchanged) ── */
          <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
            <h2 className="text-[#A1866B] text-sm font-bold uppercase tracking-wider mb-4">ช่องทางชำระเงิน</h2>

            <div className="flex gap-3 mb-6">
              <button type="button"
                onClick={() => setPayMethod('promptpay')}
                className={`flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                  payMethod === 'promptpay'
                    ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                    : 'bg-[#0F0B07] border-[rgba(255,255,255,0.05)] text-[#A1866B] hover:border-[#D4AF37]/50'
                }`}
              >
                <QrCode size={24} />
                <span className="text-sm font-bold">พร้อมเพย์</span>
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="mb-6 text-[12px] text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] p-3.5 rounded-xl flex gap-2.5 text-left leading-relaxed">
              <ShieldCheck size={16} className="text-[#A1866B] flex-shrink-0 mt-0.5" />
              <span>ฉันเข้าใจและยอมรับว่า <strong className="text-[#F5E9D6] font-medium">สินค้าดิจิทัลไม่สามารถขอคืนเงินได้</strong> หลังจากที่ได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว</span>
            </div>

            {payMethod === 'promptpay' && manualOrder ? (
              <div className="space-y-5 rounded-xl border border-[#D4AF37]/20 bg-[#0F0B07] p-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-[#F5E9D6]">โอนเงินผ่าน PromptPay</h3>
                  <p className="mt-1 text-sm text-[#A1866B]">กรุณาโอนยอดให้ตรงกับคำสั่งซื้อ</p>
                  <p className="mt-2 text-3xl font-bold text-[#D4AF37]">฿{manualOrder.amount.toLocaleString()}</p>
                </div>

                {supportConfig?.qr_image_url ? (
                  <SupportDetails
                    qr_image_url={supportConfig.qr_image_url}
                    promptpay_name={supportConfig.promptpay_name}
                    bank_name={supportConfig.bank_name}
                    account_number={supportConfig.account_number}
                    showPlaceholderIfEmpty={false}
                    qrSize={220}
                  />
                ) : (
                  <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-center text-sm text-red-300">
                    ไม่พบ QR สำหรับรับชำระเงิน กรุณาติดต่อผู้ดูแลระบบ
                  </div>
                )}

                {manualOrder.submissionStatus === 'submitted' ? (
                  <div className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-4 text-center text-sm text-[#F1D17A]">
                    ได้รับสลิปแล้ว กำลังรอผู้ดูแลตรวจสอบ คุณจะได้รับสิทธิ์หลังการอนุมัติ
                  </div>
                ) : (
                  <>
                    {manualOrder.submissionStatus === 'rejected' && (
                      <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
                        สลิปก่อนหน้าถูกปฏิเสธ{manualOrder.rejectionReason ? `: ${manualOrder.rejectionReason}` : ''} กรุณาโอนใหม่และส่งหลักฐานอีกครั้ง
                      </div>
                    )}

                    <form onSubmit={handleSlipSubmit} className="space-y-3">
                      <label htmlFor="payment-slip" className="block text-sm font-semibold text-[#F5E9D6]">
                        แนบสลิปการโอนเงิน
                      </label>
                      <input
                        key={fileInputKey}
                        id="payment-slip"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => {
                          setSlipFile(event.target.files?.[0] || null)
                          setError('')
                        }}
                        className="block w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1A140E] p-2 text-sm text-[#A1866B] file:mr-3 file:rounded-md file:border-0 file:bg-[#D4AF37] file:px-3 file:py-2 file:font-semibold file:text-[#1A140E]"
                      />
                      <p className="text-xs text-[#A1866B]">รองรับ JPG, PNG, WEBP หรือ PDF ขนาดไม่เกิน 4 MB</p>
                      <button
                        type="submit"
                        disabled={slipSubmitting || !slipFile}
                        className="w-full rounded-lg bg-[#D4AF37] py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {slipSubmitting ? 'กำลังอัปโหลดสลิป...' : 'ส่งสลิปให้ผู้ดูแลตรวจสอบ'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            ) : (
            <button type="button"
              onClick={payMethod === 'card' ? handleCardPayment : handlePromptPay}
              disabled={loading || (payMethod === 'card' && !omiseLoaded)}
              className={`w-full py-4 rounded-xl font-bold text-[#1A140E] transition-all flex justify-center items-center gap-2 ${
                loading || (payMethod === 'card' && !omiseLoaded)
                  ? 'bg-[#A1866B] cursor-not-allowed opacity-70'
                  : 'bg-[#D4AF37] hover:bg-[#F1D17A] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-[#1A140E]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังดำเนินการ...
                </>
              ) : payMethod === 'promptpay' ? (
                'สร้าง QR PromptPay เพื่อชำระเงิน'
              ) : (
                `ชำระเงิน ฿${pkg.current_price.toLocaleString()}`
              )}
            </button>
            )}

            <p className="text-center text-xs text-[#A1866B] mt-6 leading-relaxed">
              ระบบจะตรวจสอบยอดและหลักฐานก่อนเปิดสิทธิ์แพ็กเกจ <br/>
              กรุณาเก็บสลิปไว้จนกว่าการตรวจสอบจะเสร็จสิ้น
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
