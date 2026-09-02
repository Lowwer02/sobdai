import React from 'react'

/**
 * Product Value Section — "เพราะการจำคำตอบ ไม่เท่ากับการเข้าใจ"
 *
 * Editorial Asymmetric Server Component. Breaks the repetitive card grid pattern:
 * Left side: Story & 3 core learning principles.
 * Right side: Integrated representative UI preview (Explanation + Weak Topics + Adaptive Steps).
 * Clearly labeled with "ตัวอย่างหน้าจอ" badge. Zero decorative emoji.
 */
export default function ProductValueSection() {
  const storyPoints = [
    {
      num: '01',
      title: 'เข้าใจถึงเหตุผลและข้อกฎหมาย',
      desc: 'ทุกข้อมีคำอธิบายเหตุผลอย่างละเอียด ไม่ใช่แค่บอกว่าข้อไหนถูก แต่ทำให้เข้าใจว่าทำไมคำตอบนั้นถึงถูกต้องตามหลักการ',
    },
    {
      num: '02',
      title: 'วิเคราะห์จุดอ่อนรายหัวข้อ',
      desc: 'ประเมินคะแนนแยกตาม พ.ร.บ. และหมวดวิชาทันทีหลังทำข้อสอบ ชี้ชัดว่าหัวข้อไหนแม่นแล้ว และหัวข้อไหนยังต้องฝึกซ้ำ',
    },
    {
      num: '03',
      title: 'แนะนำขั้นตอนการพัฒนาถัดไป',
      desc: 'ระบบช่วยนำทางว่าควรกลับไปอ่านสรุปเนื้อหาบทใด หรือฝึกทำข้อสอบชุดใดต่อ เพื่อปิดจุดอ่อนได้อย่างตรงจุด',
    },
  ]

  return (
    <section
      style={{
        padding: 'clamp(44px, 6vw, 80px) 20px clamp(44px, 6vw, 88px)',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 168, 67, 0.05) 0%, transparent 70%)',
      }}
    >
      <div
        style={{
          maxWidth: '1160px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
          gap: 'clamp(32px, 5vw, 56px)',
          alignItems: 'center',
        }}
      >
        {/* Left Column: Editorial Brand Story */}
        <div>
          <div style={{ marginBottom: '14px' }}>
            <span
              className="badge badge-gold"
              style={{ fontSize: '12px', padding: '4px 12px' }}
            >
              แนวทางการเรียนรู้
            </span>
          </div>

          <h2
            className="font-display"
            style={{
              fontSize: 'clamp(26px, 4vw, 38px)',
              marginBottom: '14px',
              color: 'var(--text-primary)',
              lineHeight: 1.25,
            }}
          >
            เพราะการจำคำตอบ{'\n'}ไม่เท่ากับการเข้าใจ
          </h2>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '15.5px',
              lineHeight: 1.65,
              marginBottom: '36px',
              maxWidth: '500px',
            }}
          >
            อ่านหนังสือแล้วลืม การฝึกทำข้อสอบและเข้าใจเหตุผลคือวิธีที่ได้ผลที่สุด เปลี่ยนการท่องจำแบบเดิม มาเป็นการทำความเข้าใจอย่างเป็นระบบ
          </p>

          {/* 3 Story Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {storyPoints.map((point) => (
              <div key={point.num} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <span
                  className="font-display"
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--gold)',
                    background: 'var(--gold-tint)',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(212, 168, 67, 0.25)',
                    flexShrink: 0,
                  }}
                >
                  {point.num}
                </span>

                <div>
                  <h3
                    style={{
                      fontSize: '16.5px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: '0 0 4px',
                      lineHeight: 1.35,
                    }}
                  >
                    {point.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '13.5px',
                      color: 'var(--text-muted)',
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {point.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Unified Representative UI Preview Panel */}
        <div
          className="card-glass"
          style={{
            padding: 'clamp(18px, 3vw, 28px)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid rgba(212, 168, 67, 0.25)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Top Panel Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-card)',
              paddingBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--gold)',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                กระบวนการเรียนรู้และพัฒนา
              </span>
            </div>
            <span
              className="badge"
              style={{
                fontSize: '10px',
                padding: '2px 8px',
                background: 'rgba(255, 235, 180, 0.06)',
                color: 'var(--text-muted)',
                border: '1px solid rgba(255, 235, 180, 0.12)',
              }}
            >
              ตัวอย่างหน้าจอ
            </span>
          </div>

          {/* Part A: Detailed Explanation Demo */}
          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              border: '1px solid var(--border-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--gold-light)', fontSize: '12px', fontWeight: 700 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span>1. ทำความเข้าใจด้วยเฉลยละเอียด</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ background: '#4caf7d', color: '#0f0b08', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                คำตอบ: ข
              </span>
              <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                สำนักนายกรัฐมนตรี, กระทรวง, ทบวง, กรม
              </span>
            </div>

            <p style={{ color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontSize: '12px' }}>
              เหตุผล: ตามมาตรา 7 พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 กำหนดส่วนกลางไว้ 4 องค์กรหลักนี้เท่านั้น
            </p>
          </div>

          {/* Part B: Weak Topics Meter Demo */}
          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              border: '1px solid var(--border-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: 'var(--gold-light)', fontSize: '12px', fontWeight: 700 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>2. ชี้เป้าจุดอ่อนรายหัวข้อ</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>กฎหมายระเบียบบริหารราชการแผ่นดิน</span>
                  <span style={{ color: '#4caf7d', fontWeight: 600 }}>85% แม่นยำ</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '85%', height: '100%', background: '#4caf7d' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>พ.ร.บ. ข้อมูลข่าวสารของราชการ</span>
                  <span style={{ color: '#e05c5c', fontWeight: 600 }}>45% ต้องทบทวน</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '45%', height: '100%', background: '#e05c5c' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Part C: Adaptive Next Steps Demo (No Emojis) */}
          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              border: '1px solid var(--border-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--gold-light)', fontSize: '12px', fontWeight: 700 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              <span>3. แนะนำขั้นตอนถัดไป</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(212, 168, 67, 0.08)', borderRadius: '6px', border: '1px solid rgba(212, 168, 67, 0.2)' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--gold-light)',
                  background: 'rgba(212, 168, 67, 0.15)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                อ่านสรุป
              </span>
              <span style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 500 }}>
                สรุปสาระสำคัญ พ.ร.บ. ข้อมูลข่าวสารฯ 2540
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
