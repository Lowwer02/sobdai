import Link from 'next/link'
import Image from 'next/image'
import { Calendar, ArrowRight } from 'lucide-react'
import type { GpExamRequirement } from '@/lib/news'
import GpExamRequirementBadge from './GpExamRequirementBadge'

/**
 * Public News card (Server Component).
 *
 * Mirrors the public design language of PackageCard: a `.card` surface with the
 * gold/cream tokens (via CSS variables), a `fadeInUp` stagger, and the whole
 * card wrapped in a `<Link>` to the detail route. Built as a Server Component
 * (no interactivity, no 'use client') so the list stays crawlable + cheap.
 *
 * Distinct from the admin list, which renders a compact table row — this is the
 * visitor/Google surface.
 *
 * Heading note: the title is an <h2>. The page hero owns the single <h1>, and
 * every card is a peer entry under it. The excerpt is a <p>, the date is a
 * <time datetime=...> for semantic correctness.
 */

export interface NewsCardData {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  published_at: string | null
  /** ภาค ก. requirement (tri-state). Optional so a list query that hasn't been
   *  updated to select it still type-checks; treated as 'unspecified' when absent. */
  gp_exam_requirement?: GpExamRequirement
}

interface NewsCardProps {
  article: NewsCardData
  index?: number
  onClick?: () => void
}

/** Thai-locale date string (matches the admin list's fmtDate convention). */
function formatDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function NewsCard({ article, index = 0, onClick }: NewsCardProps) {
  const href = `/news/${article.slug}`
  const dateLabel = formatDate(article.published_at)
  const category = article.category || null

  return (
    <Link
      href={href}
      style={{ textDecoration: 'none', display: 'flex', height: '100%' }}
      aria-label={article.title}
      onClick={onClick}
    >
      <article
        className="card group"
        style={{
          padding: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          animation: `fadeInUp 0.4s ease ${index * 0.06}s both`,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Cover image — 16:9. Fill is avoided (no public precedent uses fill);
            a fixed-aspect box keeps layout stable while the image is lazy. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            backgroundColor: 'var(--bg-card-2)',
            overflow: 'hidden',
          }}
        >
          {article.cover_image_url ? (
            <Image
              src={article.cover_image_url}
              alt={article.cover_image_alt || article.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 360px"
              style={{ objectFit: 'cover' }}
              // First row (index 0–2) is above the fold on desktop; let those
              // load eagerly. Everything else is lazy by default.
              priority={index < 3}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-base) 100%)',
              }}
            >
              <Calendar size={28} style={{ color: 'var(--gold-muted)' }} aria-hidden />
            </div>
          )}

          {/* Category badge over the cover */}
          {category && (
            <span
              className="badge badge-gold"
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                fontSize: '11px',
                padding: '3px 10px',
                letterSpacing: '0.03em',
                backdropFilter: 'blur(4px)',
              }}
            >
              {category}
            </span>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            padding: '18px 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          {/* Published date + ภาค ก. requirement badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px 10px',
              marginBottom: '8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={12} aria-hidden />
              <time dateTime={article.published_at || undefined}>{dateLabel}</time>
            </div>
            {article.gp_exam_requirement && (
              <GpExamRequirementBadge value={article.gp_exam_requirement} />
            )}
          </div>

          {/* Title */}
          <h2
            className="group-hover:text-[var(--gold-light)] transition-colors duration-200"
            style={{
              fontSize: '17px',
              fontWeight: 600,
              lineHeight: 1.4,
              color: 'var(--text-primary)',
              marginBottom: '8px',
              // Clamp to 3 lines so cards in a row stay equal height.
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {article.title}
          </h2>

          {/* Excerpt */}
          {article.excerpt && (
            <p
              style={{
                fontSize: '13.5px',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                marginBottom: '16px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {article.excerpt}
            </p>
          )}

          {/* Read more */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--gold-light)',
            }}
          >
            <span>อ่านต่อ</span>
            <ArrowRight
              size={14}
              className="transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden
            />
          </div>
        </div>
      </article>
    </Link>
  )
}
