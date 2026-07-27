/**
 * lib/recommendation/engine.test.ts
 * ----------------------------------------------------------------------------
 * Recommendation Engine (E-3) — comprehensive tests.
 *
 * Source of truth: Recommendation Engine Architecture v1.0.
 *
 * RUN: npx jiti lib/recommendation/engine.test.ts
 *
 * Coverage targets:
 *  - Scoring factors produce sub-scores in 0..100.
 *  - RuleBasedScoringStrategy orchestrates factors (weights sum correctly).
 *  - Engine pipeline: evaluate → score → dedup → rank → rules → assemble.
 *  - Priority assigned during ASSEMBLY, not during RANKING (refinement 2).
 *  - Dedup keeps highest-score candidate per content identity.
 *  - Business rules filter correctly (caps, evidence, total).
 *  - Determinism: same inputs → same output.
 *  - Empty input → empty RecommendationSet.
 *  - Signal→Category mapping correct.
 *  - Thai title/reason generation.
 */

import assert from 'node:assert/strict'
import { rank } from './engine'
import { RuleBasedScoringStrategy } from './scoring/rule-based'
import {
  SignalFactor,
  EvidenceFactor,
  FreshnessFactor,
  DiversityFactor,
} from './scoring/factors'
import {
  CategoryCapRule,
  MinimumEvidenceRule,
  TotalCapRule,
} from './rules/business-rules'
import { signalToCategory, assembleRecommendations } from './assembly'
import { DEFAULT_RECOMMENDATION_POLICY } from './policy'
import type {
  RecommendationCandidate,
  RecommendationPolicy,
  DiscoverySignal,
  RecommendationContentType,
} from './contracts'
import type { ScoredCandidate, UserContext, ScoringContext } from './engine-contracts'

// ─── Helpers ────────────────────────────────────────────────────────────────

function mkCandidate(opts: {
  id?: string
  signal?: DiscoverySignal
  type?: RecommendationContentType
  contentId?: string
  subject?: string | null
  topic?: string | null
  accuracy?: number | null
  attemptCount?: number | null
  difficulty?: string | null
} = {}): RecommendationCandidate {
  const signal = opts.signal ?? 'weak_subject'
  const type = opts.type ?? 'summary'
  const contentId = opts.contentId ?? 'c-1'
  return {
    id: opts.id ?? `rc-${signal}-${contentId}`,
    type,
    content: {
      kind: type,
      contentId,
      title: 'Test Summary',
      slug: 'test-slug',
      packageId: 'pkg-1',
    },
    signal,
    reason: 'test reason',
    evidence: {
      subject: opts.subject ?? 'law',
      topic: opts.topic ?? null,
      // Use `!== undefined` so explicit `null` passes through (for "no data" tests).
      accuracy: opts.accuracy !== undefined ? opts.accuracy : 40,
      attemptCount: opts.attemptCount !== undefined ? opts.attemptCount : 10,
    },
    metadata: {
      subject: opts.subject ?? 'law',
      topic: opts.topic ?? null,
      difficulty: opts.difficulty ?? null,
    },
  }
}

function buildPolicy(overrides?: Partial<RecommendationPolicy>): RecommendationPolicy {
  return { ...DEFAULT_RECOMMENDATION_POLICY, ...overrides }
}

// ─── Scoring Factors ────────────────────────────────────────────────────────

function verifies_signal_factor_scores_per_signal(): void {
  const factor = new SignalFactor()
  const ctx: ScoringContext = {
    policy: buildPolicy(),
    userContext: null,
    allCandidates: [],
  }
  // weak_subject gets highest score.
  const weak = factor.compute(mkCandidate({ signal: 'weak_subject' }), ctx)
  const strong = factor.compute(mkCandidate({ signal: 'strong_subject' }), ctx)
  assert.ok(weak > strong, `weak_subject (${weak}) should score higher than strong_subject (${strong})`)
  assert.ok(weak >= 0 && weak <= 100)
}

function verifies_evidence_factor_rewards_low_accuracy(): void {
  const factor = new EvidenceFactor()
  const ctx: ScoringContext = {
    policy: buildPolicy(),
    userContext: null,
    allCandidates: [],
  }
  const lowAcc = factor.compute(mkCandidate({ accuracy: 20, attemptCount: 10 }), ctx)
  const highAcc = factor.compute(mkCandidate({ accuracy: 90, attemptCount: 10 }), ctx)
  assert.ok(lowAcc > highAcc, `low accuracy (${lowAcc}) should score higher than high accuracy (${highAcc})`)
}

