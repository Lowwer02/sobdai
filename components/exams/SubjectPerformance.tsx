import type { SubjectPerformanceGroup } from '@/lib/assessment/learner-analytics'

/**
 * components/exams/SubjectPerformance.tsx
 * ----------------------------------------------------------------------------
 * Learning Analytics UX V1 (merge) — the /exams "วิชา" subject-insight block.
 *
 * Subject-level rollup of the recent (≤20) attempt window: one row per
 * eligible subject (≥3 encounters AND ≥1 miss), ranked weakest-first by the
 * pure deriveSubjectPerformance layer. Mirrors the retired
 * /assessment/analytics subject rows: tokenized card row, correct/total
 * caption, and a right-aligned accuracy chip whose tint is NEVER the only
 * signal — the number is always rendered as text.
 *
 * Pure Server Component: no client JS, no links (no per-subject target exists
 * in V1), no state. The parent gates rendering on non-empty data.
 */

/** Accuracy chip tone thresholds (same ladder the retired page used). */
function chipClassFor(accuracy: number): string {
  if (accuracy < 50) return 'text-destructive bg-destructive-bg'
  if (accuracy >= 80) return 'text-success bg-success-bg'
  return 'text-brand bg-brand-solid/10'
}

export default function SubjectPerformance({
  subjectPerformance,
}: {
  subjectPerformance: SubjectPerformanceGroup[]
}) {
  return (
    <ul
      aria-label="ผลการเรียนแยกตามรายวิชา"
      style={{ display: 'flex', flexDirection: 'column', gap: '10px', listStyle: 'none', margin: 0, padding: 0 }}
    >
      {subjectPerformance.map((s) => (
        <li
          key={s.label}
          className="border border-border-subtle bg-card rounded-xl px-4 py-3"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
        >
          <div className="min-w-0">
            <div className="text-foreground text-sm font-medium" style={{ wordBreak: 'break-word' }}>
              {s.label}
            </div>
            <div className="text-xs text-muted-foreground" style={{ marginTop: '2px' }}>
              ถูก {s.correct}/{s.total}
            </div>
          </div>
          <span
            className={`text-sm font-bold px-2.5 py-1 rounded-md flex-shrink-0 ${chipClassFor(s.accuracy)}`}
          >
            {s.accuracy}%
          </span>
        </li>
      ))}
    </ul>
  )
}
