import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Clock,
  Check,
  CheckCircle,
  AlertCircle,
  Bookmark,
  FileText,
  RotateCcw,
  ShieldCheck,
  Zap,
  Flag,
  ChevronRight,
  HelpCircle,
  Compass,
} from 'lucide-react'
import { createPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import {
  HELP_SECTIONS,
  GETTING_STARTED_STEPS,
  EXAM_MODES,
  DURING_EXAM_TOOLS,
  RESULTS_FEATURES,
  REVIEW_FEATURES,
  MY_EXAMS_FEATURES,
} from '@/content/help/help-data'
import HelpScreenshot from './HelpScreenshot'

export const metadata: Metadata = createPageMetadata({
  title: 'วิธีใช้งาน Sobdai | คู่มือฝึกทำแนวข้อสอบราชการออนไลน์',
  description:
    'เรียนรู้วิธีใช้ Sobdai ตั้งแต่เลือกชุดข้อสอบ ฝึกทำและจำลองสอบ ดูผล ทบทวนข้อที่ตอบผิด บันทึกข้อที่สนใจ และดูหัวข้อที่ควรฝึกเพิ่มเติม',
  path: '/help',
})

export default function HelpPage() {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'วิธีใช้งาน', path: '/help' },
  ])

  return (
    <>
      <StructuredData data={breadcrumbJsonLd} />

      <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6]">
        {/* Top Hero Section */}
        <header className="relative border-b border-[rgba(212,175,55,0.12)] bg-[#140E0A] py-14 md:py-20 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none">
            <div className="absolute -top-24 left-1/4 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl" />
            <div className="absolute top-1/2 right-10 w-80 h-80 bg-[#D4AF37]/3 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A140E] border border-[#D4AF37]/25 text-[#D4AF37] text-xs font-semibold uppercase tracking-wider mb-6">
                <Compass size={14} className="text-[#D4AF37]" />
                ศูนย์ช่วยเหลือ
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-[#F5E9D6] tracking-tight leading-[1.2] mb-5">
                วิธีใช้งาน Sobdai
              </h1>

              <p className="text-[#A1866B] text-base md:text-lg leading-relaxed mb-8">
                เรียนรู้ตั้งแต่การเลือกชุดข้อสอบ ฝึกทำข้อสอบ ดูผล วิเคราะห์หัวข้อที่ควรทบทวน
                ไปจนถึงการกลับมาฝึกเพื่อเตรียมสอบอย่างเป็นระบบ
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/packages"
                  className="btn-primary inline-flex items-center justify-center gap-2"
                >
                  <span>เลือกชุดข้อสอบ</span>
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/faq"
                  className="btn-outline inline-flex items-center justify-center gap-2"
                >
                  <HelpCircle size={16} />
                  <span>คำถามที่พบบ่อย</span>
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Layout */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          {/* Mobile Jump Navigation (Compact, Left-aligned, No horizontal overflow) */}
          <nav
            aria-label="เมนูนำทางด่วนบนมือถือ"
            className="block lg:hidden mb-10 p-5 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.15)] shadow-md"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-[#A1866B] mb-3">
              หัวข้อคู่มือการใช้งาน
            </div>
            <div className="flex flex-col gap-2">
              {HELP_SECTIONS.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="flex items-center justify-between text-sm text-[#F5E9D6] hover:text-[#D4AF37] py-2 px-3 rounded-lg hover:bg-[rgba(212,175,55,0.05)] border border-transparent hover:border-[#D4AF37]/20 transition-colors"
                >
                  <span className="font-medium text-left">{sec.title}</span>
                  <ChevronRight size={14} className="text-[#A1866B] shrink-0 ml-2" />
                </a>
              ))}
            </div>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left Content Column (Main Guide Content) */}
            <main className="lg:col-span-8 space-y-16">
              {/* ---------------------------------------------------- */}
              {/* SECTION 1: #getting-started */}
              {/* ---------------------------------------------------- */}
              <section id="getting-started" className="scroll-mt-28 space-y-6">
                <div className="border-b border-[rgba(255,255,255,0.06)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    ขั้นตอนการใช้งาน
                  </span>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mt-1">
                    1. เริ่มต้นใช้งาน Sobdai
                  </h2>
                  <p className="text-[#A1866B] text-sm md:text-base mt-2">
                    4 ขั้นตอนง่ายๆ ในการเริ่มเตรียมสอบราชการกับ Sobdai ตั้งแต่การสำรวจคลังข้อสอบไปจนถึงการเริ่มฝึกทำ
                  </p>
                </div>

                <div className="space-y-4">
                  {GETTING_STARTED_STEPS.map((step) => (
                    <div
                      key={step.number}
                      className="p-5 md:p-6 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.15)] transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] font-display font-bold text-base flex items-center justify-center shrink-0">
                          {step.number}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-[#F5E9D6] mb-2 font-display">
                            {step.title}
                          </h3>
                          <p className="text-sm text-[#A1866B] leading-relaxed">
                            {step.description}
                          </p>
                          {step.actionLabel && step.actionHref && (
                            <div className="mt-4">
                              <Link
                                href={step.actionHref}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F1D17A] transition-colors"
                              >
                                <span>{step.actionLabel}</span>
                                <ArrowRight size={13} />
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Primary Visual: Packages catalog */}
                <HelpScreenshot
                  src="/images/help/help-packages.webp"
                  alt="หน้าคลังแพ็กเกจข้อสอบ Sobdai สำหรับเลือกชุดข้อสอบที่ต้องการ"
                  width={1440}
                  height={1080}
                  caption="หน้าคลังแพ็กเกจสำหรับค้นหาและเลือกชุดข้อสอบที่ตรงกับสายงานที่ต้องการ"
                  annotation={{
                    text: 'เลือกชุดที่ตรงกับการสอบของคุณ',
                    labelPosition: { top: '56%', left: '8%' },
                    arrow: { direction: 'down-right', top: '61.5%', left: '16%' },
                  }}
                />

                {/* Supporting Visual: Package detail safe crop */}
                <div className="p-5 md:p-6 rounded-2xl bg-[#140E0A] border border-[rgba(212,175,55,0.18)] space-y-4 shadow-lg">
                  <div>
                    <h3 className="text-base font-bold text-[#F5E9D6] font-display">
                      สำรวจเนื้อหาและชุดข้อสอบภายในแพ็กเกจ
                    </h3>
                    <p className="text-xs text-[#A1866B] mt-1">
                      สามารถเปิดดูโครงสร้างชุดข้อสอบและสรุปเนื้อหาที่ครอบคลุมได้ตั้งแต่ก่อนเข้าสู่ระบบ
                    </p>
                  </div>

                  <HelpScreenshot
                    src="/images/help/help-package-detail.webp"
                    alt="หน้ารายละเอียดแพ็กเกจ แสดงสรุปเนื้อหาและชุดข้อสอบที่มีในแพ็กเกจ"
                    width={1440}
                    height={1012}
                    caption="หน้ารายละเอียดแพ็กเกจแสดงสรุปเนื้อหาและโครงสร้างชุดข้อสอบให้ตรวจสอบได้ก่อนเข้าสู่ระบบ"
                    annotation={{
                      text: 'ดูว่าแพ็กเกจนี้มีอะไรบ้าง',
                      labelPosition: { top: '6%', left: '8%' },
                      arrow: { direction: 'down-right', top: '11%', left: '16%' },
                    }}
                  />
                </div>

                {/* Important Authoritative Rule Callout */}
                <div className="p-5 rounded-2xl bg-[#0F0B07] border border-[#D4AF37]/30 flex items-start gap-4 shadow-sm">
                  <ShieldCheck size={20} className="text-[#D4AF37] shrink-0 mt-0.5" />
                  <div className="text-sm space-y-1">
                    <div className="font-bold text-[#F5E9D6]">
                      ข้อควรรู้เกี่ยวกับสิทธิ์การเข้าถึงเนื้อหา
                    </div>
                    <p className="text-[#A1866B] text-xs leading-relaxed">
                      ผู้ใช้งานทั่วไปสามารถดูรายละเอียดแพ็กเกจ โครงสร้างชุดข้อสอบ และหัวข้อสรุปเนื้อหาได้ก่อนเข้าสู่ระบบ
                      แต่เมื่อต้องการเปิดอ่านเนื้อหาหรือเริ่มทำข้อสอบ ต้องเข้าสู่ระบบบัญชีผู้ใช้ก่อนทุกครั้ง
                      (ชุดข้อสอบตัวอย่างเปิดให้ผู้ใช้ที่เข้าสู่ระบบแล้วทดลองทำได้โดยไม่ต้องสั่งซื้อแพ็กเกจ)
                    </p>
                  </div>
                </div>
              </section>

              {/* ---------------------------------------------------- */}
              {/* SECTION 2: #exam-modes */}
              {/* ---------------------------------------------------- */}
              <section id="exam-modes" className="scroll-mt-28 space-y-6">
                <div className="border-b border-[rgba(255,255,255,0.06)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    รูปแบบการทำข้อสอบ
                  </span>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mt-1">
                    2. เลือกวิธีฝึกที่เหมาะกับคุณ
                  </h2>
                  <p className="text-[#A1866B] text-sm md:text-base mt-2">
                    Sobdai ออกแบบระบบการสอบออกเป็น 2 รูปแบบ เพื่อตอบโจทย์ทั้งการเรียนรู้เนื้อหาและการประเมินความพร้อม
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {EXAM_MODES.map((mode) => {
                    const isPractice = mode.id === 'practice'
                    return (
                      <div
                        key={mode.id}
                        className={`p-6 rounded-2xl bg-[#1A140E] border ${
                          isPractice
                            ? 'border-orange-500/30'
                            : 'border-blue-500/30'
                        } flex flex-col justify-between shadow-lg`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-4">
                            <span
                              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                                isPractice
                                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              }`}
                            >
                              {mode.badge}
                            </span>
                            <span className="text-xs text-[#A1866B] font-mono">
                              {mode.englishName}
                            </span>
                          </div>

                          <h3 className="text-xl font-bold font-display text-[#F5E9D6] mb-2">
                            {mode.name}
                          </h3>

                          <p className="text-xs text-[#A1866B] leading-relaxed mb-6">
                            {mode.summary}
                          </p>

                          <div className="space-y-3 pt-4 border-t border-[rgba(255,255,255,0.05)]">
                            {mode.features.map((feat, i) => (
                              <div key={i} className="flex items-start gap-2.5">
                                <Check
                                  size={15}
                                  className={`shrink-0 mt-0.5 ${
                                    isPractice ? 'text-orange-400' : 'text-blue-400'
                                  }`}
                                />
                                <div className="text-xs text-[#A1866B]">
                                  <strong className="text-[#F5E9D6] font-semibold block mb-0.5">
                                    {feat.title}
                                  </strong>
                                  {feat.description}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Mode Screenshot */}
                          <div className="mt-6 pt-4 border-t border-[rgba(255,255,255,0.06)]">
                            {isPractice ? (
                              <HelpScreenshot
                                src="/images/help/help-practice.webp"
                                alt="โหมดฝึกทำ แสดงผลคำตอบและข้อมูลสำหรับทบทวนหลังตอบคำถาม"
                                width={640}
                                height={1024}
                                caption="ตอบแล้วแสดงผลคำตอบทันทีพร้อมข้อมูลสำหรับทบทวน"
                                annotation={{
                                  text: 'ตอบแล้วดูข้อมูลสำหรับทบทวนได้ตรงนี้',
                                  labelPosition: { top: '50%', left: '8%' },
                                  arrow: { direction: 'down', top: '54%', left: '22%' },
                                }}
                              />
                            ) : (
                              <HelpScreenshot
                                src="/images/help/help-simulation.webp"
                                alt="โหมดจำลองสอบ แสดงตัวจับเวลาและหน้าทำข้อสอบ"
                                width={1024}
                                height={823}
                                caption="โหมดจำลองสอบมีตัวจับเวลาและทำต่อเนื่องจนครบ"
                                annotation={{
                                  text: 'โหมดจำลองสอบมีตัวจับเวลา',
                                  labelPosition: { top: '12%', right: '10%' },
                                  arrow: { direction: 'up-right', top: '7%', right: '15%' },
                                  circleTarget: {
                                    top: '3.2%',
                                    right: '13.2%',
                                    width: '12.5%',
                                    height: '6.8%',
                                  },
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="p-4 rounded-xl bg-[#1A140E] border border-[rgba(255,255,255,0.06)] text-xs text-[#A1866B] leading-relaxed">
                  <span className="text-[#F5E9D6] font-semibold">หมายเหตุเกี่ยวกับเฉลย:</span>{' '}
                  คำอธิบายเฉลยและข้อมูลกฎหมายอ้างอิงจะแสดงเมื่อข้อสอบข้อนั้นมีข้อมูลเฉลยบันทึกในระบบ
                </div>

                <div className="pt-1">
                  <Link
                    href="/packages"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F1D17A] transition-colors"
                  >
                    <span>เลือกดูแพ็กเกจข้อสอบเพื่อเริ่มฝึกทำ</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </section>

              {/* ---------------------------------------------------- */}
              {/* SECTION 3: #during-exam */}
              {/* ---------------------------------------------------- */}
              <section id="during-exam" className="scroll-mt-28 space-y-6">
                <div className="border-b border-[rgba(255,255,255,0.06)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    ระบบช่วยเหลือ
                  </span>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mt-1">
                    3. เครื่องมือระหว่างทำข้อสอบ
                  </h2>
                  <p className="text-[#A1866B] text-sm md:text-base mt-2">
                    ฟังก์ชันที่ช่วยให้การทำข้อสอบเป็นไปอย่างราบรื่น ไม่ติดขัด และป้องกันการสูญหายของคำตอบ
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DURING_EXAM_TOOLS.map((tool, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.12)] flex flex-col"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Zap size={16} className="text-[#D4AF37]" />
                        <h3 className="text-sm font-bold text-[#F5E9D6] font-display">
                          {tool.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#A1866B] leading-relaxed mt-auto">
                        {tool.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ---------------------------------------------------- */}
              {/* SECTION 4: #results */}
              {/* ---------------------------------------------------- */}
              <section id="results" className="scroll-mt-28 space-y-6">
                <div className="border-b border-[rgba(255,255,255,0.06)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    สรุปผลคะแนน
                  </span>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mt-1">
                    4. ดูผลและทบทวนหลังส่งข้อสอบ
                  </h2>
                  <p className="text-[#A1866B] text-sm md:text-base mt-2">
                    หลังกดยืนยันส่งข้อสอบ ระบบจะประมวลผลคะแนนและเปิดหน้ารายงานผลสอบทันที
                  </p>
                </div>

                <div className="space-y-4">
                  {RESULTS_FEATURES.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.12)] flex items-start gap-3.5"
                    >
                      <CheckCircle size={18} className="text-green-500 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-[#F5E9D6] font-display mb-1">
                          {item.title}
                        </h3>
                        <p className="text-xs text-[#A1866B] leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dominant Result Visual */}
                <HelpScreenshot
                  src="/images/help/help-result.webp"
                  alt="หน้าผลการทำข้อสอบ แสดงคะแนน จำนวนข้อถูกผิด เวลา และหัวข้อที่ควรทบทวน"
                  width={785}
                  height={1024}
                  caption="หน้ารายงานผลการสอบ แสดงสัดส่วนคะแนน เวลาที่ใช้ พร้อมสรุปหัวข้อที่ควรกลับไปทบทวน"
                  annotation={{
                    text: 'ดูผลและจุดที่ควรกลับไปทบทวน',
                    labelPosition: { top: '53%', left: '8%' },
                    arrow: { direction: 'down', top: '57%', left: '22%' },
                  }}
                />

                <div className="p-4 rounded-xl bg-[#0F0B07] border border-[rgba(212,175,55,0.2)] text-xs text-[#A1866B] leading-relaxed">
                  <span className="text-[#F5E9D6] font-semibold">การเลือกดูข้อสอบ:</span>{' '}
                  สามารถเลือกทบทวนข้อที่ตอบผิดหรือไม่ได้ตอบ หรือเลือกดูทุกข้อของการทำข้อสอบครั้งนั้นได้
                  โดยคำอธิบายและข้อมูลอ้างอิงจะแสดงตามความพร้อมของข้อมูลในระบบ
                </div>

                <div className="pt-1">
                  <Link
                    href="/exams"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F1D17A] transition-colors"
                  >
                    <span>ตรวจสอบผลการทำข้อสอบย้อนหลังในหน้าข้อสอบของฉัน</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </section>

              {/* ---------------------------------------------------- */}
              {/* SECTION 5: #review */}
              {/* ---------------------------------------------------- */}
              <section id="review" className="scroll-mt-28 space-y-6">
                <div className="border-b border-[rgba(255,255,255,0.06)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    พัฒนาจุดอ่อน
                  </span>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mt-1">
                    5. กลับมาทบทวนสิ่งที่ควรพัฒนา
                  </h2>
                  <p className="text-[#A1866B] text-sm md:text-base mt-2">
                    ต่อยอดจากการทำข้อสอบด้วยระบบบันทึกข้อสอบและสรุปหัวข้อที่ควรเน้นย้ำ
                  </p>
                </div>

                <div className="space-y-4">
                  {REVIEW_FEATURES.map((feat, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.12)] space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <RotateCcw size={16} className="text-[#D4AF37]" />
                        <h3 className="text-sm font-bold text-[#F5E9D6] font-display">
                          {feat.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#A1866B] leading-relaxed">
                        {feat.description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-[#1A140E] border border-[rgba(255,255,255,0.06)] text-xs text-[#A1866B] leading-relaxed">
                  <span className="text-[#D4AF37] font-semibold">ข้อชี้แจงเกี่ยวกับการทำซ้ำ:</span>{' '}
                  ระบบใช้ผลจากการทำข้อสอบที่ผ่านมาเพื่อช่วยสรุปหัวข้อที่ควรกลับไปให้ความสำคัญเพิ่มเติม
                  หากต้องการฝึกทำซ้ำ ผู้เรียนสามารถกด &ldquo;ทำชุดนี้อีกครั้ง&rdquo; เพื่อเริ่มทำชุดข้อสอบเดิมใหม่ทั้งชุด
                  เพื่อวัดความเข้าใจอย่างครอบคลุม
                </div>

                <div className="pt-1">
                  <Link
                    href="/faq#results-and-review"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F1D17A] transition-colors"
                  >
                    <span>ดูคำถามที่พบบ่อยเกี่ยวกับการทบทวนและทำข้อสอบ</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </section>

              {/* ---------------------------------------------------- */}
              {/* SECTION 6: #my-exams */}
              {/* ---------------------------------------------------- */}
              <section id="my-exams" className="scroll-mt-28 space-y-6">
                <div className="border-b border-[rgba(255,255,255,0.06)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    ศูนย์การเรียนรู้
                  </span>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mt-1">
                    6. ติดตามการฝึกจากข้อสอบของฉัน
                  </h2>
                  <p className="text-[#A1866B] text-sm md:text-base mt-2">
                    เข้าสู่พื้นที่การเรียนรู้ส่วนตัวผ่านเมนู &ldquo;ข้อสอบของฉัน&rdquo; ที่เส้นทาง{' '}
                    <code className="text-[#D4AF37] bg-[#0F0B07] px-2 py-0.5 rounded border border-[#D4AF37]/20 text-xs">
                      /exams
                    </code>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {MY_EXAMS_FEATURES.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.12)] flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={16} className="text-[#D4AF37]" />
                        <h3 className="text-sm font-bold text-[#F5E9D6] font-display">
                          {item.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#A1866B] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Dominant /exams visual */}
                <HelpScreenshot
                  src="/images/help/help-my-exams.webp"
                  alt="หน้าข้อสอบของฉัน แสดงรายการทำต่อและผลการทำข้อสอบล่าสุด"
                  width={1024}
                  height={923}
                  caption="หน้าข้อสอบของฉัน (/exams) สำหรับติดตามความคืบหน้า กลับไปทำต่อ และดูผลสอบล่าสุด"
                  annotation={{
                    text: 'กลับมาทำต่อและดูผลล่าสุดได้ที่นี่',
                    labelPosition: { top: '8%', left: '6%' },
                    arrow: { direction: 'down', top: '12.5%', left: '18%' },
                  }}
                />

                <div className="pt-2">
                  <Link
                    href="/exams"
                    className="btn-outline inline-flex items-center gap-2 text-xs font-bold"
                  >
                    <span>ไปยังหน้าข้อสอบของฉัน</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </section>
            </main>

            {/* Right Sticky Column: Table of Contents (Desktop only) */}
            <aside className="hidden lg:block lg:col-span-4 sticky top-24">
              <div className="p-6 rounded-2xl bg-[#1A140E] border border-[rgba(212,175,55,0.18)] shadow-xl space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37] border-b border-[rgba(255,255,255,0.06)] pb-3">
                  <Compass size={14} className="text-[#D4AF37]" />
                  <span>สารบัญคู่มือการใช้งาน</span>
                </div>

                <nav aria-label="สารบัญหน้าวิธีใช้งาน" className="space-y-1">
                  {HELP_SECTIONS.map((sec) => (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      className="group flex items-start gap-2.5 py-2 px-2.5 rounded-xl text-xs text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(212,175,55,0.06)] transition-all"
                    >
                      <ChevronRight
                        size={13}
                        className="text-[#D4AF37] mt-0.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity"
                      />
                      <span className="leading-snug">{sec.title}</span>
                    </a>
                  ))}
                </nav>

                <div className="pt-4 border-t border-[rgba(255,255,255,0.06)] text-xs text-[#A1866B] space-y-3">
                  <p className="leading-relaxed">
                    มีคำถามเกี่ยวกับการสมัคร การชำระเงิน หรือแพ็กเกจหรือไม่?
                  </p>
                  <Link
                    href="/faq"
                    className="inline-flex items-center gap-1.5 text-[#D4AF37] hover:text-[#F1D17A] font-bold transition-colors"
                  >
                    <HelpCircle size={13} />
                    <span>อ่านคำถามที่พบบ่อย (FAQ)</span>
                  </Link>
                </div>
              </div>
            </aside>
          </div>

          {/* Bottom CTA Section */}
          <section className="mt-20 p-8 md:p-12 rounded-3xl bg-[#140E0A] border border-[rgba(212,175,55,0.2)] text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-2xl mx-auto space-y-4">
              <span className="inline-block px-3 py-1 rounded-full bg-[#1A140E] border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold uppercase tracking-wider">
                ยังมีข้อสงสัย?
              </span>

              <h2 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6]">
                ดูคำถามที่พบบ่อยเกี่ยวกับ Sobdai
              </h2>

              <p className="text-[#A1866B] text-sm md:text-base leading-relaxed">
                รวมคำตอบเกี่ยวกับการใช้งาน การทำข้อสอบ การทบทวน แพ็กเกจ และสิทธิ์การเข้าถึงเนื้อหา
              </p>

              <div className="pt-4">
                <Link
                  href="/faq"
                  className="btn-primary inline-flex items-center justify-center gap-2"
                >
                  <span>ไปยังหน้าคำถามที่พบบ่อย</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
