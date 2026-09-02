import React from 'react'
import Link from 'next/link'
import PackageCard, { type PackageCardData } from '@/components/PackageCard'
import type { PackageExplorerSettings } from '@/lib/homepageConfig'

interface HomeFeaturedExamsProps {
  packages: PackageCardData[]
  config: PackageExplorerSettings
}

export default function HomeFeaturedExams({ packages, config }: HomeFeaturedExamsProps) {
  return (
    <section id="exams" style={{ padding: 'clamp(28px, 4vw, 40px) 20px clamp(40px, 6vw, 80px)', maxWidth: '1160px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: 'clamp(20px, 3vw, 32px)',
        }}
      >
        <div>
          <div style={{ marginBottom: '8px' }}>
            <span
              className="badge badge-gold"
              style={{ fontSize: '11.5px', padding: '3px 10px' }}
            >
              คลังแนวข้อสอบ
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
            {config.title || 'เลือกแนวข้อสอบราชการตามหน่วยงานและตำแหน่ง'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', margin: 0 }}>
            {config.subtitle || 'แต่ละชุดข้อสอบมาพร้อมสรุปเนื้อหา แบบฝึกหัด เฉลยละเอียด และการติดตามความพร้อม'}
          </p>
        </div>

        <Link
          href="/packages"
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--gold-light)',
            fontSize: '14.5px',
            fontWeight: 600,
          }}
          className="group"
        >
          <span>{config.cta_label || 'ดูชุดข้อสอบทั้งหมด'}</span>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 group-hover:translate-x-1"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>

      {packages.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {packages.map((pkg, i) => (
            <PackageCard key={pkg.id} pkg={pkg} index={i} />
          ))}
        </div>
      ) : (
        <div
          className="card"
          style={{
            padding: '48px 20px',
            textAlign: 'center',
            minHeight: '260px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--gold-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold)',
              marginBottom: '20px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M12 8v8" />
              <path d="m8 12 4 4 4-4" />
            </svg>
          </div>
          <h3 className="font-display" style={{ fontSize: '19px', marginBottom: '8px', color: 'var(--text-primary)' }}>
            {config.empty_title || 'กำลังเตรียมชุดข้อสอบใหม่'}
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '14px', margin: 0 }}>
            {config.empty_description || 'ทีมงานกำลังอัปเดตคลังข้อสอบสำหรับปีล่าสุด กลับมาเช็คใหม่เร็วๆ นี้นะครับ'}
          </p>
        </div>
      )}
    </section>
  )
}
