import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'คลังเนื้อหา | Sobdai',
  description: 'เตรียมพบกับสื่อการเรียนรูปแบบใหม่ที่จะช่วยให้การเตรียมสอบมีประสิทธิภาพมากยิ่งขึ้น',
}

const UPCOMING_RESOURCES = [
  {
    title: 'เอกสาร PDF',
    description: 'ดาวน์โหลดสรุปเนื้อหาในรูปแบบ PDF สำหรับอ่านได้ทุกที่',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: 'Mind Maps',
    description: 'สรุปเนื้อหาแบบแผนภาพ เพื่อช่วยให้เข้าใจภาพรวมได้รวดเร็ว',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="M4.93 19.07l2.83-2.83" />
        <path d="M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  {
    title: 'Cheat Sheets',
    description: 'สรุปประเด็นสำคัญสำหรับทบทวนก่อนสอบ',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    title: 'Infographics',
    description: 'สรุปเนื้อหาในรูปแบบภาพที่เข้าใจง่าย',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    title: 'Flash Cards',
    description: 'ช่วยทบทวนคำสำคัญและแนวข้อสอบแบบรวดเร็ว',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
]

const ROADMAP = [
  { label: 'Summary', status: 'done' as const },
  { label: 'PDF', status: 'upcoming' as const },
  { label: 'Mind Maps', status: 'upcoming' as const },
  { label: 'Cheat Sheets', status: 'upcoming' as const },
  { label: 'Infographics', status: 'upcoming' as const },
  { label: 'Flash Cards', status: 'upcoming' as const },
]

export default function DownloadsPage() {
  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ===================== Hero ===================== */}
      <section
        style={{
          position: 'relative',
          padding: '80px 20px 60px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse at center, rgba(212, 168, 67, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative' }}>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              marginBottom: '16px',
              background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            คลังเนื้อหา
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--text-secondary)',
              lineHeight: 1.75,
              maxWidth: '520px',
              margin: '0 auto',
            }}
          >
            เตรียมพบกับสื่อการเรียนรูปแบบใหม่ที่จะช่วยให้การเตรียมสอบมีประสิทธิภาพมากยิ่งขึ้น
          </p>
        </div>
      </section>

      {/* ===================== Upcoming Resources ===================== */}
      <section style={{ padding: '20px 20px 60px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2
            className="font-display"
            style={{ fontSize: 'clamp(20px, 3.5vw, 28px)', marginBottom: '8px' }}
          >
            สื่อการเรียนที่กำลังพัฒนา
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            เรากำลังเตรียมเนื้อหาในรูปแบบใหม่เพื่อรองรับการเรียนรู้ที่หลากหลาย
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          {UPCOMING_RESOURCES.map((resource, i) => (
            <div
              key={resource.title}
              className="card"
              style={{
                padding: '24px 20px',
                textAlign: 'center',
                animation: `fadeInUp 0.4s ease ${i * 0.07}s both`,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'var(--gold-tint)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold)',
                  margin: '0 auto 16px',
                }}
              >
                {resource.icon}
              </div>
              <h3
                className="font-display"
                style={{ fontSize: '15px', marginBottom: '8px', fontWeight: 'normal' }}
              >
                {resource.title}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.65, marginBottom: '12px' }}>
                {resource.description}
              </p>
              <span
                className="badge badge-gold"
                style={{ fontSize: '11px', padding: '3px 10px' }}
              >
                เร็ว ๆ นี้
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== Available Today ===================== */}
      <section
        style={{
          padding: '60px 20px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(212, 168, 67, 0.03) 50%, transparent 100%)',
        }}
      >
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2
              className="font-display"
              style={{ fontSize: 'clamp(20px, 3.5vw, 28px)', marginBottom: '8px' }}
            >
              พร้อมใช้งานแล้ว
            </h2>
          </div>

          <div
            className="card-gold"
            style={{
              padding: '32px 28px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
                margin: '0 auto 16px',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h3
              className="font-display"
              style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'normal' }}
            >
              สรุปเนื้อหา
            </h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '14px',
                lineHeight: 1.7,
                marginBottom: '24px',
                maxWidth: '460px',
                margin: '0 auto 24px',
              }}
            >
              ขณะนี้สามารถอ่านสรุปเนื้อหาได้ภายในแต่ละแพ็กเกจที่คุณมีสิทธิ์เข้าถึง โดยรองรับ Markdown และการอ่านบนทุกอุปกรณ์
            </p>
            <Link href="/packages">
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '12px 28px', fontSize: '15px' }}
              >
                ดูแพ็กเกจทั้งหมด
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== Roadmap ===================== */}
      <section style={{ padding: '60px 20px 100px', maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2
            className="font-display"
            style={{ fontSize: 'clamp(20px, 3.5vw, 28px)' }}
          >
            Roadmap
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {ROADMAP.map((item, i) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '14px 0',
                borderBottom: i < ROADMAP.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {/* Status indicator */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  ...(item.status === 'done'
                    ? { background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }
                    : { background: 'var(--gold-tint)', color: 'var(--gold-muted)' }),
                }}
              >
                {item.status === 'done' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                )}
              </div>

              {/* Label */}
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: item.status === 'done' ? '600' : '400',
                  color: item.status === 'done' ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {item.label}
              </span>

              {/* Status badge */}
              {item.status === 'done' && (
                <span
                  className="badge badge-green"
                  style={{ fontSize: '10px', padding: '2px 8px', marginLeft: 'auto' }}
                >
                  พร้อมใช้งาน
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
