/**
 * lib/recommendation/scoring/factors.ts
 * ----------------------------------------------------------------------------
 * v1.0 Scoring Factors — the building blocks of RuleBasedScoringStrategy.
 *
 * Source of truth: Recommendation Engine Architecture v1.0 §7.2.
 *
 * Each factor is a standalone, independently testable component that
 * computes ONE dimension of a candidate's score (0..100). The
 * RuleBasedScoringStrategy orchestrates these — it doesn't implement
 * scoring logic itself (refinement 1).
 *
 * Pure functions. No side effects, no I/O.
 */

import type { RecommendationCandidate } from '../contracts'
import type { ScoringContext, ScoringFactor } from '../engine-contracts'

// ─── SignalFactor (weight 0.40) ─────────────────────────────────────────────

/**
 * Scores based on the discovery signal. Weak subjects/topics are most urgent
 * (highest sub-score); strong signals are moderate; retry/continue are
 * moderate. The signal is the PRIMARY driver of relevance.
 */
export class SignalFactor implements ScoringFactor {
  readonly name = 'signal'
  readonly weight = 0.40

  private static readonly SIGNAL_SCORES: ReadonlyMap<string, number> = new Map([
    ['weak_subject', 90], // most urgent — learner is struggling
    ['weak_topic', 85], // very urgent — specific gap
    ['retry_simulation', 65], // important — readiness check
    ['continue_practice', 60], // important — momentum
    ['strong_subject', 50], // moderate — reinforcement
    ['strong_topic', 45], // moderate — maintenance
    ['coverage_gap', 70], // urgent — missing area
  ])

  compute(candidate: RecommendationCandidate, _context: ScoringContext): number {
    return SignalFactor.SIGNAL_SCORES.get(candidate.signal) ?? 50
  }
}

// ─── EvidenceFactor (weight 0.30) ───────────────────────────────────────────

/**
 * Scores based on evidence strength. Higher when accuracy is LOWER (more
 * urgent gap) AND attemptCount is HIGHER (more reliable signal — the data
 * is trustworthy). A weak topic with 50 attempts is more actionable than
 * one with 3 attempts.
 */
export class EvidenceFactor implements ScoringFactor {
  readonly name = 'evidence'
  readonly weight = 0.30

  compute(candidate: RecommendationCandidate, context: ScoringContext): number {
    const accuracy = candidate.evidence.accuracy
    const attemptCount = candidate.evidence.attemptCount

    // No evidence → neutral score.
    if (accuracy === null || attemptCount === null) return 50

    // Accuracy component: lower accuracy → higher urgency.
    // accuracy 0 → 100 (max urgency); accuracy 100 → 0 (no urgency).
    const accuracyScore = Math.max(0, 100 - accuracy)

    // Evidence-volume component: more attempts → more reliable signal.
    // Scale: 3 attempts → 50; 10+ → 100. Logarithmic growth.
    const minEvidence = context.policy.minQuestionsForEvidence
    const volumeScore = Math.min(100, 50 + (Math.log(attemptCount / minEvidence) / Math.log(3)) * 50)

    // Weighted blend: accuracy matters more than volume.
    return accuracyScore * 0.65 + volumeScore * 0.35
  }
}

// ─── FreshnessFactor (weight 0.15) ──────────────────────────────────────────

/**
 * Scores based on content freshness. Gives a bonus if the content HASN'T been
 * seen recently (requires UserContext). When UserContext is null, returns a
 * neutral 50 (no freshness adjustment in v1.0 without context).
 */
export class FreshnessFactor implements ScoringFactor {
  readonly name = 'freshness'
  readonly weight = 0.15

  compute(candidate: RecommendationCandidate, context: ScoringContext): number {
    // No user context → neutral (no freshness data to score against).
    if (!context.userContext || !context.userContext.previouslyShownIds) return 50

    // If this candidate's content was previously shown → penalize (lower score).
    const shown = context.userContext.previouslyShownIds.includes(candidate.id)
    if (shown) return 20 // seen before — de-prioritize

    // Not seen → fresh → full bonus.
    return 100
  }
}

// ─── DiversityFactor (weight 0.15) ──────────────────────────────────────────

/**
 * Scores based on subject/topic diversity within the candidate set. Penalizes
 * candidates whose subject or topic appears many times in the set (prevents
 * mono-subject recommendation lists).
 */
export class DiversityFactor implements ScoringFactor {
  readonly name = 'diversity'
  readonly weight = 0.15

  compute(candidate: RecommendationCandidate, context: ScoringContext): number {
    const all = context.allCandidates
    if (all.length === 0) return 50

    // Count how many candidates share this subject or topic.
    const subject = candidate.metadata.subject
    const topic = candidate.metadata.topic

    let sameSubject = 0
    let sameTopic = 0
    for (const c of all) {
      if (subject && c.metadata.subject === subject) sameSubject++
      if (topic && c.metadata.topic === topic) sameTopic++
    }

    // More duplicates → lower diversity score.
    // If this subject appears in 50%+ of candidates → score approaches 0.
    const subjectRatio = sameSubject / all.length
    const topicRatio = topic ? sameTopic / all.length : 0

    // Take the worse of the two (the binding constraint).
    const maxRatio = Math.max(subjectRatio, topicRatio)

    // Linear penalty: ratio 0 → score 100; ratio 1 → score 0.
    return Math.round(100 * (1 - maxRatio))
  }
}