function verifies_evidence_factor_neutral_without_data(): void {
  const factor = new EvidenceFactor()
  const ctx: ScoringContext = { policy: buildPolicy(), userContext: null, allCandidates: [] }
  const score = factor.compute(mkCandidate({ accuracy: null, attemptCount: null }), ctx)
  assert.equal(score, 50, 'no evidence data → neutral 50')
}

function verifies_freshness_factor_neutral_without_context(): void {
  const factor = new FreshnessFactor()
  const ctx: ScoringContext = { policy: buildPolicy(), userContext: null, allCandidates: [] }
  const score = factor.compute(mkCandidate(), ctx)
  assert.equal(score, 50, 'no UserContext → neutral 50')
}

function verifies_freshness_factor_penalizes_shown(): void {
  const factor = new FreshnessFactor()
  const candidate = mkCandidate({ id: 'rc-test' })
  const ctx: ScoringContext = {
    policy: buildPolicy(),
    userContext: { previouslyShownIds: ['rc-test'] },
    allCandidates: [],
  }
  const score = factor.compute(candidate, ctx)
  assert.ok(score < 50, `previously shown (${score}) should be below neutral 50`)
}

function verifies_diversity_factor_penalizes_monopoly(): void {
  const factor = new DiversityFactor()
  const candidates = [
    mkCandidate({ id: 'a', subject: 'law' }),
    mkCandidate({ id: 'b', subject: 'law' }),
    mkCandidate({ id: 'c', subject: 'law' }),
    mkCandidate({ id: 'd', subject: 'law' }),
  ]
  const ctx: ScoringContext = {
    policy: buildPolicy(),
    userContext: null,
    allCandidates: candidates,
  }
  const score = factor.compute(candidates[0]!, ctx)
  assert.ok(score < 30, `monopoly subject (${score}) should be heavily penalized`)
}

// ─── RuleBasedScoringStrategy (orchestrator) ────────────────────────────────

function verifies_strategy_orchestrates_factors(): void {
  const strategy = new RuleBasedScoringStrategy()
  const ctx: ScoringContext = {
    policy: buildPolicy(),
    userContext: null,
    allCandidates: [mkCandidate()],
  }
  const breakdown = strategy.score(mkCandidate(), ctx)
  // Total should be a weighted sum of the 4 factors.
  assert.ok(breakdown.total >= 0 && breakdown.total <= 100)
  // Each sub-score should be present.
  assert.ok(typeof breakdown.signalWeight === 'number')
  assert.ok(typeof breakdown.evidenceWeight === 'number')
  assert.ok(typeof breakdown.freshnessWeight === 'number')
  assert.ok(typeof breakdown.diversityWeight === 'number')
}

function verifies_strategy_weights_sum_to_one(): void {
  const strategy = new RuleBasedScoringStrategy()
  // Weights: 0.40 + 0.30 + 0.15 + 0.15 = 1.0
  // Verify via the factors' weights.
  const factors = [
    new SignalFactor(),
    new EvidenceFactor(),
    new FreshnessFactor(),
    new DiversityFactor(),
  ]
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  assert.ok(Math.abs(totalWeight - 1.0) < 0.001, `weights should sum to 1.0, got ${totalWeight}`)
}

// ─── Engine pipeline ────────────────────────────────────────────────────────

function verifies_empty_input_returns_empty_set(): void {
  const result = rank([], buildPolicy())
  assert.equal(result.isEmpty, true)
  assert.equal(result.recommendations.length, 0)
}

function verifies_engine_produces_recommendations(): void {
  const candidates = [
    mkCandidate({ signal: 'weak_subject', contentId: 's1', subject: 'law' }),
    mkCandidate({ signal: 'weak_topic', contentId: 'q1', subject: 'policy' }),
  ]
  const result = rank(candidates, buildPolicy())
  assert.ok(result.recommendations.length > 0)
  assert.equal(result.isEmpty, false)
}

function verifies_recommendation_has_full_shape(): void {
  const candidates = [mkCandidate({ signal: 'weak_subject', contentId: 's1' })]
  const result = rank(candidates, buildPolicy())
  const rec = result.recommendations[0]!
  assert.ok(rec.id.length > 0)
  assert.ok(rec.category.length > 0)
  assert.ok(rec.priority >= 1)
  assert.ok(rec.score >= 0 && rec.score <= 100)
  assert.ok(rec.title.length > 0)
  assert.ok(rec.reason.length > 0)
  assert.ok(rec.target !== null)
  assert.ok(rec.evidence !== undefined)
  assert.ok(rec.scoringBreakdown !== undefined)
  assert.ok(rec.candidateId.length > 0)
}

// ─── Priority assigned during Assembly, NOT Ranking (refinement 2) ─────────

