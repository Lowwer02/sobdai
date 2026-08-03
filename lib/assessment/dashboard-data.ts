/**
 * lib/assessment/dashboard-data.ts
 * ----------------------------------------------------------------------------
 * My Exam Dashboard — read-only data layer (Phase 1B).
 *
 * A small, bounded, server-only helper that returns UI-ready data for the two
 * real dashboard sections:
 *
 *   A. Continue Learning  ← assessment_sessions where status = 'in_progress'
 *   B. Latest Result      ← exam_attempts (the immutable Outcome), newest first
 *
 * Boundary discipline (mirrors app/assessment/*.ts):
 *   - Read-only. No writes, no analytics derivation, no cross-attempt math.
 *   - Authenticated server client only (RLS is the authority). No service role.
 *   - Never throws: callers receive empty arrays / null on any failure so the
 *     dashboard degrades gracefully (the package grid still renders).
 *
 * Ownership scoping: the caller (app/exams/page.tsx) resolves the learner's
 * owned packages from completed orders and passes the owned package id set +
 * the per-exam-set question-count map (already produced by the existing
 * get_package_public_counts RPC for the package grid). This helper filters
 * sessions/attempts to those owned packages and uses the count map for totals —
 * so it performs NO orders query and NO full question-row fetch (no N+1).
 */

import { createClient } from '@/lib/supabase/server'
import type { AssessmentMode } from '@/lib/assessment/types'

// ─── Public UI-ready shapes ─────────────────────────────────────────────────

/** One "Continue Learning" card's data (a resumable in-progress session). */
export interface DashboardActiveSession {
  sessionId: string
  examSetId: string
  packageId: string
  /** Canonical mode ('practice' | 'simulation'); drives the badge + resume URL. */
  mode: AssessmentMode
  /** 0-based index restored from the session snapshot. */
  currentIndex: number
  /** Count of answered questions derived from the persisted answers object. */
  answeredCount: number
  timeUsedSeconds: number
  updatedAt: string
  examSetName: string
  packageName: string
  packageSlug: string
  organizationName: string | null
  positionName: string | null
  /** Published question count for this exam set (from get_package_public_counts). */
  totalQuestions: number
}

/** The single "Latest Result" card's data (one completed Outcome). */
export interface DashboardLatestResult {
  attemptId: string
  examSetId: string
  packageId: string
  mode: AssessmentMode
  score: number
  total: number
  accuracy: number
  passed: boolean
  answeredCount: number
  timeUsedSeconds: number
  completedAt: string
  examSetName: string
  packageName: string
  packageSlug: string
}

export interface DashboardData {
  activeSessions: DashboardActiveSession[]
  latestResult: DashboardLatestResult | null
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface DashboardDataInput {
  /** Authenticated user id (resolved by the caller from the session). */
  userId: string
  /**
   * Package ids the learner currently owns (completed/free orders), resolved by
   * the caller. Sessions/attempts are filtered to this set so the dashboard only
   * ever surfaces progress the learner can still access.
   */
  ownedPackageIds: string[]
  /**
   * Map of exam_set_id → published question count, for progress totals. Built by
   * the caller from get_package_public_counts so this helper never counts
   * question rows itself.
   */
  examSetQuestionCounts: Record<string, number>
}

// ─── Helpers (pure) ──────────────────────────────────────────────────────────

const VALID_CHOICE_LETTERS = new Set(['A', 'B', 'C', 'D'])

/**
 * Count answered questions from a persisted answers object. Only entries whose
 * value is a valid choice letter are counted, so malformed/legacy values can
 * never inflate the progress bar. The server action validates to A/B/C/D on
 * write, but this stays defensive on the read path. Pure.
 */
function countAnswered(answers: unknown): number {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 0
  let n = 0
  for (const v of Object.values(answers as Record<string, unknown>)) {
    if (typeof v === 'string' && VALID_CHOICE_LETTERS.has(v)) n++
  }
  return n
}

// ─── Date / number formatting (Thai-friendly, deterministic) ──────────────────
// These are PURE and use an explicit time zone so Server Component output is
// stable (no hydration mismatch and no dependence on the server's local time).

/**
 * Format an ISO timestamp as a Thai date + short time, e.g. "3 ส.ค. 2569 14:05".
 * Uses the Buddhist-Era Thai calendar and the Asia/Bangkok time zone so the
 * rendered string is deterministic across environments.
 */
export function formatThaiDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    }).format(d)
  } catch {
    return ''
  }
}

