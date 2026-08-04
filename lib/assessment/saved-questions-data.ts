/**
 * lib/assessment/saved-questions-data.ts
 * ----------------------------------------------------------------------------
 * Saved Questions (Phase 1F) — read-only data layer + pure helpers for question
 * bookmarks (assessment_question_bookmarks).
 *
 * Two responsibilities, mirroring the boundary discipline of
 * attempt-review-data.ts / dashboard-data.ts:
 *
 *   1. Pure helpers (input validation, bookmark-state mapping, preview
 *      trimming) — importable in a Node test with NO Supabase / next/headers
 *      side effects.
 *   2. Bounded read queries that hydrate (a) the review-page bookmark state
 *      for all displayed questions in ONE query, and (b) the newest ≤6
 *      bookmarks for the /exams dashboard.
 *
 * Boundary discipline:
 *   - Read-only. No writes (writes live in app/assessment/bookmark-actions.ts).
 *   - Authenticated server client only (RLS is the authority). No service role.
 *   - user_id resolved from the session by the caller, never trusted from
 *     client input.
 *   - Never throws: failures degrade to empty results so the dashboard and
 *     review page keep rendering their other sections.
 *   - No N+1: bookmark state is fetched in one bounded query per exam set;
 *     dashboard items are fetched in one bounded query with batched relations.
 */

// Type-only import for the `createClient` factory signature (erased at compile
// time so importing the pure helpers below does NOT pull the Supabase client /
// next/headers into a pure test context). The runtime client is obtained via a
// dynamic import inside the read functions, keeping the pure helpers
// side-effect free and unit-testable.
import type { createClient } from '@/lib/supabase/server'

// ─── Public shapes ───────────────────────────────────────────────────────────

/** The minimal context identifying one bookmarkable question on the review page. */
export interface BookmarkQuestionContext {
  questionId: string
  examSetId: string
  packageId: string
}

/** Bookmark state for one question on the review page. */
export interface QuestionBookmarkState {
  questionId: string
  /** True when the caller already has a bookmark for this (exam_set) context. */
  isBookmarked: boolean
  /** The bookmark id when bookmarked, else null (used as the remove target). */
  bookmarkId: string | null
}

/**
 * Map of questionId → bookmark state, handed to the review page. Every
 * displayed question gets an entry (defaulting to not-bookmarked) so the
 * button can render without a per-question lookup.
 */
export type BookmarkStateMap = Record<string, QuestionBookmarkState>

/** One dashboard "Saved Question" card's data. */
export interface SavedQuestionCard {
  bookmarkId: string
  questionId: string
  examSetId: string
  packageId: string
  /** Optional provenance: the attempt the bookmark was made from (may be null). */
  sourceAttemptId: string | null
  /** ISO timestamp the bookmark was created (for Thai date formatting). */
  createdAt: string
  /** Short, safe preview of the question text (plain text, no HTML). */
  questionPreview: string
  /** Whether the underlying question row is still available for display. */
  questionAvailable: boolean
  examSetName: string
  packageName: string
  packageSlug: string
}

/** Inputs shared by the read functions. */
export interface SavedQuestionsInput {
  /** Authenticated user id (resolved by the caller from the session). */
  userId: string
  /**
   * Package ids the learner currently owns (completed/free orders), resolved by
   * the caller. Reads are filtered to this set so only currently-accessible
   * bookmarks are surfaced.
   */
  ownedPackageIds: string[]
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Maximum number of dashboard items (per the Phase 1F spec). */
export const SAVED_QUESTIONS_DASHBOARD_LIMIT = 6

/**
 * Coerce arbitrary input to a trimmed non-empty string, or '' when invalid.
 * Used to sanitize UUID-shaped inputs before they reach a query. Pure.
 */
export function cleanId(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const v = raw.trim()
  return v
}

/** Loose UUID v4 shape check (hex + dashes, case-insensitive). Pure. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function looksLikeUuid(raw: string): boolean {
  return UUID_RE.test(raw)
}

/**
 * Build a short, safe preview of a question's content.
 * - Collapses all whitespace runs (including newlines) to single spaces.
 * - Trims to at most `max` characters, appending an ellipsis when truncated.
 * - Returns '' for null/empty/non-string input so the card can fall back.
 * Pure; never throws.
 */
export function buildQuestionPreview(
  content: string | null | undefined,
  max = 90,
): string {
  if (typeof content !== 'string') return ''
  const collapsed = content.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  const limit = Math.max(1, Math.trunc(max))
  if (collapsed.length <= limit) return collapsed
  return collapsed.slice(0, limit).trimEnd() + '…'
}

/**
 * Reduce a raw list of stored bookmark rows (for one user + exam set) into a
 * BookmarkStateMap keyed by questionId. Any question in `questionIds` that has
 * no row defaults to not-bookmarked. Pure; never throws.
 *
 * `rows` is treated as untrusted: each entry must carry question_id + id as
 * non-empty strings; malformed rows are skipped.
 */
export function mapBookmarkState(
  rows: unknown,
  questionIds: string[],
): BookmarkStateMap {
  const out: BookmarkStateMap = {}
  // Default every displayed question to "not bookmarked".
  for (const qid of questionIds) {
    out[qid] = { questionId: qid, isBookmarked: false, bookmarkId: null }
  }
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const row = r as Record<string, unknown>
    const questionId = cleanId(row.question_id)
    const id = cleanId(row.id)
    if (!questionId || !id) continue
    if (!(questionId in out)) continue // row for a question we don't display
    out[questionId] = { questionId, isBookmarked: true, bookmarkId: id }
  }
  return out
}

