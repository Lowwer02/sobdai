/**
 * lib/engine/ranking/tie-resolution.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.2 — Deterministic Tie Resolution.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §6 (Tie Resolution), §9 (Ranking
 *     Transparency), §10 (Failure Handling).
 *
 * WHAT THIS MODULE IS.
 *  - Consumes the ordered candidate groups produced by E-3E.1.
 *  - Resolves groups with equal ordering keys using the fixed, inspectable
 *    stable-identity fallback authorized by §6.3 and §6.4: Question Code.
 *  - Records visible tie-group metadata for later RankedCandidateSet emission.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT compute scores, modify ordering keys, assign final ranks, emit
 *    RankedCandidateSet, solve allocations, query the Bank, read content,
 *    invoke React/UI/API code, use time, randomness, or hidden state.
 */

import type { TieBreaker, TieGroup, TieStatus } from './contracts'
import type {
  PreparedOrderingSlot,
  ScoreOrderingCandidate,
  ScoreOrderingGroup,
  ScoreOrderingKey,
  ScoreOrderingOutput,
} from './runtime'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage input/output contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage E-3E.2 input. `maxTieGroupSize` is explicit because §6.5 requires
 * bounded tie resolution while leaving the overflow threshold to implementation.
 */
export interface TieResolutionInput {
  readonly ordering: ScoreOrderingOutput
  readonly maxTieGroupSize: number
}

/** One Candidate after tie resolution. No final rank is assigned in E-3E.2. */
export interface TieResolvedCandidate {
  readonly questionCode: string
  readonly orderingCandidate: ScoreOrderingCandidate
  readonly tieStatus: TieStatus
}

/** One score-ordering group after optional tie resolution. */
export interface TieResolvedGroup {
  readonly groupId: string
  readonly orderingKey: ScoreOrderingKey
  readonly candidates: readonly TieResolvedCandidate[]
  readonly tieGroup: TieGroup | null
}

/** One Blueprint slot after tie resolution. */
export interface TieResolvedSlot {
  readonly slotId: string
  readonly slot: PreparedOrderingSlot['slot']
  readonly orderingKey: PreparedOrderingSlot['orderingKey']
  readonly groups: readonly TieResolvedGroup[]
}

