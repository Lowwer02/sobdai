/**
 * lib/engine/solver/placement.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.4 — Candidate Placement.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.1 / §3.2 Stage 4
 *     "Candidate Placement".
 *   - Allocation Runtime State from E-4C.1 and BlueprintValidationResult from
 *     E-4C.3.
 *
 * WHAT THIS MODULE IS.
 *  - A pure, deterministic, single-pass provisional placement initializer.
 *  - Traverses eligible Slots in stable Slot-id order.
 *  - Reads inherited RankedCandidateSet order for each Slot.
 *  - Produces immutable placement state, diagnostics, progress, and remaining
 *    Slot/Candidate views for later stages.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT evaluate constraints, detect conflicts, resolve conflicts, replace
 *    Candidates, retry, backtrack, search, finalize allocation, or emit Solver
 *    output.
 */

import type { RankedCandidateSet, RankedSlot } from '../ranking/contracts'
import type { SolverDiagnostic } from './contracts'
import type { AllocationRuntimeState } from './runtime'
import type { BlueprintValidationResult } from './blueprint-validation'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Placement runtime state
// ═══════════════════════════════════════════════════════════════════════════

export type ProvisionalPlacementStatus = 'placed' | 'unplaced'

export interface ProvisionalPlacement {
  readonly slotId: string
  readonly candidateCode: string | null
  readonly inheritedRank: number | null
  readonly status: ProvisionalPlacementStatus
  readonly reason: string
}

export interface PlacementProgress {
  readonly totalSlots: number
  readonly placedSlotCount: number
  readonly unplacedSlotCount: number
  readonly remainingCandidateCount: number
  readonly remainingSlotCount: number
}

