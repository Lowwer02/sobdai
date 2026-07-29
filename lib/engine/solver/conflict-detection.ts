/**
 * lib/engine/solver/conflict-detection.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.5 — Conflict Detection.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.1 / §3.2 Stage 5
 *     "Conflict Detection".
 *   - Allocation Runtime State from E-4C.1, BlueprintValidationResult from
 *     E-4C.3, and PlacementRuntimeState from E-4C.4.
 *
 * WHAT THIS MODULE IS.
 *  - A pure, deterministic, read-only detector for allocation conflicts already
 *    visible in provisional placement state and upstream validation results.
 *  - Classifies conflicts using the existing Solver / Allocation vocabulary.
 *  - Groups conflicts deterministically for later Conflict Resolution stages.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT resolve conflicts, replace Candidates, reserve Candidates, search,
 *    backtrack, modify placements, mutate Runtime State, or emit
 *    AllocatedCandidateSet.
 */

import type {
  ConflictResolutionStatus,
  ConflictScope,
  ConflictType,
  SolverDiagnostic,
  SolverDiagnosticCategory,
} from './contracts'
import type { AllocationRuntimeState, ConflictRuntimeEntry } from './runtime'
import type { BlueprintValidationResult } from './blueprint-validation'
import type { PlacementRuntimeState, ProvisionalPlacement } from './placement'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Conflict Detection output
// ═══════════════════════════════════════════════════════════════════════════

export type ConflictSource = 'validation' | 'placement' | 'runtime'

export interface DetectedConflict {
  readonly conflictId: string
  readonly source: ConflictSource
  readonly slotId: string | null
  readonly candidateCode: string | null
  readonly constraint: string
  readonly type: ConflictType
  readonly scope: ConflictScope
  readonly resolution: ConflictResolutionStatus
  readonly participants: readonly string[]
  readonly evidence: string
}

export interface ConflictGroup {
  readonly groupId: string
  readonly constraint: string
  readonly type: ConflictType
  readonly scope: ConflictScope
  readonly conflicts: readonly DetectedConflict[]
}

export interface ConflictSummary {
  readonly totalConflictCount: number
  readonly groupedConflictCount: number
  readonly hardConflictCount: number
  readonly softConflictCount: number
  readonly dependencyConflictCount: number
  readonly mutualExclusionConflictCount: number
  readonly unresolvedConflictCount: number
  readonly affectedSlotCount: number
  readonly affectedCandidateCount: number
}

