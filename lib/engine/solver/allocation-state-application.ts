/**
 * lib/engine/solver/allocation-state-application.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver — Allocation State Application.
 *
 * Applies already-approved Candidate Placement and Conflict Resolution
 * decisions to the authoritative immutable AllocationRuntimeState. This stage
 * makes no placement, conflict, validation, replacement, or finalization
 * decision of its own.
 */

import type {
  ConflictResolutionResult,
  ResolutionAction,
} from './conflict-resolution'
import type { DetectedConflict } from './conflict-detection'
import type {
  PlacementRuntimeState,
  ProvisionalPlacement,
} from './placement'
import {
  deriveAllocationProgress,
  type AllocationRuntimeState,
  type CandidateRuntimeState,
  type ConflictRuntimeEntry,
  type ReservationRuntimeEntry,
  type SlotRuntimeState,
} from './runtime'

/**
 * Applies provisional placements and conflict-resolution actions to a fresh
 * authoritative Allocation Runtime snapshot.
 *
 * Deterministic transition rules:
 *
 * - a placed Candidate is promoted from Reservation to `allocated`;
 * - a placed Candidate targeted by `release_slot` or `release_candidate` is
 *   released and the Slot becomes `released`;
 * - an unplaced Slot becomes `rejected`;
 * - resolved and unresolved conflict decisions are carried into the affected
 *   Runtime Slot when the existing Runtime conflict contract can identify a
 *   Candidate context;
 * - Candidate assignment views and Runtime progress are derived from the
 *   resulting Slot snapshots.
 *
 * Inputs are consumed read-only and are never mutated. The returned State,
 * Slot objects, Candidate objects, indexes, histories, and progress are newly
 * constructed.
 */
export function applyAllocationState(
  runtimeState: AllocationRuntimeState,
  placementState: PlacementRuntimeState,
  resolutionResult: ConflictResolutionResult
): AllocationRuntimeState {
  assertCompatibleInputs(runtimeState, placementState, resolutionResult)

  const placementsBySlot = new Map(
    placementState.provisionalPlacements.map(
      (placement) => [placement.slotId, placement] as const
    )
  )
  const actions = indexReleaseActions(resolutionResult.resolutionActions)
  const conflictsBySlot = indexRuntimeConflicts(
    runtimeState,
    placementsBySlot,
    resolutionResult
  )

  const slots = runtimeState.slots
    .map((slot) =>
      applySlot(
        slot,
        placementsBySlot.get(slot.slotId),
        actions,
        conflictsBySlot.get(slot.slotId) ?? []
      )
    )
    .sort(compareSlots)
  const slotsById = new Map(slots.map((slot) => [slot.slotId, slot]))
  const assignedSlots = assignedSlotsByCandidate(slots)
  const reservedSlots = reservedSlotsByCandidate(slots)
  const candidates = runtimeState.candidates
    .map((candidate) =>
      applyCandidate(candidate, assignedSlots, reservedSlots)
    )
    .sort(compareCandidates)
  const candidatesByCode = new Map(
    candidates.map((candidate) => [candidate.candidateCode, candidate])
  )

  return {
    rankedCandidateSet: runtimeState.rankedCandidateSet,
    constraintSnapshot: runtimeState.constraintSnapshot,
    slots,
    slotsById,
    candidates,
    candidatesByCode,
    progress: deriveAllocationProgress(slots, candidates),
  }
}

interface ReleaseActions {
  readonly releasedSlotIds: ReadonlySet<string>
  readonly releasedCandidateCodes: ReadonlySet<string>
  readonly releasedPlacementKeys: ReadonlySet<string>
  readonly reasonsByPlacementKey: ReadonlyMap<string, readonly string[]>
  readonly reasonsBySlotId: ReadonlyMap<string, readonly string[]>
}

