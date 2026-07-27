/**
 * lib/engine/scoring/composite/index.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.3 — Composite Score.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.1 (Stage Map), §2.3 (Scoring
 *     stage contract), §4.2 (Ranking consumes the Scoring Model).
 *   - Scoring Model Specification v1.0 §3 (Composite Score lifecycle), §5
 *     (Composite Score), §8 (Score Transparency), §10.3 (Composite Score),
 *     §10.4 (Score Breakdown).
 *
 * WHAT THIS MODULE IS.
 *  - Composite-only aggregation over existing immutable ScoreComponents.
 *  - Produces CompositeScore records with value + ScoreBreakdown.
 *  - Preserves component objects by reference inside the Breakdown.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT evaluate components, create new components, extract signals,
 *    apply penalties, rank, order, tie-break, solve, select, query the Bank,
 *    read content, or invoke an LLM.
 */

import type {
  ComponentContribution,
  ComponentId,
  CompositeScore,
  ScoreComponent,
  ScoringConfidence,
} from '../contracts'
import { COMPONENT_VOCABULARY } from '../contracts'
import type {
  ComponentEvaluationOutput,
  EvaluatedSlotComponents,
} from '../components'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage-3 output contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage-3 input. Components must already have been evaluated by E-3C.2.
 */
export interface CompositeScoreInput {
  readonly components: ComponentEvaluationOutput
}

/**
 * Stage-3 output. Composite-only; no ranking or allocation artifact.
 */
export interface CompositeScoreOutput {
  readonly composites: readonly CompositeScore[]
  readonly summary: {
    readonly totalComposites: number
    readonly componentIds: readonly ComponentId[]
    readonly aggregationScale: 'equal-component-mean'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Composite Score
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate immutable ScoreComponents into CompositeScore records.
 *
 * The Scoring Model freezes the Composite's information content, but not the
 * formula. This implementation uses an equal-component mean so every frozen
 * Component contributes transparently and deterministically.
 *
 * @spec Candidate Ranking Architecture v1.0 §4.2; Scoring Model
 *       Specification v1.0 §5 and §10.3.
 */
export function computeCompositeScores(input: CompositeScoreInput): CompositeScoreOutput {
  const composites = input.components.entries.map(computeCompositeScore)
  return {
    composites,
    summary: {
      totalComposites: composites.length,
      componentIds: COMPONENT_VOCABULARY,
      aggregationScale: 'equal-component-mean',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Composite construction
// ═══════════════════════════════════════════════════════════════════════════

function computeCompositeScore(entry: EvaluatedSlotComponents): CompositeScore {
  assertCompleteComponentSet(entry)
  assertNoPreAppliedPenalties(entry.components)

  const contributions = buildContributions(entry.components)
  const value = roundCompositeValue(sum(contributions.map((contribution) => contribution.contribution)))

  return {
    questionCode: entry.questionCode,
    slot: entry.slot,
    value,
    breakdown: {
      contributions,
      aggregationNote: `Composite Score = equal-component mean of ${entry.components.length} frozen Components.`,
    },
    confidence: materializeCompositeConfidence(entry.components),
    penalties: [],
  }
}

function buildContributions(components: readonly ScoreComponent[]): readonly ComponentContribution[] {
  const weight = 1 / components.length
  return components.map((component) => ({
    component,
    contribution: component.normalized.value * weight,
    reason: `equal weight ${formatFixed(weight)} × normalized ${formatFixed(component.normalized.value)}`,
  }))
}

function materializeCompositeConfidence(components: readonly ScoreComponent[]): ScoringConfidence {
  const reducingSignals = uniqueStrings(
    components.flatMap((component) => component.confidence.reducingSignals)
  )
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
    propagationNote: `Composite carries reduced trust from Component evidence: ${reducingSignals.join(', ')}.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Contract guards
// ═══════════════════════════════════════════════════════════════════════════

function assertCompleteComponentSet(entry: EvaluatedSlotComponents): void {
  if (entry.components.length !== COMPONENT_VOCABULARY.length) {
    throw new Error(
      `Fatal Composite Score error: ${entry.questionCode} has ${entry.components.length} Components; expected ${COMPONENT_VOCABULARY.length}`
    )
  }

  const ids = entry.components.map((component) => component.componentId)

  const seen = new Set<ComponentId>()
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(
        `Fatal Composite Score error: ${entry.questionCode} has duplicate Component ${id}`
      )
    }
    seen.add(id)
  }

  for (const required of COMPONENT_VOCABULARY) {
    if (!ids.includes(required)) {
      throw new Error(
        `Fatal Composite Score error: ${entry.questionCode} missing Component ${required}`
      )
    }
  }

  for (const component of entry.components) {
    if (component.questionCode !== entry.questionCode) {
      throw new Error(
        `Fatal Composite Score error: Component ${component.componentId} questionCode does not match entry ${entry.questionCode}`
      )
    }
    if (component.slot !== entry.slot) {
      throw new Error(
        `Fatal Composite Score error: Component ${component.componentId} slot does not match entry slot`
      )
    }
    if (
      !Number.isFinite(component.normalized.value) ||
      component.normalized.value < 0 ||
      component.normalized.value > 1
    ) {
      throw new Error(
        `Fatal Composite Score error: Component ${component.componentId} normalized value out of range`
      )
    }
  }
}

function assertNoPreAppliedPenalties(components: readonly ScoreComponent[]): void {
  const penalized = components.find((component) => component.penalties.length > 0)
  if (penalized !== undefined) {
    throw new Error(
      `Fatal Composite Score error: Component ${penalized.componentId} already has penalties; penalty application is not part of E-3C.3`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Small deterministic helpers
// ═══════════════════════════════════════════════════════════════════════════

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function roundCompositeValue(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
}

function uniqueStrings<T extends string>(values: readonly T[]): readonly T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function formatFixed(value: number): string {
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}
