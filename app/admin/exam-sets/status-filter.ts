// Status filter for the Admin Exam Sets list.
//
// Pure shared module — safe to import from BOTH the Server Component
// (app/admin/exam-sets/page.tsx) and the Client Component
// (app/admin/exam-sets/ExamSetsClient.tsx), and directly from the unit test.
//
// No "use client", no React, no browser APIs, no Supabase client.
//
// `exam_sets.status` is a TEXT column with a CHECK constraint
// (migration 026_exam_set_foundation.sql):
//   CHECK (status IN ('draft', 'published', 'archived'))
// It is NOT a Postgres enum, so there is no generated Database["public"]["Enums"]
// to reference. The union below mirrors the CHECK constraint exactly and is the
// single source of truth for both the DB values and the filter values.

/** Allowed `exam_sets.status` values — mirrors the DB CHECK constraint. */
export type ExamSetStatus = 'draft' | 'published' | 'archived'

/**
 * Filter selector value. `all` means "no status filter" — it is never sent to
 * the query and never persisted in the URL (selecting All removes `?status=`).
 */
export type ExamSetStatusFilter = 'all' | ExamSetStatus

/** Concrete DB status values, in display order for the <select>. */
export const EXAM_SET_STATUS_VALUES: readonly ExamSetStatus[] = [
  'draft',
  'published',
  'archived',
] as const

/**
 * Validate a raw `searchParams.status` value into a safe `ExamSetStatusFilter`.
 *
 * Anything that is not one of the three concrete statuses — including an array
 * value, an empty string, an unknown token like `random`, or `undefined` —
 * falls back to `'all'`. This value is therefore always safe to branch on and
 * never flows unchecked into a Supabase query.
 *
 * @example
 *   parseStatusParam(undefined)        // 'all'
 *   parseStatusParam('draft')         // 'draft'
 *   parseStatusParam('published')     // 'published'
 *   parseStatusParam('archived')      // 'archived'
 *   parseStatusParam('random')        // 'all'
 *   parseStatusParam('')              // 'all'
 *   parseStatusParam(['draft'])       // 'all' (array → fallback)
 */
export function parseStatusParam(
  raw: string | string[] | undefined
): ExamSetStatusFilter {
  if (typeof raw !== 'string') return 'all'
  return (EXAM_SET_STATUS_VALUES as readonly string[]).includes(raw)
    ? (raw as ExamSetStatus)
    : 'all'
}
