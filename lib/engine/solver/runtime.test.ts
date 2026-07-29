/**
 * lib/engine/solver/runtime.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.1 — Allocation Runtime Initialization tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.2 (Stage 2), §9 (Determinism),
 *     §11 (Failure Handling), §13 (Solver State), §18.3 (inherited priority).
 *   - Allocation Model Specification v1.0 §4.10, §5.1, §6.2, §8.3.
 *
 * Scope verified: these tests cover ONLY Stage 2 (Initialize Runtime State).
 * They do NOT test constraint satisfaction, placement, conflict resolution,
 * replacement, or AllocatedCandidateSet emission — those belong to later
 * sessions and are out of scope for E-4C.1.
 *
 * RUN: npx jiti lib/engine/solver/runtime.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import type {
  ComponentContribution,
  CompositeScore,
  Penalty,
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
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import {
  considerationOrder,
  getCandidate,
  getSlot,
  inheritedPriority,
  initializeAllocationRuntime,
  isUnderConsideration,
} from './runtime'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── fixture factories (mirror solver/contracts.test.ts) ───────────────────

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

function mkCandidate(): Candidate {
  return {
    identity: { questionCode: 'Q-000001', questionId: 'uuid-1' },
    metadata: {
      document: 'พ.ร.บ.ทดสอบ 2560',
      difficulty: 'Easy',
      topic: 'หลักการ',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
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

function mkCandidateSet(): CandidateSet {
  return {
    identity: { assemblyRequestId: 'assembly-1', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: [mkCandidate()],
    slotIndex: { slots: new Map([['slot-1', ['Q-000001']]]) },
    shortfallReport: { entries: [] },
    coverageSatisfaction: {
      bindings: [{ document: 'พ.ร.บ.ทดสอบ 2560', topic: 'หลักการ', satisfyingCodes: ['Q-000001'] }],
    },
    constraintSnapshot: buildConstraintSnapshot(),
    warnings: [],
    statistics: {
      totalCandidates: 1,
      fullConfidenceCount: 1,
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

function mkRankedCandidate(overrides?: Partial<RankedCandidate>): RankedCandidate {
  const composite = mkComposite()
  const signals = [mkSignal()]
  return {
    code: 'Q-000001',
    rank: 1,
    tieGroupId: null,
    composite,
    confidence: composite.confidence,
    penalties: composite.penalties,
    signals,
    orderingReason: {
      summary: 'Composite value and high confidence put this Candidate first.',
      determiningFacets: ['composite.value', 'confidence.level', 'penalties'],
      neighborComparison: {
        aboveCode: null,
        belowCode: 'Q-000002',
        explanation: 'No Candidate above; next Candidate has lower effective value.',
      },
      tieStatus: { tieGroupId: null, memberCodes: [], tieBreaker: null },
    },
    auditTrail: {
      candidateCode: 'Q-000001',
      signals,
      componentIds: ['difficulty_fit'],
      composite,
      confidence: composite.confidence,
      penalties: composite.penalties,
      rank: 1,
    },
    ...overrides,
  }
}

function mkRankedSlot(overrides?: Partial<RankedSlot>): RankedSlot {
  return {
    slotId: 'slot-1',
    slot: mkSlot(),
    rankedCandidates: [mkRankedCandidate()],
    slotSummary: {
      tieGroups: [],
      topOfSlotRationale: 'Highest composite value with high confidence.',
      orderingKey: {
        facets: ['composite.value', 'confidence.level', 'penalties', 'tieBreaker'],
        description: 'Fixed inspectable ordering key.',
      },
    },
    ...overrides,
  }
}

function mkRankedCandidateSet(overrides?: Partial<RankedCandidateSet>): RankedCandidateSet {
  const candidateSet = mkCandidateSet()
  return {
    identity: {
      candidateSetId: candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet,
    slots: [mkRankedSlot()],
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    constraintSnapshot: candidateSet.constraintSnapshot,
    warnings: candidateSet.warnings,
    meta: { specVersion: '1.0', rankingVersion: '1.0.0', scoringModelVersion: '1.0' },
    ...overrides,
  }
}

/** Build a RankedCandidateSet with N slots, each holding the given candidates. */
function mkRankedCandidateSetMulti(
  slots: Array<{ slotId: string; slot: BlueprintSlot; ranked: RankedCandidate[] }>
): RankedCandidateSet {
  const candidateSet = mkCandidateSet()
  return {
    identity: {
      candidateSetId: candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet,
    slots: slots.map((s) => ({
      slotId: s.slotId,
      slot: s.slot,
      rankedCandidates: s.ranked,
      slotSummary: {
        tieGroups: [],
        topOfSlotRationale: 'Top composite value.',
        orderingKey: {
          facets: ['composite.value'],
          description: 'Fixed inspectable ordering key.',
        },
      },
    })),
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    constraintSnapshot: candidateSet.constraintSnapshot,
    warnings: candidateSet.warnings,
    meta: { specVersion: '1.0', rankingVersion: '1.0.0', scoringModelVersion: '1.0' },
  }
}

/** A RankedCandidate with a distinct code/value at a given rank. */
function rankedAt(code: string, rank: number, value = 0.8): RankedCandidate {
  const composite = mkComposite({ questionCode: code, value })
  const signals = [mkSignal({ questionCode: code })]
  return mkRankedCandidate({
    code,
    rank,
    composite,
    signals,
    auditTrail: {
      candidateCode: code,
      signals,
      componentIds: ['difficulty_fit'],
      composite,
      confidence: composite.confidence,
      penalties: composite.penalties,
      rank,
    },
  })
}

// ═══ Stage 2: Initialize Runtime State — structural correctness ════════════

function initializes_one_runtime_slot_per_blueprint_slot(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'set-1-easy', slot: mkSlot({ setNumber: 1, difficulty: 'Easy' }), ranked: [] },
    { slotId: 'set-1-hard', slot: mkSlot({ setNumber: 1, difficulty: 'Hard' }), ranked: [] },
    { slotId: 'set-2-easy', slot: mkSlot({ setNumber: 2, difficulty: 'Easy' }), ranked: [] },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.equal(state.slots.length, 3)
  assert.equal(state.slotsById.size, 3)
}

