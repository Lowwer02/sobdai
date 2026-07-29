/**
 * lib/engine/solver/audit.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.9 — Audit Finalization.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.1 / §3.2 Stage 9
 *     "Audit Finalization".
 *   - Solver §10 (Transparency) and §10.5 (Audit Trail Integrity).
 *
 * WHAT THIS MODULE IS.
 *  - A pure, deterministic projection of the locked Allocation Runtime State
 *    into the existing AllocationAuditEntry vocabulary.
 *  - The final internal audit artifact before Stage 10 output emission.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT change the finalized allocation, perform placement, conflict
 *    resolution, validation, search, backtracking, or Solver output emission.
 */

import type {
  AllocationAuditEntry,
  SolverDiagnostic,
  SolverDiagnosticCategory,
} from './contracts'
import type {
  AllocationRuntimeState,
  ConflictRuntimeEntry,
  ReplacementRuntimeEntry,
  ReservationRuntimeEntry,
  SlotRuntimeState,
} from './runtime'
import type { AllocationFinalizationResult } from './finalization'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Audit Finalization output
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditSummary {
  readonly totalEntryCount: number
  readonly placementEntryCount: number
  readonly rejectionEntryCount: number
  readonly conflictEntryCount: number
  readonly replacementEntryCount: number
  readonly releaseEntryCount: number
  readonly lockEntryCount: number
  readonly auditedSlotCount: number
  readonly auditDiagnosticCount: number
}

