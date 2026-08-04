/**
 * lib/assessment/activity-timeline.ts
 * ----------------------------------------------------------------------------
 * Phase 1E — Dashboard Activity Timeline.
 *
 * Merges two bounded recent-activity streams into one newest-first timeline:
 *   1. exam_attempts      → "ส่งข้อสอบแล้ว"      (a completed exam event)
 *   2. assessment_sessions → "บันทึกความคืบหน้า" (an active/resumed progress event)
 *
 * Boundary discipline (mirrors dashboard-data.ts / learner-analytics.ts):
 *   - The PURE merge/sanitize helpers (sanitizeCompletedEvent,
 *     sanitizeProgressEvent, mergeTimeline) have NO database access and NO side
 *     effects — they are unit-testable without Supabase / cookies / Next.
 *   - The ONLY server-only piece is getTimeline(), which performs two bounded
 *     read-only queries and feeds the pure layer.
 *   - Authenticated server client only (RLS is an additional authority). No
 *     service role. Never throws — failures degrade to an empty list so the
 *     dashboard never crashes. Never exposes raw DB errors.
 *   - Treats persisted data as untrusted: every numeric is sanitized, the
 *     answers JSON is counted defensively (only A/B/C/D), and rows with missing
 *     relationships (deleted exam set / package) are skipped safely.
 *
 * Each database row maps to AT MOST ONE timeline item — there are no synthetic
 * per-answer events.
 */

// Type-only import for the createClient factory signature (erased at compile
// time so importing the PURE helpers below does NOT pull the Supabase client /
// next/headers into a pure test context). The runtime client is obtained via a
// dynamic import inside getTimeline, keeping the pure helpers side-effect free
// and unit-testable.
import type { createClient } from '@/lib/supabase/server'
import type { AssessmentMode } from '@/lib/assessment/types'

// ─── Timeline window ────────────────────────────────────────────────────────

/** Max completed-attempt events fetched. */
export const TIMELINE_MAX_COMPLETED = 10
/** Max active-session events fetched. */
export const TIMELINE_MAX_ACTIVE = 5
/** Max merged timeline items returned to the UI. */
export const TIMELINE_MAX_ITEMS = 10

// ─── Sanitization (pure, defensive) ──────────────────────────────────────────

const VALID_CHOICE_LETTERS = new Set(['A', 'B', 'C', 'D'])

/**
 * Coerce an untrusted value to a safe non-negative integer. NaN/Infinity and
 * non-numeric inputs become 0; negatives become 0. Pure.
 */
function sanitizeNonNegInt(n: unknown): number {
  const v = Math.trunc(Number(n))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Coerce an untrusted numeric to a safe integer clamped to [0, max]. Pure.
 */
function sanitizeClampedInt(n: unknown, max: number): number {
  const v = sanitizeNonNegInt(n)
  return Math.min(v, Math.max(0, max))
}

/**
 * Count answered questions from a persisted answers JSON object. Only entries
 * whose value is a valid choice letter (A/B/C/D) count, so malformed/legacy
 * values can never inflate the progress figure. Pure & defensive.
 *
 * (dashboard-data.ts has an equivalent private helper; it is not exported and
 * that file is outside the Phase 1E edit set, so this local copy keeps the
 * timeline module self-contained without creating competing public logic.)
 */
function countValidAnswers(answers: unknown): number {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 0
  let n = 0
  for (const v of Object.values(answers as Record<string, unknown>)) {
    if (typeof v === 'string' && VALID_CHOICE_LETTERS.has(v)) n++
  }
  return n
}

// ─── Event model (the pure layer's output) ───────────────────────────────────

export type TimelineEventKind = 'completed' | 'progress'

/**
 * One normalized timeline event. Every numeric is already defensive (never
 * NaN/Infinity/negative; score/answered clamped). Both kinds share this shape;
 * kind-specific fields (passed / progress totals) are populated where relevant.
 */
export interface TimelineEvent {
  /** Discriminator: a completed attempt vs. an active-session progress save. */
  kind: TimelineEventKind
  /** Sort key — the event's timestamp as a UTC epoch millis (stable numeric). */
  ts: number
  /** Source row id (attempt id or session id) — used as React key + URL basis. */
  id: string
  /** Canonical assessment mode (drives the mode label + resume URL). */
  mode: AssessmentMode
  /**
   * Exam-set id (used to build the resume URL for progress events, mirroring
   * ContinueLearningCard's `/package/{slug}/exam/{examSetId}` route). Always
   * present on a valid event because the source row carries exam_set_id.
   */
  examSetId: string
  /** Display names (already null-checked against missing relationships). */
  packageName: string
  packageSlug: string
  examSetName: string
  /** ISO timestamp of the event (completed_at or updated_at). */
  timestamp: string

  // ── completed-attempt specifics ──
  score: number
  total: number
  passed: boolean

  // ── active-session specifics ──
  answeredCount: number
  /** Published question count for this exam set (from the count map). */
  totalQuestions: number
}

/** The safe empty fallback (no events / query failure). */
export const EMPTY_TIMELINE: TimelineEvent[] = []

// ─── Sanitizers for raw DB rows → timeline events (pure) ─────────────────────

/** Required display-name relationship shape. */
interface RelationNames {
  exam_sets?: { name: string; status?: string } | null
  packages?: { name: string; slug: string; is_published?: boolean } | null
}

/**
 * Build a completed-attempt timeline event from a raw DB row. Returns null when
 * the row lacks a valid id or its exam-set/package relationship is missing (so
 * a deleted relationship never renders a broken event). All numerics are
 * sanitized and clamped. Pure.
 */
export function sanitizeCompletedEvent(raw: {
  id?: unknown
  exam_set_id?: unknown
  mode?: unknown
  score?: unknown
  total?: unknown
  passed?: unknown
  completed_at?: unknown
  exam_sets?: { name: string } | null
  packages?: { name: string; slug: string; is_published?: boolean } | null
}): TimelineEvent | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null
  const names = raw as RelationNames
  // Skip events whose exam set / package relationship is gone so the timeline
  // never links to a deleted route or renders an empty name.
  if (!names.exam_sets?.name || !names.packages?.name || !names.packages?.slug) {
    return null
  }
  // exam_set_id is required to build a valid resume URL; drop the row if absent.
  if (typeof raw.exam_set_id !== 'string' || !raw.exam_set_id) return null
  const total = sanitizeNonNegInt(raw.total)
  const ts = toMillis(raw.completed_at)
  return {
    kind: 'completed',
    ts,
    id: raw.id,
    mode: toMode(raw.mode),
    examSetId: raw.exam_set_id,
    packageName: names.packages.name,
    packageSlug: names.packages.slug,
    examSetName: names.exam_sets.name,
    timestamp: typeof raw.completed_at === 'string' ? raw.completed_at : '',
    score: sanitizeClampedInt(raw.score, total),
    total,
    passed: raw.passed === true,
    answeredCount: 0,
    totalQuestions: 0,
  }
}

