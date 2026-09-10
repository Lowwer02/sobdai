'use client'

import React from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight, Lock } from 'lucide-react'
import { trackSampleResultUpsellClick } from '@/lib/analytics'

export interface SampleExamResultUpsellCardProps {
  packageId: string
  packageSlug: string
  packageName: string
  examSetId: string
  currentPrice: number | null | undefined
  originalPrice?: number | null | undefined
}

export default function SampleExamResultUpsellCard({
  packageId,
  packageSlug,
  packageName,
  examSetId,
  currentPrice,
  originalPrice,
}: SampleExamResultUpsellCardProps) {
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

  return (
    <section
      aria-label="ข้อเสนอปลดล็อกแพ็กเกจเต็ม"
      className="relative bg-[#1A140E] border border-[#D4AF37]/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_30px_rgba(212,175,55,0.05)] overflow-hidden"
    >
      {/* Decorative gold glow accent */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 90% 10%, rgba(212,175,55,0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold rounded-full mb-3">
            <Sparkles size={12} fill="currentColor" />
            <span>ปลดล็อกแพ็กเกจเต็ม</span>
          </div>

          <h3 className="text-lg sm:text-xl font-bold font-display text-[#F5E9D6] mb-1.5 leading-snug">
            อยากฝึกต่อไหม?
          </h3>
          <p className="text-[#A1866B] text-sm leading-relaxed mb-3 max-w-lg">
            ปลดล็อกชุดข้อสอบและเนื้อหาทั้งหมดในแพ็กเกจ {packageName ? `"${packageName}"` : 'นี้'}
          </p>

          {hasDiscount && (
            <div className="flex items-center gap-2 text-xs text-[#A1866B]">
              <span className="line-through">ปกติ ฿{numOriginalPrice?.toLocaleString()}</span>
              <span className="bg-[#D4AF37]/15 text-[#D4AF37] font-bold px-2 py-0.5 rounded text-[11px] border border-[#D4AF37]/30">
                ประหยัด ฿{((numOriginalPrice ?? 0) - (numCurrentPrice ?? 0)).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3">
          <Link
            id="sample-upsell-card-cta"
            href={checkoutUrl}
            onClick={() => trackSampleResultUpsellClick(packageId, examSetId)}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2 text-sm font-display focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span>{ctaLabel}</span>
            <ArrowRight size={16} />
          </Link>

          <Link
            href={`/package/${packageSlug}`}
            className="w-full sm:w-auto min-h-[48px] px-4 py-3 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#A1866B] hover:text-[#F5E9D6] font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          >
            รายละเอียดแพ็กเกจ
          </Link>
        </div>
      </div>
    </section>
  )
}
