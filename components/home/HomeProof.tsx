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
      title: 'ข้อสอบรายตำแหน่ง',
      desc: 'คลังข้อสอบเฉพาะหน่วยงานและตำแหน่ง คัดสรรตรงตามระเบียบการสอบจริง',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
      title: 'เฉลยละเอียดทุกข้อ',
      desc: 'อธิบายเหตุผลและข้อกฎหมายชัดเจน เข้าใจว่าทำไมข้อนี้ถูกและตัวเลือกอื่นผิด',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
      ),
      title: 'บันทึกและทบทวน',
      desc: 'เลือกบันทึกข้อสอบที่สนใจ และมีระบบกลับมาฝึกซ้ำข้อที่ตอบผิดได้ตลอดเวลา',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: 'วิเคราะห์จุดอ่อน',
      desc: 'รายงานผลความแม่นยำรายหัวข้อ รู้ทันทีว่าส่วนไหนแม่นแล้วและส่วนไหนต้องเพิ่ม',
    },
  ]

  return (
    <section
      style={{
        padding: '0 20px 48px',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
        }}
      >
        {pillars.map((item, index) => (
          <div
            key={index}
            className="card-glass"
            style={{
              padding: '20px 18px',
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
