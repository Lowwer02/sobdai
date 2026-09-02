import React from 'react'

/**
 * HomeInsightShowcase — Demonstrates the post-exam diagnostic & recommendation loop.
 *
 * Asymmetric Server Component: Dominant outcome panel + supporting weak topics & next steps.
 * Clearly labeled with "ตัวอย่างหน้าจอ" badges. Zero decorative emoji.
 */
export default function HomeInsightShowcase() {
  return (
    <section
      style={{
        padding: 'clamp(24px, 4vw, 32px) 20px clamp(48px, 7vw, 96px)',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: 'clamp(24px, 4vw, 48px)' }}>
        <div style={{ marginBottom: '12px' }}>
          <span
            className="badge badge-gold"
            style={{ fontSize: '12px', padding: '4px 12px' }}
          >
            ระบบวิเคราะห์ผลลัพธ์
          </span>
        </div>
        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(24px, 4vw, 38px)',
            marginBottom: '12px',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          หลังทำข้อสอบ คุณไม่ได้เห็นแค่คะแนน{'\n'}แต่รู้ว่าจุดไหนอ่อน และควรฝึกอะไรต่อ
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '15.5px',
            maxWidth: '580px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          ประเมินผลอย่างละเอียดทันทีหลังทำ เพื่อให้คุณโฟกัสการอ่านทบทวนได้ถูกจุด ไม่เสียเวลากับเนื้อหาที่แม่นแล้ว
        </p>
      </div>

      {/* Asymmetric Composition: Dominant Result Panel (Left) + Stacked Diagnostic Panels (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
          gap: 'clamp(16px, 2.5vw, 24px)',
          alignItems: 'stretch',
        }}
      >
        {/* Dominant Panel: Exam Outcome & Score */}
        <div
          className="card-glass"
          style={{
            padding: 'clamp(20px, 4vw, 32px) clamp(18px, 3vw, 28px)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid rgba(212, 168, 67, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '3px 12px',
                    borderRadius: '999px',
                    color: '#22c55e',
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}
                >
                  ผ่านเกณฑ์
                </span>
                <span
                  className="badge badge-gold"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                >
                  โหมดฝึกฝน
                </span>
              </div>
              <span
                className="badge"
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  background: 'rgba(255,235,180,0.06)',
                  padding: '2px 7px',
                  borderRadius: '3px',
                }}
              >
                ตัวอย่างหน้าจอ
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--gold-muted)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '4px' }}>
              สำนักงาน ก.พ. • ภาค ก.
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '24px' }}>
              วิชาความรู้และลักษณะการเป็นข้าราชการที่ดี
            </h3>

            {/* Score & Gauge */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '24px' }}>
              <span className="font-display" style={{ fontSize: '48px', lineHeight: 1, fontWeight: 700, color: '#22c55e' }}>
                84%
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>ความแม่นยำรวม</span>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--bg-input)', padding: '12px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '3px' }}>ตอบถูก</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>42</div>
              </div>
              <div style={{ background: 'var(--bg-input)', padding: '12px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '3px' }}>ตอบผิด</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#e05c5c' }}>8</div>
              </div>
              <div style={{ background: 'var(--bg-input)', padding: '12px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '3px' }}>ทำครบ</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gold-light)' }}>50/50</div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-card)',
              paddingTop: '14px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>เวลาที่ใช้: 42 นาที (เฉลี่ย 50 วินาที/ข้อ)</span>
          </div>
        </div>

        {/* Stacked Diagnostic Panels (Right) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Panel 1: Weak Topics Breakdown */}
          <div
            className="card-glass"
            style={{
              padding: '24px 26px',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <h3 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  หัวข้อที่ควรทบทวน
                </h3>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  background: 'rgba(255,235,180,0.06)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                ตัวอย่างหน้าจอ
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
              คำนวณจากผลสอบล่าสุด ช่วยชี้เป้าหัวข้อที่ควรเน้น
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน</span>
                  <span style={{ color: '#4caf7d', fontWeight: 600 }}>85% แม่นยำ</span>
                </div>
                <div style={{ height: '4px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '85%', height: '100%', background: '#4caf7d' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>พ.ร.บ. ข้อมูลข่าวสารของราชการ</span>
                  <span style={{ color: '#e05c5c', fontWeight: 600 }}>40% ต้องทบทวน</span>
                </div>
                <div style={{ height: '4px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '40%', height: '100%', background: '#e05c5c' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2: Adaptive Recommendations (No Emoji) */}
          <div
            className="card-glass"
            style={{
              padding: '24px 26px',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 14 14" />
                </svg>
                <h3 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  ขั้นตอนถัดไปแนะนำ
                </h3>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  background: 'rgba(255,235,180,0.06)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                ตัวอย่างหน้าจอ
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(212, 168, 67, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(212, 168, 67, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--gold-light)',
                    background: 'rgba(212, 168, 67, 0.15)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}
                >
                  อ่านสรุป
                </span>
                <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>
                  สรุปสาระสำคัญ พ.ร.บ. ข้อมูลข่าวสารฯ 2540
                </span>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-card)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    background: 'rgba(255, 255, 255, 0.06)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}
                >
                  ฝึกเพิ่ม
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  ชุดข้อสอบเฉพาะหมวดกฎหมายปกครอง
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
