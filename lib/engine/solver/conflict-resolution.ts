/**
 * lib/engine/solver/conflict-resolution.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.6 — Conflict Resolution.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.1 / §3.2 Stage 6
 *     "Conflict Resolution".
 *   - ConflictDetectionResult from E-4C.5, PlacementRuntimeState from E-4C.4,
 *     and AllocationRuntimeState from E-4C.1.
 *
 * WHAT THIS MODULE IS.
 *  - A pure, deterministic, read-only decision layer over detected conflicts.
 *  - Produces explicit resolution decisions and release recommendations.
 *  - Marks conflicts resolved only when a deterministic release recommendation
 *    is sufficient to remove the conflicting provisional placement.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT search alternative paths, retry placement, replace Candidates,
 *    backtrack, mutate PlacementRuntimeState, mutate AllocationRuntimeState, or
 *    emit Solver output.
 */

import type { ConflictResolutionStatus, SolverDiagnostic } from './contracts'
import type { AllocationRuntimeState } from './runtime'
import type { DetectedConflict, ConflictDetectionResult } from './conflict-detection'
import type { PlacementRuntimeState, ProvisionalPlacement } from './placement'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Conflict Resolution output
// ═══════════════════════════════════════════════════════════════════════════

export type ResolutionActionKind =
  | 'release_candidate'
  | 'release_slot'
  | 'mark_resolved'
  | 'mark_unresolved'

export interface ResolutionAction {
  readonly actionId: string
  readonly kind: ResolutionActionKind
  readonly conflictId: string
  readonly slotId: string | null
  readonly candidateCode: string | null
  readonly reason: string
}

export interface ResolvedConflict {
  readonly conflict: DetectedConflict
  readonly resolution: 'resolved'
  readonly actionIds: readonly string[]
  readonly reason: string
}

export interface UnresolvedConflict {
  readonly conflict: DetectedConflict
  readonly resolution: 'unresolved'
  readonly reason: string
}

export interface ConflictResolutionSummary {
  readonly totalConflictCount: number
  readonly resolvedConflictCount: number
  readonly unresolvedConflictCount: number
  readonly actionCount: number
  readonly candidateReleaseCount: number
  readonly slotReleaseCount: number
}

