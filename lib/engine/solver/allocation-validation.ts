/**
 * lib/engine/solver/allocation-validation.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.7 — Allocation Validation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.1 / §3.2 Stage 7
 *     "Allocation Validation".
 *   - ConflictResolutionResult from E-4C.6, PlacementRuntimeState from E-4C.4,
 *     and AllocationRuntimeState from E-4C.1.
 *
 * WHAT THIS MODULE IS.
 *  - A pure, deterministic, read-only validator for the provisional allocation
 *    after Conflict Resolution has produced release recommendations.
 *  - Validates internal consistency only: references, duplicate occupancy,
 *    inherited eligibility, unresolved conflicts, and action/result coherence.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT perform placement, resolve conflicts, search, backtrack, replace
 *    Candidates, reserve Candidates, mutate state, finalize allocation, or emit
 *    Solver output.
 */

import type { SolverDiagnostic, SolverDiagnosticCategory } from './contracts'
import type { AllocationRuntimeState } from './runtime'
import type { PlacementRuntimeState, ProvisionalPlacement } from './placement'
import type {
  ConflictResolutionResult,
  ResolutionAction,
  ResolvedConflict,
  UnresolvedConflict,
} from './conflict-resolution'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Allocation Validation output
// ═══════════════════════════════════════════════════════════════════════════

export type AllocationValidationStatus = 'valid' | 'invalid'

export interface AllocationValidationSummary {
  readonly totalSlotCount: number
  readonly provisionalPlacementCount: number
  readonly effectivePlacementCount: number
  readonly releasedSlotCount: number
  readonly releasedCandidateCount: number
  readonly unresolvedConflictCount: number
  readonly fatalDiagnosticCount: number
  readonly nonFatalDiagnosticCount: number
}

export interface AllocationValidationResult {
  readonly validationResult: AllocationValidationStatus
  readonly validationDiagnostics: readonly SolverDiagnostic[]
  readonly validationSummary: AllocationValidationSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function validateResolvedAllocation(
  resolutionResult: ConflictResolutionResult,
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState
): AllocationValidationResult {
  assertCompatibleInputs(resolutionResult, placementState, runtimeState)

  const releasePlan = buildReleasePlan(resolutionResult.resolutionActions)
  const effectivePlacements = effectivePlacedPlacements(placementState.provisionalPlacements, releasePlan)
  const diagnostics = [
    ...diagnosticsFromResolutionResult(resolutionResult),
    ...diagnosticsFromActions(resolutionResult, runtimeState),
    ...diagnosticsFromEffectivePlacements(effectivePlacements, runtimeState),
    ...diagnosticsFromPlacementProgress(placementState),
  ].sort(compareDiagnostics)
  const fatalDiagnosticCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'Fatal').length

