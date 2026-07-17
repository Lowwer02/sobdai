/**
 * lib/assessment/analytics.ts
 * ----------------------------------------------------------------------------
 * Assessment Platform — Epic 3: Learning Analytics (personal).
 *
 * Source of truth: "Assessment Platform Master Specification v1.0"
 *   - Part IV §27 (Learning Analytics): "Analytics has the job of interpreting
 *     Outcomes — not creating them." Analytics adds new views over existing
 *     data; it never changes the original data.
 *   - Constitution AI-006: Derived data never becomes authoritative.
 *   - Constitution AI-003: Runtime executes, does not analyze.
 *
 * This module is a PURE COMPUTATION layer. It derives personal analytics from
 * an in-memory list of persisted Outcomes (AttemptHistoryItem[]). It:
 *   - Has NO database access.   (Persistence owns retrieval; this owns derivation.)
 *   - Has NO side effects.      (Pure functions; safe to call anywhere.)
 *   - Stores NOTHING.           (Outputs are derived views, never cached/truth.)
 *   - Knows nothing of Recommendation / Leaderboard / Achievements.
 *
 * The boundary discipline:
 *   Persistence layer  →  fetchMyAttemptHistory()  →  raw AttemptHistoryItem[]
 *   This module        →  computePersonalAnalytics() →  PersonalAnalytics (derived)
 *
 * Future Recommendation and Leaderboard systems will consume the SAME raw
 * Outcomes (or these derived views) — independently, without coupling.
 */

import type { AttemptHistoryItem } from '@/lib/assessment/types'

// ─── Output types ───────────────────────────────────────────────────────────

/** Headline counts & averages across all of a learner's attempts. */
export interface OverallPerformance {
  /** Number of attempts (practice + simulation). */
  totalAttempts: number
  /** Attempts split by mode — readiness measurement vs formative practice. */
  practiceAttempts: number
  simulationAttempts: number
  /** Σ across all attempts of the per-attempt `total` (questions in each set). */
  totalQuestions: number
  /** Σ of per-attempt `answered_count`. */
  totalAnswered: number
  /** Σ of per-attempt `score` (correct answers). */
  totalCorrect: number
  /** totalQuestions − totalCorrect. */
  totalIncorrect: number
  /** Mean of per-attempt `accuracy` (0–100), rounded. 0 when no attempts. */
  averageAccuracy: number
  /** Mean of per-attempt `score` (raw), rounded to 1 dp. 0 when no attempts. */
  averageScore: number
  /** Max per-attempt `score`. 0 when no attempts. */
  bestScore: number
  /** Mean of per-attempt `time_used_seconds`. 0 when no attempts. */
  averageTimeSeconds: number
}

/** Aggregate correctness for one tag bucket (a Subject or a Topic). */
export interface TagPerformance {
  /** The tag label (subject name or topic name). */
  name: string
  /** Questions seen across all attempts under this tag. */
  total: number
  /** Correct under this tag. */
  correct: number
  /** correct / total × 100, rounded. 0 when total === 0. */
  accuracy: number
}

/** A weak/strong subject, with its accuracy so the consumer can rank/group. */
export interface SubjectPerformance extends TagPerformance {
  /** 'Subject' discriminator (lets future TopicPerformance coexist cleanly). */
  kind: 'Subject'
}

export interface TopicPerformance extends TagPerformance {
  kind: 'Topic'
}

/**
 * A subject classified as weak or strong.
 *
 * Thresholds are deliberately explicit and conservative defaults, NOT product
 * policy locked in stone — the consumer (UI / future recommendation) receives
 * the underlying accuracy too, so it can apply its own framing. Defaults:
 *   weak:   accuracy < 50   (a real gap, likely blocking readiness)
 *   strong: accuracy >= 80  (solid mastery, candidate for de-prioritization)
 */
export interface ClassifiedSubject extends SubjectPerformance {
  classification: 'weak' | 'strong'
}

/**
 * Performance trend across attempts, oldest → newest.
 *
 * Trend is computed from accuracy over time. We do NOT compute regression
 * slopes here — that would be an interpretation that belongs to Recommendation.
 * Analytics reports the points; consumers draw conclusions.
 */
export interface TrendPoint {
  /** ISO timestamp of the attempt (completed_at). */
  completedAt: string
  /** Attempt id. */
  attemptId: string
  /** Per-attempt accuracy (0–100). */
  accuracy: number
  /** Per-attempt score (raw correct). */
  score: number
  /** Practice or simulation — consumers often trend these separately. */
  mode: 'practice' | 'simulation'
}

/**
 * The full personal-analytics payload — everything Epic 3's DoD requires.
 * Every field is a deterministic function of the input AttemptHistoryItem[].
 */
