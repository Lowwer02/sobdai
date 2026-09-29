import Link from 'next/link'
import { ArrowRight, User } from 'lucide-react'
import type { PublicArticleAuthor } from '@/lib/articles'

interface ArticleAuthorCardProps {
  author: PublicArticleAuthor
}

export default function ArticleAuthorCard({ author }: ArticleAuthorCardProps) {
  if (!author || !author.display_name) return null

  const initial = author.display_name.trim().charAt(0).toUpperCase()

  return (
    <section
      aria-label={`ข้อมูลผู้เขียน ${author.display_name}`}
      className="bg-card/80 border border-brand/20 hover:border-brand/35 rounded-2xl p-5 sm:p-7 shadow-lg transition-all"
    >
      <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
        {/* Avatar */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-wash border-2 border-brand/40 flex items-center justify-center shrink-0 text-brand font-bold text-2xl sm:text-3xl overflow-hidden shadow-inner">
          {author.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={author.avatar_url}
              alt={author.display_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : initial ? (
            <span>{initial}</span>
          ) : (
            <User size={28} className="text-brand/70" />
          )}
        </div>

        {/* Author Info */}
        <div className="space-y-2.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              {author.display_name}
            </h3>
            {author.role_title && (
              <span className="inline-block px-2.5 py-0.5 text-xs font-semibold bg-brand-solid/15 border border-brand/30 text-brand rounded-full">
                {author.role_title}
              </span>
            )}
          </div>

          {author.short_bio && (
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {author.short_bio}
            </p>
          )}

          <div className="pt-1">
            <Link
              href={`/authors/${author.slug}`}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-brand hover:text-foreground group transition-colors focus:outline-none focus:ring-1 focus:ring-brand rounded"
            >
              <span>ดูบทความทั้งหมดของผู้เขียน</span>
              <ArrowRight
                size={14}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
