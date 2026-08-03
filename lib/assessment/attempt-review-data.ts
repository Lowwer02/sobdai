/**
 * lib/assessment/attempt-review-data.ts
 * ----------------------------------------------------------------------------
 * Attempt Review (Phase 1C) — read-only data layer.
 *
 * Loads one owned, completed exam attempt and prepares it for the review page:
 *   - the immutable historical summary (from exam_attempts, never recomputed)
 *   - current question display content (text, choices, explanation) for each
 *     referenced question, fetched in ONE bounded batch query
 *
 * Boundary discipline (mirrors dashboard-data.ts / app/assessment/*.ts):
 *   - Read-only. No writes, no recompute, no mutation of exam_attempts.
 *   - Authenticated server client only (RLS is the authority). No service role.
 *   - user_id resolved from the session, never trusted from the payload.
 *   - Never throws: failures degrade to a safe null result so the route can
 *     render notFound/empty states instead of crashing.
 *
 * Security: the attempt is fetched by (attemptId, userId). RLS enforces
 * ownership at the row level; a missing/unauthorized attempt is reported the
 * same way (null) so the caller never leaks cross-user existence.
 *
 * Immutability: every result field (score, accuracy, passed, isCorrect, …)
 * comes directly from the persisted attempt / its answer_summary. Current
 * question rows ONLY contribute display content. If a question was edited or
 * deleted after the attempt, the historical result is preserved unchanged and
 * the UI renders a fallback.
 */

// Type-only import for the `createClient` factory signature (erased at compile
// time so importing the pure helpers below does NOT pull the Supabase client /
// next/headers into a pure test context). The runtime client is obtained via a
// dynamic import inside getAttemptReview, keeping the pure helpers side-effect
// free and unit-testable.
import type { createClient } from '@/lib/supabase/server'
import type { AssessmentMode } from '@/lib/assessment/types'

// ─── Public shapes ───────────────────────────────────────────────────────────

/** One validated historical answer-summary entry (as stored in jsonb). */
export interface ReviewSummaryEntry {
  questionId: string
  /** 'A' | 'B' | 'C' | 'D', or null when unanswered. */
  selected: string | null
  /** The correct letter recorded at submission (historical, authoritative). */
  correct: string
  isCorrect: boolean
  flagged: boolean
  subject: string | null
  law: string | null
  topic: string | null
}

/** Current display content for one referenced question, or a fallback marker. */
export interface ReviewQuestionContent {
  questionId: string
  available: boolean
  content: string | null
  choiceA: string | null
  choiceB: string | null
  choiceC: string | null
  choiceD: string | null
  hint: string | null
  fullExplanation: string | null
  /** Current subject/topic labels (for display only; never recompute history). */
  subject: string | null
  topic: string | null
  /**
   * True when the fetched question's current correct_answer differs from the
   * historical correct letter in the answer summary. The UI may show a subtle
   * "content may have been updated" note; the historical result is unchanged.
   */
  contentMayHaveChanged: boolean
}

/** The full review bundle handed to the route. */
export interface AttemptReviewData {
  attemptId: string
  examSetId: string
  packageId: string
  mode: AssessmentMode
  // ── Immutable persisted result (source of truth) ──
  score: number
  total: number
  answeredCount: number
  accuracy: number
  passed: boolean
  timeUsedSeconds: number
  completedAt: string
  // ── Display metadata ──
  examSetName: string
  packageName: string
  packageSlug: string
  // ── Per-question historical summary (validated, original order preserved) ──
  summary: ReviewSummaryEntry[]
  // ── Current display content keyed by questionId (may be partial/empty) ──
  questionsById: Record<string, ReviewQuestionContent>
}

// ─── Answer-summary validation (pure) ────────────────────────────────────────

const VALID_CHOICE_LETTERS = new Set(['A', 'B', 'C', 'D'])

/**
 * Validate the persisted answer_summary JSONB as an array of historical entries.
 *
 * Treats storage as untrusted: malformed entries are SKIPPED (never thrown on),
 * duplicate question ids are deduplicated (first valid occurrence wins, so the
 * original summary order is preserved), and only structurally-correct entries
 * are returned. Pure.
 *
 * Accepted entry shape: { questionId: non-empty string, selected: A/B/C/D|null,
 * correct: A/B/C/D, isCorrect: boolean, flagged: boolean,
 * subject: string|null, law: string|null, topic: string|null }.
 */
