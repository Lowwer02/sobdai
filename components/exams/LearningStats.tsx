import type { LearningStatistics } from '@/lib/assessment/learner-analytics'
import { formatDuration } from '@/lib/assessment/dashboard-data'

/**
 * Learning Statistics section (Phase 1D) — "สถิติการเรียน".
 *
 * Pure Server Component. Renders compact metric cards for the recent
 * performance window (latest ≤20 completed attempts). Reuses the existing
 * formatDuration helper for a concise Thai-friendly total exam time. No client
 * JS, no charts in this phase. Uses the project's design tokens (.card, CSS
 * variables) for consistency with the rest of the dashboard.
 *
 * Scope note: metrics are explicitly RECENT (not lifetime) — see the small
 * scope note rendered under the title.
 */
export default function LearningStats({ statistics }: { statistics: LearningStatistics }) {
  const {
    attempts,
    overallAccuracy,
    passRate,
    totalAnswered,
    totalTimeSeconds,
  } = statistics

  return (
    <div
      className="card"
      style={{ padding: '24px' }}
    >
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
          สถิติการเรียน
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          คำนวณจากผลสอบล่าสุดสูงสุด 20 ครั้ง
        </p>
      </div>

      {/* Metric grid — responsive on mobile (2 cols) → wider (up to 5) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
        }}
      >
        <Metric label="ทำข้อสอบแล้ว" value={`${attempts}`} unit="ครั้ง" accent="var(--gold-light)" />
        <Metric label="ความแม่นยำรวม" value={`${overallAccuracy}`} unit="%" accent="var(--gold-light)" />
        <Metric label="อัตราผ่าน" value={`${passRate}`} unit="%" accent="#22c55e" />
        <Metric label="จำนวนข้อที่ตอบ" value={`${totalAnswered}`} unit="ข้อ" accent="var(--gold-light)" />
        <Metric
          label="เวลาทำข้อสอบรวม"
          value={formatDuration(totalTimeSeconds)}
          wide
          accent="var(--gold-light)"
        />
      </div>
    </div>
  )
}

/**
 * Empty state for the statistics section — shown when the learner has no
 * completed attempts yet. Explains that statistics appear after submitting an
 * exam (no fake data).
 */
export function LearningStatsEmpty() {
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
        ยังไม่มีสถิติการเรียน
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        เมื่อคุณส่งข้อสอบเสร็จ สถิติการเรียนล่าสุดจะปรากฏที่นี่
      </p>
    </div>
  )
}

/** One metric tile. `wide` lets a long-form value (e.g. duration) span fully. */
function Metric({
  label,
  value,
  unit,
  accent,
  wide,
}: {
  label: string
  value: string
  unit?: string
  accent: string
  wide?: boolean
}) {
  return (
    <div
      style={{
        gridColumn: wide ? '1 / -1' : undefined,
        padding: '14px 14px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: accent,
          lineHeight: 1.2,
          wordBreak: 'break-word',
        }}
      >
        {value}
        {unit ? (
          <span style={{ fontSize: '13px', fontWeight: 600, marginLeft: '3px' }}>{unit}</span>
        ) : null}
      </div>
    </div>
  )
}
