/**
 * lib/engine/solver/search-transition.test.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Search Transition Tests.
 *
 * RUN: npx jiti lib/engine/solver/search-transition.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { CandidateProfile } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { applyCandidate, createJointAccounting } from './joint-accounting'
import { transitionCandidate } from './search-transition'

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function mkCandidate(questionCode: string, tier: Tier = 1): Candidate {
  return {
    identity: { questionCode, questionId: questionCode },
    metadata: {
      document: 'DOC-A',
      difficulty: 'Easy',
      topic: 'Topic A',
      status: 'Published',
      tier,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'Sec 1',
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
      filtersPassed: ['exclusion', 'status', 'document', 'coverage', 'difficulty'],
      eligibleSlots: [],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function mkProfile(questionCode: string, tier: Tier = 1): CandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode, tier),
    suitabilityProfiles: [],
  }
}

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

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_continue_status(): void {
  const snapshot = mkSnapshot(30, 25, 100)
  const accounting = createJointAccounting(1)
  const profile = mkProfile('Q-001', 1)

  const res = transitionCandidate(accounting, profile, snapshot, 50, 100)

  assert.equal(res.status, 'CONTINUE')
  assert.equal(res.accounting.placedCount, 1)
  assert.equal(res.accounting.selectedQuestionCodes.has('Q-001'), true)
}

function test_tier4_pruned(): void {
  const snapshot = mkSnapshot(30, 2, 100) // tier4Ceiling = 2
  let accounting = createJointAccounting(1)
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-1', 4))
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-2', 4))

  // 3rd Tier 4 candidate -> count becomes 3 > 2 (ceiling)
  const p3 = mkProfile('Q-T4-3', 4)
  const res = transitionCandidate(accounting, p3, snapshot, 50, 100)

  assert.equal(res.status, 'PRUNED')
}

function test_tier1_unreachable_pruned(): void {
  const snapshot = mkSnapshot(30, 25, 100) // tier1Floor = 30
  let accounting = createJointAccounting(1)

  // Current placed = 80, Tier 1 placed = 10
  // remainingPositions after apply of 1 candidate = 100 - 81 = 19
  // remainingTier1AfterApply = 5 -> maxReachable = 10 + 1 + min(19, 5) = 16 < 30 (unreachable)
  for (let i = 1; i <= 10; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-T1-${i}`, 1))
  }
  for (let i = 11; i <= 80; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-T2-${i}`, 2))
  }

  const pNext = mkProfile('Q-T1-11', 1)
  const res = transitionCandidate(accounting, pNext, snapshot, 5, 100)

  assert.equal(res.status, 'PRUNED')
}

function test_universe_insufficient_pruned(): void {
  const snapshot = mkSnapshot(30, 25, 100) // perSet = 100
  const accounting = createJointAccounting(1)

  // placed = 1, remainingPositions = 99
  // remainingDistinctCandidatesAfterApply = 50 < 99 -> insufficient
  const p1 = mkProfile('Q-001', 1)
  const res = transitionCandidate(accounting, p1, snapshot, 50, 50)

  assert.equal(res.status, 'PRUNED')
}

function test_complete_status(): void {
  const snapshot = mkSnapshot(30, 25, 100)
  let accounting = createJointAccounting(1)

  // Place 30 Tier 1 candidates + 69 Tier 2 candidates = 99 candidates
  for (let i = 1; i <= 30; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-${String(i).padStart(3, '0')}`, 1))
  }
  for (let i = 31; i <= 99; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-${String(i).padStart(3, '0')}`, 2))
  }

  // 100th candidate completes allocation (placed = 100, uniqueness = 100, T1 = 30 >= 30, T4 = 0 <= 25)
  const p100 = mkProfile('Q-100', 2)
  const res = transitionCandidate(accounting, p100, snapshot, 0, 0)

  assert.equal(res.status, 'COMPLETE')
  assert.equal(res.accounting.placedCount, 100)
}

function test_duplicate_fail_loud(): void {
  const snapshot = mkSnapshot(30, 25, 100)
  let accounting = createJointAccounting(1)
  const p1 = mkProfile('Q-001', 1)
  accounting = applyCandidate(accounting, p1.candidate)

  assert.throws(
    () => transitionCandidate(accounting, p1, snapshot, 50, 100),
    (err: Error) => err.message.includes('Fatal JointAccounting error'),
    'applying duplicate questionCode must throw fail-loud error'
  )
}

function test_parent_immutability(): void {
  const snapshot = mkSnapshot(30, 25, 100)
  const accounting = createJointAccounting(1)
  const p1 = mkProfile('Q-001', 1)

  const initialPlacedCount = accounting.placedCount

  transitionCandidate(accounting, p1, snapshot, 50, 100)

  assert.equal(accounting.placedCount, initialPlacedCount, 'parent accounting must remain unmutated')
  assert.equal(accounting.selectedQuestionCodes.has('Q-001'), false)
}

function test_pruned_child_semantics(): void {
  const snapshot = mkSnapshot(30, 2, 100) // tier4Ceiling = 2
  let accounting = createJointAccounting(1)
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-1', 4))
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-2', 4))

  const p3 = mkProfile('Q-T4-3', 4)
  const res = transitionCandidate(accounting, p3, snapshot, 50, 100)

  assert.equal(res.status, 'PRUNED')
  assert.equal(res.accounting.placedCount, 3, 'child accounting in PRUNED result contains the applied candidate')
  assert.equal(res.accounting.selectedQuestionCodes.has('Q-T4-3'), true)
  assert.equal(accounting.placedCount, 2, 'parent accounting remains untouched at 2')
}

function test_prune_precedence(): void {
  const snapshot = mkSnapshot(30, 2, 100) // tier4Ceiling = 2
  let accounting = createJointAccounting(1)
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-1', 4))
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-2', 4))

  // Candidate pushes Tier 4 above ceiling AND remaining universe is also insufficient (0 < 97)
  const p3 = mkProfile('Q-T4-3', 4)
  const res = transitionCandidate(accounting, p3, snapshot, 0, 0)

  assert.equal(res.status, 'PRUNED', 'must return PRUNED without error')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. CONTINUE status', fn: test_continue_status },
  { name: '2. Tier 4 ceiling PRUNED', fn: test_tier4_pruned },
  { name: '3. Tier 1 unreachable PRUNED', fn: test_tier1_unreachable_pruned },
  { name: '4. Universe insufficient PRUNED', fn: test_universe_insufficient_pruned },
  { name: '5. COMPLETE status', fn: test_complete_status },
  { name: '6. Duplicate candidate fail-loud', fn: test_duplicate_fail_loud },
  { name: '7. Parent immutability guaranteed', fn: test_parent_immutability },
  { name: '8. PRUNED child accounting semantics', fn: test_pruned_child_semantics },
  { name: '9. Prune precedence order', fn: test_prune_precedence },
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
