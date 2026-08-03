'use server'

/**
 * app/assessment/session-actions.ts
 * ----------------------------------------------------------------------------
 * Assessment Platform — Phase 1A: Assessment Session server actions.
 *
 * This module is the single write/read path for IN-PROGRESS exam state
 * (assessment_sessions). It is a sibling to app/assessment/actions.ts, which
 * owns the COMPLETED Outcome (exam_attempts). The two never overlap:
 *
 *   - persistOutcome()  → exam_attempts (immutable Outcome).
 *   - *MyAssessmentSession() → assessment_sessions (mutable resume snapshot).
 *
 * Boundary discipline (mirrors actions.ts / Constitution AI-003, AI-006):
 *   - NO scoring, NO analytics, NO recommendation. This module only stores and
 *     retrieves the resume snapshot. The Outcome boundary computes results;
 *     this one never does.
 *   - NO service-role client. Every query runs through the user's cookie-bound
 *     Supabase client, so RLS is the authority and user_id is resolved from the
 *     session — never trusted from the client payload.
 *
 * Failure semantics (mirrors persistOutcome): every action is non-throwing and
 * returns { success, data?, error? }. The Runtime treats all of these as
 * best-effort — a session failure MUST NOT break the exam UI; the Runtime
 * continues in-memory from whatever state it has.
 */

import { createClient } from '@/lib/supabase/server'
import { normalizeMode } from '@/lib/assessment/types'
import {
  ACCESS_ORDER_STATUSES,
  STAFF_ROLES,
  clampIndex,
  validateAnswers,
  validateFlagged,
  validateNonNegativeInt,
} from '@/lib/assessment/session-types'
import type {
  AssessmentSessionRow,
  SessionActionResult,
  SessionSnapshot,
} from '@/lib/assessment/session-types'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a stored row to the client-facing snapshot. Strips user_id (the Runtime
 * never needs it — it is implicit) and converts snake_case → camelCase. The
 * Runtime receives only what it needs to hydrate.
 */
function toSnapshot(row: AssessmentSessionRow): SessionSnapshot {
  return {
    id: row.id,
    examSetId: row.exam_set_id,
    packageId: row.package_id,
    mode: row.mode,
    status: row.status,
    currentIndex: row.current_index,
    answers: row.answers ?? {},
    flagged: row.flagged ?? {},
    timeUsedSeconds: row.time_used_seconds ?? 0,
  }
}

/**
 * Resolve the authenticated user from the session cookie. Returns the user or
 * null. Centralized so every action resolves identity the same way and never
 * accepts a client-supplied user_id.
 */
async function resolveUser(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id } : null
}

/**
 * Access gate mirroring app/package/[slug]/exam/[examSetId]/page.tsx exactly.
 *
 * A learner may start/resume a session on an exam set iff ANY of:
 *   - the exam set is a sample (is_sample = true), OR
 *   - the learner has a completed order (status paid|free) for the package, OR
 *   - the learner's profile role is a staff role.
 *
 * This must match the route's gate so a learner who can OPEN the exam can also
 * RESUME it, and vice versa. Runs on the same cookie-bound client (RLS-aware).
 *
 * Returns true on grant, false on denial. Never throws.
 */
async function canAccessExamSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  examSet: { is_sample: boolean; package_id: string },
): Promise<boolean> {
  // Sample sets are open to any authenticated user.
  if (examSet.is_sample) return true

  // Staff bypass the order requirement.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (profile && (STAFF_ROLES as readonly string[]).includes(profile.role)) {
    return true
  }

  // Otherwise a completed (paid|free) order for the package is required.
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .eq('package_id', examSet.package_id)
    .in('status', ACCESS_ORDER_STATUSES as unknown as string[])
    .maybeSingle()
  return Boolean(order)
}

// ─── 1. getOrCreateMyAssessmentSession ──────────────────────────────────────

export interface GetOrCreateSessionInput {
  examSetId: string
  packageId: string
  mode: string
}

/**
 * Return the caller's active (in_progress) session for this exam set + mode,
 * creating one if none exists. Race-safe: two concurrent calls cannot create
 * two active sessions — the partial unique index (assessment_sessions_active_
 * unique_idx) rejects the second INSERT, and this action re-SELECTs and returns
 * the winner.
 *
 * Guarantees:
 *   - user_id is resolved from the session, never from the payload.
 *   - mode is normalized to 'practice' | 'simulation'.
 *   - the exam set must exist, belong to the given package, and be published.
 *   - the caller must pass the access gate (canAccessExamSet).
 *   - never returns another user's session (RLS + the user-scoped query).
 *   - never throws.
 */
