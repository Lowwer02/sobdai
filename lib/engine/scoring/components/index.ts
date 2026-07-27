/**
 * lib/engine/scoring/components/index.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.2 — Component Evaluators.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.1 (Stage Map), §2.3 (Scoring
 *     stage contract), §4 (Scoring Integration).
 *   - Scoring Model Specification v1.0 §3 (Score Components → Normalized),
 *     §4 (fixed Component vocabulary), §6.3.2 (component confidence from
 *     input signals), §8.3 (component transparency), §10.2 (Score Component).
 *
 * WHAT THIS MODULE IS.
 *  - Stage 2 only: Raw Signals → ScoreComponent records.
 *  - Computes exactly the ten frozen ComponentIds from COMPONENT_VOCABULARY.
 *  - Produces component-level normalized values, reasoning, input evidence,
 *    component confidence, and an empty penalties array required by the frozen
 *    ScoreComponent contract.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT compute CompositeScore, ScoreBreakdown, component contributions,
 *    composite confidence propagation, penalty application/aggregation,
 *    ordering, ranking, tie resolution, selection, or allocation.
 *  - Does NOT query the Bank, read question bodies, invoke an LLM, or read
 *    time/random state.
 */

import type { BlueprintSlot, Candidate, CandidateSet } from '../../generator/contracts'
import {
  COMPONENT_VOCABULARY,
  type ComponentId,
  type NormalizedScore,
  type RawSignal,
  type RawSignalSource,
  type ScoreComponent,
  type ScoringConfidence,
} from '../contracts'
import type { ExtractedCandidateSignals, SignalExtractionOutput } from '../signals'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage-2 output contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage-2 input. Signals are supplied by E-3C.1; the CandidateSet is consumed
 * read-only for candidate identity and eligible slot context.
 */
export interface ComponentEvaluationInput {
  readonly candidateSet: CandidateSet
  readonly signals: SignalExtractionOutput
}

/**
 * The ten ScoreComponents for one Candidate against one eligible BlueprintSlot.
 */
export interface EvaluatedSlotComponents {
  readonly questionCode: string
  readonly slot: BlueprintSlot
  readonly components: readonly ScoreComponent[]
}

/**
 * Run-level Stage-2 output. This remains component-only; no Composite or Rank
 * artifact is emitted here.
 */
export interface ComponentEvaluationOutput {
  readonly entries: readonly EvaluatedSlotComponents[]
  readonly summary: {
    readonly totalCandidateSlots: number
    readonly totalComponents: number
    readonly componentIds: readonly ComponentId[]
  }
}

type SignalMap = ReadonlyMap<RawSignalSource, RawSignal>

interface EvaluationContext {
  readonly candidateSet: CandidateSet
  readonly candidate: Candidate
  readonly extracted: ExtractedCandidateSignals
  readonly slot: BlueprintSlot
  readonly signals: SignalMap
}

type ComponentEvaluator = (ctx: EvaluationContext) => ScoreComponent

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Component Evaluation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate all frozen Score Components for every Candidate × eligible slot.
 *
 * Determinism notes:
 *  - Candidates are canonicalized by Question Code.
 *  - Eligible slots are canonicalized by their axis tuple.
 *  - Components follow COMPONENT_VOCABULARY exactly.
 *
 * @spec Candidate Ranking Architecture v1.0 §4.2; Scoring Model
 *       Specification v1.0 §4.1 and §10.2.
 */
