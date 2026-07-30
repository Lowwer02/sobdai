/**
 * lib/engine/solver/allocation-state-application.test.ts
 * ----------------------------------------------------------------------------
 * Black-box regression tests for Allocation State Application.
 *
 * RUN: npx jiti lib/engine/solver/allocation-state-application.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type {
  BlueprintSlot,
  Candidate,
  CandidateSet,
} from '../generator/contracts'
import type {
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
} from '../ranking/contracts'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { validateResolvedAllocation } from './allocation-validation'
import { applyAllocationState } from './allocation-state-application'
import { validateBlueprintConstraints } from './blueprint-validation'
import { detectAllocationConflicts } from './conflict-detection'
import {
  resolveDetectedConflicts,
  type ConflictResolutionResult,
} from './conflict-resolution'
import { finalizeAllocationState } from './finalization'
import {
  initializeCandidatePlacement,
  type PlacementRuntimeState,
} from './placement'
import {
  initializeAllocationRuntime,
  type AllocationRuntimeState,
} from './runtime'

interface PipelineInputs {
  readonly runtime: AllocationRuntimeState
  readonly placement: PlacementRuntimeState
  readonly resolution: ConflictResolutionResult
}

function blueprintSlot(setNumber: 1 | 2): BlueprintSlot {
  return {
    setNumber,
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    learningObjective: 'LO1',
  }
}

function rankedCandidate(
  code: string,
  rank: number,
  slot: BlueprintSlot
): RankedCandidate {
  return {
    code,
    rank,
    composite: {
      questionCode: code,
      slot,
      value: 1 - rank / 100,
    },
  } as RankedCandidate
}

function candidate(code: string): Candidate {
  return {
    identity: { questionCode: code, questionId: code },
  } as Candidate
}

function candidateSet(codes: readonly string[]): CandidateSet {
  const constraintSnapshot = buildConstraintSnapshot()
  return {
    identity: {
      assemblyRequestId: 'assembly-state-application',
      generatedAt: null,
      bankStateHash: 'bank-state-application',
    },
    candidates: codes.map(candidate),
    constraintSnapshot,
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    warnings: [],
  } as unknown as CandidateSet
}

function rankedSlot(
  slotId: string,
  slot: BlueprintSlot,
  codes: readonly string[]
): RankedSlot {
  return {
    slotId,
    slot,
    rankedCandidates: codes.map((code, index) =>
      rankedCandidate(code, index + 1, slot)
    ),
  } as unknown as RankedSlot
}

function rankedCandidateSet(
  slots: readonly RankedSlot[],
  codes: readonly string[]
): RankedCandidateSet {
  const candidates = candidateSet(codes)
  return {
    identity: {
      candidateSetId: candidates.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet: candidates,
    slots,
    shortfallReport: candidates.shortfallReport,
    coverageSatisfaction: candidates.coverageSatisfaction,
    constraintSnapshot: candidates.constraintSnapshot,
    warnings: candidates.warnings,
    meta: {
      specVersion: '1.0',
      rankingVersion: '1.0.0',
      scoringModelVersion: '1.0',
    },
  }
}

function pipeline(rankedSet: RankedCandidateSet): PipelineInputs {
  const runtime = initializeAllocationRuntime(rankedSet)
  const blueprintValidation = validateBlueprintConstraints(runtime)
  const placement = initializeCandidatePlacement(
    runtime,
    blueprintValidation,
    rankedSet
  )
  const detection = detectAllocationConflicts(
    placement,
    runtime,
    blueprintValidation
  )
  const resolution = resolveDetectedConflicts(
    detection,
    placement,
    runtime
  )
  return { runtime, placement, resolution }
}

function verifies_placements_become_authoritative_allocations(): void {
  const slotA = blueprintSlot(1)
  const slotB = blueprintSlot(2)
  const rankedSet = rankedCandidateSet(
    [
      rankedSlot('slot-a', slotA, ['Q-000001']),
      rankedSlot('slot-b', slotB, ['Q-000002']),
    ],
    ['Q-000001', 'Q-000002']
  )
  const inputs = pipeline(rankedSet)
  const applied = applyAllocationState(
    inputs.runtime,
    inputs.placement,
    inputs.resolution
  )

  assert.deepEqual(
    applied.slots.map((slot) => [
      slot.slotId,
      slot.occupancy.state,
      slot.occupancy.assignedCandidateCode,
    ]),
    [
      ['slot-a', 'allocated', 'Q-000001'],
      ['slot-b', 'allocated', 'Q-000002'],
    ]
  )
  assert.equal(
    applied.candidatesByCode.get('Q-000001')?.assignedSlotId,
    'slot-a'
  )
  assert.equal(
    applied.slotsById.get('slot-a')?.reservationHistory[0]?.outcome,
    'promoted'
  )
  assert.equal(applied.progress.allocatedSlotCount, 2)
  assert.equal(applied.progress.assignedCandidateCount, 2)
}

function verifies_release_actions_are_applied_without_redeciding(): void {
  const slotA = blueprintSlot(1)
  const slotB = blueprintSlot(2)
  const rankedSet = rankedCandidateSet(
    [
      rankedSlot('slot-a', slotA, ['Q-000001']),
      rankedSlot('slot-b', slotB, ['Q-000001']),
    ],
    ['Q-000001']
  )
  const runtime = initializeAllocationRuntime(rankedSet)
  const validation = validateBlueprintConstraints(runtime)
  const placement: PlacementRuntimeState = {
    provisionalPlacements: [
      {
        slotId: 'slot-a',
        candidateCode: 'Q-000001',
        inheritedRank: 1,
        status: 'placed',
        reason: 'Fixture provisional placement.',
      },
      {
        slotId: 'slot-b',
        candidateCode: 'Q-000001',
        inheritedRank: 1,
        status: 'placed',
        reason: 'Fixture provisional placement.',
      },
    ],
    placementDiagnostics: [],
    placementProgress: {
      totalSlots: 2,
      placedSlotCount: 2,
      unplacedSlotCount: 0,
      remainingCandidateCount: 0,
      remainingSlotCount: 0,
    },
    remainingCandidates: [],
    remainingSlots: [],
  }
  const detection = detectAllocationConflicts(
    placement,
    runtime,
    validation
  )
  const resolution = resolveDetectedConflicts(
    detection,
    placement,
    runtime
  )
  const applied = applyAllocationState(runtime, placement, resolution)

  assert.equal(
    applied.slotsById.get('slot-a')?.occupancy.state,
    'allocated'
  )
  assert.equal(
    applied.slotsById.get('slot-b')?.occupancy.state,
    'released'
  )
  assert.equal(
    applied.slotsById.get('slot-b')?.reservationHistory[0]?.outcome,
    'released'
  )
  assert.equal(
    applied.candidatesByCode.get('Q-000001')?.assignedSlotId,
    'slot-a'
  )
  assert.equal(applied.progress.allocatedSlotCount, 1)
  assert.equal(applied.progress.releasedSlotCount, 1)
}

function verifies_unplaced_slot_becomes_rejected_with_conflict(): void {
  const slotA = blueprintSlot(1)
  const slotB = blueprintSlot(2)
  const inputs = pipeline(
    rankedCandidateSet(
      [
        rankedSlot('slot-a', slotA, ['Q-000001']),
        rankedSlot('slot-b', slotB, ['Q-000001']),
      ],
      ['Q-000001']
    )
  )
  const applied = applyAllocationState(
    inputs.runtime,
    inputs.placement,
    inputs.resolution
  )
  const rejected = applied.slotsById.get('slot-b')

  assert.equal(rejected?.occupancy.state, 'rejected')
  assert.equal(
    rejected?.conflicts.some(
      (conflict) => conflict.resolution === 'unresolved'
    ),
    true
  )
  assert.equal(applied.progress.rejectedSlotCount, 1)
  assert.ok(applied.progress.unresolvedConflictCount > 0)
}

function verifies_output_is_consumable_by_validation_and_finalization(): void {
  const slotA = blueprintSlot(1)
  const inputs = pipeline(
    rankedCandidateSet(
      [rankedSlot('slot-a', slotA, ['Q-000001'])],
      ['Q-000001']
    )
  )
  const applied = applyAllocationState(
    inputs.runtime,
    inputs.placement,
    inputs.resolution
  )
  const validation = validateResolvedAllocation(
    inputs.resolution,
    inputs.placement,
    applied
  )
  const finalization = finalizeAllocationState(applied, validation)

  assert.equal(validation.validationResult, 'valid')
  assert.equal(
    finalization.finalizedAllocationState.slots[0]?.occupancy.state,
    'locked'
  )
}

function verifies_fresh_deterministic_immutable_snapshots(): void {
  const slotA = blueprintSlot(1)
  const inputs = pipeline(
    rankedCandidateSet(
      [rankedSlot('slot-a', slotA, ['Q-000001'])],
      ['Q-000001']
    )
  )
  const before = stableStringify(inputs)
  const first = applyAllocationState(
    inputs.runtime,
    inputs.placement,
    inputs.resolution
  )
  const second = applyAllocationState(
    inputs.runtime,
    inputs.placement,
    inputs.resolution
  )

  assert.notEqual(first, inputs.runtime)
  assert.notEqual(first.slots, inputs.runtime.slots)
  assert.notEqual(first.candidates, inputs.runtime.candidates)
  assert.notEqual(first.slotsById, inputs.runtime.slotsById)
  assert.notEqual(first.candidatesByCode, inputs.runtime.candidatesByCode)
  assert.equal(stableStringify(first), stableStringify(second))
  assert.equal(stableStringify(inputs), before)
}

function verifies_production_stage_has_no_testing_dependency(): void {
  const source = readFileSync(
    new URL('./allocation-state-application.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(source, /shared\/testing/)
  assert.doesNotMatch(
    source,
    /Date\.now|Math\.random|@supabase|from\s+['"]react/i
  )
}

const tests: readonly { readonly name: string; readonly fn: () => void }[] = [
  {
    name: 'applies placements as authoritative allocations',
    fn: verifies_placements_become_authoritative_allocations,
  },
  {
    name: 'applies release actions without re-deciding',
    fn: verifies_release_actions_are_applied_without_redeciding,
  },
  {
    name: 'marks an unplaced Slot rejected and carries its conflict',
    fn: verifies_unplaced_slot_becomes_rejected_with_conflict,
  },
  {
    name: 'feeds existing Allocation Validation and Finalization',
    fn: verifies_output_is_consumable_by_validation_and_finalization,
  },
  {
    name: 'returns fresh deterministic snapshots without input mutation',
    fn: verifies_fresh_deterministic_immutable_snapshots,
  },
  {
    name: 'has no production testing or infrastructure dependency',
    fn: verifies_production_stage_has_no_testing_dependency,
  },
]

let passed = 0
let failed = 0
for (const test of tests) {
  try {
    test.fn()
    console.log(`  ✓ ${test.name}`)
    passed += 1
  } catch (error: unknown) {
    console.error(`  ✗ ${test.name}`)
    console.error(
      `    ${error instanceof Error ? error.message : String(error)}`
    )
    failed += 1
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