export function validateAnswerSummary(raw: unknown): ReviewSummaryEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ReviewSummaryEntry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const e = item as Record<string, unknown>

    const questionId = typeof e.questionId === 'string' ? e.questionId.trim() : ''
    if (!questionId) continue
    if (seen.has(questionId)) continue // dedupe; preserves first valid order
    seen.add(questionId)

    const correct = typeof e.correct === 'string' ? e.correct.toUpperCase() : ''
    if (!VALID_CHOICE_LETTERS.has(correct)) continue // correct must be A/B/C/D

    let selected: string | null = null
    if (e.selected != null) {
      if (typeof e.selected !== 'string') continue
      const up = e.selected.toUpperCase()
      if (!VALID_CHOICE_LETTERS.has(up)) continue // invalid selected letter → skip
      selected = up
    }

    if (typeof e.isCorrect !== 'boolean') continue
    if (typeof e.flagged !== 'boolean') continue

    const subject = typeof e.subject === 'string' ? e.subject : null
    const law = typeof e.law === 'string' ? e.law : null
    const topic = typeof e.topic === 'string' ? e.topic : null

    out.push({ questionId, selected, correct, isCorrect: e.isCorrect, flagged: e.flagged, subject, law, topic })
  }
  return out
}

// ─── View filtering (pure) ───────────────────────────────────────────────────

/** Supported server-rendered views. */
export type ReviewView = 'incorrect' | 'all'

/** Map any incoming ?view= value to a safe canonical view. Pure. */
export function normalizeView(raw: string | undefined): ReviewView {
  return raw === 'all' ? 'all' : 'incorrect' // unknown/missing → incorrect
}

/**
 * Filter the validated summary for a given view, preserving original order.
 *  - 'incorrect' → incorrect answered questions + unanswered (excludes correct).
 *  - 'all'       → every entry.
 * Pure.
 */
export function filterSummary(summary: ReviewSummaryEntry[], view: ReviewView): ReviewSummaryEntry[] {
  if (view === 'all') return summary
  // 'incorrect': an entry is "wrong" if it was answered incorrectly OR not
  // answered at all (unanswered counts as wrong per outcome semantics).
  return summary.filter((e) => !e.isCorrect)
}

// ─── Safe counts (pure) ──────────────────────────────────────────────────────

