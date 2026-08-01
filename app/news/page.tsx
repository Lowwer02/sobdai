import { Suspense } from 'react'
import Link from 'next/link'
import { Newspaper, SearchX, AlertTriangle, ArrowRight } from 'lucide-react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { createPageMetadata } from '@/lib/seo'
import NewsCard from '@/components/news/NewsCard'
import NewsPagination, { buildNewsPageHref } from '@/components/news/NewsPagination'
import NewsListControls from '@/components/news/NewsListControls'

/**
 * Public Government News list (`/news`) — Server Component.
 *
 * The visitor + Google surface for news. Mirrors the established public-list
 * convention (app/packages/page.tsx) but adapts it for news's shape:
 *
 *   - CLIENT: createAnonServerClient() — cookie-free, so the route stays
 *     cacheable and reads respect the `news` RLS policy "Public can read
 *     published news." (status = 'published'). We add an explicit
 *     .eq('status','published') as a second guard, exactly like packages adds
 *     .eq('is_published', true) on top of its own RLS.
 *   - PAGINATION: crawl-friendly. Each page is a distinct URL (/news?page=2…)
 *     rendered server-side with real <Link>s (see NewsPagination). This
 *     deliberately reads searchParams, which opts the route into dynamic
 *     rendering — so, unlike /packages, we do NOT set `revalidate` here
 *     (mixing the two is a footgun and the dynamic read is the point).
 *   - SEARCH SANITIZATION: the admin list interpolates the raw query into the
 *     PostgREST `.or()` string because it sits behind auth. The public anon
 *     client cannot trust input, so sanitizeSearchTerm() strips filter-syntax
 *     metacharacters (',', '.', '(', ')', quotes) before interpolation to
 *     prevent filter injection. Thai text is unaffected.
 *   - SCOPE: categories are derived from PUBLISHED articles only (admin derives
 *     from all rows), so visitors never see a filter option that yields zero
 *     public results.
 *
 * Heading hierarchy: one <h1> in the hero; each card title is an <h2>.
 * JSON-LD is still out of scope (separate task).
 */

// Static list metadata (no per-row data needed). The canonical is the bare
// /news path so paginated/search URLs collapse to the hub for indexing,
// matching how the packages catalog canonicalizes to /packages.
export const metadata = createPageMetadata({
  title: 'ข่าวสารจากหน่วยงานราชการ | Sobdai',
  description:
    'ประกาศ ข่าวสาร และข้อมูลอัปเดตจากหน่วยงานราชการ เพื่อการเตรียมสอบข้าราชการ — รวบรวมข่าวและประกาศล่าสุดจากทุกกรม',
  path: '/news',
})

const PAGE_SIZE = 9

