import Link from 'next/link'
import type { WeakTopicGroup } from '@/lib/assessment/learner-analytics'

/**
 * Weak Topics section (Phase 1D) — "หัวข้อที่ควรทบทวน".
 *
 * Pure Server Component. Lists the top weak topic/law/subject groups derived
 * from the recent (≤20) attempt window, each with an accessible progress
 * indicator that does NOT rely on color alone (text status + counts accompany
 * the bar). No client JS, no topic-specific practice links (no such route
 * exists). The optional CTA points to the latest attempt's incorrect-review
 * page only when the dashboard already supplies a valid attempt id.
 *
 * Scope note: weak topics are derived from the same recent window as the
 * statistics section (latest ≤20 attempts).
 */
export default function WeakTopics({
  topics,
  reviewAttemptId,
  /**
   * Phase 2A: the package selector rendered in the section header. Owned by the
   * page (which resolves scope + options server-side) and passed in as an
   * already-built React node so this component stays presentational.
   */
  selector,
  /**
   * Caption under the title. Differs by scope:
   *   - all-packages: 'คำนวณจากผลสอบล่าสุดสูงสุด 20 ครั้ง' (unchanged)
   *   - package scope: 'คำนวณจากผลสอบล่าสุดสูงสุด 20 ครั้งในแพ็กเกจนี้'
   */
  caption = 'คำนวณจากผลสอบล่าสุดสูงสุด 20 ครั้ง',
  /**
   * Phase 2A: scoped empty state. When a package is selected but has no
   * completed attempts, render this copy instead of the generic empty card.
   * Rendered by the page (which knows the scope); null = use the normal
   * topics list / all-good branch below.
   */
  scopedEmpty = null,
  /**
   * Review CTA label. Differs by scope:
   *   - all-packages: 'ทบทวนข้อผิด' (unchanged)
   *   - package scope: 'ทบทวนข้อผิดในแพ็กเกจนี้'
   */
  /**
   * Phase 2A.1: compact pending indicator shown when a NEW scope is loading.
   * Rendered only while `busy` is true; defaults to a Thai inline label.
   */
  loadingLabel = 'กำลังโหลดหัวข้อ...',
  /**
   * Phase 2A.1: when true, marks the card busy (aria-busy), dims the existing
   * topic list, and shows `loadingLabel` — WITHOUT replacing the list, so the
   * learner keeps context while a scoped load is in flight. Driven by the
   * client island; false on initial server render.
   */
  busy = false,
  reviewCtaLabel = 'ทบทวนข้อผิด',
}: {
  topics: WeakTopicGroup[]
  /**
   * Attempt id the review CTA points at. For the all-packages scope this is the
   * global latestResult.attemptId (unchanged behavior). For a package scope this
   * is the selected package's own latest attempt id (scopedLatestAttemptId),
   * guaranteed to belong to that package. null → suppress the CTA.
   */
  reviewAttemptId?: string | null
  selector?: React.ReactNode
  caption?: string
  scopedEmpty?: React.ReactNode
  reviewCtaLabel?: string
  loadingLabel?: string
  busy?: boolean
}) {
  return (
    <div className="card" style={{ padding: '24px' }} aria-busy={busy || undefined}>
      {/* Header */}
      <div style={{ marginBottom: '18px' }}>
        <div
          className="font-display"
          style={{
            fontSize: '20px',
            color: 'var(--text-primary)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          หัวข้อที่ควรทบทวน
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          {caption}
        </p>
      </div>

      {/* Phase 2A: package selector (one row, mobile-friendly). */}
      {selector ? (
        <div style={{ marginBottom: '18px' }}>
          {selector}
        </div>
      ) : null}

      {/* Scoped empty state takes precedence when the page supplies it. */}
      {scopedEmpty ? (
        scopedEmpty
      ) : (
        <div
          style={{
            // Phase 2A.1: keep the list visible while busy but reduce emphasis
            // (no full-page loading, no layout shift). The compact loading label
            // below conveys the pending state accessibly.
            opacity: busy ? 0.55 : 1,
            transition: 'opacity 160ms ease-out',
          }}
        >
          {/* Compact pending indicator — shown only while a new scope loads. */}
          {busy ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                fontSize: '12.5px',
                color: 'var(--text-muted)',
                marginBottom: '12px',
              }}
            >
              {loadingLabel}
            </div>
          ) : null}

          {/* Topic list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {topics.map((t) => (
              <WeakTopicRow key={`${t.labelKind}:${t.label}`} topic={t} />
            ))}
          </div>

          {/* Optional CTA — only when a valid review attempt id is available. */}
          {reviewAttemptId ? (
            <div style={{ marginTop: '18px' }}>
              <Link
                href={`/exams/attempts/${reviewAttemptId}?view=incorrect`}
                className="btn-outline"
                style={{
                  display: 'inline-block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  padding: '8px 16px',
                  fontSize: '13px',
                }}
              >
                {reviewCtaLabel}
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** One weak-topic row: label, accuracy, counts, status text, progress bar. */
function WeakTopicRow({ topic }: { topic: WeakTopicGroup }) {
  // Accuracy as a valid clamped 0–100 value for the progress indicator.
  const pct = Math.max(0, Math.min(100, Math.round(topic.accuracy)))
  // Status text conveys meaning without relying on color alone.
  const statusText = 'ควรทบทวน'

  return (
    <div>
      {/* Top line: label + status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '10px',
          marginBottom: '6px',
        }}
      >
        <span
          style={{
            fontSize: '14.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            wordBreak: 'break-word',
          }}
        >
          {topic.label}
        </span>
        <span style={{ flexShrink: 0 }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#f59e0b',
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '999px',
              padding: '2px 9px',
            }}
          >
            {statusText}
          </span>
        </span>
      </div>

      {/* Progress indicator (accessible; value clamped, text label present) */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`ความแม่นยำ ${pct} เปอร์เซ็นต์ สำหรับ ${topic.label}`}
        style={{
          height: '6px',
          width: '100%',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          marginBottom: '6px',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: '999px',
            background: 'linear-gradient(90deg, var(--gold), var(--gold-light))',
          }}
        />
      </div>

      {/* Counts line: correct/total, incorrect, unanswered (when > 0) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 14px',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <Count label="ถูก" value={`${topic.correct}/${topic.total}`} />
        <Count label="ผิด" value={`${topic.incorrect}`} tone="wrong" />
        {topic.unanswered > 0 ? (
          <Count label="ไม่ได้ตอบ" value={`${topic.unanswered}`} tone="muted" />
        ) : null}
        <Count label="ความแม่นยำ" value={`${pct}%`} tone="gold" />
      </div>
    </div>
  )
}

/** Small label/value inline stat. */
function Count({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'wrong' | 'muted' | 'gold'
}) {
  const color =
    tone === 'wrong'
      ? '#ef4444'
      : tone === 'gold'
        ? 'var(--gold-light)'
        : 'var(--text-muted)'
  return (
    <span>
      {label}{' '}
      <strong style={{ color }}>{value}</strong>
    </span>
  )
}

/**
 * Empty state — learner has no completed attempts yet, so no weak topics can be
 * derived.
 */
export function WeakTopicsEmpty() {
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
        ยังไม่มีข้อมูลหัวข้อที่ควรทบทวน
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        ทำข้อสอบให้ครบเพื่อให้ระบบวิเคราะห์หัวข้อที่คุณควรทบทวน
      </p>
    </div>
  )
}

/**
 * Positive state — the learner has completed attempts but no topic met the
 * weak-topic eligibility (too few encounters, or everything answered
 * correctly). Encourages more activity rather than showing a fake gap.
 */
export function WeakTopicsAllGood() {
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
        ยังไม่พบหัวข้อที่ควรทบทวนเป็นพิเศษ
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        ทำข้อสอบเพิ่มขึ้นอีกเล็กน้อยจะช่วยให้ระบบวิเคราะห์ผลได้แม่นยำขึ้น
      </p>
    </div>
  )
}
