/**
 * lib/engine/solver/allocation-validation.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.7 — Allocation Validation tests.
 *
 * RUN: npx jiti lib/engine/solver/allocation-validation.test.ts
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
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { initializeAllocationRuntime, type AllocationRuntimeState } from './runtime'
import { validateBlueprintConstraints, type BlueprintValidationResult } from './blueprint-validation'
import { initializeCandidatePlacement, type PlacementRuntimeState } from './placement'
import { detectAllocationConflicts, type ConflictDetectionResult } from './conflict-detection'
import {
  resolveDetectedConflicts,
  type ConflictResolutionResult,
} from './conflict-resolution'
import {
  hasFatalAllocationDiagnostics,
  isAllocationValid,
  validateResolvedAllocation,
  validationDiagnosticsForCandidate,
  validationDiagnosticsForSlot,
  type AllocationValidationResult,
} from './allocation-validation'

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
    identity: { assemblyRequestId: 'assembly-allocation-validation', generatedAt: null, bankStateHash: 'bank-hash' },
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
  readonly detection: ConflictDetectionResult
  readonly resolution: ConflictResolutionResult
} {
  const runtimeState = initializeAllocationRuntime(rcs)
  const validation = validateBlueprintConstraints(runtimeState)
  const placement = initializeCandidatePlacement(runtimeState, validation, rcs)
  const detection = detectAllocationConflicts(placement, runtimeState, validation)
  return {
    runtimeState,
    validation,
    placement,
    detection,
    resolution: resolveDetectedConflicts(detection, placement, runtimeState),
  }
}

function validate(rcs: RankedCandidateSet): AllocationValidationResult {
  const i = inputs(rcs)
  return validateResolvedAllocation(i.resolution, i.placement, i.runtimeState)
}

function withPlacement(
  state: PlacementRuntimeState,
  overrides: Partial<PlacementRuntimeState>
): PlacementRuntimeState {
  return { ...state, ...overrides }
}

// ═══ Validation behavior ════════════════════════════════════════════════════

function clean_resolved_allocation_is_valid(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = validate(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  ))
  assert.equal(isAllocationValid(result), true)
  assert.equal(hasFatalAllocationDiagnostics(result), false)
  assert.equal(result.validationSummary.effectivePlacementCount, 2)
}

function unresolved_conflict_invalidates_allocation(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = validate(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  ))
  assert.equal(result.validationResult, 'invalid')
  assert.ok(result.validationDiagnostics.some((diagnostic) => diagnostic.category === 'no_feasible_candidate'))
}

function duplicate_candidate_release_produces_consistent_effective_allocation(): void {
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
  const placement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-b', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-a', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingCandidates: ['Q-000002'],
  })
  const detection = detectAllocationConflicts(placement, i.runtimeState, i.validation)
  const resolution = resolveDetectedConflicts(detection, placement, i.runtimeState)
  const result = validateResolvedAllocation(resolution, placement, i.runtimeState)
  assert.equal(result.validationResult, 'valid')
  assert.equal(result.validationSummary.effectivePlacementCount, 1)
  assert.equal(result.validationSummary.releasedSlotCount, 1)
}

function ineligible_candidate_release_validates_as_released_slot(): void {
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
  const placement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000002', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: 'Q-000002', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingCandidates: ['Q-000001'],
    placementProgress: {
      totalSlots: 2,
      placedSlotCount: 2,
      unplacedSlotCount: 0,
      remainingCandidateCount: 1,
      remainingSlotCount: 0,
    },
  })
  const detection = detectAllocationConflicts(placement, i.runtimeState, i.validation)
  const resolution = resolveDetectedConflicts(detection, placement, i.runtimeState)
  const result = validateResolvedAllocation(resolution, placement, i.runtimeState)
  assert.equal(result.validationResult, 'valid')
  assert.equal(result.validationSummary.effectivePlacementCount, 0)
  assert.equal(result.validationSummary.releasedSlotCount, 2)
}

function unresolved_blueprint_conflict_invalidates_allocation(): void {
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
        explanation: 'Fixture Blueprint impossible.',
        recommendation: 'Fix fixture.',
      },
    ],
    warnings: [],
    constraintSnapshot: i.runtimeState.constraintSnapshot,
  }
  const detection = detectAllocationConflicts(i.placement, i.runtimeState, validation)
  const resolution = resolveDetectedConflicts(detection, i.placement, i.runtimeState)
  const result = validateResolvedAllocation(resolution, i.placement, i.runtimeState)
  assert.equal(result.validationResult, 'invalid')
  assert.ok(result.validationDiagnostics.some((diagnostic) => diagnostic.category === 'blueprint_impossible'))
}

function unresolved_effective_duplicate_candidate_is_invalid(): void {
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
  const placement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingSlots: [],
    placementProgress: {
      totalSlots: 2,
      placedSlotCount: 2,
      unplacedSlotCount: 0,
      remainingCandidateCount: 0,
      remainingSlotCount: 0,
    },
  })
  const resolution: ConflictResolutionResult = {
    resolvedConflicts: [],
    unresolvedConflicts: [],
    resolutionActions: [],
    resolutionDiagnostics: [],
    resolutionSummary: {
      totalConflictCount: 0,
      resolvedConflictCount: 0,
      unresolvedConflictCount: 0,
      actionCount: 0,
      candidateReleaseCount: 0,
      slotReleaseCount: 0,
    },
  }
  const result = validateResolvedAllocation(resolution, placement, i.runtimeState)
  assert.equal(result.validationResult, 'invalid')
  assert.ok(result.validationDiagnostics.some((diagnostic) => diagnostic.category === 'duplicate_assignment'))
}

function unknown_effective_placement_is_invalid(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const placement = withPlacement(i.placement, {
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
  const resolution: ConflictResolutionResult = {
    resolvedConflicts: [],
    unresolvedConflicts: [],
    resolutionActions: [],
    resolutionDiagnostics: [],
    resolutionSummary: {
      totalConflictCount: 0,
      resolvedConflictCount: 0,
      unresolvedConflictCount: 0,
      actionCount: 0,
      candidateReleaseCount: 0,
      slotReleaseCount: 0,
    },
  }
  const result = validateResolvedAllocation(resolution, placement, i.runtimeState)
  assert.equal(result.validationResult, 'invalid')
  assert.ok(result.validationDiagnostics.some((diagnostic) => diagnostic.category === 'invalid_runtime_state'))
}

function missing_action_for_resolved_conflict_is_invalid(): void {
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
  const placement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingCandidates: ['Q-000002'],
  })
  const detection = detectAllocationConflicts(placement, i.runtimeState, i.validation)
  const resolution = resolveDetectedConflicts(detection, placement, i.runtimeState)
  const broken: ConflictResolutionResult = {
    ...resolution,
    resolutionActions: resolution.resolutionActions.slice(1),
    resolutionSummary: {
      ...resolution.resolutionSummary,
      actionCount: resolution.resolutionActions.length - 1,
    },
  }
  const result = validateResolvedAllocation(broken, placement, i.runtimeState)
  assert.equal(result.validationResult, 'invalid')
  assert.ok(result.validationDiagnostics.some((diagnostic) => diagnostic.explanation.includes('missing resolution action')))
}

function action_for_unknown_conflict_is_invalid(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const resolution: ConflictResolutionResult = {
    resolvedConflicts: [],
    unresolvedConflicts: [],
    resolutionActions: [
      {
        actionId: 'fixture-action',
        kind: 'mark_resolved',
        conflictId: 'missing-conflict',
        slotId: 'slot-a',
        candidateCode: 'Q-000001',
        reason: 'fixture',
      },
    ],
    resolutionDiagnostics: [],
    resolutionSummary: {
      totalConflictCount: 0,
      resolvedConflictCount: 0,
      unresolvedConflictCount: 0,
      actionCount: 1,
      candidateReleaseCount: 0,
      slotReleaseCount: 0,
    },
  }
  const result = validateResolvedAllocation(resolution, i.placement, i.runtimeState)
  assert.equal(result.validationResult, 'invalid')
  assert.ok(result.validationDiagnostics.some((diagnostic) => diagnostic.explanation.includes('unknown conflict')))
}

function output_contains_only_stage_seven_fields(): void {
  const a = slot(1, 'slot-a')
  const result = validate(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  assert.deepEqual(Object.keys(result).sort(), [
    'validationDiagnostics',
    'validationResult',
    'validationSummary',
  ])
}

// ═══ Compatibility, determinism, immutability ═══════════════════════════════

function rejects_resolution_summary_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const resolution: ConflictResolutionResult = {
    ...i.resolution,
    resolutionSummary: { ...i.resolution.resolutionSummary, totalConflictCount: 99 },
  }
  assert.throws(
    () => validateResolvedAllocation(resolution, i.placement, i.runtimeState),
    /summary does not match conflict counts/
  )
}

function rejects_placement_total_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const placement = withPlacement(i.placement, {
    placementProgress: { ...i.placement.placementProgress, totalSlots: 2 },
  })
  assert.throws(
    () => validateResolvedAllocation(i.resolution, placement, i.runtimeState),
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
  assert.equal(stableStringify(validate(rcs)), stableStringify(validate(rcs)))
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
  const beforeResolution = stableStringify(i.resolution)
  const beforePlacement = stableStringify(i.placement)
  const beforeRuntime = stableStringify(i.runtimeState)
  validateResolvedAllocation(i.resolution, i.placement, i.runtimeState)
  assert.equal(stableStringify(i.resolution), beforeResolution)
  assert.equal(stableStringify(i.placement), beforePlacement)
  assert.equal(stableStringify(i.runtimeState), beforeRuntime)
}

function read_only_helpers_return_expected_views(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = validate(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  ))
  assert.equal(isAllocationValid(result), false)
  assert.equal(hasFatalAllocationDiagnostics(result), true)
  assert.equal(validationDiagnosticsForSlot(result, 'slot-b').length > 0, true)
  assert.equal(validationDiagnosticsForCandidate(result, 'Q-000001').length > 0, false)
}

// ═══ Source boundaries ══════════════════════════════════════════════════════

function source_has_no_forbidden_dependencies_or_hidden_state(): void {
  const source = readFileSync(path.join(__dirname, 'allocation-validation.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/^let\s+/m.test(source))
  assert.ok(!/^var\s+/m.test(source))
}

function source_does_not_import_later_stage_modules_or_solver_output(): void {
  const source = readFileSync(path.join(__dirname, 'allocation-validation.ts'), 'utf8')
  assert.ok(!source.includes("from './constraints'"))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
  assert.ok(!/function\s+(finalize|emit|search|backtrack|replace|reserve)/.test(source))
}

function source_does_not_mutate_inputs(): void {
  const source = readFileSync(path.join(__dirname, 'allocation-validation.ts'), 'utf8')
  assert.ok(!source.includes('placementState.provisionalPlacements.push'))
  assert.ok(!source.includes('runtimeState.slots.push'))
  assert.ok(!source.includes('occupancy.state ='))
  assert.ok(!source.includes('reservedCandidateCode ='))
  assert.ok(!source.includes('assignedCandidateCode ='))
}

// ═══ runner ════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'clean resolved allocation is valid', fn: clean_resolved_allocation_is_valid },
  { name: 'unresolved conflict invalidates allocation', fn: unresolved_conflict_invalidates_allocation },
  { name: 'duplicate Candidate release produces consistent effective allocation', fn: duplicate_candidate_release_produces_consistent_effective_allocation },
  { name: 'ineligible Candidate release validates as released Slot', fn: ineligible_candidate_release_validates_as_released_slot },
  { name: 'unresolved Blueprint conflict invalidates allocation', fn: unresolved_blueprint_conflict_invalidates_allocation },
  { name: 'unresolved effective duplicate Candidate is invalid', fn: unresolved_effective_duplicate_candidate_is_invalid },
  { name: 'unknown effective placement is invalid', fn: unknown_effective_placement_is_invalid },
  { name: 'missing action for resolved conflict is invalid', fn: missing_action_for_resolved_conflict_is_invalid },
  { name: 'action for unknown conflict is invalid', fn: action_for_unknown_conflict_is_invalid },
  { name: 'output contains only Stage 7 fields', fn: output_contains_only_stage_seven_fields },
  { name: 'rejects Resolution summary mismatch', fn: rejects_resolution_summary_mismatch },
  { name: 'rejects Placement total mismatch', fn: rejects_placement_total_mismatch },
  { name: 'deterministic: same input -> same output', fn: deterministic_same_input_same_output },
  { name: 'does not mutate inputs', fn: does_not_mutate_inputs },
  { name: 'read-only helpers return expected views', fn: read_only_helpers_return_expected_views },
  { name: 'source has no forbidden dependencies or hidden state', fn: source_has_no_forbidden_dependencies_or_hidden_state },
  { name: 'source does not import later stage modules or Solver output', fn: source_does_not_import_later_stage_modules_or_solver_output },
  { name: 'source does not mutate inputs', fn: source_does_not_mutate_inputs },
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
