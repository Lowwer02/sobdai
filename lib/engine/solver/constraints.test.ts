/**
 * lib/engine/solver/constraints.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.2 — Constraint Satisfaction tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4 (Constraint Categories),
 *     §4.3 (Priority), §5 (Constraint Evaluation Lifecycle), §8 (Feasibility),
 *     §11 (Failure Handling), §18.1 (Generator ceiling).
 *   - Allocation Model Specification v1.0 §4.1, §5, §7, §12.
 *
 * Scope verified: these tests cover ONLY Constraint Satisfaction — the
 * read-only evaluator. They do NOT test conflict resolution, replacement,
 * backtracking, search, or AllocatedCandidateSet emission (later sessions).
 *
 * RUN: npx jiti lib/engine/solver/constraints.test.ts
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
import type {
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
} from '../ranking/contracts'
import { assertOrderInvariant, stableStringify } from '../shared/testing/determinism'
import {
  initializeAllocationRuntime,
  type AllocationRuntimeState,
  type CandidateRuntimeState,
  type SlotOccupancy,
  type SlotRuntimeState,
} from './runtime'
import {
  CONSTRAINT_SATISFACTION_VALUES,
  evaluateConstraints,
  getEvaluation,
  hardViolations,
  hasHardViolation,
  isSatisfied,
  remainingCapacity,
  type ConstraintEvaluationState,
  type ConstraintId,
} from './constraints'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── fixture factories (mirror runtime.test.ts) ────────────────────────────

function mkSlot(overrides?: Partial<BlueprintSlot>): BlueprintSlot {
  return {
    setNumber: 1,
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    document: 'พ.ร.บ.ทดสอบ 2560',
    learningObjective: 'LO1',
    ...overrides,
  }
}

function mkSignal(overrides?: Partial<RawSignal>): RawSignal {
  return {
    questionCode: 'Q-000001',
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
    ...overrides,
  }
}

function mkConfidence(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function mkComponent(overrides?: Partial<ScoreComponent>): ScoreComponent {
  return {
    componentId: 'difficulty_fit',
    questionCode: 'Q-000001',
    slot: mkSlot(),
    normalized: { value: 0.9, scale: 'exact-match' },
    inputs: [mkSignal()],
    reasoning: 'Difficulty Fit = full match.',
    confidence: mkConfidence(),
    penalties: [],
    ...overrides,
  }
}

function mkComposite(overrides?: Partial<CompositeScore>): CompositeScore {
  const component = mkComponent()
  const contribution: ComponentContribution = {
    component,
    contribution: 0.15,
    reason: 'weight 0.15; full match',
  }
  return {
    questionCode: 'Q-000001',
    slot: mkSlot(),
    value: 0.82,
    breakdown: { contributions: [contribution], aggregationNote: 'weighted mean' },
    confidence: mkConfidence(),
    penalties: [],
    ...overrides,
  }
}

interface CandidateSpec {
  code: string
  document?: string
  topic?: string | null
  difficulty?: 'Easy' | 'Medium' | 'Hard'
  blueprintType?: 'Memory' | 'Concept' | 'Procedure' | 'Scenario' | null
  tier?: 1 | 2 | 3 | 4
}

function mkCandidate(spec: CandidateSpec = { code: 'Q-000001' }): Candidate {
  return {
    identity: { questionCode: spec.code, questionId: `uuid-${spec.code}` },
    metadata: {
      document: spec.document ?? 'พ.ร.บ.ทดสอบ 2560',
      difficulty: spec.difficulty ?? 'Easy',
      topic: spec.topic === undefined ? 'หลักการ' : spec.topic,
      status: 'Published',
      tier: spec.tier ?? 1,
      blueprintType: spec.blueprintType === undefined ? 'Memory' : spec.blueprintType,
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'ม.6-8',
      tags: ['tag1'],
      category: 'cat',
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document'],
      eligibleSlots: [mkSlot()],
      coverageSatisfied: ['CR-1'],
      source: { kind: 'metadata_query', queryId: 'q1' },
    },
  }
}

function mkCandidateSet(candidates: Candidate[], bindings?: CandidateSet['coverageSatisfaction']): CandidateSet {
  return {
    identity: { assemblyRequestId: 'assembly-1', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates,
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction:
      bindings ??
      ({ bindings: [] } as CandidateSet['coverageSatisfaction']),
    warnings: [],
    statistics: {
      totalCandidates: candidates.length,
      fullConfidenceCount: candidates.length,
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

function rankedAt(code: string, rank: number): RankedCandidate {
  const composite = mkComposite({ questionCode: code })
  const signals = [mkSignal({ questionCode: code })]
  return {
    code,
    rank,
    tieGroupId: null,
    composite,
    confidence: composite.confidence,
    penalties: composite.penalties,
    signals,
    orderingReason: {
      summary: 'Top composite value.',
      determiningFacets: ['composite.value'],
      neighborComparison: null,
      tieStatus: { tieGroupId: null, memberCodes: [], tieBreaker: null },
    },
    auditTrail: {
      candidateCode: code,
      signals,
      componentIds: ['difficulty_fit'],
      composite,
      confidence: composite.confidence,
      penalties: composite.penalties,
      rank,
    },
  }
}

/** Build a RankedCandidateSet with given slots, candidates, and coverage. */
function mkRankedCandidateSet(args: {
  candidates: Candidate[]
  slots: Array<{ slotId: string; slot: BlueprintSlot; ranked: RankedCandidate[] }>
  coverageBindings?: CandidateSet['coverageSatisfaction']
}): RankedCandidateSet {
  const candidateSet = mkCandidateSet(args.candidates, args.coverageBindings)
  const rankedSlots: RankedSlot[] = args.slots.map((s) => ({
    slotId: s.slotId,
    slot: s.slot,
    rankedCandidates: s.ranked,
    slotSummary: {
      tieGroups: [],
      topOfSlotRationale: 'Top composite value.',
      orderingKey: { facets: ['composite.value'], description: 'Fixed inspectable ordering key.' },
    },
  }))
  return {
    identity: {
      candidateSetId: candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet,
    slots: rankedSlots,
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    warnings: candidateSet.warnings,
    meta: { specVersion: '1.0', rankingVersion: '1.0.0', scoringModelVersion: '1.0' },
  }
}

// ─── Runtime State snapshot builder (places Candidates for evaluation tests) ─
// E-4C.1 only produces all-open states. To exercise the evaluator against real
// occupancy we construct snapshots directly. Building a snapshot is NOT search
// or placement logic — it is test-fixture construction of immutable data.

interface PlacedSlot {
  slotId: string
  slot: BlueprintSlot
  /** Codes under consideration for this slot (eligibility). */
  candidateCodes: string[]
  /** Occupancy override (default: open). */
  occupancy?: SlotOccupancy
}

function openOccupancy(): SlotOccupancy {
  return { state: 'open', reservedCandidateCode: null, assignedCandidateCode: null }
}
function allocatedOccupancy(code: string): SlotOccupancy {
  return { state: 'allocated', reservedCandidateCode: null, assignedCandidateCode: code }
}
function reservedOccupancy(code: string): SlotOccupancy {
  return { state: 'reserved', reservedCandidateCode: code, assignedCandidateCode: null }
}

function buildRuntimeState(
  placedSlots: PlacedSlot[],
  rcs: RankedCandidateSet
): AllocationRuntimeState {
  const slots: SlotRuntimeState[] = placedSlots
    .map((p) => ({
      slotId: p.slotId,
      slot: p.slot,
      candidateCodes: p.candidateCodes,
      occupancy: p.occupancy ?? openOccupancy(),
      reservationHistory: [],
      replacementHistory: [],
      conflicts: [],
    }))
    .sort((a, b) => compareStrings(a.slotId, b.slotId))

  const slotsById = new Map(slots.map((s) => [s.slotId, s]))

  // Reconstruct candidate runtime state from placed slots.
  const byCode = new Map<string, { slotIds: string[]; priorities: Map<string, number> }>()
  for (const slot of slots) {
    slot.candidateCodes.forEach((code, index) => {
      const entry =
        byCode.get(code) ?? { slotIds: [] as string[], priorities: new Map<string, number>() }
      entry.slotIds.push(slot.slotId)
      entry.priorities.set(slot.slotId, index + 1)
      byCode.set(code, entry)
    })
  }
  const candidates: CandidateRuntimeState[] = [...byCode.entries()]
    .map(([code, entry]) => ({
      candidateCode: code,
      considerationSlotIds: [...entry.slotIds].sort(compareStrings),
      inheritedPrioritySlotIds: new Map(entry.priorities),
      reservedSlotId: null,
      assignedSlotId: null,
    }))
    .sort((a, b) => compareStrings(a.candidateCode, b.candidateCode))
  const candidatesByCode = new Map(candidates.map((c) => [c.candidateCode, c]))

  return {
    rankedCandidateSet: rcs,
    slots,
    slotsById,
    candidates,
    candidatesByCode,
    progress: {
      totalSlots: slots.length,
      openSlotCount: slots.filter((s) => s.occupancy.state === 'open').length,
      reservedSlotCount: slots.filter((s) => s.occupancy.state === 'reserved').length,
      allocatedSlotCount: slots.filter((s) => s.occupancy.state === 'allocated').length,
      lockedSlotCount: slots.filter((s) => s.occupancy.state === 'locked').length,
      rejectedSlotCount: slots.filter((s) => s.occupancy.state === 'rejected').length,
      releasedSlotCount: slots.filter((s) => s.occupancy.state === 'released').length,
      totalCandidates: candidates.length,
      reservedCandidateCount: 0,
      assignedCandidateCount: slots.filter((s) => s.occupancy.assignedCandidateCode !== null).length,
      unresolvedConflictCount: 0,
    },
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// A minimal but complete RankedCandidateSet for most tests.
function baseRcs(candidates: Candidate[], coverageBindings?: CandidateSet['coverageSatisfaction']): RankedCandidateSet {
  return mkRankedCandidateSet({
    candidates,
    slots: candidates.slice(0, 1).map((c) => ({
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt(c.identity.questionCode, 1)],
    })),
    coverageBindings,
  })
}

// ═══ Vocabulary stability ═════════════════════════════════════════════════

function constraint_satisfaction_vocabulary_is_exact(): void {
  // Solver §5.2 — exactly four satisfaction outcomes. No invented states.
  const s = [...CONSTRAINT_SATISFACTION_VALUES].sort()
  assert.deepEqual(s, ['dependency_unmet', 'satisfied', 'strained', 'violated'])
  assert.equal(CONSTRAINT_SATISFACTION_VALUES.length, 4)
}

// ═══ Empty / init snapshot: everything satisfiable, no violations ══════════

function empty_runtime_state_has_no_violations(): void {
  const rcs = baseRcs([mkCandidate({ code: 'Q-000001' })])
  const init = initializeAllocationRuntime(rcs)
  const state = evaluateConstraints(init)
  assert.equal(state.feasibility.hardViolationCount, 0)
  assert.equal(state.conflicts.length, 0)
  assert.equal(state.diagnostics.length, 0)
  assert.equal(state.feasibility.noHardViolations, true)
}

function capacity_evaluations_present_for_every_slot(): void {
  const rcs = baseRcs([mkCandidate({ code: 'Q-000001' })])
  const init = initializeAllocationRuntime(rcs)
  const state = evaluateConstraints(init)
  assert.equal(state.capacities.length, init.slots.length)
  for (const cap of state.capacities) {
    assert.equal(cap.capacity, 1)
    assert.equal(cap.occupied, 0)
    assert.equal(cap.remaining, 1)
  }
}

function all_slots_valid_on_empty_state(): void {
  const rcs = baseRcs([mkCandidate({ code: 'Q-000001' })])
  const init = initializeAllocationRuntime(rcs)
  const state = evaluateConstraints(init)
  assert.equal(state.validity.allSlotsValid, true)
  assert.equal(state.validity.validSlotCount, init.slots.length)
  assert.equal(state.validity.filledSlotCount, 0)
  assert.equal(state.validity.openSlotCount, init.slots.length)
}

// ═══ Capacity / occupancy / single-assignment (structural) ═════════════════

function reserved_slot_counts_as_occupied_with_remaining_zero(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: reservedOccupancy('Q-000001') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  const cap = state.capacities.find((c) => c.slotId === 'slot-1')
  assert.ok(cap)
  assert.equal(cap.occupied, 1)
  assert.equal(cap.remaining, 0)
}

function allocated_slot_counts_as_filled(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  assert.equal(state.validity.filledSlotCount, 1)
  assert.equal(state.validity.openSlotCount, 0)
  assert.equal(state.validity.assignedCandidateCount, 1)
  // No violations: single assignment, eligible, within capacity.
  assert.equal(state.feasibility.hardViolationCount, 0)
}

// ═══ Placement eligibility ═════════════════════════════════════════════════

function placement_eligibility_violates_when_candidate_not_under_consideration(): void {
  const cands = [mkCandidate({ code: 'Q-000001' }), mkCandidate({ code: 'Q-000002' })]
  const rcs = baseRcs(cands)
  // Slot only considered Q-000001, but Q-000002 is allocated there.
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000002') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  const elig = state.evaluations.find((e) => e.constraintId === 'placement_eligibility')
  assert.ok(elig)
  assert.equal(elig.satisfaction, 'violated')
  assert.equal(elig.severity, 'Fatal')
  assert.equal(state.feasibility.hardViolationCount, 1)
  assert.ok(hasHardViolation(state))
}

function placement_eligibility_satisfied_when_candidate_is_under_consideration(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  assert.ok(isSatisfied(state, 'placement_eligibility'))
}

// ═══ Defect 2: Blueprint constraints are NOT faked as satisfied ════════════
// Blueprint rules (L1–L5 duplicate prevention, CR-1–CR-5 coverage, distribution
// tier/sum/anchor) are owned by the AssemblyRequest, which does not reach the
// Solver. The evaluator must NOT report satisfied/violated verdicts for them —
// that would invent rule content (AP-9) and fake feasibility (Solver §8.5).

function does_not_evaluate_l1_duplicate_prevention(): void {
  // Two candidates in Set 1 sharing Topic+Difficulty+Type would be an L1
  // collision — but L1's rule declaration (scope/level) is AssemblyRequest-owned
  // and not in the Runtime State. The evaluator must not fabricate a verdict.
  const cands = [
    mkCandidate({ code: 'Q-000001', topic: 'หลักการ', difficulty: 'Easy', blueprintType: 'Memory' }),
    mkCandidate({ code: 'Q-000002', topic: 'หลักการ', difficulty: 'Easy', blueprintType: 'Memory' }),
  ]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      { slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
      { slotId: 'slot-b', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000002'], occupancy: allocatedOccupancy('Q-000002') },
    ],
    rcs
  )
  const state = evaluateConstraints(runtime)
  const evaluatedIds = new Set(state.evaluations.map((e) => e.constraintId))
  assert.equal(
    evaluatedIds.has('l1_within_set_uniqueness' as ConstraintId),
    false,
    'L1 duplicate prevention must not be evaluated (rule content unreachable)'
  )
  // No L1 conflict is materialized either.
  assert.equal(
    state.conflicts.some((c) => c.constraintId === 'l1_within_set_uniqueness' as ConstraintId),
    false
  )
}

function does_not_evaluate_cr1_coverage_presence(): void {
  // CR-1 enforcement level ('hard'/'soft') is AssemblyRequest-owned. The
  // evaluator must not fabricate a satisfied/violated verdict for coverage.
  const cands = [mkCandidate({ code: 'Q-000001', document: 'Doc-A', topic: 'Topic-X' })]
  const rcs = mkRankedCandidateSet({
    candidates: cands,
    slots: [{ slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] }],
    coverageBindings: {
      bindings: [{ document: 'Doc-A', topic: 'Topic-X', satisfyingCodes: ['Q-000001'] }],
    },
  })
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'] }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  const evaluatedIds = new Set(state.evaluations.map((e) => e.constraintId))
  assert.equal(
    evaluatedIds.has('cr1_mandatory_topic_presence' as ConstraintId),
    false,
    'CR-1 coverage presence must not be evaluated (rule content unreachable)'
  )
}

function only_allocation_validity_constraints_are_evaluated(): void {
  // The evaluator's ConstraintId set is exactly the four allocation-validity
  // constraints whose content is structural to the Runtime State.
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  const evaluatedIds = new Set(state.evaluations.map((e) => e.constraintId))
  assert.deepEqual(
    [...evaluatedIds].sort(),
    ['allocation_capacity', 'placement_eligibility', 'single_assignment', 'valid_occupancy']
  )
}

// ═══ Defect 3: assigned candidate missing from CandidateSet fails loud ════

function rejects_assigned_candidate_missing_from_candidate_set(): void {
  // A slot allocated to a Candidate code that has no record in the CandidateSet
  // is structural corruption — never silently skipped (Allocation §12.1).
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-999999') }],
    rcs
  )
  assert.throws(() => evaluateConstraints(runtime), /missing from the CandidateSet/)
}

