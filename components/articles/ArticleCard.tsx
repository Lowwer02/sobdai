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
      className="group block h-full text-decoration-none focus:outline-none focus:ring-2 focus:ring-brand rounded-xl"
      aria-label={article.title}
    >
      <article
        className="bg-card border border-brand/20 hover:border-brand/60 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full group"
        style={{
          animation: `fadeInUp 0.4s ease ${index * 0.05}s both`,
        }}
      >
        {/* Cover Image Container */}
        <div className="relative aspect-video w-full bg-surface-muted overflow-hidden shrink-0">
          {article.cover_image_url ? (
            <Image
              src={article.cover_image_url}
              alt={article.cover_image_alt || article.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-surface-muted to-background text-muted-foreground/40 p-4">
              <FileText size={40} className="mb-2 text-brand/30" />
              <span className="text-xs font-mono text-muted-foreground/50">Sobdai Articles</span>
            </div>
          )}

          {article.category && (
            <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none">
              <span className="inline-block max-w-full truncate px-2.5 py-1 text-[11px] font-semibold bg-surface-muted/80 backdrop-blur border border-brand/40 text-brand rounded-md shadow">
                {article.category}
              </span>
            </div>
          )}
        </div>

        {/* Card Content Body */}
        <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between space-y-3">
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-foreground group-hover:text-brand transition-colors line-clamp-2 leading-snug">
              {article.title}
            </h2>

            {article.excerpt && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {article.excerpt}
              </p>
            )}
          </div>

          {/* Card Footer Meta */}
          <div className="pt-3 border-t border-brand/10 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-brand" />
              <time dateTime={article.published_at}>{dateLabel}</time>
            </div>

            <span className="inline-flex items-center gap-1 text-brand font-semibold group-hover:translate-x-1 transition-transform">
              อ่านต่อ <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
