'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Image from 'next/image'
import { Check, ChevronLeft, PlayCircle, Lock, BookOpen, Star, Sparkles, Clock, FileText, CalendarDays, TrendingUp, Edit3, MonitorSmartphone, Newspaper } from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { beginCheckout, viewPackage } from '@/lib/analytics'
import SummaryNavigation from '@/components/SummaryNavigation'
import ExamNavigation from '@/components/ExamNavigation'
import SupportCard from '@/components/SupportCard'
import type { SupportConfig } from '@/lib/homepageConfig'
import type { RelatedNewsItem, RelatedArticleItem } from '@/lib/package-related-content'
import { buildPackageH1, formatThaiDisplayYear } from '@/lib/seo'
import ContentCard from '@/components/ContentCard'
import WrittenExamNavigation from '@/components/WrittenExamNavigation'
import type { WrittenExamDiscovery } from '@/lib/writtenExamLearner'
import PackageSampleExamSection from '@/components/packages/PackageSampleExamSection'
import { resolvePackageAccessTerm } from '@/lib/package-access-term'

type CanonicalPositionLink = {
  slug: string
  name: string
}

function GoldBadge({ children, icon, className = '' }: { children: React.ReactNode, icon?: React.ReactNode, className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-background border border-brand-solid/30 text-brand text-[12px] rounded-full ${className}`}>
      {icon}
      {children}
    </div>
  )
}

function PackagePurchaseAction({
  pkg,
  isPurchased,
  visualPreview,
  variant,
  anchorRef,
}: {
  pkg: any
  isPurchased: boolean
  visualPreview: boolean
  variant: 'inline' | 'sticky'
  anchorRef?: React.Ref<HTMLAnchorElement>
}) {
  const currentPrice = typeof pkg.current_price === 'number' && Number.isFinite(pkg.current_price)
    ? pkg.current_price
    : 0
  const isFree = currentPrice === 0
  const label = isPurchased ? 'เริ่มเรียน' : isFree ? 'รับแพ็กเกจฟรี' : 'ซื้อแพ็กเกจนี้'
  const href = isPurchased ? '#resources' : `/checkout/${pkg.id}`
  const tone = isPurchased
    ? 'bg-success hover:bg-[#1EA950] text-white shadow-[0_10px_20px_rgba(34,197,94,0.15)]'
    : isFree
      ? 'bg-success hover:bg-[#1EA950] text-white shadow-[0_10px_20px_rgba(34,197,94,0.15)]'
      : 'bg-brand-solid hover:bg-[#F1D17A] text-brand-foreground shadow-[0_10px_20px_rgba(212,175,55,0.15)]'
  const size = variant === 'inline'
    ? 'w-full min-h-12 py-3 lg:py-4 rounded-xl text-[14px] lg:text-[16px]'
    : 'min-h-11 px-3 sm:px-4 rounded-lg text-[12px] sm:text-[13px] whitespace-nowrap'

  return (
    <Link
      ref={anchorRef}
      href={href}
      onClick={(event) => {
        if (visualPreview) {
          event.preventDefault()
          return
        }
        if (!isPurchased) beginCheckout(pkg.id, pkg.name, currentPrice)
      }}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.99] ${tone} ${size} ${variant === 'inline' ? 'transform hover:scale-[1.02]' : ''}`}
    >
      {isPurchased ? <PlayCircle size={18} /> : isFree ? <BookOpen size={18} /> : <Lock size={18} />}
      <span>{label}</span>
    </Link>
  )
}

function MiniStatCard({ icon, title, value, subtitle }: { icon: React.ReactNode, title: string, value: string | React.ReactNode, subtitle: string }) {
  return (
    <div className="bg-background border border-border-subtle rounded-2xl p-4 flex flex-col h-full hover:border-brand-solid/30 transition-colors group">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-brand opacity-80 group-hover:opacity-100 transition-opacity">
          {icon}
        </div>
        <span className="text-muted-foreground text-[12px] font-medium">{title}</span>
      </div>
      <div className="text-brand text-xl font-bold font-display mb-1 tracking-tight">
        {value}
      </div>
      <div className="text-muted-foreground text-[11px] mt-auto leading-snug">
        {subtitle}
      </div>
    </div>
  )
}

