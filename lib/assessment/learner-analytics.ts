/**
 * lib/assessment/learner-analytics.ts
 * ----------------------------------------------------------------------------
 * Phase 1D — Dashboard Learning Statistics + Weak Topics.
 *
 * A bounded, recent-performance analytics layer for the /exams dashboard. It
 * consumes the latest ≤20 completed attempts and derives:
 *
 *   1. Learning Statistics  — weighted accuracy, pass rate, totals.
 *   2. Weak Topics          — topic/law/subject-grouped gaps, defensively
 *                              parsed from the persisted answer_summary.
 *
 * Boundary discipline (mirrors dashboard-data.ts / attempt-review-data.ts):
 *   - The PURE derivation (computeLearnerAnalytics) has NO database access and
 *     NO side effects. It is unit-testable without Supabase / cookies / Next.
 *   - The ONLY server-only piece is getLearnerAnalytics(), which performs one
 *     bounded read-only query and feeds the pure layer.
 *   - Read-only. Authenticated server client only (RLS is an additional
 *     authority). No service role. Never throws — failures degrade to a safe
 *     empty analytics object so the dashboard never crashes.
 *   - Treats persisted data as untrusted: all numerics are sanitized and the
 *     answer_summary is validated defensively per the persisted contract.
 *
 * Why a new module (not lib/assessment/analytics.ts):
 *   That module computes LIFETIME personal analytics (average-of-percentages
 *   accuracy, classification thresholds, trending). This Phase 1D contract is
 *   explicitly RECENT (≤20 attempts, weighted accuracy = Σscore/Σtotal, pass
 *   rate, unanswered counted separately, topic>law>subject label priority).
 *   The two contracts differ on every core metric, so a focused bounded module
 *   is correct rather than forcing a competing semantics into the lifetime one.
 *   The /exams dashboard already pulls its latest-result from dashboard-data,
 *   not analytics.ts; this follows the same discipline.
 */

// Type-only import for the createClient factory signature (erased at compile
// time so importing the PURE helpers below does NOT pull the Supabase client /
// next/headers into a pure test context). The runtime client is obtained via a
// dynamic import inside getLearnerAnalytics, keeping the pure helpers
// side-effect free and unit-testable.
import type { createClient } from '@/lib/supabase/server'
import { validateAnswerSummary, type ReviewSummaryEntry } from './attempt-review-data'

// ─── Analytics window ────────────────────────────────────────────────────────

/** The maximum number of recent completed attempts analyzed. */
export const ANALYTICS_WINDOW_LIMIT = 20

// ─── Sanitization (pure, defensive) ──────────────────────────────────────────

/**
 * Coerce an untrusted value to a safe non-negative integer. NaN/Infinity and
 * non-numeric inputs become 0. Negative values become 0. Pure.
 */