function slots_start_open_with_empty_occupancy_and_history(): void {
  const rcs = mkRankedCandidateSet()
  const state = initializeAllocationRuntime(rcs)
  const slot = state.slots[0]
  assert.equal(slot.occupancy.state, 'open')
  assert.equal(slot.occupancy.reservedCandidateCode, null)
  assert.equal(slot.occupancy.assignedCandidateCode, null)
  assert.equal(slot.reservationHistory.length, 0)
  assert.equal(slot.replacementHistory.length, 0)
  assert.equal(slot.conflicts.length, 0)
}

function slots_are_sorted_by_stable_slot_id(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-zeta', slot: mkSlot(), ranked: [] },
    { slotId: 'slot-alpha', slot: mkSlot(), ranked: [] },
    { slotId: 'slot-mid', slot: mkSlot(), ranked: [] },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.deepEqual(
    state.slots.map((s) => s.slotId),
    ['slot-alpha', 'slot-mid', 'slot-zeta']
  )
}

function candidate_codes_preserve_inherited_ranking_order(): void {
  // Solver §18.3 — priority inherited read-only; never re-sorted.
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [
        rankedAt('Q-000003', 1, 0.7), // lower value but ranked first by Ranking
        rankedAt('Q-000001', 2, 0.9),
        rankedAt('Q-000002', 3, 0.8),
      ],
    },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.deepEqual(
    state.slots[0].candidateCodes,
    ['Q-000003', 'Q-000001', 'Q-000002'],
    'consideration order must equal Ranking order, not value order'
  )
}

