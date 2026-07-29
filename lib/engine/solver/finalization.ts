/**
 * lib/engine/solver/finalization.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.8 — Allocation Finalization.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.1 / §3.2 Stage 8
 *     "Finalize Allocation".
 *   - Reconciled Stage 8 decision: AllocationRuntimeState is the authoritative
 *     effective allocation carrier. AllocationValidationResult is only the
 *     validation gate.
 *
 * WHAT THIS MODULE IS.
 *  - A pure, deterministic finalization pass over the validated Runtime State.
 *  - Locks validated allocated Slots by returning a fresh immutable runtime
 *    snapshot whose allocated occupancy has become locked occupancy.
 *  - Emits finalization diagnostics and a finalization summary.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT perform placement, validation, conflict resolution, search,
 *    backtracking, runtime redesign, or Solver output emission.
 */

import type { AllocationState, SolverDiagnostic, SolverDiagnosticCategory } from './contracts'
import type {
  AllocationProgress,
  AllocationRuntimeState,
  CandidateRuntimeState,
  SlotRuntimeState,
} from './runtime'
import type { AllocationValidationResult } from './allocation-validation'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Allocation Finalization output
// ═══════════════════════════════════════════════════════════════════════════

export interface FinalizationSummary {
  readonly totalSlotCount: number
  readonly lockedSlotCount: number
  readonly openSlotCount: number
  readonly rejectedSlotCount: number
  readonly releasedSlotCount: number
  readonly assignedCandidateCount: number
  readonly unresolvedConflictCount: number
  readonly finalizationDiagnosticCount: number
}

