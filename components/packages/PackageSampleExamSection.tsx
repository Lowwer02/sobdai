'use client'

import Link from 'next/link'
import { Sparkles, Clock, FileText, PlayCircle, LogIn } from 'lucide-react'

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
}

export default function PackageSampleExamSection({
  sampleExam,
  packageSlug,
  isAuthenticated,
}: PackageSampleExamSectionProps) {
  const examHref = `/package/${packageSlug}/exam/${sampleExam.id}`
  const loginHref = `/login?redirect=${encodeURIComponent(examHref)}`
  const ctaHref = isAuthenticated ? examHref : loginHref

  const hasDuration = sampleExam.duration_minutes > 0
  const hasQuestionCount = (sampleExam.qCount ?? 0) > 0

  return (
    <section
      aria-label="ข้อสอบตัวอย่าง"
      className="relative bg-[#1A140E] border border-[#D4AF37]/30 rounded-[24px] shadow-[0_0_40px_rgba(212,175,55,0.06)] overflow-hidden"
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

          {/* Title */}
          <h2 className="text-[#F5E9D6] text-[20px] md:text-[22px] font-bold font-display leading-snug mb-2">
            ลองทำข้อสอบตัวอย่างก่อนตัดสินใจ
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
        </div>
      </div>
    </section>
  )
}
