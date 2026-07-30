/**
 * lib/engine/ranking/runtime.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.1 — Score Ordering Preparation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §5 (Ordering), §8 (Score
 *     Consumption), §9 (Ranking Transparency), §10 (Failure Handling).
 *
 * WHAT THIS MODULE IS.
 *  - Consumes immutable CompositeScore records produced by Scoring Runtime.
 *  - Groups them by Blueprint slot.
 *  - Builds fixed, inspectable ordering keys from Composite value, Confidence,
 *    and applied Penalties.
 *  - Produces deterministic per-slot ordering groups for the later
 *    Tie Resolution and RankedCandidateSet emission stages.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT compute scores, apply penalties, resolve ties, assign final
 *    ranks, emit RankedCandidateSet, solve allocations, query the Bank, read
 *    content, invoke React/UI/API code, use time, randomness, or hidden state.
 */

import type {
  BlueprintSlot,
  CandidateSet,
} from '../generator/contracts'
import type {
  CompositeScore,
  Penalty,
  RawSignal,
  ScoringConfidenceLevel,
} from '../scoring/contracts'
import type {
  CandidateRankingResult,
  OrderingKeyDescriptor,
} from './contracts'
import { emitRankedCandidateSet } from './emission'
import { resolveTies } from './tie-resolution'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage input/output contracts
// ═══════════════════════════════════════════════════════════════════════════

/** Stage E-3E.1 input: immutable, already-computed Composite Scores. */
export interface ScoreOrderingInput {
  readonly composites: readonly CompositeScore[]
}

/**
 * The fixed ordering key for one Candidate × slot evaluation. This is an
 * ordering-prep artifact, not a final rank and not a tie-breaker.
 */
export interface ScoreOrderingKey {
  readonly compositeValue: number
  readonly confidenceLevel: ScoringConfidenceLevel
  readonly penaltyStatus: PenaltyOrderingStatus
  readonly penaltyCount: number
}

/** Penalty status used by ordering prep. Drawn from existing Scoring penalties. */
export type PenaltyOrderingStatus =
  | 'none'
  | 'soft'
  | 'hard'
  | 'disqualification'

/** One Composite prepared for ordering. No rank is assigned in E-3E.1. */
export interface ScoreOrderingCandidate {
  readonly questionCode: string
  readonly composite: CompositeScore
  readonly confidence: CompositeScore['confidence']
  readonly penalties: readonly Penalty[]
  readonly signals: readonly RawSignal[]
  readonly orderingKey: ScoreOrderingKey
}

/**
 * Candidates with identical score-ordering keys. A group with >1 Candidate is
 * an unresolved tie for the later Tie Resolution stage.
 */
export interface ScoreOrderingGroup {
  readonly groupId: string
  readonly orderingKey: ScoreOrderingKey
  readonly candidates: readonly ScoreOrderingCandidate[]
  readonly unresolvedTie: boolean
}

/** One Blueprint slot after score-ordering preparation. */
export interface PreparedOrderingSlot {
  readonly slotId: string
  readonly slot: BlueprintSlot
  readonly orderingKey: OrderingKeyDescriptor
  readonly groups: readonly ScoreOrderingGroup[]
}

/** Stage E-3E.1 output. Does not emit RankedCandidateSet. */
export interface ScoreOrderingOutput {
  readonly slots: readonly PreparedOrderingSlot[]
  readonly summary: {
    readonly totalSlots: number
    readonly totalCandidates: number
    readonly totalGroups: number
    readonly unresolvedTieGroups: number
  }
}

