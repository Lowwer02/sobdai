import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { RankedCandidate, RankedCandidateSet } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { stableStringify } from '../shared/testing/determinism'
import { initializeAllocationRuntime, type AllocationRuntimeState, type SlotRuntimeState } from './runtime'
import { finalizeAllocationState } from './finalization'
import { finalizeAllocationAudit } from './audit'
import { allocatedSlotIds, emitAllocatedCandidateSet, isPartialAllocation, placementForSlot } from './emission'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function candidate(code: string, rank: number): RankedCandidate {
  return {
    code, rank, tieGroupId: null,
    composite: { value: 0.9, questionCode: code } as RankedCandidate['composite'],
    orderingReason: { summary: 'Inherited fixture order.' },
  } as RankedCandidate
}

function rankedSet(): RankedCandidateSet {
  const snapshot = buildConstraintSnapshot()
  const slot = { setNumber: 1, difficulty: 'Easy', blueprintType: 'Memory', pattern: 'Positive', document: 'LAW-ACT-HED-2562', learningObjective: 'LO1' } as const
  return {
    identity: { candidateSetId: 'candidate-set-1', scoringModelVersion: '1.0', rankingVersion: '1.0.0' },
    meta: { specVersion: '1.0', scoringModelVersion: '1.0', rankingVersion: '1.0.0' },
    slots: [
      { slotId: 'slot-b', slot, rankedCandidates: [candidate('Q-000002', 1)], slotSummary: {} },
      { slotId: 'slot-a', slot, rankedCandidates: [candidate('Q-000001', 1)], slotSummary: {} },
    ],
    candidateSet: { shortfallReport: { entries: [] }, coverageSatisfaction: { bindings: [] }, warnings: [{ severity: 'Warning', axis: null, explanation: 'Upstream warning.', recommendation: 'Observe.' }], constraintSnapshot: snapshot } as unknown as RankedCandidateSet['candidateSet'],
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot: snapshot,
    warnings: [{ severity: 'Warning', axis: null, explanation: 'Upstream warning.', recommendation: 'Observe.' }],
  } as unknown as RankedCandidateSet
}

function state(): AllocationRuntimeState {
  const base = initializeAllocationRuntime(rankedSet())
  const slots: readonly SlotRuntimeState[] = base.slots.map((slot) => {
    if (slot.slotId === 'slot-a') return {
      ...slot,
      occupancy: { state: 'allocated' as const, reservedCandidateCode: null, assignedCandidateCode: 'Q-000001' },
      conflicts: [{ candidateCode: 'Q-000001', constraint: 'duplicate-prevention', type: 'hard' as const, scope: 'within_run' as const, resolution: 'resolved' as const, participants: [], evidence: 'No duplicate retained.' }],
    }
    return {
      ...slot,
      occupancy: { state: 'rejected' as const, reservedCandidateCode: null, assignedCandidateCode: null },
      conflicts: [{ candidateCode: 'Q-000002', constraint: 'coverage', type: 'hard' as const, scope: 'within_set' as const, resolution: 'unresolved' as const, participants: [], evidence: 'Coverage cannot be met.' }],
    }
  })
  return { ...base, slots, slotsById: new Map(slots.map((slot) => [slot.slotId, slot])) }
}

function validGate(runtime: AllocationRuntimeState) {
  return { validationResult: 'valid' as const, validationDiagnostics: [], validationSummary: { totalSlotCount: runtime.slots.length, provisionalPlacementCount: 0, effectivePlacementCount: 0, releasedSlotCount: 0, releasedCandidateCount: 0, unresolvedConflictCount: 0, fatalDiagnosticCount: 0, nonFatalDiagnosticCount: 0 } }
}

function emit() {
  const runtime = state()
  const finalization = finalizeAllocationState(runtime, validGate(runtime))
  const audit = finalizeAllocationAudit(finalization, runtime)
  return { runtime, finalization, audit, output: emitAllocatedCandidateSet(finalization, audit, runtime) }
}