// ═══ Defect 4: completed runtime state rejected ════════════════════════════

function rejects_completed_runtime_state(): void {
  // 'completed' is a post-Review terminal state (Allocation §5.1) owned by the
  // Reviewer — unreachable during Solver evaluation. Its presence is structural
  // corruption.
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      {
        slotId: 'slot-1',
        slot: mkSlot(),
        candidateCodes: ['Q-000001'],
        occupancy: { state: 'completed', reservedCandidateCode: null, assignedCandidateCode: 'Q-000001' },
      },
    ],
    rcs
  )
  assert.throws(() => evaluateConstraints(runtime), /'completed' state/)
}

// ═══ Read-only constraint helpers ══════════════════════════════════════════

function get_evaluation_returns_by_id(): void {
  const rcs = baseRcs([mkCandidate({ code: 'Q-000001' })])
  const state = evaluateConstraints(initializeAllocationRuntime(rcs))
  assert.ok(getEvaluation(state, 'allocation_capacity'))
  assert.equal(getEvaluation(state, 'nonexistent' as never), undefined)
}

function is_satisfied_reports_allocation_capacity_on_empty_state(): void {
  const rcs = baseRcs([mkCandidate({ code: 'Q-000001' })])
  const state = evaluateConstraints(initializeAllocationRuntime(rcs))
  // allocation_capacity is satisfied on the empty state.
  assert.equal(isSatisfied(state, 'allocation_capacity'), true)
}