  return {
    validationResult: fatalDiagnosticCount === 0 ? 'valid' : 'invalid',
    validationDiagnostics: diagnostics,
    validationSummary: {
      totalSlotCount: runtimeState.slots.length,
      provisionalPlacementCount: placementState.provisionalPlacements.length,
      effectivePlacementCount: effectivePlacements.length,
      releasedSlotCount: releasePlan.slotIds.size,
      releasedCandidateCount: releasePlan.candidateCodes.size,
      unresolvedConflictCount: resolutionResult.unresolvedConflicts.length,
      fatalDiagnosticCount,
      nonFatalDiagnosticCount: diagnostics.length - fatalDiagnosticCount,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only validation helpers
// ═══════════════════════════════════════════════════════════════════════════

export function isAllocationValid(result: AllocationValidationResult): boolean {
  return result.validationResult === 'valid'
}

export function hasFatalAllocationDiagnostics(result: AllocationValidationResult): boolean {
  return result.validationSummary.fatalDiagnosticCount > 0
}

export function validationDiagnosticsForSlot(
  result: AllocationValidationResult,
  slotId: string
): readonly SolverDiagnostic[] {
  return result.validationDiagnostics.filter((diagnostic) => diagnostic.slotId === slotId)
}

export function validationDiagnosticsForCandidate(
  result: AllocationValidationResult,
  candidateCode: string
): readonly SolverDiagnostic[] {
  return result.validationDiagnostics.filter((diagnostic) => diagnostic.candidateCode === candidateCode)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Validation checks
// ═══════════════════════════════════════════════════════════════════════════

interface ReleasePlan {
  readonly slotIds: ReadonlySet<string>
  readonly candidateCodes: ReadonlySet<string>
  readonly candidatePlacementKeys: ReadonlySet<string>
  readonly actionIds: ReadonlySet<string>
}

function diagnosticsFromResolutionResult(
  resolutionResult: ConflictResolutionResult
): readonly SolverDiagnostic[] {
  const diagnostics: SolverDiagnostic[] = []
  for (const unresolved of sortedUnresolved(resolutionResult.unresolvedConflicts)) {
    diagnostics.push(
      diagnostic(
        diagnosticCategoryForUnresolved(unresolved),
        'Fatal',
        unresolved.conflict.slotId,
        unresolved.conflict.candidateCode,
        `Unresolved conflict remains after Conflict Resolution: ${unresolved.reason}`,
        'Do not validate the allocation as internally consistent until this conflict is resolved or explicitly carried as a shortfall.'
      )
    )
  }

  const actionIds = new Set(resolutionResult.resolutionActions.map((action) => action.actionId))
  for (const resolved of sortedResolved(resolutionResult.resolvedConflicts)) {
    for (const actionId of resolved.actionIds) {
      if (actionIds.has(actionId)) continue
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          'Fatal',
          resolved.conflict.slotId,
          resolved.conflict.candidateCode,
          `Resolved conflict references missing resolution action '${actionId}'.`,
          'Rebuild the ConflictResolutionResult so every resolved conflict references emitted actions.'
        )
      )
    }
  }
  return diagnostics
}

function diagnosticsFromActions(
  resolutionResult: ConflictResolutionResult,
  runtimeState: AllocationRuntimeState
): readonly SolverDiagnostic[] {
  const diagnostics: SolverDiagnostic[] = []
  const conflictIds = new Set([
    ...resolutionResult.resolvedConflicts.map((entry) => entry.conflict.conflictId),
    ...resolutionResult.unresolvedConflicts.map((entry) => entry.conflict.conflictId),
  ])
  const seenActionIds = new Set<string>()

  for (const action of sortedActions(resolutionResult.resolutionActions)) {
    if (seenActionIds.has(action.actionId)) {
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          'Fatal',
          action.slotId,
          action.candidateCode,
          `Duplicate resolution action id '${action.actionId}'.`,
          'Deduplicate resolution actions before allocation validation.'
        )
      )
    }
    seenActionIds.add(action.actionId)

    if (!conflictIds.has(action.conflictId)) {
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          'Fatal',
          action.slotId,
          action.candidateCode,
          `Resolution action '${action.actionId}' references unknown conflict '${action.conflictId}'.`,
          'Emit actions only for conflicts carried by the ConflictResolutionResult.'
        )
      )
    }

    if (action.slotId !== null && !runtimeState.slotsById.has(action.slotId)) {
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          'Fatal',
          action.slotId,
          action.candidateCode,
          `Resolution action '${action.actionId}' references unknown Slot '${action.slotId}'.`,
          'Use only Slot ids present in AllocationRuntimeState.'
        )
      )
    }

    if (action.candidateCode !== null && !runtimeState.candidatesByCode.has(action.candidateCode)) {
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          action.kind === 'release_candidate' ? 'Non-fatal' : 'Fatal',
          action.slotId,
          action.candidateCode,
          `Resolution action '${action.actionId}' references Candidate '${action.candidateCode}' not present in AllocationRuntimeState.`,
          'Unknown Candidate release recommendations may be carried, but non-release actions must target runtime Candidates.'
        )
      )
    }
  }
  return diagnostics
}

