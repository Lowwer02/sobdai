import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Public News pagination (Server Component).
 *
 * Crawl-friendly by design: every page number is a real <Link href> to a
 * distinct URL (`/news?page=2&...`), so search engines can follow the chain
 * and index each page independently. This is the deliberate divergence from the
 * packages catalog, which is ISR + client-side filtering — news list reads
 * searchParams server-side (for the canonical query string) and therefore
 * renders a paginated URL per page rather than slicing a single cached payload.
 *
 * Search/category are preserved across page links so paginating does not drop
 * the active filter. `<link rel="prev|next">` hints themselves live in the
 * page's <head> (the page knows both neighbors); this component renders the
 * visible pager only.
 *
 * Windowing: always show first, last, current, and current ±1; collapse the
 * rest into a single ellipsis per side.
 */

export interface NewsPaginationProps {
  currentPage: number
  totalPages: number
  /** Active search term (preserved across page links). */
  search: string
  /** Active category filter (preserved across page links). */
  category: string
}

/**
 * Build a /news?... href for a given page, preserving the active search +
 * category filters. Pure + exported so the page can reuse it for <head>
 * prev/next link tags without re-deriving the serialization.
 *
 * Page 1 omits the `page` param (canonical first page = bare /news[?q&cat]),
 * avoiding duplicate-content /news?page=1.
 */
export function buildNewsPageHref(page: number, search: string, category: string): string {
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/news?${qs}` : '/news'
}

/** Compute the compact page-number list with ellipsis gaps. */
function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const out: (number | 'ellipsis')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) out.push('ellipsis')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < total - 1) out.push('ellipsis')
  out.push(total)
  return out
}

export default function NewsPagination({
  currentPage,
  totalPages,
  search,
  category,
}: NewsPaginationProps) {
  if (totalPages <= 1) return null

  const pages = pageWindow(currentPage, totalPages)
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  const btnBase: React.CSSProperties = {
    minWidth: 38,
    height: 38,
    padding: '0 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s ease',
  }

  return (
    <nav aria-label="การแบ่งหน้าข่าว" style={{ marginTop: 40 }}>
      <ul
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 8,
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {/* Previous */}
        <li>
          {hasPrev ? (
            <Link
              href={buildNewsPageHref(currentPage - 1, search, category)}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                ...btnBase,
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent',
              }}
              aria-label="หน้าก่อนหน้า"
              rel="prev"
            >
              <ChevronLeft size={16} aria-hidden />
            </Link>
          ) : (
            <span
              style={{
                ...btnBase,
                color: 'var(--text-faint)',
                backgroundColor: 'transparent',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
              aria-hidden
            >
              <ChevronLeft size={16} />
            </span>
          )}
        </li>

        {/* Page numbers */}
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <li
              key={`e-${i}`}
              style={{
                ...btnBase,
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'default',
              }}
              aria-hidden
            >
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={buildNewsPageHref(p, search, category)}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                style={
                  p === currentPage
                    ? {
                        ...btnBase,
                        color: 'var(--bg-base)',
                        backgroundColor: 'var(--gold-light)',
                        borderColor: 'var(--gold-light)',
                      }
                    : {
                        ...btnBase,
                        color: 'var(--text-secondary)',
                        backgroundColor: 'transparent',
                      }
                }
                aria-label={`หน้า ${p}`}
                aria-current={p === currentPage ? 'page' : undefined}
              >
                {p}
              </Link>
            </li>
          )
        )}

        {/* Next */}
        <li>
          {hasNext ? (
            <Link
              href={buildNewsPageHref(currentPage + 1, search, category)}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                ...btnBase,
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent',
              }}
              aria-label="หน้าถัดไป"
              rel="next"
            >
              <ChevronRight size={16} aria-hidden />
            </Link>
          ) : (
            <span
              style={{
                ...btnBase,
                color: 'var(--text-faint)',
                backgroundColor: 'transparent',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
              aria-hidden
            >
              <ChevronRight size={16} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
