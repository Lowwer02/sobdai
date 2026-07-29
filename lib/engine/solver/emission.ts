/**
 * Constraint Solver E-4C.10 — AllocatedCandidateSet Emission.
 *
 * Pure terminal projection of finalized Runtime State and the completed audit
 * into the frozen AllocatedCandidateSet contract.
 */

import type {
  AllocatedCandidateSet,
  ConflictRecord,
  ConflictResolutionStatus,
  ConflictType,
  Placement,
  RejectedPlacement,
  ReplacementRecord,
} from './contracts'
import type { RankedCandidate } from '../ranking/contracts'
import type { AllocationRuntimeState, ConflictRuntimeEntry, SlotRuntimeState } from './runtime'
import type { AllocationFinalizationResult } from './finalization'
import type { AuditFinalizationResult } from './audit'

export const SOLVER_VERSION = '1.0.0'

export function emitAllocatedCandidateSet(
  finalizationResult: AllocationFinalizationResult,
  auditResult: AuditFinalizationResult,
  runtimeState: AllocationRuntimeState
): AllocatedCandidateSet {
  const finalized = finalizationResult.finalizedAllocationState
  assertCompatibleInputs(finalizationResult, auditResult, runtimeState)

  const placements = Object.freeze(
    finalized.slots
      .slice()
      .sort(compareSlots)
      .map((slot) => placementFor(slot, finalized))
  )
  const unresolvedConflicts = Object.freeze(
    finalized.slots
      .flatMap((slot) => slot.conflicts
        .filter((conflict) => conflict.resolution === 'unresolved')
        .map((conflict) => conflictRecord(conflict)))
      .sort(compareConflicts)
  )
  const feasibility = placements.some((placement) => placement.state === 'rejected') || unresolvedConflicts.length > 0
    ? 'partially_feasible'
    : 'feasible'
  const shortfallSummary = Object.freeze({
    allocatedSlotCount: placements.filter((placement) => placement.state === 'allocated').length,
    rejectedSlotCount: placements.filter((placement) => placement.state === 'rejected').length,
    unresolvedConflictCount: unresolvedConflicts.length,
    strainedSoftConstraintCount: finalized.slots.flatMap((slot) => slot.conflicts).filter((conflict) => conflict.type === 'soft').length,
    summary: shortfallSummaryText(placements, unresolvedConflicts.length),
  })

  return Object.freeze({
    identity: Object.freeze({
      rankedCandidateSetId: finalized.rankedCandidateSet.identity.candidateSetId,
      solverVersion: SOLVER_VERSION,
      allocationModelVersion: '1.0',
      scoringModelVersion: finalized.rankedCandidateSet.meta.scoringModelVersion,
    }),
    placements,
    feasibility,
    shortfallSummary,
    unresolvedConflicts,
    auditTrail: auditResult.allocationAudit,
    rankedCandidateSet: finalized.rankedCandidateSet,
    shortfallReport: finalized.rankedCandidateSet.shortfallReport,
    coverageSatisfaction: finalized.rankedCandidateSet.coverageSatisfaction,
    constraintSnapshot: finalized.constraintSnapshot,
    warnings: finalized.rankedCandidateSet.warnings,
    meta: Object.freeze({
      specVersion: '1.0',
      solverVersion: SOLVER_VERSION,
      allocationModelVersion: '1.0',
      scoringModelVersion: finalized.rankedCandidateSet.meta.scoringModelVersion,
    }),
  })
}

export function placementForSlot(
  allocatedCandidateSet: AllocatedCandidateSet,
  slotId: string
): Placement | undefined {
  return allocatedCandidateSet.placements.find((placement) => placement.slotId === slotId)
}

export function isPartialAllocation(allocatedCandidateSet: AllocatedCandidateSet): boolean {
  return allocatedCandidateSet.feasibility === 'partially_feasible'
}

export function allocatedSlotIds(allocatedCandidateSet: AllocatedCandidateSet): readonly string[] {
  return Object.freeze(allocatedCandidateSet.placements
    .filter((placement) => placement.state === 'allocated')
    .map((placement) => placement.slotId)
    .sort(compareStrings))
}

function assertCompatibleInputs(
  finalizationResult: AllocationFinalizationResult,
  auditResult: AuditFinalizationResult,
  runtimeState: AllocationRuntimeState
): void {
  const finalized = finalizationResult.finalizedAllocationState
  if (finalizationResult.finalizedDiagnostics.length > 0 || finalizationResult.finalizationSummary.finalizationDiagnosticCount !== 0) {
    throw new Error('Fatal AllocatedCandidateSet Emission error: finalization is incomplete')
  }
  if (auditResult.auditDiagnostics.some((diagnostic) => diagnostic.severity === 'Fatal')) {
    throw new Error('Fatal AllocatedCandidateSet Emission error: audit is incomplete')
  }
  if (finalized.rankedCandidateSet !== runtimeState.rankedCandidateSet || finalized.constraintSnapshot !== runtimeState.constraintSnapshot) {
    throw new Error('Fatal AllocatedCandidateSet Emission error: Runtime metadata does not match finalized allocation')
  }
  if (finalized.slots.length !== runtimeState.slots.length) {
    throw new Error('Fatal AllocatedCandidateSet Emission error: Runtime Slot count does not match finalized allocation')
  }
  for (const slot of finalized.slots) {
    if (slot.occupancy.state !== 'locked' && slot.occupancy.state !== 'rejected') {
      throw new Error(`Fatal AllocatedCandidateSet Emission error: Slot '${slot.slotId}' is not terminally finalized`)
    }
    if (slot.occupancy.state === 'locked' && slot.occupancy.assignedCandidateCode === null) {
      throw new Error(`Fatal AllocatedCandidateSet Emission error: locked Slot '${slot.slotId}' has no assigned Candidate`)
    }
  }
}

