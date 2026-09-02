import React from 'react'

/**
 * Candidate Journey Section — "เส้นทางสู่การสอบติด 3 ขั้นตอน"
 *
 * Light mental model transition section. Pure Server Component.
 * Minimalist surface, restrained gold numbering, generous whitespace.
 */
export default function CandidateJourneySection() {
  const steps = [
    {
      num: '01',
      title: 'เลือกข้อสอบที่ใช่',
      desc: 'ค้นหาตามหน่วยงาน ตำแหน่ง และเกณฑ์การสอบ เข้าถึงคลังข้อสอบจริงตรงประเด็น',
    },
    {
      num: '02',
      title: 'ฝึกทำเหมือนสอบจริง',
      desc: 'ฝึกทำทีละข้อ มีระบบจับเวลา คำใบ้ช่วยคิด และเฉลยละเอียดพร้อมหลักการทันที',
    },
    {
      num: '03',
      title: 'วิเคราะห์และพัฒนา',
      desc: 'ดูผลการสอบ วิเคราะห์จุดอ่อนรายหัวข้อ และทบทวนข้อผิดเพื่อพัฒนาความพร้อม',
    },
  ]

  return (
    <section
      style={{
        padding: '72px 20px 88px',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '44px' }}>
        <div style={{ marginBottom: '12px' }}>
          <span
            className="badge badge-gold"
            style={{ fontSize: '12px', padding: '4px 12px' }}
          >
            ขั้นตอนการเตรียมสอบ
          </span>
        </div>
        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            marginBottom: '10px',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          เส้นทางสู่การสอบติด 3 ขั้นตอน
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '15px',
            maxWidth: '520px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          กระบวนการฝึกฝนที่ออกแบบให้คุณเข้าใจลึกซึ้งและพร้อมที่สุดในวันสอบจริง
        </p>
      </div>

      {/* 3 Step Cards (Airy & Lightweight) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
        }}
      >
        {steps.map((step) => (
          <div
            key={step.num}
            style={{
              padding: '28px 24px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(26, 18, 8, 0.6)',
              border: '1px solid var(--border-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'relative',
            }}
          >
            <div
              className="font-display"
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--gold)',
                letterSpacing: '0.04em',
              }}
            >
              {step.num}
            </div>

            <h3
              className="font-display"
              style={{
                fontSize: '18px',
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.35,
                fontWeight: 600,
              }}
            >
              {step.title}
            </h3>

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
