import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
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
import { createPageMetadata } from '@/lib/seo'
import { buildNewsMetadata } from '@/lib/news'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'

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
      'id, slug, title, excerpt, body_markdown, cover_image_url, cover_image_alt, category, tags, status, published_at, updated_at, source_name, source_url, source_date, seo_title, seo_description, canonical_url, og_image_url, created_at'
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data as NewsDetailRow | null
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
  // Missing or not published → 404 (custom not-found page).
  if (!article) notFound()
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

  return (
    <div style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <article style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 80px' }}>
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
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              {article.category && (
                <span
                  className="badge badge-gold"
                  style={{ fontSize: 11, padding: '3px 10px', letterSpacing: '0.03em' }}
                >
                  {article.category}
                </span>
              )}
              {tags.map(tag => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <TagIcon size={10} aria-hidden />
                  {tag}
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
          </div>
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
                      style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
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
                      style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
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
      </article>

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
      `}</style>
    </div>
  )
}
