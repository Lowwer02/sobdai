'use server'

/**
 * app/assessment/bookmark-actions.ts
 * ----------------------------------------------------------------------------
 * Assessment Platform — Phase 1F: Saved Questions (bookmark) server actions.
 *
 * This module is the single write path for question bookmarks
 * (assessment_question_bookmarks). It is a sibling to:
 *   - session-actions.ts → in-progress exam state (assessment_sessions)
 *   - actions.ts         → completed Outcome (exam_attempts)
 *
 * Boundary discipline (mirrors session-actions.ts / Constitution AI-003):
 *   - NO analytics, NO scoring, NO recommendation. This module only creates
 *     and removes bookmarks.
 *   - NO service-role client. Every query runs through the user's cookie-bound
 *     Supabase client, so RLS is the authority and user_id is resolved from the
 *     session — never trusted from the client payload.
 *
 * Failure semantics (mirrors session-actions.ts): every action is non-throwing
 * and returns { success, data?, error? }. A bookmark failure MUST NOT break the
 * review page; the button treats any failure as non-fatal and keeps the UI in
 * its prior state.
 *
 * NOTE on imports: the access-control constants (ACCESS_ORDER_STATUSES,
 * STAFF_ROLES) are imported from the PURE module lib/assessment/session-types
 * (the canonical source of truth — also used by session-actions.ts and the
 * exam route). They must NOT be redefined locally; a local copy would silently
 * drift from the real access gate. Only the pure id helpers (cleanId,
 * looksLikeUuid) come from saved-questions-data.ts.
 */

import { createClient } from '@/lib/supabase/server'
import { ACCESS_ORDER_STATUSES, STAFF_ROLES } from '@/lib/assessment/session-types'
import { cleanId, looksLikeUuid } from '@/lib/assessment/saved-questions-data'

// ─── Action result envelope ──────────────────────────────────────────────────
// Non-throwing: every action returns one of these. Callers never need try/catch.

export interface BookmarkActionResult<T = undefined> {
  success: boolean
  data?: T
  error?: string
}

