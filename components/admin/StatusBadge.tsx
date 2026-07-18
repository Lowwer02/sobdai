/**
 * Reusable badge for the exam_sets.status lifecycle (migration 026).
 *
 * Shared by the Exam Set list (ExamSetsClient) and the edit form's read-only
 * "At a Glance" panel so the styling stays consistent. Status values come from
 * the DB CHECK constraint: 'draft' | 'published' | 'archived'. Any unknown
 * value falls back to the neutral muted style so a future status never breaks
 * the UI.
 *
 * Deliberately presentation-only — no status logic, no transitions. The
 * lifecycle actions live in setExamSetStatusAction; this component just renders
 * whatever status it is given.
 */
type ExamSetStatus = 'draft' | 'published' | 'archived' | string | null | undefined

interface StatusBadgeProps {
  status: ExamSetStatus
  className?: string
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const base =
    'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap shrink-0'

  let style: string
  let label: string
  switch (status) {
    case 'published':
      style = 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20'
      label = 'Published'
      break
    case 'archived':
      style = 'text-[#A1866B] bg-black/30 border-[rgba(255,255,255,0.1)]'
      label = 'Archived'
      break
    case 'draft':
      style = 'text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/20'
      label = 'Draft'
      break
    default:
      // Unknown / null / undefined — neutral. Existing rows created before
      // migration 026 default to 'draft' at the DB, so this branch is only hit
      // if the row hasn't been touched yet AND the DB default hasn't applied.
      style = 'text-[#A1866B] bg-black/30 border-[rgba(255,255,255,0.1)]'
      label = status || '—'
  }

  return <span className={`${base} ${style} ${className}`}>{label}</span>
}
