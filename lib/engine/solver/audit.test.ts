/**
 * lib/engine/solver/audit.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.9 — Audit Finalization tests.
 *
 * RUN: npx jiti lib/engine/solver/audit.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import type { CompositeScore, RawSignal, ScoreComponent, ScoringConfidence } from '../scoring/contracts'
import type { RankedCandidate, RankedCandidateSet, RankedSlot } from '../ranking/contracts'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { initializeAllocationRuntime, type AllocationRuntimeState, type SlotRuntimeState } from './runtime'
import type { AllocationValidationResult } from './allocation-validation'
import { finalizeAllocationState, type AllocationFinalizationResult } from './finalization'
import {
  auditDecisionKinds,
  auditEntriesForDecision,
  finalizeAllocationAudit,
  hasCompleteAllocationAudit,
} from './audit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function blueprintSlot(id: string): { slotId: string; slot: BlueprintSlot } {
  return {
    slotId: id,
    slot: {
      setNumber: 1,
      difficulty: 'Easy',
      blueprintType: 'Memory',
      pattern: 'Positive',
      document: 'LAW-ACT-HED-2562',
      learningObjective: 'LO1',
    },
  }
}

function signal(code: string): RawSignal {
  return { questionCode: code, source: 'difficulty', value: 'Easy', integrity: 'known', extractionNote: null }
}

function confidence(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function rankedCandidate(code: string, rank: number, slot: BlueprintSlot): RankedCandidate {
  const component: ScoreComponent = {
    componentId: 'difficulty_fit', questionCode: code, slot,
    normalized: { value: 1, scale: 'exact-match' }, inputs: [signal(code)],
    reasoning: 'Fixture match.', confidence: confidence(), penalties: [],
  }
  const composite: CompositeScore = {
    questionCode: code, slot, value: 1 - rank / 100,
    breakdown: { contributions: [{ component, contribution: 1, reason: 'Fixture.' }], aggregationNote: 'fixture' },
    confidence: component.confidence, penalties: [],
  }
  return {
    code, rank, tieGroupId: null, composite, confidence: composite.confidence, penalties: [], signals: [signal(code)],
    orderingReason: { summary: 'Fixture ordering.', determiningFacets: ['composite.value'], neighborComparison: null, tieStatus: { tieGroupId: null, memberCodes: [], tieBreaker: null } },
    auditTrail: { candidateCode: code, signals: [signal(code)], componentIds: ['difficulty_fit'], composite, confidence: composite.confidence, penalties: [], rank },
  }
}

function candidate(code: string): Candidate {
  return {
    identity: { questionCode: code, questionId: code },
    metadata: { document: 'LAW-ACT-HED-2562', difficulty: 'Easy', topic: 'topic', status: 'Published', tier: 1, blueprintType: 'Memory', learningObjective: 'LO1', questionPattern: 'Positive', section: 'section', tags: [], category: null },
    completeness: { blueprintType: 'complete', learningObjective: 'complete', questionPattern: 'complete', section: 'complete' },
    confidence: { level: 'full', reason: null },
    provenance: { filtersPassed: [], eligibleSlots: [], coverageSatisfied: [], source: { kind: 'metadata_query', queryId: 'fixture' } },
  }
}

function rankedSet(slotEntries: readonly { slotId: string; slot: BlueprintSlot; codes: readonly string[] }[]): RankedCandidateSet {
  const codes = [...new Set(slotEntries.flatMap((entry) => entry.codes))].sort()
  const snapshot = buildConstraintSnapshot()
  const candidateSet: CandidateSet = {
    identity: { assemblyRequestId: 'assembly-audit', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: codes.map(candidate), slotIndex: { slots: new Map() }, shortfallReport: { entries: [] }, coverageSatisfaction: { bindings: [] }, constraintSnapshot: snapshot, warnings: [],
    statistics: { totalCandidates: codes.length, fullConfidenceCount: codes.length, reducedConfidenceCount: 0, incompleteAxesCount: 0, distinctDocuments: 1, distinctDifficulties: 1, distinctPatterns: 1, distinctLearningObjectives: 1, shortfallCount: 0 },
    exclusionsLog: [], meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
  const slots: RankedSlot[] = slotEntries.map((entry) => ({
    slotId: entry.slotId,
    slot: entry.slot,
    rankedCandidates: entry.codes.map((code, index) => rankedCandidate(code, index + 1, entry.slot)),
    slotSummary: { tieGroups: [], topOfSlotRationale: 'Fixture.', orderingKey: { facets: ['composite.value'], description: 'Fixture.' } },
  }))
  return {
    identity: { candidateSetId: candidateSet.identity.assemblyRequestId, scoringModelVersion: '1.0', rankingVersion: '1.0.0' },
    candidateSet, slots, shortfallReport: candidateSet.shortfallReport, coverageSatisfaction: candidateSet.coverageSatisfaction,
    constraintSnapshot: snapshot, warnings: [], meta: { specVersion: '1.0', rankingVersion: '1.0.0', scoringModelVersion: '1.0' },
  }
}

function withSlots(state: AllocationRuntimeState, slots: readonly SlotRuntimeState[]): AllocationRuntimeState {
  return { ...state, slots, slotsById: new Map(slots.map((slot) => [slot.slotId, slot])) }
}

function validationGate(state: AllocationRuntimeState): AllocationValidationResult {
  return {
    validationResult: 'valid', validationDiagnostics: [],
    validationSummary: { totalSlotCount: state.slots.length, provisionalPlacementCount: 0, effectivePlacementCount: 0, releasedSlotCount: 0, releasedCandidateCount: 0, unresolvedConflictCount: 0, fatalDiagnosticCount: 0, nonFatalDiagnosticCount: 0 },
  }
}

function finalized(state: AllocationRuntimeState): AllocationFinalizationResult {
  return finalizeAllocationState(state, validationGate(state))
}

function fixtureState(): AllocationRuntimeState {
  const a = blueprintSlot('slot-a')
  const b = blueprintSlot('slot-b')
  const c = blueprintSlot('slot-c')
  const base = initializeAllocationRuntime(rankedSet([
    { ...a, codes: ['Q-000001'] },
    { ...b, codes: ['Q-000002'] },
    { ...c, codes: ['Q-000003'] },
  ]))
  return withSlots(base, base.slots.map((slot) => {
    if (slot.slotId === 'slot-a') return {
      ...slot,
      occupancy: { state: 'allocated' as const, reservedCandidateCode: null, assignedCandidateCode: 'Q-000001' },
      reservationHistory: [{ candidateCode: 'Q-000001', inheritedPriority: 1, outcome: 'promoted' as const, reason: 'Top ranked candidate was promoted.' }],
      replacementHistory: [{ previousCode: 'Q-000000', newCode: 'Q-000001', reason: 'Fixture replacement.', source: 'solver' as const }],
      conflicts: [{ candidateCode: 'Q-000001', constraint: 'duplicate-prevention', type: 'hard' as const, scope: 'within_run' as const, resolution: 'resolved' as const, participants: [], evidence: 'Candidate remained unique.' }],
    }
    if (slot.slotId === 'slot-b') return {
      ...slot,
      occupancy: { state: 'rejected' as const, reservedCandidateCode: null, assignedCandidateCode: null },
    }
    return {
      ...slot,
      occupancy: { state: 'released' as const, reservedCandidateCode: null, assignedCandidateCode: null },
      reservationHistory: [{ candidateCode: 'Q-000003', inheritedPriority: 1, outcome: 'released' as const, reason: 'Candidate released by fixture.' }],
    }
  }))
}

function produces_existing_audit_vocabulary_in_deterministic_order(): void {
  const state = fixtureState()
  const result = finalizeAllocationAudit(finalized(state), state)
  assert.deepEqual(result.allocationAudit.map((entry) => entry.decision), ['placement', 'conflict', 'replacement', 'lock', 'rejection', 'release', 'release'])
  assert.deepEqual(result.allocationAudit.map((entry) => entry.ordering), [0, 1, 2, 3, 4, 5, 6])
  assert.equal(result.auditSummary.totalEntryCount, 7)
  assert.equal(result.auditSummary.lockEntryCount, 1)
  assert.equal(result.auditSummary.rejectionEntryCount, 1)
}

function returns_only_stage_nine_fields(): void {
  const state = fixtureState()
  const result = finalizeAllocationAudit(finalized(state), state)
  assert.deepEqual(Object.keys(result).sort(), ['allocationAudit', 'auditDiagnostics', 'auditSummary'])
}

function records_rejected_slot_as_non_fatal_audit_diagnostic(): void {
  const state = fixtureState()
  const result = finalizeAllocationAudit(finalized(state), state)
  assert.equal(result.auditDiagnostics.length, 1)
  assert.deepEqual(result.auditDiagnostics[0], {
    category: 'no_feasible_candidate', severity: 'Non-fatal', stage: 'audit_finalization', slotId: 'slot-b', candidateCode: null, componentId: null,
    explanation: "Rejected Slot 'slot-b' is retained as an explicit allocation shortfall in the finalized audit.",
    recommendation: 'Review the Slot shortfall before requesting a new Solver run.',
  })
}

function audit_helpers_are_read_only_projections(): void {
  const state = fixtureState()
  const result = finalizeAllocationAudit(finalized(state), state)
  assert.equal(hasCompleteAllocationAudit(result), true)
  assert.equal(auditEntriesForDecision(result, 'lock').length, 1)
  assert.deepEqual(auditDecisionKinds(result), ['conflict', 'lock', 'placement', 'rejection', 'release', 'replacement'])
}

function rejects_incomplete_finalization_before_audit_exists(): void {
  const state = fixtureState()
  const finalization = finalized(state)
  const incomplete: AllocationFinalizationResult = { ...finalization, finalizedDiagnostics: [{ category: 'runtime_inconsistency', severity: 'Fatal', stage: 'finalize_allocation', slotId: null, candidateCode: null, componentId: null, explanation: 'Fixture.', recommendation: 'Fix fixture.' }] }
  assert.throws(() => finalizeAllocationAudit(incomplete, state), /contains diagnostics/)
}

function rejects_mismatched_runtime_metadata(): void {
  const state = fixtureState()
  const other = fixtureState()
  assert.throws(() => finalizeAllocationAudit(finalized(state), other), /does not match runtime metadata/)
}

function rejects_incomplete_history(): void {
  const state = fixtureState()
  const malformed = withSlots(state, state.slots.map((slot) => slot.slotId === 'slot-a'
    ? { ...slot, replacementHistory: [{ previousCode: 'Q-000000', newCode: 'Q-000001', reason: '', source: 'solver' as const }] }
    : slot))
  assert.throws(() => finalizeAllocationAudit(finalized(malformed), malformed), /replacement history.*incomplete/)
}

function result_is_immutable_deterministic_and_does_not_mutate_inputs(): void {
  const state = fixtureState()
  const finalization = finalized(state)
  const beforeFinalization = stableStringify(finalization)
  const beforeState = stableStringify(state)
  const first = finalizeAllocationAudit(finalization, state)
  const second = finalizeAllocationAudit(finalization, state)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.allocationAudit))
  assert.equal(stableStringify(first), stableStringify(second))
  assert.equal(stableStringify(finalization), beforeFinalization)
  assert.equal(stableStringify(state), beforeState)
}

function source_respects_stage_boundaries(): void {
  const source = readFileSync(path.join(__dirname, 'audit.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
  assert.ok(!source.includes("from './placement'"))
  assert.ok(!source.includes("from './conflict-detection'"))
  assert.ok(!source.includes("from './conflict-resolution'"))
  assert.ok(!source.includes("from './allocation-validation'"))
  assert.ok(!/function\s+(emit|search|backtrack|resolve|validate)/.test(source))
}

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'produces existing audit vocabulary in deterministic order', fn: produces_existing_audit_vocabulary_in_deterministic_order },
  { name: 'returns only Stage 9 fields', fn: returns_only_stage_nine_fields },
  { name: 'records rejected Slot as non-fatal audit diagnostic', fn: records_rejected_slot_as_non_fatal_audit_diagnostic },
  { name: 'audit helpers are read-only projections', fn: audit_helpers_are_read_only_projections },
  { name: 'rejects incomplete finalization before audit exists', fn: rejects_incomplete_finalization_before_audit_exists },
  { name: 'rejects mismatched runtime metadata', fn: rejects_mismatched_runtime_metadata },
  { name: 'rejects incomplete history', fn: rejects_incomplete_history },
  { name: 'result is immutable, deterministic, and does not mutate inputs', fn: result_is_immutable_deterministic_and_does_not_mutate_inputs },
  { name: 'source respects Stage 9 boundaries', fn: source_respects_stage_boundaries },
]

let passed = 0
let failed = 0
for (const test of tests) {
  try {
    test.fn()
    console.log(`  ✓ ${test.name}`)
    passed++
  } catch (error) {
    console.error(`  ✗ ${test.name}`)
    console.error(`    ${(error as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