/** Strip PostgREST `.or()` filter-syntax metacharacters from public input. */
function sanitizeSearchTerm(raw: string): string {
  if (!raw) return ''
  // Remove characters that have structural meaning inside a PostgREST filter
  // value: condition separator (,), operator/field separator (.), grouping
  // parens, and quotes. Keeps Thai + alphanumerics + spaces + dashes.
  const cleaned = raw.replace(/[,.()'"\[\]\\]/g, '').replace(/\s+/g, ' ').trim()
  // Hard cap; the ilike pattern is cheap but don't let a paste blow it up.
  return cleaned.slice(0, 100)
}

interface NewsRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  published_at: string | null
  gp_exam_requirement?: import('@/lib/news').GpExamRequirement
}

export default async function NewsListPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page) || 1) : 1
  const search = sanitizeSearchTerm(typeof params.q === 'string' ? params.q : '')
  // Category values are free-text; only apply the filter if non-empty (the
  // select options themselves are derived server-side from published rows, so
  // any value here corresponds to a real public category or is a no-op).
  const category = typeof params.category === 'string' ? params.category.trim().slice(0, 80) : ''

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let news: NewsRow[] = []
  let total = 0
  let categories: string[] = []
  let fetchError = false

  try {
    const supabase = createAnonServerClient()

    // --- main list query (published only) ---
    let query: any = supabase
      .from('news')
      .select(
        'id, slug, title, excerpt, cover_image_url, cover_image_alt, category, published_at, created_at, updated_at, gp_exam_requirement',
        { count: 'exact' }
      )
      .eq('status', 'published')

    if (search) {
      // Sanitized above; safe to interpolate into the .or() filter string.
      query = query.or(
        `title.ilike.%${search}%,excerpt.ilike.%${search}%,slug.ilike.%${search}%`
      )
    }
    if (category) {
      query = query.eq('category', category)
    }

    query = query
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count } = await query
    news = (data ?? []) as NewsRow[]
    total = count ?? 0

    // --- category facet (published scope only) ---
    // The generated client narrows `.select('category').not(...)` into a row
    // type the downstream Array/Set helpers can't satisfy, so type the rows
    // explicitly here before deriving the distinct list (mirrors the main
    // query's pragmatic typing).
    const { data: catRows } = await supabase
      .from('news')
      .select('category')
      .eq('status', 'published')
      .not('category', 'is', null)
    const rows: { category: string | null }[] = (catRows ?? []) as { category: string | null }[]
    categories = Array.from(
      new Set(rows.map(r => r.category).filter((c): c is string => !!c))
    ).sort((a, b) => a.localeCompare(b))
  } catch (err) {
    console.error('Public news list fetch failed:', err)
    fetchError = true
  }

  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 0
  // Clamp an out-of-range ?page= so the pager + count stay consistent.
  const safePage = Math.min(page, Math.max(1, totalPages || 1))
  const hasFilters = Boolean(search) || Boolean(category)

  // prev/next hrefs for crawl hints (visible pager also carries rel=prev/next).
  const prevHref = safePage > 1 ? buildNewsPageHref(safePage - 1, search, category) : null
  const nextHref = safePage < totalPages ? buildNewsPageHref(safePage + 1, search, category) : null

  return (
    <div
      style={{
        minHeight: '70vh',
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px' }}>
        {/* Hero — owns the single <h1> */}
        <header style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              marginBottom: 10,
              background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ข่าวสารจากหน่วยงานราชการ
          </h1>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 15,
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            ประกาศ ข่าวสาร และข้อมูลอัปเดตจากหน่วยงานราชการ เพื่อการเตรียมสอบข้าราชการ
          </p>
        </header>

        {/* Error state */}
        {fetchError ? (
          <div className="card" style={{ padding: '42px 20px', textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--red-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--red)',
                margin: '0 auto 20px',
              }}
            >
              <AlertTriangle size={30} strokeWidth={1.6} aria-hidden />
            </div>
            <h2
              className="font-display"
              style={{ fontSize: 20, marginBottom: 8, color: 'var(--text-primary)' }}
            >
              ไม่สามารถโหลดข่าวได้
            </h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto' }}>
              เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง
            </p>
          </div>
        ) : (
          <>
            {/* Controls (client; Suspense required for useSearchParams) */}
            {total > 0 || hasFilters ? (
              <Suspense fallback={null}>
                <NewsListControls categories={categories} />
              </Suspense>
            ) : null}

            {/* Results count */}
            {(news.length > 0 || hasFilters) && (
              <div
                aria-live="polite"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  marginBottom: 16,
                  fontWeight: 600,
                }}
              >
                <span>
                  {hasFilters
                    ? `พบ ${total} ข่าว`
                    : `แสดงทั้งหมด ${total} ข่าว`}
                </span>
                {totalPages > 1 && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                    หน้า {safePage} / {totalPages}
                  </span>
                )}
              </div>
            )}

            {/* Grid or empty state */}
            {news.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 20,
                }}
              >
                {news.map((article, i) => (
                  <NewsCard key={article.id} article={article} index={i} />
                ))}
              </div>
            ) : (
              // Empty state
              <div className="card" style={{ padding: '42px 20px', textAlign: 'center', minHeight: 300 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--gold-tint)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--gold)',
                    margin: '0 auto 20px',
                  }}
                >
                  {hasFilters ? (
                    <SearchX size={30} strokeWidth={1.6} aria-hidden />
                  ) : (
                    <Newspaper size={30} strokeWidth={1.6} aria-hidden />
                  )}
                </div>
                <h2
                  className="font-display"
                  style={{ fontSize: 20, marginBottom: 8, color: 'var(--text-primary)' }}
                >
                  {hasFilters ? 'ยังไม่พบข่าวที่ตรงกับการค้นหา' : 'ยังไม่มีข่าวในขณะนี้'}
                </h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 22px', lineHeight: 1.65 }}>
                  {hasFilters
                    ? 'ลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่อื่น แล้วลองใหม่อีกครั้ง'
                    : 'ยังไม่มีข่าวที่เผยแพร่ กรุณากลับมาตรวจสอบใหม่อีกครั้ง'}
                </p>
                {hasFilters && (
                  <Link
                    href="/news"
                    className="btn-outline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                    style={{ padding: '10px 22px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    ล้างการค้นหา
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                )}
              </div>
            )}

            {/* Pagination (crawl-friendly <Link>s) + hidden crawl hints */}
            {totalPages > 1 && (
              <>
                <NewsPagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  search={search}
                  category={category}
                />
                {/* Extra crawl hint anchors; visually hidden but indexable.
                    Complements the visible pager's rel=prev/next. */}
                <div aria-hidden style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  {prevHref && <Link href={prevHref} rel="prev">หน้าก่อนหน้า</Link>}
                  {nextHref && <Link href={nextHref} rel="next">หน้าถัดไป</Link>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
