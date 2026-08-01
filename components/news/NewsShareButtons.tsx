'use client'

import { absoluteUrl } from '@/lib/seo'
import { trackNewsShareClick } from '@/lib/analytics'

interface NewsShareButtonsProps {
  newsId: string
  newsSlug: string
  newsTitle: string
  shareLocation?: 'article_header' | 'article_footer'
}

export default function NewsShareButtons({
  newsId,
  newsSlug,
  newsTitle,
  shareLocation = 'article_header',
}: NewsShareButtonsProps) {
  const articleUrl = absoluteUrl(`/news/${newsSlug}`)
  const encodedUrl = encodeURIComponent(articleUrl)
  const encodedTitle = encodeURIComponent(newsTitle)

  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
  const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodedUrl}&text=${encodedTitle}`

  const handleShareClick = (platform: 'facebook' | 'line') => {
    try {
      trackNewsShareClick({
        news_id: newsId,
        news_slug: newsSlug,
        platform,
        share_location: shareLocation,
        destination_url: articleUrl,
      })
    } catch {
      // Analytics failure must not block sharing
    }
  }

  const btnClass =
    'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--gold-light)] bg-[var(--gold-tint)] border border-[rgba(212,168,67,0.25)] hover:bg-[rgba(212,168,67,0.2)] hover:border-[#D4AF37]/40 transition-colors'

  return (
    <div className="flex items-center flex-wrap gap-2.5 mt-4 pt-4 border-t border-[var(--border)]">
      <span className="text-xs font-medium text-[var(--text-muted)]">แชร์ข่าวนี้:</span>
      <div className="flex items-center gap-2">
        <a
          href={facebookShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="แชร์ข่าวนี้ไปยัง Facebook"
          onClick={() => handleShareClick('facebook')}
          className={btnClass}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Facebook
        </a>
        <a
          href={lineShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="แชร์ข่าวนี้ไปยัง LINE"
          onClick={() => handleShareClick('line')}
          className={btnClass}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63h-2.425v1.125h2.425c.349 0 .63.285.63.631 0 .348-.281.63-.63.63h-3.055c-.349 0-.63-.285-.63-.63V7.708c0-.349.281-.63.63-.63h3.055c.349 0 .63.285.63.63 0 .349-.281.63-.63.63h-2.425v1.125h2.425zm-3.778-2.785c.349 0 .63.285.63.63v4.542c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V7.708c0-.349.281-.63.63-.63zm-2.915 0c.349 0 .63.285.63.63v2.859l2.003-2.678c.118-.157.304-.251.502-.251.349 0 .63.285.63.631v4.542c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.895l-2.003 2.678c-.118.157-.304.251-.502.251-.349 0-.63-.282-.63-.63V7.708c0-.349.281-.63.63-.63zM6.88 7.078c.349 0 .63.285.63.63v3.912h2.425c.349 0 .63.285.63.631 0 .348-.281.63-.63.63H6.25c-.349 0-.63-.285-.63-.63V7.708c0-.349.281-.63.63-.63zm15.12 4.922c0-4.417-4.477-8-10-8s-10 3.583-10 8c0 3.957 3.565 7.266 8.384 7.886.326.07.769.216.882.496.101.25.066.642.032.895-.07.518-.32 2.019-.349 2.18-.049.274-.226 1.07.935.584 1.161-.486 6.262-3.687 8.544-6.312 1.054-1.189 1.572-2.457 1.572-3.729z" />
          </svg>
          LINE
        </a>
      </div>
    </div>
  )
}
