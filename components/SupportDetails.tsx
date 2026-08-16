import React from 'react'
import Image from 'next/image'
import { QrCode, Sparkles, Building2 } from 'lucide-react'

export interface SupportDetailsProps {
  qr_image_url?: string
  promptpay_name?: string
  bank_name?: string
  account_number?: string
  /**
   * Whether to show placeholder when qr_image_url is empty.
   * Modal sets this to true; inline Checkout sets this to false.
   * Default is true.
   */
  showPlaceholderIfEmpty?: boolean
  /** QR box max dimension (px). Defaults to 220. */
  qrSize?: number
  /** Additional custom class for the root wrapper if needed */
  className?: string
}

export default function SupportDetails({
  qr_image_url,
  promptpay_name,
  bank_name,
  account_number,
  showPlaceholderIfEmpty = true,
  qrSize = 220,
  className = '',
}: SupportDetailsProps) {
  const hasQR = Boolean(qr_image_url)
  const hasBankInfo = Boolean(bank_name || account_number)

  if (!hasQR && !showPlaceholderIfEmpty) {
    return null
  }

  // Image size inside padding
  const imageSize = Math.max(qrSize - 24, 120)

  return (
    <div className={`flex flex-col items-center gap-4 w-full ${className}`}>
      {/* ── QR Section ── */}
      {hasQR ? (
        <div className="flex flex-col items-center gap-3">
          {/* QR image container */}
          <div
            className="rounded-2xl p-3 flex items-center justify-center shadow-lg"
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(212,175,55,0.15)',
              width: qrSize,
              height: qrSize,
            }}
          >
            <Image
              src={qr_image_url!}
              alt="PromptPay QR Code"
              width={imageSize}
              height={imageSize}
              loading="lazy"
              className="rounded-xl"
              style={{ objectFit: 'contain' }}
            />
          </div>

          {/* PromptPay label */}
          {promptpay_name && (
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="flex items-center gap-1.5">
                <QrCode size={13} className="text-[#D4AF37]/70" />
                <span className="text-[11px] text-[#A1866B] uppercase tracking-wider font-semibold">
                  PromptPay
                </span>
              </div>
              <span className="text-[#F5E9D6] text-[15px] font-bold">{promptpay_name}</span>
            </div>
          )}
        </div>
      ) : (
        /* Placeholder — shown when no QR is configured (e.g. inside SupportModal) */
        <div
          className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center w-full max-w-xs"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(212,175,55,0.2)',
          }}
        >
          <Sparkles size={22} className="text-[#D4AF37]/40" />
          <p className="text-[#A1866B] text-[13px] leading-snug">
            ช่องทางการสนับสนุนจะเปิดให้ใช้งานเร็วๆ นี้
          </p>
          <p className="text-[#A1866B]/50 text-[11px]">
            PromptPay · บัญชีธนาคาร · ช่องทางอื่นๆ
          </p>
        </div>
      )}

      {/* ── Optional bank info ── */}
      {hasBankInfo && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3 w-full max-w-xs text-left"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Building2 size={15} className="text-[#A1866B] mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            {bank_name && (
              <p className="text-[#A1866B] text-[12px]">{bank_name}</p>
            )}
            {account_number && (
              <p className="text-[#F5E9D6] text-[14px] font-bold tracking-widest">
                {account_number}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
