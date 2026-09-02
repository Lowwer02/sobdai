import React from 'react'

/**
 * HomeProof — 4-pillar verified product quality and capability strip.
 *
 * Pure Server Component. Rendered directly below the Hero section.
 * Contains only verified product capabilities without unproven metrics or fake user counts.
 */
export default function HomeProof() {
  const pillars = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10" />
          <path d="M6 10h10" />
        </svg>
      ),
      title: 'ข้อสอบตามหน่วยงานและตำแหน่ง',
      desc: 'เลือกฝึกทำชุดข้อสอบที่ตรงกับสายงานและสังกัดที่เปิดรับสมัคร',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
      title: 'แนวข้อสอบราชการพร้อมเฉลย',
      desc: 'ทุกข้อมีคำอธิบายเหตุผล พร้อมหลักหรือข้อกฎหมายที่เกี่ยวข้อง ชัดเจนว่าทำไมข้อนี้ถูกและข้ออื่นผิด',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
      ),
      title: 'บันทึกและทบทวนข้อสอบ',
      desc: 'บันทึกข้อที่น่าสนใจ และกลับมาทบทวนหรือฝึกซ้ำข้อที่ตอบผิดได้',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: 'วิเคราะห์จุดอ่อนอัตโนมัติ',
      desc: 'ประเมินความแม่นยำแยกตามรายหมวดวิชา รู้ทันทีว่าหัวข้อไหนต้องอ่านเพิ่ม',
    },
  ]

  return (
    <section
      style={{
        padding: '0 20px clamp(28px, 4vw, 48px)',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'clamp(12px, 2vw, 16px)',
        }}
      >
        {pillars.map((item, index) => (
          <div
            key={index}
            className="card-glass"
            style={{
              padding: 'clamp(16px, 2.5vw, 20px) clamp(14px, 2vw, 18px)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              transition: 'border-color 0.2s ease, transform 0.2s ease',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--gold-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--gold-light)',
                border: '1px solid rgba(212, 168, 67, 0.2)',
                flexShrink: 0,
              }}
            >
              {item.icon}
            </div>

            <h2
              className="font-display"
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {item.title}
            </h2>

            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