function candidate_runtime_state_collects_consideration_slots(): void {
  const sharedSlot = mkSlot()
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-a',
      slot: sharedSlot,
      ranked: [rankedAt('Q-000001', 1)],
    },
    {
      slotId: 'slot-b',
      slot: sharedSlot,
      // Ranks strictly increasing within the slot: Q-000002 first, Q-000001 second.
      ranked: [rankedAt('Q-000002', 1), rankedAt('Q-000001', 2)],
    },
  ])
  const state = initializeAllocationRuntime(rcs)

  const c1 = getCandidate(state, 'Q-000001')
  assert.ok(c1)
  // Q-000001 is under consideration for both slots, sorted by slot id.
  assert.deepEqual([...c1.considerationSlotIds], ['slot-a', 'slot-b'])
  // Inherited priorities per slot (1 in slot-a, 2 in slot-b).
  assert.equal(inheritedPriority(state, 'Q-000001', 'slot-a'), 1)
  assert.equal(inheritedPriority(state, 'Q-000001', 'slot-b'), 2)

  const c2 = getCandidate(state, 'Q-000002')
  assert.ok(c2)
  assert.deepEqual([...c2.considerationSlotIds], ['slot-b'])
  assert.equal(inheritedPriority(state, 'Q-000002', 'slot-b'), 1)
}

function candidates_start_unreserved_and_unassigned(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  const c = getCandidate(state, 'Q-000001')
  assert.ok(c)
  assert.equal(c.reservedSlotId, null)
  assert.equal(c.assignedSlotId, null)
}

function candidates_are_sorted_by_code(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000003', 1), rankedAt('Q-000001', 2), rankedAt('Q-000002', 3)],
    },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.deepEqual(
    state.candidates.map((c) => c.candidateCode),
    ['Q-000001', 'Q-000002', 'Q-000003']
  )
}

// ═══ Progress tracking ═════════════════════════════════════════════════════

function progress_reports_all_open_at_init(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-a', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
    { slotId: 'slot-b', slot: mkSlot(), ranked: [rankedAt('Q-000002', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  const p = state.progress
  assert.equal(p.totalSlots, 2)
  assert.equal(p.openSlotCount, 2)
  assert.equal(p.reservedSlotCount, 0)
  assert.equal(p.allocatedSlotCount, 0)
  assert.equal(p.lockedSlotCount, 0)
  assert.equal(p.rejectedSlotCount, 0)
  assert.equal(p.releasedSlotCount, 0)
}

function progress_reports_zero_placement_outcomes_at_init(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-a', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  const p = state.progress
  assert.equal(p.totalCandidates, 1)
  assert.equal(p.reservedCandidateCount, 0)
  assert.equal(p.assignedCandidateCount, 0)
  assert.equal(p.unresolvedConflictCount, 0)
}

function progress_open_equals_total_at_init(): void {
  const rcs = mkRankedCandidateSet()
  const state = initializeAllocationRuntime(rcs)
  assert.equal(state.progress.openSlotCount, state.progress.totalSlots)
}

// ═══ Read-only allocation helpers ══════════════════════════════════════════

function get_slot_returns_slot_by_id(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-x', slot: mkSlot(), ranked: [] },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.ok(getSlot(state, 'slot-x'))
  assert.equal(getSlot(state, 'slot-missing'), undefined)
}

function get_candidate_returns_candidate_by_code(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.ok(getCandidate(state, 'Q-000001'))
  assert.equal(getCandidate(state, 'Q-999999'), undefined)
}

function consideration_order_returns_inherited_order(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000002', 1), rankedAt('Q-000001', 2)],
    },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.deepEqual([...considerationOrder(state, 'slot-1')], ['Q-000002', 'Q-000001'])
  assert.deepEqual([...considerationOrder(state, 'missing')], [])
}

function is_under_consideration_reports_membership(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.equal(isUnderConsideration(state, 'Q-000001', 'slot-1'), true)
  assert.equal(isUnderConsideration(state, 'Q-000001', 'slot-2'), false)
  assert.equal(isUnderConsideration(state, 'Q-999999', 'slot-1'), false)
}

function inherited_priority_returns_undefined_when_absent(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  assert.equal(inheritedPriority(state, 'Q-000001', 'slot-1'), 1)
  assert.equal(inheritedPriority(state, 'Q-000001', 'slot-9'), undefined)
}

// ═══ Runtime validation — Fatal guards (Solver §3.2, §11.1) ════════════════

function rejects_missing_identity(): void {
  const rcs = mkRankedCandidateSet()
  const bad = { ...rcs, identity: undefined } as unknown as RankedCandidateSet
  assert.throws(() => initializeAllocationRuntime(bad), /identity is missing/)
}

function rejects_missing_meta(): void {
  const rcs = mkRankedCandidateSet()
  const bad = { ...rcs, meta: undefined } as unknown as RankedCandidateSet
  assert.throws(() => initializeAllocationRuntime(bad), /meta is missing/)
}

function rejects_unsupported_scoring_model_version(): void {
  const rcs = mkRankedCandidateSet({
    identity: {
      candidateSetId: 'assembly-1',
      scoringModelVersion: '2.0' as '1.0',
      rankingVersion: '1.0.0',
    },
  })
  assert.throws(() => initializeAllocationRuntime(rcs), /unsupported Scoring Model version/)
}

function rejects_unsupported_ranked_spec_version(): void {
  const rcs = mkRankedCandidateSet({
    meta: {
      specVersion: '2.0' as '1.0',
      rankingVersion: '1.0.0',
      scoringModelVersion: '1.0',
    },
  })
  assert.throws(() => initializeAllocationRuntime(rcs), /unsupported RankedCandidateSet spec version/)
}

function rejects_non_array_slots(): void {
  const rcs = mkRankedCandidateSet()
  const bad = { ...rcs, slots: 'nope' } as unknown as RankedCandidateSet
  assert.throws(() => initializeAllocationRuntime(bad), /slots is not an array/)
}

function rejects_empty_slot_id(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: '', slot: mkSlot(), ranked: [] },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /slotId is empty/)
}

