import Link from 'next/link'
import type { AttemptReviewData, ReviewView } from '@/lib/assessment/attempt-review-data'
import { formatThaiDateTime, formatDuration } from '@/lib/assessment/dashboard-data'

/**
 * Attempt Review summary header. Pure Server Component.
 *
 * Displays the IMMUTABLE persisted result (package/exam-set/mode, score/total,
 * accuracy, correct/wrong/unanswered, passed state, time used, completion date)
 * using persisted attempt fields as the source of truth — nothing is recomputed.
 *
 * Also renders the two server-rendered view-switching links ("เฉพาะข้อผิด" /
 * "ทุกข้อ") with a visible active state, plus retry/package links.
 */
export default function AttemptReviewSummary({
  data,
  view,
}: {
  data: AttemptReviewData
  view: ReviewView
}) {
  const isPractice = data.mode === 'practice'
  const modeLabel = isPractice ? 'ฝึกทำ' : 'จำลองสอบ'
  const retryUrl = `/package/${data.packageSlug}/exam/${data.examSetId}?mode=${isPractice ? 'practice' : 'mock'}`

  // Wrong/unanswered from the validated historical summary (display-only
  // breakdowns; the headline persisted numbers are used for score/total/etc.).
  const wrong = data.summary.filter((e) => e.selected != null && !e.isCorrect).length
  const unanswered = data.summary.filter((e) => e.selected == null).length

  const base = `/exams/attempts/${data.attemptId}`
  const linkClass = (active: boolean) =>
    active ? 'btn-primary' : 'btn-outline'

  return (
    <div
      className="card"
      style={{ padding: '24px' }}
    >
      {/* Header */}
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
              background: isPractice ? 'var(--success-bg)' : 'var(--wash)',
              color: isPractice ? 'var(--success)' : 'var(--gold-light)',
              border: `1px solid ${isPractice ? 'var(--success-border)' : 'var(--border-hover)'}`,
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
              color: data.passed ? 'var(--success)' : 'var(--destructive)',
              background: data.passed ? 'var(--success-bg)' : 'var(--destructive-bg)',
              border: `1px solid ${data.passed ? 'var(--success-border)' : 'var(--destructive-border)'}`,
            }}
          >
            {data.passed ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'}
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
          {data.packageName}
        </div>
        <h1
          className="font-display"
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
          }}
        >
          {data.examSetName}
        </h1>
      </div>

      {/* Accuracy + stats */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
          marginBottom: '18px',
        }}
      >
        <span
          className="font-display"
          style={{
            fontSize: '40px',
            lineHeight: 1,
            fontWeight: 700,
            color: data.passed ? 'var(--success)' : 'var(--gold-light)',
          }}
        >
          {data.accuracy}%
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          คะแนน {data.score}/{data.total}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '18px',
        }}
      >
        <Stat label="ถูก" value={data.score} color="var(--success)" />
        <Stat label="ผิด" value={wrong} color="var(--destructive)" />
        <Stat label="ไม่ได้ตอบ" value={unanswered} color="var(--gold-light)" />
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
        <MetaRow label="เวลาที่ใช้" value={formatDuration(data.timeUsedSeconds)} />
        <MetaRow
          label="ทำเสร็จเมื่อ"
          value={data.completedAt ? formatThaiDateTime(data.completedAt) : ''}
        />
      </div>

      {/* View switcher (server-rendered) */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
        role="group"
        aria-label="เลือกมุมมองการทบทวน"
      >
        <Link
          href={`${base}?view=incorrect`}
          aria-current={view === 'incorrect' ? 'page' : undefined}
          className={linkClass(view === 'incorrect')}
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '8px 14px',
            fontSize: '13px',
          }}
        >
          เฉพาะข้อผิด
        </Link>
        <Link
          href={`${base}?view=all`}
          aria-current={view === 'all' ? 'page' : undefined}
          className={linkClass(view === 'all')}
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '8px 14px',
            fontSize: '13px',
          }}
        >
          ทุกข้อ
        </Link>
      </div>

      {/* Action links */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          href={retryUrl}
          className="btn-outline"
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '8px 16px',
            fontSize: '13px',
          }}
        >
          ทำชุดนี้อีกครั้ง
        </Link>
        <Link
          href={`/package/${data.packageSlug}`}
          className="btn-outline"
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '8px 16px',
            fontSize: '13px',
          }}
        >
          ดูแพ็กเกจ
        </Link>
        <Link
          href="/exams"
          className="btn-outline"
          style={{
            display: 'inline-block',
            textAlign: 'center',
            textDecoration: 'none',
            padding: '8px 16px',
            fontSize: '13px',
          }}
        >
          กลับแดชบอร์ด
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '12px 8px',
        background: 'var(--hover)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
