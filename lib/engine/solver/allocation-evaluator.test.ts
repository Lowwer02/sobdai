/**
 * lib/engine/solver/allocation-evaluator.test.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Allocation Evaluator Tests.
 *
 * RUN: npx jiti lib/engine/solver/allocation-evaluator.test.ts
 */

import assert from 'node:assert/strict'
import type { ConstraintSnapshot, Tier } from '../generator/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import {
  evaluateAllocation,
  type AllocationEvaluatorInput,
} from './allocation-evaluator'
import type { JointAccountingState } from './joint-accounting'
import type { PositionSetNumber } from './position-slot'

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function mkSnapshot(tier1Floor = 30, tier4Ceiling = 25, perSet = 100): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor,
      tier4Ceiling,
    },
  }
}

function mkAccounting(opts: {
  setNumber?: PositionSetNumber
  placedCount?: number
  selectedCount?: number
  tier1Count?: number
  tier4Count?: number
} = {}): JointAccountingState {
  const placedCount = opts.placedCount ?? 100
  const selectedCount = opts.selectedCount ?? placedCount
  const selectedCodes = new Set<string>()
  for (let i = 1; i <= selectedCount; i++) {
    selectedCodes.add(`Q-${String(i).padStart(4, '0')}`)
  }

  const tierCounts = new Map<Tier, number>()
  if (opts.tier1Count !== undefined) {
    tierCounts.set(1, opts.tier1Count)
  }
  if (opts.tier4Count !== undefined) {
    tierCounts.set(4, opts.tier4Count)
  }

  return {
    setNumber: opts.setNumber ?? 1,
    selectedQuestionCodes: selectedCodes,
    placedCount,
    documentCounts: new Map(),
    tierCounts,
    difficultyCounts: new Map(),
    learningObjectiveCounts: new Map(),
    patternCounts: new Map(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_exact_perset(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 100 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const verdict = evaluateAllocation(input)
  assert.equal(verdict.perSetSatisfied, true, 'placedCount === perSet must be true')
}

function test_under_perset(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 99 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const verdict = evaluateAllocation(input)
  assert.equal(verdict.perSetSatisfied, false, 'placedCount < perSet must be false')
}

function test_over_perset(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 101 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const verdict = evaluateAllocation(input)
  assert.equal(verdict.perSetSatisfied, false, 'placedCount > perSet must be false')
}

function test_within_set_uniqueness(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 100, selectedCount: 100 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const verdict = evaluateAllocation(input)
  assert.equal(verdict.withinSetUniquenessSatisfied, true, 'placedCount === selectedCount must be true')
}

function test_corrupt_uniqueness(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 100, selectedCount: 98 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const verdict = evaluateAllocation(input)
  assert.equal(verdict.withinSetUniquenessSatisfied, false, 'placedCount !== selectedCount must be false')
}

function test_tier1_floor(): void {
  const snapshot = mkSnapshot(30, 25, 100)

  // Count == floor -> true
  const vEqual = evaluateAllocation({ accounting: mkAccounting({ tier1Count: 30 }), constraintSnapshot: snapshot })
  assert.equal(vEqual.tier1FloorSatisfied, true, 'count == floor must be true')

  // Count == floor - 1 -> false
  const vBelow = evaluateAllocation({ accounting: mkAccounting({ tier1Count: 29 }), constraintSnapshot: snapshot })
  assert.equal(vBelow.tier1FloorSatisfied, false, 'count == floor - 1 must be false')

  // Missing Tier 1 bucket -> count 0 -> false
  const vMissing = evaluateAllocation({ accounting: mkAccounting({}), constraintSnapshot: snapshot })
  assert.equal(vMissing.tier1FloorSatisfied, false, 'missing Tier 1 bucket must evaluate to count 0 (false)')
}

function test_tier4_ceiling(): void {
  const snapshot = mkSnapshot(30, 25, 100)

  // Count == ceiling -> true
  const vEqual = evaluateAllocation({ accounting: mkAccounting({ tier4Count: 25 }), constraintSnapshot: snapshot })
  assert.equal(vEqual.tier4CeilingSatisfied, true, 'count == ceiling must be true')

  // Count == ceiling + 1 -> false
  const vAbove = evaluateAllocation({ accounting: mkAccounting({ tier4Count: 26 }), constraintSnapshot: snapshot })
  assert.equal(vAbove.tier4CeilingSatisfied, false, 'count == ceiling + 1 must be false')

  // Missing Tier 4 bucket -> count 0 -> true (0 <= 25)
  const vMissing = evaluateAllocation({ accounting: mkAccounting({}), constraintSnapshot: snapshot })
  assert.equal(vMissing.tier4CeilingSatisfied, true, 'missing Tier 4 bucket must evaluate to count 0 (true)')
}

function test_combined_verdict(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 100, selectedCount: 100, tier1Count: 40, tier4Count: 15 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const verdict = evaluateAllocation(input)

  assert.equal(verdict.setNumber, 1)
  assert.equal(verdict.perSetSatisfied, true)
  assert.equal(verdict.withinSetUniquenessSatisfied, true)
  assert.equal(verdict.tier1FloorSatisfied, true)
  assert.equal(verdict.tier4CeilingSatisfied, true)
}

function test_immutability(): void {
  const accounting = mkAccounting({ placedCount: 100, tier1Count: 35, tier4Count: 10 })
  const snapshot = mkSnapshot(30, 25, 100)
  const input: AllocationEvaluatorInput = { accounting, constraintSnapshot: snapshot }

  const initialPlacedCount = accounting.placedCount
  const initialTier1Count = accounting.tierCounts.get(1)

  evaluateAllocation(input)

  assert.equal(accounting.placedCount, initialPlacedCount, 'accounting placedCount must not be mutated')
  assert.equal(accounting.tierCounts.get(1), initialTier1Count, 'tierCounts must not be mutated')
}

function test_determinism(): void {
  const input: AllocationEvaluatorInput = {
    accounting: mkAccounting({ placedCount: 100, selectedCount: 100, tier1Count: 30, tier4Count: 20 }),
    constraintSnapshot: mkSnapshot(30, 25, 100),
  }
  const v1 = evaluateAllocation(input)
  const v2 = evaluateAllocation(input)

  assert.deepEqual(v1, v2, 'same input twice must produce structurally identical verdict')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Exact perSet', fn: test_exact_perset },
  { name: '2. Under perSet', fn: test_under_perset },
  { name: '3. Over perSet', fn: test_over_perset },
  { name: '4. Within-Set uniqueness', fn: test_within_set_uniqueness },
  { name: '5. Corrupt uniqueness', fn: test_corrupt_uniqueness },
  { name: '6. Tier 1 floor boundary', fn: test_tier1_floor },
  { name: '7. Tier 4 ceiling boundary', fn: test_tier4_ceiling },
  { name: '8. Combined verdict', fn: test_combined_verdict },
  { name: '9. Immutability', fn: test_immutability },
  { name: '10. Determinism', fn: test_determinism },
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(err as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
