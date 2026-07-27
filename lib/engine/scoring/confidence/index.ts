/**
 * lib/engine/scoring/confidence/index.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.4 — Confidence Propagation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.2 (Confidence materializes
 *     propagated Component confidence), §2.3 (Confidence stage contract).
 *   - Scoring Model Specification v1.0 §6 (Confidence Model), §10.5
 *     (Confidence contract).
 *
 * WHAT THIS MODULE IS.
 *  - Confidence-only propagation over existing immutable CompositeScore data.
 *  - Derives expected Composite confidence from each Composite's immutable
 *    component breakdown and verifies the Composite carries that same trust.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT change Composite values, rebuild breakdowns, evaluate components,
 *    extract signals, apply/aggregate penalties, rank, solve, select, query the
 *    Bank, read content, or invoke an LLM.
 */

import type {
  ComponentId,
  CompositeScore,
  RawSignalSource,
  ScoringConfidence,
} from '../contracts'
import type { CompositeScoreOutput } from '../composite'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage-4 output contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage-4 input. Composites must already have been computed by E-3C.3.
 */
export interface ConfidencePropagationInput {
  readonly composites: CompositeScoreOutput
}

/**
 * Confidence propagation result for one CompositeScore.
 */
export interface PropagatedCompositeConfidence {
  readonly questionCode: string
  readonly composite: CompositeScore
  readonly confidence: ScoringConfidence
  readonly reducingComponents: readonly ComponentId[]
  readonly reducingSignals: readonly RawSignalSource[]
}

/**
 * Stage-4 output. Confidence-only; no penalty/ranking artifact.
 */
export interface ConfidencePropagationOutput {
  readonly entries: readonly PropagatedCompositeConfidence[]
  readonly summary: {
    readonly totalComposites: number
    readonly highConfidenceCount: number
    readonly lowConfidenceCount: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Confidence Propagation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Propagate confidence from Component confidence to Composite confidence.
 *
 * The CompositeScore contract already carries `confidence`; this stage treats
 * that Composite as immutable and verifies the carried confidence is exactly
 * the propagated result derived from the Component breakdown.
 *
 * @spec Candidate Ranking Architecture v1.0 §2.2 and §2.3; Scoring Model
 *       Specification v1.0 §6.3 and §10.5.
 */
export function propagateConfidence(
  input: ConfidencePropagationInput
): ConfidencePropagationOutput {
  const entries = input.composites.composites.map(propagateCompositeConfidence)
  return {
    entries,
    summary: {
      totalComposites: entries.length,
      highConfidenceCount: entries.filter((entry) => entry.confidence.level === 'high').length,
      lowConfidenceCount: entries.filter((entry) => entry.confidence.level === 'low').length,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Propagation
// ═══════════════════════════════════════════════════════════════════════════

function propagateCompositeConfidence(composite: CompositeScore): PropagatedCompositeConfidence {
  assertCompositeHasBreakdown(composite)

  const reducingComponents = unique(
    composite.breakdown.contributions
      .map((contribution) => contribution.component)
      .filter((component) => component.confidence.level === 'low')
      .map((component) => component.componentId)
  )
  const reducingSignals = unique(
    composite.breakdown.contributions.flatMap(
      (contribution) => contribution.component.confidence.reducingSignals
    )
  )
  const confidence = materializeConfidence(reducingSignals)
  assertCompositeConfidenceMatches(composite, confidence)

  return {
    questionCode: composite.questionCode,
    composite,
    confidence,
    reducingComponents,
    reducingSignals,
  }
}

function materializeConfidence(
  reducingSignals: readonly RawSignalSource[]
): ScoringConfidence {
  if (reducingSignals.length === 0) {
    return {
      level: 'high',
      reducingSignals: [],
      propagationNote: null,
    }
  }
  return {
    level: 'low',
    reducingSignals,
    propagationNote: `Composite confidence reduced by Component evidence: ${reducingSignals.join(', ')}.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Contract guards
// ═══════════════════════════════════════════════════════════════════════════

function assertCompositeHasBreakdown(composite: CompositeScore): void {
  if (composite.breakdown.contributions.length === 0) {
    throw new Error(
      `Fatal Confidence Propagation error: Composite ${composite.questionCode} has empty breakdown`
    )
  }
  for (const contribution of composite.breakdown.contributions) {
    if (contribution.component.questionCode !== composite.questionCode) {
      throw new Error(
        `Fatal Confidence Propagation error: Component ${contribution.component.componentId} questionCode does not match Composite ${composite.questionCode}`
      )
    }
  }
}

function assertCompositeConfidenceMatches(
  composite: CompositeScore,
  expected: ScoringConfidence
): void {
  if (
    composite.confidence.level !== expected.level ||
    !sameStrings(composite.confidence.reducingSignals, expected.reducingSignals)
  ) {
    throw new Error(
      `Fatal Confidence Propagation error: Composite ${composite.questionCode} confidence does not match propagated Component confidence`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Small deterministic helpers
// ═══════════════════════════════════════════════════════════════════════════

function unique<T extends string>(values: readonly T[]): readonly T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}
