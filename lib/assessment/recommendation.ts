/**
 * lib/assessment/recommendation.ts
 * ----------------------------------------------------------------------------
 * Assessment Platform — Epic 4: Recommendation Engine (Phase 1, deterministic).
 *
 * Source of truth: "Assessment Platform Master Specification v1.0"
 *   - Part IV §29 (Recommendation): uses evidence from Outcome, Analytics,
 *     Learning History. Principles: Evidence Before Recommendation; Explain
 *     Every Recommendation; Human Understandable; Learning Before Engagement.
 *   - Constitution AI-006: derived data never becomes authoritative.
 *   - Memory anchor: "Simulation measures readiness; it does not teach
 *     content." → governs which recommendation category fits which target.
 *
 * What this module is:
 *   - A PURE, DETERMINISTIC, rule-based engine. No ML, no LLM, no AI reasoning.
 *   - It consumes ONLY PersonalAnalytics (Epic 3) and produces a categorized,
 *     explained set of recommendations.
 *   - Each recommendation carries a human-readable `reason` traceable back to
 *     the Analytics input — so every suggestion is reproducible and auditable.
 *
 * What this module is NOT:
 *   - It does NOT read the DB. Attaching real learning targets (Summary/ExamSet
 *     links) to a recommendation is the job of a read-only server action that
 *     wraps this engine (see app/assessment/actions.ts → resolveRecommendations).
 *     This keeps the engine pure and testable; the server action handles the
 *     "consume Outcomes + look up content" boundary.
 *   - It does NOT modify Analytics/Outcomes/Runtime. Read-only, by construction.
 *
 * Determinism contract:
 *   The same PersonalAnalytics input always yields the same recommendations in
 *   the same order. No randomness, no variety-for-variety's-sake. A future AI
 *   recommender will drop into the SAME output contract — just with richer
 *   derivation logic. The shape is stable; the intelligence is pluggable.
 */

import type {
  PersonalAnalytics,
  SubjectPerformance,
  TopicPerformance,
} from './analytics'

// ─── Output types ───────────────────────────────────────────────────────────

/**
 * The kind of learning action a recommendation proposes. Each category has a
 * distinct learning reason (the spec: "Recommendations must explain WHY").
 */
export type RecommendationCategory =
  | 'study_weak_subject' // Re-learn a weak subject's material (Summary).
  | 'review_weak_topic' // Drill down on a specific weak topic.
  | 'reinforce_strong_topic' // Light reinforcement of mastery (de-prioritized vs weak).
  | 'retry_simulation' // Measure readiness again after patching.
  | 'continue_practice' // Keep a formative practice habit going.

/**
 * A reference to a learning target the learner can act on. `kind` tells the UI
 * how to render/link it. The id/slug fields are filled in by the server action
 * (which can query Summaries/ExamSets); the pure engine leaves them null and
 * the server action enriches. This split keeps the engine DB-free.
 */
export interface RecommendationTarget {
  kind: 'summary' | 'exam_set' | 'package' | 'none'
  /** Populated by the server action when a concrete Summary/ExamSet is found. */
  id?: string
  /** Summary slug or exam-set id, for URL construction. */
  slug?: string
  /** Package slug the target lives under (for the /package/[slug]/... URL). */
  packageSlug?: string
  /** Human label for the target (e.g. Summary title, ExamSet name). */
  label?: string
}

/**
 * One recommendation. Everything downstream (UI, future AI) consumes this shape.
 */
export interface Recommendation {
  category: RecommendationCategory
  /** Stable precedence: lower = more important. The UI surfaces the top items. */
  priority: number
  /** Short title, e.g. "ทบทวนวิชา กฎหมายทรัพยากร". */
  title: string
  /** Human-readable WHY — traceable to Analytics. Required by the spec. */
  reason: string
  /** The tag (subject/topic) this recommendation is about, when applicable. */
  subject?: string
  topic?: string
  /** The accuracy figure that triggered this recommendation, for transparency. */
  evidenceAccuracy?: number
  /** How many attempts/questions backed the evidence. */
  evidenceCount?: number
  /** Actionable target (filled by the server action; null until enriched). */
  target: RecommendationTarget | null
}

/** The full recommendation payload. */
export interface RecommendationSet {
  /** Ordered by priority (most important first). */
  recommendations: Recommendation[]
  /** True when Analytics had no attempts — caller should show empty state. */
  isEmpty: boolean
}

// ─── Tuning (deterministic thresholds; not product policy, just defaults) ────

/** Below this accuracy a topic/subject is "weak" and worth recommending. */
const WEAK_ACCURACY = 50
/** A weak area is only recommendable if the learner has seen enough of it. */
const MIN_QUESTIONS_FOR_EVIDENCE = 3
/** How many weak topics to recommend (top-N by lowest accuracy then volume). */
const MAX_WEAK_TOPIC_RECS = 3
/** Don't recommend retrying a Simulation if the most recent one is very fresh. */
const RECENT_SIMULATION_HOURS = 48
/** How many strong topics to reinforce (de-prioritized relative to weak). */
const MAX_STRONG_RECS = 1

// ─── The engine ─────────────────────────────────────────────────────────────

/**
 * Produce deterministic, explainable recommendations from PersonalAnalytics.
 *
 * Ordering rule (priority asc): the learner's most blocking gap comes first.
 *   1. Weak subjects (coarsest gap — usually blocks readiness most)
 *   2. Weak topics (sharper gap — the specific fix)
 *   3. Retry Simulation (if readiness signal is stale)
 *   4. Continue practice (if formative habit is light)
 *   5. Reinforce strong topic (lowest priority — mastery is already there)
 *
 * Empty analytics → { isEmpty: true, recommendations: [] }. The caller renders
 * a clean empty state.
 */