/**
 * Build an active-session progress event from a raw DB row. Returns null when
 * the row lacks a valid id or its relationship is missing. `answeredCount` is
 * derived defensively from the answers JSON (A/B/C/D only). Pure.
 */
export function sanitizeProgressEvent(
  raw: {
    id?: unknown
    exam_set_id?: unknown
    mode?: unknown
    answers?: unknown
    updated_at?: unknown
    exam_sets?: { name: string; status?: string } | null
    packages?: { name: string; slug: string; is_published?: boolean } | null
  },
  examSetQuestionCounts: Record<string, number>,
): TimelineEvent | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null
  const names = raw as RelationNames
  if (!names.exam_sets?.name || !names.packages?.name || !names.packages?.slug) {
    return null
  }
  // exam_set_id is required to build a valid resume URL; drop the row if absent.
  if (typeof raw.exam_set_id !== 'string' || !raw.exam_set_id) return null
  const examSetId = raw.exam_set_id
  const totalQuestions = sanitizeNonNegInt(examSetQuestionCounts[examSetId])
  const ts = toMillis(raw.updated_at)
  return {
    kind: 'progress',
    ts,
    id: raw.id,
    mode: toMode(raw.mode),
    examSetId,
    packageName: names.packages.name,
    packageSlug: names.packages.slug,
    examSetName: names.exam_sets.name,
    timestamp: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    score: 0,
    total: 0,
    passed: false,
    answeredCount: countValidAnswers(raw.answers),
    totalQuestions,
  }
}

// ─── Merge + ordering (pure) ─────────────────────────────────────────────────

/**
 * Merge completed + progress events into one newest-first list, capped at
 * TIMELINE_MAX_ITEMS (10).
 *
 * Ordering (stable + deterministic):
 *   1. timestamp descending (newest first) — primary.
 *   2. completed-before-progress on an exact timestamp tie — so two events at
 *      the same instant present the terminal (more informative) event first.
 *   3. id ascending — a final deterministic tie-break that does not depend on
 *      input array order, so re-ordering the inputs never changes the output
 *      for otherwise-equal events.
 *
 * Pure.
 */