/** Stage E-3E.2 output. Does not emit RankedCandidateSet or final ranks. */
export interface TieResolutionOutput {
  readonly slots: readonly TieResolvedSlot[]
  readonly summary: {
    readonly totalSlots: number
    readonly totalCandidates: number
    readonly totalGroups: number
    readonly resolvedTieGroups: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Tie Resolution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve tied score-ordering groups deterministically.
 *
 * The only tie-breaker used here is stable identity: Question Code. This is
 * explicitly permitted by §6.3 and named as the final total-order fallback in
 * §6.4. Non-tied groups are preserved without tie metadata.
 *
 * @spec Candidate Ranking Architecture v1.0 §6.3–§6.5.
 */
export function resolveTies(input: TieResolutionInput): TieResolutionOutput {
  assertValidTieLimit(input.maxTieGroupSize)

  const slots = input.ordering.slots.map((slot) => resolveSlot(slot, input.maxTieGroupSize))

  return {
    slots,
    summary: {
      totalSlots: slots.length,
      totalCandidates: slots.reduce(
        (total, slot) =>
          total + slot.groups.reduce((slotTotal, group) => slotTotal + group.candidates.length, 0),
        0
      ),
      totalGroups: slots.reduce((total, slot) => total + slot.groups.length, 0),
      resolvedTieGroups: slots.reduce(
        (total, slot) => total + slot.groups.filter((group) => group.tieGroup !== null).length,
        0
      ),
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Slot/group resolution
// ═══════════════════════════════════════════════════════════════════════════

function resolveSlot(slot: PreparedOrderingSlot, maxTieGroupSize: number): TieResolvedSlot {
  return {
    slotId: slot.slotId,
    slot: slot.slot,
    orderingKey: slot.orderingKey,
    groups: slot.groups.map((group) => resolveGroup(slot.slotId, group, maxTieGroupSize)),
  }
}

function resolveGroup(
  slotId: string,
  group: ScoreOrderingGroup,
  maxTieGroupSize: number
): TieResolvedGroup {
  assertValidGroup(slotId, group, maxTieGroupSize)

  if (!group.unresolvedTie) {
    return {
      groupId: group.groupId,
      orderingKey: group.orderingKey,
      candidates: group.candidates.map((candidate) => ({
        questionCode: candidate.questionCode,
        orderingCandidate: candidate,
        tieStatus: {
          tieGroupId: null,
          memberCodes: [],
          tieBreaker: null,
        },
      })),
      tieGroup: null,
    }
  }

  const tieBreaker = questionCodeTieBreaker()
  const memberCodes = group.candidates.map((candidate) => candidate.questionCode)
  const resolvedCandidates = [...group.candidates].sort((a, b) =>
    compareStrings(a.questionCode, b.questionCode)
  )
  const resolvedOrder = resolvedCandidates.map((candidate) => candidate.questionCode)
  const tieGroup: TieGroup = {
    tieGroupId: group.groupId,
    memberCodes,
    resolvedOrder,
    tieBreaker,
  }

  return {
    groupId: group.groupId,
    orderingKey: group.orderingKey,
    candidates: resolvedCandidates.map((candidate) => ({
      questionCode: candidate.questionCode,
      orderingCandidate: candidate,
      tieStatus: {
        tieGroupId: tieGroup.tieGroupId,
        memberCodes: tieGroup.memberCodes,
        tieBreaker,
      },
    })),
    tieGroup,
  }
}

function questionCodeTieBreaker(): TieBreaker {
  return {
    source: 'stable_identity',
    key: 'questionCode',
    reason:
      'Tie Resolution uses Question Code, the immutable Candidate identity, as the fixed stable-identity fallback named in Candidate Ranking Architecture §6.3–§6.4.',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Fatal guards
// ═══════════════════════════════════════════════════════════════════════════

function assertValidTieLimit(maxTieGroupSize: number): void {
  if (!Number.isInteger(maxTieGroupSize) || maxTieGroupSize < 1) {
    throw new Error(
      'Fatal Tie Resolution error: maxTieGroupSize must be a positive integer'
    )
  }
}

function assertValidGroup(
  slotId: string,
  group: ScoreOrderingGroup,
  maxTieGroupSize: number
): void {
  if (group.candidates.length === 0) {
    throw new Error(
      `Fatal Tie Resolution error: empty ordering group ${group.groupId} in slot ${slotId}`
    )
  }
  if (group.unresolvedTie && group.candidates.length > maxTieGroupSize) {
    throw new Error(
      `Fatal Tie Resolution error: tie overflow in slot ${slotId}; group ${group.groupId} has ${group.candidates.length} Candidates, limit is ${maxTieGroupSize}`
    )
  }
  if (group.unresolvedTie && group.candidates.length < 2) {
    throw new Error(
      `Fatal Tie Resolution error: group ${group.groupId} is marked tied but has fewer than two Candidates`
    )
  }
  if (!group.unresolvedTie && group.candidates.length !== 1) {
    throw new Error(
      `Fatal Tie Resolution error: group ${group.groupId} is marked non-tied but has ${group.candidates.length} Candidates`
    )
  }

  assertUniqueQuestionCodes(slotId, group)
  assertSharedOrderingKey(slotId, group)
}

function assertUniqueQuestionCodes(slotId: string, group: ScoreOrderingGroup): void {
  const codes = group.candidates.map((candidate) => candidate.questionCode)
  const unique = new Set(codes)
  if (unique.size !== codes.length) {
    throw new Error(
      `Fatal Tie Resolution error: duplicate Question Code inside group ${group.groupId} in slot ${slotId}`
    )
  }
}

function assertSharedOrderingKey(slotId: string, group: ScoreOrderingGroup): void {
  const expected = stableOrderingKey(group.orderingKey)
  const mismatched = group.candidates.find(
    (candidate) => stableOrderingKey(candidate.orderingKey) !== expected
  )
  if (mismatched !== undefined) {
    throw new Error(
      `Fatal Tie Resolution error: Candidate ${mismatched.questionCode} ordering key does not match group ${group.groupId} in slot ${slotId}`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Deterministic helpers
// ═══════════════════════════════════════════════════════════════════════════

function stableOrderingKey(key: ScoreOrderingKey): string {
  return [
    key.compositeValue.toFixed(12),
    key.confidenceLevel,
    key.penaltyStatus,
    String(key.penaltyCount),
  ].join('|')
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

