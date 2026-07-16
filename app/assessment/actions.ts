'use server'

/**
 * app/assessment/actions.ts
 * ----------------------------------------------------------------------------
 * Assessment Platform — Epic 2: Outcome Persistence.
 *
 * Source of truth: "Assessment Platform Master Specification v1.0"
 *   - Part IV §26 (Assessment Persistence): "Store Once. Read Many." Persist
 *     only what has long-term value and is consumed by other systems.
 *   - Constitution AI-004: One Attempt → One Outcome.
 *   - Constitution AI-005: Outcome is immutable.
 *   - Constitution AI-006: Derived data never becomes authoritative — this
 *     module STORES the Outcome; it does not compute analytics, rankings, or
 *     recommendations.
 *
 * This module is the single write-path from the Runtime to Persistence. The
 * Runtime produces an AssessmentOutcome (Epic 1, lib/assessment/outcome.ts);
 * this module persists it. Downstream systems (Analytics, Leaderboard,
 * Recommendation — later epics) will READ from this store; none of them write.
 *
 * Boundary discipline (Constitution AI-003 / Part IV §27-29):
 *   - This module performs NO analytics (no trend computation, no weak-subject
 *     rollups across attempts).
 *   - It performs NO recommendation logic.
 *   - It produces NO rankings.
 *   - It only validates, maps, and inserts the one Outcome.
 *
 * Failure semantics: a persistence failure MUST NOT break the Runtime or the
 * learner's result screen. The action returns { success, error } and never
 * throws; the caller treats persistence as best-effort. (The Outcome object
 * the Runtime computed in-memory is the source of the on-screen result
 * regardless of whether persistence succeeded.)
 */

import { createClient } from '@/lib/supabase/server'
import type { AssessmentOutcome } from '@/lib/assessment/types'

// ─── Public return shape ────────────────────────────────────────────────────

export interface PersistOutcomeResult {
  success: boolean
  /** The persisted attempt id, when success. */
  id?: string
  /** Human-readable error message, when !success. Never thrown. */
  error?: string
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Persist one completed Assessment Outcome as the official learning history.
 *
 * The caller (Runtime) passes the AssessmentOutcome it computed at submit. The
 * user is resolved from the session — user_id is NEVER taken from the Outcome
 * object or trusted from the client, so a learner cannot forge another user's
 * attempt. RLS re-enforces this at the row level.
 *
 * Idempotency note: there is no natural unique key on (user, examSet, timestamp),
 * and the spec models retries as distinct Attempts (each producing its own
 * Outcome). The caller therefore must invoke this exactly once per Attempt;
 * double-invocation would create a duplicate history row. The Runtime wires this
 * into the submit transition, which fires once.
 */
export async function persistOutcome(
  outcome: AssessmentOutcome,
): Promise<PersistOutcomeResult> {
  try {
    const supabase = await createClient()

    // ── 1. Authenticate. user_id comes from the session, not the payload. ──
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // ── 2. Validate the Outcome has the minimum shape to persist. ─────────
    // Defensive: the Runtime always produces a complete Outcome, but a
    // malformed object must not corrupt history.
    if (!outcome?.examSetId || !outcome?.packageId) {
      return { success: false, error: 'Invalid outcome: missing identity.' }
    }
    if (!Array.isArray(outcome.questions)) {
      return { success: false, error: 'Invalid outcome: missing answer summary.' }
    }

    // ── 3. Map Outcome → storage row. ─────────────────────────────────────
    // The answer_summary carries the per-question record (the irreducible
    // core). We persist exactly what the Outcome computed — no derivation
    // happens here.
    const row = {
      user_id: user.id,
      exam_set_id: outcome.examSetId,
      package_id: outcome.packageId,
      mode: outcome.mode,
      total: outcome.total,
      score: outcome.score,
      answered_count: outcome.answeredCount,
      // incorrect_count is a generated column in the table; we do not set it.
      accuracy: outcome.accuracy,
      time_used_seconds: outcome.timeUsedSeconds,
      passing_score: outcome.passingScore,
      passed: outcome.passed,
      answer_summary: outcome.questions,
      completed_at: outcome.completedAt,
    }

    // ── 4. Insert (write-once; no update path exists by design). ──────────
    const { data, error } = await supabase
      .from('exam_attempts')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      // RLS denial, FK violation, etc. — surface the message for debugging
      // without throwing. The caller decides whether to log/suppress.
      console.error('persistOutcome: insert failed:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true, id: data.id }
  } catch (err: any) {
    // Last-resort guard: never let a persistence failure propagate as a throw
    // into the Runtime. The learner's result screen must still render.
    console.error('persistOutcome: unexpected error:', err?.message ?? err)
    return { success: false, error: err?.message ?? 'Unexpected persistence error.' }
  }
}

// ─── Retrieval (read-path; minimal, for future consumers) ───────────────────
// Epic 2's Definition of Done centers on persistence. A basic owned-history
// read is included because Persistence's responsibility (Part IV §26) includes
// "Retrieval" and "Historical record" — but it is deliberately a thin passthrough:
// NO analytics aggregation, NO trending, NO comparison. Future Analytics
// (Part IV §27) will build derivation layers ON TOP of this raw retrieval.

export interface AttemptHistoryItem {
  id: string
  exam_set_id: string
  package_id: string
  mode: 'practice' | 'simulation'
  total: number
  score: number
  answered_count: number
  accuracy: number
  time_used_seconds: number
  passing_score: number
  passed: boolean
  answer_summary: AssessmentOutcome['questions']
  completed_at: string
}

/**
 * Fetch the calling user's attempt history, newest first.
 *
 * Pure retrieval — returns raw persisted Outcomes, no aggregation. Pagination
 * is by limit/offset. Downstream Analytics will consume this (or query the
 * table directly) to derive trends; this helper exists so a single, owned,
 * analytics-free read-path is available.
 */
export async function fetchMyAttemptHistory(opts?: {
  limit?: number
  /** Optional scoping for future consumers (e.g. package analytics). */
  examSetId?: string
  packageId?: string
}): Promise<{ data: AttemptHistoryItem[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200)

    let query = supabase
      .from('exam_attempts')
      .select(`
        id, exam_set_id, package_id, mode,
        total, score, answered_count, accuracy, time_used_seconds,
        passing_score, passed, answer_summary, completed_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (opts?.examSetId) query = query.eq('exam_set_id', opts.examSetId)
    if (opts?.packageId) query = query.eq('package_id', opts.packageId)

    const { data, error } = await query
    if (error) {
      console.error('fetchMyAttemptHistory failed:', error.message)
      return { data: null, error: error.message }
    }
    return { data: (data as AttemptHistoryItem[]) ?? [], error: null }
  } catch (err: any) {
    console.error('fetchMyAttemptHistory: unexpected error:', err?.message ?? err)
    return { data: null, error: err?.message ?? 'Unexpected error.' }
  }
}
