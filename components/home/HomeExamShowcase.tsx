import React from 'react'

/**
 * HomeExamShowcase — Dedicated large visual Exam Runner product showcase.
 *
 * Pure Server Component. Rendered with id="showcase".
 * Clearly labeled with "ตัวอย่างหน้าจอ" badge. Zero decorative emoji.
 */
export default function HomeExamShowcase() {
  return (
    <section
      id="showcase"
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
            ระบบฝึกทำข้อสอบจริง
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
          สัมผัสประสบการณ์ฝึกสอบเสมือนจริง
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '15.5px',
            maxWidth: '560px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          ออกแบบให้ฝึกคิดทีละข้อ มีระบบจับเวลา คำใบ้ช่วยคิด และเฉลยละเอียดทุกข้อ
        </p>
      </div>

      {/* Large Representative Exam Card */}
      <div
        className="card-glass"
        style={{
          borderRadius: 'var(--radius-xl)',
          border: '1px solid rgba(212, 168, 67, 0.28)',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* Mock Runner Top Bar */}
        <div
          style={{
            background: 'var(--bg-card-2)',
            padding: '18px 28px',
            borderBottom: '1px solid var(--border-card)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--gold)',
                display: 'inline-block',
                boxShadow: '0 0 6px var(--gold)',
              }}
            />
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              นักวิเคราะห์นโยบายและแผน ปฏิบัติการ • ชุดที่ 1
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                color: 'var(--gold-light)',
                background: 'var(--bg-input)',
                padding: '5px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-card)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>01:25:30</span>
            </div>

            <span
              className="badge"
              style={{
                fontSize: '10.5px',
                padding: '3px 8px',
                background: 'rgba(255, 235, 180, 0.08)',
                color: 'var(--text-muted)',
                border: '1px solid rgba(255, 235, 180, 0.15)',
              }}
            >
              ตัวอย่างหน้าจอ
            </span>
          </div>
        </div>

        {/* Question Body */}
        <div style={{ padding: '32px 28px' }}>
          {/* Navigator Bar Demo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '24px',
              flexWrap: 'wrap',
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((num) => (
              <div
                key={num}
                style={{
                  width: '32px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'rgba(76, 175, 125, 0.15)',
                  color: '#4caf7d',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(76, 175, 125, 0.3)',
                }}
              >
                {num}
              </div>
            ))}
            <div
              style={{
                width: '36px',
                height: '28px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-muted) 100%)',
                color: '#1a1208',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 10px rgba(212, 168, 67, 0.4)',
              }}
            >
              8
            </div>
            {[9, 10, 11, 12].map((num) => (
              <div
                key={num}
                style={{
                  width: '32px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--bg-input)',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-card)',
                }}
              >
                {num}
              </div>
            ))}
          </div>

          {/* Question Text */}
          <div
            style={{
              fontSize: '16px',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              marginBottom: '24px',
              fontWeight: 500,
            }}
          >
            <span style={{ color: 'var(--gold-light)', fontWeight: 700, marginRight: '8px' }}>
              ข้อที่ 8:
            </span>
            การมอบอำนาจให้ปฏิบัติราชการแทนตาม พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 ผู้ว่าราชการจังหวัดสามารถมอบอำนาจให้แก่บุคคลใดต่อไปนี้ได้?
          </div>

          {/* Choices Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '24px' }}>
            <div
              style={{
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-input)',
                border: '1.5px solid var(--border-card)',
                fontSize: '14px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span className="choice-badge">ก</span>
              <span>นายอำเภอ และปลัดอำเภอผู้เป็นหัวหน้าประจำกิ่งอำเภอ เท่านั้น</span>
            </div>

            {/* Selected Correct Choice */}
            <div
              style={{
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(76, 175, 125, 0.12)',
                border: '1.5px solid #4caf7d',
                fontSize: '14px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  className="choice-badge"
                  style={{
                    background: '#4caf7d',
                    color: '#0f0b08',
                    borderColor: '#4caf7d',
                    fontWeight: 700,
                  }}
                >
                  ข
                </span>
                <span style={{ fontWeight: 600 }}>
                  รองผู้ว่าราชการจังหวัด, ปลัดจังหวัด, หรือหัวหน้าส่วนราชการประจำจังหวัด
                </span>
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#4caf7d',
                  background: 'rgba(76, 175, 125, 0.2)',
                  padding: '3px 10px',
                  borderRadius: '999px',
                }}
              >
                ถูกต้อง
              </span>
            </div>

            <div
              style={{
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-input)',
                border: '1.5px solid var(--border-card)',
                fontSize: '14px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span className="choice-badge">ค</span>
              <span>นายกองค์การบริหารส่วนจังหวัด และนายกเทศมนตรี</span>
            </div>
          </div>

          {/* Hint Demonstration Box (No Emoji) */}
          <div
            style={{
              background: 'var(--hint-bg)',
              border: '1px solid rgba(124, 159, 212, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              marginBottom: '18px',
              fontSize: '13px',
              color: 'var(--hint)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>คำใบ้:</span>
            </div>
            <span>การมอบอำนาจในราชการส่วนภูมิภาค ต้องมอบให้แก่ข้าราชการสังกัดราชการส่วนภูมิภาคในจังหวัดนั้น</span>
          </div>

          {/* Detailed Explanation Demonstration Box */}
          <div
            style={{
              background: 'rgba(45, 122, 79, 0.08)',
              border: '1px solid rgba(45, 122, 79, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '20px 22px',
              fontSize: '13.5px',
              lineHeight: 1.65,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--gold-light)',
                fontWeight: 700,
                fontSize: '14px',
                marginBottom: '8px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              คำอธิบายละเอียดและเหตุผล
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <strong>ตอบข้อ ข.</strong> ตามมาตรา 38 แห่ง พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 บัญญัติว่า ผู้ว่าราชการจังหวัดอาจมอบอำนาจให้รองผู้ว่าราชการจังหวัด ผู้ช่วยผู้ว่าราชการจังหวัด ปลัดจังหวัด หรือหัวหน้าส่วนราชการประจำจังหวัดปฏิบัติราชการแทนได้
            </p>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '12.5px' }}>
              <strong>ทำไมข้ออื่นถึงผิด:</strong> ข้อ ก. นายอำเภอรับมอบอำนาจได้เฉพาะงานในอำเภอ ส่วนข้อ ค. นายก อบจ. เป็นผู้บริหารองค์กรปกครองส่วนท้องถิ่น มิใช่ข้าราชการส่วนภูมิภาค จึงไม่อาจรับมอบอำนาจสายตรงในลักษณะนี้ได้
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
