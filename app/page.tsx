import Link from 'next/link'
import type { Metadata } from 'next'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPackagePublicCounts } from '@/lib/publicData'
import { getHomepagePromotions } from '@/lib/homepagePromotions'
import type { HomepagePromotion } from '@/lib/homepagePromotions'
import PackageCard from '@/components/PackageCard'
import type { PackageCardData } from '@/components/PackageCard'
import PromotionSection from '@/components/PromotionSection'
import AnnouncementBar from '@/components/AnnouncementBar'
import ProductValueSection from '@/components/ProductValueSection'
import CandidateJourneySection from '@/components/CandidateJourneySection'
import HeroPackageSearch from '@/components/HeroPackageSearch'
import type { HeroSearchChip } from '@/components/HeroPackageSearch'
import { getHomepageSettings } from '@/lib/homepageConfig'
import type { FeatureItem, CtaButton } from '@/lib/homepageConfig'

// Homepage shows public package data + homepage settings that change
// infrequently. Cache server-side (ISR) and revalidate every 5 minutes.
// Admin saves call revalidatePath('/') to refresh within this window.
export const revalidate = 300

// Developer-owned icon allowlist. The admin only picks an icon KEY (from the
// dropdown); the actual SVG lives here, controlled by the developer. This
// keeps design control out of admin hands while letting them choose an icon.
const ICONS: Record<string, React.ReactNode> = {
  exam: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  hint: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  explain: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  lock: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
}

// Render a CTA button from config. Supports internal (Link) + external (a).
function CtaLink({ cta, className, style }: { cta: CtaButton; className?: string; style?: React.CSSProperties }) {
  if (!cta.label || !cta.href) return null
  if (cta.type === 'external') {
    return (
      <a href={cta.href} target={cta.open_in_new_tab ? '_blank' : undefined} rel={cta.open_in_new_tab ? 'noopener noreferrer' : undefined}>
        <button type="button" className={className} style={style}>{cta.label}</button>
      </a>
    )
  }
  return (
    <Link href={cta.href}>
      <button type="button" className={className} style={style}>{cta.label}</button>
    </Link>
  )
}

function addUniqueChip(chips: HeroSearchChip[], labels: Set<string>, label: string, href: string) {
  const cleanLabel = label.trim()
  if (!cleanLabel || labels.has(cleanLabel) || chips.length >= 7) return
  labels.add(cleanLabel)
  chips.push({ label: cleanLabel, href })
}