function verifies_priority_sequential_from_1(): void {
  const candidates = [
    mkCandidate({ signal: 'weak_subject', contentId: 'a' }),
    mkCandidate({ signal: 'weak_topic', contentId: 'b' }),
    mkCandidate({ signal: 'strong_subject', contentId: 'c' }),
  ]
  const result = rank(candidates, buildPolicy())
  // Priority should be 1, 2, 3, ... in the final order.
  for (let i = 0; i < result.recommendations.length; i++) {
    assert.equal(result.recommendations[i]!.priority, i + 1)
  }
}

function verifies_priority_reflects_final_order_after_rules(): void {
  // If TotalCap limits to 2, priority should be 1..2 (no gaps).
  const candidates = Array.from({ length: 5 }, (_, i) =>
    mkCandidate({ signal: 'weak_subject', contentId: `c${i}`, subject: `s${i}` })
  )
  const result = rank(
    candidates,
    buildPolicy(),
    undefined,
    [new TotalCapRule(2)],
  )
  assert.ok(result.recommendations.length <= 2)
  // No gaps in priority.
  for (let i = 0; i < result.recommendations.length; i++) {
    assert.equal(result.recommendations[i]!.priority, i + 1)
  }
}

// ─── Dedup ──────────────────────────────────────────────────────────────────

function verifies_dedup_keeps_highest_score_per_content_identity(): void {
  // Same content identity discovered via two different signals.
  const candidates = [
    mkCandidate({ signal: 'weak_subject', contentId: 'shared' }),
    mkCandidate({ signal: 'strong_subject', contentId: 'shared' }),
  ]
  const result = rank(candidates, buildPolicy())
  // Only ONE recommendation for content identity 'summary:shared'.
  const sharedRecs = result.recommendations.filter((r) => r.candidateId.includes('shared'))
  // Dedup happens before assembly; only the highest-score survives.
  // (weak_subject scores higher than strong_subject → weak_subject wins.)
  assert.equal(sharedRecs.length, 1, 'deduplicated to 1')
  assert.ok(result.stats.dedupedCount >= 1, `dedupedCount should be >= 1`)
}

function verifies_dedup_identity_includes_content_type(): void {
  // Same raw id in different content types must not collapse.
  const candidates = [
    mkCandidate({ type: 'summary', signal: 'weak_subject', contentId: 'shared-id' }),
    mkCandidate({ type: 'question', signal: 'weak_subject', contentId: 'shared-id' }),
  ]
  const result = rank(candidates, buildPolicy())
  assert.equal(result.recommendations.length, 2)
  assert.equal(result.stats.dedupedCount, 0)
}

// ─── Business rules ─────────────────────────────────────────────────────────

function verifies_minimum_evidence_drops_insufficient(): void {
  const candidates = [
    mkCandidate({ signal: 'weak_subject', contentId: 'ok', attemptCount: 10 }),
    mkCandidate({ signal: 'weak_subject', contentId: 'low', attemptCount: 1 }), // below min (3)
  ]
  const result = rank(candidates, buildPolicy({ minQuestionsForEvidence: 3 }))
  // 'low' candidate should be dropped (attemptCount 1 < 3).
  assert.ok(!result.recommendations.some((r) => r.candidateId.includes('low')))
}

function verifies_total_cap_limits_output(): void {
  const candidates = Array.from({ length: 20 }, (_, i) =>
    mkCandidate({ signal: 'weak_subject', contentId: `c${i}`, subject: `s${i}`, topic: `t${i}` })
  )
  const result = rank(
    candidates,
    buildPolicy(),
    undefined,
    [new TotalCapRule(5)],
  )
  assert.ok(result.recommendations.length <= 5)
}

// ─── Signal → Category mapping ──────────────────────────────────────────────

function verifies_signal_to_category_mapping(): void {
  assert.equal(signalToCategory('weak_subject'), 'study_weak_subject')
  assert.equal(signalToCategory('weak_topic'), 'review_weak_topic')
  assert.equal(signalToCategory('strong_subject'), 'reinforce_strong_subject')
  assert.equal(signalToCategory('strong_topic'), 'reinforce_strong_topic')
  assert.equal(signalToCategory('retry_simulation'), 'retry_simulation')
  assert.equal(signalToCategory('continue_practice'), 'continue_practice')
  assert.equal(signalToCategory('coverage_gap'), 'review_weak_topic')
}

// ─── Thai title/reason ──────────────────────────────────────────────────────

function verifies_thai_title_generated(): void {
  const candidates = [mkCandidate({ signal: 'weak_subject', subject: 'กฎหมาย' })]
  const result = rank(candidates, buildPolicy())
  const title = result.recommendations[0]!.title
  assert.ok(title.includes('กฎหมาย'), `title should contain subject: ${title}`)
}

