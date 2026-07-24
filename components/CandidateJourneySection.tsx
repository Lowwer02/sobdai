/**
 * Candidate Journey Section — "เส้นทางสู่ความพร้อมในวันสอบ"
 *
 * Outcome-focused Candidate Growth Journey component. Replaces the generic
 * numbered software checklist (01, 02, 03) with a 3-phase learning progression.
 * Pure Server Component.
 */

export default function CandidateJourneySection() {
  return (
    <section
      style={{
        padding: '64px 20px 80px',
        maxWidth: '1100px',
        margin: '0 auto',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ marginBottom: '12px' }}>
          <span
            className="badge badge-gold"
            style={{ fontSize: '12px', padding: '4px 12px' }}
          >
            เส้นทางการเรียนรู้
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
          เส้นทางสู่ความพร้อมในวันสอบ
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '15px',
            maxWidth: '520px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          กระบวนการฝึกฝนที่ออกแบบให้คุณเก่งขึ้นในทุกข้อที่ทำ
        </p>
      </div>

      {/* 3 Progression Phases */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {/* Phase 1 */}
        <div
          className="card-glass"
          style={{
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            borderRadius: 'var(--radius-lg)',
            position: 'relative',
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
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>

          <span
            style={{
              fontSize: '11px',
              color: 'var(--gold-muted)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            เฟสเริ่มต้น
          </span>

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
            โฟกัสตรงจุดตั้งแต่ข้อแรก
          </h3>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            เลือกกรมและตำแหน่งที่ต้องการสอบ เข้าถึงคลังข้อสอบจริงโดยไม่ต้องเสียเวลาอ่านเนื้อหาที่ไม่ตรงประเด็น
          </p>
        </div>

        {/* Phase 2 — Core Highlighted Phase */}
        <div
          className="card-glass"
          style={{
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            borderRadius: 'var(--radius-lg)',
            position: 'relative',
            borderTop: '2px solid var(--gold)',
            background:
              'linear-gradient(180deg, rgba(212, 168, 67, 0.06) 0%, rgba(26, 18, 8, 0.8) 100%)',
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
              border: '1px solid rgba(212, 168, 67, 0.3)',
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
              <path d="M12 2v20" />
              <path d="m17 5-5-3-5 3" />
              <path d="m17 19-5 3-5-3" />
              <path d="M2 12h20" />
            </svg>
          </div>

          <span
            style={{
              fontSize: '11px',
              color: 'var(--gold-light)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            เฟสฝึกฝน
          </span>

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
            เปลี่ยนข้อที่พลาด เป็นความรู้ที่แม่นยำ
          </h3>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            เมื่อตอบไม่ได้ ใช้คำใบ้เพื่อสะกิดกระบวนการคิด อ่านเฉลยละเอียดเพื่อเก็บหลักการ เปลี่ยนทุกความผิดพลาดเป็นความเข้าใจ
          </p>
        </div>

        {/* Phase 3 */}
        <div
          className="card-glass"
          style={{
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            borderRadius: 'var(--radius-lg)',
            position: 'relative',
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
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>

          <span
            style={{
              fontSize: '11px',
              color: 'var(--gold-muted)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            เฟสพร้อมสอบ
          </span>

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
            เห็นพัฒนาการ จนมั่นใจวันสอบจริง
          </h3>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            ติดตามสถิติคะแนนและวิเคราะห์ซ่อมจุดอ่อนทีละส่วน จนกระทั่งเดินเข้าห้องสอบด้วยความรู้สึกว่าเตรียมตัวมาดีพอแล้ว
          </p>
        </div>
      </div>
    </section>
  )
}
