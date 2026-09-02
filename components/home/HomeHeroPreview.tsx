import React from 'react'

/**
 * HomeHeroPreview — High-fidelity representative product demonstration preview.
 *
 * Pure Server Component. Rendered in the Hero right-hand column.
 * Designed with high visual prominence, generous spacing, and zero clutter
 * so core product capabilities are immediately readable at a glance.
 * Visibly labeled with "ตัวอย่างหน้าจอ" badges.
 */
export default function HomeHeroPreview() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '520px',
        margin: '0 auto',
      }}
    >
      {/* Ambient warm gold radial glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '10%',
          left: '20%',
          width: '360px',
          height: '260px',
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.12) 0%, transparent 70%)',
          filter: 'blur(36px)',
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
          padding: '24px',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid rgba(212, 168, 67, 0.28)',
          boxShadow: '0 16px 44px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
            borderBottom: '1px solid var(--border-card)',
            paddingBottom: '14px',
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
                boxShadow: '0 0 6px var(--gold)',
              }}
            />
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              สำนักงาน ก.พ. • ภาค ก.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--gold-light)',
                fontFamily: 'monospace',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>01:32:45</span>
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
        </div>

        {/* Progress Tracker (Clean & Readable) */}
        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--gold-light)' }}>ข้อ 63 จาก 80 ข้อ</span>
            <span style={{ color: 'var(--text-muted)' }}>วิชาความรู้ข้าราชการที่ดี</span>
          </div>
          <div
            style={{
              height: '4px',
              background: 'var(--bg-card-2)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '78%',
                height: '100%',
                background: 'linear-gradient(90deg, var(--green) 0%, var(--gold) 100%)',
                borderRadius: '999px',
              }}
            />
          </div>
        </div>

        {/* Question Stem (Prominent & Clear) */}
        <div
          style={{
            fontSize: '14.5px',
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            marginBottom: '18px',
            fontWeight: 500,
          }}
        >
          <span style={{ color: 'var(--gold-light)', fontWeight: 700, marginRight: '6px' }}>ข้อ 63:</span>
          ตาม พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 การจัดระเบียบบริหารราชการส่วนกลาง ประกอบด้วยข้อใดต่อไปนี้?
        </div>

        {/* Choices (Simplified to 2 key states for immediate readability) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
          {/* Unselected Choice */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-card)',
              fontSize: '13.5px',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                width: '24px',
                height: '24px',
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

          {/* Selected Correct Choice */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(76, 175, 125, 0.12)',
              border: '1.5px solid #4caf7d',
              fontSize: '13.5px',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  width: '24px',
                  height: '24px',
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
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#4caf7d',
                background: 'rgba(76, 175, 125, 0.2)',
                padding: '2px 8px',
                borderRadius: '999px',
                flexShrink: 0,
              }}
            >
              ถูกต้อง
            </span>
          </div>
        </div>

        {/* Explanation Snippet (Clean & Punchy) */}
        <div
          style={{
            background: 'rgba(45, 122, 79, 0.08)',
            border: '1px solid rgba(45, 122, 79, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
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
              marginBottom: '3px',
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
            ตามมาตรา 7 ระเบียบบริหารราชการส่วนกลาง ได้แก่ สำนักนายกรัฐมนตรี กระทรวง ทบวง และกรม โดยจังหวัดและอำเภอจัดเป็นราชการส่วนภูมิภาค
          </p>
        </div>
      </div>

      {/* Floating Diagnostic Insight Card (Cleaned & Prominent) */}
      <div
        className="card-gold"
        style={{
          position: 'relative',
          marginTop: '-18px',
          marginLeft: 'auto',
          marginRight: '12px',
          width: '90%',
          zIndex: 2,
          padding: '16px 18px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 28px rgba(0, 0, 0, 0.75)',
          border: '1px solid rgba(212, 168, 67, 0.35)',
          background: 'linear-gradient(135deg, rgba(28, 20, 12, 0.98) 0%, rgba(18, 12, 8, 0.98) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gold-light)' }}>
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
              วิเคราะห์ความพร้อม
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#4caf7d',
                background: 'rgba(76, 175, 125, 0.15)',
                padding: '2px 7px',
                borderRadius: '999px',
              }}
            >
              84% ผ่านเกณฑ์
            </span>
            <span
              style={{
                fontSize: '9.5px',
                color: 'var(--text-muted)',
                background: 'rgba(255, 235, 180, 0.06)',
                padding: '1px 6px',
                borderRadius: '3px',
              }}
            >
              ตัวอย่างหน้าจอ
            </span>
          </div>
        </div>

        {/* Weak Topic Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>จุดอ่อนที่ควรทบทวน: พ.ร.บ. ข้อมูลข่าวสารฯ</span>
            <span style={{ color: '#e05c5c', fontWeight: 600 }}>45% ต้องทบทวน</span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: '45%', height: '100%', background: '#e05c5c' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