function remaining_capacity_helper(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  assert.equal(remainingCapacity(state, 'slot-1'), 0)
  assert.equal(remainingCapacity(state, 'missing'), undefined)
}

function hard_violations_helper_lists_only_hard(): void {
  // Use placement_eligibility as the violation source (allocation-validity,
  // content present in the Runtime State). L1 is no longer evaluated.
  const cands = [mkCandidate({ code: 'Q-000001' }), mkCandidate({ code: 'Q-000002' })]
  const rcs = baseRcs(cands)
  // Slot considers only Q-000001, but Q-000002 is allocated there → violation.
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000002') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  const hv = hardViolations(state)
  assert.ok(hv.length >= 1)
  for (const e of hv) assert.equal(e.satisfaction, 'violated')
}

// ═══ Feasibility tracking ══════════════════════════════════════════════════

function feasibility_reflects_violation_counts(): void {
  // Use placement_eligibility as the violation source.
  const cands = [mkCandidate({ code: 'Q-000001' }), mkCandidate({ code: 'Q-000002' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000002') }],
    rcs
  )
  const state = evaluateConstraints(runtime)
  assert.ok(state.feasibility.hardViolationCount >= 1)
  assert.equal(state.feasibility.noHardViolations, false)
}

// ═══ Fatal guards (Solver §11.1; Allocation §12.1) ═════════════════════════

function rejects_candidate_assigned_to_two_slots(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      { slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
      { slotId: 'slot-b', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
    ],
    rcs
  )
  assert.throws(() => evaluateConstraints(runtime), /assigned to multiple Slots/)
}

function rejects_slot_over_capacity(): void {
  // Reserved + assigned simultaneously is structurally impossible in a single
  // SlotOccupancy (one reserved code + one assigned code = 2 occupants).
  const cands = [mkCandidate({ code: 'Q-000001' }), mkCandidate({ code: 'Q-000002' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      {
        slotId: 'slot-a',
        slot: mkSlot(),
        candidateCodes: ['Q-000001', 'Q-000002'],
        occupancy: { state: 'reserved', reservedCandidateCode: 'Q-000001', assignedCandidateCode: 'Q-000002' },
      },
    ],
    rcs
  )
  assert.throws(() => evaluateConstraints(runtime), /over capacity/)
}

function rejects_open_slot_with_occupant(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      {
        slotId: 'slot-a',
        slot: mkSlot(),
        candidateCodes: ['Q-000001'],
        occupancy: { state: 'open', reservedCandidateCode: null, assignedCandidateCode: 'Q-000001' },
      },
    ],
    rcs
  )
  assert.throws(() => evaluateConstraints(runtime), /cannot carry an occupant/)
}

function rejects_allocated_slot_without_assigned_code(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      {
        slotId: 'slot-a',
        slot: mkSlot(),
        candidateCodes: ['Q-000001'],
        occupancy: { state: 'allocated', reservedCandidateCode: null, assignedCandidateCode: null },
      },
    ],
    rcs
  )
  assert.throws(() => evaluateConstraints(runtime), /requires an assigned occupant/)
}

