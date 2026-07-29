/**
 * lib/engine/solver/conflict-detection.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.5 — Conflict Detection tests.
 *
 * RUN: npx jiti lib/engine/solver/conflict-detection.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import type {
  ComponentContribution,
  CompositeScore,
  RawSignal,
  ScoreComponent,
  ScoringConfidence,
} from '../scoring/contracts'
import type { RankedCandidate, RankedCandidateSet, RankedSlot } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { stableStringify } from '../shared/testing/determinism'
import { initializeAllocationRuntime, type AllocationRuntimeState } from './runtime'
import { validateBlueprintConstraints, type BlueprintValidationResult } from './blueprint-validation'
import { initializeCandidatePlacement, type PlacementRuntimeState } from './placement'
import {
  conflictGroupById,
  conflictsForCandidate,
  conflictsForConstraint,
  conflictsForSlot,
  detectAllocationConflicts,
  hasDetectedConflicts,
  type ConflictDetectionResult,
} from './conflict-detection'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Fixtures ───────────────────────────────────────────────────────────────

function slot(setNumber: 1 | 2 | 3 | 4 | 5, id: string): { slotId: string; slot: BlueprintSlot } {
  return {
    slotId: id,
    slot: {
      setNumber,
      difficulty: 'Easy',
      blueprintType: 'Memory',
      pattern: 'Positive',
      document: 'LAW-ACT-HED-2562',
      learningObjective: 'LO1',
    },
  }
}

function signal(code: string): RawSignal {
  return {
    questionCode: code,
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
  }
}

function confidence(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function component(code: string, s: BlueprintSlot): ScoreComponent {
  return {
    componentId: 'difficulty_fit',
    questionCode: code,
    slot: s,
    normalized: { value: 0.9, scale: 'exact-match' },
    inputs: [signal(code)],
    reasoning: 'Difficulty matches.',
    confidence: confidence(),
    penalties: [],
  }
}

function composite(code: string, s: BlueprintSlot, value = 0.9): CompositeScore {
  const c = component(code, s)
  const contribution: ComponentContribution = {
    component: c,
    contribution: value,
    reason: 'Fixture contribution.',
  }
  return {
    questionCode: code,
    slot: s,
    value,
    breakdown: { contributions: [contribution], aggregationNote: 'fixture' },
    confidence: c.confidence,
    penalties: [],
  }
}

function ranked(code: string, rank: number, s: BlueprintSlot): RankedCandidate {
  const comp = composite(code, s, 1 - rank / 100)
  const signals = [signal(code)]
  return {
    code,
    rank,
    tieGroupId: null,
    composite: comp,
    confidence: comp.confidence,
    penalties: [],
    signals,
    orderingReason: {
      summary: 'Fixture ordering.',
      determiningFacets: ['composite.value'],
      neighborComparison: null,
      tieStatus: { tieGroupId: null, memberCodes: [], tieBreaker: null },
    },
    auditTrail: {
      candidateCode: code,
      signals,
      componentIds: ['difficulty_fit'],
      composite: comp,
      confidence: comp.confidence,
      penalties: [],
      rank,
    },
  }
}

function candidate(code: string): Candidate {
  return {
    identity: { questionCode: code, questionId: code },
    metadata: {
      document: 'LAW-ACT-HED-2562',
      difficulty: 'Easy',
      topic: 'topic',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'section',
      tags: [],
      category: null,
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document', 'coverage', 'difficulty', 'pattern', 'learning_objective'],
      eligibleSlots: [],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'fixture' },
    },
  }
}

function candidateSet(codes: readonly string[]): CandidateSet {
  const constraintSnapshot = buildConstraintSnapshot()
  return {
    identity: { assemblyRequestId: 'assembly-conflict-detection', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: codes.map(candidate),
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot,
    warnings: [],
    statistics: {
      totalCandidates: codes.length,
      fullConfidenceCount: codes.length,
      reducedConfidenceCount: 0,
      incompleteAxesCount: 0,
      distinctDocuments: 1,
      distinctDifficulties: 1,
      distinctPatterns: 1,
      distinctLearningObjectives: 1,
      shortfallCount: 0,
    },
    exclusionsLog: [],
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
}

function rankedSlot(slotId: string, s: BlueprintSlot, codes: readonly string[]): RankedSlot {
  return {
    slotId,
    slot: s,
    rankedCandidates: codes.map((code, index) => ranked(code, index + 1, s)),
    slotSummary: {
      tieGroups: [],
      topOfSlotRationale: 'Fixture top-of-slot rationale.',
      orderingKey: { facets: ['composite.value'], description: 'Fixture ordering key.' },
    },
  }
}

function rankedCandidateSet(slots: readonly RankedSlot[], codes: readonly string[]): RankedCandidateSet {
  const cs = candidateSet(codes)
  return {
    identity: {
      candidateSetId: cs.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet: cs,
    slots,
    shortfallReport: cs.shortfallReport,
    coverageSatisfaction: cs.coverageSatisfaction,
    constraintSnapshot: cs.constraintSnapshot,
    warnings: cs.warnings,
    meta: { specVersion: '1.0', rankingVersion: '1.0.0', scoringModelVersion: '1.0' },
  }
}

function inputs(rcs: RankedCandidateSet): {
  readonly runtimeState: AllocationRuntimeState
  readonly validation: BlueprintValidationResult
  readonly placement: PlacementRuntimeState
} {
  const runtimeState = initializeAllocationRuntime(rcs)
  const validation = validateBlueprintConstraints(runtimeState)
  return {
    runtimeState,
    validation,
    placement: initializeCandidatePlacement(runtimeState, validation, rcs),
  }
}

function detect(rcs: RankedCandidateSet): ConflictDetectionResult {
  const i = inputs(rcs)
  return detectAllocationConflicts(i.placement, i.runtimeState, i.validation)
}

function withPlacement(
  state: PlacementRuntimeState,
  overrides: Partial<PlacementRuntimeState>
): PlacementRuntimeState {
  return { ...state, ...overrides }
}

// ═══ Detection behavior ═════════════════════════════════════════════════════

function clean_placement_has_no_conflicts(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = detect(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  ))
  assert.equal(hasDetectedConflicts(result), false)
  assert.deepEqual(result.conflictSummary, {
    totalConflictCount: 0,
    groupedConflictCount: 0,
    hardConflictCount: 0,
    softConflictCount: 0,
    dependencyConflictCount: 0,
    mutualExclusionConflictCount: 0,
    unresolvedConflictCount: 0,
    affectedSlotCount: 0,
    affectedCandidateCount: 0,
  })
}

function unplaced_slot_is_detected_as_dependency_conflict(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = detect(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  ))
  assert.equal(result.conflictSummary.dependencyConflictCount, 2)
  assert.ok(conflictsForSlot(result, 'slot-b').some((c) => c.constraint === 'placement:unplaced_slot'))
  assert.ok(conflictsForConstraint(result, 'placement:no_feasible_candidate').length > 0)
  assert.ok(result.conflictDiagnostics.some((d) => d.category === 'no_feasible_candidate'))
}

function duplicate_candidate_use_is_grouped_without_resolution(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  )
  const i = inputs(rcs)
  const badPlacement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingCandidates: ['Q-000002'],
  })
  const result = detectAllocationConflicts(badPlacement, i.runtimeState, i.validation)
  const group = conflictGroupById(result, 'mutual_exclusion|within_run|duplicate_prevention:single_assignment')
  assert.equal(result.conflictSummary.mutualExclusionConflictCount, 2)
  assert.equal(group?.conflicts.length, 2)
  assert.ok(conflictsForCandidate(result, 'Q-000001').length >= 2)
  assert.ok(result.detectedConflicts.every((c) => c.resolution === 'unresolved'))
}

function ineligible_candidate_is_detected_as_hard_conflict(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  )
  const i = inputs(rcs)
  const badPlacement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000002', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: null, inheritedRank: null, status: 'unplaced', reason: 'fixture' },
    ],
    remainingSlots: ['slot-b'],
    placementProgress: {
      totalSlots: 2,
      placedSlotCount: 1,
      unplacedSlotCount: 1,
      remainingCandidateCount: 1,
      remainingSlotCount: 1,
    },
  })
  const result = detectAllocationConflicts(badPlacement, i.runtimeState, i.validation)
  assert.ok(result.detectedConflicts.some((c) => c.constraint === 'placement:eligibility'))
  assert.ok(result.conflictDiagnostics.some((d) => d.category === 'corrupted_allocation'))
}

function unknown_slot_and_candidate_are_detected(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const badPlacement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-z', candidateCode: 'Q-999999', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    placementProgress: {
      totalSlots: 1,
      placedSlotCount: 1,
      unplacedSlotCount: 0,
      remainingCandidateCount: 0,
      remainingSlotCount: 0,
    },
  })
  const result = detectAllocationConflicts(badPlacement, i.runtimeState, i.validation)
  assert.ok(result.detectedConflicts.some((c) => c.constraint === 'placement:unknown_slot'))
  assert.ok(result.detectedConflicts.some((c) => c.constraint === 'placement:unknown_candidate'))
  assert.equal(result.conflictSummary.hardConflictCount, 2)
}

function invalid_blueprint_validation_is_carried_as_conflict(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const validation: BlueprintValidationResult = {
    status: 'invalid',
    fatalDiagnostics: [
      {
        category: 'blueprint_impossible',
        severity: 'Fatal',
        stage: 'validate_constraints',
        slotId: null,
        candidateCode: null,
        componentId: null,
        explanation: 'Fixture Blueprint is impossible.',
        recommendation: 'Fix fixture.',
      },
    ],
    warnings: [],
    constraintSnapshot: i.runtimeState.constraintSnapshot,
  }
  const result = detectAllocationConflicts(i.placement, i.runtimeState, validation)
  assert.ok(result.detectedConflicts.some((c) => c.constraint === 'validation:blueprint_impossible'))
  assert.ok(result.conflictDiagnostics.some((d) => d.category === 'blueprint_impossible'))
}

function runtime_recorded_conflicts_are_carried_forward_read_only(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const slots = i.runtimeState.slots.map((runtimeSlot) =>
    runtimeSlot.slotId === 'slot-a'
      ? {
          ...runtimeSlot,
          conflicts: [
            {
              candidateCode: 'Q-000001',
              constraint: 'fixture_runtime_conflict',
              type: 'hard' as const,
              scope: 'within_run' as const,
              resolution: 'unresolved' as const,
              participants: ['Q-000001'],
              evidence: 'Fixture runtime conflict.',
            },
          ],
        }
      : runtimeSlot
  )
  const runtimeState: AllocationRuntimeState = {
    ...i.runtimeState,
    slots,
    slotsById: new Map(slots.map((runtimeSlot) => [runtimeSlot.slotId, runtimeSlot])),
  }
  const result = detectAllocationConflicts(i.placement, runtimeState, i.validation)
  assert.ok(result.detectedConflicts.some((c) => c.constraint === 'runtime:fixture_runtime_conflict'))
}

function progress_mismatch_is_detected_as_invalid_runtime_state(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const badPlacement = withPlacement(i.placement, {
    placementProgress: {
      ...i.placement.placementProgress,
      placedSlotCount: 99,
    },
  })
  const result = detectAllocationConflicts(badPlacement, i.runtimeState, i.validation)
  assert.ok(result.detectedConflicts.some((c) => c.constraint === 'placement:progress_mismatch'))
  assert.ok(result.conflictDiagnostics.some((d) => d.category === 'invalid_runtime_state'))
}

function output_contains_only_stage_five_fields(): void {
  const a = slot(1, 'slot-a')
  const result = detect(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  assert.deepEqual(Object.keys(result).sort(), [
    'conflictDiagnostics',
    'conflictSummary',
    'detectedConflicts',
    'groupedConflicts',
  ])
}

// ═══ Compatibility, determinism, immutability ═══════════════════════════════

function rejects_snapshot_reference_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const validation: BlueprintValidationResult = {
    ...i.validation,
    constraintSnapshot: buildConstraintSnapshot(),
  }
  assert.throws(
    () => detectAllocationConflicts(i.placement, i.runtimeState, validation),
    /ConstraintSnapshot reference mismatch/
  )
}

function rejects_total_slot_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const badPlacement = withPlacement(i.placement, {
    placementProgress: { ...i.placement.placementProgress, totalSlots: 2 },
  })
  assert.throws(
    () => detectAllocationConflicts(badPlacement, i.runtimeState, i.validation),
    /totalSlots does not match/
  )
}

function deterministic_same_input_same_output(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
    ],
    ['Q-000001']
  )
  assert.equal(stableStringify(detect(rcs)), stableStringify(detect(rcs)))
}

function does_not_mutate_inputs(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  )
  const i = inputs(rcs)
  const beforePlacement = stableStringify(i.placement)
  const beforeRuntime = stableStringify(i.runtimeState)
  const beforeValidation = stableStringify(i.validation)
  detectAllocationConflicts(i.placement, i.runtimeState, i.validation)
  assert.equal(stableStringify(i.placement), beforePlacement)
  assert.equal(stableStringify(i.runtimeState), beforeRuntime)
  assert.equal(stableStringify(i.validation), beforeValidation)
}

function read_only_helpers_return_expected_views(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  )
  const i = inputs(rcs)
  const badPlacement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingCandidates: ['Q-000002'],
  })
  const result = detectAllocationConflicts(badPlacement, i.runtimeState, i.validation)
  assert.equal(conflictsForSlot(result, 'slot-b').length > 0, true)
  assert.equal(conflictsForCandidate(result, 'Q-000001').length > 0, true)
  assert.equal(conflictsForConstraint(result, 'duplicate_prevention:single_assignment').length, 2)
  assert.equal(conflictGroupById(result, 'mutual_exclusion|within_run|duplicate_prevention:single_assignment')?.conflicts.length, 2)
}

// ═══ Source boundaries ══════════════════════════════════════════════════════

function source_has_no_forbidden_dependencies_or_hidden_state(): void {
  const source = readFileSync(path.join(__dirname, 'conflict-detection.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/^let\s+/m.test(source))
  assert.ok(!/^var\s+/m.test(source))
}

function source_does_not_import_later_stage_modules_or_solver_output(): void {
  const source = readFileSync(path.join(__dirname, 'conflict-detection.ts'), 'utf8')
  assert.ok(!source.includes("from './constraints'"))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
  assert.ok(!/function\s+(resolve|replace|search|backtrack|finalize)/.test(source))
}

function source_does_not_modify_placement_or_runtime_state(): void {
  const source = readFileSync(path.join(__dirname, 'conflict-detection.ts'), 'utf8')
  assert.ok(!source.includes('placementState.provisionalPlacements.push'))
  assert.ok(!source.includes('runtimeState.slots.push'))
  assert.ok(!source.includes('occupancy.state ='))
  assert.ok(!source.includes('reservedCandidateCode ='))
  assert.ok(!source.includes('assignedCandidateCode ='))
}

// ═══ runner ════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'clean placement has no conflicts', fn: clean_placement_has_no_conflicts },
  { name: 'unplaced Slot is detected as dependency conflict', fn: unplaced_slot_is_detected_as_dependency_conflict },
  { name: 'duplicate Candidate use is grouped without resolution', fn: duplicate_candidate_use_is_grouped_without_resolution },
  { name: 'ineligible Candidate is detected as Hard conflict', fn: ineligible_candidate_is_detected_as_hard_conflict },
  { name: 'unknown Slot and Candidate are detected', fn: unknown_slot_and_candidate_are_detected },
  { name: 'invalid Blueprint validation is carried as conflict', fn: invalid_blueprint_validation_is_carried_as_conflict },
  { name: 'runtime recorded conflicts are carried forward read-only', fn: runtime_recorded_conflicts_are_carried_forward_read_only },
  { name: 'progress mismatch is detected as invalid runtime state', fn: progress_mismatch_is_detected_as_invalid_runtime_state },
  { name: 'output contains only Stage 5 fields', fn: output_contains_only_stage_five_fields },
  { name: 'rejects Snapshot reference mismatch', fn: rejects_snapshot_reference_mismatch },
  { name: 'rejects total Slot mismatch', fn: rejects_total_slot_mismatch },
  { name: 'deterministic: same input -> same output', fn: deterministic_same_input_same_output },
  { name: 'does not mutate inputs', fn: does_not_mutate_inputs },
  { name: 'read-only helpers return expected views', fn: read_only_helpers_return_expected_views },
  { name: 'source has no forbidden dependencies or hidden state', fn: source_has_no_forbidden_dependencies_or_hidden_state },
  { name: 'source does not import later stage modules or Solver output', fn: source_does_not_import_later_stage_modules_or_solver_output },
  { name: 'source does not modify Placement or Runtime State', fn: source_does_not_modify_placement_or_runtime_state },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