/** Data returned from a successful save/remove so the button can update. */
export interface BookmarkMutationData {
  /** True when the bookmark now exists; false after a successful remove. */
  isBookmarked: boolean
  /** The bookmark id when bookmarked, else null. */
  bookmarkId: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
 * Access gate mirroring app/package/[slug]/exam/[examSetId]/page.tsx and
 * session-actions.ts exactly.
 *
 * A learner may bookmark a question in an exam set iff ANY of:
 *   - the exam set is a sample (is_sample = true), OR
 *   - the learner has a completed order (status paid|free) for the package, OR
 *   - the learner's profile role is a staff role.
 *
 * Runs on the same cookie-bound client (RLS-aware). Returns true on grant,
 * false on denial. Never throws.
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

/**
 * Verify the full bookmark context for an INSERT:
 *   - the exam set exists, is published, and belongs to the supplied package.
 *   - the question is a member of that exam set (via exam_set_questions).
 *   - the caller passes the access gate.
 *   - when sourceAttemptId is supplied: it is a completed attempt owned by the
 *     caller whose exam_set_id matches (so a bookmark can never be forged
 *     against another user's attempt, and never points at an unrelated attempt).
 *
 * Returns { ok: true } on success or { ok: false, error }. Never throws.
 * Errors are generic so a caller cannot probe cross-user existence.
 */
async function verifyBookmarkContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ctx: { questionId: string; examSetId: string; packageId: string; sourceAttemptId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // ── 1. Exam set exists, is in this package, and is published.
  const { data: examSet, error: esErr } = await supabase
    .from('exam_sets')
    .select('id, package_id, is_sample, status')
    .eq('id', ctx.examSetId)
    .eq('package_id', ctx.packageId)
    .eq('status', 'published')
    .maybeSingle()
  if (esErr) {
    console.error('saveMyQuestionBookmark: exam_set lookup failed:', esErr.message)
    return { ok: false, error: 'Exam set lookup failed.' }
  }
  if (!examSet) {
    return { ok: false, error: 'Exam set not found.' }
  }

  // ── 2. Access gate (sample | order | staff) — same tree as the route.
  const allowed = await canAccessExamSet(supabase, userId, {
    is_sample: examSet.is_sample,
    package_id: examSet.package_id,
  })
  if (!allowed) {
    return { ok: false, error: 'Access denied.' }
  }

  // ── 3. The question is genuinely a member of this exam set (membership
  //    gate via the join table). Prevents a stray/question id from bookmarking
  //    an unrelated question under a valid exam set.
  const { data: membership, error: mErr } = await supabase
    .from('exam_set_questions')
    .select('exam_set_id')
    .eq('exam_set_id', ctx.examSetId)
    .eq('question_id', ctx.questionId)
    .maybeSingle()
  if (mErr) {
    console.error('saveMyQuestionBookmark: membership lookup failed:', mErr.message)
    return { ok: false, error: 'Question membership lookup failed.' }
  }
  if (!membership) {
    return { ok: false, error: 'Question does not belong to this exam set.' }
  }

  // ── 4. Optional source-attempt provenance: must be owned by the caller and
  //    reference the SAME exam set (context match). This prevents a bookmark
  //    from silently pointing at another user's attempt, or at an attempt for
  //    a different exam set.
  if (ctx.sourceAttemptId) {
    const { data: attempt, error: aErr } = await supabase
      .from('exam_attempts')
      .select('id, exam_set_id')
      .eq('id', ctx.sourceAttemptId)
      .eq('user_id', userId)
      .maybeSingle()
    if (aErr) {
      console.error('saveMyQuestionBookmark: attempt lookup failed:', aErr.message)
      return { ok: false, error: 'Attempt lookup failed.' }
    }
    if (!attempt) {
      return { ok: false, error: 'Attempt not found.' }
    }
    if (attempt.exam_set_id !== ctx.examSetId) {
      return { ok: false, error: 'Attempt does not match this exam set.' }
    }
  }

  return { ok: true }
}

// ─── 1. saveMyQuestionBookmark ───────────────────────────────────────────────

export interface SaveBookmarkInput {
  questionId: unknown
  examSetId: unknown
  packageId: unknown
  sourceAttemptId?: unknown
}

/**
 * Bookmark a question for the caller, scoped to one (exam_set) context.
 *
 * Guarantees:
 *   - user_id is resolved from the session, never from the payload.
 *   - inputs are validated as non-empty uuid-shaped strings.
 *   - the question must be a member of the supplied exam set (membership gate).
 *   - the exam set must belong to the supplied package and be published.
 *   - the caller must pass the access gate (sample | order | staff).
 *   - when sourceAttemptId is supplied, it is verified as the caller's own
 *     completed attempt for the same exam set.
 *   - INSERT is idempotent: a repeat save for the same (question, exam_set) is
 *     a no-op that reports success and returns the existing bookmark id.
 *   - never returns another user's bookmark (RLS + user-scoped query).
 *   - never throws.
 */
export async function saveMyQuestionBookmark(
  input: SaveBookmarkInput,
): Promise<BookmarkActionResult<BookmarkMutationData>> {
  try {
    const user = await resolveUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const questionId = cleanId(input?.questionId)
    const examSetId = cleanId(input?.examSetId)
    const packageId = cleanId(input?.packageId)
    const sourceAttemptIdRaw = cleanId(input?.sourceAttemptId)
    const sourceAttemptId = sourceAttemptIdRaw || null

    if (!questionId || !looksLikeUuid(questionId)) {
      return { success: false, error: 'Invalid questionId.' }
    }
    if (!examSetId || !looksLikeUuid(examSetId)) {
      return { success: false, error: 'Invalid examSetId.' }
    }
    if (!packageId || !looksLikeUuid(packageId)) {
      return { success: false, error: 'Invalid packageId.' }
    }
    if (sourceAttemptId && !looksLikeUuid(sourceAttemptId)) {
      return { success: false, error: 'Invalid sourceAttemptId.' }
    }

    const supabase = await createClient()

    // ── Verify the full context before writing.
    const verified = await verifyBookmarkContext(supabase, user.id, {
      questionId,
      examSetId,
      packageId,
      sourceAttemptId,
    })
    if (!verified.ok) return { success: false, error: verified.error }

    // ── Idempotent INSERT. ON CONFLICT (user_id, question_id, exam_set_id)
    //    DO NOTHING means a repeat save is a no-op; we then SELECT the existing
    //    row (scoped to the caller) to return its id. A race between two saves
    //    resolves the same way: one INSERT wins, the other conflicts, both
    //    SELECT the winner.
    const { error: insErr } = await supabase
      .from('assessment_question_bookmarks')
      .upsert(
        {
          user_id: user.id,
          question_id: questionId,
          exam_set_id: examSetId,
          package_id: packageId,
          source_attempt_id: sourceAttemptId,
        },
        { onConflict: 'user_id,question_id,exam_set_id', ignoreDuplicates: true },
      )
    if (insErr) {
      console.error('saveMyQuestionBookmark: insert failed:', insErr.message)
      return { success: false, error: insErr.message }
    }

    // SELECT the caller's bookmark row to recover the id (works whether the row
    // was just inserted or already existed). Scoped to the caller; RLS also
    // enforces this.
    const { data: row, error: selErr } = await supabase
      .from('assessment_question_bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .eq('exam_set_id', examSetId)
      .maybeSingle()
    if (selErr || !row) {
      console.error('saveMyQuestionBookmark: post-insert select failed:', selErr?.message)
      return { success: false, error: 'Bookmark could not be confirmed.' }
    }
    return {
      success: true,
      data: { isBookmarked: true, bookmarkId: row.id },
    }
  } catch (err: any) {
    console.error('saveMyQuestionBookmark: unexpected error:', err?.message ?? err)
    return { success: false, error: err?.message ?? 'Unexpected error.' }
  }
}

// ─── 2. removeMyQuestionBookmark ─────────────────────────────────────────────

export interface RemoveBookmarkInput {
  /** The bookmark id to remove, OR the (questionId, examSetId) to resolve. */
  bookmarkId?: unknown
  questionId?: unknown
  examSetId?: unknown
}

/**
 * Remove a bookmark owned by the caller.
 *
 * Accepts EITHER:
 *   - bookmarkId (preferred — the exact row), OR
 *   - (questionId, examSetId) — resolved to the caller's own bookmark row.
 *
 * Guarantees:
 *   - user_id is resolved from the session, never from the payload.
 *   - only the caller's own bookmark can be removed (user-scoped DELETE; RLS
 *     re-enforces this).
 *   - idempotent: removing a bookmark that is already gone is a success no-op.
 *   - never reveals whether a bookmark belonged to another user (a missing/
 *     not-owned bookmark is reported the same way as success).
 *   - never throws.
 */
export async function removeMyQuestionBookmark(
  input: RemoveBookmarkInput,
): Promise<BookmarkActionResult<BookmarkMutationData>> {
  try {
    const user = await resolveUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const bookmarkId = cleanId(input?.bookmarkId)
    const questionId = cleanId(input?.questionId)
    const examSetId = cleanId(input?.examSetId)

    const supabase = await createClient()

    // Resolve the exact row to delete. Prefer an explicit bookmarkId; fall back
    // to (questionId, examSetId). Always scope to the caller so we never touch
    // another user's bookmark.
    let targetId: string | null = null
    if (bookmarkId) {
      if (!looksLikeUuid(bookmarkId)) {
        return { success: false, error: 'Invalid bookmarkId.' }
      }
      const { data: row, error } = await supabase
        .from('assessment_question_bookmarks')
        .select('id')
        .eq('id', bookmarkId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) {
        console.error('removeMyQuestionBookmark: lookup failed:', error.message)
        return { success: false, error: error.message }
      }
      targetId = row?.id ?? null
    } else if (questionId && examSetId) {
      if (!looksLikeUuid(questionId) || !looksLikeUuid(examSetId)) {
        return { success: false, error: 'Invalid questionId or examSetId.' }
      }
      const { data: row, error } = await supabase
        .from('assessment_question_bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq('question_id', questionId)
        .eq('exam_set_id', examSetId)
        .maybeSingle()
      if (error) {
        console.error('removeMyQuestionBookmark: lookup failed:', error.message)
        return { success: false, error: error.message }
      }
      targetId = row?.id ?? null
    } else {
      return { success: false, error: 'Missing bookmarkId or (questionId, examSetId).' }
    }

    // Idempotent: a missing/already-removed bookmark is a success no-op. We do
    // NOT disclose whether the row existed (no cross-user leak).
    if (!targetId) {
      return { success: true, data: { isBookmarked: false, bookmarkId: null } }
    }

    const { error: delErr } = await supabase
      .from('assessment_question_bookmarks')
      .delete()
      .eq('id', targetId)
      .eq('user_id', user.id)

    if (delErr) {
      console.error('removeMyQuestionBookmark: delete failed:', delErr.message)
      return { success: false, error: delErr.message }
    }
    return { success: true, data: { isBookmarked: false, bookmarkId: null } }
  } catch (err: any) {
    console.error('removeMyQuestionBookmark: unexpected error:', err?.message ?? err)
    return { success: false, error: err?.message ?? 'Unexpected error.' }
  }
}