export function recommend(analytics: PersonalAnalytics): RecommendationSet {
  if (analytics.overall.totalAttempts === 0) {
    return { recommendations: [], isEmpty: true }
  }

  const recs: Recommendation[] = []
  let priority = 0

  // ── 1. Weak subjects (coarsest gap) ──────────────────────────────────────
  for (const s of takeTopWeak(analytics.subjectPerformance)) {
    priority += 1
    recs.push({
      category: 'study_weak_subject',
      priority,
      title: `ทบทวนวิชา ${s.name}`,
      reason: `ความแม่นยำในวิชานี้อยู่ที่ ${s.accuracy}% (${s.correct}/${s.total} ข้อ) — ต่ำกว่าเกณฑ์ ${WEAK_ACCURACY}%`,
      subject: s.name,
      evidenceAccuracy: s.accuracy,
      evidenceCount: s.total,
      target: null,
    })
  }

  // ── 2. Weak topics (sharper gap) ─────────────────────────────────────────
  for (const t of takeTopWeakTopics(analytics.topicPerformance)) {
    priority += 1
    recs.push({
      category: 'review_weak_topic',
      priority,
      title: `ฝึกหัวข้อ ${t.name}`,
      reason: `ตอบถูกเพียง ${t.accuracy}% (${t.correct}/${t.total} ข้อ) ในหัวข้อนี้ — ควรเน้นก่อนสอบ`,
      topic: t.name,
      evidenceAccuracy: t.accuracy,
      evidenceCount: t.total,
      target: null,
    })
  }

  // ── 3. Retry Simulation (if readiness signal is stale) ───────────────────
  // Memory anchor: Simulation MEASURES readiness — recommend it to re-measure,
  // never to "learn content." Only suggest if the learner has patched (i.e. has
  // formative activity) and the latest Simulation is stale.
  const lastSim = analytics.history
    .filter((h) => h.mode === 'simulation')
    .slice()
    .reverse()
    .at(-1)
  const hasRecentPractice = hasRecentAttemptWithin(
    analytics,
    'practice',
    RECENT_SIMULATION_HOURS,
  )
  const simIsStale =
    !lastSim ||
    hoursSince(lastSim.completed_at) > RECENT_SIMULATION_HOURS
  if (hasRecentPractice && simIsStale) {
    priority += 1
    recs.push({
      category: 'retry_simulation',
      priority,
      title: 'ลองทำข้อสอบจำลองอีกครั้ง',
      reason:
        'คุณได้ฝึกหัดมาพอสมควร — ทำข้อสอบจำลองเพื่อวัดความพร้อมล่าสุด (จำลองข้อสอบใช้เพื่อวัดผล ไม่ใช่เพื่อเรียนรู้เนื้อหา)',
      target: null,
    })
  }

  // ── 4. Continue practice (light formative habit) ─────────────────────────
  const recentPracticeCount = countRecent(
    analytics,
    'practice',
    7 * 24, // last 7 days
  )
  if (recentPracticeCount === 0 && analytics.overall.practiceAttempts >= 0) {
    priority += 1
    recs.push({
      category: 'continue_practice',
      priority,
      title: 'ทำแบบฝึกหัดรักษาความจำ',
      reason:
        'ไม่มีบันทึกการฝึกหัดในช่วง 7 วันที่ผ่านมา — การฝึกหัดเป็นประจำช่วยให้จำเนื้อหาได้นานขึ้น',
      target: null,
    })
  }

  // ── 5. Reinforce strong topic (de-prioritized) ───────────────────────────
  for (const t of analytics.topicPerformance
    .filter((t) => t.total >= MIN_QUESTIONS_FOR_EVIDENCE && t.accuracy >= 80)
    .slice(0, MAX_STRONG_RECS)) {
    priority += 1
    recs.push({
      category: 'reinforce_strong_topic',
      priority,
      title: `ทบทวนเล็กน้อย: ${t.name}`,
      reason: `คุณทำหัวข้อนี้ได้ดี (${t.accuracy}%) — ทบทวนเล็กน้อยเพื่อรักษาความชำนาญ`,
      topic: t.name,
      evidenceAccuracy: t.accuracy,
      evidenceCount: t.total,
      target: null,
    })
  }

  return { recommendations: recs, isEmpty: false }
}

// ─── Helpers (all pure) ─────────────────────────────────────────────────────

function takeTopWeak(
  subjects: SubjectPerformance[],
): SubjectPerformance[] {
  return subjects
    .filter((s) => s.total >= MIN_QUESTIONS_FOR_EVIDENCE && s.accuracy < WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, 2)
}

function takeTopWeakTopics(
  topics: TopicPerformance[],
): TopicPerformance[] {
  return topics
    .filter((t) => t.total >= MIN_QUESTIONS_FOR_EVIDENCE && t.accuracy < WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, MAX_WEAK_TOPIC_RECS)
}

function hoursSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return ms / (1000 * 60 * 60)
}

function hasRecentAttemptWithin(
  analytics: PersonalAnalytics,
  mode: 'practice' | 'simulation',
  hours: number,
): boolean {
  return analytics.history.some(
    (h) => h.mode === mode && hoursSince(h.completed_at) <= hours,
  )
}

function countRecent(
  analytics: PersonalAnalytics,
  mode: 'practice' | 'simulation',
  hours: number,
): number {
  return analytics.history.filter(
    (h) => h.mode === mode && hoursSince(h.completed_at) <= hours,
  ).length
}
