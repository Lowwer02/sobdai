/**
 * lib/engine/solver/pruning-predicates.test.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Pruning Predicates Tests.
 *
 * RUN: npx jiti lib/engine/solver/pruning-predicates.test.ts
 */

import assert from 'node:assert/strict'
import type { ConstraintSnapshot, Tier } from '../generator/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import type { JointAccountingState } from './joint-accounting'

import {
  pruneTier1FloorUnreachable,
  pruneTier4CeilingExceeded,
  pruneUniverseInsufficient,
} from './pruning-predicates'

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function mkSnapshot(tier1Floor = 30, tier4Ceiling = 25): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor,
      tier4Ceiling,
    },
  }
}

function mkAccounting(tier1Count?: number, tier4Count?: number): JointAccountingState {
  const tierCounts = new Map<Tier, number>()
  if (tier1Count !== undefined) {
    tierCounts.set(1, tier1Count)
  }
  if (tier4Count !== undefined) {
    tierCounts.set(4, tier4Count)
  }

  return {
    setNumber: 1,
    selectedQuestionCodes: new Set(),
    placedCount: (tier1Count ?? 0) + (tier4Count ?? 0),
    documentCounts: new Map(),
    tierCounts,
    difficultyCounts: new Map(),
    learningObjectiveCounts: new Map(),
    patternCounts: new Map(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_prune_tier4_ceiling(): void {
  const snapshot = mkSnapshot(30, 25)

  // Below ceiling -> false
  assert.equal(pruneTier4CeilingExceeded(mkAccounting(0, 24), snapshot), false)
  // Equal ceiling -> false
  assert.equal(pruneTier4CeilingExceeded(mkAccounting(0, 25), snapshot), false)
  // Above ceiling -> true
  assert.equal(pruneTier4CeilingExceeded(mkAccounting(0, 26), snapshot), true)
  // Missing Tier 4 bucket -> count 0 -> false
  assert.equal(pruneTier4CeilingExceeded(mkAccounting(), snapshot), false)
}

function test_prune_tier1_floor(): void {
  const snapshot = mkSnapshot(30, 25)

  // currentTier1 = 20, remainingPositions = 50, remainingTier1 = 10 -> maxReachable = 20 + min(50, 10) = 30 == floor -> false
  assert.equal(pruneTier1FloorUnreachable(mkAccounting(20), 50, 10, snapshot), false)

  // maxReachable = 20 + min(50, 15) = 35 > floor -> false
  assert.equal(pruneTier1FloorUnreachable(mkAccounting(20), 50, 15, snapshot), false)

  // maxReachable = 20 + min(50, 9) = 29 < floor -> true
  assert.equal(pruneTier1FloorUnreachable(mkAccounting(20), 50, 9, snapshot), true)

  // maxReachable limited by remainingPositions: currentTier1 = 20, remainingPositions = 5, remainingTier1 = 20 -> maxReachable = 25 < floor -> true
  assert.equal(pruneTier1FloorUnreachable(mkAccounting(20), 5, 20, snapshot), true)

  // Missing Tier 1 bucket -> currentTier1 = 0, remainingPositions = 20, remainingTier1 = 20 -> maxReachable = 20 < 30 -> true
  assert.equal(pruneTier1FloorUnreachable(mkAccounting(), 20, 20, snapshot), true)

  // Invalid remaining counts fail-loud
  assert.throws(() => pruneTier1FloorUnreachable(mkAccounting(20), -1, 10, snapshot))
  assert.throws(() => pruneTier1FloorUnreachable(mkAccounting(20), 50, -5, snapshot))
  assert.throws(() => pruneTier1FloorUnreachable(mkAccounting(20), 10.5, 10, snapshot))
}

function test_prune_universe_insufficient(): void {
  // remaining > positions -> false
  assert.equal(pruneUniverseInsufficient(50, 30), false)
  // remaining == positions -> false
  assert.equal(pruneUniverseInsufficient(30, 30), false)
  // remaining < positions -> true
  assert.equal(pruneUniverseInsufficient(29, 30), true)

  // Invalid counts fail-loud
  assert.throws(() => pruneUniverseInsufficient(-1, 30))
  assert.throws(() => pruneUniverseInsufficient(30, -5))
  assert.throws(() => pruneUniverseInsufficient(20.5, 30))
}

function test_immutability(): void {
  const accounting = mkAccounting(20, 10)
  const snapshot = mkSnapshot(30, 25)

  const initialPlacedCount = accounting.placedCount
  const initialTier1 = accounting.tierCounts.get(1)

  pruneTier4CeilingExceeded(accounting, snapshot)
  pruneTier1FloorUnreachable(accounting, 50, 10, snapshot)

  assert.equal(accounting.placedCount, initialPlacedCount)
  assert.equal(accounting.tierCounts.get(1), initialTier1)
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Tier 4 ceiling pruning', fn: test_prune_tier4_ceiling },
  { name: '2. Tier 1 floor reachability pruning', fn: test_prune_tier1_floor },
  { name: '3. Universe insufficiency pruning', fn: test_prune_universe_insufficient },
  { name: '4. Immutability guaranteed', fn: test_immutability },
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