export interface AuditFinalizationResult {
  readonly allocationAudit: readonly AllocationAuditEntry[]
  readonly auditDiagnostics: readonly SolverDiagnostic[]
  readonly auditSummary: AuditSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function finalizeAllocationAudit(
  finalizationResult: AllocationFinalizationResult,
  runtimeState: AllocationRuntimeState
): AuditFinalizationResult {
  assertAuditComplete(finalizationResult, runtimeState)

  const drafts = [...auditDrafts(finalizationResult.finalizedAllocationState.slots)].sort(compareDrafts)
  const allocationAudit = Object.freeze(
    drafts.map((draft, ordering) => Object.freeze(toAuditEntry(draft, ordering)))
  )
  const auditDiagnostics = Object.freeze(
    [...auditDiagnosticsFor(finalizationResult.finalizedAllocationState.slots)]
      .sort(compareDiagnostics)
      .map((diagnostic) => Object.freeze(diagnostic))
  )

  return Object.freeze({
    allocationAudit,
    auditDiagnostics,
    auditSummary: Object.freeze(summarize(
      allocationAudit,
      auditDiagnostics,
      new Set(drafts.map((draft) => draft.slotId)).size
    )),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only audit helpers
// ═══════════════════════════════════════════════════════════════════════════

export function hasCompleteAllocationAudit(result: AuditFinalizationResult): boolean {
  return result.auditDiagnostics.every((diagnostic) => diagnostic.severity !== 'Fatal')
}

export function auditEntriesForDecision(
  result: AuditFinalizationResult,
  decision: AllocationAuditEntry['decision']
): readonly AllocationAuditEntry[] {
  return result.allocationAudit.filter((entry) => entry.decision === decision)
}

export function auditDecisionKinds(
  result: AuditFinalizationResult
): readonly AllocationAuditEntry['decision'][] {
  return Object.freeze(
    [...new Set(result.allocationAudit.map((entry) => entry.decision))].sort(compareStrings)
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Deterministic audit construction
// ═══════════════════════════════════════════════════════════════════════════

type AuditDraft = Omit<AllocationAuditEntry, 'ordering'> & {
  readonly slotId: string
  readonly sequence: number
}

function auditDrafts(slots: readonly SlotRuntimeState[]): readonly AuditDraft[] {
  return slots.flatMap((slot) => [
    ...reservationDrafts(slot),
    ...replacementDrafts(slot),
    ...conflictDrafts(slot),
    ...terminalDrafts(slot),
  ])
}

function reservationDrafts(slot: SlotRuntimeState): readonly AuditDraft[] {
  return slot.reservationHistory.map((reservation, index) => reservationDraft(slot, reservation, index))
}

function reservationDraft(
  slot: SlotRuntimeState,
  reservation: ReservationRuntimeEntry,
  index: number
): AuditDraft {
  const isPlacement = reservation.outcome === 'promoted'
  return {
    decision: isPlacement ? 'placement' : 'release',
    owner: 'solver',
    slotId: slot.slotId,
    sequence: index,
    evidence: `Slot '${slot.slotId}' reservation for Candidate '${reservation.candidateCode}' at inherited rank ${reservation.inheritedPriority} ended as '${reservation.outcome}'.`,
    reasoning: reservation.reason,
  }
}

function replacementDrafts(slot: SlotRuntimeState): readonly AuditDraft[] {
  return slot.replacementHistory.map((replacement, index) => replacementDraft(slot, replacement, index))
}

function replacementDraft(
  slot: SlotRuntimeState,
  replacement: ReplacementRuntimeEntry,
  index: number
): AuditDraft {
  return {
    decision: 'replacement',
    owner: replacement.source,
    slotId: slot.slotId,
    sequence: index,
    evidence: `Slot '${slot.slotId}' replaced Candidate '${replacement.previousCode}' with '${replacement.newCode ?? 'none'}'.`,
    reasoning: replacement.reason,
  }
}

function conflictDrafts(slot: SlotRuntimeState): readonly AuditDraft[] {
  return slot.conflicts.map((conflict, index) => conflictDraft(slot, conflict, index))
}

function conflictDraft(
  slot: SlotRuntimeState,
  conflict: ConflictRuntimeEntry,
  index: number
): AuditDraft {
  return {
    decision: 'conflict',
    owner: 'solver',
    slotId: slot.slotId,
    sequence: index,
    evidence: conflict.evidence,
    reasoning: `Candidate '${conflict.candidateCode}' encountered ${conflict.type} constraint '${conflict.constraint}' in ${conflict.scope} scope; resolution is '${conflict.resolution}'.`,
  }
}

function terminalDrafts(slot: SlotRuntimeState): readonly AuditDraft[] {
  const code = slot.occupancy.assignedCandidateCode
  switch (slot.occupancy.state) {
    case 'locked':
      return [{
        decision: 'lock',
        owner: 'solver',
        slotId: slot.slotId,
        sequence: 0,
        evidence: `Slot '${slot.slotId}' is locked with Candidate '${code}'.`,
        reasoning: `Finalization locked the validated allocation for Slot '${slot.slotId}'.`,
      }]
    case 'rejected':
      return [{
        decision: 'rejection',
        owner: 'solver',
        slotId: slot.slotId,
        sequence: 0,
        evidence: `Slot '${slot.slotId}' is rejected with no assigned Candidate.`,
        reasoning: `Slot '${slot.slotId}' remains an explicit allocation shortfall after finalization.`,
      }]
    case 'released':
      return [{
        decision: 'release',
        owner: 'solver',
        slotId: slot.slotId,
        sequence: 0,
        evidence: `Slot '${slot.slotId}' has a released allocation state.`,
        reasoning: `Slot '${slot.slotId}' was released before finalization and remains unassigned.`,
      }]
    default:
      return []
  }
}

function toAuditEntry(draft: AuditDraft, ordering: number): AllocationAuditEntry {
  return {
    decision: draft.decision,
    owner: draft.owner,
    ordering,
    evidence: draft.evidence,
    reasoning: draft.reasoning,
  }
}

function auditDiagnosticsFor(slots: readonly SlotRuntimeState[]): readonly SolverDiagnostic[] {
  return slots
    .filter((slot) => slot.occupancy.state === 'rejected')
    .map((slot) => diagnostic(
      'no_feasible_candidate',
      slot.slotId,
      `Rejected Slot '${slot.slotId}' is retained as an explicit allocation shortfall in the finalized audit.`,
      'Review the Slot shortfall before requesting a new Solver run.'
    ))
}

function summarize(
  entries: readonly AllocationAuditEntry[],
  diagnostics: readonly SolverDiagnostic[],
  auditedSlotCount: number
): AuditSummary {
  return {
    totalEntryCount: entries.length,
    placementEntryCount: countDecision(entries, 'placement'),
    rejectionEntryCount: countDecision(entries, 'rejection'),
    conflictEntryCount: countDecision(entries, 'conflict'),
    replacementEntryCount: countDecision(entries, 'replacement'),
    releaseEntryCount: countDecision(entries, 'release'),
    lockEntryCount: countDecision(entries, 'lock'),
    auditedSlotCount,
    auditDiagnosticCount: diagnostics.length,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Audit-integrity guards
// ═══════════════════════════════════════════════════════════════════════════

function assertAuditComplete(
  finalizationResult: AllocationFinalizationResult,
  runtimeState: AllocationRuntimeState
): void {
  if (finalizationResult.finalizedDiagnostics.length > 0) {
    throw new Error('Fatal Audit Finalization error: Allocation Finalization contains diagnostics')
  }
  if (finalizationResult.finalizationSummary.finalizationDiagnosticCount !== 0) {
    throw new Error('Fatal Audit Finalization error: finalization summary reports diagnostics')
  }

  const finalizedState = finalizationResult.finalizedAllocationState
  if (finalizedState.rankedCandidateSet !== runtimeState.rankedCandidateSet) {
    throw new Error('Fatal Audit Finalization error: finalized Runtime State does not match runtime metadata')
  }
  if (finalizedState.constraintSnapshot !== runtimeState.constraintSnapshot) {
    throw new Error('Fatal Audit Finalization error: finalized Constraint Snapshot does not match runtime metadata')
  }
  if (finalizedState.slots.length !== runtimeState.slots.length) {
    throw new Error('Fatal Audit Finalization error: finalized Slot count does not match runtime metadata')
  }

  const assignedCandidates = new Set<string>()
  for (const slot of finalizedState.slots) {
    if (slot.occupancy.state === 'allocated' || slot.occupancy.state === 'reserved' || slot.occupancy.state === 'completed') {
      throw new Error(`Fatal Audit Finalization error: Slot '${slot.slotId}' is not terminally finalized`)
    }
    if (slot.occupancy.state === 'locked') {
      const code = slot.occupancy.assignedCandidateCode
      if (code === null) {
        throw new Error(`Fatal Audit Finalization error: locked Slot '${slot.slotId}' has no assigned Candidate`)
      }
      if (assignedCandidates.has(code)) {
        throw new Error(`Fatal Audit Finalization error: Candidate '${code}' is locked in multiple Slots`)
      }
      assignedCandidates.add(code)
    }
    assertSlotHistoryComplete(slot)
  }
}

function assertSlotHistoryComplete(slot: SlotRuntimeState): void {
  for (const reservation of slot.reservationHistory) {
    if (reservation.reason.length === 0) {
      throw new Error(`Fatal Audit Finalization error: reservation history for Slot '${slot.slotId}' is incomplete`)
    }
    if (reservation.outcome === 'active') {
      throw new Error(`Fatal Audit Finalization error: Slot '${slot.slotId}' retains an active reservation history entry`)
    }
  }
  for (const replacement of slot.replacementHistory) {
    if (replacement.reason.length === 0) {
      throw new Error(`Fatal Audit Finalization error: replacement history for Slot '${slot.slotId}' is incomplete`)
    }
  }
  for (const conflict of slot.conflicts) {
    if (conflict.evidence.length === 0) {
      throw new Error(`Fatal Audit Finalization error: conflict history for Slot '${slot.slotId}' is incomplete`)
    }
  }
}

function diagnostic(
  category: SolverDiagnosticCategory,
  slotId: string,
  explanation: string,
  recommendation: string
): SolverDiagnostic {
  return {
    category,
    severity: 'Non-fatal',
    stage: 'audit_finalization',
    slotId,
    candidateCode: null,
    componentId: null,
    explanation,
    recommendation,
  }
}

function compareDrafts(a: AuditDraft, b: AuditDraft): number {
  return (
    compareStrings(a.slotId, b.slotId) ||
    decisionOrder(a.decision) - decisionOrder(b.decision) ||
    a.sequence - b.sequence ||
    compareStrings(a.evidence, b.evidence)
  )
}

function compareDiagnostics(a: SolverDiagnostic, b: SolverDiagnostic): number {
  return compareStrings(a.slotId ?? '', b.slotId ?? '') || compareStrings(a.explanation, b.explanation)
}

function countDecision(entries: readonly AllocationAuditEntry[], decision: AllocationAuditEntry['decision']): number {
  return entries.filter((entry) => entry.decision === decision).length
}

function decisionOrder(decision: AllocationAuditEntry['decision']): number {
  switch (decision) {
    case 'placement': return 0
    case 'conflict': return 1
    case 'replacement': return 2
    case 'rollback': return 3
    case 'release': return 4
    case 'rejection': return 5
    case 'lock': return 6
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