function buildHeroSearchChips(packages: any[]): HeroSearchChip[] {
  const chips: HeroSearchChip[] = []
  const labels = new Set<string>()

  if (packages.some((pkg) => Number(pkg.current_price) === 0)) {
    addUniqueChip(chips, labels, 'ฟรี', '/packages?filter=free')
  }

  if (packages.length > 0) {
    addUniqueChip(chips, labels, 'ล่าสุด', '/packages?filter=latest')
  }

  const organizations = new Map<string, number>()
  const positions = new Map<string, number>()

  for (const pkg of packages) {
    const orgName = pkg.organizations?.name?.trim()
    const positionName = pkg.positions?.name?.trim()

    if (orgName) organizations.set(orgName, (organizations.get(orgName) ?? 0) + 1)
    if (positionName) positions.set(positionName, (positions.get(positionName) ?? 0) + 1)
  }

  const rankedOrganizations = [...organizations.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
    .slice(0, 4)

  const rankedPositions = [...positions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
    .slice(0, 4)

  for (const [label] of rankedOrganizations) {
    addUniqueChip(chips, labels, label, `/packages?q=${encodeURIComponent(label)}`)
  }

  for (const [label] of rankedPositions) {
    addUniqueChip(chips, labels, label, `/packages?q=${encodeURIComponent(label)}`)
  }

  return chips
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getHomepageSettings()
  const og = settings.seo.og_image_url || undefined
  return {
    title: settings.seo.title,
    description: settings.seo.description,
    openGraph: og ? { images: [og] } : undefined,
  }
}

export default async function Home() {
  // Read all homepage config in one server call (ISR-cached).
  const settings = await getHomepageSettings()

  let livePackages: PackageCardData[] = []
  let homepagePromotions: HomepagePromotion[] = []
  let heroSearchChips: HeroSearchChip[] = []

  try {
    const supabase = createAnonServerClient()
    const count = settings.general.featured_count

    // Query: featured packages first, ordered by the dedicated homepage
    // ordering chain. NOTE: this intentionally does NOT use
    // applyContentOrdering() — that helper sorts on display_order/released_at,
    // which exist on summaries/exam_sets but NOT on packages (that mismatch
    // caused a PostgREST 400 + empty homepage). Packages use their own
    // homepage_order column instead.
    let featuredData: any[] = []
    const featuredQuery = supabase
      .from('packages')
      .select(`
        id, slug, exam_year, current_price, original_price, difficulty,
        description, logo_url,
        organizations ( name, logo_url ),
        positions ( name )
      `)
      .eq('is_published', true)
      .eq('featured_homepage', true)
      .order('homepage_order', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(count)

    const chipPackagesQuery = supabase
      .from('packages')
      .select(`
        current_price,
        created_at,
        organizations ( name ),
        positions ( name )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    // Run featured-packages and promotions in parallel — both are independent
    // reads, so one batch saves a round-trip. Promotion fetch is isolated in
    // its own try/catch below so a promotion failure can never break packages.
    const [featuredResult, promotionsResult, chipPackagesResult] = await Promise.all([
      featuredQuery,
      getHomepagePromotions(),
      chipPackagesQuery,
    ])

    featuredData = featuredResult.data || []
    homepagePromotions = promotionsResult
    heroSearchChips = buildHeroSearchChips(chipPackagesResult.data || [])

    // BUSINESS RULE: the homepage renders ONLY packages where
    // is_published = true AND featured_homepage = true. No exceptions.
    // The previous fallback/top-up query injected non-featured packages
    // (featured_homepage = false) when fewer than `count` were featured —
    // that violated the rule and caused non-featured packages to appear.
    // Removed: no fallback may include non-featured packages.

    if (featuredData.length > 0) {
      const counts = await getPackagePublicCounts(featuredData.map((p: any) => p.id))
      livePackages = featuredData.map((pkg: any) => ({
        ...pkg,
        total_questions: counts[pkg.id]?.total_questions || 0,
        total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
      }))
    }
  } catch (error) {
    console.error('Failed to fetch packages:', error)
  }

  const { hero, cta, sections, features, howto } = settings
  const topPromotion = homepagePromotions[0] ?? null
  const remainingPromotions = homepagePromotions.slice(1)

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* ===================== Announcement Bar ===================== */}
      <AnnouncementBar promotion={topPromotion} />

      {/* ===================== Hero ===================== */}
      {sections.hero && (
        <section
          style={{
            position: 'relative',
            padding: '72px 20px 64px',
            textAlign: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Background glow */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: '-40px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '600px',
              height: '400px',
              background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.08) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
            <div style={{ marginBottom: '20px' }}>
              <span className="badge badge-gold" style={{ fontSize: '13px', padding: '4px 14px' }}>
                {hero.badge}
              </span>
            </div>

            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(36px, 7vw, 64px)',
                lineHeight: 1.15,
                marginBottom: '18px',
                background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                whiteSpace: 'pre-line',
              }}
            >
              {hero.title}
            </h1>

            <p
              style={{
                fontSize: '17.5px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                marginBottom: '32px',
                maxWidth: '520px',
                margin: '0 auto 32px',
                whiteSpace: 'pre-line',
              }}
            >
              {hero.subtitle}
            </p>

            <HeroPackageSearch chips={heroSearchChips} />

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Link href="/packages">
                <button type="button" className="btn-outline" style={{ padding: '12px 28px', fontSize: '14px' }}>
                  ดูชุดข้อสอบทั้งหมด
                </button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ===================== Product Value Section =====================
          Positions Sobdai's learning outcomes over passive reading/video watching.
          Placed above Package Explorer to build intent before package selection. */}
      {sections.features && <ProductValueSection />}

      {/* ===================== Package Explorer ===================== */}
      {sections.featured && (
        <section id="exams" style={{ padding: '40px 20px 80px', maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
            <div>
              <h2 className="font-display" style={{ fontSize: 'clamp(22px, 3.5vw, 32px)', marginBottom: '6px', color: 'var(--text-primary)' }}>
                เริ่มต้นจากตำแหน่งที่คุณสนใจ
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', margin: 0 }}>
                เลือกกรมและตำแหน่งที่ต้องการเพื่อเริ่มฝึกทำข้อสอบทีละข้อ
              </p>
            </div>
            <Link
              href="/packages"
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--gold-light)',
                fontSize: '14px',
                fontWeight: 600,
              }}
              className="group"
            >
              <span>ดูชุดข้อสอบทั้งหมด</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-1">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>

          {livePackages.length > 0 ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '20px',
                }}
              >
                {livePackages.map((pkg, i) => (
                  <PackageCard key={pkg.id} pkg={pkg} index={i} />
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <Link href="/packages">
                  <button type="button" className="btn-outline" style={{ padding: '12px 32px' }}>
                    ดูชุดข้อสอบทั้งหมด ({livePackages.length} ชุด)
                  </button>
                </Link>
              </div>
            </>
          ) : (
            <div className="card" style={{ padding: '48px 20px', textAlign: 'center', minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gold-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', marginBottom: '24px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 8v8" />
                  <path d="m8 12 4 4 4-4" />
                </svg>
              </div>
              <h3 className="font-display" style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)' }}>กำลังเตรียมชุดข้อสอบใหม่</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>ทีมงานกำลังอัปเดตคลังข้อสอบและสรุปเนื้อหาสำหรับปีล่าสุด กลับมาเช็คใหม่เร็วๆ นี้นะครับ</p>
            </div>
          )}
        </section>
      )}

      {/* ===================== Candidate Journey ===================== */}
      {sections.howto && <CandidateJourneySection />}

      {/* ===================== Promotions =====================
          Renders remaining live promotions in cards banner (highest priority promo
          is rendered in the Announcement Bar above Hero). */}
      {remainingPromotions.length > 0 && <PromotionSection promotions={remainingPromotions} />}

      {/* ===================== CTA ===================== */}
      {sections.cta && (
        <section style={{ padding: '60px 20px 100px' }}>
          <div
            className="card-gold"
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              padding: '48px 40px',
              textAlign: 'center',
            }}
          >
            <h2 className="font-display" style={{ fontSize: 'clamp(22px, 4vw, 32px)', marginBottom: '12px' }}>
              {cta.final_title}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.65 }}>
              {cta.final_subtitle}
            </p>
            <CtaLink cta={cta.final_button} className="btn-primary animate-pulse-gold" style={{ padding: '14px 36px', fontSize: '16px' }} />
          </div>
        </section>
      )}
    </div>
  )
}
