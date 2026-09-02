import React from 'react'

/**
 * Candidate Journey Section — "เส้นทางสู่การสอบติด 3 ขั้นตอน"
 *
 * Outcome-focused 3-step learning progression.
 * Pure Server Component.
 */
export default function CandidateJourneySection() {
  const steps = [
    {
      num: '01',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
      title: 'เลือกข้อสอบที่ใช่',
      desc: 'ค้นหาตามหน่วยงาน ตำแหน่ง และเกณฑ์การสอบ เข้าถึงคลังข้อสอบจริงตรงประเด็น',
    },
    {
      num: '02',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      title: 'ฝึกทำเหมือนสอบจริง',
      desc: 'ฝึกทำทีละข้อ มีระบบจับเวลา คำใบ้ช่วยคิด และเฉลยละเอียดพร้อมหลักการทันที',
    },
    {
      num: '03',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      ),
      title: 'วิเคราะห์และพัฒนา',
      desc: 'ดูผลการสอบ วิเคราะห์จุดอ่อนรายหัวข้อ และทบทวนข้อผิดเพื่อพัฒนาความพร้อม',
    },
  ]

  return (
    <section
      style={{
        padding: '64px 20px 80px',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ marginBottom: '12px' }}>
          <span
            className="badge badge-gold"
            style={{ fontSize: '12px', padding: '4px 12px' }}
          >
            เส้นทางการเตรียมสอบ
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

      {/* 3 Step Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {steps.map((step, idx) => (
          <div
            key={step.num}
            className="card-glass"
            style={{
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              borderRadius: 'var(--radius-lg)',
              border: idx === 1 ? '1px solid rgba(212, 168, 67, 0.4)' : '1px solid var(--border-card)',
              background: idx === 1 ? 'linear-gradient(180deg, rgba(212, 168, 67, 0.08) 0%, rgba(26, 18, 8, 0.94) 100%)' : undefined,
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'var(--gold-tint)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold-light)',
                  border: '1px solid rgba(212, 168, 67, 0.25)',
                }}
              >
                {step.icon}
              </div>

              <span
                className="font-display"
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: idx === 1 ? 'var(--gold)' : 'var(--gold-muted)',
                  opacity: 0.6,
                }}
              >
                {step.num}
              </span>
            </div>

            <h3
              className="font-display"
              style={{
                fontSize: '19px',
                color: 'var(--text-primary)',
                marginBottom: '10px',
                lineHeight: 1.3,
                fontWeight: 600,
              }}
            >
              {step.title}
            </h3>

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                lineHeight: 1.65,
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
