/**
 * lib/engine/scoring/runtime.ts
 * ----------------------------------------------------------------------------
 * Production Runtime entry point for Scoring.
 *
 * `runScoring()` owns orchestration only. Signal extraction, Component
 * evaluation, Composite construction, Confidence propagation, and Penalty
 * aggregation remain delegated to their existing production owners.
 */

import type { CandidateSet } from '../generator/contracts'
import {
  evaluateComponents,
  type ComponentEvaluationOutput,
} from './components'
import {
  computeCompositeScores,
  type CompositeScoreOutput,
} from './composite'
import {
  propagateConfidence,
  type ConfidencePropagationOutput,
} from './confidence'
import {
  aggregatePenalties,
  type PenaltyAggregationOutput,
} from './penalties'
import { extractSignals, type SignalExtractionOutput } from './signals'

/**
 * Immutable artifacts produced by one complete Scoring execution.
 *
 * Each field uses the existing output contract owned by its production
 * component. The Runtime does not copy or redefine CompositeScore,
 * ScoreComponent, Confidence, Penalty, or RawSignal models.
 */
export interface ScoringRuntimeOutput {
  /** Raw Signals extracted from the immutable CandidateSet. */
  readonly signals: SignalExtractionOutput

  /** Existing Score Component evaluation output. */
  readonly components: ComponentEvaluationOutput

  /** Existing Composite Score output consumed by Ranking. */
  readonly composites: CompositeScoreOutput

  /** Existing Composite Confidence propagation output. */
  readonly confidence: ConfidencePropagationOutput

  /** Existing Penalty aggregation output. */
  readonly penalties: PenaltyAggregationOutput
}

/**
 * Executes the complete production Scoring pipeline.
 *
 * Fixed flow:
 * Signal Extraction → Component Evaluation → Composite Score → Confidence
 * Propagation → Penalty Aggregation.
 *
 * Inputs are consumed read-only. Existing component failures propagate
 * unchanged; the Runtime introduces no alternative validation or diagnostics.
 */
export function runScoring(candidateSet: CandidateSet): ScoringRuntimeOutput {
  const signals = extractSignals(candidateSet)
  const components = evaluateComponents({ candidateSet, signals })
  const composites = computeCompositeScores({ components })
  const confidence = propagateConfidence({ composites })
  const penalties = aggregatePenalties({ confidence })

  return {
    signals,
    components,
    composites,
    confidence,
    penalties,
  }
}