function indexReleaseActions(
  resolutionActions: readonly ResolutionAction[]
): ReleaseActions {
  const releasedSlotIds = new Set<string>()
  const releasedCandidateCodes = new Set<string>()
  const releasedPlacementKeys = new Set<string>()
  const reasonsByPlacementKey = new Map<string, string[]>()
  const reasonsBySlotId = new Map<string, string[]>()

  for (const action of [...resolutionActions].sort(compareActions)) {
    if (action.kind === 'release_slot' && action.slotId !== null) {
      releasedSlotIds.add(action.slotId)
      appendReason(reasonsBySlotId, action.slotId, action.reason)
      continue
    }
    if (action.kind !== 'release_candidate' || action.candidateCode === null) {
      continue
    }
    if (action.slotId === null) {
      releasedCandidateCodes.add(action.candidateCode)
      continue
    }
    const key = placementKey(action.slotId, action.candidateCode)
    releasedPlacementKeys.add(key)
    appendReason(reasonsByPlacementKey, key, action.reason)
  }

  return {
    releasedSlotIds,
    releasedCandidateCodes,
    releasedPlacementKeys,
    reasonsByPlacementKey: freezeReasonMap(reasonsByPlacementKey),
    reasonsBySlotId: freezeReasonMap(reasonsBySlotId),
  }
}

function applySlot(
  slot: SlotRuntimeState,
  placement: ProvisionalPlacement | undefined,
  actions: ReleaseActions,
  newConflicts: readonly ConflictRuntimeEntry[]
): SlotRuntimeState {
  if (placement === undefined) {
    return {
      ...slot,
      occupancy: { ...slot.occupancy },
      candidateCodes: [...slot.candidateCodes],
      reservationHistory: [...slot.reservationHistory],
      replacementHistory: [...slot.replacementHistory],
      conflicts: mergeConflicts(slot.conflicts, newConflicts),
    }
  }

  if (placement.status === 'unplaced') {
    return {
      ...slot,
      occupancy: {
        state: 'rejected',
        reservedCandidateCode: null,
        assignedCandidateCode: null,
      },
      candidateCodes: [...slot.candidateCodes],
      reservationHistory: [...slot.reservationHistory],
      replacementHistory: [...slot.replacementHistory],
      conflicts: mergeConflicts(slot.conflicts, newConflicts),
    }
  }

  const candidateCode = requirePlacedCandidate(placement)
  const released = isPlacementReleased(placement, actions)
  const reservation: ReservationRuntimeEntry = {
    candidateCode,
    inheritedPriority: requireInheritedRank(placement),
    outcome: released ? 'released' : 'promoted',
    reason: reservationReason(placement, actions, released),
  }

  return {
    ...slot,
    occupancy: released
      ? {
          state: 'released',
          reservedCandidateCode: null,
          assignedCandidateCode: null,
        }
      : {
          state: 'allocated',
          reservedCandidateCode: null,
          assignedCandidateCode: candidateCode,
        },
    candidateCodes: [...slot.candidateCodes],
    reservationHistory: appendReservation(
      slot.reservationHistory,
      reservation
    ),
    replacementHistory: [...slot.replacementHistory],
    conflicts: mergeConflicts(slot.conflicts, newConflicts),
  }
}

function applyCandidate(
  candidate: CandidateRuntimeState,
  assignedSlots: ReadonlyMap<string, string>,
  reservedSlots: ReadonlyMap<string, string>
): CandidateRuntimeState {
  return {
    ...candidate,
    considerationSlotIds: [...candidate.considerationSlotIds],
    inheritedPrioritySlotIds: new Map(
      candidate.inheritedPrioritySlotIds
    ),
    reservedSlotId: reservedSlots.get(candidate.candidateCode) ?? null,
    assignedSlotId: assignedSlots.get(candidate.candidateCode) ?? null,
  }
}

