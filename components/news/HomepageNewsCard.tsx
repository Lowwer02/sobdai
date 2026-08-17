'use client'

import NewsCard, { type NewsCardData } from '@/components/news/NewsCard'
import { trackHomepageNewsClick } from '@/lib/analytics'

interface HomepageNewsCardProps {
  article: NewsCardData
  index: number
  position: number
}

export default function HomepageNewsCard({ article, index, position }: HomepageNewsCardProps) {
  const handleClick = () => {
    try {
      trackHomepageNewsClick({
        news_id: article.id,
        news_slug: article.slug,
        news_title: article.title,
        position,
        section_location: 'homepage_latest_news',
        destination_url: `https://sobdai.com/news/${article.slug}`,
      })
    } catch {
      /* swallow analytics errors */
    }
  }

  // Homepage news strip renders below the fold on mobile and desktop, so no
  // cover should be eager-loaded/preloaded (PERF-P0B-2). /news keeps the
  // default first-row priority via NewsCard's prioritizeFirstRow prop.
  return <NewsCard article={article} index={index} onClick={handleClick} prioritizeFirstRow={false} />
}