function rejects_slot_missing_blueprint_slot(): void {
  const rcs = mkRankedCandidateSet()
  const badSlot = { ...rcs.slots[0], slot: undefined } as unknown as RankedSlot
  const bad = { ...rcs, slots: [badSlot] } as unknown as RankedCandidateSet
  assert.throws(() => initializeAllocationRuntime(bad), /has no Blueprint slot/)
}

function rejects_duplicate_slot_id(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-dup', slot: mkSlot(), ranked: [] },
    { slotId: 'slot-dup', slot: mkSlot(), ranked: [] },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /duplicate slot id/)
}

function rejects_non_positive_rank(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 0)] },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /non-positive\/non-integer rank/)
}

function rejects_duplicate_rank_within_slot(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000001', 1), rankedAt('Q-000002', 1)],
    },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /duplicate rank/)
}

function rejects_non_increasing_ranks(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000001', 2), rankedAt('Q-000002', 1)],
    },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /not strictly increasing/)
}

function rejects_empty_candidate_code(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('', 1)] },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /empty code/)
}

function rejects_out_of_range_composite_value(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [mkRankedCandidate({ code: 'Q-000001', rank: 1, composite: mkComposite({ value: 1.5 }) })],
    },
  ])
  assert.throws(() => initializeAllocationRuntime(rcs), /out-of-range composite value/)
}

function accepts_empty_ranked_candidate_set(): void {
  // An empty RankedCandidateSet (zero slots) is well-formed; Stage 2 yields an
  // empty runtime state. Feasibility is Stage 3's concern, not Stage 2's.
  const candidateSet = mkCandidateSet()
  const rcs: RankedCandidateSet = {
    identity: {
      candidateSetId: candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet,
    slots: [],
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    constraintSnapshot: candidateSet.constraintSnapshot,
    warnings: candidateSet.warnings,
    meta: { specVersion: '1.0', rankingVersion: '1.0.0', scoringModelVersion: '1.0' },
  }
  const state = initializeAllocationRuntime(rcs)
  assert.equal(state.slots.length, 0)
  assert.equal(state.candidates.length, 0)
  assert.equal(state.progress.totalSlots, 0)
}

/**
 * Project an AllocationRuntimeState to its *derived* Solver-produced form
 * (slots, candidates, progress) for determinism comparisons. The carried
 * `rankedCandidateSet` is the read-only input reference (Solver §3.3) and is
 * excluded — it is byte-identical to the input by construction, not a product
 * of the Solver's Stage 2 work.
 */
function derivedForm(state: ReturnType<typeof initializeAllocationRuntime>): unknown {
  return {
    slots: state.slots,
    candidates: state.candidates,
    progress: state.progress,
  }
}

// ═══ Determinism (Solver §9) ═══════════════════════════════════════════════

function is_deterministic_across_invocations(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000002', 1, 0.7), rankedAt('Q-000001', 2, 0.9)],
    },
    { slotId: 'slot-2', slot: mkSlot({ setNumber: 2 }), ranked: [rankedAt('Q-000003', 1)] },
  ])
  const s1 = stableStringify(derivedForm(initializeAllocationRuntime(rcs)))
  const s2 = stableStringify(derivedForm(initializeAllocationRuntime(rcs)))
  assert.equal(s1, s2, 'same input must yield byte-identical runtime state')
}