function sanitizeNonNegInt(n: unknown): number {
  const v = Math.trunc(Number(n))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Coerce an untrusted numeric to a safe integer clamped to [0, max].
 * Used for accuracy (max 100) and per-attempt score/answered (≤ total). Pure.
 */
function sanitizeClampedInt(n: unknown, max: number): number {
  const v = sanitizeNonNegInt(n)
  return Math.min(v, Math.max(0, max))
}

// ─── Sanitized attempt (the pure layer's input) ──────────────────────────────

/**
 * One sanitized attempt row as consumed by the pure derivation. Every numeric
 * is already defensive: never NaN/Infinity, never negative, score/answered are
 * clamped to total, accuracy is clamped to [0,100]. The answer_summary is the
 * RAW persisted value — it is validated inside computeLearnerAnalytics so the
 * pure layer can be unit-tested with synthetic fixtures.
 *
 * This shape is shared between the server fetch (producer) and the pure
 * derivation (consumer) so the boundary between them is a typed contract, not a
 * bag of `any`.
 */
export interface SanitizedAttempt {
  id: string
  score: number
  total: number
  answeredCount: number
  accuracy: number
  passed: boolean
  timeUsedSeconds: number
  /** The raw, untrusted answer_summary JSONB — validated defensively later. */
  answerSummary: unknown
  /**
   * Owning package id of the attempt (Phase 2A). Optional for backward
   * compatibility: the all-packages statistics path ignores it, and the pure
   * weak-topic derivation does not use it (scoping happens at the query layer).
   * Captured only so the scoped weak-topic loader can expose the newest
   * scoped attempt id without an extra query.
   */
  packageId?: string
}

/**
 * Sanitize a raw attempt row from the DB into the pure-layer input shape.
 * Defensive against NaN/Infinity, negatives, and score/answered > total.
 * Never throws; a row missing an id is dropped (returns null). Pure.
 */
export function sanitizeAttempt(raw: {
  id?: unknown
  score?: unknown
  total?: unknown
  answered_count?: unknown
  accuracy?: unknown
  passed?: unknown
  time_used_seconds?: unknown
  answer_summary?: unknown
  package_id?: unknown
}): SanitizedAttempt | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null
  const total = sanitizeNonNegInt(raw.total)
  const packageId = typeof raw.package_id === 'string' ? raw.package_id : undefined
  return {
    id: raw.id,
    total,
    score: sanitizeClampedInt(raw.score, total),
    answeredCount: sanitizeClampedInt(raw.answered_count, total),
    accuracy: sanitizeClampedInt(raw.accuracy, 100),
    passed: raw.passed === true,
    timeUsedSeconds: sanitizeNonNegInt(raw.time_used_seconds),
    answerSummary: raw.answer_summary,
    ...(packageId ? { packageId } : {}),
  }
}

// ─── Learning statistics (pure) ──────────────────────────────────────────────

/** The dashboard "สถิติการเรียน" payload — all metrics clamped/safe. */
export interface LearningStatistics {
  /** Number of valid attempts in the recent window. */
  attempts: number
  /**
   * WEIGHTED overall accuracy: Σscore / Σtotal × 100 (NOT an average of
   * per-attempt percentages). Clamped to [0,100]. 0 when no questions.
   */
  overallAccuracy: number
  /** passed attempts / valid attempts × 100. Clamped to [0,100]. */
  passRate: number
  /** Σ sanitized answered_count. */
  totalAnswered: number
  /** Σ sanitized time_used_seconds (seconds). */
  totalTimeSeconds: number
}

/** Zeroed statistics — the safe fallback / empty state. Pure. */
export const EMPTY_LEARNING_STATISTICS: LearningStatistics = {
  attempts: 0,
  overallAccuracy: 0,
  passRate: 0,
  totalAnswered: 0,
  totalTimeSeconds: 0,
}

/**
 * Compute learning statistics from sanitized attempts.
 *
 * Overall accuracy is WEIGHTED (Σ valid score / Σ valid total), which differs
 * from a simple average of per-attempt percentages when attempts have different
 * totals. This is the spec-required definition. Pure & defensive.
 */
export function computeLearningStatistics(
  attempts: SanitizedAttempt[],
): LearningStatistics {
  if (attempts.length === 0) return { ...EMPTY_LEARNING_STATISTICS }

  let sumScore = 0
  let sumTotal = 0
  let sumAnswered = 0
  let sumTime = 0
  let passed = 0

  for (const a of attempts) {
    sumScore += a.score
    sumTotal += a.total
    sumAnswered += a.answeredCount
    sumTime += a.timeUsedSeconds
    if (a.passed) passed += 1
  }

  const n = attempts.length
  return {
    attempts: n,
    overallAccuracy: sumTotal > 0 ? Math.round((sumScore / sumTotal) * 100) : 0,
    passRate: n > 0 ? Math.round((passed / n) * 100) : 0,
    totalAnswered: sumAnswered,
    totalTimeSeconds: sumTime,
  }
}

// ─── Weak topics (pure) ──────────────────────────────────────────────────────

/** One weak-topic group, ready for the UI. */
export interface WeakTopicGroup {
  /** Display label (the topic/law/subject value that won the priority). */
  label: string
  /** Which dimension won the label. */
  labelKind: 'topic' | 'law' | 'subject'
  /** All valid grouped entries (encountered). */
  total: number
  correct: number
  incorrect: number
  unanswered: number
  /** correct / total × 100, rounded. Clamped to [0,100]. */
  accuracy: number
}

