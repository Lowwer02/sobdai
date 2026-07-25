/**
 * lib/recommendation/signals.ts
 * ----------------------------------------------------------------------------
 * Signal Extraction — Analytics → DiscoverySignals.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §5.
 *
 * Derives discovery signals from PersonalAnalytics. Each signal carries the
 * Analytics evidence that triggered it (subject/topic/accuracy/attemptCount)
 * so the RCD can attach it to each discovered candidate.
 *
 * Pure functions. No I/O, no side effects. Deterministic given the same
 * Analytics input + Policy.
 */

import type { PersonalAnalytics, ClassifiedSubject, TopicPerformance } from '@/lib/assessment/analytics'
import type { DiscoverySignal, RecommendationPolicy } from './contracts'

// ─── Extracted signal types ────────────────────────────────────────────────

/**
 * A derived discovery signal with its Analytics evidence attached.
 * The RCD uses these to build ContentStore queries and candidate evidence.
 */
export interface ExtractedSignal {
  readonly signal: DiscoverySignal
  readonly subject: string | null
  readonly topic: string | null
  readonly accuracy: number | null
  readonly attemptCount: number | null
}

// ─── Public API: extractSignals ─────────────────────────────────────────────

/**
 * Extract discovery signals from PersonalAnalytics, filtered by the Policy's
 * active signals.
 *
 * Pure and deterministic.
 *
 * @param analytics  The learner's analytics (from computePersonalAnalytics).
 * @param policy     The Recommendation Policy (thresholds + active signals).
 */
export function extractSignals(
  analytics: PersonalAnalytics,
  policy: RecommendationPolicy
): readonly ExtractedSignal[] {
  const signals: ExtractedSignal[] = []
  const activeSignals = new Set(policy.signals)

  // 1. Weak subjects (from pre-classified Analytics).
  if (activeSignals.has('weak_subject')) {
    for (const ws of analytics.weakSubjects) {
      signals.push({
        signal: 'weak_subject',
        subject: ws.name,
        topic: null,
        accuracy: ws.accuracy,
        attemptCount: ws.total,
      })
    }
  }

  // 2. Strong subjects (from pre-classified Analytics).
  if (activeSignals.has('strong_subject')) {
    for (const ss of analytics.strongSubjects) {
      signals.push({
        signal: 'strong_subject',
        subject: ss.name,
        topic: null,
        accuracy: ss.accuracy,
        attemptCount: ss.total,
      })
    }
  }

  // 3. Weak topics (derived from topicPerformance by threshold + evidence).
  if (activeSignals.has('weak_topic')) {
    for (const tp of analytics.topicPerformance) {
      if (
        tp.total >= policy.minQuestionsForEvidence &&
        tp.accuracy < policy.weakTopicAccuracyThreshold
      ) {
        signals.push({
          signal: 'weak_topic',
          subject: null,
          topic: tp.name,
          accuracy: tp.accuracy,
          attemptCount: tp.total,
        })
      }
    }
  }

  // 4. Strong topics (derived from topicPerformance by threshold + evidence).
  if (activeSignals.has('strong_topic')) {
    for (const tp of analytics.topicPerformance) {
      if (
        tp.total >= policy.minQuestionsForEvidence &&
        tp.accuracy >= policy.strongTopicAccuracyThreshold
      ) {
        signals.push({
          signal: 'strong_topic',
          subject: null,
          topic: tp.name,
          accuracy: tp.accuracy,
          attemptCount: tp.total,
        })
      }
    }
  }

  // 5. Retry simulation (no simulation attempt in the recency window).
  if (activeSignals.has('retry_simulation') && analytics.history.length > 0) {
    const windowMs = policy.seenContentWindowHours * 60 * 60 * 1000
    const now = Date.now()
    const hasRecentSim = analytics.history.some(
      (h) =>
        h.mode === 'simulation' &&
        Math.abs(now - new Date(h.completed_at).getTime()) < windowMs
    )
    if (!hasRecentSim) {
      signals.push({
        signal: 'retry_simulation',
        subject: null,
        topic: null,
        accuracy: null,
        attemptCount: null,
      })
    }
  }

  // 6. Continue practice (has practice attempts but hasn't completed recently).
  if (activeSignals.has('continue_practice') && analytics.history.length > 0) {
    const windowMs = policy.seenContentWindowHours * 60 * 60 * 1000
    const now = Date.now()
    const hasRecentPractice = analytics.history.some(
      (h) =>
        h.mode === 'practice' &&
        Math.abs(now - new Date(h.completed_at).getTime()) < windowMs
    )
    if (!hasRecentPractice && analytics.overall.practiceAttempts > 0) {
      signals.push({
        signal: 'continue_practice',
        subject: null,
        topic: null,
        accuracy: null,
        attemptCount: null,
      })
    }
  }

  // coverage_gap is deferred (needs Blueprint integration).

  return signals
}
