/**
 * lib/engine/solver/position-slot.test.ts
 * ----------------------------------------------------------------------------
 * Physical PositionSlot Foundation Tests.
 *
 * RUN: npx jiti lib/engine/solver/position-slot.test.ts
 */

import assert from 'node:assert/strict'
import type { RunTarget } from '../reader/contracts'
import { buildPositionSlots, type PositionSlot } from './position-slot'

// ─── Test 1. One Set ─────────────────────────────────────────────────────────

function test_one_set(): void {
  const target: RunTarget = { sets: 1, perSet: 100 }
  const slots = buildPositionSlots(target, 1)

  assert.equal(slots.length, 100, 'must return exactly 100 PositionSlots')
  for (let i = 0; i < 100; i++) {
    const slot = slots[i]!
    assert.equal(slot.setNumber, 1, 'setNumber must always be 1')
    assert.equal(slot.positionNumber, i + 1, `positionNumber must be exactly ${i + 1}`)
  }
}

// ─── Test 2. Three Sets ──────────────────────────────────────────────────────

function test_three_sets(): void {
  const target: RunTarget = { sets: 3, perSet: 100 }
  const set1 = buildPositionSlots(target, 1)
  const set2 = buildPositionSlots(target, 2)
  const set3 = buildPositionSlots(target, 3)

  assert.equal(set1.length, 100)
  assert.equal(set2.length, 100)
  assert.equal(set3.length, 100)
  assert.equal(set1.length + set2.length + set3.length, 300, 'total positions across 3 sets must be 300')

  assert.equal(set1[0]!.setNumber, 1)
  assert.equal(set1[0]!.positionNumber, 1)

  assert.equal(set2[0]!.setNumber, 2)
  assert.equal(set2[0]!.positionNumber, 1, 'Set 1 and Set 2 may both have positionNumber 1')

  assert.equal(set3[99]!.positionNumber, 100)
}

// ─── Test 3. Five Sets ───────────────────────────────────────────────────────

function test_five_sets(): void {
  const target: RunTarget = { sets: 5, perSet: 100 }
  const allSlots: PositionSlot[] = []

  for (let setNum = 1; setNum <= 5; setNum++) {
    const slots = buildPositionSlots(target, setNum)
    assert.equal(slots.length, 100)
    allSlots.push(...slots)
  }

  assert.equal(allSlots.length, 500, '5 sets x 100 perSet must equal 500 positions')
}

// ─── Test 4. Invalid inactive Set ──────────────────────────────────────────

function test_invalid_inactive_set(): void {
  const target: RunTarget = { sets: 3, perSet: 100 }

  assert.throws(
    () => buildPositionSlots(target, 4),
    (err: Error) => err.message.includes('Fatal PositionSlot error') && err.message.includes('exceeds active target.sets'),
    'attempting active setNumber 4 when target.sets = 3 must fail loud'
  )
}

// ─── Test 5. Invalid perSet ──────────────────────────────────────────────────

function test_invalid_perset(): void {
  const invalidPerSets = [0, -10, 10.5, NaN]

  for (const perSet of invalidPerSets) {
    const target = { sets: 3, perSet } as unknown as RunTarget
    assert.throws(
      () => buildPositionSlots(target, 1),
      (err: Error) => err.message.includes('Fatal PositionSlot error'),
      `invalid perSet ${perSet} must fail loud`
    )
  }
}

// ─── Test 6. Physical-only contract ─────────────────────────────────────────

function test_physical_only_contract(): void {
  const target: RunTarget = { sets: 1, perSet: 5 }
  const slots = buildPositionSlots(target, 1)
  const slot = slots[0]!

  const keys = Object.keys(slot).sort()
  assert.deepEqual(keys, ['positionNumber', 'setNumber'], 'PositionSlot must contain physical keys ONLY')

  assert.equal('slotId' in slot, false)
  assert.equal('slot' in slot, false)
  assert.equal('blueprintSlot' in slot, false)
  assert.equal('axisTarget' in slot, false)
  assert.equal('score' in slot, false)
  assert.equal('candidate' in slot, false)
  assert.equal('questionCode' in slot, false)
  assert.equal('document' in slot, false)
  assert.equal('topic' in slot, false)
  assert.equal('difficulty' in slot, false)
  assert.equal('learningObjective' in slot, false)
  assert.equal('pattern' in slot, false)
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: 'A. One Set', fn: test_one_set },
  { name: 'B. Three Sets', fn: test_three_sets },
  { name: 'C. Five Sets', fn: test_five_sets },
  { name: 'D. Invalid inactive Set', fn: test_invalid_inactive_set },
  { name: 'E. Invalid perSet', fn: test_invalid_perset },
  { name: 'F. Physical-only contract', fn: test_physical_only_contract },
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
