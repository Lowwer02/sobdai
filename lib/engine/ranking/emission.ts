/**
 * lib/engine/ranking/emission.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.3 — RankedCandidateSet Emission.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §7 (RankedCandidateSet), §8 (Score
 *     Consumption), §9 (Ranking Transparency), §10 (Failure Handling).
 *
 * WHAT THIS MODULE IS.
 *  - Consumes immutable Tie Resolution output from E-3E.2.
 *  - Constructs the frozen RankedCandidateSet contract.
 *  - Assigns final deterministic one-based ranks from already-resolved order.
 *  - Propagates CandidateSet identity, metadata, warnings, shortfall report,
 *    and coverage satisfaction unchanged.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT compute scores, modify ordering keys, modify tie resolution,
 *    invoke Solver, query the Bank, read content, invoke React/UI/API code,
 *    use time, randomness, or hidden state.
 */

import type { CandidateSet } from '../generator/contracts'
import type { ComponentId } from '../scoring/contracts'
import type {
  NeighborComparison,
  OrderingReason,
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
  RankedSlotSummary,
} from './contracts'
import type {
  TieResolvedCandidate,
  TieResolvedGroup,
  TieResolutionOutput,
} from './tie-resolution'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage input contract
// ═══════════════════════════════════════════════════════════════════════════