export interface ConflictDetectionResult {
  readonly detectedConflicts: readonly DetectedConflict[]
  readonly groupedConflicts: readonly ConflictGroup[]
  readonly conflictDiagnostics: readonly SolverDiagnostic[]
  readonly conflictSummary: ConflictSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function detectAllocationConflicts(
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState,
  validationResult: BlueprintValidationResult
): ConflictDetectionResult {
  assertCompatibleInputs(placementState, runtimeState, validationResult)

  const conflicts = uniqueConflicts([
    ...conflictsFromValidation(validationResult),
    ...conflictsFromPlacementDiagnostics(placementState),
    ...conflictsFromProvisionalPlacements(placementState, runtimeState),
    ...conflictsFromRuntimeState(runtimeState),
    ...conflictsFromProgress(placementState),
  ])
  const groupedConflicts = groupConflicts(conflicts)
  const conflictDiagnostics = diagnosticsFromConflicts(conflicts)

  return {
    detectedConflicts: conflicts,
    groupedConflicts,
    conflictDiagnostics,
    conflictSummary: summarize(conflicts, groupedConflicts),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only conflict helpers
// ═══════════════════════════════════════════════════════════════════════════

export function hasDetectedConflicts(result: ConflictDetectionResult): boolean {
  return result.conflictSummary.totalConflictCount > 0
}

export function conflictsForSlot(
  result: ConflictDetectionResult,
  slotId: string
): readonly DetectedConflict[] {
  return result.detectedConflicts.filter((conflict) => conflict.slotId === slotId)
}

export function conflictsForCandidate(
  result: ConflictDetectionResult,
  candidateCode: string
): readonly DetectedConflict[] {
  return result.detectedConflicts.filter(
    (conflict) =>
      conflict.candidateCode === candidateCode ||
      conflict.participants.includes(candidateCode)
  )
}

export function conflictsForConstraint(
  result: ConflictDetectionResult,
  constraint: string
): readonly DetectedConflict[] {
  return result.detectedConflicts.filter((conflict) => conflict.constraint === constraint)
}

export function conflictGroupById(
  result: ConflictDetectionResult,
  groupId: string
): ConflictGroup | undefined {
  return result.groupedConflicts.find((group) => group.groupId === groupId)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Conflict collection
// ═══════════════════════════════════════════════════════════════════════════

function conflictsFromValidation(
  validationResult: BlueprintValidationResult
): readonly DetectedConflict[] {
  if (validationResult.status === 'valid' && validationResult.fatalDiagnostics.length === 0) {
    return []
  }
  return validationResult.fatalDiagnostics.map((diagnostic) =>
    conflict({
      source: 'validation',
      slotId: diagnostic.slotId,
      candidateCode: diagnostic.candidateCode,
      constraint: `validation:${diagnostic.category}`,
      type: 'hard',
      scope: 'within_run',
      participants: participants(diagnostic.candidateCode),
      evidence: diagnostic.explanation,
    })
  )
}

function conflictsFromPlacementDiagnostics(
  placementState: PlacementRuntimeState
): readonly DetectedConflict[] {
  return placementState.placementDiagnostics.map((diagnostic) =>
    conflict({
      source: 'placement',
      slotId: diagnostic.slotId,
      candidateCode: diagnostic.candidateCode,
      constraint: `placement:${diagnostic.category}`,
      type: typeForDiagnostic(diagnostic.category),
      scope: 'within_run',
      participants: participants(diagnostic.candidateCode),
      evidence: diagnostic.explanation,
    })
  )
}

function conflictsFromProvisionalPlacements(
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState
): readonly DetectedConflict[] {
  const conflicts: DetectedConflict[] = []
  const seenSlotIds = new Set<string>()
  const placedByCandidate = new Map<string, ProvisionalPlacement[]>()
  const runtimeCandidateCodes = new Set(runtimeState.candidates.map((candidate) => candidate.candidateCode))

  for (const placement of sortedPlacements(placementState.provisionalPlacements)) {
    if (seenSlotIds.has(placement.slotId)) {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode: placement.candidateCode,
          constraint: 'placement:duplicate_slot',
          type: 'hard',
          scope: 'within_run',
          participants: participants(placement.candidateCode),
          evidence: `Slot '${placement.slotId}' appears more than once in provisional placements.`,
        })
      )
    }
    seenSlotIds.add(placement.slotId)

    const slot = runtimeState.slotsById.get(placement.slotId)
    if (slot === undefined) {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode: placement.candidateCode,
          constraint: 'placement:unknown_slot',
          type: 'hard',
          scope: 'within_run',
          participants: participants(placement.candidateCode),
          evidence: `Provisional placement references unknown Slot '${placement.slotId}'.`,
        })
      )
    }

    if (placement.status === 'unplaced') {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode: placement.candidateCode,
          constraint: 'placement:unplaced_slot',
          type: 'dependency',
          scope: 'within_run',
          participants: participants(placement.candidateCode),
          evidence: `Slot '${placement.slotId}' has no provisional Candidate.`,
        })
      )
    }

    if (placement.status === 'placed' && placement.candidateCode === null) {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode: null,
          constraint: 'placement:missing_candidate',
          type: 'hard',
          scope: 'within_run',
          participants: [],
          evidence: `Slot '${placement.slotId}' is marked placed but carries no Candidate code.`,
        })
      )
      continue
    }

    if (placement.candidateCode === null) continue

    if (!runtimeCandidateCodes.has(placement.candidateCode)) {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode: placement.candidateCode,
          constraint: 'placement:unknown_candidate',
          type: 'hard',
          scope: 'within_run',
          participants: [placement.candidateCode],
          evidence: `Provisional placement references unknown Candidate '${placement.candidateCode}'.`,
        })
      )
    }

    if (slot !== undefined && !slot.candidateCodes.includes(placement.candidateCode)) {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode: placement.candidateCode,
          constraint: 'placement:eligibility',
          type: 'hard',
          scope: 'within_run',
          participants: [placement.candidateCode],
          evidence: `Candidate '${placement.candidateCode}' was not under consideration for Slot '${placement.slotId}'.`,
        })
      )
    }

    if (placement.status === 'placed') {
      const list = placedByCandidate.get(placement.candidateCode) ?? []
      list.push(placement)
      placedByCandidate.set(placement.candidateCode, list)
    }
  }

  for (const [candidateCode, placements] of [...placedByCandidate.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (placements.length < 2) continue
    const slotIds = placements.map((placement) => placement.slotId).sort(compareStrings)
    for (const placement of placements) {
      conflicts.push(
        conflict({
          source: 'placement',
          slotId: placement.slotId,
          candidateCode,
          constraint: 'duplicate_prevention:single_assignment',
          type: 'mutual_exclusion',
          scope: 'within_run',
          participants: [candidateCode, ...slotIds],
          evidence: `Candidate '${candidateCode}' is provisionally placed in multiple Slots: ${slotIds.join(', ')}.`,
        })
      )
    }
  }

  return conflicts
}