function is_order_invariant_on_slot_input_order(): void {
  // Solver §9.3 Ordering pillar: shuffling the RankedSlot input order must not
  // change the output (slots are sorted by stable slot id internally).
  const slotA = {
    slotId: 'slot-a',
    slot: mkSlot(),
    ranked: [rankedAt('Q-000001', 1)] as RankedCandidate[],
  }
  const slotB = {
    slotId: 'slot-b',
    slot: mkSlot({ setNumber: 2 }),
    ranked: [rankedAt('Q-000002', 1)] as RankedCandidate[],
  }
  const canonical = stableStringify(
    derivedForm(initializeAllocationRuntime(mkRankedCandidateSetMulti([slotA, slotB])))
  )
  const reordered = stableStringify(
    derivedForm(initializeAllocationRuntime(mkRankedCandidateSetMulti([slotB, slotA])))
  )
  assert.equal(canonical, reordered, 'slot input order must not leak into output')
}

function is_idempotent(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000001', 1), rankedAt('Q-000002', 2)],
    },
  ])
  // Re-invoking on the same input produces the same derived state (no hidden
  // state carry). Compare derived form so the carried input reference doesn't
  // mask idempotency of the Solver's own output.
  const first = stableStringify(derivedForm(initializeAllocationRuntime(rcs)))
  for (let i = 0; i < 3; i++) {
    const s = stableStringify(derivedForm(initializeAllocationRuntime(rcs)))
    assert.equal(s, first, 'idempotency violated across re-invocations')
  }
}

// ═══ Property-style: order invariance via the shared harness ═══════════════