function diagnosticsFromEffectivePlacements(
  placements: readonly ProvisionalPlacement[],
  runtimeState: AllocationRuntimeState
): readonly SolverDiagnostic[] {
  const diagnostics: SolverDiagnostic[] = []
  const bySlot = new Map<string, ProvisionalPlacement[]>()
  const byCandidate = new Map<string, ProvisionalPlacement[]>()

  for (const placement of sortedPlacements(placements)) {
    if (placement.candidateCode === null) {
      diagnostics.push(
        diagnostic(
          'corrupted_allocation',
          'Fatal',
          placement.slotId,
          null,
          `Effective placement for Slot '${placement.slotId}' has no Candidate code.`,
          'Release or reject this Slot before allocation validation can pass.'
        )
      )
      continue
    }

    const slot = runtimeState.slotsById.get(placement.slotId)
    if (slot === undefined) {
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          'Fatal',
          placement.slotId,
          placement.candidateCode,
          `Effective placement references unknown Slot '${placement.slotId}'.`,
          'Use only Slots initialized in AllocationRuntimeState.'
        )
      )
    } else if (!slot.candidateCodes.includes(placement.candidateCode)) {
      diagnostics.push(
        diagnostic(
          'corrupted_allocation',
          'Fatal',
          placement.slotId,
          placement.candidateCode,
          `Candidate '${placement.candidateCode}' is not eligible for effective Slot '${placement.slotId}'.`,
          'Release the invalid Slot placement before allocation validation can pass.'
        )
      )
    }

    if (!runtimeState.candidatesByCode.has(placement.candidateCode)) {
      diagnostics.push(
        diagnostic(
          'invalid_runtime_state',
          'Fatal',
          placement.slotId,
          placement.candidateCode,
          `Effective placement references unknown Candidate '${placement.candidateCode}'.`,
          'Use only Candidates initialized in AllocationRuntimeState.'
        )
      )
    }

    const slotList = bySlot.get(placement.slotId) ?? []
    slotList.push(placement)
    bySlot.set(placement.slotId, slotList)

    const candidateList = byCandidate.get(placement.candidateCode) ?? []
    candidateList.push(placement)
    byCandidate.set(placement.candidateCode, candidateList)
  }

  for (const [slotId, slotPlacements] of [...bySlot.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (slotPlacements.length < 2) continue
    diagnostics.push(
      diagnostic(
        'corrupted_allocation',
        'Fatal',
        slotId,
        null,
        `Effective allocation gives Slot '${slotId}' ${slotPlacements.length} provisional Candidates.`,
        'Release duplicate Slot placements before allocation validation can pass.'
      )
    )
  }

  for (const [candidateCode, candidatePlacements] of [...byCandidate.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (candidatePlacements.length < 2) continue
    diagnostics.push(
      diagnostic(
        'duplicate_assignment',
        'Fatal',
        candidatePlacements[0]!.slotId,
        candidateCode,
        `Effective allocation places Candidate '${candidateCode}' in multiple Slots: ${candidatePlacements.map((p) => p.slotId).sort(compareStrings).join(', ')}.`,
        'Release duplicate Candidate placements before allocation validation can pass.'
      )
    )
  }

  return diagnostics
}

function diagnosticsFromPlacementProgress(
  placementState: PlacementRuntimeState
): readonly SolverDiagnostic[] {
  const placedCount = placementState.provisionalPlacements.filter((placement) => placement.status === 'placed').length
  const unplacedCount = placementState.provisionalPlacements.filter((placement) => placement.status === 'unplaced').length
  const diagnostics: SolverDiagnostic[] = []

  if (placementState.placementProgress.placedSlotCount !== placedCount) {
    diagnostics.push(
      diagnostic(
        'invalid_runtime_state',
        'Fatal',
        null,
        null,
        `Placement progress placedSlotCount=${placementState.placementProgress.placedSlotCount} does not match provisional placements (${placedCount}).`,
        'Rebuild PlacementRuntimeState progress before allocation validation.'
      )
    )
  }
  if (placementState.placementProgress.unplacedSlotCount !== unplacedCount) {
    diagnostics.push(
      diagnostic(
        'invalid_runtime_state',
        'Fatal',
        null,
        null,
        `Placement progress unplacedSlotCount=${placementState.placementProgress.unplacedSlotCount} does not match provisional placements (${unplacedCount}).`,
        'Rebuild PlacementRuntimeState progress before allocation validation.'
      )
    )
  }
  if (placementState.placementProgress.remainingSlotCount !== placementState.remainingSlots.length) {
    diagnostics.push(
      diagnostic(
        'invalid_runtime_state',
        'Fatal',
        null,
        null,
        `Placement progress remainingSlotCount=${placementState.placementProgress.remainingSlotCount} does not match remainingSlots (${placementState.remainingSlots.length}).`,
        'Rebuild PlacementRuntimeState progress before allocation validation.'
      )
    )
  }

  return diagnostics
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Effective allocation projection
// ═══════════════════════════════════════════════════════════════════════════

function buildReleasePlan(actions: readonly ResolutionAction[]): ReleasePlan {
  return {
    slotIds: new Set(
      actions
        .filter((action) => action.kind === 'release_slot' && action.slotId !== null)
        .map((action) => action.slotId as string)
    ),
    candidateCodes: new Set(
      actions
        .filter((action) => action.kind === 'release_candidate' && action.candidateCode !== null)
        .map((action) => action.candidateCode as string)
    ),
    candidatePlacementKeys: new Set(
      actions
        .filter((action) => action.kind === 'release_candidate' && action.candidateCode !== null)
        .map((action) => candidatePlacementKey(action.slotId, action.candidateCode as string))
    ),
    actionIds: new Set(actions.map((action) => action.actionId)),
  }
}

function effectivePlacedPlacements(
  placements: readonly ProvisionalPlacement[],
  releasePlan: ReleasePlan
): readonly ProvisionalPlacement[] {
  return sortedPlacements(placements).filter(
    (placement) =>
      placement.status === 'placed' &&
      !releasePlan.slotIds.has(placement.slotId) &&
      (placement.candidateCode === null ||
        !releasePlan.candidatePlacementKeys.has(candidatePlacementKey(placement.slotId, placement.candidateCode)))
  )
}

function candidatePlacementKey(slotId: string | null, candidateCode: string): string {
  return `${slotId ?? 'run'}|${candidateCode}`
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Guards and deterministic utilities
// ═══════════════════════════════════════════════════════════════════════════

function assertCompatibleInputs(
  resolutionResult: ConflictResolutionResult,
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState
): void {
  if (placementState.placementProgress.totalSlots !== runtimeState.slots.length) {
    throw new Error('Fatal Allocation Validation error: placement totalSlots does not match AllocationRuntimeState')
  }
  const totalConflicts =
    resolutionResult.resolvedConflicts.length + resolutionResult.unresolvedConflicts.length
  if (resolutionResult.resolutionSummary.totalConflictCount !== totalConflicts) {
    throw new Error('Fatal Allocation Validation error: resolution summary does not match conflict counts')
  }
  if (resolutionResult.resolutionSummary.actionCount !== resolutionResult.resolutionActions.length) {
    throw new Error('Fatal Allocation Validation error: resolution summary does not match action count')
  }
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
    stage: 'allocation_validation',
    slotId,
    candidateCode,
    componentId: null,
    explanation,
    recommendation,
  }
}

function diagnosticCategoryForUnresolved(entry: UnresolvedConflict): SolverDiagnosticCategory {
  if (entry.conflict.constraint.includes('blueprint_impossible')) return 'blueprint_impossible'
  if (entry.conflict.type === 'dependency') return 'no_feasible_candidate'
  if (entry.conflict.type === 'mutual_exclusion') return 'duplicate_assignment'
  if (entry.conflict.constraint.includes('unknown')) return 'invalid_runtime_state'
  return 'corrupted_allocation'
}

function sortedActions(actions: readonly ResolutionAction[]): readonly ResolutionAction[] {
  return [...actions].sort((a, b) => compareStrings(a.actionId, b.actionId))
}

function sortedResolved(entries: readonly ResolvedConflict[]): readonly ResolvedConflict[] {
  return [...entries].sort((a, b) => compareStrings(a.conflict.conflictId, b.conflict.conflictId))
}

function sortedUnresolved(entries: readonly UnresolvedConflict[]): readonly UnresolvedConflict[] {
  return [...entries].sort((a, b) => compareStrings(a.conflict.conflictId, b.conflict.conflictId))
}

function sortedPlacements(placements: readonly ProvisionalPlacement[]): readonly ProvisionalPlacement[] {
  return [...placements].sort((a, b) =>
    compareStrings(a.slotId, b.slotId) ||
    compareStrings(a.candidateCode ?? '', b.candidateCode ?? '') ||
    compareStrings(a.status, b.status)
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

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
