import Link from 'next/link'

/**
 * Safe not-found for the attempt review route. Used for: unauthenticated,
 * missing attempt, attempt owned by another user, or malformed id. The page is
 * identical across all these cases so it never reveals whether an attempt
 * exists for someone else.
 */
export default function AttemptReviewNotFound() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--gold-tint, rgba(212,175,55,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold)',
            margin: '0 auto 24px',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <h1
          className="font-display"
          style={{ fontSize: '24px', marginBottom: '12px', color: 'var(--text-primary)' }}
        >
          ไม่พบผลการทำข้อสอบ
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.7, marginBottom: '28px' }}>
          ผลการทำข้อสอบที่คุณกำลังมองหาอาจถูกลบ หรือคุณอาจไม่มีสิทธิ์เข้าถึง
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/exams"
            className="btn-primary"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            กลับแดชบอร์ด
          </Link>
          <Link
            href="/packages"
            className="btn-outline"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            สำรวจแพ็กเกจ
          </Link>
        </div>
      </div>
    </div>
  )
}