// ═══ Immutability & read-only (Solver §3.3; E-4C.2 mandate) ════════════════

function does_not_mutate_input_runtime_state(): void {
  const cands = [mkCandidate({ code: 'Q-000001' })]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [{ slotId: 'slot-1', slot: mkSlot(), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') }],
    rcs
  )
  const before = stableStringify(runtime)
  evaluateConstraints(runtime)
  const after = stableStringify(runtime)
  assert.equal(before, after, 'evaluateConstraints must not mutate its input')
}

function output_is_immutable_readonly_shape(): void {
  const rcs = baseRcs([mkCandidate({ code: 'Q-000001' })])
  const state = evaluateConstraints(initializeAllocationRuntime(rcs))
  // @ts-expect-error — evaluations is readonly
  state.evaluations = []
  // @ts-expect-error — feasibility is readonly
  state.feasibility = { hardViolationCount: 0, softStrainCount: 0, unmetDependencyCount: 0, noHardViolations: false }
  assert.ok(state.evaluations.length >= 0)
}

// ═══ Determinism (Solver §9) ═══════════════════════════════════════════════

function is_deterministic_across_invocations(): void {
  const cands = [
    mkCandidate({ code: 'Q-000001', topic: 'T', difficulty: 'Easy', blueprintType: 'Memory' }),
    mkCandidate({ code: 'Q-000002', topic: 'T', difficulty: 'Easy', blueprintType: 'Memory' }),
  ]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      { slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
      { slotId: 'slot-b', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000002'], occupancy: allocatedOccupancy('Q-000002') },
    ],
    rcs
  )
  const s1 = stableStringify(derivedForm(evaluateConstraints(runtime)))
  const s2 = stableStringify(derivedForm(evaluateConstraints(runtime)))
  assert.equal(s1, s2)
}

function is_order_invariant_on_slot_order(): void {
  // Same occupancy content, different slot input order → same derived evaluation.
  const cands = [
    mkCandidate({ code: 'Q-000001', topic: 'T1', difficulty: 'Easy', blueprintType: 'Memory' }),
    mkCandidate({ code: 'Q-000002', topic: 'T2', difficulty: 'Hard', blueprintType: 'Concept' }),
  ]
  const rcs = baseRcs(cands)
  const slotsA = [
    { slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
    { slotId: 'slot-b', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000002'], occupancy: allocatedOccupancy('Q-000002') },
  ]
  const slotsB = [slotsA[1]!, slotsA[0]!]
  const a = stableStringify(derivedForm(evaluateConstraints(buildRuntimeState(slotsA, rcs))))
  const b = stableStringify(derivedForm(evaluateConstraints(buildRuntimeState(slotsB, rcs))))
  assert.equal(a, b, 'slot input order must not leak into evaluation output')
}

function property_order_invariant_on_shuffled_evaluations(): void {
  const cands = [
    mkCandidate({ code: 'Q-000001', topic: 'T1', difficulty: 'Easy', blueprintType: 'Memory' }),
    mkCandidate({ code: 'Q-000002', topic: 'T2', difficulty: 'Hard', blueprintType: 'Concept' }),
    mkCandidate({ code: 'Q-000003', topic: 'T3', difficulty: 'Medium', blueprintType: 'Procedure' }),
  ]
  const rcs = baseRcs(cands)
  const makeSlots = () => [
    { slotId: 'slot-c', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000003'], occupancy: allocatedOccupancy('Q-000003') },
    { slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
    { slotId: 'slot-b', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000002'], occupancy: allocatedOccupancy('Q-000002') },
  ]
  assertOrderInvariant(
    (slots) => derivedForm(evaluateConstraints(buildRuntimeState(slots, rcs))),
    makeSlots(),
    { runs: 40, seed: 11 }
  )
}

/** Project to the Solver-produced evaluation fields (exclude carried input ref). */
function derivedForm(state: ConstraintEvaluationState): unknown {
  return {
    evaluations: state.evaluations,
    diagnostics: state.diagnostics,
    conflicts: state.conflicts,
    capacities: state.capacities,
    validity: state.validity,
    feasibility: state.feasibility,
  }
}

// ═══ Scope boundary — does NOT perform resolution/placement/search ═════════

function conflicts_are_always_unresolved_at_this_stage(): void {
  const cands = [
    mkCandidate({ code: 'Q-000001', topic: 'T', difficulty: 'Easy', blueprintType: 'Memory' }),
    mkCandidate({ code: 'Q-000002', topic: 'T', difficulty: 'Easy', blueprintType: 'Memory' }),
  ]
  const rcs = baseRcs(cands)
  const runtime = buildRuntimeState(
    [
      { slotId: 'slot-a', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000001'], occupancy: allocatedOccupancy('Q-000001') },
      { slotId: 'slot-b', slot: mkSlot({ setNumber: 1 }), candidateCodes: ['Q-000002'], occupancy: allocatedOccupancy('Q-000002') },
    ],
    rcs
  )
  const state = evaluateConstraints(runtime)
  for (const c of state.conflicts) {
    assert.equal(c.resolution, 'unresolved', 'Conflict Resolution is a later stage')
  }
}

// ═══ Source purity ═════════════════════════════════════════════════════════

function constraints_file_has_no_forbidden_imports_or_apis(): void {
  const source = readFileSync(path.join(__dirname, 'constraints.ts'), 'utf8')
  const forbidden = [
    'from "../reader"',
    'from "@supabase',
    'from "next"',
    'from "react"',
    'Math.random',
    'Date.now',
    'process.hrtime',
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `constraints.ts must not reference: ${token}`)
  }
}

function constraints_file_does_not_resolve_or_search(): void {
  const source = readFileSync(path.join(__dirname, 'constraints.ts'), 'utf8')
  // E-4C.2 is evaluation only. The implementation must not contain
  // resolution/placement/search machinery. (We check function signatures, not
  // bare words, so the module's docstrings — which say "Does NOT backtrack" —
  // don't trip a false positive.)
  const forbidden = [
    'function resolveConflict',
    'function resolve ',
    'function replace',
    'function backtrack',
    'function search',
    'function reserve',
    'function assign',
    'function place',
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `constraints.ts (E-4C.2) must not implement: ${token}`)
  }
}

function constraints_file_does_not_redefine_upstream_contracts(): void {
  const source = readFileSync(path.join(__dirname, 'constraints.ts'), 'utf8')
  const forbiddenDeclarations = [
    'interface CandidateSet',
    'interface RankedCandidateSet',
    'interface AllocationRuntimeState',
    'interface SlotRuntimeState',
    'type ConstraintCategory',
    'type ConstraintPriority',
    'type FeasibilityState',
    'type ConflictType',
  ]
  for (const declaration of forbiddenDeclarations) {
    assert.ok(!source.includes(declaration), `constraints.ts must import, not redefine: ${declaration}`)
  }
}

// ═══ runner ═══════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'ConstraintSatisfaction vocabulary is exact (Solver §5.2)', fn: constraint_satisfaction_vocabulary_is_exact },
  { name: 'Empty Runtime State has no violations', fn: empty_runtime_state_has_no_violations },
  { name: 'Capacity evaluations present for every Slot', fn: capacity_evaluations_present_for_every_slot },
  { name: 'All Slots valid on empty state', fn: all_slots_valid_on_empty_state },
  { name: 'Reserved Slot counts as occupied (remaining 0)', fn: reserved_slot_counts_as_occupied_with_remaining_zero },
  { name: 'Allocated Slot counts as filled', fn: allocated_slot_counts_as_filled },
  { name: 'placement_eligibility violates when not under consideration', fn: placement_eligibility_violates_when_candidate_not_under_consideration },
  { name: 'placement_eligibility satisfied when under consideration', fn: placement_eligibility_satisfied_when_candidate_is_under_consideration },
  { name: 'Does NOT evaluate L1 duplicate prevention (Defect 2: no fake Blueprint success)', fn: does_not_evaluate_l1_duplicate_prevention },
  { name: 'Does NOT evaluate CR-1 coverage presence (Defect 2: no fake Blueprint success)', fn: does_not_evaluate_cr1_coverage_presence },
  { name: 'Only allocation-validity constraints are evaluated', fn: only_allocation_validity_constraints_are_evaluated },
  { name: 'Rejects assigned candidate missing from CandidateSet (Defect 3: fail loud)', fn: rejects_assigned_candidate_missing_from_candidate_set },
  { name: 'Rejects completed runtime state (Defect 4: structural corruption)', fn: rejects_completed_runtime_state },
  { name: 'getEvaluation returns by id', fn: get_evaluation_returns_by_id },
  { name: 'isSatisfied reports allocation_capacity on empty state', fn: is_satisfied_reports_allocation_capacity_on_empty_state },
  { name: 'remainingCapacity helper', fn: remaining_capacity_helper },
  { name: 'hardViolations helper lists only Hard', fn: hard_violations_helper_lists_only_hard },
  { name: 'Feasibility reflects violation counts', fn: feasibility_reflects_violation_counts },
  { name: 'Rejects Candidate assigned to two Slots (Fatal)', fn: rejects_candidate_assigned_to_two_slots },
  { name: 'Rejects Slot over capacity (Fatal)', fn: rejects_slot_over_capacity },
  { name: 'Rejects open Slot with occupant (Fatal)', fn: rejects_open_slot_with_occupant },
  { name: 'Rejects allocated Slot without assigned code (Fatal)', fn: rejects_allocated_slot_without_assigned_code },
  { name: 'Does not mutate input Runtime State (Solver §3.3)', fn: does_not_mutate_input_runtime_state },
  { name: 'Output is immutable readonly shape', fn: output_is_immutable_readonly_shape },
  { name: 'Deterministic across invocations (Solver §9)', fn: is_deterministic_across_invocations },
  { name: 'Order-invariant on Slot order (Solver §9.3)', fn: is_order_invariant_on_slot_order },
  { name: 'Property: order-invariant on shuffled evaluations', fn: property_order_invariant_on_shuffled_evaluations },
  { name: 'Conflicts are always unresolved at this stage', fn: conflicts_are_always_unresolved_at_this_stage },
  { name: 'constraints.ts has no forbidden imports or side-effect APIs', fn: constraints_file_has_no_forbidden_imports_or_apis },
  { name: 'constraints.ts does not resolve or search', fn: constraints_file_does_not_resolve_or_search },
  { name: 'constraints.ts does not redefine upstream contracts', fn: constraints_file_does_not_redefine_upstream_contracts },
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