function indexRuntimeConflicts(
  runtimeState: AllocationRuntimeState,
  placementsBySlot: ReadonlyMap<string, ProvisionalPlacement>,
  resolutionResult: ConflictResolutionResult
): ReadonlyMap<string, readonly ConflictRuntimeEntry[]> {
  const bySlot = new Map<string, ConflictRuntimeEntry[]>()
  const decisions = [
    ...resolutionResult.resolvedConflicts.map((entry) => ({
      conflict: entry.conflict,
      resolution: entry.resolution,
    })),
    ...resolutionResult.unresolvedConflicts.map((entry) => ({
      conflict: entry.conflict,
      resolution: entry.resolution,
    })),
  ].sort(compareConflictDecisions)

  for (const decision of decisions) {
    const slotId = decision.conflict.slotId
    if (slotId === null) continue
    const slot = runtimeState.slotsById.get(slotId)
    if (slot === undefined) continue
    const candidateCode = conflictCandidateCode(
      decision.conflict,
      placementsBySlot.get(slotId),
      slot,
      runtimeState.candidatesByCode
    )
    if (candidateCode === null) continue

    const conflicts = bySlot.get(slotId) ?? []
    conflicts.push({
      candidateCode,
      constraint: decision.conflict.constraint,
      type: decision.conflict.type,
      scope: decision.conflict.scope,
      resolution: decision.resolution,
      participants: [...decision.conflict.participants].sort(compareStrings),
      evidence: decision.conflict.evidence,
    })
    bySlot.set(slotId, conflicts)
  }

  return new Map(
    [...bySlot.entries()].map(([slotId, conflicts]) => [
      slotId,
      [...conflicts].sort(compareRuntimeConflicts),
    ])
  )
}

function conflictCandidateCode(
  conflict: DetectedConflict,
  placement: ProvisionalPlacement | undefined,
  slot: SlotRuntimeState,
  candidatesByCode: ReadonlyMap<string, CandidateRuntimeState>
): string | null {
  if (conflict.candidateCode !== null) return conflict.candidateCode
  if (placement?.candidateCode !== null && placement?.candidateCode !== undefined) {
    return placement.candidateCode
  }
  const participant = [...conflict.participants]
    .filter((candidateCode) => candidatesByCode.has(candidateCode))
    .sort(compareStrings)[0]
  if (participant !== undefined) return participant
  return [...slot.candidateCodes].sort(compareStrings)[0] ?? null
}

function assignedSlotsByCandidate(
  slots: readonly SlotRuntimeState[]
): ReadonlyMap<string, string> {
  const assigned = new Map<string, string>()
  for (const slot of slots) {
    const candidateCode = slot.occupancy.assignedCandidateCode
    if (candidateCode === null) continue
    if (!assigned.has(candidateCode)) {
      assigned.set(candidateCode, slot.slotId)
    }
  }
  return assigned
}

function reservedSlotsByCandidate(
  slots: readonly SlotRuntimeState[]
): ReadonlyMap<string, string> {
  const reserved = new Map<string, string>()
  for (const slot of slots) {
    const candidateCode = slot.occupancy.reservedCandidateCode
    if (candidateCode === null) continue
    if (!reserved.has(candidateCode)) {
      reserved.set(candidateCode, slot.slotId)
    }
  }
  return reserved
}

function appendReservation(
  history: readonly ReservationRuntimeEntry[],
  reservation: ReservationRuntimeEntry
): readonly ReservationRuntimeEntry[] {
  const exists = history.some(
    (entry) =>
      entry.candidateCode === reservation.candidateCode &&
      entry.inheritedPriority === reservation.inheritedPriority &&
      entry.outcome === reservation.outcome &&
      entry.reason === reservation.reason
  )
  return exists ? [...history] : [...history, reservation]
}

function mergeConflicts(
  existing: readonly ConflictRuntimeEntry[],
  incoming: readonly ConflictRuntimeEntry[]
): readonly ConflictRuntimeEntry[] {
  const byKey = new Map<string, ConflictRuntimeEntry>()
  for (const conflict of [...existing, ...incoming]) {
    byKey.set(runtimeConflictKey(conflict), {
      ...conflict,
      participants: [...conflict.participants],
    })
  }
  return [...byKey.values()].sort(compareRuntimeConflicts)
}

function isPlacementReleased(
  placement: ProvisionalPlacement,
  actions: ReleaseActions
): boolean {
  const candidateCode = requirePlacedCandidate(placement)
  return (
    actions.releasedSlotIds.has(placement.slotId) ||
    actions.releasedCandidateCodes.has(candidateCode) ||
    actions.releasedPlacementKeys.has(
      placementKey(placement.slotId, candidateCode)
    )
  )
}

function reservationReason(
  placement: ProvisionalPlacement,
  actions: ReleaseActions,
  released: boolean
): string {
  if (!released) return placement.reason
  const candidateCode = requirePlacedCandidate(placement)
  const reasons = [
    ...(actions.reasonsBySlotId.get(placement.slotId) ?? []),
    ...(actions.reasonsByPlacementKey.get(
      placementKey(placement.slotId, candidateCode)
    ) ?? []),
  ].sort(compareStrings)
  return reasons.length > 0 ? reasons.join(' ') : placement.reason
}

