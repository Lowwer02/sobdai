/**
 * lib/recommendation/engine.ts
 * ----------------------------------------------------------------------------
 * Recommendation Engine (E-3) — the orchestrator.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Recommendation Engine Architecture v1.0 §5 (Pipeline), §8 (Ranking),
 *     §9 (Dedup), §10 (Rules), §11 (Assembly)
 *
 * rank() is the Engine's single public entry point. It runs the 5-stage
 * pipeline:
 *   1. Evaluate (ScoringStrategy scores each candidate via ScoringFactor[])
 *   2. Rank (sort by score descending; NO priority assignment)
 *   3. Dedup (same contentId → keep highest score)
 *   4. Business Rules (caps, evidence, total limit)
 *   5. Assemble (signal→category, Thai title/reason, PRIORITY assigned here)
 *
 * The Engine NEVER:
 *   - Queries the database (works with candidates only).
 *   - Discovers new candidates (E-2's job).
 *   - Imports Supabase.
 *   - Mutates inputs (candidates, policy are read-only).
 *
 * Determinism: same candidates + policy + strategy → same RecommendationSet.
 * The scoring strategy is deterministic (rule-based v1.0). Future AI
 * strategies may introduce non-determinism — that's the strategy's concern,
 * not the pipeline's.
 */

import type { RecommendationCandidate, RecommendationPolicy } from './contracts'
import type {
  BusinessRule,
  RecommendationSet,
  ScoredCandidate,
  ScoringContext,
  ScoringStrategy,
  UserContext,
} from './engine-contracts'
import { RuleBasedScoringStrategy } from './scoring/rule-based'
import { createDefaultRules } from './rules/business-rules'
import { assembleRecommendations } from './assembly'

// ─── Public API: rank ───────────────────────────────────────────────────────

/**
 * Rank candidates into a RecommendationSet.
 *
 * @param candidates   The discovered candidates (from E-2).
 * @param policy       The Recommendation Policy (thresholds, caps).
 * @param strategy     Scoring strategy (default: RuleBasedScoringStrategy).
 * @param rules        Business rules (default: v1.0 default set).
 * @param userContext  Optional user context (for freshness scoring).
 */
export function rank(
  candidates: readonly RecommendationCandidate[],
  policy: RecommendationPolicy,
  strategy?: ScoringStrategy,
  rules?: BusinessRule[],
  userContext?: UserContext | null
): RecommendationSet {
  const scoringStrategy = strategy ?? new RuleBasedScoringStrategy()
  const businessRules = rules ?? createDefaultRules()
  const ctx = userContext ?? null

  // Handle empty input.
  if (candidates.length === 0) {
    return assembleRecommendations([], 0)
  }

  // ── Stage 1: Evaluate ─────────────────────────────────────────────────
  const scoringContext: ScoringContext = {
    policy,
    userContext: ctx,
    allCandidates: candidates,
  }

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const breakdown = scoringStrategy.score(candidate, scoringContext)
    return {
      candidate,
      score: breakdown.total,
      scoringBreakdown: breakdown,
    }
  })

  // ── Stage 2: Rank (sort by score descending; NO priority) ─────────────
  const ranked = rankByScore(scored)

  // ── Stage 3: Dedup (same contentId → keep highest score) ──────────────
  const { deduplicated, dedupedCount } = deduplicateByContent(ranked)

  // ── Stage 4: Business Rules ───────────────────────────────────────────
  let filtered: readonly ScoredCandidate[] = deduplicated
  for (const rule of businessRules) {
    filtered = rule.apply(filtered, policy)
  }

  // ── Stage 5: Assemble (priority assigned HERE, not during ranking) ────
  return assembleRecommendations(filtered, dedupedCount)
}

// ─── Ranking (§8) ───────────────────────────────────────────────────────────

/**
 * Sort by score descending. Ties broken by:
 *   1. Signal name (alphabetical — structural, no business priority).
 *   2. Content ID (stable, unique).
 *
 * NO priority assignment here — just ordering. Priority is assigned during
 * Assembly (§11, refinement 2).
 */
function rankByScore(
  scored: readonly ScoredCandidate[]
): readonly ScoredCandidate[] {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score // descending
    if (a.candidate.signal < b.candidate.signal) return -1
    if (a.candidate.signal > b.candidate.signal) return 1
    return a.candidate.content.contentId < b.candidate.content.contentId ? -1
      : a.candidate.content.contentId > b.candidate.content.contentId ? 1 : 0
  })
}

// ─── Deduplication (§9) ─────────────────────────────────────────────────────

/**
 * Deduplicate by contentId. When the same content appears via multiple
 * signals, keep the candidate with the highest score. Record how many
 * were collapsed.
 *
 * The input is already score-sorted (from ranking), so the FIRST occurrence
 * of each contentId is the highest-scoring — we just keep the first.
 */
function deduplicateByContent(
  ranked: readonly ScoredCandidate[]
): { deduplicated: readonly ScoredCandidate[]; dedupedCount: number } {
  const seen = new Set<string>()
  const out: ScoredCandidate[] = []

  for (const sc of ranked) {
    const contentId = sc.candidate.content.contentId
    if (seen.has(contentId)) continue
    seen.add(contentId)
    out.push(sc)
  }

  return {
    deduplicated: out,
    dedupedCount: ranked.length - out.length,
  }
}