export interface ConflictResolutionResult {
  readonly resolvedConflicts: readonly ResolvedConflict[]
  readonly unresolvedConflicts: readonly UnresolvedConflict[]
  readonly resolutionActions: readonly ResolutionAction[]
  readonly resolutionDiagnostics: readonly SolverDiagnostic[]
  readonly resolutionSummary: ConflictResolutionSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function resolveDetectedConflicts(
  detectionResult: ConflictDetectionResult,
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState
): ConflictResolutionResult {
  assertCompatibleInputs(detectionResult, placementState, runtimeState)

  const placedBySlot = indexPlacedSlots(placementState.provisionalPlacements)
  const decisions = detectionResult.detectedConflicts
    .map((conflict) => decideConflict(conflict, placementState, runtimeState, placedBySlot))
    .sort(compareDecisions)

  const actions = uniqueActions(decisions.flatMap((decision) => decision.actions))
  const resolvedConflicts = decisions
    .filter((decision) => decision.resolution === 'resolved')
    .map((decision) => ({
      conflict: decision.conflict,
      resolution: 'resolved' as const,
      actionIds: decision.actions.map((action) => action.actionId).sort(compareStrings),
      reason: decision.reason,
    }))
  const unresolvedConflicts = decisions
    .filter((decision) => decision.resolution === 'unresolved')
    .map((decision) => ({
      conflict: decision.conflict,
      resolution: 'unresolved' as const,
      reason: decision.reason,
    }))

  const resolutionDiagnostics = diagnosticsFromDecisions(decisions)

  return {
    resolvedConflicts,
    unresolvedConflicts,
    resolutionActions: actions,
    resolutionDiagnostics,
    resolutionSummary: summarize(resolvedConflicts, unresolvedConflicts, actions),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only resolution helpers
// ═══════════════════════════════════════════════════════════════════════════

export function hasUnresolvedConflicts(result: ConflictResolutionResult): boolean {
  return result.resolutionSummary.unresolvedConflictCount > 0
}

export function actionsForConflict(
  result: ConflictResolutionResult,
  conflictId: string
): readonly ResolutionAction[] {
  return result.resolutionActions.filter((action) => action.conflictId === conflictId)
}

export function resolvedForCandidate(
  result: ConflictResolutionResult,
  candidateCode: string
): readonly ResolvedConflict[] {
  return result.resolvedConflicts.filter((entry) =>
    entry.conflict.candidateCode === candidateCode ||
    entry.conflict.participants.includes(candidateCode)
  )
}

export function unresolvedForSlot(
  result: ConflictResolutionResult,
  slotId: string
): readonly UnresolvedConflict[] {
  return result.unresolvedConflicts.filter((entry) => entry.conflict.slotId === slotId)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Resolution decisions
// ═══════════════════════════════════════════════════════════════════════════

interface ResolutionDecision {
  readonly conflict: DetectedConflict
  readonly resolution: ConflictResolutionStatus
  readonly actions: readonly ResolutionAction[]
  readonly reason: string
}

function decideConflict(
  conflict: DetectedConflict,
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState,
  placedBySlot: ReadonlyMap<string, ProvisionalPlacement>
): ResolutionDecision {
  if (conflict.type === 'soft') {
    return resolved(conflict, [
      action('mark_resolved', conflict, null, null, 'Soft conflict acknowledged as non-blocking.'),
    ], 'Soft conflict does not block provisional placement.')
  }

  if (conflict.type === 'mutual_exclusion' && conflict.constraint === 'duplicate_prevention:single_assignment') {
    return resolveDuplicateAssignment(conflict, placementState)
  }

  if (conflict.constraint === 'placement:eligibility') {
    return resolveBySlotRelease(
      conflict,
      placedBySlot,
      'Candidate is not eligible for this Slot; release the Slot for later handling.'
    )
  }

  if (conflict.constraint === 'placement:missing_candidate') {
    return resolveBySlotRelease(
      conflict,
      placedBySlot,
      'Placed Slot carries no Candidate; release the malformed Slot placement.'
    )
  }

  if (conflict.constraint === 'placement:unknown_candidate') {
    return resolveUnknownCandidate(conflict, placedBySlot, runtimeState)
  }

  if (conflict.constraint === 'placement:duplicate_slot') {
    return resolveBySlotRelease(
      conflict,
      placedBySlot,
      'Duplicate Slot placement cannot both stand; release the duplicate Slot placement.'
    )
  }

  return unresolved(
    conflict,
    'Conflict cannot be resolved by a deterministic release recommendation at this stage.'
  )
}

function resolveDuplicateAssignment(
  conflict: DetectedConflict,
  placementState: PlacementRuntimeState
): ResolutionDecision {
  if (conflict.candidateCode === null || conflict.slotId === null) {
    return unresolved(conflict, 'Duplicate-assignment conflict lacks a Candidate or Slot reference.')
  }

  const placements = placementState.provisionalPlacements
    .filter((placement) => placement.status === 'placed' && placement.candidateCode === conflict.candidateCode)
    .sort(comparePlacements)

  if (placements.length < 2) {
    return unresolved(conflict, 'Duplicate-assignment evidence no longer maps to multiple provisional placements.')
  }

  const retained = placements[0]!
  if (conflict.slotId === retained.slotId) {
    return resolved(conflict, [
      action(
        'mark_resolved',
        conflict,
        retained.slotId,
        conflict.candidateCode,
        `Candidate '${conflict.candidateCode}' remains provisionally placed in Slot '${retained.slotId}'.`
      ),
    ], `Retained deterministic lowest-order Slot '${retained.slotId}' for Candidate '${conflict.candidateCode}'.`)
  }

  return resolved(conflict, [
    action(
      'release_candidate',
      conflict,
      conflict.slotId,
      conflict.candidateCode,
      `Release Candidate '${conflict.candidateCode}' from Slot '${conflict.slotId}' to remove duplicate assignment.`
    ),
    action(
      'release_slot',
      conflict,
      conflict.slotId,
      conflict.candidateCode,
      `Release Slot '${conflict.slotId}' after duplicate Candidate '${conflict.candidateCode}' is removed.`
    ),
  ], `Released non-retained Slot '${conflict.slotId}' for Candidate '${conflict.candidateCode}'.`)
}

function resolveUnknownCandidate(
  conflict: DetectedConflict,
  placedBySlot: ReadonlyMap<string, ProvisionalPlacement>,
  runtimeState: AllocationRuntimeState
): ResolutionDecision {
  if (conflict.slotId !== null && placedBySlot.has(conflict.slotId)) {
    return resolveBySlotRelease(
      conflict,
      placedBySlot,
      'Unknown Candidate cannot be allocated; release the Slot placement.'
    )
  }
  if (conflict.candidateCode !== null && !runtimeState.candidatesByCode.has(conflict.candidateCode)) {
    return resolved(conflict, [
      action(
        'release_candidate',
        conflict,
        conflict.slotId,
        conflict.candidateCode,
        `Release unknown Candidate '${conflict.candidateCode}' from provisional consideration.`
      ),
    ], `Unknown Candidate '${conflict.candidateCode}' is removed from the provisional conflict surface.`)
  }
  return unresolved(conflict, 'Unknown Candidate conflict lacks a deterministic release target.')
}

function resolveBySlotRelease(
  conflict: DetectedConflict,
  placedBySlot: ReadonlyMap<string, ProvisionalPlacement>,
  reason: string
): ResolutionDecision {
  if (conflict.slotId === null || !placedBySlot.has(conflict.slotId)) {
    return unresolved(conflict, 'Slot release has no deterministic placed Slot target.')
  }
  return resolved(conflict, [
    action('release_slot', conflict, conflict.slotId, conflict.candidateCode, reason),
  ], reason)
}

function resolved(
  conflict: DetectedConflict,
  actions: readonly ResolutionAction[],
  reason: string
): ResolutionDecision {
  return { conflict, resolution: 'resolved', actions, reason }
}

function unresolved(conflict: DetectedConflict, reason: string): ResolutionDecision {
  return {
    conflict,
    resolution: 'unresolved',
    actions: [action('mark_unresolved', conflict, conflict.slotId, conflict.candidateCode, reason)],
    reason,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Diagnostics and summary
// ═══════════════════════════════════════════════════════════════════════════

function diagnosticsFromDecisions(
  decisions: readonly ResolutionDecision[]
): readonly SolverDiagnostic[] {
  return decisions
    .map((decision) => ({
      category: decision.resolution === 'resolved'
        ? 'runtime_inconsistency' as const
        : diagnosticCategoryFor(decision.conflict),
      severity: decision.resolution === 'resolved' ? 'Non-fatal' as const : 'Fatal' as const,
      stage: 'conflict_resolution' as const,
      slotId: decision.conflict.slotId,
      candidateCode: decision.conflict.candidateCode,
      componentId: null,
      explanation: decision.reason,
      recommendation: recommendationFor(decision),
    }))
    .sort(compareDiagnostics)
}

function summarize(
  resolvedConflicts: readonly ResolvedConflict[],
  unresolvedConflicts: readonly UnresolvedConflict[],
  actions: readonly ResolutionAction[]
): ConflictResolutionSummary {
  return {
    totalConflictCount: resolvedConflicts.length + unresolvedConflicts.length,
    resolvedConflictCount: resolvedConflicts.length,
    unresolvedConflictCount: unresolvedConflicts.length,
    actionCount: actions.length,
    candidateReleaseCount: actions.filter((action) => action.kind === 'release_candidate').length,
    slotReleaseCount: actions.filter((action) => action.kind === 'release_slot').length,
  }
}

function recommendationFor(decision: ResolutionDecision): string {
  if (decision.resolution === 'resolved') {
    return 'Apply the recommended release action in a later allocation-state stage.'
  }
  return 'Carry this unresolved conflict forward; no deterministic release action is sufficient here.'
}

function diagnosticCategoryFor(conflict: DetectedConflict): SolverDiagnostic['category'] {
  if (conflict.constraint.includes('blueprint_impossible')) return 'blueprint_impossible'
  if (conflict.constraint.includes('no_feasible_candidate') || conflict.type === 'dependency') return 'no_feasible_candidate'
  if (conflict.constraint.includes('duplicate') || conflict.type === 'mutual_exclusion') return 'duplicate_assignment'
  if (conflict.constraint.includes('unknown')) return 'invalid_runtime_state'
  return 'corrupted_allocation'
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Guards and deterministic utilities
// ═══════════════════════════════════════════════════════════════════════════

function assertCompatibleInputs(
  detectionResult: ConflictDetectionResult,
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState
): void {
  if (placementState.placementProgress.totalSlots !== runtimeState.slots.length) {
    throw new Error('Fatal Conflict Resolution error: placement totalSlots does not match AllocationRuntimeState')
  }
  if (detectionResult.conflictSummary.totalConflictCount !== detectionResult.detectedConflicts.length) {
    throw new Error('Fatal Conflict Resolution error: ConflictDetectionResult summary does not match detected conflicts')
  }
  if (detectionResult.conflictSummary.groupedConflictCount !== detectionResult.groupedConflicts.length) {
    throw new Error('Fatal Conflict Resolution error: ConflictDetectionResult summary does not match grouped conflicts')
  }
}

function indexPlacedSlots(
  placements: readonly ProvisionalPlacement[]
): ReadonlyMap<string, ProvisionalPlacement> {
  return new Map(
    placements
      .filter((placement) => placement.status === 'placed')
      .sort(comparePlacements)
      .map((placement) => [placement.slotId, placement])
  )
}

function action(
  kind: ResolutionActionKind,
  conflict: DetectedConflict,
  slotId: string | null,
  candidateCode: string | null,
  reason: string
): ResolutionAction {
  return {
    actionId: [kind, conflict.conflictId, slotId ?? 'run', candidateCode ?? 'none', reason].join('|'),
    kind,
    conflictId: conflict.conflictId,
    slotId,
    candidateCode,
    reason,
  }
}

function uniqueActions(actions: readonly ResolutionAction[]): readonly ResolutionAction[] {
  const seen = new Set<string>()
  const unique: ResolutionAction[] = []
  for (const item of [...actions].sort(compareActions)) {
    if (seen.has(item.actionId)) continue
    seen.add(item.actionId)
    unique.push(item)
  }
  return unique
}

function compareDecisions(a: ResolutionDecision, b: ResolutionDecision): number {
  return compareStrings(a.conflict.conflictId, b.conflict.conflictId)
}

function compareActions(a: ResolutionAction, b: ResolutionAction): number {
  return compareStrings(a.actionId, b.actionId)
}

function comparePlacements(a: ProvisionalPlacement, b: ProvisionalPlacement): number {
  return (
    compareStrings(a.slotId, b.slotId) ||
    compareNumbers(a.inheritedRank ?? Number.MAX_SAFE_INTEGER, b.inheritedRank ?? Number.MAX_SAFE_INTEGER) ||
    compareStrings(a.candidateCode ?? '', b.candidateCode ?? '')
  )
}

function compareDiagnostics(a: SolverDiagnostic, b: SolverDiagnostic): number {
  return (
    compareStrings(a.category, b.category) ||
    compareStrings(a.slotId ?? '', b.slotId ?? '') ||
    compareStrings(a.candidateCode ?? '', b.candidateCode ?? '') ||
    compareStrings(a.explanation, b.explanation)
  )
}

function compareNumbers(a: number, b: number): number {
  return a - b
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
