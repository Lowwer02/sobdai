import React from 'react'
import type { NewsCardData } from '@/components/news/NewsCard'
import HomepageNewsCard from '@/components/news/HomepageNewsCard'
import HomepageNewsViewAllLink from '@/components/news/HomepageNewsViewAllLink'
import type { LatestNewsSettings } from '@/lib/homepageConfig'

interface HomeLatestNewsProps {
  news: NewsCardData[]
  config: LatestNewsSettings
}

export default function HomeLatestNews({ news, config }: HomeLatestNewsProps) {
  if (!news || news.length === 0) return null

  return (
    <section
      id="news"
      style={{
        padding: '40px 20px 80px',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div>
          <div style={{ marginBottom: '8px' }}>
            <span
              className="badge badge-gold"
              style={{ fontSize: '11.5px', padding: '3px 10px' }}
            >
              ข่าวสารการสอบ
            </span>
          </div>
          <h2
            className="font-display"
            style={{
              fontSize: 'clamp(22px, 3.5vw, 32px)',
              marginBottom: '6px',
              color: 'var(--text-primary)',
            }}
          >
            {config.title || 'ข่าวและประกาศล่าสุด'}
          </h2>
          {config.subtitle && (
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', margin: 0 }}>
              {config.subtitle}
            </p>
          )}
        </div>
        <HomepageNewsViewAllLink label={config.cta_label || 'ดูข่าวทั้งหมด'} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: '20px',
        }}
      >
        {news.map((article, i) => (
          <HomepageNewsCard
            key={article.id}
            article={article}
            index={i}
            position={i + 1}
          />
        ))}
      </div>
    </section>
  )
}
