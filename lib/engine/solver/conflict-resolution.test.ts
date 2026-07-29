/**
 * lib/engine/solver/conflict-resolution.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.6 — Conflict Resolution tests.
 *
 * RUN: npx jiti lib/engine/solver/conflict-resolution.test.ts
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
import { detectAllocationConflicts, type ConflictDetectionResult } from './conflict-detection'
import {
  actionsForConflict,
  hasUnresolvedConflicts,
  resolvedForCandidate,
  resolveDetectedConflicts,
  unresolvedForSlot,
  type ConflictResolutionResult,
} from './conflict-resolution'

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
    identity: { assemblyRequestId: 'assembly-conflict-resolution', generatedAt: null, bankStateHash: 'bank-hash' },
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
} {
  const runtimeState = initializeAllocationRuntime(rcs)
  const validation = validateBlueprintConstraints(runtimeState)
  const placement = initializeCandidatePlacement(runtimeState, validation, rcs)
  return {
    runtimeState,
    validation,
    placement,
    detection: detectAllocationConflicts(placement, runtimeState, validation),
  }
}

function resolve(rcs: RankedCandidateSet): ConflictResolutionResult {
  const i = inputs(rcs)
  return resolveDetectedConflicts(i.detection, i.placement, i.runtimeState)
}

function withPlacement(
  state: PlacementRuntimeState,
  overrides: Partial<PlacementRuntimeState>
): PlacementRuntimeState {
  return { ...state, ...overrides }
}

// ═══ Resolution behavior ════════════════════════════════════════════════════

function clean_detection_has_no_resolutions(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = resolve(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  ))
  assert.equal(hasUnresolvedConflicts(result), false)
  assert.deepEqual(result.resolutionSummary, {
    totalConflictCount: 0,
    resolvedConflictCount: 0,
    unresolvedConflictCount: 0,
    actionCount: 0,
    candidateReleaseCount: 0,
    slotReleaseCount: 0,
  })
}

function duplicate_candidate_conflict_releases_non_retained_slot_deterministically(): void {
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
  const result = resolveDetectedConflicts(detection, placement, i.runtimeState)
  assert.equal(result.resolutionSummary.unresolvedConflictCount, 0)
  assert.equal(result.resolutionSummary.resolvedConflictCount, 3)
  assert.ok(result.resolutionActions.some((action) => action.kind === 'release_candidate' && action.slotId === 'slot-b'))
  assert.ok(result.resolutionActions.some((action) => action.kind === 'release_slot' && action.slotId === 'slot-b'))
  assert.ok(result.resolutionActions.some((action) => action.kind === 'mark_resolved' && action.slotId === 'slot-a'))
}

function unplaced_slot_conflict_remains_unresolved(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const result = resolve(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  ))
  assert.equal(hasUnresolvedConflicts(result), true)
  assert.ok(unresolvedForSlot(result, 'slot-b').some((entry) => entry.conflict.constraint === 'placement:unplaced_slot'))
  assert.ok(result.resolutionActions.some((action) => action.kind === 'mark_unresolved'))
}

function ineligible_candidate_conflict_recommends_slot_release(): void {
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
  const detection = detectAllocationConflicts(placement, i.runtimeState, i.validation)
  const result = resolveDetectedConflicts(detection, placement, i.runtimeState)
  assert.ok(result.resolvedConflicts.some((entry) => entry.conflict.constraint === 'placement:eligibility'))
  assert.ok(result.resolutionActions.some((action) => action.kind === 'release_slot' && action.slotId === 'slot-a'))
}

function unknown_slot_conflict_remains_unresolved(): void {
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
  const detection = detectAllocationConflicts(placement, i.runtimeState, i.validation)
  const result = resolveDetectedConflicts(detection, placement, i.runtimeState)
  assert.ok(result.unresolvedConflicts.some((entry) => entry.conflict.constraint === 'placement:unknown_slot'))
  assert.ok(result.resolvedConflicts.some((entry) => entry.conflict.constraint === 'placement:unknown_candidate'))
}

function soft_runtime_conflict_is_marked_resolved_without_release(): void {
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
              constraint: 'fixture_soft',
              type: 'soft' as const,
              scope: 'within_run' as const,
              resolution: 'unresolved' as const,
              participants: ['Q-000001'],
              evidence: 'Fixture soft strain.',
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
  const detection = detectAllocationConflicts(i.placement, runtimeState, i.validation)
  const result = resolveDetectedConflicts(detection, i.placement, runtimeState)
  assert.equal(result.resolutionSummary.resolvedConflictCount, 1)
  assert.equal(result.resolutionSummary.candidateReleaseCount, 0)
  assert.ok(result.resolutionActions.some((action) => action.kind === 'mark_resolved'))
}

function invalid_blueprint_conflict_remains_unresolved(): void {
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
  const detection = detectAllocationConflicts(i.placement, i.runtimeState, validation)
  const result = resolveDetectedConflicts(detection, i.placement, i.runtimeState)
  assert.ok(result.unresolvedConflicts.some((entry) => entry.conflict.constraint === 'validation:blueprint_impossible'))
  assert.ok(result.resolutionDiagnostics.some((d) => d.category === 'blueprint_impossible'))
}

function output_contains_only_stage_six_fields(): void {
  const a = slot(1, 'slot-a')
  const result = resolve(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  assert.deepEqual(Object.keys(result).sort(), [
    'resolutionActions',
    'resolutionDiagnostics',
    'resolutionSummary',
    'resolvedConflicts',
    'unresolvedConflicts',
  ])
}

// ═══ Compatibility, determinism, immutability ═══════════════════════════════

function rejects_detection_total_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const i = inputs(rcs)
  const detection: ConflictDetectionResult = {
    ...i.detection,
    conflictSummary: { ...i.detection.conflictSummary, totalConflictCount: 99 },
  }
  assert.throws(
    () => resolveDetectedConflicts(detection, i.placement, i.runtimeState),
    /summary does not match detected conflicts/
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
    () => resolveDetectedConflicts(i.detection, placement, i.runtimeState),
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
  assert.equal(stableStringify(resolve(rcs)), stableStringify(resolve(rcs)))
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
  const beforeDetection = stableStringify(i.detection)
  const beforePlacement = stableStringify(i.placement)
  const beforeRuntime = stableStringify(i.runtimeState)
  resolveDetectedConflicts(i.detection, i.placement, i.runtimeState)
  assert.equal(stableStringify(i.detection), beforeDetection)
  assert.equal(stableStringify(i.placement), beforePlacement)
  assert.equal(stableStringify(i.runtimeState), beforeRuntime)
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
  const placement = withPlacement(i.placement, {
    provisionalPlacements: [
      { slotId: 'slot-a', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
      { slotId: 'slot-b', candidateCode: 'Q-000001', inheritedRank: 1, status: 'placed', reason: 'fixture' },
    ],
    remainingCandidates: ['Q-000002'],
  })
  const detection = detectAllocationConflicts(placement, i.runtimeState, i.validation)
  const result = resolveDetectedConflicts(detection, placement, i.runtimeState)
  const targetConflict = result.resolvedConflicts.find((entry) => entry.conflict.slotId === 'slot-b')!.conflict
  assert.equal(actionsForConflict(result, targetConflict.conflictId).length > 0, true)
  assert.equal(resolvedForCandidate(result, 'Q-000001').length > 0, true)
  assert.deepEqual(unresolvedForSlot(result, 'slot-b'), [])
}

// ═══ Source boundaries ══════════════════════════════════════════════════════

function source_has_no_forbidden_dependencies_or_hidden_state(): void {
  const source = readFileSync(path.join(__dirname, 'conflict-resolution.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/^let\s+/m.test(source))
  assert.ok(!/^var\s+/m.test(source))
}

function source_does_not_import_later_stage_modules_or_solver_output(): void {
  const source = readFileSync(path.join(__dirname, 'conflict-resolution.ts'), 'utf8')
  assert.ok(!source.includes("from './constraints'"))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
  assert.ok(!/function\s+(search|backtrack|allocate|lock)/.test(source))
}

function source_does_not_mutate_inputs_or_perform_search(): void {
  const source = readFileSync(path.join(__dirname, 'conflict-resolution.ts'), 'utf8')
  assert.ok(!source.includes('placementState.provisionalPlacements.push'))
  assert.ok(!source.includes('runtimeState.slots.push'))
  assert.ok(!source.includes('occupancy.state ='))
  assert.ok(!source.includes('for (;;)'))
  assert.ok(!source.includes('while ('))
}

// ═══ runner ════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'clean detection has no resolutions', fn: clean_detection_has_no_resolutions },
  { name: 'duplicate Candidate conflict releases non-retained Slot deterministically', fn: duplicate_candidate_conflict_releases_non_retained_slot_deterministically },
  { name: 'unplaced Slot conflict remains unresolved', fn: unplaced_slot_conflict_remains_unresolved },
  { name: 'ineligible Candidate conflict recommends Slot release', fn: ineligible_candidate_conflict_recommends_slot_release },
  { name: 'unknown Slot conflict remains unresolved', fn: unknown_slot_conflict_remains_unresolved },
  { name: 'soft runtime conflict is marked resolved without release', fn: soft_runtime_conflict_is_marked_resolved_without_release },
  { name: 'invalid Blueprint conflict remains unresolved', fn: invalid_blueprint_conflict_remains_unresolved },
  { name: 'output contains only Stage 6 fields', fn: output_contains_only_stage_six_fields },
  { name: 'rejects Detection total mismatch', fn: rejects_detection_total_mismatch },
  { name: 'rejects Placement total mismatch', fn: rejects_placement_total_mismatch },
  { name: 'deterministic: same input -> same output', fn: deterministic_same_input_same_output },
  { name: 'does not mutate inputs', fn: does_not_mutate_inputs },
  { name: 'read-only helpers return expected views', fn: read_only_helpers_return_expected_views },
  { name: 'source has no forbidden dependencies or hidden state', fn: source_has_no_forbidden_dependencies_or_hidden_state },
  { name: 'source does not import later stage modules or Solver output', fn: source_does_not_import_later_stage_modules_or_solver_output },
  { name: 'source does not mutate inputs or perform search', fn: source_does_not_mutate_inputs_or_perform_search },
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
