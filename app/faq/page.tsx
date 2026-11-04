import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, ChevronDown, HelpCircle } from 'lucide-react'
import { createPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import {
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  buildFaqPageJsonLd,
} from '@/content/faq/faq-data'

export const metadata: Metadata = createPageMetadata({
  title: 'คำถามที่พบบ่อยเกี่ยวกับ Sobdai | FAQ',
  description:
    'รวมคำตอบเกี่ยวกับการใช้งาน Sobdai การเข้าสู่ระบบ การทำข้อสอบ ผลการทำข้อสอบ การทบทวน แพ็กเกจ และสิทธิ์การเข้าถึง',
  path: '/faq',
})

export default function FaqPage() {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'คำถามที่พบบ่อย', path: '/faq' },
  ])

  const faqPageJsonLd = buildFaqPageJsonLd(FAQ_ITEMS)

  return (
    <>
      <StructuredData data={breadcrumbJsonLd} />
      <StructuredData data={faqPageJsonLd} />

      <div className="min-h-screen bg-background text-foreground">
        {/* Top Hero Section */}
        <header className="relative border-b border-border-subtle bg-surface-raised py-14 md:py-20 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none">
            <div className="absolute -top-24 left-1/4 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl" />
            <div className="absolute top-1/2 right-10 w-80 h-80 bg-[#D4AF37]/3 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wash border border-brand/30 text-brand text-xs font-semibold uppercase tracking-wider mb-6">
              <HelpCircle size={14} className="text-brand" />
              FAQ
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-[1.2] mb-5">
              คำถามที่พบบ่อย
            </h1>

            <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
              คำตอบเกี่ยวกับการใช้งาน Sobdai การทำข้อสอบ ผลการทำข้อสอบ แพ็กเกจ และบัญชีผู้ใช้
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/help"
                className="btn-outline inline-flex items-center justify-center gap-2 text-sm"
              >
                <BookOpen size={16} />
                <span>คู่มือวิธีใช้งาน</span>
              </Link>
              <Link
                href="/packages"
                className="btn-primary inline-flex items-center justify-center gap-2 text-sm"
              >
                <span>เลือกชุดข้อสอบ</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content Layout */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
          {/* Quick Anchor Navigation (Visual Category Chips) */}
          <nav aria-label="หมวดหมู่คำถาม" className="flex flex-wrap gap-2 mb-10">
            {FAQ_CATEGORIES.map((cat) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium border border-border-subtle bg-surface-raised text-muted-foreground hover:text-brand hover:border-brand/40 hover:bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {cat.title}
              </a>
            ))}
          </nav>

          {/* Grouped Accordion List */}
          <div className="space-y-12">
            {FAQ_CATEGORIES.map((category) => {
              const items = FAQ_ITEMS.filter((item) => item.category === category.id)
              if (items.length === 0) return null

              return (
                <section key={category.id} id={category.id} className="scroll-mt-20">
                  <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border-subtle">
                    <h2 className="text-lg sm:text-xl font-display font-semibold text-brand tracking-wide">
                      {category.title}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted text-muted-foreground border border-border-subtle font-mono">
                      {items.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {items.map((item) => (
                      <details
                        key={item.id}
                        id={item.id}
                        className="group border border-border-subtle rounded-xl bg-surface-raised hover:border-brand/40 transition-colors open:border-brand/40 open:bg-surface-muted"
                      >
                        <summary className="flex items-center justify-between gap-3 p-4 sm:p-5 cursor-pointer list-none select-none text-left font-display font-medium text-sm sm:text-base text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-xl transition-colors [&::-webkit-details-marker]:hidden">
                          <span className="leading-snug">{item.question}</span>
                          <ChevronDown
                            size={18}
                            className="text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180 group-open:text-brand"
                            aria-hidden="true"
                          />
                        </summary>
                        <div className="px-4 sm:px-5 pb-5 pt-1 text-muted-foreground text-sm sm:text-[15px] leading-relaxed space-y-3 border-t border-border-subtle">
                          {item.paragraphs.map((paragraph, idx) => (
                            <p key={idx}>{paragraph}</p>
                          ))}
                          {item.link && (
                            <div className="pt-1">
                              <Link
                                href={item.link.href}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover underline underline-offset-4 decoration-brand/30 hover:decoration-brand transition-colors"
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
                </section>
              )
            })}
          </div>

          {/* Bottom Prompt / Link to Help */}
          <div className="mt-16 p-6 sm:p-8 rounded-2xl bg-surface-raised border border-border-subtle text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-display font-semibold text-foreground mb-1">
                ต้องการดูคู่มือการใช้งานแบบละเอียด?
              </h3>
              <p className="text-sm text-muted-foreground">
                เรียนรู้ขั้นตอนการเริ่มใช้งาน โหมดฝึกทำ vs จำลองสอบ และเครื่องมือต่างๆ
              </p>
            </div>
            <Link
              href="/help"
              className="btn-primary inline-flex items-center justify-center gap-2 text-sm shrink-0 whitespace-nowrap"
            >
              <span>อ่านคู่มือวิธีใช้งาน</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}
