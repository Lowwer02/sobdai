/**
 * lib/assessment/session-types.ts
 * ----------------------------------------------------------------------------
 * Assessment Session — domain types for in-progress exam state.
 *
 * Phase 1A (Assessment Session Foundation + Resume) introduces a SEPARATE
 * concept from the Outcome (lib/assessment/types.ts):
 *
 *   - AssessmentOutcome      (exam_attempts)  = COMPLETED, immutable result.
 *   - AssessmentSession      (assessment_sessions) = IN-PROGRESS, mutable
 *                                              snapshot of one attempt as it
 *                                              happens (answers, flagged,
 *                                              position, time used).
 *
 * A Session is the "resume point". It is created when a learner starts an exam,
 * overwritten as they answer (autosave), and closed on submit — at which point
 * it points at the freshly-persisted Outcome via outcome_attempt_id. It never
 * participates in scoring; the Outcome is the only source of truth for results.
 *
 * This module is pure: types + constants + pure validators. No DB, no React.
 * Both the server actions (app/assessment/session-actions.ts) and the Runtime
 * (ExamRuntime.tsx) import from here so the validation rules live in one place.
 */

import type { AssessmentMode } from './types'

// ─── Public constants ──────────────────────────────────────────────────────

/**
 * Profile roles treated as "staff" for access decisions. Mirrors the in-route
 * check in app/package/[slug]/exam/[examSetId]/page.tsx so the Session access
 * gate is identical to the page's gate. A staff member may start/resume a
 * session on any exam set even without a completed order (same as the page).
 */
export const STAFF_ROLES = ['admin', 'owner', 'editor', 'support'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/**
 * Order statuses that grant package access (paid or free). Mirrors
 * ORDER_COMPLETED_STATUSES in lib/orderUtils.ts; duplicated as a readonly
 * tuple here so this assessment-domain module does not need to import the
 * orders module (and so the constant is usable in the server action without a
 * runtime dependency on orderUtils' `as const` export shape).
 */
export const ACCESS_ORDER_STATUSES = ['paid', 'free'] as const

/** Session lifecycle states (Phase 1A). Closed enum in the DB CHECK too. */
export type SessionStatus = 'in_progress' | 'completed'

// ─── DB row shape (snake_case, as stored) ──────────────────────────────────
// Field naming matches the assessment_sessions columns. The server action maps
// between this row shape and the camelCase client-facing SessionSnapshot below.

export interface AssessmentSessionRow {
  id: string
  user_id: string
  exam_set_id: string
  package_id: string
  mode: AssessmentMode
  status: SessionStatus
  current_index: number
  answers: Record<string, string>     // { questionId: 'A'|'B'|'C'|'D' }
  flagged: Record<string, boolean>    // { questionId: boolean }
  time_used_seconds: number
  started_at: string
  updated_at: string
  completed_at: string | null
  outcome_attempt_id: string | null
}

// ─── Client-facing snapshot (camelCase, what the Runtime hydrates from) ─────

/**
 * The subset of a Session the Runtime needs to resume. Returned by
 * getOrCreateMyAssessmentSession on success. The Runtime never receives
 * user_id (it is implicit) — preventing any client-side forgery surface.
 */
export interface SessionSnapshot {
  id: string
  examSetId: string
  packageId: string
  mode: AssessmentMode
  status: SessionStatus
  currentIndex: number
  answers: Record<string, string>
  flagged: Record<string, boolean>
  timeUsedSeconds: number
}

// ─── Action result envelopes ────────────────────────────────────────────────
// Non-throwing: every action returns one of these. Callers never need try/catch.

export interface SessionActionResult<T = undefined> {
  success: boolean
  data?: T
  error?: string
}

// ─── Validation (pure, shared by server action + runtime) ──────────────────

const VALID_CHOICE_LETTERS = new Set(['A', 'B', 'C', 'D'])

/**
 * Validate the answers payload that the Runtime autosaves.
 * Accepts only { [questionId]: 'A'|'B'|'C'|'D' }. Unknown / malformed values
 * cause a rejection so bad data never lands in the session row.
 *
 * Returns a cleaned copy (uppercased letters) or an error message. Pure.
 */
export function validateAnswers(
  raw: unknown,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'answers must be an object.' }
  }
  const obj = raw as Record<string, unknown>
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== 'string' || key.length === 0) {
      return { ok: false, error: 'answers has an invalid key.' }
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `answers["${key}"] must be a choice letter.` }
    }
    const letter = value.toUpperCase()
    if (!VALID_CHOICE_LETTERS.has(letter)) {
      return { ok: false, error: `answers["${key}"] must be one of A/B/C/D.` }
    }
    cleaned[key] = letter
  }
  return { ok: true, value: cleaned }
}

/**
 * Validate the flagged payload: { [questionId]: boolean }. Pure.
 */
export function validateFlagged(
  raw: unknown,
): { ok: true; value: Record<string, boolean> } | { ok: false; error: string } {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'flagged must be an object.' }
  }
  const obj = raw as Record<string, unknown>
  const cleaned: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== 'string' || key.length === 0) {
      return { ok: false, error: 'flagged has an invalid key.' }
    }
    // Coerce truthy/falsy loosely to boolean but reject non-booleanish types
    // to avoid silently persisting strings/numbers as flags.
    if (typeof value !== 'boolean') {
      return { ok: false, error: `flagged["${key}"] must be a boolean.` }
    }
    cleaned[key] = value
  }
  return { ok: true, value: cleaned }
}

/**
 * Validate an integer index payload. Must be a non-negative integer. Pure.
 */
export function validateNonNegativeInt(
  raw: unknown,
  field: string,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return { ok: false, error: `${field} must be a non-negative integer.` }
  }
  return { ok: true, value: raw }
}

/**
 * Clamp an index into the valid question range. Used by the Runtime both on
 * resume AND during render so a stale (e.g. since-edited) current_index never
 * reads past the end of the live question list, and a non-finite or fractional
 * index never yields an undefined element. Pure and SYNCHRONOUS — it must
 * never be async or return a Promise, because the Runtime calls it during
 * render. (Importing it through a 'use server' module turns it into a server
 * action reference and makes the return value a Promise; always import this
 * directly from session-types.)
 *
 *   clampIndex(0, 40)    => 0
 *   clampIndex(-1, 40)   => 0
 *   clampIndex(99, 40)   => 39
 *   clampIndex(0, 0)     => 0
 *   clampIndex(NaN, 40)  => 0
 *   clampIndex(1.5, 40)  => 1
 */
export function clampIndex(index: number, questionCount: number): number {
  if (questionCount <= 0) return 0
  if (!Number.isFinite(index)) return 0

  const normalizedIndex = Math.trunc(index)

  if (normalizedIndex < 0) return 0
  if (normalizedIndex >= questionCount) return questionCount - 1

  return normalizedIndex
}
