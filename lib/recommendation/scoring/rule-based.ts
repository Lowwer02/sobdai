/**
 * lib/recommendation/scoring/rule-based.ts
 * ----------------------------------------------------------------------------
 * RuleBasedScoringStrategy — the v1.0 default scoring strategy.
 *
 * Source of truth: Recommendation Engine Architecture v1.0 §7.1 (refinement 1).
 *
 * KEY DESIGN: This strategy is an ORCHESTRATOR, not an implementor. It
 * composes a list of ScoringFactor components, calls each factor's compute()
 * for every candidate, weights the sub-scores, and sums them into a
 * ScoringBreakdown. The strategy itself contains ZERO scoring logic — all
 * intelligence lives in the individual factor implementations.
 *
 * Adding a scoring dimension = implement ScoringFactor + pass to constructor.
 * Swapping the entire strategy = implement ScoringStrategy interface.
 */

import type { RecommendationCandidate } from '../contracts'
import type {
  ScoringBreakdown,
  ScoringContext,
  ScoringFactor,
  ScoringStrategy,
} from '../engine-contracts'
import {
  SignalFactor,
  EvidenceFactor,
  FreshnessFactor,
  DiversityFactor,
} from './factors'

export class RuleBasedScoringStrategy implements ScoringStrategy {
  readonly name = 'rule-based-v1'
  private readonly factors: readonly ScoringFactor[]

  constructor(factors?: ScoringFactor[]) {
    this.factors = factors ?? createDefaultFactors()
  }

  /**
   * Score a candidate by orchestrating the factor list.
   *
   * For each factor: call compute() → raw sub-score (0..100). Multiply by
   * the factor's weight. Sum all weighted sub-scores. Cap at 100.
   *
   * The strategy does NOT interpret what the scores mean — it just
   * orchestrates and aggregates. All intelligence is in the factors.
   */
  score(candidate: RecommendationCandidate, context: ScoringContext): ScoringBreakdown {
    const subScores: Record<string, number> = {}
    let total = 0

    for (const factor of this.factors) {
      const raw = factor.compute(candidate, context)
      const weighted = raw * factor.weight
      subScores[factor.name] = weighted
      total += weighted
    }

    return {
      signalWeight: subScores['signal'] ?? 0,
      evidenceWeight: subScores['evidence'] ?? 0,
      freshnessWeight: subScores['freshness'] ?? 0,
      diversityWeight: subScores['diversity'] ?? 0,
      total: Math.min(100, total),
    }
  }
}

/** The v1.0 default factor set. */
function createDefaultFactors(): ScoringFactor[] {
  return [
    new SignalFactor(),
    new EvidenceFactor(),
    new FreshnessFactor(),
    new DiversityFactor(),
  ]
}