export function evaluateComponents(input: ComponentEvaluationInput): ComponentEvaluationOutput {
  assertCompatibleSignalExtraction(input)

  const signalsByCode = new Map(
    input.signals.candidates.map((candidateSignals) => [
      candidateSignals.questionCode,
      candidateSignals,
    ])
  )

  const entries: EvaluatedSlotComponents[] = []
  const candidates = [...input.candidateSet.candidates].sort(compareCandidatesByQuestionCode)
  for (const candidate of candidates) {
    const extracted = signalsByCode.get(candidate.identity.questionCode)
    if (extracted === undefined) {
      throw new Error(
        `Fatal Component Evaluation error: missing Signal Extraction output for ${candidate.identity.questionCode}`
      )
    }

    const slots = [...candidate.provenance.eligibleSlots].sort(compareSlots)
    if (slots.length === 0) {
      throw new Error(
        `Fatal Component Evaluation error: Candidate ${candidate.identity.questionCode} has no eligible slots`
      )
    }

    for (const slot of slots) {
      const ctx: EvaluationContext = {
        candidateSet: input.candidateSet,
        candidate,
        extracted,
        slot,
        signals: buildSignalMap(extracted),
      }
      entries.push({
        questionCode: candidate.identity.questionCode,
        slot,
        components: COMPONENT_VOCABULARY.map((id) => evaluatorById[id](ctx)),
      })
    }
  }

  return {
    entries,
    summary: {
      totalCandidateSlots: entries.length,
      totalComponents: entries.reduce((sum, entry) => sum + entry.components.length, 0),
      componentIds: COMPONENT_VOCABULARY,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Evaluator registry — exactly the v1.0 Component vocabulary
// ═══════════════════════════════════════════════════════════════════════════

const evaluatorById: Record<ComponentId, ComponentEvaluator> = {
  coverage_fit: evaluateCoverageFit,
  difficulty_fit: evaluateDifficultyFit,
  distribution_fit: evaluateDistributionFit,
  pattern_fit: evaluatePatternFit,
  lo_fit: evaluateLoFit,
  freshness: evaluateFreshness,
  usage: evaluateUsage,
  diversity: evaluateDiversity,
  constraint_readiness: evaluateConstraintReadiness,
  blueprint_alignment: evaluateBlueprintAlignment,
}

function evaluateCoverageFit(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['document', 'topic'])
  const documentSignal = signal(ctx.signals, 'document')
  const topicSignal = signal(ctx.signals, 'topic')
  const slotDocument = ctx.slot.document

  let value = 0
  let reason = 'Coverage Fit = document/topic evidence is missing; no coverage fit value invented.'
  if (
    isKnownString(documentSignal) &&
    isKnownString(topicSignal) &&
    (slotDocument === undefined || documentSignal.value === slotDocument)
  ) {
    value = 0.5
    reason = 'Coverage Fit = document/topic evidence present through Signal Extraction; binding satisfaction is not re-read outside Raw Signals.'
  }

  return component(ctx, 'coverage_fit', inputs, normalized(value, 'coverage-binding-fit'), reason)
}

function evaluateDifficultyFit(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['difficulty'])
  const difficulty = signal(ctx.signals, 'difficulty')
  const value = exactSlotMatch(difficulty, ctx.slot.difficulty)
  const reason =
    ctx.slot.difficulty === undefined
      ? 'Difficulty Fit = slot has no difficulty requirement.'
      : value === 1
        ? `Difficulty Fit = Candidate is ${String(difficulty.value)}, slot requires ${ctx.slot.difficulty}.`
        : `Difficulty Fit = Candidate is ${String(difficulty.value)}, slot requires ${ctx.slot.difficulty}.`
  return component(ctx, 'difficulty_fit', inputs, normalized(value, 'slot-axis-exact-match'), reason)
}

function evaluateDistributionFit(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, [
    'document',
    'difficulty',
    'blueprint_type',
    'pattern',
    'learning_objective',
  ])
  const value = slotAxisMatchRatio(ctx, [
    ['document', ctx.slot.document],
    ['difficulty', ctx.slot.difficulty],
    ['blueprint_type', ctx.slot.blueprintType],
    ['pattern', ctx.slot.pattern],
    ['learning_objective', ctx.slot.learningObjective],
  ])
  return component(
    ctx,
    'distribution_fit',
    inputs,
    normalized(value, 'eligible-slot-axis-match-ratio'),
    `Distribution Fit = ${formatPercent(value)} of present slot distribution axes are evidenced as matching.`
  )
}

function evaluatePatternFit(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['pattern'])
  const pattern = signal(ctx.signals, 'pattern')
  const value = exactSlotMatch(pattern, ctx.slot.pattern)
  const reason =
    ctx.slot.pattern === undefined
      ? 'Pattern Fit = slot has no pattern requirement.'
      : value === 1
        ? `Pattern Fit = Candidate pattern ${String(pattern.value)} matches slot pattern ${ctx.slot.pattern}.`
        : `Pattern Fit = Candidate pattern ${String(pattern.value)} does not match slot pattern ${ctx.slot.pattern}.`
  return component(ctx, 'pattern_fit', inputs, normalized(value, 'slot-axis-exact-match'), reason)
}

