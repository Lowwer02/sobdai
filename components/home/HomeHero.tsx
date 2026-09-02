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
        padding: '56px 20px 64px',
        overflow: 'hidden',
      }}
    >
      {/* Top ambient radial gradient */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '480px',
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.09) 0%, transparent 70%)',
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
          gap: '40px',
          alignItems: 'center',
        }}
      >
        {/* Left Column: Value Proposition & Discovery */}
        <div>
          {/* Badge */}
          <div style={{ marginBottom: '16px' }}>
            <span
              className="badge badge-gold"
              style={{
                fontSize: '12.5px',
                padding: '4px 14px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {hero.badge || 'คลังข้อสอบราชการ'}
            </span>
          </div>

          {/* H1 SEO Anchor */}
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(32px, 5.5vw, 54px)',
              lineHeight: 1.18,
              marginBottom: '18px',
              color: 'var(--text-primary)',
              letterSpacing: '0.01em',
              whiteSpace: 'pre-line',
            }}
          >
            {hero.title || 'แนวข้อสอบราชการออนไลน์\nพร้อมเฉลยละเอียดทุกข้อ'}
          </h1>

          {/* Subtitle */}
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
              'ฝึกทำข้อสอบตรงตามระเบียบการสอบราชการทีละข้อ พร้อมระบบเฉลยละเอียด วิเคราะห์จุดอ่อน และวางแผนทบทวนได้ตรงจุด'}
          </p>

          {/* Action CTAs */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '28px',
            }}
          >
            <Link
              href="/packages"
              className="btn-primary"
              style={{
                padding: '12px 26px',
                fontSize: '15px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{hero.browse_cta_label || 'ดูชุดข้อสอบทั้งหมด'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>

            <a
              href="#showcase"
              className="btn-outline"
              style={{
                padding: '11px 22px',
                fontSize: '14.5px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>ดูตัวอย่างระบบ</span>
            </a>
          </div>

          {/* Keyword Search & Chips */}
          <div style={{ maxWidth: '520px', marginBottom: '24px' }}>
            <HeroPackageSearch
              chips={searchChips}
              placeholder={hero.search_placeholder}
              chipLabel={hero.search_chip_label}
            />
          </div>

          {/* Micro Trust Bullets */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              fontSize: '12.5px',
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-card)',
              paddingTop: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>เฉลยละเอียดอธิบายทุกข้อ</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>มีคำใบ้ช่วยคิด</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>วิเคราะห์จุดอ่อนอัตโนมัติ</span>
            </div>
          </div>
        </div>

        {/* Right Column: High-Fidelity UI Demonstration Preview */}
        <div>
          <HomeHeroPreview />
        </div>
      </div>
    </section>
  )
}