/** Weak-topic tuning (exported so tests can see the contract). */
export const WEAK_TOPIC_MIN_ENCOUNTERS = 3
export const WEAK_TOPIC_MAX_RESULTS = 5

/**
 * Resolve the grouping label for one validated summary entry using the priority
 * topic > law > subject. Returns null when no usable label exists. Trims
 * whitespace. Pure.
 */
function resolveGroupLabel(entry: ReviewSummaryEntry): {
  label: string
  labelKind: 'topic' | 'law' | 'subject'
} | null {
  const t = entry.topic?.trim()
  if (t) return { label: t, labelKind: 'topic' }
  const l = entry.law?.trim()
  if (l) return { label: l, labelKind: 'law' }
  const s = entry.subject?.trim()
  if (s) return { label: s, labelKind: 'subject' }
  return null
}

/**
 * Derive weak topics from sanitized attempts.
 *
 * For each attempt the persisted answer_summary is validated defensively via
 * the EXACT persisted-contract validator (validateAnswerSummary). Within one
 * attempt, duplicate question ids are deduplicated by that validator (first
 * valid occurrence wins) — so a duplicate id can never double-count.
 *
 * Grouping label priority: topic > law > subject. A group is eligible when it
 * has ≥3 encountered questions AND ≥1 incorrect-or-unanswered item.
 *
 * Ranking: lowest accuracy first, then larger sample, then stable Thai label
 * ordering (localeCompare with numeric+sensitivity) as the final tie-break.
 *
 * At most WEAK_TOPIC_MAX_RESULTS (5) groups are returned. Pure & defensive.
 */
export function deriveWeakTopics(
  attempts: SanitizedAttempt[],
): WeakTopicGroup[] {
  interface Acc {
    total: number
    correct: number
    incorrect: number
    unanswered: number
    labelKind: 'topic' | 'law' | 'subject'
  }
  const groups = new Map<string, Acc>()

  for (const attempt of attempts) {
    // Validate per attempt → per-attempt dedupe of duplicate question ids,
    // malformed entries skipped, letters normalized.
    const entries = validateAnswerSummary(attempt.answerSummary)
    for (const e of entries) {
      const resolved = resolveGroupLabel(e)
      if (!resolved) continue // no usable label → skip
      const acc = groups.get(resolved.label)
      if (acc) {
        acc.total += 1
        if (e.isCorrect) acc.correct += 1
        else if (e.selected == null) acc.unanswered += 1
        else acc.incorrect += 1
      } else {
        const fresh: Acc = {
          total: 1,
          correct: 0,
          incorrect: 0,
          unanswered: 0,
          labelKind: resolved.labelKind,
        }
        if (e.isCorrect) fresh.correct = 1
        else if (e.selected == null) fresh.unanswered = 1
        else fresh.incorrect = 1
        groups.set(resolved.label, fresh)
      }
    }
  }

  const eligible: WeakTopicGroup[] = []
  for (const [label, acc] of groups) {
    // Eligibility: enough encounters AND at least one incorrect/unanswered.
    if (acc.total < WEAK_TOPIC_MIN_ENCOUNTERS) continue
    if (acc.incorrect === 0 && acc.unanswered === 0) continue
    const accuracy = acc.total > 0 ? Math.round((acc.correct / acc.total) * 100) : 0
    eligible.push({
      label,
      labelKind: acc.labelKind,
      total: acc.total,
      correct: acc.correct,
      incorrect: acc.incorrect,
      unanswered: acc.unanswered,
      accuracy: Math.max(0, Math.min(100, accuracy)),
    })
  }

  // Ranking: lowest accuracy → larger sample → stable Thai label tie-break.
  eligible.sort(
    (a, b) =>
      a.accuracy - b.accuracy ||
      b.total - a.total ||
      a.label.localeCompare(b.label, 'th', { numeric: true, sensitivity: 'base' }),
  )

  return eligible.slice(0, WEAK_TOPIC_MAX_RESULTS)
}

// ─── Combined analytics payload ──────────────────────────────────────────────

