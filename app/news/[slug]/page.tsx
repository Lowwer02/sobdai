import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import type { Metadata } from 'next'
import {
  ChevronRight,
  Calendar,
  Clock,
  Edit3,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  Newspaper,
  Tag as TagIcon,
} from 'lucide-react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { createPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo'
import { buildNewsMetadata, buildNewsJsonLd, type CtaConfig, type GpExamRequirement } from '@/lib/news'
import { getPackagePublicCounts } from '@/lib/publicData'
import {
  mapSummaryRelationsToTargets,
  resolvePublicSummaryTargets,
  type PublicSummaryTarget,
} from '@/lib/summary-target'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import StructuredData from '@/components/StructuredData'
import PackageCard, { type PackageCardData } from '@/components/PackageCard'
import ContentCard from '@/components/ContentCard'
import NewsCtaBox from '@/components/news/NewsCtaBox'
import GpExamRequirementBadge from '@/components/news/GpExamRequirementBadge'
import RecruitmentStatusBadge from '@/components/news/RecruitmentStatusBadge'
import NewsShareButtons from '@/components/news/NewsShareButtons'
import NewsSocialFollowBox from '@/components/news/NewsSocialFollowBox'
import AffiliateRail from '@/components/affiliate/AffiliateRail'
import { getAffiliateRailProducts } from '@/lib/affiliate-public'
import type { AffiliateRailProduct } from '@/lib/affiliate'
import { getHomepageSettings } from '@/lib/homepageConfig'
import { resolveSocialFollowChannels } from '@/lib/socialFollowConfig'

/**
 * Viewport width where the two-column layout activates: the editorial column
 * (800px incl. its 20px gutters) + 40px gap + 300px sidebar. Below this the
 * rail flows inline after the Sobdai CTA zone (Content → CTA → Affiliate →
 * Related), with no CSS ordering tricks — pure document order. MUST match the
 * media query in the scoped style block below and the placement analytics
 * breakpoint passed to AffiliateRail.
 */
const AFFILIATE_SIDEBAR_MIN_WIDTH_PX = 1180


/**
 * Public Government News detail (`/news/[slug]`) — Server Component.
 *
 * The primary SEO landing page for a news article. Entirely server-rendered
 * (the only client island is SummaryMarkdown, which renders body_markdown with
 * the SAME renderer the public summary pages use, so preview == live). All
 * interactive affordances here are plain <Link>/<a>, so no extra client
 * boundary is needed.
 *
 * ACCESS MODEL
 *   - Anon RLS already restricts reads to published rows ("Public can read
 *     published news."). We add an explicit .eq('status','published') as a
 *     documented second guard (mirrors the list page + packages' is_published
 *     pattern). A missing/unpublished row → notFound() (renders the custom
 *     app/not-found.tsx). An archived/draft article therefore 404s on the
 *     public path, which is the intended behaviour: only published is public.
 *
 * CACHING
 *   - export const revalidate = 300 matches the homepage/packages ISR window.
 *     Importantly, the server actions (publishNews / updateNews / restoreNews)
 *     call revalidatePath('/news/[slug]') on change, so a publish revalidates
 *     immediately while a steady-state page stays cheaply cached.
 *
 * METADATA
 *   - generateMetadata() resolves the article via the same cached fetch as the
 *     page body (React cache() dedupes the supabase round-trip — the JS client
 *     isn't auto-memoized like fetch). Fallback rules live in buildNewsMetadata
 *     (lib/news.ts); on a miss we return noindex metadata rather than throw
 *     (matches the app/package/[slug] convention). JSON-LD is a separate task.
 *
 * SEO STRUCTURE
 *   - Single <h1> = article title (mirrors the list page owning its own <h1>).
 *   - Semantic <article> + <header> + <time datetime>. Category/tags as a
 *     real list. Breadcrumb is a semantic <nav aria-label="breadcrumb"> with a
 *     structured itemlist.
 */

export const revalidate = 300