// ─── DB row shapes ───────────────────────────────────────────────────────────

interface BookmarkStateRow {
  id: string
  question_id: string
}

interface SavedQuestionRow {
  id: string
  question_id: string
  exam_set_id: string
  package_id: string
  source_attempt_id: string | null
  created_at: string
  questions: { content: string | null } | null
  exam_sets: { name: string } | null
  packages: { name: string; slug: string; is_published: boolean } | null
}

// ─── 1. Review-page bookmark state ───────────────────────────────────────────

/**
 * Fetch the caller's bookmark state for every question in `questionIds` that
 * belongs to `examSetId`, in ONE bounded query (no per-question lookup).
 *
 * Returns a BookmarkStateMap keyed by questionId; any displayed question with
 * no bookmark defaults to not-bookmarked. Never throws; on any failure returns
 * a map where every question is not-bookmarked (the review page then renders
 * all buttons in their default state — bookmarking still works, it just
 * optimistically flips on click).
 */
export async function fetchBookmarkStateMap(
  userId: string,
  examSetId: string,
  questionIds: string[],
  supabase?: Awaited<ReturnType<typeof createClient>>,
): Promise<BookmarkStateMap> {
  const empty: BookmarkStateMap = {}
  for (const qid of questionIds) {
    empty[qid] = { questionId: qid, isBookmarked: false, bookmarkId: null }
  }
  if (!userId || !examSetId || questionIds.length === 0) return empty
  try {
    const client = supabase ?? (await (await import('@/lib/supabase/server')).createClient())
    const { data, error } = await client
      .from('assessment_question_bookmarks')
      .select('id, question_id')
      .eq('user_id', userId)
      .eq('exam_set_id', examSetId)
      .in('question_id', questionIds)
    if (error) {
      console.error('fetchBookmarkStateMap failed:', error.message)
      return empty
    }
    return mapBookmarkState(data, questionIds)
  } catch (err: any) {
    console.error('fetchBookmarkStateMap unexpected error:', err?.message ?? err)
    return empty
  }
}

// ─── 2. Dashboard "newest bookmarks" ─────────────────────────────────────────

/**
 * Fetch at most SAVED_QUESTIONS_DASHBOARD_LIMIT newest bookmarks for the
 * caller, filtered to currently-owned packages, enriched with question preview
 * + exam-set/package display metadata via batched nested relations (no N+1).
 *
 * Drops any row whose related exam set/package is missing or unpublished so a
 * card never links somewhere invalid. A bookmark whose question row is gone is
 * still surfaced but marked questionAvailable=false (the dashboard renders a
 * safe fallback label instead of a preview). Never throws; returns [] on error.
 */
export async function fetchSavedQuestionCards(
  input: SavedQuestionsInput,
): Promise<SavedQuestionCard[]> {
  if (!input.userId || input.ownedPackageIds.length === 0) return []
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('assessment_question_bookmarks')
      .select(`
        id, question_id, exam_set_id, package_id, source_attempt_id, created_at,
        questions ( content ),
        exam_sets ( name ),
        packages ( name, slug, is_published )
      `)
      .eq('user_id', input.userId)
      .in('package_id', input.ownedPackageIds)
      .order('created_at', { ascending: false })
      .limit(SAVED_QUESTIONS_DASHBOARD_LIMIT)

    if (error) {
      console.error('fetchSavedQuestionCards failed:', error.message)
      return []
    }
    if (!data) return []

    const out: SavedQuestionCard[] = []
    // Cast through unknown: supabase-js infers nested relations as arrays, but
    // the singular questions/exam_sets/packages rows are objects here. This
    // mirrors the existing dashboard-data.ts pattern.
    for (const raw of data as unknown as SavedQuestionRow[]) {
      const pkg = raw.packages
      const examSet = raw.exam_sets
      // Skip bookmarks whose package/exam-set is gone (or unpublished) so a
      // card never links somewhere the learner can no longer reach.
      if (!pkg || pkg.is_published === false) continue
      if (!examSet) continue
      out.push({
        bookmarkId: raw.id,
        questionId: raw.question_id,
        examSetId: raw.exam_set_id,
        packageId: raw.package_id,
        sourceAttemptId: raw.source_attempt_id ?? null,
        createdAt: raw.created_at,
        questionPreview: buildQuestionPreview(raw.questions?.content ?? null),
        questionAvailable: !!raw.questions && raw.questions.content != null,
        examSetName: examSet.name,
        packageName: pkg.name,
        packageSlug: pkg.slug,
      })
    }
    return out
  } catch (err: any) {
    console.error('fetchSavedQuestionCards unexpected error:', err?.message ?? err)
    return []
  }
}