function FeatureItem({ icon, title, subtitle }: { icon: React.ReactNode, title: string, subtitle: string }) {
  return (
    <div className="flex items-center gap-4 flex-1 min-w-[200px]">
      <div className="w-12 h-12 rounded-2xl bg-background border border-brand-solid/20 flex items-center justify-center text-brand flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-foreground font-bold text-[14px]">{title}</div>
        <div className="text-muted-foreground text-[12px]">{subtitle}</div>
      </div>
    </div>
  )
}

export default function PackageClient({
  pkg,
  examSets,
  summaries,
  isPurchased,
  supportConfig,
  writtenExams = [],
  relatedNews = [],
  relatedArticles = [],
  isAuthenticated,
  canonicalPosition = null,
  visualPreview = false,
}: {
  pkg: any
  examSets: any[]
  summaries: any[]
  isPurchased: boolean
  supportConfig: SupportConfig
  writtenExams?: WrittenExamDiscovery[]
  relatedNews?: RelatedNewsItem[]
  relatedArticles?: RelatedArticleItem[]
  isAuthenticated: boolean
  canonicalPosition?: CanonicalPositionLink | null
  /** Disables analytics and checkout handling for the ignored local preview. */
  visualPreview?: boolean
}) {
  const orgName = pkg.organizations?.name || 'ไม่ระบุหน่วยงาน'
  const logoUrl = pkg.logo_url || pkg.organizations?.logo_url || null
  const positionName = canonicalPosition?.name?.trim() || pkg.positions?.name?.trim() || ''
  const thaiDisplayYear = formatThaiDisplayYear(pkg.exam_year)
  const technicalMetadata = [
    typeof pkg.package_code === 'string' && pkg.package_code.trim() ? pkg.package_code.trim() : null,
    pkg.version !== null && pkg.version !== undefined && String(pkg.version).trim() ? `v${pkg.version}` : null,
    typeof pkg.difficulty === 'string' && pkg.difficulty.trim() ? pkg.difficulty.trim() : null,
  ].filter((value): value is string => Boolean(value))
  const currentPrice = typeof pkg.current_price === 'number' && Number.isFinite(pkg.current_price)
    ? pkg.current_price
    : 0
  const originalPrice = typeof pkg.original_price === 'number' && Number.isFinite(pkg.original_price)
    ? pkg.original_price
    : null
  const hasDiscount = originalPrice !== null && originalPrice > currentPrice && currentPrice >= 0
  const discountAmount = hasDiscount ? originalPrice - currentPrice : 0
  const accessTerm = resolvePackageAccessTerm()
  const mobileInlinePurchaseRef = React.useRef<HTMLAnchorElement>(null)
  const desktopInlinePurchaseRef = React.useRef<HTMLAnchorElement>(null)
  const [showStickyPurchase, setShowStickyPurchase] = React.useState(false)

  // Promoted sample exam: the first published is_sample exam set.
  // Resolved from the already-fetched examSets prop — no extra query.
  const sampleExam = (examSets as any[]).find((es) => es.is_sample) ?? null

  // Lower exam sets passed to ExamNavigation: excludes only the exact
  // promoted sample record so it is not duplicated in lower navigation,
  // while preserving all other exam sets (including any secondary sample records).
  const lowerExamSets = sampleExam
    ? (examSets as any[]).filter((es) => es.id !== sampleExam.id)
    : examSets

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const hasRelatedContent = relatedNews.length > 0 || relatedArticles.length > 0

  React.useEffect(() => {
    if (searchParams.get('success') === '1') {
      toastEvent('ชำระเงินสำเร็จ', 'success')
      router.replace(pathname, { scroll: false })
    }
  }, [searchParams, pathname, router])

  React.useEffect(() => {
    if (pkg?.id && pkg?.name && typeof pkg?.current_price === 'number') {
      if (!visualPreview) viewPackage(pkg.id, pkg.name, pkg.current_price)
    }
  }, [pkg?.id, pkg?.name, pkg?.current_price, visualPreview])

  React.useEffect(() => {
    const updateStickyPurchase = () => {
      const isMobile = window.matchMedia('(max-width: 1023px)').matches
      const inlinePurchase = isMobile ? mobileInlinePurchaseRef.current : desktopInlinePurchaseRef.current
      if (!inlinePurchase) {
        setShowStickyPurchase(false)
        return
      }

      const inlineBounds = inlinePurchase.getBoundingClientRect()
      const hasPassedInlinePurchase = inlineBounds.bottom <= 0
      const footer = document.querySelector<HTMLElement>('[data-site-footer="true"]')
      const footerIsNear = Boolean(footer && footer.getBoundingClientRect().top <= window.innerHeight + 96)
      const activeElement = document.activeElement
      const inputIsFocused = activeElement instanceof HTMLElement && (
        activeElement.matches('input, textarea, select, [contenteditable="true"]') || activeElement.isContentEditable
      )
      const visualViewport = window.visualViewport
      const keyboardIsOpen = Boolean(visualViewport && visualViewport.height < window.innerHeight - 160)
      const overlayIsOpen = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"], .mobile-more-backdrop'))
        .some((element) => {
          const bounds = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        })

      const shouldShow = isMobile && hasPassedInlinePurchase && !footerIsNear && !inputIsFocused && !keyboardIsOpen && !overlayIsOpen
      setShowStickyPurchase((current) => current === shouldShow ? current : shouldShow)
    }

    window.addEventListener('scroll', updateStickyPurchase, { passive: true })
    window.addEventListener('resize', updateStickyPurchase)
    document.addEventListener('focusin', updateStickyPurchase)
    document.addEventListener('focusout', updateStickyPurchase)
    window.visualViewport?.addEventListener('resize', updateStickyPurchase)
    window.visualViewport?.addEventListener('scroll', updateStickyPurchase)

    const overlayObserver = new MutationObserver(updateStickyPurchase)
    overlayObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['aria-modal', 'class', 'style'],
    })

    updateStickyPurchase()
    return () => {
      window.removeEventListener('scroll', updateStickyPurchase)
      window.removeEventListener('resize', updateStickyPurchase)
      document.removeEventListener('focusin', updateStickyPurchase)
      document.removeEventListener('focusout', updateStickyPurchase)
      window.visualViewport?.removeEventListener('resize', updateStickyPurchase)
      window.visualViewport?.removeEventListener('scroll', updateStickyPurchase)
      overlayObserver.disconnect()
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1360px] mx-auto px-4 py-6 md:py-8 pb-0 md:pb-0 lg:pb-8">

        <div className="mb-3 lg:mb-6">
          <Link href="/#exams" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-[12px] lg:text-[14px] font-medium transition-colors w-fit min-h-10">
            <ChevronLeft size={16} />
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:gap-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-6 items-stretch">
            
            <div className="order-1 lg:order-1 lg:col-span-7 bg-card border border-brand-solid/15 rounded-2xl lg:rounded-[24px] p-4 lg:p-8 flex flex-col gap-4 lg:gap-8 relative overflow-hidden shadow-2xl">
              <div className="flex flex-col gap-2 relative z-10 lg:flex-row lg:gap-6">
                <div className="flex min-w-0 items-center gap-3 lg:flex-none lg:items-start lg:gap-0">
                  <div className="w-12 h-12 lg:w-36 lg:h-48 bg-white rounded-xl lg:rounded-3xl flex-shrink-0 flex flex-col items-center justify-center relative border-[1px] border-brand-solid/30 shadow-[0_0_30px_rgba(212,175,55,0.1)] overflow-hidden">
                    {logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt={`${orgName} Logo`}
                        width={144}
                        height={192}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        className="p-1 lg:p-4"
                      />
                    ) : (
                      <div className="text-brand font-bold text-6xl opacity-30">{orgName.charAt(0)}</div>
                    )}
                  </div>
                  <span className="min-w-0 break-words text-foreground text-[12px] leading-snug lg:hidden">{orgName}</span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="hidden lg:flex flex-wrap items-center gap-1.5 mb-3">
                    <span className="text-foreground text-[12px] lg:text-[13px] mr-1 lg:mr-2">{orgName}</span>
                    {(canonicalPosition || pkg.positions?.name) && (
                      canonicalPosition ? (
                        <Link
                          href={`/positions/${encodeURIComponent(canonicalPosition.slug)}`}
                          className="text-brand text-[10px] lg:text-[11px] px-2 py-0.5 rounded-full border border-brand-solid/30 hover:bg-brand-solid/10 transition-colors min-h-7 inline-flex items-center"
                        >
                          {canonicalPosition.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-[10px] lg:text-[11px] px-2 py-0.5 rounded-full border border-border-subtle min-h-7 inline-flex items-center">
                          {pkg.positions.name}
                        </span>
                      )
                    )}
                    <span className="bg-card text-brand text-[10px] lg:text-[11px] px-2 py-0.5 rounded-full font-bold uppercase border border-brand-solid/30 min-h-7 inline-flex items-center">{pkg.package_code}</span>
                    <span className="bg-wash text-brand text-[10px] lg:text-[11px] px-2 py-0.5 rounded-full font-bold min-h-7 inline-flex items-center">ปี {formatThaiDisplayYear(pkg.exam_year)}</span>
                    <span className="bg-card border border-border-subtle text-muted-foreground text-[10px] lg:text-[11px] px-2 py-0.5 rounded-full min-h-7 inline-flex items-center">v{pkg.version || '1'}</span>
                    <span className="bg-card border border-border-subtle text-muted-foreground text-[10px] lg:text-[11px] px-2 py-0.5 rounded-full min-h-7 inline-flex items-center">{pkg.difficulty || 'ไม่ระบุระดับ'}</span>
                  </div>

                  <h1 className="text-[22px] sm:text-[26px] lg:text-[36px] font-bold font-display text-foreground mb-1 lg:mb-5 leading-[1.3] lg:leading-[1.25] break-words">
                    {buildPackageH1(pkg)}
                  </h1>

                  {(positionName || thaiDisplayYear) && (
                    <div className="mb-1.5 flex flex-wrap items-center gap-x-1 text-muted-foreground text-[11px] leading-relaxed break-words lg:hidden">
                      {positionName && (
                        canonicalPosition ? (
                          <Link
                            href={`/positions/${encodeURIComponent(canonicalPosition.slug)}`}
                            className="hover:text-brand transition-colors"
                          >
                            {positionName}
                          </Link>
                        ) : (
                          <span>{positionName}</span>
                        )
                      )}
                      {positionName && thaiDisplayYear && <span aria-hidden="true">·</span>}
                      {thaiDisplayYear && <span>ปี {thaiDisplayYear}</span>}
                    </div>
                  )}

                  {technicalMetadata.length > 0 && (
                    <div className="mb-3 text-muted-foreground text-[10px] leading-relaxed break-words [overflow-wrap:anywhere] lg:hidden">
                      {technicalMetadata.join(' · ')}
                    </div>
                  )}

                  <p className="text-muted-foreground text-[12px] lg:text-[14px] leading-[1.55] lg:leading-[1.6] mb-3 lg:mb-6 line-clamp-3 lg:line-clamp-none">
                    {pkg.description || 'เตรียมความพร้อมสำหรับการสอบด้วยชุดข้อสอบฝึกทำ พร้อมคำอธิบายประกอบในข้อสอบที่รองรับ'}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <GoldBadge icon={<Star size={12} fill="currentColor" />}>ใช้งานได้{accessTerm}</GoldBadge>
                    <div className="hidden lg:flex flex-wrap gap-2.5">
                      <GoldBadge icon={<Edit3 size={12} />}>คำอธิบายในข้อสอบที่รองรับ</GoldBadge>
                      <GoldBadge icon={<Clock size={12} fill="currentColor" />}>จำลองสอบจับเวลา</GoldBadge>
                      <GoldBadge icon={<Check size={12} />}>ข้อสอบปี {formatThaiDisplayYear(pkg.exam_year)}</GoldBadge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-border-subtle pt-3 lg:hidden" aria-label="สถิติแพ็กเกจ">
                <div className="min-w-0">
                  <div className="text-muted-foreground text-[10px] leading-tight">ชุดข้อสอบ</div>
                  <div className="text-brand text-[16px] font-bold tabular-nums">{pkg.total_exam_sets ?? 0}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground text-[10px] leading-tight">จำนวนข้อ</div>
                  <div className="text-brand text-[16px] font-bold tabular-nums">{Number(pkg.total_questions || 0).toLocaleString('th-TH')}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground text-[10px] leading-tight">สรุปเนื้อหา</div>
                  <div className="text-brand text-[16px] font-bold tabular-nums">{summaries.length}</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-brand-solid/20 pt-3 lg:hidden" aria-label="ราคาและซื้อแพ็กเกจ">
                <div className="min-w-0">
                  <div className="text-brand text-[22px] font-bold font-display leading-none">
                    {currentPrice === 0 ? 'ฟรี' : `฿${currentPrice.toLocaleString('th-TH')}`}
                  </div>
                  <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                    {hasDiscount
                      ? <>ปกติ {originalPrice!.toLocaleString('th-TH')} บาท · ประหยัด {discountAmount.toLocaleString('th-TH')} บาท</>
                      : `ใช้งานได้${accessTerm}`}
                  </div>
                </div>
                <PackagePurchaseAction
                  pkg={pkg}
                  isPurchased={isPurchased}
                  visualPreview={visualPreview}
                  variant="sticky"
                  anchorRef={mobileInlinePurchaseRef}
                />
              </div>

              <div className="hidden lg:grid lg:grid-cols-4 gap-4 mt-auto">
                <MiniStatCard
                  icon={<BookOpen size={16} />}
                  title="ชุดข้อสอบทั้งหมด"
                  value={<>{pkg.total_exam_sets} <span className="text-[15px] font-normal text-foreground">ชุด</span></>}
                  subtitle={`หมวดหมู่: ${pkg.total_categories} หมวด`}
                />
                <MiniStatCard
                  icon={<Clock size={16} />}
                  title="จำนวนข้อสอบ"
                  value={<>{Number(pkg.total_questions || 0).toLocaleString('th-TH')} <span className="text-[15px] font-normal text-foreground">ข้อ</span></>}
                  subtitle="จำนวนข้อสอบทั้งหมด"
                />
                <MiniStatCard
                  icon={<CalendarDays size={16} />}
                  title="สิทธิ์ใช้งาน"
                  value={<span className="text-[15px]">{accessTerm}</span>}
                  subtitle={accessTerm}
                />
                <MiniStatCard 
                  icon={<TrendingUp size={16} />}
                  title="ระดับความยาก"
                  value={<span className="text-[20px]">{pkg.difficulty}</span>}
                  subtitle={`เหมาะสำหรับผู้เตรียมสอบตำแหน่ง${pkg.name}`}
                />
              </div>
            </div>

            <div className="hidden lg:flex lg:order-2 lg:col-span-2 bg-card border border-brand-solid/15 rounded-[24px] p-6 flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden group hover:border-brand-solid/30 transition-colors">
               <div className="absolute top-0 right-0 w-32 h-32 bg-brand-solid opacity-[0.03] rounded-bl-full pointer-events-none"></div>
               <FileText size={48} className="text-brand/80 mb-6 drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" strokeWidth={1} />
               <div className="text-[42px] font-bold font-display text-brand leading-none mb-2 tracking-tight">
                 {Number(pkg.total_questions || 0).toLocaleString('th-TH')} <span className="text-[18px] text-foreground ml-1">ข้อ</span>
               </div>
               <div className="text-muted-foreground text-[13px] leading-snug max-w-[120px]">
                 รวมทุกข้อสอบในแพ็กเกจ
               </div>
            </div>

            <div className="hidden lg:block lg:order-3 lg:col-span-3 bg-card border border-brand-solid/30 rounded-[24px] p-8 shadow-[0_0_40px_rgba(212,175,55,0.05)] sticky top-6 transition-all duration-300 ease-in-out">
              <h2 className="text-brand font-bold text-[14px] lg:text-[16px] mb-3 lg:mb-6 font-display">เลือกแพ็กเกจเพื่อเริ่มเรียน</h2>

              <div className="text-muted-foreground text-[14px] mb-2">แพ็กเกจนี้</div>

              <div className="mb-2 lg:mb-4 flex items-baseline gap-2">
                <span className="text-[34px] lg:text-[56px] font-bold text-brand font-display leading-none tracking-tight">{currentPrice === 0 ? 'ฟรี' : currentPrice.toLocaleString('th-TH')}</span>
                {currentPrice > 0 && <span className="text-[15px] lg:text-[18px] text-foreground font-bold">บาท</span>}
              </div>

              <div className={`flex flex-wrap items-center gap-2 ${hasDiscount ? 'mb-4 lg:mb-8 min-h-6' : 'mb-3 lg:mb-6'}`}>
                {hasDiscount && (
                  <>
                    <span className="text-muted-foreground text-[12px] lg:text-[13px] line-through">ปกติ {originalPrice!.toLocaleString('th-TH')} บาท</span>
                    <span className="bg-brand-solid/20 text-brand text-[11px] font-bold px-2.5 py-1 rounded border border-brand-solid/30">
                      ประหยัด {discountAmount.toLocaleString('th-TH')} บาท
                    </span>
                  </>
                )}
              </div>

              <div className="space-y-2 lg:space-y-4 mb-4 lg:mb-10">
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-success flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-foreground text-[12px] lg:text-[14px]">ใช้งานได้{accessTerm}</span>
                </div>
                <div className="hidden lg:flex items-start gap-3">
                  <Check size={16} className="text-success flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-foreground text-[14px]">ฝึกทำข้อสอบจากชุดในแพ็กเกจ</span>
                </div>
                <div className="hidden lg:flex items-start gap-3">
                  <Check size={16} className="text-success flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-foreground text-[14px]">มีคำอธิบายประกอบในข้อสอบที่รองรับ</span>
                </div>
                <div className="hidden lg:flex items-start gap-3">
                  <Check size={16} className="text-success flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-foreground text-[14px]">จำลองสอบจับเวลา</span>
                </div>
                <div className="hidden lg:flex items-start gap-3">
                  <Check size={16} className="text-success flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-foreground text-[14px]">ใช้งานได้ทั้งมือถือและคอมพิวเตอร์</span>
                </div>
              </div>

              <PackagePurchaseAction
                pkg={pkg}
                isPurchased={isPurchased}
                visualPreview={visualPreview}
                variant="inline"
                anchorRef={desktopInlinePurchaseRef}
              />

              <div className="text-center mt-3 lg:mt-4 text-brand text-[11px] lg:text-[12px] flex items-center justify-center gap-1.5 opacity-80">
                <Star size={12} fill="currentColor" />
                {isPurchased ? 'สิทธิ์ใช้งานของคุณ' : currentPrice === 0 ? 'รับสิทธิ์ได้โดยไม่มีค่าใช้จ่าย' : `ซื้อครั้งเดียว ใช้ได้${accessTerm}`}
              </div>
            </div>

          </div>

          {/* ── Early Sample Exam Discovery ─────────────────────────────────
               Rendered immediately after the Package Hero grid, before
               #resources, so new visitors discover the free sample without
               scrolling through the content lists.
               Conditionally hidden when the package has no sample exam.
          */}
          {sampleExam && (
            <PackageSampleExamSection
              sampleExam={sampleExam}
              packageSlug={pkg.slug}
              isAuthenticated={isAuthenticated}
            />
          )}

          <div id="resources" className="grid grid-cols-1 gap-6 items-start lg:grid-cols-2">
            <div className="order-2 lg:order-1 bg-card border border-brand-solid/15 rounded-2xl lg:rounded-[24px] p-4 lg:p-8 shadow-2xl flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-wash flex items-center justify-center text-brand">
                  <BookOpen size={20} />
                </div>
                <h3 className="text-foreground text-[18px] lg:text-[20px] font-bold font-display">สรุปเนื้อหา</h3>
              </div>
              <SummaryNavigation summaries={summaries} packageSlug={pkg.slug} />
            </div>

            <div className="order-1 lg:order-2 bg-card border border-brand-solid/15 rounded-2xl lg:rounded-[24px] p-4 lg:p-8 shadow-2xl flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-wash flex items-center justify-center text-brand">
                  <Check size={20} />
                </div>
                <h3 className="text-foreground text-[18px] lg:text-[20px] font-bold font-display">ชุดข้อสอบ</h3>
              </div>
              
              <div className="flex-1">
                <ExamNavigation
                  examSets={lowerExamSets}
                  packageSlug={pkg.slug}
                  writtenExamCount={writtenExams.length}
                />
              </div>
              {writtenExams.length > 0 && (
                <div className="mt-4">
                  <WrittenExamNavigation materials={writtenExams} packageSlug={pkg.slug} />
                </div>
              )}
            </div>
          </div>

          {hasRelatedContent && (
            <section
              aria-label="อ่านเพิ่มเติมก่อนสอบ"
              className="bg-card border border-brand-solid/15 rounded-2xl lg:rounded-[24px] p-4 lg:p-8 shadow-2xl flex flex-col gap-4 lg:gap-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-wash flex items-center justify-center text-brand">
                  <Sparkles size={20} />
                </div>
                <h2 className="text-foreground text-[20px] font-bold font-display">
                  อ่านเพิ่มเติมก่อนสอบ
                </h2>
              </div>

              <div className={`grid grid-cols-1 ${relatedNews.length > 0 && relatedArticles.length > 0 ? 'lg:grid-cols-2' : ''} gap-6 items-start`}>
                {relatedNews.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[13px] font-bold text-brand uppercase tracking-wider flex items-center gap-2">
                      <Newspaper size={15} />
                      <span>ข่าวเปิดสอบที่เกี่ยวข้อง</span>
                    </h3>
                    <div className="flex flex-col gap-3">
                      {relatedNews.map((n) => (
                        <ContentCard
                          key={n.id}
                          href={`/news/${n.slug}`}
                          title={n.title}
                          meta={[...(n.category ? [{ text: n.category }] : [])]}
                          badge={{ label: 'ข่าวเปิดสอบ', tone: 'gold' }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {relatedArticles.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[13px] font-bold text-brand uppercase tracking-wider flex items-center gap-2">
                      <BookOpen size={15} />
                      <span>บทความเตรียมสอบ</span>
                    </h3>
                    <div className="flex flex-col gap-3">
                      {relatedArticles.map((a) => (
                        <ContentCard
                          key={a.id}
                          href={`/articles/${a.slug}`}
                          title={a.title}
                          description={a.excerpt || undefined}
                          meta={[...(a.category ? [{ text: a.category }] : [])]}
                          badge={{ label: 'บทความ', tone: 'success' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="bg-card border border-brand-solid/15 rounded-2xl lg:rounded-[24px] p-4 lg:p-8 flex flex-wrap xl:flex-nowrap items-center justify-between gap-4 lg:gap-6 shadow-xl">
             <FeatureItem
               icon={<Edit3 size={24} />}
               title="มีคำอธิบายประกอบข้อสอบ"
               subtitle="ในข้อสอบที่รองรับ"
             />
             <div className="hidden xl:block w-px h-12 bg-border-subtle"></div>
             <FeatureItem
               icon={<Clock size={24} />}
               title="จำลองสอบจับเวลา"
               subtitle="เสมือนสอบจริง"
             />
             <div className="hidden xl:block w-px h-12 bg-border-subtle"></div>
             <FeatureItem
               icon={<MonitorSmartphone size={24} />}
               title="รองรับมือถือและคอมพิวเตอร์"
               subtitle="ใช้งานได้บนหน้าจอหลากหลายขนาด"
             />
             <div className="hidden xl:block w-px h-12 bg-border-subtle"></div>
             <FeatureItem
               icon={<FileText size={24} />}
               title="ฝึกทำข้อสอบ"
               subtitle="จากชุดข้อสอบในแพ็กเกจ"
             />
          </div>

          {supportConfig.enabled && (
            <SupportCard
              title={supportConfig.title}
              description={supportConfig.description}
              button_label={supportConfig.button_label}
              qr_image_url={supportConfig.qr_image_url}
              promptpay_name={supportConfig.promptpay_name}
              bank_name={supportConfig.bank_name}
              account_number={supportConfig.account_number}
              footer_message={supportConfig.footer_message}
            />
          )}

        </div>
      </div>

      {showStickyPurchase && (
        <div
          className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[45] px-3 lg:hidden"
          data-package-sticky-purchase="true"
          role="region"
          aria-label="ทางลัดไปยังแพ็กเกจ"
        >
          <div className="mx-auto flex h-[58px] max-w-[560px] items-center justify-between gap-2 rounded-xl border border-brand-solid/30 bg-card/95 px-3 shadow-[0_-8px_28px_rgba(0,0,0,0.22)] backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold leading-tight text-brand">
                {isPurchased ? 'สิทธิ์ของคุณ' : currentPrice === 0 ? 'แพ็กเกจฟรี' : `฿${currentPrice.toLocaleString('th-TH')}`}
              </div>
              <div className="truncate text-[10px] leading-tight text-muted-foreground">
                {isPurchased ? 'เริ่มเรียนต่อได้' : `ใช้งานได้${accessTerm}`}
              </div>
            </div>
            <PackagePurchaseAction
              pkg={pkg}
              isPurchased={isPurchased}
              visualPreview={visualPreview}
              variant="sticky"
            />
          </div>
        </div>
      )}
    </div>
  )
}
