/**
 * lib/engine/solver/branch-ordering.test.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Candidate Branch Ordering Tests.
 *
 * RUN: npx jiti lib/engine/solver/branch-ordering.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { AxisProfile, CandidateProfile } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { orderCandidates } from './branch-ordering'
import type { JointAccountingState } from './joint-accounting'

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

function mkProfile(questionCode: string, tier: Tier = 1, suitabilityProfiles: readonly AxisProfile[] = []): CandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode, tier),
    suitabilityProfiles,
  }
}

function mkSnapshot(tier1Floor = 30): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor,
    },
  }
}

function mkAccounting(tier1Count = 0): JointAccountingState {
  const tierCounts = new Map<Tier, number>()
  if (tier1Count > 0) {
    tierCounts.set(1, tier1Count)
  }
  return {
    setNumber: 1,
    selectedQuestionCodes: new Set(),
    placedCount: tier1Count,
    documentCounts: new Map(),
    tierCounts,
    difficultyCounts: new Map(),
    learningObjectiveCounts: new Map(),
    patternCounts: new Map(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_tier1_priority_unsatisfied(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(10) // 10 < 30 (unsatisfied)

  const p1 = mkProfile('Q-003', 2)
  const p2 = mkProfile('Q-001', 1)
  const p3 = mkProfile('Q-002', 2)
  const p4 = mkProfile('Q-004', 1)

  const ordered = orderCandidates(accounting, [p1, p2, p3, p4], snapshot)

  assert.equal(ordered[0]!.questionCode, 'Q-001', 'Tier 1 Q-001 first')
  assert.equal(ordered[1]!.questionCode, 'Q-004', 'Tier 1 Q-004 second')
  assert.equal(ordered[2]!.questionCode, 'Q-002', 'Non-Tier 1 Q-002 third')
  assert.equal(ordered[3]!.questionCode, 'Q-003', 'Non-Tier 1 Q-003 fourth')
}

function test_lexical_within_tier1(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(0)

  const p1 = mkProfile('Q-009', 1)
  const p2 = mkProfile('Q-002', 1)
  const p3 = mkProfile('Q-005', 1)

  const ordered = orderCandidates(accounting, [p1, p2, p3], snapshot)

  assert.deepEqual(
    ordered.map((p) => p.questionCode),
    ['Q-002', 'Q-005', 'Q-009']
  )
}

function test_lexical_within_nontier1(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(0)

  const p1 = mkProfile('Q-008', 3)
  const p2 = mkProfile('Q-003', 2)
  const p3 = mkProfile('Q-007', 4)

  const ordered = orderCandidates(accounting, [p1, p2, p3], snapshot)

  assert.deepEqual(
    ordered.map((p) => p.questionCode),
    ['Q-003', 'Q-007', 'Q-008']
  )
}

function test_tier1_satisfied_all_lexical(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(30) // 30 >= 30 (satisfied)

  const p1 = mkProfile('Q-004', 1)
  const p2 = mkProfile('Q-001', 2)
  const p3 = mkProfile('Q-003', 1)
  const p4 = mkProfile('Q-002', 3)

  const ordered = orderCandidates(accounting, [p1, p2, p3, p4], snapshot)

  assert.deepEqual(
    ordered.map((p) => p.questionCode),
    ['Q-001', 'Q-002', 'Q-003', 'Q-004'],
    'when floor satisfied, order strictly by lexical questionCode regardless of tier'
  )
}

function test_no_candidate_dropped_or_duplicated(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(0)

  const inputs = [
    mkProfile('Q-010', 2),
    mkProfile('Q-001', 1),
    mkProfile('Q-005', 3),
    mkProfile('Q-002', 1),
  ]

  const ordered = orderCandidates(accounting, inputs, snapshot)

  assert.equal(ordered.length, inputs.length, 'length must remain exact')
  const codesIn = new Set(inputs.map((p) => p.questionCode))
  const codesOut = new Set(ordered.map((p) => p.questionCode))
  assert.deepEqual(codesOut, codesIn, 'no code dropped or duplicated')
}

function test_determinism(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(0)

  const inputs1 = [mkProfile('Q-003', 2), mkProfile('Q-001', 1), mkProfile('Q-002', 1)]
  const inputs2 = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 2)]

  const out1 = orderCandidates(accounting, inputs1, snapshot)
  const out2 = orderCandidates(accounting, inputs2, snapshot)

  assert.deepEqual(
    out1.map((p) => p.questionCode),
    out2.map((p) => p.questionCode),
    'different input ordering must produce identical output ordering'
  )
}

function test_immutability(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(0)

  const inputs = [mkProfile('Q-003', 2), mkProfile('Q-001', 1)]
  const initialFirstCode = inputs[0]!.questionCode

  orderCandidates(accounting, inputs, snapshot)

  assert.equal(inputs[0]!.questionCode, initialFirstCode, 'input array must not be mutated')
}

function test_no_score_dependency(): void {
  const snapshot = mkSnapshot(30)
  const accounting = mkAccounting(0)

  const slotObj = {
    setNumber: 1 as const,
    document: 'DOC-A',
    difficulty: 'Easy' as const,
    blueprintType: 'Memory' as const,
    pattern: undefined,
  }

  // Dummy suitability profile with arbitrary score values
  const dummySuitability: AxisProfile = {
    slotId: 'SLOT-1',
    slot: slotObj,
    rank: 1,
    compositeScore: {
      questionCode: 'Q-001',
      slot: slotObj,
      value: 0.99,
      breakdown: {
        contributions: [],
        aggregationNote: 'test',
      },
      confidence: { level: 'high', reducingSignals: [], propagationNote: null },
      penalties: [],
    },
  }

  const p1WithScore = mkProfile('Q-001', 1, [dummySuitability])
  const p2NoScore = mkProfile('Q-002', 1, [])

  const ordered = orderCandidates(accounting, [p2NoScore, p1WithScore], snapshot)

  assert.deepEqual(
    ordered.map((p) => p.questionCode),
    ['Q-001', 'Q-002'],
    'score presence or magnitude must not influence branch ordering'
  )
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. Tier 1 priority when floor unsatisfied', fn: test_tier1_priority_unsatisfied },
  { name: '2. Lexical within Tier 1 group', fn: test_lexical_within_tier1 },
  { name: '3. Lexical within non-Tier 1 group', fn: test_lexical_within_nontier1 },
  { name: '4. All lexical when Tier 1 floor satisfied', fn: test_tier1_satisfied_all_lexical },
  { name: '5. No candidate dropped or duplicated', fn: test_no_candidate_dropped_or_duplicated },
  { name: '6. Determinism', fn: test_determinism },
  { name: '7. Immutability guaranteed', fn: test_immutability },
  { name: '8. No score dependency', fn: test_no_score_dependency },
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
