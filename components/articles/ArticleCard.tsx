import Link from 'next/link'
import Image from 'next/image'
import { Calendar, ArrowRight, FileText } from 'lucide-react'
import type { PublicArticleListItem } from '@/lib/articles-public'

interface ArticleCardProps {
  article: PublicArticleListItem
  index?: number
}

function formatDate(s: string | null): string {
  if (!s || typeof s !== 'string') return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function ArticleCard({ article, index = 0 }: ArticleCardProps) {
  const href = `/articles/${article.slug}`
  const dateLabel = formatDate(article.published_at)

  return (
    <Link
      href={href}
      className="group block h-full text-decoration-none focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl"
      aria-label={article.title}
    >
      <article
        className="bg-[#1A140E] border border-[#D4AF37]/20 hover:border-[#D4AF37]/60 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full group"
        style={{
          animation: `fadeInUp 0.4s ease ${index * 0.05}s both`,
        }}
      >
        {/* Cover Image Container */}
        <div className="relative aspect-video w-full bg-[#0F0B07] overflow-hidden shrink-0">
          {article.cover_image_url ? (
            <Image
              src={article.cover_image_url}
              alt={article.cover_image_alt || article.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1F1913] to-[#0F0B07] text-[#A1866B]/40 p-4">
              <FileText size={40} className="mb-2 text-[#D4AF37]/30" />
              <span className="text-xs font-mono text-[#A1866B]/50">Sobdai Articles</span>
            </div>
          )}

          {article.category && (
            <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none">
              <span className="inline-block max-w-full truncate px-2.5 py-1 text-[11px] font-semibold bg-[#0F0B07]/80 backdrop-blur border border-[#D4AF37]/40 text-[#D4AF37] rounded-md shadow">
                {article.category}
              </span>
            </div>
          )}
        </div>

        {/* Card Content Body */}
        <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between space-y-3">
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors line-clamp-2 leading-snug">
              {article.title}
            </h2>

            {article.excerpt && (
              <p className="text-xs sm:text-sm text-[#A1866B] line-clamp-3 leading-relaxed">
                {article.excerpt}
              </p>
            )}
          </div>

          {/* Card Footer Meta */}
          <div className="pt-3 border-t border-[#D4AF37]/10 flex items-center justify-between text-xs text-[#A1866B]">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-[#D4AF37]" />
              <time dateTime={article.published_at}>{dateLabel}</time>
            </div>

            <span className="inline-flex items-center gap-1 text-[#D4AF37] font-semibold group-hover:translate-x-1 transition-transform">
              อ่านต่อ <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
