import Link from 'next/link'
import type { TimelineEvent } from '@/lib/assessment/activity-timeline'
import { formatThaiDateTime } from '@/lib/assessment/dashboard-data'

/**
 * Activity Timeline section (Phase 1E) — "ไทม์ไลน์กิจกรรม".
 *
 * Pure Server Component. Renders the learner's recent activity (completed
 * exams + active-session progress saves) as a newest-first vertical list.
 * Each row is a semantic link:
 *   - completed  → /exams/attempts/{id}?view=incorrect (or ?view=all when perfect)
 *   - progress   → /package/{slug}/exam/{examSetId}?mode=practice|mock
 *
 * Accessibility: each event is a labeled link with a descriptive Thai
 * aria-label; meaning is conveyed by text labels, not color alone. No client
 * JS. Uses the project's design tokens (.card, CSS variables) for consistency
 * with the rest of the dashboard.
 */
export default function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '18px' }}>
        <div
          className="font-display"
          style={{
            fontSize: '20px',
            color: 'var(--text-primary)',
            fontWeight: 700,
          }}
        >
          ไทม์ไลน์กิจกรรม
        </div>
      </div>

      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {events.map((event, i) => (
          // A 1px gold connector between items gives the "timeline" feel
          // without adding DOM noise; the last item has no connector.
          <li
            key={`${event.kind}:${event.id}`}
            style={{
              position: 'relative',
              paddingBottom: i < events.length - 1 ? '16px' : 0,
            }}
          >
            {i < events.length - 1 ? (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '24px',
                  bottom: '0',
                  width: '2px',
                  background: 'rgba(212,175,55,0.18)',
                }}
              />
            ) : null}
            <TimelineRow event={event} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** One timeline row. */
function TimelineRow({ event }: { event: TimelineEvent }) {
  const isCompleted = event.kind === 'completed'
  const isPractice = event.mode === 'practice'
  const modeLabel = isPractice ? 'ฝึกทำ' : 'จำลองสอบ'

  // Completed → attempt review (perfect results show all; otherwise incorrect).
  // Progress → resume the exam set (practice|mock mirrors normalizeMode).
  const href = isCompleted
    ? perfectResult(event)
      ? `/exams/attempts/${event.id}?view=all`
      : `/exams/attempts/${event.id}?view=incorrect`
    : `/package/${event.packageSlug}/exam/${event.examSetId}?mode=${isPractice ? 'practice' : 'mock'}`

  const dotColor = isCompleted
    ? event.passed
      ? '#22c55e'
      : 'var(--gold-light)'
    : 'var(--gold)'

  const ariaLabel = isCompleted
    ? `ส่งข้อสอบแล้ว ${event.examSetName} คะแนน ${event.score} จาก ${event.total} ${event.passed ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'}`
    : `บันทึกความคืบหน้า ${event.examSetName} ตอบแล้ว ${event.answeredCount} จาก ${event.totalQuestions} ข้อ`

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: '12px',
        textDecoration: 'none',
        padding: '4px 0',
        borderRadius: '8px',
      }}
    >
      {/* Marker dot */}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: '12px',
          height: '12px',
          marginTop: '6px',
          borderRadius: '50%',
          background: dotColor,
          border: '2px solid rgba(0,0,0,0.25)',
          boxShadow: `0 0 0 3px rgba(212,175,55,0.08)`,
        }}
      />

      {/* Body */}
      <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
        <span
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: '6px 8px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: isCompleted ? 'var(--gold-light)' : 'var(--gold)',
            }}
          >
            {isCompleted ? 'ส่งข้อสอบแล้ว' : 'บันทึกความคืบหน้า'}
          </span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              padding: '1px 8px',
              borderRadius: '999px',
              color: isPractice ? '#22c55e' : 'var(--gold-light)',
              background: isPractice ? 'rgba(34,197,94,0.1)' : 'rgba(212,175,55,0.1)',
              border: `1px solid ${isPractice ? 'rgba(34,197,94,0.3)' : 'rgba(212,175,55,0.3)'}`,
            }}
          >
            {modeLabel}
          </span>
        </span>

        <span
          style={{
            fontSize: '14.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
          }}
        >
          {event.examSetName}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{event.packageName}</span>

        {/* Concise result / progress detail — text label, not color-only */}
        <span style={{ fontSize: '12.5px', color: 'var(--text-secondary, var(--text-muted))' }}>
          {isCompleted ? (
            <>
              คะแนน{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {event.score}/{event.total}
              </strong>{' '}
              · {event.passed ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'}
            </>
          ) : (
            <>
              ตอบแล้ว{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {event.answeredCount}/{event.totalQuestions}
              </strong>{' '}
              ข้อ
            </>
          )}
        </span>

        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
          {event.timestamp ? formatThaiDateTime(event.timestamp) : ''}
        </span>
      </span>
    </Link>
  )
}

/**
 * A "perfect" completed result: score === total AND total > 0. The review CTA
 * then points to ?view=all (everything correct) instead of ?view=incorrect.
 */
function perfectResult(e: TimelineEvent): boolean {
  return e.total > 0 && e.score >= e.total
}

/**
 * Empty state — the learner has no recent activity yet (no completed attempts
 * and no active sessions). Explains how activity is generated.
 */
export function ActivityTimelineEmpty() {
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
        ยังไม่มีกิจกรรมการเรียน
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        เริ่มทำข้อสอบหรือส่งข้อสอบเพื่อให้กิจกรรมล่าสุดของคุณปรากฏที่นี่
      </p>
    </div>
  )
}