export interface PlacementRuntimeState {
  readonly provisionalPlacements: readonly ProvisionalPlacement[]
  readonly placementDiagnostics: readonly SolverDiagnostic[]
  readonly placementProgress: PlacementProgress
  readonly remainingCandidates: readonly string[]
  readonly remainingSlots: readonly string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function initializeCandidatePlacement(
  runtimeState: AllocationRuntimeState,
  validationResult: BlueprintValidationResult,
  rankedCandidateSet: RankedCandidateSet
): PlacementRuntimeState {
  assertCompatibleInputs(runtimeState, validationResult, rankedCandidateSet)

  if (validationResult.status === 'invalid' || validationResult.fatalDiagnostics.length > 0) {
    const remainingSlots = sortedSlotIds(rankedCandidateSet.slots)
    const remainingCandidates = sortedCandidateCodes(rankedCandidateSet)
    return buildState({
      provisionalPlacements: [],
      placementDiagnostics: [
        diagnostic(
          'blueprint_impossible',
          'Blueprint validation is invalid; Candidate Placement is not initialized.',
          'Resolve Blueprint validation fatal diagnostics before candidate placement.'
        ),
      ],
      remainingCandidates,
      remainingSlots,
      totalSlots: rankedCandidateSet.slots.length,
    })
  }

  const remainingCandidates = new Set(sortedCandidateCodes(rankedCandidateSet))
  const placements: ProvisionalPlacement[] = []
  const diagnostics: SolverDiagnostic[] = []

  for (const rankedSlot of sortedSlots(rankedCandidateSet.slots)) {
    const placement = placeSlot(rankedSlot, remainingCandidates)
    placements.push(placement)
    if (placement.candidateCode !== null) {
      remainingCandidates.delete(placement.candidateCode)
    } else {
      diagnostics.push(
        diagnostic(
          'no_feasible_candidate',
          `No remaining ranked Candidate is available for Slot '${rankedSlot.slotId}'.`,
          'Surface the unplaced Slot to Conflict Detection / later Solver stages.'
        )
      )
    }
  }

  const remainingSlots = placements
    .filter((placement) => placement.status === 'unplaced')
    .map((placement) => placement.slotId)
    .sort(compareStrings)

  return buildState({
    provisionalPlacements: placements,
    placementDiagnostics: diagnostics.sort(compareDiagnostics),
    remainingCandidates: [...remainingCandidates].sort(compareStrings),
    remainingSlots,
    totalSlots: rankedCandidateSet.slots.length,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only placement helpers
// ═══════════════════════════════════════════════════════════════════════════

export function getProvisionalPlacement(
  state: PlacementRuntimeState,
  slotId: string
): ProvisionalPlacement | undefined {
  return state.provisionalPlacements.find((placement) => placement.slotId === slotId)
}

export function isSlotProvisionallyPlaced(
  state: PlacementRuntimeState,
  slotId: string
): boolean {
  return getProvisionalPlacement(state, slotId)?.status === 'placed'
}

export function provisionalCandidateForSlot(
  state: PlacementRuntimeState,
  slotId: string
): string | null {
  return getProvisionalPlacement(state, slotId)?.candidateCode ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Placement implementation
// ═══════════════════════════════════════════════════════════════════════════

function placeSlot(
  rankedSlot: RankedSlot,
  remainingCandidates: ReadonlySet<string>
): ProvisionalPlacement {
  for (const candidate of rankedSlot.rankedCandidates) {
    if (!remainingCandidates.has(candidate.code)) continue
    return {
      slotId: rankedSlot.slotId,
      candidateCode: candidate.code,
      inheritedRank: candidate.rank,
      status: 'placed',
      reason: `Selected Candidate '${candidate.code}' from inherited rank ${candidate.rank} for Slot '${rankedSlot.slotId}'.`,
    }
  }

  return {
    slotId: rankedSlot.slotId,
    candidateCode: null,
    inheritedRank: null,
    status: 'unplaced',
    reason: `No remaining ranked Candidate was available for Slot '${rankedSlot.slotId}'.`,
  }
}

function buildState(input: {
  readonly provisionalPlacements: readonly ProvisionalPlacement[]
  readonly placementDiagnostics: readonly SolverDiagnostic[]
  readonly remainingCandidates: readonly string[]
  readonly remainingSlots: readonly string[]
  readonly totalSlots: number
}): PlacementRuntimeState {
  const placedSlotCount = input.provisionalPlacements.filter((p) => p.status === 'placed').length
  const unplacedSlotCount = input.totalSlots - placedSlotCount
  return {
    provisionalPlacements: input.provisionalPlacements,
    placementDiagnostics: input.placementDiagnostics,
    placementProgress: {
      totalSlots: input.totalSlots,
      placedSlotCount,
      unplacedSlotCount,
      remainingCandidateCount: input.remainingCandidates.length,
      remainingSlotCount: input.remainingSlots.length,
    },
    remainingCandidates: input.remainingCandidates,
    remainingSlots: input.remainingSlots,
  }
}

function assertCompatibleInputs(
  runtimeState: AllocationRuntimeState,
  validationResult: BlueprintValidationResult,
  rankedCandidateSet: RankedCandidateSet
): void {
  if (runtimeState.rankedCandidateSet !== rankedCandidateSet) {
    throw new Error('Fatal Candidate Placement error: RankedCandidateSet reference mismatch')
  }
  if (runtimeState.constraintSnapshot !== validationResult.constraintSnapshot) {
    throw new Error('Fatal Candidate Placement error: ConstraintSnapshot reference mismatch')
  }
  if (rankedCandidateSet.constraintSnapshot !== validationResult.constraintSnapshot) {
    throw new Error('Fatal Candidate Placement error: RankedCandidateSet ConstraintSnapshot mismatch')
  }
  assertRankedSlotsWellFormed(rankedCandidateSet)
}

function assertRankedSlotsWellFormed(rankedCandidateSet: RankedCandidateSet): void {
  const seenSlotIds = new Set<string>()
  for (const rankedSlot of rankedCandidateSet.slots) {
    if (typeof rankedSlot.slotId !== 'string' || rankedSlot.slotId.length === 0) {
      throw new Error('Fatal Candidate Placement error: RankedSlot.slotId is empty')
    }
    if (seenSlotIds.has(rankedSlot.slotId)) {
      throw new Error(`Fatal Candidate Placement error: duplicate Slot '${rankedSlot.slotId}'`)
    }
    seenSlotIds.add(rankedSlot.slotId)

    const seenRanks = new Set<number>()
    let previousRank = 0
    for (const candidate of rankedSlot.rankedCandidates) {
      if (typeof candidate.code !== 'string' || candidate.code.length === 0) {
        throw new Error(`Fatal Candidate Placement error: empty Candidate code in Slot '${rankedSlot.slotId}'`)
      }
      if (!Number.isInteger(candidate.rank) || candidate.rank < 1) {
        throw new Error(`Fatal Candidate Placement error: invalid rank for Candidate '${candidate.code}'`)
      }
      if (seenRanks.has(candidate.rank)) {
        throw new Error(`Fatal Candidate Placement error: duplicate rank ${candidate.rank} in Slot '${rankedSlot.slotId}'`)
      }
      if (candidate.rank <= previousRank) {
        throw new Error(`Fatal Candidate Placement error: non-increasing ranks in Slot '${rankedSlot.slotId}'`)
      }
      seenRanks.add(candidate.rank)
      previousRank = candidate.rank
    }
  }
}

function sortedSlots(slots: readonly RankedSlot[]): readonly RankedSlot[] {
  return [...slots].sort((a, b) => compareStrings(a.slotId, b.slotId))
}

function sortedSlotIds(slots: readonly RankedSlot[]): readonly string[] {
  return slots.map((slot) => slot.slotId).sort(compareStrings)
}

function sortedCandidateCodes(rankedCandidateSet: RankedCandidateSet): readonly string[] {
  return rankedCandidateSet.candidateSet.candidates
    .map((candidate) => candidate.identity.questionCode)
    .sort(compareStrings)
}

function diagnostic(
  category: SolverDiagnostic['category'],
  explanation: string,
  recommendation: string
): SolverDiagnostic {
  return {
    category,
    severity: 'Fatal',
    stage: 'candidate_placement',
    slotId: null,
    candidateCode: null,
    componentId: null,
    explanation,
    recommendation,
  }
}

function compareDiagnostics(a: SolverDiagnostic, b: SolverDiagnostic): number {
  return (
    compareStrings(a.category, b.category) ||
    compareStrings(a.explanation, b.explanation) ||
    compareStrings(a.recommendation, b.recommendation)
  )
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