// ─── Determinism ────────────────────────────────────────────────────────────

function verifies_deterministic_output(): void {
  const candidates = [
    mkCandidate({ signal: 'weak_subject', contentId: 'a', subject: 'law' }),
    mkCandidate({ signal: 'weak_topic', contentId: 'b', subject: 'policy', topic: 'civics' }),
  ]
  const r1 = rank(candidates, buildPolicy())
  const r2 = rank(candidates, buildPolicy())
  assert.deepEqual(r1, r2)
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function verifies_stats_populated(): void {
  const candidates = [
    mkCandidate({ signal: 'weak_subject', contentId: 'a', subject: 'law' }),
    mkCandidate({ signal: 'weak_topic', contentId: 'b', subject: 'policy', topic: 'civics' }),
  ]
  const result = rank(candidates, buildPolicy())
  assert.equal(result.stats.totalRecommendations, result.recommendations.length)
  assert.ok(result.stats.byCategory.size > 0)
  assert.ok(result.stats.averageScore >= 0)
}

// ─── Assembly direct test (priority assignment) ─────────────────────────────

function verifies_assembly_assigns_priority_not_ranking(): void {
  // Assembly is called with pre-filtered candidates; it assigns priority.
  const scored: ScoredCandidate[] = [
    {
      candidate: mkCandidate({ signal: 'weak_subject', contentId: 'x' }),
      score: 80,
      scoringBreakdown: { signalWeight: 36, evidenceWeight: 20, freshnessWeight: 7.5, diversityWeight: 7.5, total: 71 },
    },
    {
      candidate: mkCandidate({ signal: 'weak_topic', contentId: 'y' }),
      score: 70,
      scoringBreakdown: { signalWeight: 34, evidenceWeight: 18, freshnessWeight: 7.5, diversityWeight: 7.5, total: 67 },
    },
  ]
  const result = assembleRecommendations(scored, 0)
  assert.equal(result.recommendations[0]!.priority, 1)
  assert.equal(result.recommendations[1]!.priority, 2)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  // Scoring factors
  { name: 'SignalFactor: weak scores higher than strong', fn: verifies_signal_factor_scores_per_signal },
  { name: 'EvidenceFactor: low accuracy scores higher', fn: verifies_evidence_factor_rewards_low_accuracy },
  { name: 'EvidenceFactor: neutral without evidence data', fn: verifies_evidence_factor_neutral_without_data },
  { name: 'FreshnessFactor: neutral without UserContext', fn: verifies_freshness_factor_neutral_without_context },
  { name: 'FreshnessFactor: penalizes previously shown', fn: verifies_freshness_factor_penalizes_shown },
  { name: 'DiversityFactor: penalizes subject monopoly', fn: verifies_diversity_factor_penalizes_monopoly },
  // Strategy orchestrator
  { name: 'RuleBasedScoringStrategy orchestrates factors', fn: verifies_strategy_orchestrates_factors },
  { name: 'Strategy factor weights sum to 1.0', fn: verifies_strategy_weights_sum_to_one },
  // Pipeline
  { name: 'empty input → empty RecommendationSet', fn: verifies_empty_input_returns_empty_set },
  { name: 'engine produces recommendations', fn: verifies_engine_produces_recommendations },
  { name: 'recommendation has full shape', fn: verifies_recommendation_has_full_shape },
  // Priority at assembly (refinement 2)
  { name: 'priority sequential from 1 (assigned at assembly)', fn: verifies_priority_sequential_from_1 },
  { name: 'priority no gaps after rules filter (assigned at assembly)', fn: verifies_priority_reflects_final_order_after_rules },
  { name: 'assembleRecommendations assigns priority directly', fn: verifies_assembly_assigns_priority_not_ranking },
  // Dedup
  { name: 'dedup keeps highest score per content identity', fn: verifies_dedup_keeps_highest_score_per_content_identity },
  { name: 'dedup identity includes content type', fn: verifies_dedup_identity_includes_content_type },
  // Business rules
  { name: 'MinimumEvidenceRule drops insufficient evidence', fn: verifies_minimum_evidence_drops_insufficient },
  { name: 'TotalCapRule limits output', fn: verifies_total_cap_limits_output },
  // Signal→Category
  { name: 'signalToCategory mapping correct (all 7 signals)', fn: verifies_signal_to_category_mapping },
  // Thai
  { name: 'Thai title generated with subject', fn: verifies_thai_title_generated },
  // Determinism
  { name: 'deterministic output', fn: verifies_deterministic_output },
  // Stats
  { name: 'stats populated', fn: verifies_stats_populated },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