function property_order_invariant_on_shuffled_slots(): void {
  // Build a pool of distinct slots and assert the *derived* runtime state is
  // order-invariant across deterministic shuffles (shared/testing
  // assertOrderInvariant). We project to derivedForm so the carried read-only
  // input reference (which legitimately reflects shuffled input order) does not
  // mask the Solver's own order-invariance.
  const makeSlots = (): Array<{ slotId: string; slot: BlueprintSlot; ranked: RankedCandidate[] }> =>
    [
      { slotId: 'slot-c', slot: mkSlot(), ranked: [rankedAt('Q-000003', 1)] },
      { slotId: 'slot-a', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
      { slotId: 'slot-b', slot: mkSlot(), ranked: [rankedAt('Q-000002', 1)] },
      { slotId: 'slot-e', slot: mkSlot(), ranked: [rankedAt('Q-000005', 1)] },
      { slotId: 'slot-d', slot: mkSlot(), ranked: [rankedAt('Q-000004', 1)] },
    ]
  assertOrderInvariant(
    (slots) => derivedForm(initializeAllocationRuntime(mkRankedCandidateSetMulti(slots))),
    makeSlots(),
    { runs: 50, seed: 7 }
  )
}

// ═══ Upstream-immutability (Solver §3.3) ═══════════════════════════════════

function does_not_mutate_input_ranked_candidate_set(): void {
  const rcs = mkRankedCandidateSetMulti([
    {
      slotId: 'slot-1',
      slot: mkSlot(),
      ranked: [rankedAt('Q-000001', 1), rankedAt('Q-000002', 2)],
    },
  ])
  const before = stableStringify(rcs)
  initializeAllocationRuntime(rcs)
  const after = stableStringify(rcs)
  assert.equal(before, after, 'initializeAllocationRuntime must not mutate its input')
}

function holds_ranked_candidate_set_read_only_reference(): void {
  const rcs = mkRankedCandidateSet()
  const state = initializeAllocationRuntime(rcs)
  // The consumed RankedCandidateSet is carried read-only for traceability.
  assert.equal(state.rankedCandidateSet, rcs)
  assert.equal(state.constraintSnapshot, rcs.constraintSnapshot)
}

// ═══ Scope boundary — Stage 2 produces NO placement decisions ══════════════

function no_slot_is_reserved_allocated_locked_or_rejected_at_init(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
    { slotId: 'slot-2', slot: mkSlot(), ranked: [rankedAt('Q-000002', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  for (const slot of state.slots) {
    assert.equal(
      slot.occupancy.state,
      'open',
      `Stage 2 must not place; slot ${slot.slotId} is ${slot.occupancy.state}`
    )
  }
}

function no_candidate_is_reserved_or_assigned_at_init(): void {
  const rcs = mkRankedCandidateSetMulti([
    { slotId: 'slot-1', slot: mkSlot(), ranked: [rankedAt('Q-000001', 1)] },
  ])
  const state = initializeAllocationRuntime(rcs)
  for (const c of state.candidates) {
    assert.equal(c.reservedSlotId, null)
    assert.equal(c.assignedSlotId, null)
  }
}

// ═══ Source purity — runtime.ts must not implement the Solver ══════════════

function runtime_file_has_no_forbidden_imports_or_apis(): void {
  const source = readFileSync(path.join(__dirname, 'runtime.ts'), 'utf8')
  const forbidden = [
    'from "../reader"', // Reader is upstream; no direct dep
    'from "@supabase', // no Bank access (Solver AP, Allocation AP-15)
    'from "next"', // no framework coupling (Solver AP-16)
    'from "react"', // no UI
    'Math.random', // determinism (Solver AP-6)
    'Date.now', // determinism (Engine README §1)
    'process.hrtime', // determinism
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `runtime.ts must not reference: ${token}`)
  }
}

function runtime_file_does_not_perform_search_or_placement(): void {
  // Stage 2 is initialization ONLY. The implementation must not contain
  // constraint-satisfaction / backtracking / placement machinery.
  const source = readFileSync(path.join(__dirname, 'runtime.ts'), 'utf8')
  const forbidden = [
    'function solve',
    'function place',
    'function allocate',
    'function backtrack',
    'function search',
    'function reserveCandidate',
    'function assign',
    'function reject',
    'function lock',
    'while (',
    'backtrack',
  ]
  for (const token of forbidden) {
    assert.ok(
      !source.includes(token),
      `runtime.ts (Stage 2) must not implement: ${token}`
    )
  }
}

function runtime_does_not_redefine_upstream_contracts(): void {
  const source = readFileSync(path.join(__dirname, 'runtime.ts'), 'utf8')
  const forbiddenDeclarations = [
    'interface CandidateSet',
    'interface RankedCandidateSet',
    'interface RankedCandidate',
    'interface CompositeScore',
    'interface BlueprintSlot',
    'interface RankedSlot',
    'type AllocationState',
    'type ConflictType',
    'type ConstraintCategory',
  ]
  for (const declaration of forbiddenDeclarations) {
    assert.ok(
      !source.includes(declaration),
      `runtime.ts must import, not redefine: ${declaration}`
    )
  }
}

// ═══ runner ═══════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'initializes one Runtime Slot per Blueprint Slot', fn: initializes_one_runtime_slot_per_blueprint_slot },
  { name: 'Slots start open with empty occupancy and history (Allocation §5.1, §6.2)', fn: slots_start_open_with_empty_occupancy_and_history },
  { name: 'Slots are sorted by stable slot id (Solver §9.3)', fn: slots_are_sorted_by_stable_slot_id },
  { name: 'Candidate Codes preserve inherited Ranking order (Solver §18.3)', fn: candidate_codes_preserve_inherited_ranking_order },
  { name: 'Candidate runtime state collects consideration slots + inherited priority', fn: candidate_runtime_state_collects_consideration_slots },
  { name: 'Candidates start unreserved and unassigned', fn: candidates_start_unreserved_and_unassigned },
  { name: 'Candidates are sorted by Question Code', fn: candidates_are_sorted_by_code },
  { name: 'Progress reports all Slots open at init', fn: progress_reports_all_open_at_init },
  { name: 'Progress reports zero placement outcomes at init', fn: progress_reports_zero_placement_outcomes_at_init },
  { name: 'Progress open count equals total at init', fn: progress_open_equals_total_at_init },
  { name: 'getSlot returns Runtime Slot by id', fn: get_slot_returns_slot_by_id },
  { name: 'getCandidate returns Candidate state by code', fn: get_candidate_returns_candidate_by_code },
  { name: 'considerationOrder returns inherited order', fn: consideration_order_returns_inherited_order },
  { name: 'isUnderConsideration reports membership', fn: is_under_consideration_reports_membership },
  { name: 'inheritedPriority returns undefined when absent', fn: inherited_priority_returns_undefined_when_absent },
  { name: 'Rejects missing identity (Fatal)', fn: rejects_missing_identity },
  { name: 'Rejects missing meta (Fatal)', fn: rejects_missing_meta },
  { name: 'Rejects unsupported Scoring Model version (Fatal)', fn: rejects_unsupported_scoring_model_version },
  { name: 'Rejects unsupported RankedCandidateSet spec version (Fatal)', fn: rejects_unsupported_ranked_spec_version },
  { name: 'Rejects non-array slots (Fatal)', fn: rejects_non_array_slots },
  { name: 'Rejects empty slot id (Fatal)', fn: rejects_empty_slot_id },
  { name: 'Rejects slot missing Blueprint slot (Fatal)', fn: rejects_slot_missing_blueprint_slot },
  { name: 'Rejects duplicate slot id (Fatal)', fn: rejects_duplicate_slot_id },
  { name: 'Rejects non-positive rank (Fatal)', fn: rejects_non_positive_rank },
  { name: 'Rejects duplicate rank within slot (Fatal)', fn: rejects_duplicate_rank_within_slot },
  { name: 'Rejects non-increasing ranks (Fatal)', fn: rejects_non_increasing_ranks },
  { name: 'Rejects empty candidate code (Fatal)', fn: rejects_empty_candidate_code },
  { name: 'Rejects out-of-range composite value (Fatal)', fn: rejects_out_of_range_composite_value },
  { name: 'Accepts empty RankedCandidateSet (well-formed)', fn: accepts_empty_ranked_candidate_set },
  { name: 'Deterministic across invocations (Solver §9)', fn: is_deterministic_across_invocations },
  { name: 'Order-invariant on slot input order (Solver §9.3)', fn: is_order_invariant_on_slot_input_order },
  { name: 'Idempotent (no hidden state)', fn: is_idempotent },
  { name: 'Property: order-invariant on shuffled slots', fn: property_order_invariant_on_shuffled_slots },
  { name: 'Does not mutate input RankedCandidateSet (Solver §3.3)', fn: does_not_mutate_input_ranked_candidate_set },
  { name: 'Holds RankedCandidateSet read-only reference', fn: holds_ranked_candidate_set_read_only_reference },
  { name: 'No Slot placed at init (Stage 2 boundary)', fn: no_slot_is_reserved_allocated_locked_or_rejected_at_init },
  { name: 'No Candidate reserved/assigned at init (Stage 2 boundary)', fn: no_candidate_is_reserved_or_assigned_at_init },
  { name: 'runtime.ts has no forbidden imports or side-effect APIs', fn: runtime_file_has_no_forbidden_imports_or_apis },
  { name: 'runtime.ts does not perform search or placement', fn: runtime_file_does_not_perform_search_or_placement },
  { name: 'runtime.ts does not redefine upstream contracts', fn: runtime_does_not_redefine_upstream_contracts },
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