export interface AllocationFinalizationResult {
  readonly finalizedAllocationState: AllocationRuntimeState
  readonly finalizedDiagnostics: readonly SolverDiagnostic[]
  readonly finalizationSummary: FinalizationSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function finalizeAllocationState(
  runtimeState: AllocationRuntimeState,
  validationResult: AllocationValidationResult
): AllocationFinalizationResult {
  assertValidationGate(runtimeState, validationResult)
  assertRuntimeFinalizable(runtimeState)

  const slots = runtimeState.slots.map(finalizeSlot).sort(compareSlots)
  const slotsById = new Map(slots.map((slot) => [slot.slotId, slot]))
  const assignedByCandidate = assignedSlotByCandidate(slots)
  const candidates = runtimeState.candidates
    .map((candidate) => finalizeCandidate(candidate, assignedByCandidate))
    .sort(compareCandidates)
  const candidatesByCode = new Map(candidates.map((candidate) => [candidate.candidateCode, candidate]))

  const finalizedAllocationState: AllocationRuntimeState = {
    rankedCandidateSet: runtimeState.rankedCandidateSet,
    constraintSnapshot: runtimeState.constraintSnapshot,
    slots,
    slotsById,
    candidates,
    candidatesByCode,
    progress: computeProgress(slots, candidates),
  }
  const finalizedDiagnostics = finalizationDiagnostics(finalizedAllocationState)

  return {
    finalizedAllocationState,
    finalizedDiagnostics,
    finalizationSummary: summarize(finalizedAllocationState, finalizedDiagnostics),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only finalization helpers
// ═══════════════════════════════════════════════════════════════════════════

export function isFinalizationComplete(result: AllocationFinalizationResult): boolean {
  return result.finalizedDiagnostics.length === 0
}

export function finalizedSlot(
  result: AllocationFinalizationResult,
  slotId: string
): SlotRuntimeState | undefined {
  return result.finalizedAllocationState.slotsById.get(slotId)
}

export function finalizedCandidate(
  result: AllocationFinalizationResult,
  candidateCode: string
): CandidateRuntimeState | undefined {
  return result.finalizedAllocationState.candidatesByCode.get(candidateCode)
}

export function lockedSlotIds(result: AllocationFinalizationResult): readonly string[] {
  return result.finalizedAllocationState.slots
    .filter((slot) => slot.occupancy.state === 'locked')
    .map((slot) => slot.slotId)
    .sort(compareStrings)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Finalization implementation
// ═══════════════════════════════════════════════════════════════════════════

function finalizeSlot(slot: SlotRuntimeState): SlotRuntimeState {
  if (slot.occupancy.state !== 'allocated') return slot
  return {
    ...slot,
    occupancy: {
      state: 'locked',
      reservedCandidateCode: null,
      assignedCandidateCode: slot.occupancy.assignedCandidateCode,
    },
    reservationHistory: slot.reservationHistory,
    replacementHistory: slot.replacementHistory,
    conflicts: slot.conflicts,
  }
}

function finalizeCandidate(
  candidate: CandidateRuntimeState,
  assignedByCandidate: ReadonlyMap<string, string>
): CandidateRuntimeState {
  return {
    ...candidate,
    reservedSlotId: null,
    assignedSlotId: assignedByCandidate.get(candidate.candidateCode) ?? null,
  }
}

function assignedSlotByCandidate(
  slots: readonly SlotRuntimeState[]
): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const slot of slots) {
    if (!isAssignedState(slot.occupancy.state) || slot.occupancy.assignedCandidateCode === null) continue
    map.set(slot.occupancy.assignedCandidateCode, slot.slotId)
  }
  return map
}

function finalizationDiagnostics(
  state: AllocationRuntimeState
): readonly SolverDiagnostic[] {
  const diagnostics: SolverDiagnostic[] = []
  for (const slot of state.slots) {
    if (slot.occupancy.state === 'allocated') {
      diagnostics.push(
        diagnostic(
          'runtime_inconsistency',
          'Fatal',
          slot.slotId,
          slot.occupancy.assignedCandidateCode,
          `Slot '${slot.slotId}' remained allocated after finalization.`,
          'Lock every validated allocated Slot during Allocation Finalization.'
        )
      )
    }
    if (slot.occupancy.state === 'reserved') {
      diagnostics.push(
        diagnostic(
          'runtime_inconsistency',
          'Fatal',
          slot.slotId,
          slot.occupancy.reservedCandidateCode,
          `Slot '${slot.slotId}' retained a live Reservation after finalization.`,
          'Resolve or release live Reservations before Allocation Finalization.'
        )
      )
    }
  }
  return diagnostics.sort(compareDiagnostics)
}

function summarize(
  state: AllocationRuntimeState,
  diagnostics: readonly SolverDiagnostic[]
): FinalizationSummary {
  return {
    totalSlotCount: state.slots.length,
    lockedSlotCount: state.slots.filter((slot) => slot.occupancy.state === 'locked').length,
    openSlotCount: state.slots.filter((slot) => slot.occupancy.state === 'open').length,
    rejectedSlotCount: state.slots.filter((slot) => slot.occupancy.state === 'rejected').length,
    releasedSlotCount: state.slots.filter((slot) => slot.occupancy.state === 'released').length,
    assignedCandidateCount: state.candidates.filter((candidate) => candidate.assignedSlotId !== null).length,
    unresolvedConflictCount: state.slots.flatMap((slot) => slot.conflicts).filter((c) => c.resolution === 'unresolved').length,
    finalizationDiagnosticCount: diagnostics.length,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Guards and deterministic utilities
// ═══════════════════════════════════════════════════════════════════════════

function assertValidationGate(
  runtimeState: AllocationRuntimeState,
  validationResult: AllocationValidationResult
): void {
  if (validationResult.validationResult !== 'valid') {
    throw new Error('Fatal Allocation Finalization error: allocation validation did not pass')
  }
  if (validationResult.validationSummary.fatalDiagnosticCount > 0) {
    throw new Error('Fatal Allocation Finalization error: validation contains Fatal diagnostics')
  }
  if (validationResult.validationSummary.totalSlotCount !== runtimeState.slots.length) {
    throw new Error('Fatal Allocation Finalization error: validation totalSlotCount does not match AllocationRuntimeState')
  }
}

function assertRuntimeFinalizable(runtimeState: AllocationRuntimeState): void {
  const seenSlots = new Set<string>()
  const assignedCandidates = new Map<string, string>()
  for (const slot of runtimeState.slots) {
    if (seenSlots.has(slot.slotId)) {
      throw new Error(`Fatal Allocation Finalization error: duplicate Slot '${slot.slotId}'`)
    }
    seenSlots.add(slot.slotId)

    if (slot.occupancy.state === 'completed') {
      throw new Error(`Fatal Allocation Finalization error: Slot '${slot.slotId}' is already completed`)
    }
    if (slot.occupancy.state === 'reserved') {
      throw new Error(`Fatal Allocation Finalization error: Slot '${slot.slotId}' has a live Reservation`)
    }
    if (isAssignedState(slot.occupancy.state)) {
      const code = slot.occupancy.assignedCandidateCode
      if (code === null) {
        throw new Error(`Fatal Allocation Finalization error: Slot '${slot.slotId}' is assigned without a Candidate`)
      }
      if (!slot.candidateCodes.includes(code)) {
        throw new Error(`Fatal Allocation Finalization error: Candidate '${code}' is not eligible for Slot '${slot.slotId}'`)
      }
      if (!runtimeState.candidatesByCode.has(code)) {
        throw new Error(`Fatal Allocation Finalization error: Candidate '${code}' is missing from Runtime State`)
      }
      const previousSlot = assignedCandidates.get(code)
      if (previousSlot !== undefined) {
        throw new Error(`Fatal Allocation Finalization error: Candidate '${code}' assigned to multiple Slots (${previousSlot}, ${slot.slotId})`)
      }
      assignedCandidates.set(code, slot.slotId)
    }
  }
}

function computeProgress(
  slots: readonly SlotRuntimeState[],
  candidates: readonly CandidateRuntimeState[]
): AllocationProgress {
  return {
    totalSlots: slots.length,
    openSlotCount: countSlots(slots, 'open'),
    reservedSlotCount: countSlots(slots, 'reserved'),
    allocatedSlotCount: countSlots(slots, 'allocated'),
    lockedSlotCount: countSlots(slots, 'locked'),
    rejectedSlotCount: countSlots(slots, 'rejected'),
    releasedSlotCount: countSlots(slots, 'released'),
    totalCandidates: candidates.length,
    reservedCandidateCount: candidates.filter((candidate) => candidate.reservedSlotId !== null).length,
    assignedCandidateCount: candidates.filter((candidate) => candidate.assignedSlotId !== null).length,
    unresolvedConflictCount: slots.flatMap((slot) => slot.conflicts).filter((c) => c.resolution === 'unresolved').length,
  }
}

function countSlots(slots: readonly SlotRuntimeState[], state: AllocationState): number {
  return slots.filter((slot) => slot.occupancy.state === state).length
}

function isAssignedState(state: AllocationState): boolean {
  return state === 'allocated' || state === 'locked'
}

function diagnostic(
  category: SolverDiagnosticCategory,
  severity: SolverDiagnostic['severity'],
  slotId: string | null,
  candidateCode: string | null,
  explanation: string,
  recommendation: string
): SolverDiagnostic {
  return {
    category,
    severity,
    stage: 'finalize_allocation',
    slotId,
    candidateCode,
    componentId: null,
    explanation,
    recommendation,
  }
}

function compareSlots(a: SlotRuntimeState, b: SlotRuntimeState): number {
  return compareStrings(a.slotId, b.slotId)
}

function compareCandidates(a: CandidateRuntimeState, b: CandidateRuntimeState): number {
  return compareStrings(a.candidateCode, b.candidateCode)
}

function compareDiagnostics(a: SolverDiagnostic, b: SolverDiagnostic): number {
  return (
    compareStrings(a.category, b.category) ||
    compareStrings(a.slotId ?? '', b.slotId ?? '') ||
    compareStrings(a.candidateCode ?? '', b.candidateCode ?? '') ||
    compareStrings(a.explanation, b.explanation)
  )
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
