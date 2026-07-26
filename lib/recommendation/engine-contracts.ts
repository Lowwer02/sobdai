/**
 * lib/recommendation/engine-contracts.ts
 * ----------------------------------------------------------------------------
 * Recommendation Engine (E-3) — contracts.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Recommendation Engine Architecture Specification v1.0
 *     §3 (Input), §4 (Output), §7 (Scoring), §10 (Business Rules)
 *
 * TYPES ONLY. No I/O, no side effects, no database.
 *
 * KEY DESIGN (refinements applied):
 *  - RuleBasedScoringStrategy is an ORCHESTRATOR of ScoringFactor[] — it
 *    contains zero scoring logic itself (§7 refinement 1).
 *  - Priority is a PRESENTATION concern assigned during Assembly, NOT during
 *    Ranking. Ranking produces ordering only (§8/§11 refinement 2).
 */

import type {
  CandidateEvidence,
  RecommendationCandidate,
  RecommendationContentType,
  RecommendationPolicy,
} from './contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. UserContext (optional extension point — §3.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optional user context for scoring enrichment. All fields nullable/optional
 * so v1.0 can call the Engine with `null` and the pipeline works without it.
 *
 * Extension point, not a dependency (§3.3, D7).
 */
export interface UserContext {
  readonly previouslyShownIds?: readonly string[]
  readonly lastActiveAt?: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Scoring contracts (§7)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context passed to scoring factors. Carries the policy, optional user
 * context, and the full candidate set (for diversity computation).
 */
export interface ScoringContext {
  readonly policy: RecommendationPolicy
  readonly userContext: UserContext | null
  readonly allCandidates: readonly RecommendationCandidate[]
}

/**
 * One dimension of a candidate's score (§7.1). Each factor is a standalone,
 * independently testable component. The RuleBasedScoringStrategy orchestrates
 * a list of these — it does NOT implement scoring logic itself (refinement 1).
 *
 * Adding a scoring dimension = implement ScoringFactor + register. No
 * existing factor or pipeline code changes.
 */
export interface ScoringFactor {
  readonly name: string
  readonly weight: number
  compute(candidate: RecommendationCandidate, context: ScoringContext): number
}

/**
 * Top-level scoring interface (§7.1). Swappable: rule-based → AI → ML.
 * The pipeline calls `strategy.score()` for each candidate; swapping the
 * strategy changes scoring intelligence, not pipeline structure.
 */
export interface ScoringStrategy {
  readonly name: string
  score(candidate: RecommendationCandidate, context: ScoringContext): ScoringBreakdown
}

/**
 * Why a candidate received its score. Each factor contributes a weighted
 * sub-score. Carried for audit/debugging.
 */
export interface ScoringBreakdown {
  readonly signalWeight: number
  readonly evidenceWeight: number
  readonly freshnessWeight: number
  readonly diversityWeight: number
  readonly total: number
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Internal pipeline types (§5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A candidate after scoring (Stage 1 output). Score assigned; NO priority yet.
 * Priority is assigned during Assembly (§11, refinement 2).
 */
export interface ScoredCandidate {
  readonly candidate: RecommendationCandidate
  readonly score: number
  readonly scoringBreakdown: ScoringBreakdown
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Business Rule contracts (§10)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A business constraint applied after ranking + dedup (§10). Each rule can
 * DROP candidates or REORDER them. Rules are pluggable (array of functions).
 */
export interface BusinessRule {
  readonly name: string
  apply(
    candidates: readonly ScoredCandidate[],
    policy: RecommendationPolicy
  ): readonly ScoredCandidate[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Output contract (§4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recommendation category. Maps from E-2 DiscoverySignal via the
 * signal→category table (§11 Appendix B).
 */
export type RecommendationCategory =
  | 'study_weak_subject'
  | 'review_weak_topic'
  | 'reinforce_strong_subject'
  | 'reinforce_strong_topic'
  | 'retry_simulation'
  | 'continue_practice'

/**
 * The content target to link to. May be null if enrichment is deferred.
 * Backward-compatible with the existing RecommendationTarget shape.
 */
export interface RecommendationTarget {
  readonly kind: RecommendationContentType | 'none'
  readonly id: string | null
  readonly slug: string | null
  readonly packageSlug: string | null
  readonly label: string | null
}

/**
 * A final recommendation — the Engine's output unit (§4.2).
 * Backward-compatible with the existing Recommendation interface (same
 * fields: category, priority, title, reason, target). Adds: score,
 * scoringBreakdown, candidateId for traceability.
 *
 * Priority is assigned during Assembly (§11), NOT during Ranking (§8).
 */
export interface EngineRecommendation {
  readonly id: string
  readonly category: RecommendationCategory
  readonly priority: number
  readonly score: number
  readonly title: string
  readonly reason: string
  readonly target: RecommendationTarget | null
  readonly evidence: CandidateEvidence
  readonly subject: string | null
  readonly topic: string | null
  readonly scoringBreakdown: ScoringBreakdown
  readonly candidateId: string
}

/**
 * Aggregate stats for the output RecommendationSet.
 */
export interface RecommendationSetStats {
  readonly totalRecommendations: number
  readonly byCategory: ReadonlyMap<RecommendationCategory, number>
  readonly averageScore: number
  readonly dedupedCount: number
}

/**
 * The Engine's output (§4.2). Immutable.
 */
export interface RecommendationSet {
  readonly recommendations: readonly EngineRecommendation[]
  readonly isEmpty: boolean
  readonly stats: RecommendationSetStats
}
