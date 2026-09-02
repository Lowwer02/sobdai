import React from 'react'
import Link from 'next/link'
import HeroPackageSearch, { type HeroSearchChip } from '@/components/HeroPackageSearch'
import HomeHeroPreview from './HomeHeroPreview'
import type { HomepageHero } from '@/lib/homepageConfig'

interface HomeHeroProps {
  hero: HomepageHero
  searchChips: HeroSearchChip[]
}

export default function HomeHero({ hero, searchChips }: HomeHeroProps) {
  return (
    <section
      style={{
        position: 'relative',
        padding: '64px 20px 72px',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '840px',
          height: '520px',
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        style={{
          maxWidth: '1160px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
          gap: '48px',
          alignItems: 'center',
        }}
      >
        {/* Left Column: Clear Reading Order (H1 -> Value Prop -> CTAs -> Search -> Chips) */}
        <div>
          {/* Badge */}
          <div style={{ marginBottom: '18px' }}>
            <span
              className="badge badge-gold"
              style={{
                fontSize: '12px',
                padding: '4px 14px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {hero.badge || 'คลังข้อสอบราชการ'}
            </span>
          </div>

          {/* 1. H1 SEO Anchor */}
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(32px, 5.5vw, 52px)',
              lineHeight: 1.18,
              marginBottom: '18px',
              color: 'var(--text-primary)',
              letterSpacing: '0.01em',
              whiteSpace: 'pre-line',
            }}
          >
            {hero.title || 'แนวข้อสอบราชการออนไลน์\nพร้อมเฉลยละเอียดทุกข้อ'}
          </h1>

          {/* 2. Concise Value Proposition */}
          <p
            style={{
              fontSize: '16px',
              color: 'var(--text-secondary)',
              lineHeight: 1.65,
              marginBottom: '28px',
              maxWidth: '520px',
              whiteSpace: 'pre-line',
            }}
          >
            {hero.subtitle ||
              'ฝึกทำแนวข้อสอบราชการออนไลน์ทีละข้อ ตรงตามระเบียบการสอบจริง พร้อมระบบเฉลยละเอียด วิเคราะห์จุดอ่อน และเตรียมสอบราชการได้อย่างมั่นใจ'}
          </p>

          {/* 3. Primary / Secondary Action CTAs */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '32px',
            }}
          >
            <Link
              href="/packages"
              className="btn-primary"
              style={{
                padding: '13px 28px',
                fontSize: '15px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{hero.browse_cta_label || 'ดูชุดข้อสอบทั้งหมด'}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>

            <a
              href="#showcase"
              className="btn-outline"
              style={{
                padding: '12px 24px',
                fontSize: '14.5px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>ดูตัวอย่างระบบ</span>
            </a>
          </div>

          {/* 4. Search Input with Dynamic Position Chips */}
          <div style={{ maxWidth: '520px' }}>
            <HeroPackageSearch
              chips={searchChips}
              placeholder={hero.search_placeholder}
              chipLabel={hero.search_chip_label}
            />
          </div>
        </div>

        {/* Right Column: High-Prominence Representative UI Demonstration */}
        <div>
          <HomeHeroPreview />
        </div>
      </div>
    </section>
  )
}