/** The full Phase 1D analytics payload handed to the dashboard. */
export interface LearnerAnalytics {
  statistics: LearningStatistics
  weakTopics: WeakTopicGroup[]
}

/** The safe empty fallback (no attempts / query failure). */
export const EMPTY_LEARNER_ANALYTICS: LearnerAnalytics = {
  statistics: { ...EMPTY_LEARNING_STATISTICS },
  weakTopics: [],
}

/**
 * Derive the full analytics payload from sanitized attempts. Pure — safe to
 * call with synthetic fixtures in tests. Sanitization happens at the server
 * boundary (sanitizeAttempt), so this layer trusts its numeric inputs.
 */
export function computeLearnerAnalytics(
  attempts: SanitizedAttempt[],
): LearnerAnalytics {
  return {
    statistics: computeLearningStatistics(attempts),
    weakTopics: deriveWeakTopics(attempts),
  }
}

// ─── Server-only bounded fetch ───────────────────────────────────────────────
// One bounded read-only query for the recent-performance window. Scoped to the
// caller-resolved owned package ids (same ownership resolution the /exams page
// already performs for the package grid). answer_summary IS fetched here
// because weak-topic derivation needs it; no question-content rows are fetched.

/** Raw row shape from the bounded analytics query. */
interface AnalyticsAttemptRow {
  id: string
  package_id: string
  score: number
  total: number
  answered_count: number
  accuracy: number
  passed: boolean
  time_used_seconds: number
  answer_summary: unknown
  completed_at: string
  created_at: string
}

export interface LearnerAnalyticsInput {
  /** Authenticated user id (resolved by the caller from the session). */
  userId: string
  /** Owned package ids (resolved by the caller from completed orders). */
  ownedPackageIds: string[]
}

/**
 * Fetch the latest ≤20 completed attempts owned by the caller, ordered by
 * completed_at desc with created_at desc as a stable secondary order, then
 * derive learning statistics + weak topics.
 *
 * Selects ONLY the fields required for calculations (including answer_summary
 * for weak-topic grouping). No question/exam_set_questions joins, no content.
 * Authenticated server client only — RLS is an additional authority; user_id
 * is taken from the session, never trusted from the payload.
 *
 * Non-critical: on any failure (DB error, malformed rows, parse error) this
 * logs useful server-side context and returns a safe EMPTY payload so the
 * dashboard's other sections still render. Never throws. Never exposes raw
 * Supabase errors to the client.
 */