function conflictsFromRuntimeState(
  runtimeState: AllocationRuntimeState
): readonly DetectedConflict[] {
  const conflicts: DetectedConflict[] = []
  for (const slot of runtimeState.slots) {
    for (const entry of sortedRuntimeConflicts(slot.conflicts)) {
      conflicts.push(
        conflict({
          source: 'runtime',
          slotId: slot.slotId,
          candidateCode: entry.candidateCode,
          constraint: `runtime:${entry.constraint}`,
          type: entry.type,
          scope: entry.scope,
          participants: entry.participants,
          evidence: entry.evidence,
        })
      )
    }
  }
  return conflicts
}

function conflictsFromProgress(
  placementState: PlacementRuntimeState
): readonly DetectedConflict[] {
  const placedSlotCount = placementState.provisionalPlacements.filter((p) => p.status === 'placed').length
  const unplacedSlotCount = placementState.provisionalPlacements.filter((p) => p.status === 'unplaced').length
  const remainingSlotCount = placementState.remainingSlots.length
  const conflicts: DetectedConflict[] = []

  if (placementState.placementProgress.placedSlotCount !== placedSlotCount) {
    conflicts.push(
      conflict({
        source: 'placement',
        slotId: null,
        candidateCode: null,
        constraint: 'placement:progress_mismatch',
        type: 'hard',
        scope: 'within_run',
        participants: [],
        evidence: `Placement progress placedSlotCount=${placementState.placementProgress.placedSlotCount} does not match provisional placements (${placedSlotCount}).`,
      })
    )
  }
  if (placementState.placementProgress.unplacedSlotCount !== unplacedSlotCount) {
    conflicts.push(
      conflict({
        source: 'placement',
        slotId: null,
        candidateCode: null,
        constraint: 'placement:progress_mismatch',
        type: 'hard',
        scope: 'within_run',
        participants: [],
        evidence: `Placement progress unplacedSlotCount=${placementState.placementProgress.unplacedSlotCount} does not match provisional placements (${unplacedSlotCount}).`,
      })
    )
  }
  if (placementState.placementProgress.remainingSlotCount !== remainingSlotCount) {
    conflicts.push(
      conflict({
        source: 'placement',
        slotId: null,
        candidateCode: null,
        constraint: 'placement:progress_mismatch',
        type: 'hard',
        scope: 'within_run',
        participants: [],
        evidence: `Placement progress remainingSlotCount=${placementState.placementProgress.remainingSlotCount} does not match remainingSlots (${remainingSlotCount}).`,
      })
    )
  }
  return conflicts
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Grouping, diagnostics, and summary
// ═══════════════════════════════════════════════════════════════════════════

function groupConflicts(conflicts: readonly DetectedConflict[]): readonly ConflictGroup[] {
  const groups = new Map<string, DetectedConflict[]>()
  for (const conflict of conflicts) {
    const groupId = groupIdFor(conflict)
    const list = groups.get(groupId) ?? []
    list.push(conflict)
    groups.set(groupId, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([groupId, items]) => {
      const first = items[0]!
      return {
        groupId,
        constraint: first.constraint,
        type: first.type,
        scope: first.scope,
        conflicts: [...items].sort(compareConflicts),
      }
    })
}

function diagnosticsFromConflicts(
  conflicts: readonly DetectedConflict[]
): readonly SolverDiagnostic[] {
  const diagnostics = conflicts.map((conflict) => ({
    category: diagnosticCategoryFor(conflict),
    severity: conflict.type === 'soft' ? 'Non-fatal' as const : 'Fatal' as const,
    stage: 'conflict_detection' as const,
    slotId: conflict.slotId,
    candidateCode: conflict.candidateCode,
    componentId: null,
    explanation: conflict.evidence,
    recommendation: recommendationFor(conflict),
  }))
  return diagnostics.sort(compareDiagnostics)
}

function summarize(
  conflicts: readonly DetectedConflict[],
  groups: readonly ConflictGroup[]
): ConflictSummary {
  const affectedSlots = new Set(conflicts.map((c) => c.slotId).filter(isString))
  const affectedCandidates = new Set(
    conflicts
      .flatMap((c) => [c.candidateCode, ...c.participants])
      .filter(isCandidateCode)
  )
  return {
    totalConflictCount: conflicts.length,
    groupedConflictCount: groups.length,
    hardConflictCount: conflicts.filter((c) => c.type === 'hard').length,
    softConflictCount: conflicts.filter((c) => c.type === 'soft').length,
    dependencyConflictCount: conflicts.filter((c) => c.type === 'dependency').length,
    mutualExclusionConflictCount: conflicts.filter((c) => c.type === 'mutual_exclusion').length,
    unresolvedConflictCount: conflicts.filter((c) => c.resolution === 'unresolved').length,
    affectedSlotCount: affectedSlots.size,
    affectedCandidateCount: affectedCandidates.size,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Guards and small utilities
// ═══════════════════════════════════════════════════════════════════════════

function assertCompatibleInputs(
  placementState: PlacementRuntimeState,
  runtimeState: AllocationRuntimeState,
  validationResult: BlueprintValidationResult
): void {
  if (runtimeState.constraintSnapshot !== validationResult.constraintSnapshot) {
    throw new Error('Fatal Conflict Detection error: ConstraintSnapshot reference mismatch')
  }
  if (placementState.placementProgress.totalSlots !== runtimeState.slots.length) {
    throw new Error('Fatal Conflict Detection error: placement totalSlots does not match AllocationRuntimeState')
  }
}

function conflict(input: {
  readonly source: ConflictSource
  readonly slotId: string | null
  readonly candidateCode: string | null
  readonly constraint: string
  readonly type: ConflictType
  readonly scope: ConflictScope
  readonly participants: readonly string[]
  readonly evidence: string
}): DetectedConflict {
  const normalizedParticipants = [...uniqueStrings(input.participants)].sort(compareStrings)
  const id = [
    input.source,
    input.constraint,
    input.type,
    input.scope,
    input.slotId ?? 'run',
    input.candidateCode ?? 'none',
    normalizedParticipants.join('+'),
    input.evidence,
  ].join('|')
  return {
    conflictId: id,
    source: input.source,
    slotId: input.slotId,
    candidateCode: input.candidateCode,
    constraint: input.constraint,
    type: input.type,
    scope: input.scope,
    resolution: 'unresolved',
    participants: normalizedParticipants,
    evidence: input.evidence,
  }
}

function uniqueConflicts(conflicts: readonly DetectedConflict[]): readonly DetectedConflict[] {
  const seen = new Set<string>()
  const unique: DetectedConflict[] = []
  for (const item of [...conflicts].sort(compareConflicts)) {
    if (seen.has(item.conflictId)) continue
    seen.add(item.conflictId)
    unique.push(item)
  }
  return unique
}

function sortedPlacements(
  placements: readonly ProvisionalPlacement[]
): readonly ProvisionalPlacement[] {
  return [...placements].sort((a, b) =>
    compareStrings(a.slotId, b.slotId) ||
    compareStrings(a.candidateCode ?? '', b.candidateCode ?? '') ||
    compareStrings(a.status, b.status)
  )
}

function sortedRuntimeConflicts(
  conflicts: readonly ConflictRuntimeEntry[]
): readonly ConflictRuntimeEntry[] {
  return [...conflicts].sort((a, b) =>
    compareStrings(a.constraint, b.constraint) ||
    compareStrings(a.candidateCode, b.candidateCode) ||
    compareStrings(a.evidence, b.evidence)
  )
}

function typeForDiagnostic(category: SolverDiagnosticCategory): ConflictType {
  switch (category) {
    case 'no_feasible_candidate':
      return 'dependency'
    case 'duplicate_assignment':
      return 'mutual_exclusion'
    default:
      return 'hard'
  }
}

function diagnosticCategoryFor(conflict: DetectedConflict): SolverDiagnosticCategory {
  if (conflict.constraint.includes('blueprint_impossible')) return 'blueprint_impossible'
  if (conflict.constraint.includes('no_feasible_candidate')) return 'no_feasible_candidate'
  if (conflict.constraint.includes('duplicate') || conflict.type === 'mutual_exclusion') return 'duplicate_assignment'
  if (conflict.constraint.includes('unknown') || conflict.constraint.includes('progress_mismatch')) return 'invalid_runtime_state'
  return conflict.type === 'dependency' ? 'no_feasible_candidate' : 'corrupted_allocation'
}

function recommendationFor(conflict: DetectedConflict): string {
  switch (diagnosticCategoryFor(conflict)) {
    case 'blueprint_impossible':
      return 'Stop before placement-dependent solving and repair the Blueprint validation failure.'
    case 'no_feasible_candidate':
      return 'Carry this unresolved conflict to Conflict Resolution; do not finalize this Slot as allocated.'
    case 'duplicate_assignment':
      return 'Carry the duplicate Candidate conflict to Conflict Resolution; do not silently choose a replacement.'
    case 'invalid_runtime_state':
      return 'Reject the malformed placement/runtime snapshot before attempting conflict resolution.'
    default:
      return 'Carry this unresolved conflict forward without resolving it in Conflict Detection.'
  }
}

function groupIdFor(conflict: DetectedConflict): string {
  return `${conflict.type}|${conflict.scope}|${conflict.constraint}`
}

function compareConflicts(a: DetectedConflict, b: DetectedConflict): number {
  return compareStrings(a.conflictId, b.conflictId)
}

function compareDiagnostics(a: SolverDiagnostic, b: SolverDiagnostic): number {
  return (
    compareStrings(a.category, b.category) ||
    compareStrings(a.slotId ?? '', b.slotId ?? '') ||
    compareStrings(a.candidateCode ?? '', b.candidateCode ?? '') ||
    compareStrings(a.explanation, b.explanation)
  )
}

function participants(code: string | null): readonly string[] {
  return code === null ? [] : [code]
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function isString(value: string | null): value is string {
  return value !== null
}

function isCandidateCode(value: string | null): value is string {
  return typeof value === 'string' && value.startsWith('Q-')
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
