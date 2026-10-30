'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Sparkles, Clock, FileText, PlayCircle, LogIn, Share2, Check } from 'lucide-react'
import { FREE_EXAM_ANCHOR, buildFreeExamHeading, buildFreeExamShareUrl } from '@/lib/seo'

/**
 * PackageSampleExamSection
 *
 * Presents the resolved sample exam in a high-visibility position immediately
 * after the Package Hero, before the long #resources lists.
 *
 * Design invariants (Sobdai v1 system):
 *   background   #0F0B07 / #1A140E
 *   border       rgba(212,175,55,0.3)
 *   gold         #D4AF37
 *   body text    #F5E9D6
 *   muted text   #A1866B
 *   radius       rounded-[24px]  (matches Hero and resource cards)
 *
 * Auth invariants (MUST remain true):
 *   - Authenticated user → CTA links directly to exam page.
 *   - Guest → CTA links to /login?redirect=<exam URL>, using the existing app
 *     login/register flow.  No anonymous attempt is created.
 *   - isAuthenticated is required (boolean) — no optional fallback that could
 *     silently serve guest copy to an authenticated user or vice-versa.
 *
 * Metadata display rules (no misleading zero values):
 *   - duration_minutes: only shown when > 0.
 *   - qCount:          only shown when > 0.
 *
 * Copy rules:
 *   - No hardcoded product-quality claims.
 *   - Safe approved copy only.
 */

export interface SampleExamMeta {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  /** qCount is the UI-computed question count attached in page.tsx */
  qCount?: number
}

export interface PackageSampleExamSectionProps {
  sampleExam: SampleExamMeta
  packageSlug: string
  /** Required — resolved from supabase.auth.getUser() in page.tsx (server-side). */
  isAuthenticated: boolean
  /**
   * Package position display name (canonical Position Entity name preferred,
   * package positions.name fallback) resolved in PackageClient from server
   * data. Drives the dynamic heading "ทดลองทำข้อสอบฟรี — {positionName}";
   * when missing the heading falls back to "ทดลองทำข้อสอบฟรี".
   */
  positionName?: string | null
}

