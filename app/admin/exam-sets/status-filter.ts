// Status filter for the Admin Exam Sets list.
//
// Route-specific URL-filter behavior for `?status=`. The shared status
// metadata (ExamSetStatus, EXAM_SET_STATUS_VALUES, EXAM_SET_STATUS_OPTIONS,
// label helper) lives in lib/exam-set-status.ts so route-agnostic components
// such as components/admin/StatusBadge.tsx can depend on it without a
// backwards dependency from a shared component into this route module.
//
// This module re-exports those primitives so the existing in-folder importers
// (page.tsx, ExamSetsClient.tsx, actions.ts, bulk-status.ts) keep working
// unchanged, and adds only the URL-filter concerns: ExamSetStatusFilter and
// parseStatusParam.
//
// Pure shared module — safe to import from BOTH the Server Component
// (app/admin/exam-sets/page.tsx) and the Client Component
// (app/admin/exam-sets/ExamSetsClient.tsx), and directly from the unit test.
//
// No "use client", no React, no browser APIs, no Supabase client.

// Re-export shared metadata so existing in-folder imports (`from './status-filter'`)
// continue to resolve. New consumers should import directly from
// lib/exam-set-status.ts.
//
// NOTE: this module is imported transitively by the unit tests, which run
// under plain `npx jiti` (no tsconfig `@/` alias resolution). The lib is at a
// stable relative depth, so a relative specifier is used here to keep the
// tests runnable without alias configuration. The build resolves either form.
export type {
  ExamSetStatus,
} from '../../../lib/exam-set-status'
export {
  EXAM_SET_STATUS_VALUES,
  EXAM_SET_STATUS_OPTIONS,
  examSetStatusLabel,
} from '../../../lib/exam-set-status'

import { EXAM_SET_STATUS_VALUES, type ExamSetStatus } from '../../../lib/exam-set-status'

/**
 * Filter selector value. `all` means "no status filter" — it is never sent to
 * the query and never persisted in the URL (selecting All removes `?status=`).
 */
export type ExamSetStatusFilter = 'all' | ExamSetStatus

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