/** Stage E-3E.3 input. Required fields are all frozen upstream contracts. */
export interface RankedCandidateSetEmissionInput {
  readonly candidateSet: CandidateSet
  readonly tieResolution: TieResolutionOutput
  readonly rankingVersion: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — RankedCandidateSet Emission
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Emit the immutable RankedCandidateSet defined by Ranking Contracts.
 *
 * Final ranks are assigned strictly from E-3E.2 group order and resolved
 * candidate order. Scores, Confidence, Penalties, Signals, tie metadata, and
 * Generator artifacts are carried forward by reference wherever the frozen
 * contracts require preservation.
 *
 * @spec Candidate Ranking Architecture v1.0 §7 and §9.
 */
export function emitRankedCandidateSet(
  input: RankedCandidateSetEmissionInput
): RankedCandidateSet {
  assertValidInput(input)

  const knownCodes = new Set(input.candidateSet.candidates.map((candidate) => candidate.identity.questionCode))
  const slots = input.tieResolution.slots.map((slot) =>
    emitRankedSlot(slot, knownCodes)
  )

  return {
    identity: {
      candidateSetId: input.candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: input.rankingVersion,
    },
    candidateSet: input.candidateSet,
    slots,
    shortfallReport: input.candidateSet.shortfallReport,
    coverageSatisfaction: input.candidateSet.coverageSatisfaction,
    warnings: input.candidateSet.warnings,
    meta: {
      specVersion: '1.0',
      rankingVersion: input.rankingVersion,
      scoringModelVersion: '1.0',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Slot and candidate emission
// ═══════════════════════════════════════════════════════════════════════════

type TieResolvedSlot = TieResolutionOutput['slots'][number]

function emitRankedSlot(slot: TieResolvedSlot, knownCodes: ReadonlySet<string>): RankedSlot {
  const resolvedCandidates = flattenGroups(slot.groups)
  assertKnownCandidates(slot.slotId, resolvedCandidates, knownCodes)
  assertNoDuplicateCandidateInSlot(slot.slotId, resolvedCandidates)

  const rankedCandidates = resolvedCandidates.map((candidate, index) =>
    emitRankedCandidate(candidate, index + 1, resolvedCandidates, slot.orderingKey.facets)
  )

  return {
    slotId: slot.slotId,
    slot: slot.slot,
    rankedCandidates,
    slotSummary: emitSlotSummary(slot, rankedCandidates),
  }
}

function emitRankedCandidate(
  candidate: TieResolvedCandidate,
  rank: number,
  allCandidates: readonly TieResolvedCandidate[],
  determiningFacets: readonly string[]
): RankedCandidate {
  const orderingCandidate = candidate.orderingCandidate
  const composite = orderingCandidate.composite
  const componentIds = componentIdsFromComposite(composite)

  return {
    code: candidate.questionCode,
    rank,
    tieGroupId: candidate.tieStatus.tieGroupId,
    composite,
    confidence: orderingCandidate.confidence,
    penalties: orderingCandidate.penalties,
    signals: orderingCandidate.signals,
    orderingReason: emitOrderingReason(candidate, rank, allCandidates, determiningFacets),
    auditTrail: {
      candidateCode: candidate.questionCode,
      signals: orderingCandidate.signals,
      componentIds,
      composite,
      confidence: orderingCandidate.confidence,
      penalties: orderingCandidate.penalties,
      rank,
    },
  }
}

function emitOrderingReason(
  candidate: TieResolvedCandidate,
  rank: number,
  allCandidates: readonly TieResolvedCandidate[],
  determiningFacets: readonly string[]
): OrderingReason {
  return {
    summary: orderingSummary(candidate, rank),
    determiningFacets,
    neighborComparison: neighborComparison(rank, allCandidates),
    tieStatus: candidate.tieStatus,
  }
}

function orderingSummary(candidate: TieResolvedCandidate, rank: number): string {
  if (candidate.tieStatus.tieGroupId !== null) {
    return `Candidate ${candidate.questionCode} occupies rank ${rank} after score ordering and visible Tie Resolution using ${candidate.tieStatus.tieBreaker?.key}.`
  }
  return `Candidate ${candidate.questionCode} occupies rank ${rank} after score ordering; no tie resolution was required.`
}

function neighborComparison(
  rank: number,
  allCandidates: readonly TieResolvedCandidate[]
): NeighborComparison | null {
  if (allCandidates.length === 1) return null

  const index = rank - 1
  const above = allCandidates[index - 1]?.questionCode ?? null
  const below = allCandidates[index + 1]?.questionCode ?? null
  return {
    aboveCode: above,
    belowCode: below,
    explanation: `Neighbor comparison for rank ${rank}: above=${above ?? 'none'}, below=${below ?? 'none'}.`,
  }
}

function emitSlotSummary(
  slot: TieResolvedSlot,
  rankedCandidates: readonly RankedCandidate[]
): RankedSlotSummary {
  return {
    tieGroups: slot.groups.flatMap((group) => group.tieGroup === null ? [] : [group.tieGroup]),
    topOfSlotRationale:
      rankedCandidates.length === 0
        ? 'No Candidates were available for this slot.'
        : `Top Candidate ${rankedCandidates[0]!.code} is first after score ordering and tie resolution.`,
    orderingKey: slot.orderingKey,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Fatal guards
// ═══════════════════════════════════════════════════════════════════════════

function assertValidInput(input: RankedCandidateSetEmissionInput): void {
  if (input.rankingVersion.trim().length === 0) {
    throw new Error('Fatal RankedCandidateSet Emission error: rankingVersion is required')
  }
  if (input.candidateSet.meta.specVersion !== '1.0') {
    throw new Error(
      `Fatal RankedCandidateSet Emission error: unsupported CandidateSet specVersion ${input.candidateSet.meta.specVersion}`
    )
  }
}

function assertKnownCandidates(
  slotId: string,
  candidates: readonly TieResolvedCandidate[],
  knownCodes: ReadonlySet<string>
): void {
  const unknown = candidates.find((candidate) => !knownCodes.has(candidate.questionCode))
  if (unknown !== undefined) {
    throw new Error(
      `Fatal RankedCandidateSet Emission error: Candidate ${unknown.questionCode} in slot ${slotId} is not present in CandidateSet`
    )
  }
}

function assertNoDuplicateCandidateInSlot(
  slotId: string,
  candidates: readonly TieResolvedCandidate[]
): void {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.questionCode)) {
      throw new Error(
        `Fatal RankedCandidateSet Emission error: duplicate Candidate ${candidate.questionCode} in slot ${slotId}`
      )
    }
    seen.add(candidate.questionCode)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Deterministic helpers
// ═══════════════════════════════════════════════════════════════════════════

function flattenGroups(groups: readonly TieResolvedGroup[]): readonly TieResolvedCandidate[] {
  return groups.flatMap((group) => group.candidates)
}

function componentIdsFromComposite(
  composite: TieResolvedCandidate['orderingCandidate']['composite']
): readonly ComponentId[] {
  return composite.breakdown.contributions.map((contribution) => contribution.component.componentId)
}