export async function getOrCreateMyAssessmentSession(
  input: GetOrCreateSessionInput,
): Promise<SessionActionResult<SessionSnapshot>> {
  try {
    const user = await resolveUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const examSetId = String(input?.examSetId ?? '').trim()
    const packageId = String(input?.packageId ?? '').trim()
    const mode = normalizeMode(input?.mode)
    if (!examSetId || !packageId) {
      return { success: false, error: 'Missing examSetId or packageId.' }
    }

    const supabase = await createClient()

    // ── 1. Verify the exam set exists, is in this package, and is published.
    //    Mirrors the route's lookup. A draft/archived set is treated as absent.
    const { data: examSet, error: esErr } = await supabase
      .from('exam_sets')
      .select('id, package_id, is_sample, status')
      .eq('id', examSetId)
      .eq('package_id', packageId)
      .eq('status', 'published')
      .maybeSingle()
    if (esErr) {
      console.error('getOrCreateMyAssessmentSession: exam_set lookup failed:', esErr.message)
      return { success: false, error: 'Exam set lookup failed.' }
    }
    if (!examSet) {
      return { success: false, error: 'Exam set not found.' }
    }

    // ── 2. Access gate (sample | order | staff) — same tree as page.tsx.
    const allowed = await canAccessExamSet(supabase, user.id, {
      is_sample: examSet.is_sample,
      package_id: examSet.package_id,
    })
    if (!allowed) {
      return { success: false, error: 'Access denied.' }
    }

    // ── 3. Look for an existing active session first.
    const { data: existing, error: selErr } = await supabase
      .from('assessment_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('exam_set_id', examSetId)
      .eq('mode', mode)
      .eq('status', 'in_progress')
      .maybeSingle()
    if (selErr) {
      console.error('getOrCreateMyAssessmentSession: select failed:', selErr.message)
      return { success: false, error: 'Session lookup failed.' }
    }
    if (existing) {
      return { success: true, data: toSnapshot(existing as AssessmentSessionRow) }
    }

    // ── 4. None found → create. If two calls race, the partial unique index
    //    makes one INSERT fail with 23505; we then re-SELECT and return the
    //    winner instead of erroring. (Case 7.)
    const { data: created, error: insErr } = await supabase
      .from('assessment_sessions')
      .insert({
        user_id: user.id,
        exam_set_id: examSetId,
        package_id: packageId,
        mode,
        status: 'in_progress',
        current_index: 0,
        answers: {},
        flagged: {},
        time_used_seconds: 0,
      })
      .select('*')
      .maybeSingle()

    if (insErr) {
      // Race: another call created the active session first. Re-SELECT.
      if (insErr.code === '23505') {
        const { data: winner, error: reSelErr } = await supabase
          .from('assessment_sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('exam_set_id', examSetId)
          .eq('mode', mode)
          .eq('status', 'in_progress')
          .maybeSingle()
        if (reSelErr || !winner) {
          console.error('getOrCreateMyAssessmentSession: re-select after race failed:', reSelErr?.message)
          return { success: false, error: 'Session race could not be resolved.' }
        }
        return { success: true, data: toSnapshot(winner as AssessmentSessionRow) }
      }
      console.error('getOrCreateMyAssessmentSession: insert failed:', insErr.message)
      return { success: false, error: insErr.message }
    }
    if (!created) {
      return { success: false, error: 'Session could not be created.' }
    }
    return { success: true, data: toSnapshot(created as AssessmentSessionRow) }
  } catch (err: any) {
    console.error('getOrCreateMyAssessmentSession: unexpected error:', err?.message ?? err)
    return { success: false, error: err?.message ?? 'Unexpected error.' }
  }
}

// ─── 2. saveMyAssessmentSession ─────────────────────────────────────────────

export interface SaveSessionInput {
  sessionId: string
  answers: unknown
  flagged: unknown
  currentIndex: unknown
  timeUsedSeconds: unknown
}

/**
 * Autosave the caller's in-progress session. Validates every field with the
 * pure validators from session-types.ts, then UPDATEs only the caller's own
 * row that is still in_progress (the status predicate + RLS together guarantee
 * a completed session can never be rewritten, and another user's row is never
 * reachable).
 *
 * Never stores question content, choices, correct answers, or explanations —
 * only the choice letter the learner picked, flag booleans, position, and time.
 * Never throws.
 */
export async function saveMyAssessmentSession(
  input: SaveSessionInput,
): Promise<SessionActionResult> {
  try {
    const user = await resolveUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const sessionId = String(input?.sessionId ?? '').trim()
    if (!sessionId) return { success: false, error: 'Missing sessionId.' }

    // ── Validate payload (pure).
    const answersRes = validateAnswers(input.answers)
    if (!answersRes.ok) return { success: false, error: answersRes.error }
    const flaggedRes = validateFlagged(input.flagged)
    if (!flaggedRes.ok) return { success: false, error: flaggedRes.error }
    const indexRes = validateNonNegativeInt(input.currentIndex, 'currentIndex')
    if (!indexRes.ok) return { success: false, error: indexRes.error }
    const timeRes = validateNonNegativeInt(input.timeUsedSeconds, 'timeUsedSeconds')
    if (!timeRes.ok) return { success: false, error: timeRes.error }

    const supabase = await createClient()

    // UPDATE only an in-progress row owned by the caller, and SELECT back the
    // touched id. The `.eq('status', 'in_progress')` predicate means a row
    // that has since been completed (or that belongs to another user / does
    // not exist) matches ZERO rows — and PostgREST returns `data: null` with
    // no error in that case. We therefore MUST inspect the returned row to
    // distinguish a real save from a no-op: only a returned row is a success.
    // A generic message is used so a caller cannot tell whether the session
    // was already completed, belongs to someone else, or never existed.
    const { data, error } = await supabase
      .from('assessment_sessions')
      .update({
        answers: answersRes.value,
        flagged: flaggedRes.value,
        current_index: indexRes.value,
        time_used_seconds: timeRes.value,
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('saveMyAssessmentSession: update failed:', error.message)
      return { success: false, error: error.message }
    }
    // No row returned ⇒ zero rows matched (completed, not owned, or missing).
    // Report failure with a generic message. The Runtime treats any autosave
    // failure as non-fatal and keeps working in-memory, so this never crashes.
    if (!data) {
      return { success: false, error: 'Session not found or no longer active.' }
    }
    return { success: true }
  } catch (err: any) {
    console.error('saveMyAssessmentSession: unexpected error:', err?.message ?? err)
    return { success: false, error: err?.message ?? 'Unexpected error.' }
  }
}

// ─── 3. completeMyAssessmentSession ─────────────────────────────────────────

export interface CompleteSessionInput {
  sessionId: string
  outcomeAttemptId: string
}

/**
 * Close the caller's session: status → 'completed', record the Outcome
 * pointer, and stamp completed_at.
 *
 * Idempotency (verified, not assumed):
 *   - Already completed with the SAME outcomeAttemptId ⇒ success (no-op). A
 *     retry of the same submit is safe.
 *   - Already completed with a DIFFERENT outcomeAttemptId ⇒ failure. The row
 *     is finalized; a stale/second submit must not relink it to another
 *     Outcome.
 *   - In-progress, owned by the caller ⇒ the normal path; UPDATE succeeds.
 *
 * Verification: a PostgREST UPDATE that matches zero rows returns no error and
 * no row. We therefore SELECT the row back after the UPDATE and require a
 * returned row in the expected terminal state; otherwise we report a generic
 * failure. A pre-read of the caller-owned row disambiguates the idempotent
 * same-pointer case from a genuine not-found/owned-by-someone-else case
 * without disclosing which.
 *
 * This action performs NO Outcome computation and NO mutation of exam_attempts.
 * It only flips the session's lifecycle and links it to the Outcome that
 * persistOutcome() already wrote. Never throws.
 */
export async function completeMyAssessmentSession(
  input: CompleteSessionInput,
): Promise<SessionActionResult> {
  try {
    const user = await resolveUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const sessionId = String(input?.sessionId ?? '').trim()
    const outcomeAttemptId = String(input?.outcomeAttemptId ?? '').trim()
    if (!sessionId || !outcomeAttemptId) {
      return { success: false, error: 'Missing sessionId or outcomeAttemptId.' }
    }

    const supabase = await createClient()

    // ── Pre-read the caller-owned row to handle idempotency correctly.
    //    Scoped to the caller by user_id (RLS also enforces this). If the row
    //    is already completed with the SAME pointer, this is an idempotent
    //    retry → success without another write. A different pointer, or a
    //    missing row, is handled below with a generic message (no disclosure
    //    of whether the row belongs to someone else).
    const { data: existing, error: preErr } = await supabase
      .from('assessment_sessions')
      .select('id, status, outcome_attempt_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (preErr) {
      console.error('completeMyAssessmentSession: pre-read failed:', preErr.message)
      return { success: false, error: 'Session close failed.' }
    }
    if (existing) {
      const row = existing as { status: string; outcome_attempt_id: string | null }
      if (row.status === 'completed') {
        // Idempotent only when the same Outcome is being recorded again.
        if (row.outcome_attempt_id === outcomeAttemptId) {
          return { success: true }
        }
        // Already finalized against a different Outcome — refuse.
        return { success: false, error: 'Session is already completed.' }
      }
    }

    // ── UPDATE only the caller's in_progress row, and SELECT it back. The
    //    returned row is the proof the update actually happened; a missing row
    //    means zero rows matched (completed by a concurrent call, not owned,
    //    or not found) and is reported as a generic failure.
    const { data: updated, error } = await supabase
      .from('assessment_sessions')
      .update({
        status: 'completed',
        outcome_attempt_id: outcomeAttemptId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .select('id, status, outcome_attempt_id')
      .maybeSingle()

    if (error) {
      console.error('completeMyAssessmentSession: update failed:', error.message)
      return { success: false, error: error.message }
    }
    if (!updated) {
      // Zero rows matched. Generic message — does not reveal cross-user state.
      return { success: false, error: 'Session not found or no longer active.' }
    }
    return { success: true }
  } catch (err: any) {
    console.error('completeMyAssessmentSession: unexpected error:', err?.message ?? err)
    return { success: false, error: err?.message ?? 'Unexpected error.' }
  }
}

// Re-export the pure clamp helper for the Runtime so it has a single import
// surface for session utilities. (Kept here rather than importing
// session-types directly in the component to centralize the session API.)
export { clampIndex }
