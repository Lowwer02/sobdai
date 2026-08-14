/**
 * lib/engine/solver/search-expansion.test.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Search Single-Depth Expansion Tests.
 *
 * RUN: npx jiti lib/engine/solver/search-expansion.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { CandidateProfile, SetCandidateProfiles } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { applyCandidate, createJointAccounting } from './joint-accounting'
import { expandOneDepth } from './search-expansion'
import { buildSetSolverInput } from './set-solver-input'

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

function mkInput(profiles: readonly CandidateProfile[], snapshot = mkSnapshot()): ReturnType<typeof buildSetSolverInput> {
  const universe: SetCandidateProfiles = {
    setNumber: 1,
    profiles,
  }
  return buildSetSolverInput(universe, snapshot)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_branch_count(): void {
  const candidates = [mkProfile('Q-001', 1), mkProfile('Q-002', 2), mkProfile('Q-003', 1)]
  const input = mkInput(candidates)
  const accounting = createJointAccounting(1)

  const results = expandOneDepth(input, accounting, candidates)

  assert.equal(results.length, 3, 'returns exactly one transition per input candidate')
}

function test_deterministic_ordering(): void {
  const snapshot = mkSnapshot(30)
  const candidates = [
    mkProfile('Q-003', 2),
    mkProfile('Q-001', 1),
    mkProfile('Q-002', 2),
    mkProfile('Q-004', 1),
  ]
  const input = mkInput(candidates, snapshot)
  const accounting = createJointAccounting(1) // T1 count = 0 < 30 (unsatisfied)

  const results = expandOneDepth(input, accounting, candidates)

  assert.deepEqual(
    results.map((r) => r.candidate.questionCode),
    ['Q-001', 'Q-004', 'Q-002', 'Q-003'],
    'Tier 1 candidates ordered first lexically, followed by non-Tier 1 candidates lexically'
  )
}

function test_remaining_after_exclusion(): void {
  const candidates = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)]
  const input = mkInput(candidates)
  const accounting = createJointAccounting(1)

  const results = expandOneDepth(input, accounting, candidates)

  for (const r of results) {
    assert.equal(
      r.accounting.selectedQuestionCodes.has(r.candidate.questionCode),
      true,
      'applied candidate is present in child accounting'
    )
  }
}

function test_tier1_remaining_count(): void {
  const snapshot = mkSnapshot(30, 25, 100) // tier1Floor = 30
  // Fill 80 positions: 10 Tier 1 + 70 Tier 2. Remaining positions = 20.
  // Pool has 1 Tier 1 candidate (Q-T1-11) and 19 Tier 2 candidates.
  // When Q-T1-11 is evaluated, remaining Tier 1 = 0 -> maxReachable = 10 + 1 + 0 = 11 < 30 -> PRUNED.
  // When a Tier 2 candidate is evaluated, remaining Tier 1 = 1 -> maxReachable = 10 + 0 + min(19, 1) = 11 < 30 -> PRUNED.
  let accounting = createJointAccounting(1)
  for (let i = 1; i <= 10; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-T1-${i}`, 1))
  }
  for (let i = 11; i <= 80; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-T2-${i}`, 2))
  }

  const pool = [mkProfile('Q-T1-11', 1)]
  for (let i = 81; i <= 99; i++) {
    pool.push(mkProfile(`Q-T2-${i}`, 2))
  }

  const input = mkInput(pool, snapshot)
  const results = expandOneDepth(input, accounting, pool)

  assert.equal(results.length, pool.length)
  for (const r of results) {
    assert.equal(r.status, 'PRUNED', 'all branches pruned because Tier 1 floor is unreachable')
  }
}

function test_distinct_remaining_count(): void {
  const snapshot = mkSnapshot(30, 25, 10) // perSet = 10
  const accounting = createJointAccounting(1)

  // Provide only 5 candidates for 10 positions -> remaining after 1 applied = 4 < 9 positions -> PRUNED
  const pool = [
    mkProfile('Q-001', 1),
    mkProfile('Q-002', 1),
    mkProfile('Q-003', 1),
    mkProfile('Q-004', 1),
    mkProfile('Q-005', 1),
  ]

  const input = mkInput(pool, snapshot)
  const results = expandOneDepth(input, accounting, pool)

  for (const r of results) {
    assert.equal(r.status, 'PRUNED', 'branches pruned due to universe insufficiency')
  }
}

function test_mixed_branch_results(): void {
  const snapshot = mkSnapshot(1, 1, 10) // tier4Ceiling = 1
  let accounting = createJointAccounting(1)
  accounting = applyCandidate(accounting, mkCandidate('Q-T4-1', 4)) // Tier 4 count = 1 (at ceiling)

  // pool has Q-T1 (Tier 1) and Q-T4-2 (Tier 4).
  // Q-T1 branch -> Tier 4 stays 1 <= 1 -> CONTINUE
  // Q-T4-2 branch -> Tier 4 becomes 2 > 1 -> PRUNED
  const pool = [mkProfile('Q-T1', 1), mkProfile('Q-T4-2', 4)]

  // Provide enough remaining candidates to avoid universe insufficiency prune
  for (let i = 1; i <= 10; i++) {
    pool.push(mkProfile(`Q-FILL-${i}`, 1))
  }

  const input = mkInput(pool, snapshot)
  const results = expandOneDepth(input, accounting, pool)

  const statuses = results.map((r) => r.status)
  assert.equal(statuses.includes('CONTINUE'), true, 'contains CONTINUE branch')
  assert.equal(statuses.includes('PRUNED'), true, 'contains PRUNED branch')
}

function test_complete_branch(): void {
  const snapshot = mkSnapshot(30, 25, 100)
  let accounting = createJointAccounting(1)

  // Fill 99 positions: 30 Tier 1 + 69 Tier 2
  for (let i = 1; i <= 30; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-${String(i).padStart(3, '0')}`, 1))
  }
  for (let i = 31; i <= 99; i++) {
    accounting = applyCandidate(accounting, mkCandidate(`Q-${String(i).padStart(3, '0')}`, 2))
  }

  const pool = [mkProfile('Q-100', 2)]
  const input = mkInput(pool, snapshot)

  const results = expandOneDepth(input, accounting, pool)

  assert.equal(results.length, 1)
  assert.equal(results[0]!.status, 'COMPLETE')
}

function test_no_short_circuit(): void {
  const snapshot = mkSnapshot(1, 0, 3) // perSet = 3, tier1Floor = 1, tier4Ceiling = 0
  let accounting = createJointAccounting(1)
  accounting = applyCandidate(accounting, mkCandidate('Q-001', 1))
  accounting = applyCandidate(accounting, mkCandidate('Q-002', 2))

  // 3rd candidate choices:
  // Q-003 (Tier 2) -> completes allocation (T4 count = 0 <= 0) -> COMPLETE
  // Q-T4-1 (Tier 4) -> pushes Tier 4 count to 1 > 0 -> PRUNED
  const pool = [mkProfile('Q-003', 2), mkProfile('Q-T4-1', 4)]
  const input = mkInput(pool, snapshot)

  const results = expandOneDepth(input, accounting, pool)

  assert.equal(results.length, 2, 'all branches returned despite COMPLETE in first branch')
  assert.equal(results[0]!.status, 'COMPLETE')
  assert.equal(results[1]!.status, 'PRUNED')
}

function test_set_mismatch_fail_loud(): void {
  const pool = [mkProfile('Q-001', 1)]
  const input = mkInput(pool) // setNumber = 1
  const accounting = createJointAccounting(2) // setNumber = 2 mismatch!

  assert.throws(
    () => expandOneDepth(input, accounting, pool),
    (err: Error) => err.message.includes('Fatal SearchExpansion error') && err.message.includes('does not match input.setNumber'),
    'mismatched setNumber must fail loud'
  )
}

function test_immutability(): void {
  const pool = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const input = mkInput(pool)
  const accounting = createJointAccounting(1)

  const initialPlaced = accounting.placedCount
  const initialPoolLen = pool.length

  expandOneDepth(input, accounting, pool)

  assert.equal(accounting.placedCount, initialPlaced, 'accounting must not be mutated')
  assert.equal(pool.length, initialPoolLen, 'candidates array must not be mutated')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Branch count equals input candidate count', fn: test_branch_count },
  { name: '2. Deterministic branch ordering', fn: test_deterministic_ordering },
  { name: '3. remainingAfter excludes current candidate', fn: test_remaining_after_exclusion },
  { name: '4. Tier 1 remaining count correctness', fn: test_tier1_remaining_count },
  { name: '5. Distinct remaining count correctness', fn: test_distinct_remaining_count },
  { name: '6. Mixed branch results (CONTINUE + PRUNED)', fn: test_mixed_branch_results },
  { name: '7. COMPLETE branch detection', fn: test_complete_branch },
  { name: '8. No short-circuit (all branches returned)', fn: test_no_short_circuit },
  { name: '9. Set mismatch fail-loud', fn: test_set_mismatch_fail_loud },
  { name: '10. Immutability guaranteed', fn: test_immutability },
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