function evaluateLoFit(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['learning_objective'])
  const lo = signal(ctx.signals, 'learning_objective')
  const value = exactSlotMatch(lo, ctx.slot.learningObjective)
  const reason =
    ctx.slot.learningObjective === undefined
      ? 'LO Fit = slot has no learning objective requirement.'
      : value === 1
        ? `LO Fit = Candidate LO ${String(lo.value)} matches slot LO ${ctx.slot.learningObjective}.`
        : `LO Fit = Candidate LO ${String(lo.value)} does not match slot LO ${ctx.slot.learningObjective}.`
  return component(ctx, 'lo_fit', inputs, normalized(value, 'slot-axis-exact-match'), reason)
}

function evaluateFreshness(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['last_used_at'])
  const lastUsed = signal(ctx.signals, 'last_used_at')
  const value = lastUsed.integrity === 'known' && lastUsed.value !== null ? 1 : 0
  const reason =
    value === 1
      ? 'Freshness = lifecycle timestamp evidence is present.'
      : 'Freshness = lifecycle timestamp evidence is missing; no recency value invented.'
  return component(ctx, 'freshness', inputs, normalized(value, 'freshness-evidence-present'), reason)
}

function evaluateUsage(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['usage_count'])
  const usageCount = signal(ctx.signals, 'usage_count')
  const numericUsage = typeof usageCount.value === 'number' && Number.isFinite(usageCount.value)
  const value = numericUsage ? 1 / (1 + Math.max(0, usageCount.value)) : 0
  const reason = numericUsage
    ? `Usage = usage_count ${String(usageCount.value)} mapped to lower load preference.`
    : 'Usage = usage_count evidence is missing; no usage load value invented.'
  return component(ctx, 'usage', inputs, normalized(value, 'inverse-usage-load'), reason)
}

function evaluateDiversity(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['topic', 'difficulty', 'blueprint_type'])
  const known = inputs.filter((input) => input.integrity === 'known' && input.value !== null).length
  const value = inputs.length === 0 ? 0 : known / inputs.length
  return component(
    ctx,
    'diversity',
    inputs,
    normalized(value, 'diversity-axis-evidence-completeness'),
    `Diversity = ${known}/${inputs.length} Topic-Difficulty-Type axes are known for distinctness checks.`
  )
}

function evaluateConstraintReadiness(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, ['tier'])
  const tier = signal(ctx.signals, 'tier')
  const value = tier.integrity === 'known' && tier.value !== null ? 1 : 0
  const reason =
    value === 1
      ? `Constraint Readiness = tier ${String(tier.value)} evidence is present for downstream headroom checks.`
      : 'Constraint Readiness = tier evidence is missing; no constraint headroom value invented.'
  return component(ctx, 'constraint_readiness', inputs, normalized(value, 'tier-evidence-present'), reason)
}

