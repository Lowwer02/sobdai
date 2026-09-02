import React from 'react'
import Link from 'next/link'
import type { HomepageCta } from '@/lib/homepageConfig'

interface HomeFinalCTAProps {
  cta: HomepageCta
}

export default function HomeFinalCTA({ cta }: HomeFinalCTAProps) {
  return (
    <section style={{ padding: '72px 20px 120px' }}>
      <div
        className="card-gold"
        style={{
          maxWidth: '860px',
          margin: '0 auto',
          padding: '64px 40px',
          textAlign: 'center',
          borderRadius: 'var(--radius-xl)',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(145deg, rgba(30, 21, 14, 0.98) 0%, rgba(18, 12, 8, 0.98) 100%)',
          border: '1px solid rgba(212, 168, 67, 0.35)',
          boxShadow: '0 20px 56px rgba(0, 0, 0, 0.75), 0 0 40px rgba(212, 168, 67, 0.12)',
        }}
      >
        {/* Ambient background glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-40%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '500px',
            height: '350px',
            background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.14) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Brand Insignia / Shield Badge */}
        <div style={{ marginBottom: '20px' }}>
          <span
            className="badge badge-gold"
            style={{
              fontSize: '12.5px',
              padding: '5px 16px',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            ก้าวสู่ข้าราชการอย่างมั่นใจ
          </span>
        </div>

        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(28px, 5vw, 44px)',
            marginBottom: '16px',
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            letterSpacing: '0.01em',
          }}
        >
          {cta.final_title || 'พร้อมเริ่มเตรียมสอบและพัฒนาตัวเองแล้วใช่ไหม?'}
        </h2>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '16.5px',
            maxWidth: '540px',
            margin: '0 auto 36px',
            lineHeight: 1.65,
          }}
        >
          {cta.final_subtitle || 'เลือกชุดข้อสอบตำแหน่งที่ต้องการ แล้วเริ่มฝึกทำข้อสอบได้ทันที'}
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '14px',
            alignItems: 'center',
          }}
        >
          <Link
            href="/packages"
            className="btn-primary animate-pulse-gold"
            style={{
              padding: '14px 36px',
              fontSize: '16px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>ดูชุดข้อสอบทั้งหมด</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>

          <a
            href="#showcase"
            className="btn-outline"
            style={{
              padding: '13px 26px',
              fontSize: '15px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>ดูตัวอย่างระบบ</span>
          </a>
        </div>
      </div>
    </section>
  )
}