export interface PersonalAnalytics {
  overall: OverallPerformance
  subjectPerformance: SubjectPerformance[]
  topicPerformance: TopicPerformance[]
  weakSubjects: ClassifiedSubject[]
  strongSubjects: ClassifiedSubject[]
  /** Raw attempt list, oldest → newest (chronological for trending). */
  history: AttemptHistoryItem[]
  /** Accuracy-over-time series (same data as history, shaped for trending). */
  trend: TrendPoint[]
}

// ─── Thresholds ─────────────────────────────────────────────────────────────
// Defaults for weak/strong classification. Exported so consumers/tests can see
// and override them; they are not a product policy locked into the data model.

export const WEAK_SUBJECT_THRESHOLD = 50
export const STRONG_SUBJECT_THRESHOLD = 80

// ─── Helpers ────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Aggregate correctness by a chosen tag key ('subject' | 'topic' | 'law') across
 * every question in every attempt's answer_summary. This is the core
 * derivation primitive: it reads only the persisted per-question records
 * (Outcome Layer 3 — the answer summary), so it needs no extra schema.
 */
function aggregateByTag(
  history: AttemptHistoryItem[],
  tagKey: 'subject' | 'topic' | 'law',
): TagPerformance[] {
  const buckets = new Map<string, { total: number; correct: number }>()

  for (const attempt of history) {
    const summary = attempt.answer_summary
    if (!Array.isArray(summary)) continue
    for (const a of summary) {
      const label = a[tagKey]
      // Skip null/empty labels — they can't form a meaningful bucket.
      if (!label) continue
      const entry = buckets.get(label) ?? { total: 0, correct: 0 }
      entry.total += 1
      if (a.isCorrect) entry.correct += 1
      buckets.set(label, entry)
    }
  }

  return Array.from(buckets.entries())
    .map(([name, v]) => ({
      name,
      total: v.total,
      correct: v.correct,
      accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
}

// ─── The derivation ─────────────────────────────────────────────────────────

/**
 * Compute personal analytics from a learner's persisted attempt history.
 *
 * Pure & deterministic: the same history always yields the same analytics.
 * Empty history → a valid zeroed analytics object (no NaN, no crash), so the
 * learner with no attempts yet sees a clean empty state.
 *
 * NOTE on mode weighting: all attempts contribute to subject/topic aggregation
 * (practice reveals gaps too), but `overall.simulationAttempts` is broken out
 * because readiness conclusions should weight Simulation more heavily — that
 * weighting is a consumer decision, not an analytics one, so we surface the
 * split rather than bake in a weighted average.
 */
export function computePersonalAnalytics(
  history: AttemptHistoryItem[],
): PersonalAnalytics {
  const totalAttempts = history.length
  const practiceAttempts = history.filter((h) => h.mode === 'practice').length
  const simulationAttempts = totalAttempts - practiceAttempts

  const totalQuestions = sum(history, (h) => h.total)
  const totalAnswered = sum(history, (h) => h.answered_count)
  const totalCorrect = sum(history, (h) => h.score)

  const subjectRaw = aggregateByTag(history, 'subject').map((s) => ({
    ...s,
    kind: 'Subject' as const,
  }))
  const topicRaw = aggregateByTag(history, 'topic').map((t) => ({
    ...t,
    kind: 'Topic' as const,
  }))

  const weakSubjects = subjectRaw
    .filter((s) => s.total > 0 && s.accuracy < WEAK_SUBJECT_THRESHOLD)
    .map((s) => ({ ...s, classification: 'weak' as const }))
  const strongSubjects = subjectRaw
    .filter((s) => s.total > 0 && s.accuracy >= STRONG_SUBJECT_THRESHOLD)
    .map((s) => ({ ...s, classification: 'strong' as const }))

  // Chronological order for trending (history comes in newest-first).
  const chronological = [...history].sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
  )
  const trend: TrendPoint[] = chronological.map((h) => ({
    completedAt: h.completed_at,
    attemptId: h.id,
    accuracy: h.accuracy,
    score: h.score,
    mode: h.mode,
  }))

  return {
    overall: {
      totalAttempts,
      practiceAttempts,
      simulationAttempts,
      totalQuestions,
      totalAnswered,
      totalCorrect,
      totalIncorrect: Math.max(0, totalAnswered - totalCorrect),
      averageAccuracy: Math.round(mean(history.map((h) => h.accuracy))),
      averageScore: round1(mean(history.map((h) => h.score))),
      bestScore: history.reduce((max, h) => Math.max(max, h.score), 0),
      averageTimeSeconds: Math.round(mean(history.map((h) => h.time_used_seconds))),
    },
    subjectPerformance: subjectRaw,
    topicPerformance: topicRaw,
    weakSubjects,
    strongSubjects,
    history: chronological,
    trend,
  }
}

/** Small sum helper over an array + selector. */
function sum<T>(arr: T[], sel: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + (sel(x) || 0), 0)
}
