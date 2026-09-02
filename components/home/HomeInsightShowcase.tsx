import React from 'react'

/**
 * HomeInsightShowcase — Demonstrates the post-exam diagnostic & recommendation loop.
 *
 * Pure Server Component. Rendered below the Exam Showcase.
 * Clearly labeled with "ตัวอย่างหน้าจอ" badges so demonstration values
 * are never mistaken for authenticated visitor account data.
 */
export default function HomeInsightShowcase() {
  return (
    <section
      style={{
        padding: '20px 20px 80px',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
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
            fontSize: 'clamp(24px, 4vw, 36px)',
            marginBottom: '10px',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          วิเคราะห์จุดอ่อนและชี้ทางพัฒนา
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '15px',
            maxWidth: '560px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          รายงานผลคะแนนอย่างละเอียดทันทีหลังทำข้อสอบ เพื่อให้คุณโฟกัสการอ่านทบทวนได้ถูกจุด
        </p>
      </div>

      {/* 3 Diagnostic Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {/* Card 1: Latest Outcome */}
        <div
          className="card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    color: '#22c55e',
                    background: 'rgba(34,197,94,0.1)',
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

            <div style={{ fontSize: '11.5px', color: 'var(--gold-muted)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '4px' }}>
              สำนักงาน ก.พ. • ภาค ก.
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              วิชาความรู้และลักษณะการเป็นข้าราชการที่ดี
            </h3>

            {/* Score */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '18px' }}>
              <span className="font-display" style={{ fontSize: '40px', lineHeight: 1, fontWeight: 700, color: '#22c55e' }}>
                84%
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>ความแม่นยำรวม</span>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-input)', padding: '8px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ตอบถูก</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#22c55e' }}>42</div>
              </div>
              <div style={{ background: 'var(--bg-input)', padding: '8px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ตอบผิด</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#e05c5c' }}>8</div>
              </div>
              <div style={{ background: 'var(--bg-input)', padding: '8px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ทำครบ</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gold-light)' }}>50/50</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-card)', paddingTop: '12px' }}>
            ⏱️ เวลาที่ใช้: 42 นาที (เฉลี่ย 50 วินาที/ข้อ)
          </div>
        </div>

        {/* Card 2: Weak Topics Breakdown */}
        <div
          className="card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                หัวข้อที่ควรทบทวน
              </h3>
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

            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '18px', margin: '0 0 16px' }}>
              ประเมินจากผลการทำข้อสอบชุดล่าสุด
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Topic 1 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน</span>
                  <span style={{ color: '#4caf7d', fontWeight: 600 }}>85% (แม่นยำ)</span>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '85%', height: '100%', background: '#4caf7d' }} />
                </div>
              </div>

              {/* Topic 2 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>พ.ร.บ. วิธีปฏิบัติราชการทางปกครอง</span>
                  <span style={{ color: 'var(--gold-light)', fontWeight: 600 }}>70% (พอใช้)</span>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '70%', height: '100%', background: 'var(--gold)' }} />
                </div>
              </div>

              {/* Topic 3 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>พ.ร.บ. ข้อมูลข่าวสารของราชการ</span>
                  <span style={{ color: '#e05c5c', fontWeight: 600 }}>40% (ต้องทบทวน)</span>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '40%', height: '100%', background: '#e05c5c' }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--gold-light)', borderTop: '1px solid var(--border-card)', paddingTop: '12px' }}>
            🎯 ชี้เป้าหัวข้อที่ควรเน้น ช่วยประหยัดเวลาอ่าน
          </div>
        </div>

        {/* Card 3: Adaptive Next Recommendations */}
        <div
          className="card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                ขั้นตอนถัดไปแนะนำ
              </h3>
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

            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '18px', margin: '0 0 16px' }}>
              คำแนะนำอัตโนมัติเพื่อปิดจุดอ่อนอย่างตรงจุด
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(212, 168, 67, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(212, 168, 67, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--gold-light)', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                  <span>📖 สรุปเนื้อหาแนะนำ</span>
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                  สรุปสาระสำคัญ พ.ร.บ. ข้อมูลข่าวสารฯ 2540
                </div>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                  <span>✍️ แบบฝึกหัดทบทวน</span>
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                  แบบฝึกหัดเฉพาะหมวดกฎหมายปกครอง
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-card)', paddingTop: '12px' }}>
            💡 เชื่อมต่อการฝึกทำข้อสอบและการทบทวนเนื้อหา
          </div>
        </div>
      </div>
    </section>
  )
}
