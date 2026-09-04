import React from 'react'
import Link from 'next/link'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { getHomepageFaqPreviewItems } from '@/content/faq/faq-data'

export default function HomeFaqPreview() {
  const faqItems = getHomepageFaqPreviewItems()

  return (
    <section
      id="faq-preview"
      aria-labelledby="faq-preview-heading"
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: 'clamp(32px, 5vw, 56px) 20px clamp(28px, 4vw, 44px)',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: 'clamp(24px, 4vw, 36px)' }}>
        <div style={{ marginBottom: '10px' }}>
          <span
            className="badge badge-gold"
            style={{ fontSize: '11.5px', padding: '3px 12px', fontWeight: 600 }}
          >
            คำถามที่พบบ่อย
          </span>
        </div>
        <h2
          id="faq-preview-heading"
          className="font-display"
          style={{
            fontSize: 'clamp(22px, 3.5vw, 32px)',
            marginBottom: '10px',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          มีคำถามก่อนเริ่มใช้งาน?
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '15px',
            maxWidth: '560px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          รวมข้อสงสัยเบื้องต้นเกี่ยวกับการฝึกทำข้อสอบ บัญชีผู้ใช้ และการใช้งานระบบ เพื่อช่วยให้คุณเริ่มเตรียมตัวได้อย่างมั่นใจ
        </p>
      </div>

      {/* Accordion List */}
      <div className="space-y-3" style={{ marginBottom: 'clamp(24px, 3.5vw, 32px)' }}>
        {faqItems.map((item) => (
          <details
            key={item.id}
            id={`home-faq-${item.id}`}
            className="group border border-[rgba(212,175,55,0.12)] rounded-xl bg-[#140E0A] hover:border-[rgba(212,175,55,0.25)] transition-colors open:border-[rgba(212,175,55,0.3)] open:bg-[#16100B]"
          >
            <summary className="flex items-center justify-between gap-3 p-4 sm:p-5 cursor-pointer list-none select-none text-left font-display font-medium text-sm sm:text-base text-[#F5E9D6] hover:text-[#D4AF37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50 rounded-xl transition-colors min-h-[48px] [&::-webkit-details-marker]:hidden">
              <span className="leading-snug">{item.question}</span>
              <ChevronDown
                size={18}
                className="text-[#A1866B] shrink-0 transition-transform duration-200 group-open:rotate-180 group-open:text-[#D4AF37]"
                aria-hidden="true"
              />
            </summary>
            <div className="px-4 sm:px-5 pb-5 pt-1 text-[#C4A482] text-sm sm:text-[15px] leading-relaxed space-y-3 border-t border-[rgba(212,175,55,0.06)]">
              {item.paragraphs.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
              {item.link && (
                <div className="pt-1">
                  <Link
                    href={item.link.href}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#D4AF37] hover:text-[#F1D17A] underline underline-offset-4 decoration-[#D4AF37]/30 hover:decoration-[#D4AF37] transition-colors"
                  >
                    <span>{item.link.text}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      {/* Bottom CTA to Full FAQ */}
      <div style={{ textAlign: 'center' }}>
        <Link
          href="/faq"
          className="btn-outline inline-flex items-center justify-center gap-2 text-sm"
          style={{
            padding: '11px 26px',
            fontSize: '14.5px',
            fontWeight: 600,
          }}
        >
          <span>ดูคำถามทั้งหมด</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
