'use client'

import React, { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, Sparkles, CheckCircle2, Lock, ArrowRight } from 'lucide-react'
import { trackSampleResultUpsellView, trackSampleResultUpsellClick } from '@/lib/analytics'

export interface SampleExamResultUpsellModalProps {
  isOpen: boolean
  onClose: () => void
  packageId: string
  packageSlug: string
  packageName: string
  examSetId: string
  currentPrice: number | null | undefined
  originalPrice?: number | null | undefined
  score?: number
  total?: number
  accuracy?: number
}

export default function SampleExamResultUpsellModal({
  isOpen,
  onClose,
  packageId,
  packageSlug,
  packageName,
  examSetId,
  currentPrice,
  originalPrice,
  score,
  total,
  accuracy,
}: SampleExamResultUpsellModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const hasTrackedViewRef = useRef(false)

  // Resolve dynamic price
  const numCurrentPrice =
    currentPrice != null && !isNaN(Number(currentPrice)) && Number(currentPrice) > 0
      ? Number(currentPrice)
      : null
  const numOriginalPrice =
    originalPrice != null && !isNaN(Number(originalPrice)) && Number(originalPrice) > 0
      ? Number(originalPrice)
      : null
  const hasDiscount = Boolean(
    numCurrentPrice && numOriginalPrice && numOriginalPrice > numCurrentPrice
  )

  const ctaLabel = numCurrentPrice
    ? `ปลดล็อกแพ็กเกจเต็ม ฿${numCurrentPrice.toLocaleString()}`
    : 'ดูแพ็กเกจเต็ม'
  const checkoutUrl = `/checkout/${packageId}`

  useEffect(() => {
    if (!isOpen) {
      hasTrackedViewRef.current = false
      return
    }

    // Track modal view once per open
    if (!hasTrackedViewRef.current) {
      hasTrackedViewRef.current = true
      trackSampleResultUpsellView(packageId, examSetId)
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    // Focus close or primary CTA on open
    const focusTimer = setTimeout(() => {
      const primaryBtn = panelRef.current?.querySelector<HTMLElement>('#upsell-modal-primary-cta')
      primaryBtn?.focus()
    }, 50)

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen, onClose, packageId, examSetId])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="sample-upsell-modal-title"
      aria-describedby="sample-upsell-modal-desc"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-[24px] overflow-hidden shadow-2xl focus:outline-none animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: '#1A140E',
          border: '1px solid rgba(212,175,55,0.3)',
          maxHeight: '92dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle gold top-glow line */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-px z-10"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(212,175,55,0.7), transparent)',
          }}
        />

        {/* Close button */}
        <button
          id="sample-upsell-modal-close"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-xl flex items-center justify-center text-[#A1866B] hover:text-[#F5E9D6] hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          aria-label="ปิดป๊อปอัป"
        >
          <X size={18} />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold rounded-full mb-5">
            <Sparkles size={13} fill="currentColor" />
            <span>ทำข้อสอบตัวอย่างเสร็จแล้ว</span>
          </div>

          {/* Optional score context */}
          {score !== undefined && total !== undefined && total > 0 && (
            <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#A1866B] text-xs">
                <CheckCircle2 size={15} className="text-[#22C55E]" />
                <span>คะแนนข้อสอบตัวอย่าง</span>
              </div>
              <div className="text-right">
                <span className="text-[#F5E9D6] font-bold text-sm font-display">
                  {score} / {total} ข้อ
                </span>
                {accuracy !== undefined && (
                  <span className="text-[#D4AF37] text-xs ml-1.5 font-bold">
                    ({accuracy}%)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Heading */}
          <h2
            id="sample-upsell-modal-title"
            className="text-xl sm:text-2xl font-bold font-display text-[#F5E9D6] mb-2 leading-snug"
          >
            อยากฝึกต่อไหม?
          </h2>

          {/* Subtitle */}
          <p
            id="sample-upsell-modal-desc"
            className="text-[#A1866B] text-sm leading-relaxed mb-6"
          >
            ปลดล็อกชุดข้อสอบและเนื้อหาทั้งหมดในแพ็กเกจนี้
          </p>

          {/* Package highlight pill */}
          {packageName && (
            <div className="mb-6 px-3.5 py-2.5 bg-[#0F0B07] border border-[rgba(212,175,55,0.15)] rounded-xl flex items-center gap-2.5">
              <Lock size={14} className="text-[#D4AF37] flex-shrink-0" />
              <span className="text-xs text-[#F5E9D6] font-medium truncate">
                {packageName}
              </span>
            </div>
          )}

          {/* Pricing context if discounted */}
          {hasDiscount && (
            <div className="flex items-center gap-2 mb-3 text-xs text-[#A1866B]">
              <span className="line-through">ปกติ ฿{numOriginalPrice?.toLocaleString()}</span>
              <span className="bg-[#D4AF37]/15 text-[#D4AF37] font-bold px-2 py-0.5 rounded text-[11px] border border-[#D4AF37]/30">
                ประหยัด ฿{((numOriginalPrice ?? 0) - (numCurrentPrice ?? 0)).toLocaleString()}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <Link
              id="upsell-modal-primary-cta"
              href={checkoutUrl}
              onClick={() => trackSampleResultUpsellClick(packageId, examSetId)}
              className="w-full min-h-[48px] px-6 py-3.5 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2 text-base font-display focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>{ctaLabel}</span>
              <ArrowRight size={16} />
            </Link>

            <button
              id="upsell-modal-secondary-cta"
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] px-4 py-2.5 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#A1866B] hover:text-[#F5E9D6] text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            >
              ดูผลสอบก่อน
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