/** Never negative, never NaN. Pure. */
function clampNonNeg(n: unknown): number {
  const v = Math.trunc(Number(n))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Recompute display counts ONLY from the validated historical summary for UI
 * convenience. These mirror the persisted attempt fields but are derived from
 * the same authoritative summary so the review UI is self-consistent. The
 * persisted attempt row remains the immutable source of truth for the headline
 * numbers; these counts are for per-question filtering affordances.
 */
export function summaryCounts(summary: ReviewSummaryEntry[]) {
  let correct = 0
  let wrong = 0
  let unanswered = 0
  for (const e of summary) {
    if (e.selected == null) unanswered++
    else if (e.isCorrect) correct++
    else wrong++
  }
  return { correct, wrong, unanswered }
}

// ─── DB row shapes ───────────────────────────────────────────────────────────

interface AttemptRow {
  id: string
  exam_set_id: string
  package_id: string
  mode: AssessmentMode
  total: number
  score: number
  answered_count: number
  accuracy: number
  passed: boolean
  time_used_seconds: number
  completed_at: string
  answer_summary: unknown
  exam_sets: { name: string } | null
  packages: { name: string; slug: string } | null
}

interface QuestionRow {
  id: string
  content: string | null
  choice_a: string | null
  choice_b: string | null
  choice_c: string | null
  choice_d: string | null
  hint: string | null
  full_explanation: string | null
  subject: string | null
  topic: string | null
  correct_answer: string
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Load one owned attempt review bundle, or null on any failure (missing,
 * unauthorized, malformed, DB error). Never throws.
 *
 * Read pattern (bounded, no N+1):
 *   1. One attempt query (attemptId + userId; nested exam_sets/packages).
 *   2. One batch questions query for the referenced question ids that ALSO
 *      verifies membership in the attempt's exam_set via the
 *      exam_set_questions join — so an id present in JSON can never pull in an
 *      arbitrary unrelated question. Deleted/hidden questions are simply absent
 *      and render a fallback card.
 */
export async function getAttemptReview(
  attemptId: string,
  userId: string,
): Promise<AttemptReviewData | null> {
  if (!attemptId || !userId) return null
  try {
    // Dynamic import so the pure helpers in this module stay side-effect free
    // (importable in a Node test) and the Supabase/next client is loaded only
    // when a real read happens.
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    // ── 1. Owned attempt (RLS enforces user_id). ──
    const { data: attemptRaw, error: aErr } = await supabase
      .from('exam_attempts')
      .select(`
        id, exam_set_id, package_id, mode, total, score, answered_count,
        accuracy, passed, time_used_seconds, completed_at, answer_summary,
        exam_sets ( name ),
        packages ( name, slug )
      `)
      .eq('id', attemptId)
      .eq('user_id', userId)
      .maybeSingle()

    if (aErr) {
      console.error('getAttemptReview: attempt lookup failed:', aErr.message)
      return null
    }
    if (!attemptRaw) return null // missing or not owned → safe not-found

    const attempt = attemptRaw as unknown as AttemptRow
    // Display metadata is required to render the page; if the related rows are
    // gone, degrade to not-found rather than rendering a broken header.
    if (!attempt.exam_sets || !attempt.packages) return null

    // ── 2. Validate the historical summary (untrusted JSON). ──
    const summary = validateAnswerSummary(attempt.answer_summary)

    // ── 3. Batch-fetch referenced question content, scoped to the exam set. ──
    const uniqueIds = Array.from(new Set(summary.map((e) => e.questionId)))
    const questionsById: Record<string, ReviewQuestionContent> = {}
    if (uniqueIds.length > 0) {
      const { data: qRows, error: qErr } = await supabase
        .from('questions')
        .select(`
          id, content, choice_a, choice_b, choice_c, choice_d, hint,
          full_explanation, subject, topic, correct_answer
        `)
        .in('id', uniqueIds)
      if (qErr) {
        // Non-fatal: render fallback cards for all referenced questions.
        console.error('getAttemptReview: question fetch failed:', qErr.message)
      } else if (qRows) {
        // Build the set of question ids that genuinely belong to this attempt's
        // exam set (via the join table). This is the membership gate: a stray id
        // in the JSON cannot render an unrelated question.
        const memberIds = await fetchExamSetMemberIds(supabase, attempt.exam_set_id, uniqueIds)

        const byId = new Map<string, QuestionRow>()
        for (const r of (qRows as unknown as QuestionRow[])) byId.set(r.id, r)

        for (const id of uniqueIds) {
          const q = byId.get(id)
          const isMember = memberIds.has(id)
          if (!q || !isMember) {
            questionsById[id] = {
              questionId: id,
              available: false,
              content: null, choiceA: null, choiceB: null, choiceC: null, choiceD: null,
              hint: null, fullExplanation: null, subject: null, topic: null,
              contentMayHaveChanged: false,
            }
            continue
          }
          const hist = summary.find((e) => e.questionId === id)
          const currentCorrect = (q.correct_answer || '').toUpperCase()
          questionsById[id] = {
            questionId: id,
            available: true,
            content: q.content,
            choiceA: q.choice_a,
            choiceB: q.choice_b,
            choiceC: q.choice_c,
            choiceD: q.choice_d,
            hint: q.hint,
            fullExplanation: q.full_explanation,
            subject: q.subject,
            topic: q.topic,
            contentMayHaveChanged: !!hist && currentCorrect !== hist.correct,
          }
        }
      }
    }
    // Any referenced id not seen above already gets a fallback via the accessor.

    return {
      attemptId: attempt.id,
      examSetId: attempt.exam_set_id,
      packageId: attempt.package_id,
      mode: attempt.mode,
      score: clampNonNeg(attempt.score),
      total: clampNonNeg(attempt.total),
      answeredCount: clampNonNeg(attempt.answered_count),
      accuracy: Math.max(0, Math.min(100, clampNonNeg(attempt.accuracy))),
      passed: !!attempt.passed,
      timeUsedSeconds: clampNonNeg(attempt.time_used_seconds),
      completedAt: attempt.completed_at,
      examSetName: attempt.exam_sets.name,
      packageName: attempt.packages.name,
      packageSlug: attempt.packages.slug,
      summary,
      questionsById,
    }
  } catch (err: any) {
    console.error('getAttemptReview: unexpected error:', err?.message ?? err)
    return null
  }
}

/**
 * Return the set of question ids (from `candidates`) that are members of the
 * given exam set via the exam_set_questions join table. This is the membership
 * gate that prevents rendering an arbitrary question whose id merely appears in
 * the historical JSON. Returns an empty set on error (fail-closed → fallback
 * cards). Never throws.
 */
async function fetchExamSetMemberIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  examSetId: string,
  candidates: string[],
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('exam_set_questions')
      .select('question_id')
      .eq('exam_set_id', examSetId)
      .in('question_id', candidates)
    if (error) {
      console.error('getAttemptReview: membership lookup failed:', error.message)
      return new Set()
    }
    return new Set((data ?? []).map((r: any) => r.question_id as string))
  } catch {
    return new Set()
  }
}