function assertCompatibleInputs(
  runtimeState: AllocationRuntimeState,
  placementState: PlacementRuntimeState,
  resolutionResult: ConflictResolutionResult
): void {
  if (
    placementState.placementProgress.totalSlots !==
    runtimeState.slots.length
  ) {
    throw new Error(
      'Fatal Allocation State Application error: placement totalSlots does not match AllocationRuntimeState'
    )
  }

  const seenSlots = new Set<string>()
  for (const placement of placementState.provisionalPlacements) {
    if (seenSlots.has(placement.slotId)) {
      throw new Error(
        `Fatal Allocation State Application error: duplicate provisional placement for Slot '${placement.slotId}'`
      )
    }
    seenSlots.add(placement.slotId)
    if (!runtimeState.slotsById.has(placement.slotId)) {
      throw new Error(
        `Fatal Allocation State Application error: unknown provisional Slot '${placement.slotId}'`
      )
    }
  }

  if (
    resolutionResult.resolutionSummary.totalConflictCount !==
    resolutionResult.resolvedConflicts.length +
      resolutionResult.unresolvedConflicts.length
  ) {
    throw new Error(
      'Fatal Allocation State Application error: conflict resolution summary does not match decisions'
    )
  }
  if (
    resolutionResult.resolutionSummary.actionCount !==
    resolutionResult.resolutionActions.length
  ) {
    throw new Error(
      'Fatal Allocation State Application error: conflict resolution summary does not match actions'
    )
  }
}

function requirePlacedCandidate(placement: ProvisionalPlacement): string {
  if (placement.candidateCode === null) {
    throw new Error(
      `Fatal Allocation State Application error: placed Slot '${placement.slotId}' has no Candidate`
    )
  }
  return placement.candidateCode
}

function requireInheritedRank(placement: ProvisionalPlacement): number {
  if (
    placement.inheritedRank === null ||
    !Number.isInteger(placement.inheritedRank) ||
    placement.inheritedRank < 1
  ) {
    throw new Error(
      `Fatal Allocation State Application error: placed Slot '${placement.slotId}' has invalid inherited rank`
    )
  }
  return placement.inheritedRank
}

function appendReason(
  target: Map<string, string[]>,
  key: string,
  reason: string
): void {
  const reasons = target.get(key) ?? []
  reasons.push(reason)
  target.set(key, reasons)
}

function freezeReasonMap(
  source: ReadonlyMap<string, readonly string[]>
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...source.entries()].map(([key, reasons]) => [
      key,
      [...new Set(reasons)].sort(compareStrings),
    ])
  )
}

function placementKey(slotId: string, candidateCode: string): string {
  return `${slotId}\u0000${candidateCode}`
}

function runtimeConflictKey(conflict: ConflictRuntimeEntry): string {
  return [
    conflict.candidateCode,
    conflict.constraint,
    conflict.type,
    conflict.scope,
    conflict.resolution,
    [...conflict.participants].sort(compareStrings).join('\u0001'),
    conflict.evidence,
  ].join('\u0000')
}

function compareSlots(
  a: SlotRuntimeState,
  b: SlotRuntimeState
): number {
  return compareStrings(a.slotId, b.slotId)
}

function compareCandidates(
  a: CandidateRuntimeState,
  b: CandidateRuntimeState
): number {
  return compareStrings(a.candidateCode, b.candidateCode)
}

function compareActions(a: ResolutionAction, b: ResolutionAction): number {
  return compareStrings(a.actionId, b.actionId)
}

function compareConflictDecisions(
  a: { readonly conflict: DetectedConflict; readonly resolution: string },
  b: { readonly conflict: DetectedConflict; readonly resolution: string }
): number {
  return (
    compareStrings(a.conflict.conflictId, b.conflict.conflictId) ||
    compareStrings(a.resolution, b.resolution)
  )
}

function compareRuntimeConflicts(
  a: ConflictRuntimeEntry,
  b: ConflictRuntimeEntry
): number {
  return compareStrings(runtimeConflictKey(a), runtimeConflictKey(b))
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
