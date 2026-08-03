import Link from 'next/link'
import type { DashboardLatestResult } from '@/lib/assessment/dashboard-data'
import { formatThaiDateTime, formatDuration, safePercent } from '@/lib/assessment/dashboard-data'

/**
 * Latest Result card — one completed, immutable exam Outcome (the most recent
 * attempt). Pure Server Component. Shows package/exam-set name, accuracy,
 * correct/wrong counts, pass/fail state, time used, completion timestamp, and a
 * mode label. CTAs: "ทำชุดนี้อีกครั้ง" (retry) + optional "ดูแพ็กเกจ".
 *
 * Scope note (Phase 1B): this card does NOT include "ทบทวนข้อผิด" — historical
 * answer review is a Phase 1C concern.
 */
export default function LatestResultCard({ result }: { result: DashboardLatestResult }) {
  const isPractice = result.mode === 'practice'
  const modeLabel = isPractice ? 'ฝึกทำ' : 'จำลองสอบ'
  const retryUrl = `/package/${result.packageSlug}/exam/${result.examSetId}?mode=${isPractice ? 'practice' : 'mock'}`

  const correct = Math.max(0, result.score)
  const total = Math.max(0, result.total)
  // Wrong = total − score, clamped at 0 (the table also derives incorrect_count
  // this way via a generated column).
  const wrong = Math.max(0, total - correct)
  const answered = Math.max(0, result.answeredCount)
  // Unanswered = total − answered, clamped at 0.
  const unanswered = Math.max(0, total - answered)
  const accuracy = Math.max(0, Math.min(100, Math.round(result.accuracy ?? safePercent(correct, total))))
  // Whether the review CTA should point to incorrect-review (any wrong or
  // unanswered) vs. view-all (a perfect, fully-answered attempt).
  const hasReviewable = wrong > 0 || unanswered > 0

  return (
    <div
      className="card"
      style={{ padding: '24px' }}
    >
      {/* Header: titles + passed state */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            flexWrap: 'wrap',
          }}
        >
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
            {modeLabel}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '999px',
              color: result.passed ? '#22c55e' : '#ef4444',
              background: result.passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${result.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            {result.passed ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'}
          </span>
        </div>
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
          {result.packageName}
        </div>
        <h3
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
            marginBottom: '2px',
          }}
        >
          {result.examSetName}
        </h3>
      </div>

      {/* Accuracy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        <span
          className="font-display"
          style={{
            fontSize: '40px',
            lineHeight: 1,
            fontWeight: 700,
            color: result.passed ? '#22c55e' : 'var(--gold-light)',
          }}
        >
          {accuracy}%
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>ความแม่นยำ</span>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '20px',
        }}
      >
        <Stat label="ตอบถูก" value={correct} color="#22c55e" />
        <Stat label="ตอบผิด" value={wrong} color="#ef4444" />
        <Stat label="ทำครบ" value={`${answered}/${total}`} color="var(--gold-light)" />
      </div>

      {/* Meta */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '12.5px',
          color: 'var(--text-muted)',
          marginBottom: '20px',
        }}
      >
        <MetaRow label="เวลาที่ใช้" value={formatDuration(result.timeUsedSeconds)} />
        <MetaRow
          label="ทำเสร็จเมื่อ"
          value={result.completedAt ? formatThaiDateTime(result.completedAt) : ''}
        />
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {/* Review CTA (Phase 1C). When there are wrong OR unanswered questions,
            invite the learner to review them; otherwise offer to view all
            answers. Avoids overcrowding on mobile by keeping this compact. */}
        {hasReviewable ? (
          <Link
            href={`/exams/attempts/${result.attemptId}?view=incorrect`}
            className="btn-primary"
            style={{
              display: 'inline-block',
              textAlign: 'center',
              textDecoration: 'none',
              padding: '10px 18px',
              fontSize: '14px',
            }}
            aria-label={`ทบทวนข้อผิด ${result.examSetName}`}
          >
            ทบทวนข้อผิด
          </Link>
        ) : (
          <Link
            href={`/exams/attempts/${result.attemptId}?view=all`}
            className="btn-primary"
            style={{
              display: 'inline-block',
              textAlign: 'center',
              textDecoration: 'none',
              padding: '10px 18px',
              fontSize: '14px',
            }}
            aria-label={`ดูคำตอบทั้งหมด ${result.examSetName}`}
          >
            ดูคำตอบทั้งหมด
          </Link>
        )}
        <Link
          href={retryUrl}
          className="btn-outline"
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '10px 18px',
            fontSize: '14px',
          }}
          aria-label={`ทำชุดนี้อีกครั้ง ${result.examSetName}`}
        >
          ทำชุดนี้อีกครั้ง
        </Link>
        <Link
          href={`/package/${result.packageSlug}`}
          className="btn-outline"
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '10px 16px',
            fontSize: '13px',
          }}
        >
          ดูแพ็กเกจ
        </Link>
      </div>
    </div>
  )
}

/** Small stat tile used in the result card grid. */
function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '12px 8px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ fontSize: '20px', fontWeight: 700, color, marginBottom: '2px' }}>{value}</div>
      <div
        style={{
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** Label/value row used in the result card meta block. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

/**
 * Empty state for the Latest Result section. Shown when the learner has no
 * completed attempts yet.
 */
export function LatestResultEmpty() {
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
        ยังไม่มีผลสอบ
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        เมื่อคุณส่งข้อสอบเสร็จ ผลคะแนนและสรุปการทำข้อสอบจะปรากฏที่นี่
      </p>
    </div>
  )
}