const SCORE_ORDERING_KEY: OrderingKeyDescriptor = {
  facets: [
    'composite.value',
    'confidence.level',
    'penalties.status',
    'penalties.count',
  ],
  description:
    'Score ordering preparation key: Composite value descending, high Confidence before low, less severe Penalty status before more severe status, then fewer Penalties.',
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Production Runtime entry point
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_MAX_TIE_GROUP_SIZE = 100
const RANKING_VERSION = '1.0.0'

/**
 * Immutable input to one complete production Ranking execution.
 *
 * CandidateSet and CompositeScore remain owned by Generator and Scoring
 * respectively. Runtime controls are deterministic and do not redefine
 * Ranking contracts.
 */
export interface RankingRuntimeInput {
  /** Generator-owned CandidateSet carried into RankedCandidateSet emission. */
  readonly candidateSet: CandidateSet

  /** Scoring-owned Composite Scores to order and rank. */
  readonly compositeScores: readonly CompositeScore[]

  /**
   * Maximum permitted size of one tie group.
   *
   * Defaults to the established production bound of 100.
   */
  readonly maxTieGroupSize?: number

  /**
   * Ranking implementation version attached to the emitted artifact.
   *
   * Defaults to the established Ranking version `1.0.0`.
   */
  readonly rankingVersion?: string
}

/**
 * Executes the complete production Ranking pipeline.
 *
 * Fixed flow:
 * Score Ordering Preparation → Tie Resolution → RankedCandidateSet Emission.
 *
 * Existing Ranking exceptions propagate unchanged. The Runtime performs no
 * scoring, ordering, tie-breaking, rank assignment, or diagnostic remapping.
 */
export function runRanking(
  input: RankingRuntimeInput
): CandidateRankingResult {
  const ordering = prepareScoreOrdering({
    composites: input.compositeScores,
  })
  const tieResolution = resolveTies({
    ordering,
    maxTieGroupSize:
      input.maxTieGroupSize ?? DEFAULT_MAX_TIE_GROUP_SIZE,
  })
  const rankedCandidateSet = emitRankedCandidateSet({
    candidateSet: input.candidateSet,
    tieResolution,
    rankingVersion: input.rankingVersion ?? RANKING_VERSION,
  })

  return {
    ok: true,
    rankedCandidateSet,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — Score Ordering Preparation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prepare immutable CompositeScore records for deterministic per-slot ordering.
 *
 * Equal keys remain grouped as unresolved ties. This stage intentionally does
 * not choose a winner within such groups; Tie Resolution owns that later.
 *
 * @spec Candidate Ranking Architecture v1.0 §5 and §8.
 */
export function prepareScoreOrdering(input: ScoreOrderingInput): ScoreOrderingOutput {
  const candidates = input.composites.map(prepareCandidate)
  assertNoDuplicateCandidateSlot(candidates)

  const slots = groupCandidatesBySlot(candidates)
    .map(prepareSlot)
    .sort((a, b) => compareStrings(a.slotId, b.slotId))

  return {
    slots,
    summary: {
      totalSlots: slots.length,
      totalCandidates: candidates.length,
      totalGroups: slots.reduce((total, slot) => total + slot.groups.length, 0),
      unresolvedTieGroups: slots.reduce(
        (total, slot) => total + slot.groups.filter((group) => group.unresolvedTie).length,
        0
      ),
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Candidate preparation
// ═══════════════════════════════════════════════════════════════════════════

function prepareCandidate(composite: CompositeScore): ScoreOrderingCandidate {
  assertValidComposite(composite)

  return {
    questionCode: composite.questionCode,
    composite,
    confidence: composite.confidence,
    penalties: composite.penalties,
    signals: extractSignals(composite),
    orderingKey: buildOrderingKey(composite),
  }
}

function buildOrderingKey(composite: CompositeScore): ScoreOrderingKey {
  return {
    compositeValue: composite.value,
    confidenceLevel: composite.confidence.level,
    penaltyStatus: penaltyStatus(composite.penalties),
    penaltyCount: composite.penalties.length,
  }
}

function penaltyStatus(penalties: readonly Penalty[]): PenaltyOrderingStatus {
  if (penalties.some((penalty) => penalty.type === 'disqualification')) return 'disqualification'
  if (penalties.some((penalty) => penalty.type === 'hard')) return 'hard'
  if (penalties.some((penalty) => penalty.type === 'soft')) return 'soft'
  return 'none'
}

function extractSignals(composite: CompositeScore): readonly RawSignal[] {
  const signals = composite.breakdown.contributions.flatMap((contribution) =>
    contribution.component.inputs
  )
  const seen = new Set<string>()
  const out: RawSignal[] = []
  for (const signal of signals) {
    const key = `${signal.questionCode}\u0000${signal.source}\u0000${String(signal.value)}\u0000${signal.integrity}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(signal)
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Slot/group preparation
// ═══════════════════════════════════════════════════════════════════════════

interface SlotCandidateGroup {
  readonly slotId: string
  readonly slot: BlueprintSlot
  readonly candidates: readonly ScoreOrderingCandidate[]
}

function groupCandidatesBySlot(
  candidates: readonly ScoreOrderingCandidate[]
): readonly SlotCandidateGroup[] {
  const groups = new Map<string, { slot: BlueprintSlot; candidates: ScoreOrderingCandidate[] }>()

  for (const candidate of candidates) {
    const slotId = stableSlotId(candidate.composite.slot)
    const existing = groups.get(slotId)
    if (existing === undefined) {
      groups.set(slotId, { slot: candidate.composite.slot, candidates: [candidate] })
    } else {
      existing.candidates.push(candidate)
    }
  }

  return [...groups.entries()].map(([slotId, group]) => ({
    slotId,
    slot: group.slot,
    candidates: group.candidates,
  }))
}

function prepareSlot(group: SlotCandidateGroup): PreparedOrderingSlot {
  const byKey = new Map<string, ScoreOrderingCandidate[]>()
  for (const candidate of group.candidates) {
    const key = stableOrderingKey(candidate.orderingKey)
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, [candidate])
    } else {
      existing.push(candidate)
    }
  }

  const groups = [...byKey.values()]
    .map((candidates) => canonicalOrderingGroup(group.slotId, candidates))
    .sort((a, b) => compareOrderingKeys(a.orderingKey, b.orderingKey))
    .map((orderingGroup, index) => ({
      ...orderingGroup,
      groupId: `${group.slotId}::order-group-${String(index + 1).padStart(4, '0')}`,
    }))

  return {
    slotId: group.slotId,
    slot: group.slot,
    orderingKey: SCORE_ORDERING_KEY,
    groups,
  }
}

function canonicalOrderingGroup(
  slotId: string,
  candidates: readonly ScoreOrderingCandidate[]
): ScoreOrderingGroup {
  const canonicalCandidates = [...candidates].sort((a, b) =>
    compareStrings(a.questionCode, b.questionCode)
  )
  return {
    groupId: `${slotId}::order-group-pending`,
    orderingKey: canonicalCandidates[0]!.orderingKey,
    candidates: canonicalCandidates,
    unresolvedTie: canonicalCandidates.length > 1,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Fatal guards
// ═══════════════════════════════════════════════════════════════════════════

function assertValidComposite(composite: CompositeScore): void {
  if (composite.questionCode.trim().length === 0) {
    throw new Error('Fatal Score Ordering error: Composite has empty questionCode')
  }
  if (!Number.isFinite(composite.value) || composite.value < 0 || composite.value > 1) {
    throw new Error(
      `Fatal Score Ordering error: Composite ${composite.questionCode} has out-of-range value`
    )
  }
  if (composite.confidence.level !== 'high' && composite.confidence.level !== 'low') {
    throw new Error(
      `Fatal Score Ordering error: Composite ${composite.questionCode} has missing Confidence`
    )
  }
  if (composite.breakdown.contributions.length === 0) {
    throw new Error(
      `Fatal Score Ordering error: Composite ${composite.questionCode} has empty Breakdown`
    )
  }
  for (const contribution of composite.breakdown.contributions) {
    if (contribution.component.questionCode !== composite.questionCode) {
      throw new Error(
        `Fatal Score Ordering error: Component ${contribution.component.componentId} questionCode does not match Composite ${composite.questionCode}`
      )
    }
    if (contribution.component.slot !== composite.slot) {
      throw new Error(
        `Fatal Score Ordering error: Component ${contribution.component.componentId} slot does not match Composite slot`
      )
    }
  }
  for (const penalty of composite.penalties) {
    if (
      penalty.type !== 'soft' &&
      penalty.type !== 'hard' &&
      penalty.type !== 'disqualification'
    ) {
      throw new Error(
        `Fatal Score Ordering error: Composite ${composite.questionCode} has unknown Penalty type`
      )
    }
  }
}

function assertNoDuplicateCandidateSlot(candidates: readonly ScoreOrderingCandidate[]): void {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = `${stableSlotId(candidate.composite.slot)}\u0000${candidate.questionCode}`
    if (seen.has(key)) {
      throw new Error(
        `Fatal Score Ordering error: duplicate Composite for ${candidate.questionCode} in slot ${stableSlotId(candidate.composite.slot)}`
      )
    }
    seen.add(key)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Deterministic helpers
// ═══════════════════════════════════════════════════════════════════════════

function compareOrderingKeys(a: ScoreOrderingKey, b: ScoreOrderingKey): number {
  return (
    compareNumbersDesc(a.compositeValue, b.compositeValue) ||
    compareNumbersAsc(confidenceOrder(a.confidenceLevel), confidenceOrder(b.confidenceLevel)) ||
    compareNumbersAsc(penaltyOrder(a.penaltyStatus), penaltyOrder(b.penaltyStatus)) ||
    compareNumbersAsc(a.penaltyCount, b.penaltyCount)
  )
}

function confidenceOrder(level: ScoringConfidenceLevel): number {
  return level === 'high' ? 0 : 1
}

function penaltyOrder(status: PenaltyOrderingStatus): number {
  switch (status) {
    case 'none':
      return 0
    case 'soft':
      return 1
    case 'hard':
      return 2
    case 'disqualification':
      return 3
  }
}

function stableOrderingKey(key: ScoreOrderingKey): string {
  return [
    key.compositeValue.toFixed(12),
    key.confidenceLevel,
    key.penaltyStatus,
    String(key.penaltyCount),
  ].join('|')
}

function stableSlotId(slot: BlueprintSlot): string {
  return [
    `set=${slot.setNumber}`,
    `document=${slot.document ?? '*'}`,
    `difficulty=${slot.difficulty ?? '*'}`,
    `blueprintType=${slot.blueprintType ?? '*'}`,
    `pattern=${slot.pattern ?? '*'}`,
    `learningObjective=${slot.learningObjective ?? '*'}`,
  ].join('|')
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareNumbersAsc(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1
}

function compareNumbersDesc(a: number, b: number): number {
  return a === b ? 0 : a > b ? -1 : 1
}