export async function getLearnerAnalytics(
  input: LearnerAnalyticsInput,
): Promise<LearnerAnalytics> {
  if (!input.userId || input.ownedPackageIds.length === 0) {
    return { ...EMPTY_LEARNER_ANALYTICS }
  }
  try {
    // Dynamic import so the pure helpers above stay side-effect free and the
    // Supabase/next client is loaded only when a real read happens. This
    // mirrors attempt-review-data.ts and keeps the pure layer unit-testable.
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('exam_attempts')
      .select(`
        id, package_id, score, total, answered_count, accuracy, passed,
        time_used_seconds, answer_summary, completed_at, created_at
      `)
      .eq('user_id', input.userId)
      .in('package_id', input.ownedPackageIds)
      .order('completed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(ANALYTICS_WINDOW_LIMIT)

    if (error) {
      console.error('getLearnerAnalytics: query failed:', error.message)
      return { ...EMPTY_LEARNER_ANALYTICS }
    }
    if (!data || data.length === 0) {
      return { ...EMPTY_LEARNER_ANALYTICS }
    }

    // Sanitize each row defensively; drop any row missing a valid id rather
    // than letting a corrupt row skew the totals or crash the derivation.
    const sanitized: SanitizedAttempt[] = []
    for (const raw of data as unknown as AnalyticsAttemptRow[]) {
      const s = sanitizeAttempt(raw)
      if (s) sanitized.push(s)
    }

    return computeLearnerAnalytics(sanitized)
  } catch (err: any) {
    console.error('getLearnerAnalytics: unexpected error:', err?.message ?? err)
    return { ...EMPTY_LEARNER_ANALYTICS }
  }
}

// ─── Phase 2A: package-scoped weak topics ────────────────────────────────────
// ONLY the "หัวข้อที่ควรทบทวน" section is package-scoped. Learning Statistics
// stays all-packages (served by getLearnerAnalytics above, unchanged). This
// loader runs a SEPARATE bounded query solely for weak topics so the two
// sections can have different latest-20 windows without互相干扰. It reuses the
// SAME pure sanitize + deriveWeakTopics logic — no aggregation duplication.

// ─── Scope resolution (pure) ─────────────────────────────────────────────────

/**
 * The resolved Weak-Topics scope, produced by {@link resolveWeakTopicsScope}.
 *
 * Three-valued so the page can distinguish "user hasn't chosen" from "user
 * explicitly chose all-packages" — the URL param must be sticky for `all`.
 *  - 'all'      → all-packages weak topics (reuse learnerAnalytics.weakTopics).
 *  - {packageId}→ scope to one owned package (call getWeakTopics).
 */
export type WeakTopicsScope = { kind: 'all' } | { kind: 'package'; packageId: string }

/** Inputs to scope resolution — all already-loaded dashboard data (no query). */
export interface ResolveWeakTopicsScopeInput {
  /** Raw `?package=` value from the URL: absent → undefined. */
  packageParam: string | undefined
  /** Owned package ids (the allow-list for validation). */
  ownedPackageIds: string[]
  /**
   * Default-package resolution inputs (all already on the dashboard):
   *  1. latest completed attempt's package id
   *  2. most recently active session's package id
   *  3. otherwise → 'all'
   * (Option "first owned package with attempts" is intentionally NOT here: it
   *  would require knowing which package has attempts, which is itself scoped
   *  data. The two free, already-loaded signals cover the common cases.)
   */
  latestAttemptPackageId: string | null | undefined
  activeSessionPackageId: string | null | undefined
}

/**
 * Resolve the Weak-Topics scope from the URL param + already-loaded dashboard
 * data. Pure (no I/O) so it is unit-testable and deterministic.
 *
 * Rules:
 *  - packageParam === 'all'           → { kind: 'all' } (explicit; sticky)
 *  - packageParam is an owned id      → { kind: 'package', packageId }
 *  - packageParam absent/invalid/unowned → run the automatic default:
 *      latestAttemptPackageId → activeSessionPackageId → { kind: 'all' }
 *    The auto-resolved package must itself be owned (defensive).
 *
 * Note: an explicit `all` never falls through to the automatic default, so
 * choosing "ภาพรวมทุกแพ็กเกจ" stays put and does not reactivate auto-selection.
 */
export function resolveWeakTopicsScope(
  input: ResolveWeakTopicsScopeInput,
): WeakTopicsScope {
  const owned = input.ownedPackageIds

  // Explicit all-packages overview — sticky (never re-resolves).
  if (input.packageParam === 'all') return { kind: 'all' }

  // Explicit owned package selection.
  if (
    typeof input.packageParam === 'string' &&
    input.packageParam.length > 0 &&
    owned.includes(input.packageParam)
  ) {
    return { kind: 'package', packageId: input.packageParam }
  }

  // Absent / invalid / unowned → automatic default.
  if (input.latestAttemptPackageId && owned.includes(input.latestAttemptPackageId)) {
    return { kind: 'package', packageId: input.latestAttemptPackageId }
  }
  if (input.activeSessionPackageId && owned.includes(input.activeSessionPackageId)) {
    return { kind: 'package', packageId: input.activeSessionPackageId }
  }
  return { kind: 'all' }
}

/** Result of the package-scoped weak-topic loader. */
export interface WeakTopicsResult {
  /** Derived weak topics for the resolved scope (≤ WEAK_TOPIC_MAX_RESULTS). */
  weakTopics: WeakTopicGroup[]
  /**
   * The newest completed attempt id within the resolved scope (the first row,
   * since the query is ordered newest-first). Used by the scoped "ทบทวนข้อผิดใน
   * แพ็กเกจนี้" CTA so it always points at an attempt that belongs to the
   * selected package. null when the scope has no completed attempts.
   */
  scopedLatestAttemptId: string | null
}

/** The safe empty fallback (no attempts / query failure). */
export const EMPTY_WEAK_TOPICS: WeakTopicsResult = {
  weakTopics: [],
  scopedLatestAttemptId: null,
}

export interface WeakTopicsInput {
  /** Authenticated user id (resolved by the caller from the session). */
  userId: string
  /** Owned package ids (resolved by the caller from completed orders). */
  ownedPackageIds: string[]
  /**
   * Optional single package to scope to. The caller MUST have already validated
   * that this id is a member of ownedPackageIds (defensive double-check below).
   * When omitted/invalid, the all-packages filter (ownedPackageIds) is used.
   */
  packageId?: string | null
}

/**
 * Fetch the latest ≤20 completed attempts for the resolved scope and derive
 * weak topics. The scope is ONE owned package when `packageId` is supplied and
 * owned, otherwise all owned packages.
 *
 * This is a SEPARATE query from getLearnerAnalytics: the all-packages Learning
 * Statistics must keep its own accurate latest-20 window, so weak topics cannot
 * ride on that same query when a package is selected. When the scope resolves to
 * `all`, the caller should reuse learnerAnalytics.weakTopics instead of calling
 * this (avoids a redundant query); this loader exists for the package-scoped
 * case and is also safe to call for `all` if ever needed.
 *
 * Query plan: index-served for the scoped case via exam_attempts_package_idx
 * (package_id, created_at desc). Latest-20 window preserved in both scopes.
 * Reuses sanitizeAttempt + deriveWeakTopics verbatim (no logic duplication).
 * Captures scopedLatestAttemptId from the first sanitized row (newest-first).
 *
 * Non-critical: on any failure returns EMPTY_WEAK_TOPICS so the dashboard still
 * renders. Never throws. Never exposes raw Supabase errors.
 */
export async function getWeakTopics(
  input: WeakTopicsInput,
): Promise<WeakTopicsResult> {
  if (!input.userId || input.ownedPackageIds.length === 0) {
    return { ...EMPTY_WEAK_TOPICS }
  }
  // Defensive: only honor a packageId that the caller actually owns. Anything
  // else (invalid, unowned, empty) falls back to the all-packages scope.
  const scopedPackageId =
    input.packageId && input.ownedPackageIds.includes(input.packageId)
      ? input.packageId
      : null

  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    let query = supabase
      .from('exam_attempts')
      .select(`
        id, package_id, score, total, answered_count, accuracy, passed,
        time_used_seconds, answer_summary, completed_at, created_at
      `)
      .eq('user_id', input.userId)
      .order('completed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(ANALYTICS_WINDOW_LIMIT)

    // Branch the package filter: single-package scope vs all-owned-packages.
    // `.eq` is index-served by exam_attempts_package_idx; `.in` matches the
    // existing getLearnerAnalytics all-packages behavior exactly.
    query = scopedPackageId
      ? query.eq('package_id', scopedPackageId)
      : query.in('package_id', input.ownedPackageIds)

    const { data, error } = await query

    if (error) {
      console.error('getWeakTopics: query failed:', error.message)
      return { ...EMPTY_WEAK_TOPICS }
    }
    if (!data || data.length === 0) {
      return { ...EMPTY_WEAK_TOPICS }
    }

    // Reuse the exact same sanitize + derive pipeline as the all-packages path.
    const sanitized: SanitizedAttempt[] = []
    for (const raw of data as unknown as AnalyticsAttemptRow[]) {
      const s = sanitizeAttempt(raw)
      if (s) sanitized.push(s)
    }

    // The query is newest-first, so the first sanitized row is the scope's
    // latest completed attempt — the correct target for the scoped review CTA.
    const scopedLatestAttemptId = sanitized.length > 0 ? sanitized[0].id : null

    return {
      weakTopics: deriveWeakTopics(sanitized),
      scopedLatestAttemptId,
    }
  } catch (err: any) {
    console.error('getWeakTopics: unexpected error:', err?.message ?? err)
    return { ...EMPTY_WEAK_TOPICS }
  }
}
