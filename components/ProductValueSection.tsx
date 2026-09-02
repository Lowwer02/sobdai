import React from 'react'

/**
 * Product Value Section — "เพราะการจำคำตอบ ไม่เท่ากับการเข้าใจ"
 *
 * Outcome-focused Server Component. Shows 3 core product capability cards
 * embedding static, semantic mini-UI previews labeled with "ตัวอย่างหน้าจอ".
 */
export default function ProductValueSection() {
  return (
    <section
      style={{
        padding: '64px 20px 80px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 168, 67, 0.05) 0%, transparent 70%)',
      }}
    >
      <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ marginBottom: '12px' }}>
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
              fontSize: 'clamp(24px, 4vw, 38px)',
              marginBottom: '12px',
              color: 'var(--text-primary)',
              lineHeight: 1.25,
            }}
          >
            เพราะการจำคำตอบ ไม่เท่ากับการเข้าใจ
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '15px',
              maxWidth: '580px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            อ่านหนังสือแล้วลืม ฝึกทำข้อสอบและเข้าใจเหตุผลคือวิธีที่ได้ผลที่สุด เปลี่ยนการท่องจำมาเป็นการทำความเข้าใจอย่างเป็นระบบ
          </p>
        </div>

        {/* 3 Rich Product Capability Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
            alignItems: 'stretch',
          }}
        >
          {/* Card 1: Detailed Explanations */}
          <div
            className="card-glass"
            style={{
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-card)',
            }}
          >
            <div>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'var(--gold-tint)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold-light)',
                  marginBottom: '18px',
                  border: '1px solid rgba(212, 168, 67, 0.2)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>

              <h3
                className="font-display"
                style={{
                  fontSize: '18.5px',
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  fontWeight: 700,
                }}
              >
                เฉลยละเอียดทุกข้อ
              </h3>

              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '13.5px',
                  lineHeight: 1.6,
                  marginBottom: '20px',
                }}
              >
                ทุกข้อมีคำอธิบายเหตุผลและข้อกฎหมายชัดเจน ไม่ใช่แค่บอกว่าข้อไหนถูก แต่ทำให้เข้าใจว่าทำไมถึงถูก และทำไมตัวเลือกอื่นจึงผิด
              </p>
            </div>

            {/* Mini UI Demonstration Frame */}
            <div
              style={{
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                border: '1px solid var(--border-card)',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>เฉลยข้อ 63</span>
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', background: 'rgba(255,235,180,0.06)', padding: '1px 5px', borderRadius: '3px' }}>
                  ตัวอย่างหน้าจอ
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ background: '#4caf7d', color: '#0f0b08', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', fontSize: '10.5px' }}>
                  คำตอบ: ข
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>สำนักนายกฯ, กระทรวง, กรม</span>
              </div>
              <p style={{ color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontSize: '11.5px' }}>
                เหตุผล: ตามมาตรา 7 ระเบียบบริหารราชการส่วนกลางกำหนดเฉพาะ 4 องค์กรหลักนี้
              </p>
            </div>
          </div>

          {/* Card 2: Weak Topics Analysis */}
          <div
            className="card-glass"
            style={{
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-card)',
            }}
          >
            <div>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'var(--gold-tint)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold-light)',
                  marginBottom: '18px',
                  border: '1px solid rgba(212, 168, 67, 0.2)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20V10" />
                  <path d="M18 20V4" />
                  <path d="M6 20v-4" />
                </svg>
              </div>

              <h3
                className="font-display"
                style={{
                  fontSize: '18.5px',
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  fontWeight: 700,
                }}
              >
                วิเคราะห์จุดอ่อนรายหัวข้อ
              </h3>

              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '13.5px',
                  lineHeight: 1.6,
                  marginBottom: '20px',
                }}
              >
                ระบบประเมินคะแนนแยกตาม พ.ร.บ. และหมวดวิชาทันทีหลังทำข้อสอบ ชี้ชัดว่าหัวข้อไหนแม่นแล้วและหัวข้อไหนยังต้องฝึกซ้ำ
              </p>
            </div>

            {/* Mini UI Demonstration Frame */}
            <div
              style={{
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                border: '1px solid var(--border-card)',
                fontSize: '11.5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>ความแม่นยำรายหัวข้อ</span>
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', background: 'rgba(255,235,180,0.06)', padding: '1px 5px', borderRadius: '3px' }}>
                  ตัวอย่างหน้าจอ
                </span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', color: 'var(--text-secondary)' }}>
                  <span>กฎหมายระเบียบแผ่นดิน</span>
                  <span style={{ color: '#4caf7d', fontWeight: 600 }}>85%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '85%', height: '100%', background: '#4caf7d' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', color: 'var(--text-secondary)' }}>
                  <span>พ.ร.บ. ข้อมูลข่าวสารฯ</span>
                  <span style={{ color: '#e05c5c', fontWeight: 600 }}>45%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '45%', height: '100%', background: '#e05c5c' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Adaptive Next Actions */}
          <div
            className="card-glass"
            style={{
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-card)',
            }}
          >
            <div>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'var(--gold-tint)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold-light)',
                  marginBottom: '18px',
                  border: '1px solid rgba(212, 168, 67, 0.2)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 14 14" />
                </svg>
              </div>

              <h3
                className="font-display"
                style={{
                  fontSize: '18.5px',
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  fontWeight: 700,
                }}
              >
                แนะนำขั้นตอนถัดไป
              </h3>

              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '13.5px',
                  lineHeight: 1.6,
                  marginBottom: '20px',
                }}
              >
                ระบบช่วยนำทางว่าควรกลับไปอ่านสรุปเนื้อหาบทใด หรือฝึกทำข้อสอบชุดใดต่อ เพื่อปิดจุดอ่อนและพัฒนาความพร้อมอย่างตรงจุด
              </p>
            </div>

            {/* Mini UI Demonstration Frame */}
            <div
              style={{
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                border: '1px solid var(--border-card)',
                fontSize: '11.5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>คำแนะนำสำหรับคุณ</span>
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', background: 'rgba(255,235,180,0.06)', padding: '1px 5px', borderRadius: '3px' }}>
                  ตัวอย่างหน้าจอ
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(212, 168, 67, 0.08)', borderRadius: '4px', border: '1px solid rgba(212, 168, 67, 0.2)' }}>
                <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>📖 อ่านสรุป</span>
                <span style={{ color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>พ.ร.บ. ข้อมูลข่าวสารฯ</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '4px', border: '1px solid var(--border-card)' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>✍️ ฝึกเพิ่ม</span>
                <span style={{ color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>ชุดข้อสอบทบทวนจุดอ่อน</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
