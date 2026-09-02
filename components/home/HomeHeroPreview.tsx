import React from 'react'

/**
 * HomeHeroPreview — High-fidelity representative product demonstration preview.
 *
 * Pure Server Component. Rendered in the Hero right-hand column.
 * Visibly labeled with "ตัวอย่างหน้าจอ" badges to ensure demonstration data
 * is never mistaken for authenticated visitor account data.
 */
export default function HomeHeroPreview() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '560px',
        margin: '0 auto',
      }}
    >
      {/* Ambient background glow behind demo cards */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '20%',
          left: '30%',
          width: '320px',
          height: '240px',
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.12) 0%, transparent 70%)',
          filter: 'blur(30px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Main Exam Runner Demo Card */}
      <div
        className="card-glass"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(212, 168, 67, 0.25)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* Demonstration Indicator Badge */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            borderBottom: '1px solid var(--border-card)',
            paddingBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--gold)',
                display: 'inline-block',
                boxShadow: '0 0 8px var(--gold)',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--gold-light)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              ระบบฝึกทำข้อสอบจริง
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

        {/* Exam Title & Scope Header */}
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--gold-muted)',
              fontWeight: 600,
              letterSpacing: '0.04em',
              marginBottom: '2px',
            }}
          >
            สำนักงาน ก.พ. • ภาค ก.
          </div>
          <div
            className="font-display"
            style={{
              fontSize: '15px',
              color: 'var(--text-primary)',
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            วิชาความรู้และลักษณะการเป็นข้าราชการที่ดี
          </div>
        </div>

        {/* Progress & Meta Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            background: 'var(--bg-input)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '14px',
            border: '1px solid var(--border-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>01:32:45</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 600, color: 'var(--gold-light)' }}>ข้อ 63 / 80</span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--gold-muted)',
                background: 'var(--gold-tint)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(212, 168, 67, 0.2)',
              }}
            >
              โหมดฝึกฝน
            </span>
          </div>
        </div>

        {/* Question Navigator Pill Strip (Visual Demo) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '16px',
            overflowX: 'hidden',
          }}
        >
          {[61, 62].map((num) => (
            <div
              key={num}
              style={{
                width: '32px',
                height: '26px',
                borderRadius: '6px',
                background: 'rgba(76, 175, 125, 0.15)',
                color: '#4caf7d',
                fontSize: '11.5px',
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
              height: '26px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-muted) 100%)',
              color: '#1a1208',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(212, 168, 67, 0.4)',
            }}
          >
            63
          </div>
          {[64, 65, 66, 67].map((num) => (
            <div
              key={num}
              style={{
                width: '32px',
                height: '26px',
                borderRadius: '6px',
                background: 'var(--bg-input)',
                color: 'var(--text-muted)',
                fontSize: '11.5px',
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

        {/* Question Stem */}
        <div
          style={{
            fontSize: '13.5px',
            lineHeight: 1.55,
            color: 'var(--text-primary)',
            marginBottom: '14px',
            fontWeight: 500,
          }}
        >
          <span style={{ color: 'var(--gold-light)', fontWeight: 700, marginRight: '6px' }}>ข้อ 63:</span>
          ตาม พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 การจัดระเบียบบริหารราชการส่วนกลาง ประกอบด้วยข้อใดต่อไปนี้?
        </div>

        {/* Choices Demo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-card)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                border: '1px solid var(--text-muted)',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              ก
            </span>
            <span>กระทรวง, ทบวง, กรม, จังหวัด</span>
          </div>

          {/* Correct Choice (Highlighted) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(76, 175, 125, 0.12)',
              border: '1.5px solid #4caf7d',
              fontSize: '13px',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#4caf7d',
                  color: '#0f0b08',
                  flexShrink: 0,
                }}
              >
                ข
              </span>
              <span style={{ fontWeight: 600 }}>สำนักนายกรัฐมนตรี, กระทรวง, ทบวง, กรม</span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#4caf7d',
                background: 'rgba(76, 175, 125, 0.2)',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              ถูกต้อง
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-card)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                border: '1px solid var(--text-muted)',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              ค
            </span>
            <span>จังหวัด, อำเภอ, องค์การบริหารส่วนจังหวัด</span>
          </div>
        </div>

        {/* Detailed Explanation Snippet Demo */}
        <div
          style={{
            background: 'rgba(45, 122, 79, 0.08)',
            border: '1px solid rgba(45, 122, 79, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            fontSize: '12.5px',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--gold-light)',
              fontWeight: 700,
              marginBottom: '4px',
              fontSize: '12px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            เฉลยละเอียดและเหตุผล
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            ตามมาตรา 7 ระเบียบบริหารราชการส่วนกลาง ได้แก่ (1) สำนักนายกรัฐมนตรี (2) กระทรวง (3) ทบวง และ (4) กรม โดยจังหวัดและอำเภอจัดเป็นราชการส่วนภูมิภาค
          </p>
        </div>
      </div>

      {/* Floating Diagnostic Insight Widget */}
      <div
        className="card-gold"
        style={{
          position: 'relative',
          marginTop: '-16px',
          marginLeft: 'auto',
          marginRight: '12px',
          width: '88%',
          zIndex: 2,
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(212, 168, 67, 0.35)',
          background: 'linear-gradient(135deg, rgba(30, 21, 16, 0.98) 0%, rgba(20, 14, 8, 0.98) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
              วิเคราะห์ความพร้อมรายหัวข้อ
            </span>
          </div>
          <span
            className="badge"
            style={{
              fontSize: '9.5px',
              padding: '1px 6px',
              background: 'rgba(212, 168, 67, 0.12)',
              color: 'var(--gold-light)',
              border: '1px solid rgba(212, 168, 67, 0.25)',
            }}
          >
            ตัวอย่างหน้าจอ
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
          <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-card)' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>กฎหมายระเบียบแผ่นดิน</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#4caf7d', fontWeight: 700 }}>85%</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>แม่นยำ</span>
            </div>
          </div>
          <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-card)' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>พ.ร.บ. ข้อมูลข่าวสารฯ</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#e05c5c', fontWeight: 700 }}>45%</span>
              <span style={{ color: '#e05c5c', fontSize: '10px', fontWeight: 600 }}>ต้องทบทวน</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
