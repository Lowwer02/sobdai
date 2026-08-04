import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface ArticlePaginationProps {
  currentPage: number
  totalPages: number
  category?: string
  tag?: string
  search?: string
}

export function buildArticlePageHref(
  page: number,
  search?: string,
  category?: string,
  tag?: string
): string {
  const params = new URLSearchParams()
  if (search && search.trim()) params.set('q', search.trim())
  if (category && category.trim()) params.set('category', category.trim())
  if (tag && tag.trim()) params.set('tag', tag.trim())
  if (page > 1) params.set('page', String(page))

  const qs = params.toString()
  return qs ? `/articles?${qs}` : '/articles'
}

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

export default function ArticlePagination({
  currentPage,
  totalPages,
  category,
  tag,
  search,
}: ArticlePaginationProps) {
  if (totalPages <= 1) return null

  const pages = pageWindow(currentPage, totalPages)
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  return (
    <nav
      aria-label="การแบ่งหน้าบทความ"
      className="flex items-center justify-center gap-1.5 sm:gap-2 my-8 flex-wrap"
    >
      {/* Previous Button */}
      {hasPrev ? (
        <Link
          href={buildArticlePageHref(currentPage - 1, search, category, tag)}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#F5E9D6] bg-[#1A140E] border border-[#D4AF37]/30 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">ก่อนหน้า</span>
        </Link>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#A1866B]/40 bg-[#0F0B07] border border-white/5 rounded-lg cursor-not-allowed"
          aria-disabled="true"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">ก่อนหน้า</span>
        </span>
      )}

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {pages.map((p, idx) => {
          if (p === 'ellipsis') {
            return (
              <span key={`ellipsis-${idx}`} className="px-2 text-xs text-[#A1866B]">
                …
              </span>
            )
          }

          const isCurrent = p === currentPage
          if (isCurrent) {
            return (
              <span
                key={p}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xs font-bold text-[#0F0B07] bg-[#D4AF37] border border-[#D4AF37] rounded-lg shadow-md"
                aria-current="page"
              >
                {p}
              </span>
            )
          }

          return (
            <Link
              key={p}
              href={buildArticlePageHref(p, search, category, tag)}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xs font-semibold text-[#F5E9D6] bg-[#1A140E] border border-[#D4AF37]/20 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
              aria-label={`หน้า ${p}`}
            >
              {p}
            </Link>
          )
        })}
      </div>

      {/* Next Button */}
      {hasNext ? (
        <Link
          href={buildArticlePageHref(currentPage + 1, search, category, tag)}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#F5E9D6] bg-[#1A140E] border border-[#D4AF37]/30 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
          aria-label="หน้าถัดไป"
        >
          <span className="hidden sm:inline">ถัดไป</span>
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#A1866B]/40 bg-[#0F0B07] border border-white/5 rounded-lg cursor-not-allowed"
          aria-disabled="true"
        >
          <span className="hidden sm:inline">ถัดไป</span>
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  )
}