function emits_exact_frozen_contract_and_preserves_references(): void {
  const { runtime, audit, output } = emit()
  assert.deepEqual(Object.keys(output).sort(), ['auditTrail', 'constraintSnapshot', 'coverageSatisfaction', 'feasibility', 'identity', 'meta', 'perSetPhysicalCounts', 'placements', 'rankedCandidateSet', 'shortfallReport', 'shortfallSummary', 'unresolvedConflicts', 'warnings'])
  assert.equal(output.constraintSnapshot, runtime.constraintSnapshot)
  assert.equal(output.auditTrail, audit.allocationAudit)
  assert.equal(output.warnings, runtime.rankedCandidateSet.warnings)
  assert.equal(output.shortfallReport, runtime.rankedCandidateSet.shortfallReport)
  assert.equal(output.coverageSatisfaction, runtime.rankedCandidateSet.coverageSatisfaction)
  assert.equal(output.identity.solverVersion, '1.0.0')
}

function emits_stable_placements_and_runtime_history(): void {
  const { output } = emit()
  assert.deepEqual(output.placements.map((placement) => placement.slotId), ['slot-a', 'slot-b'])
  assert.equal(output.placements[0]?.state, 'allocated')
  assert.equal(output.placements[1]?.state, 'rejected')
  assert.equal(output.unresolvedConflicts.length, 1)
  assert.deepEqual(allocatedSlotIds(output), ['slot-a'])
  assert.equal(isPartialAllocation(output), true)
  assert.equal(placementForSlot(output, 'slot-a')?.state, 'allocated')
}

function output_is_immutable_deterministic_and_input_safe(): void {
  const { runtime, finalization, audit, output } = emit()
  const before = stableStringify({ runtime, finalization, audit })
  const next = emitAllocatedCandidateSet(finalization, audit, runtime)
  assert.ok(Object.isFrozen(output))
  assert.ok(Object.isFrozen(output.placements))
  assert.equal(stableStringify(output), stableStringify(next))
  assert.equal(stableStringify({ runtime, finalization, audit }), before)
}

function fails_loud_for_non_terminal_slot(): void {
  const runtime = state()
  const finalization = finalizeAllocationState(runtime, validGate(runtime))
  const malformed = { ...finalization, finalizedAllocationState: { ...finalization.finalizedAllocationState, slots: finalization.finalizedAllocationState.slots.map((slot) => slot.slotId === 'slot-b' ? { ...slot, occupancy: { state: 'open' as const, reservedCandidateCode: null, assignedCandidateCode: null } } : slot) } }
  const audit = finalizeAllocationAudit(finalization, runtime)
  assert.throws(() => emitAllocatedCandidateSet(malformed, audit, runtime), /not terminally finalized/)
}

function source_respects_stage_ten_boundaries(): void {
  const source = readFileSync(path.join(__dirname, 'emission.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!source.includes("from './placement'"))
  assert.ok(!source.includes("from './conflict-detection'"))
  assert.ok(!source.includes("from './conflict-resolution'"))
  assert.ok(!source.includes("from './allocation-validation'"))
  assert.ok(!/function\s+(search|backtrack|resolve|validate)/.test(source))
}

const tests = [
  ['emits exact frozen contract and preserves references', emits_exact_frozen_contract_and_preserves_references],
  ['emits stable placements and Runtime History', emits_stable_placements_and_runtime_history],
  ['output is immutable, deterministic, and input-safe', output_is_immutable_deterministic_and_input_safe],
  ['fails loud for non-terminal Slot', fails_loud_for_non_terminal_slot],
  ['source respects Stage 10 boundaries', source_respects_stage_ten_boundaries],
] as const
let failed = 0
for (const [name, test] of tests) {
  try { test(); console.log(`  ✓ ${name}`) } catch (error) { failed++; console.error(`  ✗ ${name}\n    ${(error as Error).message}`) }
}
console.log(`\n${tests.length - failed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
