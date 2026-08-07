// Shared Exam Set status metadata.
//
// This is the single source of truth for the `exam_sets.status` lifecycle
// (migration 026_exam_set_foundation.sql):
//   CHECK (status IN ('draft', 'published', 'archived'))
//
// It lives under `lib/` (not `app/admin/exam-sets/`) so that route-agnostic
// components — notably components/admin/StatusBadge.tsx — can depend on it
// without a backwards dependency from a shared component into a route module.
// The Exam Sets admin page imports this too; the route-specific URL-filter
// behavior (ExamSetStatusFilter / parseStatusParam) stays in
// app/admin/exam-sets/status-filter.ts and re-exports these primitives.
//
// Pure module — no "use client", no React, no browser APIs, no Supabase client.

/**
 * Allowed `exam_sets.status` values — mirrors the DB CHECK constraint.
 * The column is TEXT (not a Postgres enum), so there is no generated
 * Database["public"]["Enums"] to reference; this union is authoritative.
 */
export type ExamSetStatus = 'draft' | 'published' | 'archived'

/** Concrete DB status values, in canonical/display order. */
export const EXAM_SET_STATUS_VALUES: readonly ExamSetStatus[] = [
  'draft',
  'published',
  'archived',
] as const

/**
 * Status options with human-readable labels, in display order for filters,
 * tabs, and badges. This is the single source of the Draft / Published /
 * Archived copy — StatusBadge and the Exam Sets admin UI both read labels
 * from here so the wording can never drift between them.
 */
export const EXAM_SET_STATUS_OPTIONS: readonly {
  value: ExamSetStatus
  label: string
}[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
] as const

/**
 * Safe label lookup for a status value. Returns `null` for any value that is
 * not one of the three concrete statuses (including null/undefined/unknown),
 * so callers can apply their own fallback (e.g. StatusBadge's neutral style).
 *
 * @example
 *   examSetStatusLabel('draft')      // 'Draft'
 *   examSetStatusLabel('published')  // 'Published'
 *   examSetStatusLabel('random')     // null
 *   examSetStatusLabel(null)         // null
 */
export function examSetStatusLabel(
  status: string | null | undefined
): string | null {
  if (typeof status !== 'string') return null
  for (const opt of EXAM_SET_STATUS_OPTIONS) {
    if (opt.value === status) return opt.label
  }
  return null
}