interface NewsDetailRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[] | null
  status: string
  published_at: string | null
  updated_at: string | null
  source_name: string | null
  source_url: string | null
  source_date: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  og_image_url: string | null
  created_at: string | null
  // JSONB cta_config column (migration 035). The raw row deserializes it as an
  // opaque object; NewsCtaBox treats null/invalid as "no CTA". Typed loosely
  // (CtaConfig | null) — cleanCtaConfig already runs on the admin write path,
  // and the box re-validates every destination at render regardless.
  cta_config: CtaConfig | null
  // ภาค ก. requirement (tri-state). Coerced to 'unspecified' by the contract
  // when absent, but the column has a DB default so it's always present on live rows.
  gp_exam_requirement: GpExamRequirement
  application_deadline?: string | null
  // Affiliate rail wiring (migration 085). Default false on legacy rows.
  affiliate_enabled: boolean
  affiliate_collection_id: string | null
}

interface NewsNeighbor {
  slug: string
  title: string
}

/** Thai-locale date string (matches NewsCard / admin list fmtDate). */
function formatDate(s: string | null | undefined): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Day-granularity comparison: show "updated" only when it differs from the
 * published date (avoids a noisy, identical "updated" line right after a
 * first publish). Compares YYYY-MM-DD slices of the ISO timestamps.
 */
function isUpdatedAfterPublished(
  publishedAt: string | null,
  updatedAt: string | null
): boolean {
  if (!publishedAt || !updatedAt) return false
  return updatedAt.slice(0, 10) > publishedAt.slice(0, 10)
}

/**
 * Cached published-article fetch, shared by generateMetadata + the page body.
 * React cache() dedupes within a single request so the supabase JS client (not
 * auto-memoized like fetch) isn't queried twice per page load. Published-only
 * double guard: RLS + explicit .eq('status','published').
 */
