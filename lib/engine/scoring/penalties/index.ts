/**
 * lib/engine/scoring/penalties/index.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.5 — Penalty Aggregation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.3 (Penalty Application stage).
 *   - Scoring Model Specification v1.0 §7 (Penalty Model), §7.3 (structural
 *     combination), §7.5 (Penalty Transparency), §10.6 (Penalty contract).
 *
 * WHAT THIS MODULE IS.
 *  - Penalty-only aggregation over existing immutable ScoreComponents,
 *    CompositeScore, and propagated Confidence outputs.
 *  - Reads already-present Penalty objects and summarizes their structural
 *    effect. It never creates new penalty triggers or re-scores.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT rank, solve, select, extract signals, evaluate components,
 *    compute composites, propagate confidence, query the Bank, read content,
 *    invoke an LLM, or apply new penalties.
 */

import type {
  CompositeScore,
  Penalty,
  PenaltyType,
} from '../contracts'
import type {
  ConfidencePropagationOutput,
  PropagatedCompositeConfidence,
} from '../confidence'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage-5 output contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage-5 input. Confidence must already have been propagated by E-3C.4.
 */
export interface PenaltyAggregationInput {
  readonly confidence: ConfidencePropagationOutput
}

/**
 * Aggregated penalty view for one CompositeScore.
 */
export interface AggregatedCompositePenalties {
  readonly questionCode: string
  readonly composite: CompositeScore
  readonly confidence: PropagatedCompositeConfidence
  readonly penalties: readonly Penalty[]
  readonly byType: Readonly<Record<PenaltyType, readonly Penalty[]>>
  readonly dominantPenaltyType: PenaltyType | null
  readonly terminal: boolean
}

/**
 * Stage-5 output. Penalty-only; no ranking or solver artifact.
 */
export interface PenaltyAggregationOutput {
  readonly entries: readonly AggregatedCompositePenalties[]
  readonly summary: {
    readonly totalComposites: number
    readonly totalPenalties: number
    readonly softCount: number
    readonly hardCount: number
    readonly disqualificationCount: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Penalty Aggregation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate existing penalties from immutable CompositeScore artifacts.
 *
 * Structural combination only:
 *  - disqualification dominates hard and soft,
 *  - hard dominates soft,
 *  - soft penalties accumulate without becoming hard.
 *
 * @spec Candidate Ranking Architecture v1.0 §2.3; Scoring Model
 *       Specification v1.0 §7.3 and §10.6.
 */
export function aggregatePenalties(
  input: PenaltyAggregationInput
): PenaltyAggregationOutput {
  const entries = input.confidence.entries.map(aggregateCompositePenalties)
  return {
    entries,
    summary: summarize(entries),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Aggregation
// ═══════════════════════════════════════════════════════════════════════════

function aggregateCompositePenalties(
  confidence: PropagatedCompositeConfidence
): AggregatedCompositePenalties {
  const composite = confidence.composite
  const componentPenalties = composite.breakdown.contributions.flatMap(
    (contribution) => contribution.component.penalties
  )
  const penalties = [...componentPenalties, ...composite.penalties]
  for (const penalty of penalties) {
    assertTransparentPenalty(composite, penalty)
  }

  const byType = groupByType(penalties)
  const dominantPenaltyType = dominantType(byType)

  return {
    questionCode: composite.questionCode,
    composite,
    confidence,
    penalties,
    byType,
    dominantPenaltyType,
    terminal: dominantPenaltyType === 'disqualification',
  }
}

function groupByType(
  penalties: readonly Penalty[]
): Record<PenaltyType, readonly Penalty[]> {
  return {
    soft: penalties.filter((penalty) => penalty.type === 'soft'),
    hard: penalties.filter((penalty) => penalty.type === 'hard'),
    disqualification: penalties.filter((penalty) => penalty.type === 'disqualification'),
  }
}

function dominantType(
  byType: Readonly<Record<PenaltyType, readonly Penalty[]>>
): PenaltyType | null {
  if (byType.disqualification.length > 0) return 'disqualification'
  if (byType.hard.length > 0) return 'hard'
  if (byType.soft.length > 0) return 'soft'
  return null
}

function summarize(
  entries: readonly AggregatedCompositePenalties[]
): PenaltyAggregationOutput['summary'] {
  const softCount = sum(entries.map((entry) => entry.byType.soft.length))
  const hardCount = sum(entries.map((entry) => entry.byType.hard.length))
  const disqualificationCount = sum(
    entries.map((entry) => entry.byType.disqualification.length)
  )
  return {
    totalComposites: entries.length,
    totalPenalties: softCount + hardCount + disqualificationCount,
    softCount,
    hardCount,
    disqualificationCount,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Contract guards
// ═══════════════════════════════════════════════════════════════════════════

function assertTransparentPenalty(composite: CompositeScore, penalty: Penalty): void {
  if (
    isBlank(penalty.trigger) ||
    isBlank(penalty.evidence) ||
    isBlank(penalty.effect)
  ) {
    throw new Error(
      `Fatal Penalty Aggregation error: Composite ${composite.questionCode} has non-transparent ${penalty.type} penalty`
    )
  }
  if (penalty.appliedBy !== 'ranking' && penalty.appliedBy !== 'solver') {
    throw new Error(
      `Fatal Penalty Aggregation error: Composite ${composite.questionCode} has invalid penalty owner`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Small deterministic helpers
// ═══════════════════════════════════════════════════════════════════════════

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function isBlank(value: string): boolean {
  return value.trim().length === 0
}