export function mergeTimeline(
  completed: TimelineEvent[],
  progress: TimelineEvent[],
): TimelineEvent[] {
  const all = [...completed, ...progress]
  all.sort((a, b) => {
    if (a.ts !== b.ts) return b.ts - a.ts // newest first
    // Tie: completed (kind 'completed' sorts before 'progress' by enum order).
    const kindOrder: Record<TimelineEventKind, number> = { completed: 0, progress: 1 }
    if (kindOrder[a.kind] !== kindOrder[b.kind]) {
      return kindOrder[a.kind] - kindOrder[b.kind]
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // stable id tie-break
  })
  return all.slice(0, TIMELINE_MAX_ITEMS)
}

// ─── Small pure helpers ──────────────────────────────────────────────────────

/** Map an untrusted mode string to a canonical AssessmentMode. Defaults to
 * 'simulation' for unknown/missing — matching the app-wide normalizeMode. */
function toMode(raw: unknown): AssessmentMode {
  return raw === 'practice' ? 'practice' : 'simulation'
}

/** Parse an ISO timestamp to UTC epoch millis. Non-parseable → 0 (oldest). */
function toMillis(raw: unknown): number {
  if (typeof raw !== 'string') return 0
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? ms : 0
}

// ─── Server-only bounded fetch ───────────────────────────────────────────────

export interface TimelineInput {
  /** Authenticated user id (resolved by the caller from the session). */
  userId: string
  /** Owned package ids (resolved by the caller from completed orders). */
  ownedPackageIds: string[]
  /** Map of exam_set_id → published question count (for progress totals). */
  examSetQuestionCounts: Record<string, number>
}

/** Raw completed-attempt row shape (nested relations cast through unknown). */
interface CompletedRow {
  id: string
  exam_set_id: string
  mode: AssessmentMode
  score: number
  total: number
  passed: boolean
  completed_at: string
  exam_sets: { name: string } | null
  packages: { name: string; slug: string; is_published: boolean } | null
}

/** Raw active-session row shape. */
interface ProgressRow {
  id: string
  exam_set_id: string
  mode: AssessmentMode
  answers: unknown
  updated_at: string
  exam_sets: { name: string; status: string } | null
  packages: { name: string; slug: string; is_published: boolean } | null
}

/**
 * Fetch the latest TIMELINE_MAX_COMPLETED completed attempts and the latest
 * TIMELINE_MAX_ACTIVE active sessions (scoped to the caller's owned packages),
 * then merge them into one newest-first timeline of at most TIMELINE_MAX_ITEMS.
 *
 * Two independent bounded queries run in parallel (no ordering risk: ordering
 * happens in the pure merge). Selects ONLY the columns the UI needs —
 * answer_summary is NOT fetched; only the active-session `answers` JSON (a
 * small {questionId: letter} map) is read for progress. No question-content
 * joins, no N+1. Authenticated server client only — RLS is an additional
 * authority; user_id is taken from the session, never trusted from the payload.
 *
 * Non-critical: on any failure (DB error, malformed rows, parse error) this
 * logs useful server-side context and returns an empty list so the dashboard's
 * other sections still render. Never throws. Never exposes raw Supabase errors.
 */
export async function getTimeline(
  input: TimelineInput,
): Promise<TimelineEvent[]> {
  if (!input.userId || input.ownedPackageIds.length === 0) {
    return [...EMPTY_TIMELINE]
  }
  try {
    // Dynamic import so the pure helpers above stay side-effect free and the
    // Supabase/next client is loaded only when a real read happens. Mirrors
    // attempt-review-data.ts / learner-analytics.ts.
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const [completedRaw, progressRaw] = await Promise.all([
      fetchCompleted(supabase, input),
      fetchProgress(supabase, input),
    ])

    // Sanitize defensively; drop any row missing a valid id / relationship.
    const completed: TimelineEvent[] = []
    for (const row of completedRaw) {
      const e = sanitizeCompletedEvent(row)
      if (e) completed.push(e)
    }
    const progress: TimelineEvent[] = []
    for (const row of progressRaw) {
      const e = sanitizeProgressEvent(row, input.examSetQuestionCounts)
      if (e) progress.push(e)
    }

    return mergeTimeline(completed, progress)
  } catch (err: any) {
    console.error('getTimeline: unexpected error:', err?.message ?? err)
    return [...EMPTY_TIMELINE]
  }
}

/** Fetch latest completed attempts scoped to owned packages. Never throws. */
async function fetchCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: TimelineInput,
): Promise<CompletedRow[]> {
  try {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select(`
        id, exam_set_id, mode, score, total, passed, completed_at,
        exam_sets ( name ),
        packages ( name, slug, is_published )
      `)
      .eq('user_id', input.userId)
      .in('package_id', input.ownedPackageIds)
      .order('completed_at', { ascending: false })
      .limit(TIMELINE_MAX_COMPLETED)

    if (error) {
      console.error('getTimeline: completed fetch failed:', error.message)
      return []
    }
    return (data ?? []) as unknown as CompletedRow[]
  } catch (err: any) {
    console.error('getTimeline: completed fetch error:', err?.message ?? err)
    return []
  }
}

/** Fetch latest active sessions scoped to owned packages. Never throws. */
async function fetchProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: TimelineInput,
): Promise<ProgressRow[]> {
  try {
    const { data, error } = await supabase
      .from('assessment_sessions')
      .select(`
        id, exam_set_id, mode, answers, updated_at,
        exam_sets ( name, status ),
        packages ( name, slug, is_published )
      `)
      .eq('user_id', input.userId)
      .eq('status', 'in_progress')
      .in('package_id', input.ownedPackageIds)
      .order('updated_at', { ascending: false })
      .limit(TIMELINE_MAX_ACTIVE)

    if (error) {
      console.error('getTimeline: progress fetch failed:', error.message)
      return []
    }
    return (data ?? []) as unknown as ProgressRow[]
  } catch (err: any) {
    console.error('getTimeline: progress fetch error:', err?.message ?? err)
    return []
  }
}