/**
 * Human-readable Thai duration from a number of seconds, e.g.
 * "1 ชม. 5 นาที", "12 นาที 30 วินาที", "45 วินาที". Never negative; never NaN.
 */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.trunc(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h} ชม. ${m} นาที`
  if (m > 0) return `${m} นาที${sec > 0 ? ` ${sec} วินาที` : ''}`
  return `${sec} วินาที`
}

/**
 * A clamped, rounded percentage in [0, 100]. Returns 0 when the denominator is
 * non-positive or the result is non-finite — so progress bars never divide by
 * zero and the UI never renders NaN.
 */
export function safePercent(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0
  const v = (numerator / denominator) * 100
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

// ─── Active sessions ("Continue Learning") ───────────────────────────────────

/** Nested-select row shape for assessment_sessions enrichment. */
interface ActiveSessionRow {
  id: string
  exam_set_id: string
  package_id: string
  mode: AssessmentMode
  current_index: number
  answers: Record<string, string> | null
  time_used_seconds: number
  updated_at: string
  exam_sets: { name: string; status: string; package_id: string } | null
  packages: {
    name: string
    slug: string
    is_published: boolean
    organizations: { name: string } | null
    positions: { name: string } | null
  } | null
}

/**
 * Fetch at most the three most recently updated in-progress sessions for the
 * caller, filtered to owned packages, enriched with exam-set/package display
 * metadata. Drops any row whose related exam set is no longer published or
 * whose package is missing/unpublished (so the card never links somewhere
 * invalid). Never throws; returns [] on error.
 */
async function fetchActiveSessions(
  input: DashboardDataInput,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<DashboardActiveSession[]> {
  if (input.ownedPackageIds.length === 0) return []
  try {
    const { data, error } = await supabase
      .from('assessment_sessions')
      .select(`
        id, exam_set_id, package_id, mode, current_index, answers,
        time_used_seconds, updated_at,
        exam_sets ( name, status, package_id ),
        packages ( name, slug, is_published, organizations ( name ), positions ( name ) )
      `)
      .eq('user_id', input.userId)
      .eq('status', 'in_progress')
      .in('package_id', input.ownedPackageIds)
      .order('updated_at', { ascending: false })
      .limit(3)

    if (error) {
      console.error('dashboard fetchActiveSessions failed:', error.message)
      return []
    }
    if (!data) return []

    const out: DashboardActiveSession[] = []
    // Cast through unknown: supabase-js infers nested relations as arrays
    // (it can't know cardinality), but the singular exam_sets/packages rows
    // are objects here. This mirrors the existing route/exams-page pattern.
    for (const raw of data as unknown as ActiveSessionRow[]) {
      const examSet = raw.exam_sets
      const pkg = raw.packages
      // Skip sessions whose exam set/package is gone or no longer valid for the
      // dashboard (draft/archived set, unpublished package).
      if (!examSet || !pkg) continue
      if (examSet.status !== 'published') continue
      if (pkg.is_published === false) continue
      out.push({
        sessionId: raw.id,
        examSetId: raw.exam_set_id,
        packageId: raw.package_id,
        mode: raw.mode,
        currentIndex: raw.current_index,
        answeredCount: countAnswered(raw.answers),
        timeUsedSeconds: raw.time_used_seconds ?? 0,
        updatedAt: raw.updated_at,
        examSetName: examSet.name,
        packageName: pkg.name,
        packageSlug: pkg.slug,
        organizationName: pkg.organizations?.name ?? null,
        positionName: pkg.positions?.name ?? null,
        totalQuestions: input.examSetQuestionCounts[raw.exam_set_id] ?? 0,
      })
    }
    return out
  } catch (err: any) {
    console.error('dashboard fetchActiveSessions unexpected error:', err?.message ?? err)
    return []
  }
}

// ─── Latest result ───────────────────────────────────────────────────────────

/** Nested-select row shape for exam_attempts enrichment. */
interface LatestAttemptRow {
  id: string
  exam_set_id: string
  package_id: string
  mode: AssessmentMode
  score: number
  total: number
  answered_count: number
  accuracy: number
  passed: boolean
  time_used_seconds: number
  completed_at: string
  exam_sets: { name: string; status: string } | null
  packages: { name: string; slug: string; is_published: boolean } | null
}

/**
 * Fetch exactly one latest owned attempt (the most recent completed Outcome),
 * newest by completed_at with created_at as a stable tiebreak. Selects only the
 * fields the card needs — answer_summary is intentionally NOT fetched. Returns
 * null when no attempt exists or on error. Never throws.
 */
async function fetchLatestResult(
  input: DashboardDataInput,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<DashboardLatestResult | null> {
  if (input.ownedPackageIds.length === 0) return null
  try {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select(`
        id, exam_set_id, package_id, mode, score, total, answered_count,
        accuracy, passed, time_used_seconds, completed_at,
        exam_sets ( name, status ),
        packages ( name, slug, is_published )
      `)
      .eq('user_id', input.userId)
      .in('package_id', input.ownedPackageIds)
      .order('completed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('dashboard fetchLatestResult failed:', error.message)
      return null
    }
    if (!data) return null

    // Cast through unknown for the same nested-relation reason as above.
    const row = data as unknown as LatestAttemptRow
    // Require the related exam set/package to still exist so the card never
    // links to a deleted route. (Completed history is otherwise shown as-is.)
    if (!row.exam_sets || !row.packages) return null
    return {
      attemptId: row.id,
      examSetId: row.exam_set_id,
      packageId: row.package_id,
      mode: row.mode,
      score: row.score,
      total: row.total,
      accuracy: row.accuracy,
      passed: row.passed,
      answeredCount: row.answered_count,
      timeUsedSeconds: row.time_used_seconds ?? 0,
      completedAt: row.completed_at,
      examSetName: row.exam_sets.name,
      packageName: row.packages.name,
      packageSlug: row.packages.slug,
    }
  } catch (err: any) {
    console.error('dashboard fetchLatestResult unexpected error:', err?.message ?? err)
    return null
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Read both dashboard sections in parallel. Each sub-query is independent and
 * bounded (≤3 sessions, 1 attempt), so running them together collapses the two
 * round-trips without ordering risk. Never throws; failures degrade to empty.
 */
export async function getDashboardData(
  input: DashboardDataInput,
): Promise<DashboardData> {
  const supabase = await createClient()
  const [activeSessions, latestResult] = await Promise.all([
    fetchActiveSessions(input, supabase),
    fetchLatestResult(input, supabase),
  ])
  return { activeSessions, latestResult }
}