const getNewsForRoute = cache(async (slug: string): Promise<NewsDetailRow | null> => {
  const supabase = createAnonServerClient()
  const { data } = await supabase
    .from('news')
    .select(
      'id, slug, title, excerpt, body_markdown, cover_image_url, cover_image_alt, category, tags, status, published_at, updated_at, source_name, source_url, source_date, seo_title, seo_description, canonical_url, og_image_url, created_at, cta_config, gp_exam_requirement, application_deadline, affiliate_enabled, affiliate_collection_id'
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data as NewsDetailRow | null
})

/**
 * Resolve a `news_redirects` row for a missing article, keyed by the FULL
 * public path (`/news/<slug>`, exactly how actions.ts writes from_path). Runs
 * ONLY when the article lookup already missed — so a live article never pays a
 * redirects query (the task's performance requirement).
 *
 * STATUS CODES — important nuance: news_redirects.http_status is CHECK-
 * constrained to 301/302, but Next 16's redirect()/permanentRedirect() helpers
 * cannot emit literal 301/302 (they emit 307/308, which preserve the HTTP
 * method). We honour the stored intent by mapping the semantic class:
 *   301 (permanent) → permanentRedirect()  → emits 308
 *   302 (temporary) → redirect()           → emits 307
 * For GET requests on public news (the only method that reaches this page),
 * Googlebot treats 308≡301 (full link-equity transfer) and 307≡302 (temporary),
 * so the SEO semantics are correct. The stored value still drives the
 * permanent-vs-temporary decision; only the on-wire code differs due to the
 * framework. (Emitting literal 301/302 would require middleware or a route
 * handler — Sobdai has neither, and the task forbids a new routing pattern.)
 *
 * Returns true if it issued a redirect (the helper throws internally, so this
 * return is only reached on no-match); the caller then falls through to
 * notFound(). The to_path target is followed as-is — the migration deliberately
 * decouples redirects from publish state, and the target renders/404s on its
 * own arrival.
 */
async function resolveNewsRedirect(path: string): Promise<boolean> {
  const supabase = createAnonServerClient()
  const { data } = await supabase
    .from('news_redirects')
    .select('to_path, http_status')
    .eq('from_path', path)
    .maybeSingle()

  const row = data as { to_path: string; http_status: number } | null
  if (!row) return false

  // permanent (301) vs temporary (302) → permanentRedirect (308) vs redirect (307).
  if (row.http_status === 301) {
    permanentRedirect(row.to_path)
  } else {
    redirect(row.to_path)
  }
}

// ─── Related content (news_packages + news_summaries junction reads) ────────

/**
 * Related-content rows. The conversion path is News → Package → Summary, so the
 * detail page surfaces the editor-curated related packages + summaries. Both
 * junctions carry an editorial `sort_order` (0 = first), so ordering is by the
 * JUNCTION, not by the entity's own columns (do NOT use applyContentOrdering).
 */
interface RelatedPackageRow {
  id: string
  slug: string
  exam_year: string
  current_price: number
  original_price: number
  difficulty: string
  description: string | null
  logo_url: string | null
  organizations: { name: string; logo_url: string | null } | null
  positions: { name: string } | null
  sort_order: number
}

interface RelatedContent {
  packages: PackageCardData[]
  summaries: PublicSummaryTarget[]
}

/**
 * Fetch editor-curated related packages + summaries for a news article. One
 * query per relation type (no N+1), ordered by the junction's sort_order ASC.
 *
 *   - Packages: join through news_packages → packages(+organizations/positions),
 *     then ONE batched getPackagePublicCounts call (the SECURITY DEFINER RPC
 *     aggregates all counts in a single SQL query) merges total_questions /
 *     total_exam_sets onto each row — exactly the app/packages/page.tsx pattern.
 *   - Summaries: read only the News → Summary root IDs from news_summaries,
 *     then resolve all distinct IDs through the shared public-target resolver.
 *     That resolver owns Legacy/KP authority, current revision validation,
 *     deterministic Package membership selection, and the final href.
 *
 * Only published entities surface (RLS enforces this via the anon client:
 * packages.is_published and summaries.is_published), so an unpublished related
 * item silently drops out — the editorial list stays accurate without extra
 * filtering here. Junction RLS further gates on the parent news being
 * published, which the page already guarantees.
 *
 * Cached so generateMetadata / the body don't double-fetch (the body is the
 * only caller today, but cache() keeps it idempotent if that changes).
 */
const getRelatedContent = cache(async (newsId: string): Promise<RelatedContent> => {
  const supabase = createAnonServerClient()

  const [pkgResult, sumResult] = await Promise.all([
    supabase
      .from('news_packages')
      .select(
        `sort_order, package_id, packages!inner (
          id, slug, exam_year, current_price, original_price, difficulty,
          description, logo_url, organizations ( name, logo_url ), positions ( name )
        )`
      )
      .eq('news_id', newsId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('news_summaries')
      .select('sort_order, summary_id')
      .eq('news_id', newsId)
      .order('sort_order', { ascending: true }),
  ])

  // --- packages: flatten + attach counts in one batched RPC ---
  const pkgRows = (pkgResult.data ?? []) as unknown as {
    sort_order: number
    package_id: string
    packages: Omit<RelatedPackageRow, 'sort_order'> | null
  }[]
  const cleanPkgRows = pkgRows
    .filter(r => r.packages)
    .map(r => ({ ...r.packages!, sort_order: r.sort_order }))

  const counts = cleanPkgRows.length
    ? await getPackagePublicCounts(cleanPkgRows.map(p => p.id))
    : {}
  const packages: PackageCardData[] = cleanPkgRows.map(p => ({
    id: p.id,
    slug: p.slug,
    exam_year: p.exam_year,
    current_price: p.current_price,
    original_price: p.original_price,
    difficulty: p.difficulty,
    total_questions: counts[p.id]?.total_questions ?? 0,
    total_exam_sets: counts[p.id]?.total_exam_sets ?? 0,
    description: p.description,
    logo_url: p.logo_url,
    organizations: p.organizations,
    positions: p.positions,
  }))

  // --- summaries: keep the junction's root IDs, then resolve once in batch ---
  const sumRows = (sumResult.data ?? []) as unknown as {
    sort_order: number
    summary_id: string
  }[]
  const summaryIds = [...new Set(sumRows.map((row) => row.summary_id).filter(Boolean))]
  const summaryTargets = await resolvePublicSummaryTargets(supabase, summaryIds)
  const summaries: PublicSummaryTarget[] = mapSummaryRelationsToTargets(
    sumRows.map((row) => row.summary_id),
    summaryTargets,
  )

  return { packages, summaries }
})

// ─── Metadata ───────────────────────────────────────────────────────────────

/**
 * Per-article metadata with fallback rules (buildNewsMetadata). On a miss we
 * return noindex metadata rather than throw — matches app/package/[slug]'s
 * convention (a 404 page still needs valid <head> metadata).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = await getNewsForRoute(slug)

  if (!article) {
    return createPageMetadata({
      title: 'ไม่พบข่าว | Sobdai',
      path: `/news/${slug}`,
      noindex: true,
    })
  }

  return buildNewsMetadata(article)
}

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getNewsForRoute(slug)
  // Article found (and published) → render normally. NO redirect query runs in
  // this case (the performance requirement): news_redirects is only consulted
  // on a miss.
  if (!article) {
    // Missing/unpublished → check for a configured redirect before 404ing.
    // keyed by the full public path, exactly as actions.ts writes from_path.
    await resolveNewsRedirect(`/news/${slug}`)
    // No redirect either → 404 (custom not-found page).
    notFound()
  }
  const supabase = createAnonServerClient()

  // --- Prev / Next (older / newer) by the same ordering chain as the list ---
  // PostgREST can't return "neighbours of a row" directly, so follow the
  // summary-detail precedent: fetch the minimal ordered list of published
  // rows and slice around the current index. Editorial volume is small, so the
  // full-list scan is cheap and gives stable, index-consistent neighbours
  // (same order a visitor sees on /news).
  const { data: rawNeighbors } = await supabase
    .from('news')
    .select('slug, title, published_at, updated_at, created_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  const neighbors = (rawNeighbors ?? []) as NewsNeighbor[]
  const currentIndex = neighbors.findIndex(n => n.slug === article.slug)
  // List is newest-first, so index-1 is NEWER (next), index+1 is OLDER (prev).
  const newer = currentIndex > 0 ? neighbors[currentIndex - 1] : null
  const older =
    currentIndex >= 0 && currentIndex < neighbors.length - 1
      ? neighbors[currentIndex + 1]
      : null

  const publishedLabel = formatDate(article.published_at)
  const updatedLabel = formatDate(article.updated_at)
  const showUpdated = isUpdatedAfterPublished(article.published_at, article.updated_at)
  const tags = Array.isArray(article.tags) ? article.tags : []
  const hasSource = Boolean(article.source_name || article.source_url)

  // Editor-curated related packages + summaries (the conversion path). Empty
  // when no relations exist — the section renders nothing in that case.
  // Affiliate rail products: queried ONLY when the article opts in; the fetch
  // itself no-ops for a null collection and returns [] when the collection has
  // no published products, so the rail simply doesn't render.
  const [homepageSettings, related, affiliateProducts] = await Promise.all([
    getHomepageSettings(),
    getRelatedContent(article.id),
    article.affiliate_enabled
      ? getAffiliateRailProducts(article.affiliate_collection_id)
      : Promise.resolve([] as AffiliateRailProduct[]),
  ])

  const socialFollowPlacement = homepageSettings.social_follow.placements.news_detail_end
  const resolvedSocialChannels = resolveSocialFollowChannels(
    homepageSettings.social_follow,
    'news_detail_end',
    homepageSettings.footer.social_links
  )

  // NewsArticle JSON-LD (resolved once; reuses the same fallback rules as the
  // page <head> metadata via buildNewsJsonLd → resolveNewsSeo). Rendered inline
  // in the page body per Next's JSON-LD guide (StructuredData handles the
  // <script type="application/ld+json"> tag + createJsonLd sanitization).
  const jsonLd = buildNewsJsonLd(article)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'ข่าวสาร', path: '/news' },
    { name: article.title, path: article.canonical_url || `/news/${article.slug}` },
  ])

  return (
    <div style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Two-zone layout (affiliate M1): the editorial column keeps its exact
          800px reading width; the affiliate <aside> becomes a sticky 300px
          sidebar on wide viewports and flows inline (after the Sobdai CTA /
          social zone, before Related content) on narrow ones. Related content,
          back link, and prev/next live in a trailing block OUTSIDE the grid so
          the sticky sidebar naturally stops before them. Document order IS the
          mobile order: Content → Sobdai CTA → Affiliate → Related. */}
      <div className="news-detail-layout">
      <article style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 0' }}>
        <StructuredData data={jsonLd} />
        <StructuredData data={breadcrumbJsonLd} />
        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{ marginBottom: 28 }}
        >
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <li>
              <Link
                href="/"
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                หน้าแรก
              </Link>
            </li>
            <li aria-hidden style={{ color: 'var(--text-faint)' }}>
              <ChevronRight size={13} />
            </li>
            <li>
              <Link
                href="/news"
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                ข่าวสาร
              </Link>
            </li>
            <li aria-hidden style={{ color: 'var(--text-faint)' }}>
              <ChevronRight size={13} />
            </li>
            <li aria-current="page" style={{ color: 'var(--text-secondary)' }}>
              {article.title}
            </li>
          </ol>
        </nav>

        {/* Article header */}
        <header style={{ marginBottom: 28 }}>
          {/* Category + tags */}
          {(article.category || tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mb-4 max-w-full">
              {article.category && (
                <span
                  className="badge badge-gold shrink-0 max-w-full text-xs"
                  style={{ fontSize: 11, padding: '3px 10px', letterSpacing: '0.03em' }}
                >
                  {article.category}
                </span>
              )}
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs shrink-0 max-w-full"
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                  }}
                >
                  <TagIcon size={10} className="shrink-0" aria-hidden />
                  <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{tag}</span>
                </span>
              ))}
            </div>
          )}

          {/* Title — the single <h1> */}
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(26px, 4.5vw, 38px)',
              lineHeight: 1.3,
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text-primary)',
            }}
          >
            {article.title}
          </h1>

          {/* Dates */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px 20px',
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            {publishedLabel && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} aria-hidden />
                <time dateTime={article.published_at || undefined}>{publishedLabel}</time>
              </span>
            )}
            {showUpdated && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Edit3 size={14} aria-hidden />
                <span>อัปเดตเมื่อ <time dateTime={article.updated_at || undefined}>{updatedLabel}</time></span>
              </span>
            )}
            {/* ภาค ก. requirement — badge when required/not_required; muted inline
                note when unspecified (the box/card show nothing in that case). */}
            {(article.gp_exam_requirement === 'required' ||
              article.gp_exam_requirement === 'not_required') ? (
              <GpExamRequirementBadge value={article.gp_exam_requirement} />
            ) : (
              <span style={{ fontStyle: 'italic' }}>
                โปรดตรวจสอบเงื่อนไขภาค ก. จากประกาศต้นฉบับ
              </span>
            )}
            <RecruitmentStatusBadge deadline={article.application_deadline} />
          </div>

          {/* Share buttons */}
          <NewsShareButtons newsId={article.id} newsSlug={article.slug} newsTitle={article.title} shareLocation="article_header" />
        </header>

        {/* Cover image */}
        {article.cover_image_url && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: 'var(--bg-card-2)',
              marginBottom: 32,
            }}
          >
            <Image
              src={article.cover_image_url}
              alt={article.cover_image_alt || article.title}
              fill
              priority
              sizes="(max-width: 800px) 100vw, 800px"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Body — long-form reading column. SummaryMarkdown is the canonical
            public renderer (same as summary detail pages + admin preview). */}
        {article.body_markdown ? (
          <div className="prose-news" style={{ fontSize: 16, lineHeight: 1.8 }}>
            <SummaryMarkdown content={article.body_markdown} />
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            ยังไม่มีเนื้อหาสำหรับข่าวนี้
          </p>
        )}

        {/* Source section */}
        {hasSource && (
          <section
            aria-label="แหล่งข้อมูล"
            style={{
              marginTop: 40,
              paddingTop: 24,
              borderTop: '1px solid var(--border)',
            }}
          >
            <h2
              className="font-display"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--gold-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 12,
              }}
            >
              แหล่งข้อมูล
            </h2>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px 16px',
                fontSize: 14,
                color: 'var(--text-secondary)',
              }}
            >
              {article.source_url ? (
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded inline-flex items-center gap-1.5"
                  style={{ color: 'var(--gold-light)', fontWeight: 600 }}
                >
                  {article.source_name || 'ดูแหล่งข้อมูลต้นทาง'}
                  <ExternalLink size={13} aria-hidden />
                </a>
              ) : (
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {article.source_name}
                </span>
              )}
              {article.source_date && (
                <>
                  <span aria-hidden style={{ color: 'var(--text-faint)' }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} aria-hidden />
                    <time dateTime={article.source_date}>
                      {formatDate(article.source_date)}
                    </time>
                  </span>
                </>
              )}
            </div>
          </section>
        )}

        {/* Footer Share section */}
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <NewsShareButtons
            newsId={article.id}
            newsSlug={slug}
            newsTitle={article.title}
            shareLocation="article_footer"
          />
        </div>

        {/* Preparation CTA box — renders between the article body/source and
            the related-content section. Reads cta_config from the article row
            (null on legacy rows → renders nothing) and resolves each button's
            href against the LIVE related set below, so a removed relation
            automatically drops its button. The box hides entirely when
            disabled or when no button resolves. */}
        <NewsCtaBox
          config={article.cta_config}
          newsId={article.id}
          newsSlug={slug}
          relatedPackages={related.packages}
          relatedSummaries={related.summaries}
        />

        {/* Social Follow CTA box */}
        <NewsSocialFollowBox
          heading={socialFollowPlacement.heading}
          description={socialFollowPlacement.description}
          channels={resolvedSocialChannels}
          contentId={article.slug}
        />
      </article>

      {/* Affiliate recommendation sidebar / inline block. Rendered only when
          the article opted in AND the assigned collection has published
          products (AffiliateRail + the fetch above already guarantee empty →
          nothing). Sits AFTER the Sobdai CTA zone and BEFORE Related content
          in DOM order, so the mobile reading hierarchy needs no CSS hacks. */}
      {affiliateProducts.length > 0 && (
        <aside className="news-detail-aside" aria-label="สินค้าแนะนำจากพันธมิตร">
          <AffiliateRail
            products={affiliateProducts}
            collectionId={article.affiliate_collection_id}
            contentType="news"
            contentSlug={slug}
            sidebarMinWidthPx={AFFILIATE_SIDEBAR_MIN_WIDTH_PX}
          />
        </aside>
      )}
      </div>

      {/* Trailing editorial block — Related content, back link, prev/next.
          Kept out of the layout grid: on wide viewports it re-centers under
          the main column; on narrow ones it simply follows the aside. */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* Related content — the conversion path (News → Package → Summary).
            Editor-curated via news_packages / news_summaries. Renders NOTHING
            when there are no relations (no empty boxes). Cards are reused: */}
        {(related.packages.length > 0 || related.summaries.length > 0) && (
          <section
            aria-label="เนื้อหาที่เกี่ยวข้อง"
            style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)' }}
          >
            <h2
              className="font-display"
              style={{
                fontSize: 'clamp(20px, 3vw, 26px)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 20,
              }}
            >
              เนื้อหาที่เกี่ยวข้อง
            </h2>

            {/* Related Packages */}
            {related.packages.length > 0 && (
              <div style={{ marginBottom: related.summaries.length > 0 ? 32 : 0 }}>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--gold-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 14,
                  }}
                >
                  แพ็กเกจข้อสอบที่เกี่ยวข้อง
                </h3>
                {/* PackageCard reused verbatim — same component as /packages. */}
                <div className="news-related-packages">
                  {related.packages.map((pkg, i) => (
                    <PackageCard key={pkg.id} pkg={pkg} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Related Summaries */}
            {related.summaries.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--gold-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 14,
                  }}
                >
                  สรุปที่เกี่ยวข้อง
                </h3>
                {/* ContentCard reused verbatim — same component + prop shape as
                    the summary list in SummaryNavigation. */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {related.summaries.map(s => (
                    <ContentCard
                      key={s.summaryId}
                      href={s.href}
                      title={s.title}
                      meta={[
                        {
                          icon: <Clock size={11} aria-hidden />,
                          text: `${s.readTimeMinutes || 5} นาที`,
                        },
                        ...(s.topic ? [{ text: s.topic }] : []),
                      ]}
                      badge={{ label: 'พร้อมเรียน', tone: 'success' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Back to list */}
        <div style={{ marginTop: 40 }}>
          <Link
            href="/news"
            className="btn-outline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              fontSize: 14,
            }}
          >
            <ArrowLeft size={15} aria-hidden />
            กลับไปยังรายการข่าว
          </Link>
        </div>

        {/* Prev / Next navigation (older / newer) */}
        {(older || newer) && (
          <nav
            aria-label="การนำทางข่าวก่อนหน้า/ถัดไป"
            style={{
              marginTop: 32,
              paddingTop: 24,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 12,
              }}
              className="news-prevnext-grid"
            >
              {older ? (
                <Link
                  href={`/news/${older.slug}`}
                  className="news-prevnext-card focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-card)',
                    transition: 'border-color 0.2s, background-color 0.2s',
                  }}
                >
                  <ArrowLeft size={16} style={{ color: 'var(--gold-muted)', flexShrink: 0 }} aria-hidden />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                        marginBottom: 2,
                      }}
                    >
                      ข่าวก่อนหน้า
                    </span>
                    <span
                      className="line-clamp-2 sm:line-clamp-3 break-words text-sm font-semibold text-[var(--text-primary)]"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        lineHeight: 1.4,
                      }}
                    >
                      {older.title}
                    </span>
                  </span>
                </Link>
              ) : (
                <div aria-hidden style={{ minHeight: 0 }} />
              )}

              {newer ? (
                <Link
                  href={`/news/${newer.slug}`}
                  className="news-prevnext-card focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-card)',
                    transition: 'border-color 0.2s, background-color 0.2s',
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                        marginBottom: 2,
                      }}
                    >
                      ข่าวถัดไป
                    </span>
                    <span
                      className="line-clamp-2 sm:line-clamp-3 break-words text-sm font-semibold text-[var(--text-primary)]"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        lineHeight: 1.4,
                      }}
                    >
                      {newer.title}
                    </span>
                  </span>
                  <ArrowRight size={16} style={{ color: 'var(--gold-muted)', flexShrink: 0 }} aria-hidden />
                </Link>
              ) : (
                <div aria-hidden style={{ minHeight: 0 }} />
              )}
            </div>
          </nav>
        )}
      </div>

      {/* Responsive: side-by-side prev/next on wider screens.
          Kept out of inline styles (container queries / sm breakpoint) by a
          tiny scoped style block — the repo uses a globals.css for tokens but
          per-route responsive tweaks via a <style> are already used elsewhere
          for one-off layout rules. */}
      <style>{`
        @media (min-width: 640px) {
          .news-prevnext-grid { grid-template-columns: 1fr 1fr !important; align-items: stretch; }
          .news-prevnext-card:hover { border-color: var(--gold-muted) !important; background-color: var(--bg-card-hover) !important; }
        }
        .news-prevnext-card:hover { border-color: var(--gold-muted); background-color: var(--bg-card-hover); }
        /* Related-packages grid: mirrors /packages (auto-fill, min 300px) so a
           single related package spans full width and several wrap into a row. */
        .news-related-packages {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        /* Affiliate two-zone layout (M1). Mobile-first: the aside flows inline
           with the article's own gutters. At >= 1180px the wrapper becomes a
           centered two-column grid — the editorial column keeps its exact
           800px width (never squeezed), the sidebar is a 300px visually
           secondary column, sticky within the grid so it stops before the
           trailing Related block naturally (align-items: start is required for
           sticky grid items). MUST stay in sync with
           AFFILIATE_SIDEBAR_MIN_WIDTH_PX above. */
        .news-detail-aside { margin-top: 48px; padding: 0 20px; }
        @media (min-width: 1180px) {
          .news-detail-layout {
            display: grid;
            grid-template-columns: minmax(0, 800px) 300px;
            column-gap: 40px;
            justify-content: center;
            align-items: start;
          }
          .news-detail-aside {
            margin-top: 0;
            padding: 32px 0 0;
            position: sticky;
            top: 24px;
            max-height: calc(100vh - 48px);
            overflow-y: auto;
          }
        }
      `}</style>
    </div>
  )
}
