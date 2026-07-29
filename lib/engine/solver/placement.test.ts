/**
 * lib/engine/solver/placement.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.4 — Candidate Placement tests.
 *
 * RUN: npx jiti lib/engine/solver/placement.test.ts
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
import {
  getProvisionalPlacement,
  initializeCandidatePlacement,
  isSlotProvisionallyPlaced,
  provisionalCandidateForSlot,
  type PlacementRuntimeState,
} from './placement'

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
    identity: { assemblyRequestId: 'assembly-placement', generatedAt: null, bankStateHash: 'bank-hash' },
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

function validInputs(rcs: RankedCandidateSet): {
  readonly runtimeState: ReturnType<typeof initializeAllocationRuntime>
  readonly validation: BlueprintValidationResult
} {
  const runtimeState = initializeAllocationRuntime(rcs)
  return {
    runtimeState,
    validation: validateBlueprintConstraints(runtimeState),
  }
}

function place(rcs: RankedCandidateSet): PlacementRuntimeState {
  const { runtimeState, validation } = validInputs(rcs)
  return initializeCandidatePlacement(runtimeState, validation, rcs)
}

// ═══ Placement behavior ═════════════════════════════════════════════════════

function places_one_candidate_per_slot_in_stable_slot_order(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
    ],
    ['Q-000001', 'Q-000002']
  )
  const state = place(rcs)
  assert.deepEqual(
    state.provisionalPlacements.map((p) => p.slotId),
    ['slot-a', 'slot-b']
  )
  assert.equal(provisionalCandidateForSlot(state, 'slot-a'), 'Q-000001')
  assert.equal(provisionalCandidateForSlot(state, 'slot-b'), 'Q-000002')
}

function uses_inherited_rank_order_within_slot(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000002', 'Q-000001'])], ['Q-000001', 'Q-000002'])
  const state = place(rcs)
  assert.equal(provisionalCandidateForSlot(state, 'slot-a'), 'Q-000002')
  assert.equal(getProvisionalPlacement(state, 'slot-a')?.inheritedRank, 1)
}

function removes_placed_candidates_from_remaining_candidates(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001', 'Q-000002']),
      rankedSlot(b.slotId, b.slot, ['Q-000001', 'Q-000002']),
    ],
    ['Q-000001', 'Q-000002', 'Q-000003']
  )
  const state = place(rcs)
  assert.equal(provisionalCandidateForSlot(state, 'slot-a'), 'Q-000001')
  assert.equal(provisionalCandidateForSlot(state, 'slot-b'), 'Q-000002')
  assert.deepEqual(state.remainingCandidates, ['Q-000003'])
}

function records_unplaced_slots_without_searching(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  )
  const state = place(rcs)
  assert.equal(provisionalCandidateForSlot(state, 'slot-a'), 'Q-000001')
  assert.equal(provisionalCandidateForSlot(state, 'slot-b'), null)
  assert.deepEqual(state.remainingSlots, ['slot-b'])
  assert.equal(state.placementDiagnostics.length, 1)
  assert.equal(state.placementDiagnostics[0]!.stage, 'candidate_placement')
}

function invalid_blueprint_validation_prevents_placement_initialization(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const runtimeState = initializeAllocationRuntime(rcs)
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
        explanation: 'Fixture invalid Blueprint.',
        recommendation: 'Fix fixture.',
      },
    ],
    warnings: [],
    constraintSnapshot: runtimeState.constraintSnapshot,
  }
  const state = initializeCandidatePlacement(runtimeState, validation, rcs)
  assert.equal(state.provisionalPlacements.length, 0)
  assert.deepEqual(state.remainingSlots, ['slot-a'])
  assert.deepEqual(state.remainingCandidates, ['Q-000001'])
  assert.equal(state.placementDiagnostics[0]!.category, 'blueprint_impossible')
}

function progress_counts_match_placement_state(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, []),
    ],
    ['Q-000001', 'Q-000002']
  )
  const state = place(rcs)
  assert.deepEqual(state.placementProgress, {
    totalSlots: 2,
    placedSlotCount: 1,
    unplacedSlotCount: 1,
    remainingCandidateCount: 1,
    remainingSlotCount: 1,
  })
}

function output_contains_only_stage_four_fields(): void {
  const a = slot(1, 'slot-a')
  const state = place(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  assert.deepEqual(Object.keys(state).sort(), [
    'placementDiagnostics',
    'placementProgress',
    'provisionalPlacements',
    'remainingCandidates',
    'remainingSlots',
  ])
}

// ═══ Input compatibility and immutability ══════════════════════════════════

function rejects_ranked_candidate_set_reference_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const other = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const { runtimeState, validation } = validInputs(rcs)
  assert.throws(
    () => initializeCandidatePlacement(runtimeState, validation, other),
    /RankedCandidateSet reference mismatch/
  )
}

function rejects_snapshot_reference_mismatch(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const { runtimeState, validation } = validInputs(rcs)
  const badValidation: BlueprintValidationResult = {
    ...validation,
    constraintSnapshot: buildConstraintSnapshot(),
  }
  assert.throws(
    () => initializeCandidatePlacement(runtimeState, badValidation, rcs),
    /ConstraintSnapshot reference mismatch/
  )
}

function rejects_malformed_ranked_slot(): void {
  const a = slot(1, 'slot-a')
  const badSlot: RankedSlot = {
    ...rankedSlot(a.slotId, a.slot, ['Q-000001', 'Q-000002']),
    rankedCandidates: [ranked('Q-000001', 1, a.slot), ranked('Q-000002', 1, a.slot)],
  }
  const rcs = rankedCandidateSet([badSlot], ['Q-000001', 'Q-000002'])
  const runtimeState: AllocationRuntimeState = {
    rankedCandidateSet: rcs,
    constraintSnapshot: rcs.constraintSnapshot,
    slots: [],
    slotsById: new Map(),
    candidates: [],
    candidatesByCode: new Map(),
    progress: {
      totalSlots: 0,
      openSlotCount: 0,
      reservedSlotCount: 0,
      allocatedSlotCount: 0,
      lockedSlotCount: 0,
      rejectedSlotCount: 0,
      releasedSlotCount: 0,
      totalCandidates: 0,
      reservedCandidateCount: 0,
      assignedCandidateCount: 0,
      unresolvedConflictCount: 0,
    },
  }
  const validation: BlueprintValidationResult = {
    status: 'valid',
    fatalDiagnostics: [],
    warnings: [],
    constraintSnapshot: rcs.constraintSnapshot,
  }
  assert.throws(() => initializeCandidatePlacement(runtimeState, validation, rcs), /duplicate rank/)
}

function deterministic_same_input_same_output(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const rcs = rankedCandidateSet(
    [
      rankedSlot(b.slotId, b.slot, ['Q-000001', 'Q-000003']),
      rankedSlot(a.slotId, a.slot, ['Q-000002', 'Q-000001']),
    ],
    ['Q-000001', 'Q-000002', 'Q-000003']
  )
  assert.equal(stableStringify(place(rcs)), stableStringify(place(rcs)))
}

function does_not_mutate_inputs(): void {
  const a = slot(1, 'slot-a')
  const rcs = rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])
  const { runtimeState, validation } = validInputs(rcs)
  const beforeRuntime = stableStringify(runtimeState)
  const beforeValidation = stableStringify(validation)
  const beforeRanked = stableStringify(rcs)
  initializeCandidatePlacement(runtimeState, validation, rcs)
  assert.equal(stableStringify(runtimeState), beforeRuntime)
  assert.equal(stableStringify(validation), beforeValidation)
  assert.equal(stableStringify(rcs), beforeRanked)
}

function read_only_helpers_return_expected_views(): void {
  const a = slot(1, 'slot-a')
  const state = place(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  assert.equal(isSlotProvisionallyPlaced(state, 'slot-a'), true)
  assert.equal(isSlotProvisionallyPlaced(state, 'missing'), false)
  assert.equal(getProvisionalPlacement(state, 'slot-a')?.candidateCode, 'Q-000001')
  assert.equal(provisionalCandidateForSlot(state, 'missing'), null)
}

// ═══ Source boundaries ══════════════════════════════════════════════════════

function source_has_no_forbidden_dependencies_or_hidden_state(): void {
  const source = readFileSync(path.join(__dirname, 'placement.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/^let\s+/m.test(source))
  assert.ok(!/^var\s+/m.test(source))
}

function source_does_not_import_later_stage_modules_or_solver_output(): void {
  const source = readFileSync(path.join(__dirname, 'placement.ts'), 'utf8')
  assert.ok(!source.includes("from './constraints'"))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
  assert.ok(!/function\s+(search|backtrack|resolve|replace|finalize)/.test(source))
}

function source_does_not_read_scores_or_runtime_placement_state(): void {
  const source = readFileSync(path.join(__dirname, 'placement.ts'), 'utf8')
  assert.ok(!source.includes('.composite'))
  assert.ok(!source.includes('.confidence'))
  assert.ok(!source.includes('.penalties'))
  assert.ok(!source.includes('runtimeState.slots'))
  assert.ok(!source.includes('runtimeState.progress'))
  assert.ok(!source.includes('runtimeState.candidates'))
}

// ═══ runner ════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'places one Candidate per Slot in stable Slot order', fn: places_one_candidate_per_slot_in_stable_slot_order },
  { name: 'uses inherited rank order within Slot', fn: uses_inherited_rank_order_within_slot },
  { name: 'removes placed Candidates from remaining Candidates', fn: removes_placed_candidates_from_remaining_candidates },
  { name: 'records unplaced Slots without searching', fn: records_unplaced_slots_without_searching },
  { name: 'invalid Blueprint validation prevents placement initialization', fn: invalid_blueprint_validation_prevents_placement_initialization },
  { name: 'progress counts match placement state', fn: progress_counts_match_placement_state },
  { name: 'output contains only Stage 4 fields', fn: output_contains_only_stage_four_fields },
  { name: 'rejects RankedCandidateSet reference mismatch', fn: rejects_ranked_candidate_set_reference_mismatch },
  { name: 'rejects Snapshot reference mismatch', fn: rejects_snapshot_reference_mismatch },
  { name: 'rejects malformed RankedSlot', fn: rejects_malformed_ranked_slot },
  { name: 'deterministic: same input -> same output', fn: deterministic_same_input_same_output },
  { name: 'does not mutate inputs', fn: does_not_mutate_inputs },
  { name: 'read-only helpers return expected views', fn: read_only_helpers_return_expected_views },
  { name: 'source has no forbidden dependencies or hidden state', fn: source_has_no_forbidden_dependencies_or_hidden_state },
  { name: 'source does not import later stages or Solver output', fn: source_does_not_import_later_stage_modules_or_solver_output },
  { name: 'source does not read scores or runtime placement state', fn: source_does_not_read_scores_or_runtime_placement_state },
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
