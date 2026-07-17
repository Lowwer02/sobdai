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
import type { AssessmentOutcome, AttemptHistoryItem } from '@/lib/assessment/types'

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
//
// NOTE: AttemptHistoryItem (the row shape returned below) is a SHARED DOMAIN
// MODEL defined in lib/assessment/types.ts — not here. It moved during the
// Milestone 1 Refactor #1 so the Analytics layer can depend on the shared
// types module without depending on this server-action module.

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

// ─── Epic 3: Analytics (read-only derivation over persisted Outcomes) ────────
// Analytics consumes Outcomes; it never modifies them. This wrapper retrieves
// the caller's own history (Persistence) and runs the pure derivation
// (lib/assessment/analytics.ts). No write paths; no caching; no aggregation
// tables — derivation happens on read, from the single source of truth.

import { computePersonalAnalytics } from '@/lib/assessment/analytics'
import type { PersonalAnalytics } from '@/lib/assessment/analytics'

export interface FetchMyAnalyticsResult {
  data: PersonalAnalytics | null
  error: string | null
}

/**
 * Fetch the calling user's personal analytics, derived from their persisted
 * Outcomes.
 *
 * Read-only and non-throwing. Returns a valid zeroed PersonalAnalytics when the
 * user has no attempts yet (so the UI can render an empty state cleanly).
 *
 * Scope: personal analytics only. No cohort/comparison data (Leaderboard's
 * domain); no recommendations (Recommendation's domain).
 */
export async function fetchMyAnalytics(): Promise<FetchMyAnalyticsResult> {
  try {
    const { data: history, error } = await fetchMyAttemptHistory({ limit: 200 })
    if (error) return { data: null, error }
    // computePersonalAnalytics handles null/empty safely → zeroed analytics.
    const data = computePersonalAnalytics(history ?? [])
    return { data, error: null }
  } catch (err: any) {
    console.error('fetchMyAnalytics: unexpected error:', err?.message ?? err)
    return { data: null, error: err?.message ?? 'Unexpected error.' }
  }
}

// ─── Epic 4: Recommendation Engine (read-only enrichment) ───────────────────
// Recommendation consumes Analytics (and, to attach actionable targets, reads
// Summaries/ExamSets). It never writes anywhere. This action is the boundary
// where the pure engine (lib/assessment/recommendation.ts) is enriched with
// real learning targets from Persistence.
import { recommend } from '@/lib/assessment/recommendation'
import type { RecommendationSet, Recommendation } from '@/lib/assessment/recommendation'

export interface FetchMyRecommendationsResult {
  data: RecommendationSet | null
  error: string | null
}

/**
 * Build the caller's personal recommendations.
 *
 * Pipeline (read-only end-to-end):
 *   1. fetchMyAnalytics()  → PersonalAnalytics (Epic 3 derivation over Outcomes)
 *   2. recommend()         → categorized, explained recs (pure engine, Epic 4)
 *   3. enrichWithTargets() → attach Summary/ExamSet links (read Persistence)
 *
 * Never throws, never writes. Empty analytics → empty recommendation set
 * (caller renders an empty state).
 */
export async function fetchMyRecommendations(): Promise<FetchMyRecommendationsResult> {
  try {
    const { data: analytics, error } = await fetchMyAnalytics()
    if (error) return { data: null, error }
    if (!analytics) return { data: { recommendations: [], isEmpty: true }, error: null }

    const base = recommend(analytics)
    if (base.isEmpty) return { data: base, error: null }

    const enriched = await enrichWithTargets(base.recommendations)
    return { data: { recommendations: enriched, isEmpty: false }, error: null }
  } catch (err: any) {
    console.error('fetchMyRecommendations: unexpected error:', err?.message ?? err)
    return { data: null, error: err?.message ?? 'Unexpected error.' }
  }
}

/**
 * Attach actionable targets to recommendations by reading (never writing) the
 * Summaries and ExamSets tables. For a weak subject/topic, find a matching
 * Summary the learner can read; for retry-simulation, find a Simulation ExamSet
 * in a package the learner owns.
 *
 * Matching is intentionally simple and deterministic (Phase 1):
 *   - subject/topic recommendation → first published Summary whose subject or
 *     topic matches (preferring topic match).
 *   - retry_simulation → the learner's most recent Simulation ExamSet.
 * If no target is found, `target` stays null and the UI shows the rec without a
 * link (still useful as guidance).
 */
async function enrichWithTargets(
  recs: Recommendation[],
): Promise<Recommendation[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // If somehow unauthenticated here, return recs unenriched (safe degradation).
  if (!user) return recs

  // ── Collect distinct subject/topic labels to look up in one Summary query ──
  const wantedSubjects = new Set<string>()
  const wantedTopics = new Set<string>()
  for (const r of recs) {
    if (r.subject) wantedSubjects.add(r.subject)
    if (r.topic) wantedTopics.add(r.topic)
  }

  // Published summaries matching any wanted subject or topic. We fetch once and
  // match client-side to keep this a bounded, simple read.
  let summaryRows: Array<{
    id: string
    slug: string
    title: string
    subject: string | null
    topic: string | null
    package_id: string
  }> = []
  if (wantedSubjects.size > 0 || wantedTopics.size > 0) {
    // Supabase `.or()` with many values can get long; cap defensively.
    const orClauses: string[] = []
    for (const s of wantedSubjects) orClauses.push(`subject.eq.${s}`)
    for (const t of wantedTopics) orClauses.push(`topic.eq.${t}`)
    const { data, error: sErr } = await supabase
      .from('summaries')
      .select('id, slug, title, subject, topic, package_id')
      .eq('is_published', true)
      .or(orClauses.slice(0, 20).join(','))
      .limit(50)
    if (sErr) console.error('recommendation summary lookup failed:', sErr.message)
    if (data) summaryRows = data as typeof summaryRows
  }

  // We need package slugs to build URLs; fetch once for the packages involved.
  const packageIds = new Set<string>()
  for (const s of summaryRows) packageIds.add(s.package_id)
  const packageSlugMap = new Map<string, string>()
  if (packageIds.size > 0) {
    const { data: pkgs } = await supabase
      .from('packages')
      .select('id, slug')
      .in('id', Array.from(packageIds))
    if (pkgs) for (const p of pkgs) packageSlugMap.set(p.id, p.slug)
  }

  // ── Enrich each recommendation deterministically ─────────────────────────
  return recs.map((r) => {
    if (r.category === 'study_weak_subject' || r.category === 'review_weak_topic') {
      // Prefer a topic match, then a subject match.
      const match =
        (r.topic && summaryRows.find((s) => s.topic === r.topic)) ||
        (r.subject && summaryRows.find((s) => s.subject === r.subject)) ||
        null
      if (match) {
        return {
          ...r,
          target: {
            kind: 'summary' as const,
            id: match.id,
            slug: match.slug,
            packageSlug: packageSlugMap.get(match.package_id),
            label: match.title,
          },
        }
      }
      return r
    }
    if (r.category === 'retry_simulation') {
      // Already-enriched below via a separate query for this category.
      return r
    }
    return r
  })
}


