import Link from 'next/link'
import type { DashboardActiveSession } from '@/lib/assessment/dashboard-data'
import { formatThaiDateTime, formatDuration, safePercent } from '@/lib/assessment/dashboard-data'

/**
 * Continue Learning card — one resumable in-progress assessment session.
 *
 * Pure Server Component. Displays package/exam-set name, a mode badge, an
 * answered/total progress bar, the last-saved timestamp, and a "ทำต่อ" CTA that
 * resumes the exact exam set + mode. No client JS. Uses the project's existing
 * design tokens (CSS variables / .card / .badge classes) for visual consistency
 * with the rest of the dashboard.
 */
export default function ContinueLearningCard({ session }: { session: DashboardActiveSession }) {
  const isPractice = session.mode === 'practice'
  const resumeUrl = `/package/${session.packageSlug}/exam/${session.examSetId}?mode=${isPractice ? 'practice' : 'mock'}`
  const answered = Math.max(0, session.answeredCount)
  const total = Math.max(0, session.totalQuestions)
  const pct = safePercent(answered, total)
  const subtitle = session.positionName || session.organizationName || undefined

  return (
    <div
      className="card"
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Mode badge */}
      <div style={{ marginBottom: '12px' }}>
        <span
          className="badge"
          style={{
            fontSize: '11px',
            padding: '3px 10px',
            background: isPractice ? 'rgba(34,197,94,0.12)' : 'rgba(212,175,55,0.12)',
            color: isPractice ? '#22c55e' : 'var(--gold-light)',
            border: `1px solid ${isPractice ? 'rgba(34,197,94,0.35)' : 'rgba(212,175,55,0.35)'}`,
          }}
        >
          {isPractice ? 'ฝึกทำ' : 'จำลองสอบ'}
        </span>
      </div>

      {/* Package + exam set names */}
      <div style={{ marginBottom: '14px' }}>
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--gold-muted)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}
        >
          {session.packageName}
        </div>
        <h3
          style={{
            fontSize: '16.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
            marginBottom: '2px',
          }}
        >
          {session.examSetName}
        </h3>
        {subtitle && (
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{subtitle}</div>
        )}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '6px',
            fontSize: '12.5px',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            ทำไปแล้ว <strong style={{ color: 'var(--text-primary)' }}>{answered}</strong> / {total} ข้อ
          </span>
          <span style={{ color: 'var(--gold-light)', fontWeight: 600 }}>{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`ความคืบหน้า ${pct} เปอร์เซ็นต์`}
          style={{
            height: '6px',
            width: '100%',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: '999px',
              background: 'linear-gradient(90deg, var(--gold), var(--gold-light))',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Footer: last saved + CTA */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
          บันทึกล่าสุด{session.updatedAt ? `: ${formatThaiDateTime(session.updatedAt)}` : ''}
        </div>
        <Link
          href={resumeUrl}
          className="btn-primary"
          style={{
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '10px 16px',
            fontSize: '14px',
          }}
          aria-label={`ทำต่อ ${session.examSetName}`}
        >
          ทำต่อ
        </Link>
      </div>
    </div>
  )
}

/**
 * Empty state for the Continue Learning section. Shown when the learner has no
 * in-progress sessions. Offers a path into their first owned package so the
 * dashboard still nudges them toward starting something.
 */
export function ContinueLearningEmpty({ firstOwnedPackageSlug }: { firstOwnedPackageSlug?: string }) {
  return (
    <div
      className="card"
      style={{
        padding: '24px',
        textAlign: 'center',
        opacity: 0.95,
      }}
    >
      <h3
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        ยังไม่มีข้อสอบที่ทำค้างไว้
      </h3>
      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          marginBottom: firstOwnedPackageSlug ? '16px' : 0,
        }}
      >
        เลือกชุดข้อสอบจากแพ็กเกจของคุณเพื่อเริ่มทำ
        ระบบจะบันทึกความคืบหน้าไว้ให้คุณกลับมาทำต่อได้
      </p>
      {firstOwnedPackageSlug && (
        <Link
          href={`/package/${firstOwnedPackageSlug}`}
          className="btn-outline"
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '8px 16px',
            fontSize: '13px',
          }}
        >
          เลือกชุดข้อสอบ
        </Link>
      )}
    </div>
  )
}
