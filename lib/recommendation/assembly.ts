/**
 * lib/recommendation/assembly.ts
 * ----------------------------------------------------------------------------
 * Recommendation Assembly — the final pipeline stage (§11).
 *
 * Source of truth: Recommendation Engine Architecture v1.0 §11.
 *
 * Converts filtered ScoredCandidates into EngineRecommendations. This is the
 * ONLY place priority is assigned (refinement 2) — it's a presentation concern
 * applied at the final output boundary, AFTER dedup + business rules.
 *
 * Pure functions. No side effects, no I/O.
 */

import type { DiscoverySignal } from './contracts'
import type {
  EngineRecommendation,
  RecommendationCategory,
  RecommendationTarget,
  RecommendationSet,
  RecommendationSetStats,
  ScoredCandidate,
} from './engine-contracts'

// ─── Signal → Category mapping (§11 Appendix B) ─────────────────────────────

const SIGNAL_TO_CATEGORY: ReadonlyMap<DiscoverySignal, RecommendationCategory> = new Map([
  ['weak_subject', 'study_weak_subject'],
  ['weak_topic', 'review_weak_topic'],
  ['strong_subject', 'reinforce_strong_subject'],
  ['strong_topic', 'reinforce_strong_topic'],
  ['retry_simulation', 'retry_simulation'],
  ['continue_practice', 'continue_practice'],
  ['coverage_gap', 'review_weak_topic'],
])

/**
 * Map a DiscoverySignal to its RecommendationCategory.
 * Falls back to 'review_weak_topic' for unknown signals.
 */
export function signalToCategory(signal: DiscoverySignal): RecommendationCategory {
  return SIGNAL_TO_CATEGORY.get(signal) ?? 'review_weak_topic'
}

// ─── Title + Reason builders (Thai localization) ────────────────────────────

/**
 * Build a Thai display title for a recommendation.
 * The template follows §11 Appendix B.
 */
function buildTitle(candidate: ScoredCandidate['candidate']): string {
  const subject = candidate.evidence.subject
  const topic = candidate.evidence.topic

  switch (candidate.signal) {
    case 'weak_subject':
      return subject ? `ทบทวนวิชา ${subject}` : 'ทบทวนวิชาที่อ่อน'
    case 'weak_topic':
      return topic ? `ฝึกทำข้อสอบ ${topic}` : 'ฝึกทำข้อสอบ'
    case 'strong_subject':
      return subject ? `เสริมความแข็งแกร่ง ${subject}` : 'เสริมจุดเด่น'
    case 'strong_topic':
      return topic ? `รักษาระดับ ${topic}` : 'รักษาระดับ'
    case 'retry_simulation':
      return 'ลองทำจำลองอีกครั้ง'
    case 'continue_practice':
      return 'ฝึกต่อ'
    case 'coverage_gap':
      return topic ? `เติมช่องว่าง ${topic}` : 'เติมช่องว่างความรู้'
    default:
      return 'แนะนำเนื้อหา'
  }
}

/**
 * Build a Thai display reason for a recommendation.
 * Incorporates evidence data (accuracy, attempt count) for traceability.
 */
function buildReason(candidate: ScoredCandidate['candidate']): string {
  const acc = candidate.evidence.accuracy
  const cnt = candidate.evidence.attemptCount
  const subject = candidate.evidence.subject
  const topic = candidate.evidence.topic

  const evidenceStr = acc !== null && cnt !== null
    ? ` (ความแม่นยำ ${acc}% จาก ${cnt} ข้อ)`
    : ''

  switch (candidate.signal) {
    case 'weak_subject':
      return `วิชา${subject ? ` ${subject}` : ''}ที่ควรทบทวน${evidenceStr}`
    case 'weak_topic':
      return `หัวข้อ${topic ? ` ${topic}` : ''}ที่ควรฝึกฝนเพิ่ม${evidenceStr}`
    case 'strong_subject':
      return `วิชา${subject ? ` ${subject}` : ''}ที่ทำได้ดี${evidenceStr} — เสริมความแข็งแกร่ง`
    case 'strong_topic':
      return `หัวข้อ${topic ? ` ${topic}` : ''}ที่ทำได้ดี${evidenceStr} — รักษามาตรฐาน`
    case 'retry_simulation':
      return 'ยังไม่ได้ทำแบบจำลองเร็วๆ นี้ — ลองทบทวนความพร้อม'
    case 'continue_practice':
      return 'เริ่มฝึกแล้วแต่ยังไม่ได้ทำต่อ — กลับมาฝึกต่อ'
    case 'coverage_gap':
      return `ยังไม่ได้เรียนรู้${topic ? ` ${topic}` : ''} — เติมช่องว่าง`
    default:
      return candidate.reason
  }
}

// ─── Target builder ─────────────────────────────────────────────────────────

/**
 * Build a RecommendationTarget from the candidate's content reference.
 * The target's packageSlug starts null — the server action resolves it
 * (it needs a DB lookup the Engine doesn't do).
 */
function buildTarget(candidate: ScoredCandidate['candidate']): RecommendationTarget {
  const content = candidate.content
  return {
    kind: content.kind,
    id: content.contentId,
    slug: content.slug,
    packageSlug: null, // resolved post-Engine by the server action
    label: content.title,
  }
}

// ─── Stats builder ──────────────────────────────────────────────────────────

function buildStats(
  recommendations: readonly EngineRecommendation[],
  dedupedCount: number
): RecommendationSetStats {
  const byCategory = new Map<RecommendationCategory, number>()
  let totalScore = 0
  for (const r of recommendations) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1)
    totalScore += r.score
  }
  return {
    totalRecommendations: recommendations.length,
    byCategory,
    averageScore: recommendations.length > 0 ? totalScore / recommendations.length : 0,
    dedupedCount,
  }
}

// ─── Public API: assembleRecommendations ────────────────────────────────────

/**
 * Assemble the final RecommendationSet from filtered ScoredCandidates.
 *
 * This is where priority is assigned (refinement 2): sequential 1, 2, 3, ...
 * in the final score-sorted order AFTER dedup + business rules. Priority
 * is a presentation concern — it reflects display order, not raw score.
 *
 * @param candidates     The filtered, score-sorted, deduplicated candidates.
 * @param dedupedCount   How many candidates were collapsed during dedup (for stats).
 */
export function assembleRecommendations(
  candidates: readonly ScoredCandidate[],
  dedupedCount: number
): RecommendationSet {
  // Assign sequential priority (1, 2, 3, ...) — presentation concern.
  // The candidates arrive already score-sorted from the ranking stage.
  const recommendations: EngineRecommendation[] = candidates.map((sc, index) => ({
    id: sc.candidate.id,
    category: signalToCategory(sc.candidate.signal),
    priority: index + 1,
    score: Math.round(sc.score * 100) / 100, // 2 decimal places
    title: buildTitle(sc.candidate),
    reason: buildReason(sc.candidate),
    target: buildTarget(sc.candidate),
    evidence: sc.candidate.evidence,
    subject: sc.candidate.metadata.subject,
    topic: sc.candidate.metadata.topic,
    scoringBreakdown: sc.scoringBreakdown,
    candidateId: sc.candidate.id,
  }))

  const stats = buildStats(recommendations, dedupedCount)

  return {
    recommendations,
    isEmpty: recommendations.length === 0,
    stats,
  }
}