function placementFor(slot: SlotRuntimeState, finalized: AllocationRuntimeState): Placement {
  if (slot.occupancy.state === 'locked') return allocatedPlacement(slot, finalized)
  if (slot.occupancy.state === 'rejected') return rejectedPlacement(slot)
  throw new Error(`Fatal AllocatedCandidateSet Emission error: Slot '${slot.slotId}' is not terminally finalized`)
}

function allocatedPlacement(slot: SlotRuntimeState, finalized: AllocationRuntimeState): Placement {
  const candidateCode = slot.occupancy.assignedCandidateCode
  if (candidateCode === null) throw new Error(`Fatal AllocatedCandidateSet Emission error: locked Slot '${slot.slotId}' has no assigned Candidate`)
  const assignedCandidate = rankedCandidateFor(finalized, slot.slotId, candidateCode)
  return Object.freeze({
    slotId: slot.slotId,
    slot: slot.slot,
    state: 'allocated',
    assignedCandidate,
    placementReasoning: Object.freeze({
      inheritedScoreValue: assignedCandidate.composite.value,
      inheritedRank: assignedCandidate.rank,
      summary: `Candidate '${candidateCode}' was locked for Slot '${slot.slotId}' from inherited rank ${assignedCandidate.rank}: ${assignedCandidate.orderingReason.summary}`,
    }),
    conflictsResolved: Object.freeze(slot.conflicts
      .filter((conflict) => conflict.resolution !== 'unresolved')
      .map(conflictRecord)
      .sort(compareConflicts)),
    replacements: Object.freeze(slot.replacementHistory.map((replacement) => Object.freeze({ ...replacement } satisfies ReplacementRecord))),
    reviewerOverrides: Object.freeze([]),
  })
}

function rejectedPlacement(slot: SlotRuntimeState): RejectedPlacement {
  const blocking = slot.conflicts.filter((conflict) => conflict.resolution === 'unresolved' && conflict.type === 'hard')
  if (slot.candidateCodes.length === 0 || blocking.length === 0) {
    throw new Error(`Fatal AllocatedCandidateSet Emission error: rejected Slot '${slot.slotId}' has incomplete Runtime History`)
  }
  return Object.freeze({
    slotId: slot.slotId,
    slot: slot.slot,
    state: 'rejected',
    considered: Object.freeze(slot.candidateCodes.map((candidateCode) => Object.freeze({
      candidateCode,
      reason: rejectionReason(candidateCode, blocking),
    }))),
    blockingConstraints: Object.freeze([...new Set(blocking.map((conflict) => conflict.constraint))].sort(compareStrings)),
    reason: `Slot '${slot.slotId}' was rejected because unresolved Hard constraints prevented every considered Candidate from being retained.`,
  })
}

function rankedCandidateFor(state: AllocationRuntimeState, slotId: string, candidateCode: string): RankedCandidate {
  const rankedSlot = state.rankedCandidateSet.slots.find((slot) => slot.slotId === slotId)
  const candidate = rankedSlot?.rankedCandidates.find((entry) => entry.code === candidateCode)
  if (candidate === undefined) throw new Error(`Fatal AllocatedCandidateSet Emission error: Candidate '${candidateCode}' is missing from ranked Slot '${slotId}'`)
  return candidate
}

function conflictRecord(conflict: ConflictRuntimeEntry): ConflictRecord {
  return Object.freeze({
    candidateCode: conflict.candidateCode,
    constraint: conflict.constraint,
    type: conflict.type,
    scope: conflict.scope,
    source: 'solver' as const,
    resolution: conflict.resolution,
    participants: Object.freeze([...conflict.participants].sort(compareStrings)),
    evidence: conflict.evidence,
    resolutionNote: `Conflict '${conflict.constraint}' is ${conflict.resolution} in the finalized Runtime State.`,
  })
}

function rejectionReason(candidateCode: string, blocking: readonly ConflictRuntimeEntry[]): string {
  const conflicts = blocking.filter((conflict) => conflict.candidateCode === candidateCode)
  return conflicts.length === 0
    ? `Candidate '${candidateCode}' was considered but no feasible finalized placement remained.`
    : conflicts.map((conflict) => `${conflict.constraint}: ${conflict.evidence}`).sort(compareStrings).join(' ')
}

function shortfallSummaryText(placements: readonly Placement[], unresolvedConflictCount: number): string {
  const allocated = placements.filter((placement) => placement.state === 'allocated').length
  const rejected = placements.length - allocated
  return `${allocated} Slot(s) allocated, ${rejected} Slot(s) rejected, ${unresolvedConflictCount} unresolved Hard Conflict(s).`
}

function compareSlots(a: SlotRuntimeState, b: SlotRuntimeState): number { return compareStrings(a.slotId, b.slotId) }
function compareConflicts(a: ConflictRecord, b: ConflictRecord): number {
  return compareStrings(a.constraint, b.constraint) || compareStrings(a.candidateCode, b.candidateCode) || compareStrings(a.evidence, b.evidence)
}
function compareStrings(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