export default function PackageSampleExamSection({
  sampleExam,
  packageSlug,
  isAuthenticated,
  positionName = null,
}: PackageSampleExamSectionProps) {
  const examHref = `/package/${packageSlug}/exam/${sampleExam.id}`
  const loginHref = `/login?redirect=${encodeURIComponent(examHref)}`
  const ctaHref = isAuthenticated ? examHref : loginHref

  const hasDuration = sampleExam.duration_minutes > 0
  const hasQuestionCount = (sampleExam.qCount ?? 0) > 0

  // ── Share Free Exam (V1.1) ──────────────────────────────────────────────
  // Native share sheet when available; clipboard copy otherwise. AbortError
  // is a normal sheet cancellation. Feedback is shown ONLY for clipboard
  // results — never claim success unless copying actually succeeded.
  type ShareFeedback = 'idle' | 'copied' | 'failed'
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('idle')
  const shareFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (shareFeedbackTimer.current) clearTimeout(shareFeedbackTimer.current)
    },
    []
  )
  const showShareFeedback = (feedback: ShareFeedback) => {
    setShareFeedback(feedback)
    if (shareFeedbackTimer.current) clearTimeout(shareFeedbackTimer.current)
    shareFeedbackTimer.current = setTimeout(() => setShareFeedback('idle'), 2500)
  }

  const shareUrl = buildFreeExamShareUrl(packageSlug)
  const shareTitle = buildFreeExamHeading(positionName)
  const shareText = 'ลองทำข้อสอบตัวอย่างฟรีก่อนตัดสินใจเลือกแพ็กเกจกัน'

  const handleShare = async () => {
    // A. Native system share sheet when supported.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: shareUrl, title: shareTitle, text: shareText })
        return
      } catch (error) {
        // D. User cancelled the sheet — normal, not an error.
        if (error instanceof DOMException && error.name === 'AbortError') return
        // E. Genuine share failure — fall through to the clipboard.
      }
    }
    // B. Clipboard fallback (also reached when the native share failed).
    try {
      await navigator.clipboard.writeText(shareUrl)
      showShareFeedback('copied')
    } catch {
      // C. Never display success unless copying actually succeeded.
      showShareFeedback('failed')
    }
  }

  return (
    <section
      id={FREE_EXAM_ANCHOR}
      aria-label="ข้อสอบตัวอย่าง"
      className="relative bg-[#1A140E] border border-[#D4AF37]/30 rounded-[24px] shadow-[0_0_40px_rgba(212,175,55,0.06)] overflow-hidden scroll-mt-[88px]"
    >
      {/* Subtle gold glow accent — decorative, pointer-events-none */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 90% 10%, rgba(212,175,55,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 p-6 md:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
        {/* ── Left: Identity + copy ── */}
        <div className="flex-1 min-w-0">
          {/* Gold badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-[12px] rounded-full mb-4">
            <Sparkles size={12} fill="currentColor" />
            <span>ข้อสอบตัวอย่างฟรี</span>
          </div>

          {/* Title — dynamic position name, free-exam fallback without it */}
          <h2 className="text-[#F5E9D6] text-[20px] md:text-[22px] font-bold font-display leading-snug mb-2">
            {buildFreeExamHeading(positionName)}
          </h2>

          {/* Supporting copy */}
          <p className="text-[#A1866B] text-[14px] leading-relaxed mb-4 max-w-xl">
            ทดลองทำข้อสอบจากแพ็กเกจนี้ฟรีก่อนตัดสินใจ
          </p>

          {/* Metadata chips — only shown when values are meaningful (>0) */}
          {(hasDuration || hasQuestionCount) && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {hasDuration && (
                <span className="inline-flex items-center gap-1.5 text-[#A1866B] text-[13px]">
                  <Clock size={13} className="text-[#D4AF37]/70" />
                  {sampleExam.duration_minutes} นาที
                </span>
              )}
              {hasQuestionCount && (
                <span className="inline-flex items-center gap-1.5 text-[#A1866B] text-[13px]">
                  <FileText size={13} className="text-[#D4AF37]/70" />
                  {sampleExam.qCount} ข้อ
                </span>
              )}
            </div>
          )}

          {/* Exam name — secondary context, muted */}
          {sampleExam.name && (
            <p className="text-[#A1866B] text-[12px] truncate max-w-sm">
              {sampleExam.name}
            </p>
          )}
        </div>

        {/* ── Right: CTA ── */}
        <div className="flex-shrink-0 flex flex-col items-stretch lg:items-end gap-2 min-w-[220px]">
          <Link
            href={ctaHref}
            id="package-sample-exam-cta"
            className="inline-flex items-center justify-center gap-2 w-full lg:w-auto px-6 py-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold text-[15px] transition-all duration-200 hover:scale-[1.02] shadow-[0_8px_20px_rgba(212,175,55,0.15)] min-h-[48px]"
          >
            {isAuthenticated ? (
              <>
                <PlayCircle size={18} />
                เริ่มทำข้อสอบตัวอย่าง
              </>
            ) : (
              <>
                <LogIn size={18} />
                เริ่มทำข้อสอบตัวอย่าง
              </>
            )}
          </Link>

          {/* Reassurance note */}
          <p className="text-[#A1866B] text-[11px] text-center lg:text-right leading-snug">
            {isAuthenticated
              ? 'เริ่มทำได้ทันที • ไม่มีค่าใช้จ่าย'
              : 'เข้าสู่ระบบเพื่อเริ่มทำ • ไม่ต้องซื้อแพ็กเกจก่อน'}
          </p>

          {/* Share Free Exam — ghost/text beneath the primary CTA, centered
              on desktop (lg:self-center overrides the column's items-end so
              the button sits centered under the gold CTA) and full-width on
              mobile. Deliberately quiet: no fill, gold text only, so the
              primary gold CTA stays visually dominant. 44px touch target. */}
          <button
            type="button"
            onClick={handleShare}
            aria-live="polite"
            className="inline-flex items-center justify-center gap-1.5 w-full lg:w-auto lg:self-center px-4 min-h-[44px] rounded-lg bg-transparent text-[#D4AF37] hover:text-[#F1D17A] hover:bg-[#D4AF37]/10 text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A140E]"
          >
            {shareFeedback === 'copied' ? <Check size={15} /> : <Share2 size={15} />}
            <span>
              {shareFeedback === 'copied'
                ? 'คัดลอกลิงก์แล้ว'
                : shareFeedback === 'failed'
                  ? 'คัดลอกไม่สำเร็จ'
                  : 'แชร์ข้อสอบฟรีให้เพื่อน'}
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}
