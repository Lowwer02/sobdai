/**
 * Product Value Section — "เพราะการจำคำตอบ ไม่เท่ากับการเข้าใจ"
 *
 * Outcome-focused Server Component. Hardcoded brand identity copy (Option A)
 * positioning Sobdai's study efficacy over passive reading/video watching.
 */

export default function ProductValueSection() {
  return (
    <section
      style={{
        padding: '64px 20px 80px',
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(212, 168, 67, 0.05) 0%, transparent 70%)',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
              fontSize: 'clamp(24px, 4vw, 36px)',
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
              maxWidth: '560px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            อ่านหนังสือแล้วลืม ดูคลิปแล้วไม่แน่ใจ
            การฝึกทำข้อสอบและเข้าใจเหตุผลคือวิธีที่ได้ผลที่สุด
          </p>
        </div>

        {/* 3 Outcome Pillars */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            alignItems: 'stretch',
          }}
        >
          {/* Pillar 1 */}
          <div
            className="card-glass"
            style={{
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              position: 'relative',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--gold-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--gold-light)',
                marginBottom: '20px',
                border: '1px solid rgba(212, 168, 67, 0.2)',
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                <path d="M9 21h6" />
              </svg>
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
              คิดก่อน ไม่ใช่แค่จำ
            </h3>

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              ทุกข้อสอบถูกออกแบบให้คุณคิดก่อนดูเฉลย ฝึกกระบวนการวิเคราะห์จนติดเป็นนิสัย
              ไม่ใช่แค่ท่องจำตัวเลือก
            </p>
          </div>

          {/* Pillar 2 */}
          <div
            className="card-glass"
            style={{
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              position: 'relative',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--gold-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--gold-light)',
                marginBottom: '20px',
                border: '1px solid rgba(212, 168, 67, 0.2)',
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
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
              เข้าใจถึงราก ไม่ใช่แค่ผ่านข้อสอบ
            </h3>

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              ทุกข้อมีเฉลยที่อธิบายเหตุผลอย่างชัดเจน ไม่ใช่แค่บอกว่าตอบข้อไหนถูก
              แต่ทำให้คุณเข้าใจว่าทำไมคำตอบนั้นถึงถูกต้องตามหลักการ
            </p>
          </div>

          {/* Pillar 3 — Highest Visual Emphasis (Key Candidate Anxiety) */}
          <div
            className="card-gold"
            style={{
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              position: 'relative',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(212, 168, 67, 0.4)',
              background:
                'linear-gradient(145deg, rgba(212, 168, 67, 0.12) 0%, rgba(26, 18, 8, 0.96) 100%)',
              boxShadow: '0 8px 30px rgba(212, 168, 67, 0.15)',
            }}
          >
            {/* Accent Badge */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
              }}
            >
              <span
                className="badge badge-gold"
                style={{
                  fontSize: '10.5px',
                  padding: '2px 8px',
                  borderColor: 'rgba(212, 168, 67, 0.4)',
                }}
              >
                หัวใจสำคัญ
              </span>
            </div>

            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-muted) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1208',
                marginBottom: '20px',
                boxShadow: '0 4px 12px rgba(212, 168, 67, 0.3)',
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <h3
              className="font-display"
              style={{
                fontSize: '19px',
                color: 'var(--gold-light)',
                marginBottom: '10px',
                lineHeight: 1.3,
                fontWeight: 600,
              }}
            >
              รู้ว่าตัวเองอยู่ตรงไหน พร้อมสอบแค่ไหน
            </h3>

            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '14px',
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              ฝึกทีละข้อ เห็นผลและคะแนนพัฒนาการทันที
              รู้ว่าจุดไหนแม่นแล้ว จุดไหนยังต้องฝึกเพิ่ม ไม่ต้องรอถึงวันสอบจริงค่อยรู้
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
