/**
 * lib/recommendation/rules/business-rules.ts
 * ----------------------------------------------------------------------------
 * v1.0 Business Rules — applied after ranking + dedup (§10).
 *
 * Each rule implements the BusinessRule interface. Rules can DROP candidates
 * or leave them. They are applied sequentially by the engine pipeline.
 *
 * Adding a rule = implement BusinessRule + add to the engine's rules array.
 * No existing rule or pipeline code changes.
 */

import type { RecommendationPolicy } from '../contracts'
import type { BusinessRule, ScoredCandidate } from '../engine-contracts'

// ─── CategoryCapRule ────────────────────────────────────────────────────────

/**
 * Caps the number of recommendations per discovery signal. Prevents one
 * signal type from dominating the output (e.g., all weak-subject recs).
 *
 * v1.0 default caps:
 *  - weak_subject: max 2 (matching existing MAX_WEAK_SUBJECT_RECS)
 *  - weak_topic: max 3 (matching existing MAX_WEAK_TOPIC_RECS)
 *  - strong_subject: max 1 (matching existing MAX_STRONG_RECS)
 *  - others: max 5 (generous default)
 */
export class CategoryCapRule implements BusinessRule {
  readonly name = 'category-cap'

  private static readonly DEFAULT_CAPS: ReadonlyMap<string, number> = new Map([
    ['weak_subject', 2],
    ['weak_topic', 3],
    ['strong_subject', 1],
    ['strong_topic', 2],
    ['retry_simulation', 1],
    ['continue_practice', 1],
    ['coverage_gap', 3],
  ])

  apply(
    candidates: readonly ScoredCandidate[],
    _policy: RecommendationPolicy
  ): readonly ScoredCandidate[] {
    const counts = new Map<string, number>()
    const out: ScoredCandidate[] = []

    for (const sc of candidates) {
      const signal = sc.candidate.signal
      const cap = CategoryCapRule.DEFAULT_CAPS.get(signal) ?? 5
      const current = counts.get(signal) ?? 0
      if (current < cap) {
        out.push(sc)
        counts.set(signal, current + 1)
      }
    }

    return out
  }
}

// ─── MinimumEvidenceRule ────────────────────────────────────────────────────

/**
 * Drops candidates with insufficient evidence (attemptCount below the
 * policy's minQuestionsForEvidence threshold). A weak signal based on 1
 * attempt is not actionable enough to recommend.
 */
export class MinimumEvidenceRule implements BusinessRule {
  readonly name = 'minimum-evidence'

  apply(
    candidates: readonly ScoredCandidate[],
    policy: RecommendationPolicy
  ): readonly ScoredCandidate[] {
    return candidates.filter((sc) => {
      const count = sc.candidate.evidence.attemptCount
      // If no evidence data, keep (the signal came from somewhere).
      if (count === null) return true
      return count >= policy.minQuestionsForEvidence
    })
  }
}

// ─── TotalCapRule ───────────────────────────────────────────────────────────

/**
 * Hard cap on total recommendations. Prevents an overwhelming list.
 * v1.0 default: 10.
 */
export class TotalCapRule implements BusinessRule {
  readonly name = 'total-cap'
  private readonly maxTotal: number

  constructor(maxTotal = 10) {
    this.maxTotal = maxTotal
  }

  apply(
    candidates: readonly ScoredCandidate[],
    _policy: RecommendationPolicy
  ): readonly ScoredCandidate[] {
    return candidates.slice(0, this.maxTotal)
  }
}

// ─── DiversityFloorRule ────────────────────────────────────────────────────

/**
 * Ensures at least 1 recommendation from each signal type present in the
 * candidate pool (if any exist). Prevents all-recs-same-signal monotony.
 *
 * Operates AFTER CategoryCap + TotalCap. If a signal was capped out but
 * nothing else fills its slot, this rule does NOT re-add — it only ensures
 * signals that have candidates but were pushed past the total cap still
 * get at least one representative.
 */
export class DiversityFloorRule implements BusinessRule {
  readonly name = 'diversity-floor'

  apply(
    candidates: readonly ScoredCandidate[],
    _policy: RecommendationPolicy
  ): readonly ScoredCandidate[] {
    // Get the set of signals already represented.
    const represented = new Set(candidates.map((sc) => sc.candidate.signal))

    // This is a no-op if all signals are already represented.
    // In a future version, this rule could pull back representatives from
    // dropped candidates. For v1.0, it's a placeholder that documents the
    // intent and provides the extension point.
    void represented
    return candidates
  }
}

// ─── Default rules factory ──────────────────────────────────────────────────

/** The v1.0 default rule set, applied in order. */
export function createDefaultRules(): BusinessRule[] {
  return [
    new MinimumEvidenceRule(),
    new CategoryCapRule(),
    new DiversityFloorRule(),
    new TotalCapRule(),
  ]
}