function evaluateBlueprintAlignment(ctx: EvaluationContext): ScoreComponent {
  const inputs = pickSignals(ctx.signals, [
    'document',
    'difficulty',
    'blueprint_type',
    'pattern',
    'learning_objective',
    'generator_confidence',
  ])
  const value = slotAxisMatchRatio(ctx, [
    ['document', ctx.slot.document],
    ['difficulty', ctx.slot.difficulty],
    ['blueprint_type', ctx.slot.blueprintType],
    ['pattern', ctx.slot.pattern],
    ['learning_objective', ctx.slot.learningObjective],
  ])
  return component(
    ctx,
    'blueprint_alignment',
    inputs,
    normalized(value, 'slot-intent-axis-match-ratio'),
    `Blueprint Alignment = ${formatPercent(value)} of present slot intent axes are evidenced as matching.`
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Component construction helpers
// ═══════════════════════════════════════════════════════════════════════════

function component(
  ctx: EvaluationContext,
  componentId: ComponentId,
  inputs: readonly RawSignal[],
  score: NormalizedScore,
  reasoning: string
): ScoreComponent {
  assertNormalized(score)
  return {
    componentId,
    questionCode: ctx.candidate.identity.questionCode,
    slot: ctx.slot,
    normalized: score,
    inputs,
    reasoning,
    confidence: componentConfidence(inputs),
    penalties: [],
  }
}

function componentConfidence(inputs: readonly RawSignal[]): ScoringConfidence {
  const reducingSignals = uniqueSources(
    inputs
      .filter((input) => input.integrity !== 'known')
      .map((input) => input.source)
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
    propagationNote: `Component confidence reduced by non-known signal integrity: ${reducingSignals.join(', ')}.`,
  }
}

function normalized(value: number, scale: string): NormalizedScore {
  return { value, scale }
}

function assertNormalized(score: NormalizedScore): void {
  if (!Number.isFinite(score.value) || score.value < 0 || score.value > 1) {
    throw new Error(
      `Fatal Component Evaluation error: normalized score out of range [0, 1]: ${String(score.value)}`
    )
  }
  if (score.scale.length === 0) {
    throw new Error('Fatal Component Evaluation error: normalized score scale is empty')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Signal and slot helpers
// ═══════════════════════════════════════════════════════════════════════════

function buildSignalMap(extracted: ExtractedCandidateSignals): SignalMap {
  const map = new Map<RawSignalSource, RawSignal>()
  for (const rawSignal of extracted.signals) {
    if (map.has(rawSignal.source)) {
      throw new Error(
        `Fatal Component Evaluation error: duplicate ${rawSignal.source} signal for ${extracted.questionCode}`
      )
    }
    map.set(rawSignal.source, rawSignal)
  }
  return map
}

function signal(signals: SignalMap, source: RawSignalSource): RawSignal {
  const rawSignal = signals.get(source)
  if (rawSignal === undefined) {
    throw new Error(`Fatal Component Evaluation error: missing required ${source} signal`)
  }
  return rawSignal
}

function pickSignals(signals: SignalMap, sources: readonly RawSignalSource[]): readonly RawSignal[] {
  return sources.map((source) => signal(signals, source))
}

function exactSlotMatch(rawSignal: RawSignal, slotValue: unknown): number {
  if (slotValue === undefined) return 1
  if (rawSignal.integrity !== 'known') return 0
  return rawSignal.value === slotValue ? 1 : 0
}

function slotAxisMatchRatio(
  ctx: EvaluationContext,
  axes: readonly (readonly [RawSignalSource, unknown])[]
): number {
  const presentAxes = axes.filter(([, slotValue]) => slotValue !== undefined)
  if (presentAxes.length === 0) return 1

  let matched = 0
  for (const [source, slotValue] of presentAxes) {
    const rawSignal = signal(ctx.signals, source)
    if (rawSignal.integrity === 'known' && rawSignal.value === slotValue) {
      matched++
    }
  }
  return matched / presentAxes.length
}

function isKnownString(rawSignal: RawSignal): rawSignal is RawSignal & { readonly value: string } {
  return rawSignal.integrity === 'known' && typeof rawSignal.value === 'string' && rawSignal.value.length > 0
}

function uniqueSources(sources: readonly RawSignalSource[]): readonly RawSignalSource[] {
  const seen = new Set<RawSignalSource>()
  const out: RawSignalSource[] = []
  for (const source of sources) {
    if (seen.has(source)) continue
    seen.add(source)
    out.push(source)
  }
  return out
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function compareCandidatesByQuestionCode(a: Candidate, b: Candidate): number {
  const left = a.identity.questionCode
  const right = b.identity.questionCode
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSlots(a: BlueprintSlot, b: BlueprintSlot): number {
  const left = slotKey(a)
  const right = slotKey(b)
  return left < right ? -1 : left > right ? 1 : 0
}

function slotKey(slot: BlueprintSlot): string {
  const parts = [
    `setNumber=${String(slot.setNumber)}`,
    slot.document === undefined ? null : `document=${slot.document}`,
    slot.difficulty === undefined ? null : `difficulty=${slot.difficulty}`,
    slot.blueprintType === undefined ? null : `blueprintType=${slot.blueprintType}`,
    slot.pattern === undefined ? null : `pattern=${slot.pattern}`,
    slot.learningObjective === undefined ? null : `learningObjective=${slot.learningObjective}`,
  ].filter((part): part is string => part !== null)
  return parts.join('\u{0000}')
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Compatibility guard
// ═══════════════════════════════════════════════════════════════════════════

function assertCompatibleSignalExtraction(input: ComponentEvaluationInput): void {
  const candidateCodes = new Set(input.candidateSet.candidates.map((candidate) => candidate.identity.questionCode))
  const signalCodes = new Set(input.signals.candidates.map((candidateSignals) => candidateSignals.questionCode))

  for (const code of candidateCodes) {
    if (!signalCodes.has(code)) {
      throw new Error(`Fatal Component Evaluation error: Signal Extraction output missing ${code}`)
    }
  }
  for (const code of signalCodes) {
    if (!candidateCodes.has(code)) {
      throw new Error(`Fatal Component Evaluation error: Signal Extraction output contains unknown ${code}`)
    }
  }
}
