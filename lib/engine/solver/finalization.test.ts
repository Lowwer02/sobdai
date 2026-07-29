/**
 * lib/engine/solver/finalization.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.8 — Allocation Finalization tests.
 *
 * RUN: npx jiti lib/engine/solver/finalization.test.ts
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
import {
  initializeAllocationRuntime,
  type AllocationRuntimeState,
  type SlotRuntimeState,
} from './runtime'
import type { AllocationValidationResult } from './allocation-validation'
import {
  finalizedCandidate,
  finalizedSlot,
  finalizeAllocationState,
  isFinalizationComplete,
  lockedSlotIds,
  type AllocationFinalizationResult,
} from './finalization'

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
    identity: { assemblyRequestId: 'assembly-finalization', generatedAt: null, bankStateHash: 'bank-hash' },
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

function runtime(rcs: RankedCandidateSet): AllocationRuntimeState {
  return initializeAllocationRuntime(rcs)
}

function validGate(state: AllocationRuntimeState): AllocationValidationResult {
  return {
    validationResult: 'valid',
    validationDiagnostics: [],
    validationSummary: {
      totalSlotCount: state.slots.length,
      provisionalPlacementCount: 0,
      effectivePlacementCount: state.slots.filter((s) => s.occupancy.assignedCandidateCode !== null).length,
      releasedSlotCount: 0,
      releasedCandidateCount: 0,
      unresolvedConflictCount: 0,
      fatalDiagnosticCount: 0,
      nonFatalDiagnosticCount: 0,
    },
  }
}

function invalidGate(state: AllocationRuntimeState): AllocationValidationResult {
  return {
    ...validGate(state),
    validationResult: 'invalid',
    validationDiagnostics: [
      {
        category: 'corrupted_allocation',
        severity: 'Fatal',
        stage: 'allocation_validation',
        slotId: null,
        candidateCode: null,
        componentId: null,
        explanation: 'Fixture invalid allocation.',
        recommendation: 'Fix fixture.',
      },
    ],
    validationSummary: {
      ...validGate(state).validationSummary,
      fatalDiagnosticCount: 1,
    },
  }
}

function withSlots(state: AllocationRuntimeState, slots: readonly SlotRuntimeState[]): AllocationRuntimeState {
  return {
    ...state,
    slots,
    slotsById: new Map(slots.map((s) => [s.slotId, s])),
  }
}

function assign(state: AllocationRuntimeState, assignments: Readonly<Record<string, string>>): AllocationRuntimeState {
  const slots = state.slots.map((slotState) => {
    const code = assignments[slotState.slotId]
    if (code === undefined) return slotState
    return {
      ...slotState,
      occupancy: {
        state: 'allocated' as const,
        reservedCandidateCode: null,
        assignedCandidateCode: code,
      },
    }
  })
  return withSlots(state, slots)
}

function finalize(state: AllocationRuntimeState): AllocationFinalizationResult {
  return finalizeAllocationState(state, validGate(state))
}

// ═══ Finalization behavior ══════════════════════════════════════════════════

function locks_allocated_slots_and_recomputes_candidate_assignments(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const state = assign(runtime(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  )), { 'slot-a': 'Q-000001', 'slot-b': 'Q-000002' })
  const result = finalize(state)
  assert.deepEqual(lockedSlotIds(result), ['slot-a', 'slot-b'])
  assert.equal(finalizedSlot(result, 'slot-a')?.occupancy.state, 'locked')
  assert.equal(finalizedCandidate(result, 'Q-000001')?.assignedSlotId, 'slot-a')
  assert.equal(result.finalizedAllocationState.progress.lockedSlotCount, 2)
  assert.equal(result.finalizedAllocationState.progress.allocatedSlotCount, 0)
}

function preserves_open_rejected_released_and_locked_slots(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const c = slot(1, 'slot-c')
  const d = slot(1, 'slot-d')
  const base = runtime(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
      rankedSlot(c.slotId, c.slot, ['Q-000003']),
      rankedSlot(d.slotId, d.slot, ['Q-000004']),
    ],
    ['Q-000001', 'Q-000002', 'Q-000003', 'Q-000004']
  ))
  const state = withSlots(base, base.slots.map((s) => {
    if (s.slotId === 'slot-a') return s
    if (s.slotId === 'slot-b') return { ...s, occupancy: { state: 'rejected' as const, reservedCandidateCode: null, assignedCandidateCode: null } }
    if (s.slotId === 'slot-c') return { ...s, occupancy: { state: 'released' as const, reservedCandidateCode: null, assignedCandidateCode: null } }
    return { ...s, occupancy: { state: 'locked' as const, reservedCandidateCode: null, assignedCandidateCode: 'Q-000004' } }
  }))
  const result = finalize(state)
  assert.equal(finalizedSlot(result, 'slot-a')?.occupancy.state, 'open')
  assert.equal(finalizedSlot(result, 'slot-b')?.occupancy.state, 'rejected')
  assert.equal(finalizedSlot(result, 'slot-c')?.occupancy.state, 'released')
  assert.equal(finalizedSlot(result, 'slot-d')?.occupancy.state, 'locked')
}

function returns_only_stage_eight_fields(): void {
  const a = slot(1, 'slot-a')
  const state = assign(runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])), {
    'slot-a': 'Q-000001',
  })
  const result = finalize(state)
  assert.deepEqual(Object.keys(result).sort(), [
    'finalizationSummary',
    'finalizedAllocationState',
    'finalizedDiagnostics',
  ])
}

function invalid_validation_gate_fails_loud(): void {
  const a = slot(1, 'slot-a')
  const state = runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  assert.throws(() => finalizeAllocationState(state, invalidGate(state)), /validation did not pass/)
}

function validation_total_slot_mismatch_fails_loud(): void {
  const a = slot(1, 'slot-a')
  const state = runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  const gate = {
    ...validGate(state),
    validationSummary: { ...validGate(state).validationSummary, totalSlotCount: 2 },
  }
  assert.throws(() => finalizeAllocationState(state, gate), /totalSlotCount does not match/)
}

function live_reservation_fails_loud(): void {
  const a = slot(1, 'slot-a')
  const base = runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001']))
  const state = withSlots(base, base.slots.map((s) => ({
    ...s,
    occupancy: { state: 'reserved' as const, reservedCandidateCode: 'Q-000001', assignedCandidateCode: null },
  })))
  assert.throws(() => finalize(state), /live Reservation/)
}

function duplicate_assignment_fails_loud(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const state = assign(runtime(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000001']),
    ],
    ['Q-000001']
  )), { 'slot-a': 'Q-000001', 'slot-b': 'Q-000001' })
  assert.throws(() => finalize(state), /multiple Slots/)
}

function ineligible_assignment_fails_loud(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const state = assign(runtime(rankedCandidateSet(
    [
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  )), { 'slot-a': 'Q-000002' })
  assert.throws(() => finalize(state), /not eligible/)
}

function finalized_state_is_a_fresh_immutable_snapshot(): void {
  const a = slot(1, 'slot-a')
  const state = assign(runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])), {
    'slot-a': 'Q-000001',
  })
  const result = finalize(state)
  assert.notEqual(result.finalizedAllocationState, state)
  assert.notEqual(result.finalizedAllocationState.slots, state.slots)
  assert.equal(state.slots[0]!.occupancy.state, 'allocated')
  assert.equal(result.finalizedAllocationState.slots[0]!.occupancy.state, 'locked')
}

function deterministic_same_input_same_output(): void {
  const a = slot(1, 'slot-a')
  const b = slot(1, 'slot-b')
  const state = assign(runtime(rankedCandidateSet(
    [
      rankedSlot(b.slotId, b.slot, ['Q-000002']),
      rankedSlot(a.slotId, a.slot, ['Q-000001']),
    ],
    ['Q-000001', 'Q-000002']
  )), { 'slot-a': 'Q-000001', 'slot-b': 'Q-000002' })
  assert.equal(stableStringify(finalize(state)), stableStringify(finalize(state)))
}

function does_not_mutate_inputs(): void {
  const a = slot(1, 'slot-a')
  const state = assign(runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])), {
    'slot-a': 'Q-000001',
  })
  const gate = validGate(state)
  const beforeState = stableStringify(state)
  const beforeGate = stableStringify(gate)
  finalizeAllocationState(state, gate)
  assert.equal(stableStringify(state), beforeState)
  assert.equal(stableStringify(gate), beforeGate)
}

function read_only_helpers_return_expected_views(): void {
  const a = slot(1, 'slot-a')
  const state = assign(runtime(rankedCandidateSet([rankedSlot(a.slotId, a.slot, ['Q-000001'])], ['Q-000001'])), {
    'slot-a': 'Q-000001',
  })
  const result = finalize(state)
  assert.equal(isFinalizationComplete(result), true)
  assert.equal(finalizedSlot(result, 'slot-a')?.occupancy.state, 'locked')
  assert.equal(finalizedCandidate(result, 'Q-000001')?.assignedSlotId, 'slot-a')
  assert.deepEqual(lockedSlotIds(result), ['slot-a'])
}

// ═══ Source boundaries ══════════════════════════════════════════════════════

function source_has_no_forbidden_dependencies_or_hidden_state(): void {
  const source = readFileSync(path.join(__dirname, 'finalization.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/^let\s+/m.test(source))
  assert.ok(!/^var\s+/m.test(source))
}

function source_does_not_import_later_stage_modules_or_solver_output(): void {
  const source = readFileSync(path.join(__dirname, 'finalization.ts'), 'utf8')
  assert.ok(!source.includes("from './contracts'") || !source.includes('AllocatedCandidateSet'))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
  assert.ok(!/function\s+(emit|search|backtrack|replace|reserve|validateResolvedAllocation)/.test(source))
}

function source_uses_only_runtime_and_validation_inputs(): void {
  const source = readFileSync(path.join(__dirname, 'finalization.ts'), 'utf8')
  assert.ok(!source.includes("from './placement'"))
  assert.ok(!source.includes("from './conflict-detection'"))
  assert.ok(!source.includes("from './conflict-resolution'"))
  assert.ok(!source.includes("from './constraints'"))
}

// ═══ runner ════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'locks allocated Slots and recomputes Candidate assignments', fn: locks_allocated_slots_and_recomputes_candidate_assignments },
  { name: 'preserves open/rejected/released/locked Slots', fn: preserves_open_rejected_released_and_locked_slots },
  { name: 'returns only Stage 8 fields', fn: returns_only_stage_eight_fields },
  { name: 'invalid validation gate fails loud', fn: invalid_validation_gate_fails_loud },
  { name: 'validation total Slot mismatch fails loud', fn: validation_total_slot_mismatch_fails_loud },
  { name: 'live Reservation fails loud', fn: live_reservation_fails_loud },
  { name: 'duplicate assignment fails loud', fn: duplicate_assignment_fails_loud },
  { name: 'ineligible assignment fails loud', fn: ineligible_assignment_fails_loud },
  { name: 'finalized state is a fresh immutable snapshot', fn: finalized_state_is_a_fresh_immutable_snapshot },
  { name: 'deterministic: same input -> same output', fn: deterministic_same_input_same_output },
  { name: 'does not mutate inputs', fn: does_not_mutate_inputs },
  { name: 'read-only helpers return expected views', fn: read_only_helpers_return_expected_views },
  { name: 'source has no forbidden dependencies or hidden state', fn: source_has_no_forbidden_dependencies_or_hidden_state },
  { name: 'source does not import later stage modules or Solver output', fn: source_does_not_import_later_stage_modules_or_solver_output },
  { name: 'source uses only Runtime and Validation inputs', fn: source_uses_only_runtime_and_validation_inputs },
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
