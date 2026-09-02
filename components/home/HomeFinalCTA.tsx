import React from 'react'
import Link from 'next/link'
import type { HomepageCta } from '@/lib/homepageConfig'

interface HomeFinalCTAProps {
  cta: HomepageCta
}

export default function HomeFinalCTA({ cta }: HomeFinalCTAProps) {
  return (
    <section style={{ padding: '40px 20px 100px' }}>
      <div
        className="card-gold"
        style={{
          maxWidth: '820px',
          margin: '0 auto',
          padding: '48px 36px',
          textAlign: 'center',
          borderRadius: 'var(--radius-xl)',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(212, 168, 67, 0.1) 0%, rgba(26, 18, 8, 0.98) 70%)',
          border: '1px solid rgba(212, 168, 67, 0.3)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(212, 168, 67, 0.1)',
        }}
      >
        {/* Background glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-50%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '400px',
            height: '300px',
            background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Icon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-muted) 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1a1208',
            marginBottom: '20px',
            boxShadow: '0 4px 16px rgba(212, 168, 67, 0.3)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 14 4-4" />
            <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
          </svg>
        </div>

        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(24px, 4.5vw, 36px)',
            marginBottom: '12px',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          {cta.final_title || 'พร้อมเริ่มเตรียมสอบและพัฒนาตัวเองแล้วใช่ไหม?'}
        </h2>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '15.5px',
            maxWidth: '520px',
            margin: '0 auto 28px',
            lineHeight: 1.6,
          }}
        >
          {cta.final_subtitle || 'เลือกชุดข้อสอบตำแหน่งที่ต้องการ แล้วเริ่มฝึกทำข้อสอบได้ทันที'}
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <Link
            href="/packages"
            className="btn-primary animate-pulse-gold"
            style={{
              padding: '13px 32px',
              fontSize: '15.5px',
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
              padding: '12px 24px',
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
