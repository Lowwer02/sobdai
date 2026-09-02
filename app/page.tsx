import type { Metadata } from 'next'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPackagePublicCounts } from '@/lib/publicData'
import { getHomepagePromotions } from '@/lib/homepagePromotions'
import type { HomepagePromotion } from '@/lib/homepagePromotions'
import type { PackageCardData } from '@/components/PackageCard'
import PromotionSection from '@/components/PromotionSection'
import AnnouncementBar from '@/components/AnnouncementBar'
import ProductValueSection from '@/components/ProductValueSection'
import CandidateJourneySection from '@/components/CandidateJourneySection'
import type { HeroSearchChip } from '@/components/HeroPackageSearch'
import { getHomepageSettings } from '@/lib/homepageConfig'
import { createPageMetadata, SITE_ORGANIZATION } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import { getLatestNews } from '@/lib/news'
import type { NewsCardData } from '@/components/news/NewsCard'

// Home V2 Components
import HomeHero from '@/components/home/HomeHero'
import HomeProof from '@/components/home/HomeProof'
import HomeExamShowcase from '@/components/home/HomeExamShowcase'
import HomeInsightShowcase from '@/components/home/HomeInsightShowcase'
import HomeFeaturedExams from '@/components/home/HomeFeaturedExams'
import HomeLatestNews from '@/components/home/HomeLatestNews'
import HomeFinalCTA from '@/components/home/HomeFinalCTA'

// Homepage shows public package data + homepage settings that change
// infrequently. Cache server-side (ISR) and revalidate every 5 minutes.
// Admin saves call revalidatePath('/') to refresh within this window.
export const revalidate = 300

function addUniqueChip(chips: HeroSearchChip[], labels: Set<string>, label: string, href: string, maxChips = 5) {
  const cleanLabel = label.trim()
  if (!cleanLabel || labels.has(cleanLabel) || chips.length >= maxChips) return
  labels.add(cleanLabel)
  chips.push({ label: cleanLabel, href })
}

function buildHeroSearchChips(packages: any[]): HeroSearchChip[] {
  const chips: HeroSearchChip[] = []
  const labels = new Set<string>()
  const MAX_CHIPS = 5

  // 1. Free
  if (packages.some((pkg) => Number(pkg.current_price) === 0)) {
    addUniqueChip(chips, labels, 'ฟรี', '/packages?filter=free', MAX_CHIPS)
  }

  // 2. Latest
  if (packages.length > 0) {
    addUniqueChip(chips, labels, 'ล่าสุด', '/packages?filter=latest', MAX_CHIPS)
  }

  // 3. Top Positions (ONLY positions, no long organization names for compact UI)
  const positions = new Map<string, number>()
  for (const pkg of packages) {
    const positionName = pkg.positions?.name?.trim()
    if (positionName) positions.set(positionName, (positions.get(positionName) ?? 0) + 1)
  }

  const rankedPositions = [...positions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))

  for (const [label] of rankedPositions) {
    if (chips.length >= MAX_CHIPS) break
    addUniqueChip(chips, labels, label, `/packages?q=${encodeURIComponent(label)}`, MAX_CHIPS)
  }

  return chips.slice(0, MAX_CHIPS)
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getHomepageSettings()
  const og = settings.seo.og_image_url || undefined
  return createPageMetadata({
    title: settings.seo.title,
    description: settings.seo.description,
    path: '/',
    ...(og ? { image: og } : {}),
  })
}

export default async function Home() {
  // Read all homepage config in one server call (ISR-cached).
  const settings = await getHomepageSettings()
  const { hero, cta, sections, package_explorer, latest_news } = settings

  let livePackages: PackageCardData[] = []
  let homepagePromotions: HomepagePromotion[] = []
  let heroSearchChips: HeroSearchChip[] = []
  let latestNews: NewsCardData[] = []

  try {
    const supabase = createAnonServerClient()
    const count = settings.general.featured_count

    // Query: featured packages first, ordered by dedicated homepage_order
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

    // Run featured-packages, promotions, chip-packages, and latest news in parallel.
    const [featuredResult, promotionsResult, chipPackagesResult, latestNewsResult] = await Promise.all([
      featuredQuery,
      getHomepagePromotions(),
      chipPackagesQuery,
      sections.news ? getLatestNews(latest_news.limit) : Promise.resolve([]),
    ])

    featuredData = featuredResult.data || []
    homepagePromotions = promotionsResult
    heroSearchChips = buildHeroSearchChips(chipPackagesResult.data || [])
    latestNews = latestNewsResult

    if (featuredData.length > 0) {
      const counts = await getPackagePublicCounts(featuredData.map((p: any) => p.id))
      livePackages = featuredData.map((pkg: any) => ({
        ...pkg,
        total_questions: counts[pkg.id]?.total_questions || 0,
        total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
      }))
    }
  } catch (error) {
    console.error('Failed to fetch packages or news:', error)
  }

  const topPromotion = homepagePromotions[0] ?? null
  const remainingPromotions = homepagePromotions.slice(1)

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    ...SITE_ORGANIZATION,
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <StructuredData data={organizationJsonLd} />

      {/* ===================== Announcement Bar ===================== */}
      <AnnouncementBar promotion={topPromotion} />

      {/* ===================== 1. Product-First Hero ===================== */}
      {sections.hero && <HomeHero hero={hero} searchChips={heroSearchChips} />}

      {/* ===================== 2. Verified Platform Proof ===================== */}
      <HomeProof />

      {/* ===================== 3. Why Sobdai / Product Value ===================== */}
      {sections.features && <ProductValueSection />}

      {/* ===================== 4. Large Exam Product Showcase ===================== */}
      <HomeExamShowcase />

      {/* ===================== 5. Insight & Diagnostic Showcase ===================== */}
      <HomeInsightShowcase />

      {/* =========================================================================
          FUTURE SOBDAI DAILY INTEGRATION BOUNDARY
          A dedicated task owns /daily, Daily 5, Streak, EXP, Quests.
          The homepage is Daily-Ready but Daily-Independent.
          ========================================================================= */}

      {/* ===================== 6. Learning Journey ===================== */}
      {sections.howto && <CandidateJourneySection />}

      {/* ===================== 7. Featured / Popular Exam Sets ===================== */}
      {sections.featured && (
        <HomeFeaturedExams packages={livePackages} config={package_explorer} />
      )}

      {/* ===================== 8. Latest Government Exam News ===================== */}
      {sections.news && latestNews.length > 0 && (
        <HomeLatestNews news={latestNews} config={latest_news} />
      )}

      {/* ===================== 9. Remaining Promotions ===================== */}
      {remainingPromotions.length > 0 && <PromotionSection promotions={remainingPromotions} />}

      {/* ===================== 10. Final Conversion CTA ===================== */}
      {sections.cta && <HomeFinalCTA cta={cta} />}
    </div>
  )
}
