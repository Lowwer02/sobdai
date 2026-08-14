/**
 * lib/engine/ranking/physical-profiles.test.ts
 * ----------------------------------------------------------------------------
 * Focused tests for buildPhysicalCandidateProfiles — pre-tie profile builder.
 *
 * RUN: npx jiti lib/engine/ranking/physical-profiles.test.ts
 */

import assert from 'node:assert/strict'
import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import type {
  ComponentContribution,
  CompositeScore,
  ScoreComponent,
  ScoringConfidence,
} from '../scoring/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { buildPhysicalCandidateProfiles } from './physical-profiles'

// ─── helpers ─────────────────────────────────────────────────────────────────

function mkSlot(overrides: Partial<BlueprintSlot> = {}): BlueprintSlot {
  return {
    setNumber: 1,
    document: 'พ.ร.บ.การศึกษาแห่งชาติ 2542',
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    learningObjective: 'LO1',
    ...overrides,
  }
}

function mkConfidence(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function mkComposite(
  questionCode: string,
  slot: BlueprintSlot,
  value = 0.8
): CompositeScore {
  const component: ScoreComponent = {
    componentId: 'difficulty_fit',
    questionCode,
    slot,
    normalized: { value, scale: 'exact-match' },
    inputs: [],
    reasoning: 'test',
    confidence: mkConfidence(),
    penalties: [],
  }
  const contribution: ComponentContribution = {
    component,
    contribution: 0.15,
    reason: 'weight 0.15',
  }
  return {
    questionCode,
    slot,
    value,
    breakdown: { contributions: [contribution], aggregationNote: 'weighted mean' },
    confidence: mkConfidence(),
    penalties: [],
  }
}

function mkCandidate(questionCode: string, setNumber: 1 | 2 | 3 | 4 | 5 = 1): Candidate {
  return {
    identity: { questionCode, questionId: `uuid-${questionCode}` },
    metadata: {
      document: 'พ.ร.บ.การศึกษาแห่งชาติ 2542',
      difficulty: 'Easy',
      topic: 'หลักการ',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: null,
      tags: [],
      category: null,
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'incomplete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document'],
      eligibleSlots: [mkSlot({ setNumber })],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q1' },
    },
  }
}

function mkCandidateSet(
  candidates: Candidate[],
  targetSets: 1 | 2 | 3 | 4 | 5 = 1
): CandidateSet {
  const snapshot = buildConstraintSnapshot()
  return {
    identity: {
      assemblyRequestId: 'assembly-test',
      generatedAt: null,
      bankStateHash: 'hash-test',
    },
    candidates,
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot: {
      ...snapshot,
      target: { ...snapshot.target, sets: targetSets },
    },
    warnings: [],
    statistics: {
      totalCandidates: candidates.length,
      fullConfidenceCount: candidates.length,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. One active Set — all candidates appear exactly once
function test_one_set_all_candidates_present(): void {
  const c1 = mkCandidate('Q-001')
  const c2 = mkCandidate('Q-002')
  const c3 = mkCandidate('Q-003')
  const cs = mkCandidateSet([c1, c2, c3], 1)
  const slot = mkSlot({ setNumber: 1 })
  const scores = [
    mkComposite('Q-001', slot),
    mkComposite('Q-002', slot),
  ]

  const result = buildPhysicalCandidateProfiles(cs, scores)

  assert.equal(result.length, 1, 'One Set output')
  assert.equal(result[0]!.setNumber, 1)
  assert.equal(result[0]!.profiles.length, 3, 'All 3 candidates present')
  const codes = result[0]!.profiles.map((p) => p.questionCode)
  assert.ok(codes.includes('Q-001'))
  assert.ok(codes.includes('Q-002'))
  assert.ok(codes.includes('Q-003'))
}

// 2. Three active Sets — every Set gets complete candidate universe
function test_three_sets_complete_universe(): void {
  const c1 = mkCandidate('Q-001')
  const c2 = mkCandidate('Q-002')
  const cs = mkCandidateSet([c1, c2], 3)
  const scores = [
    mkComposite('Q-001', mkSlot({ setNumber: 1 })),
    mkComposite('Q-001', mkSlot({ setNumber: 2 })),
    mkComposite('Q-001', mkSlot({ setNumber: 3 })),
    mkComposite('Q-002', mkSlot({ setNumber: 1 })),
  ]

  const result = buildPhysicalCandidateProfiles(cs, scores)

  assert.equal(result.length, 3, 'Three Sets')
  for (const setProfiles of result) {
    assert.equal(setProfiles.profiles.length, 2, `Set ${setProfiles.setNumber} must have 2 profiles`)
    const codes = setProfiles.profiles.map((p) => p.questionCode)
    assert.ok(codes.includes('Q-001'))
    assert.ok(codes.includes('Q-002'))
  }
}

// 3. Candidate with multiple CompositeScores — all PreTieAxisProfiles retained
function test_multiple_axis_scores_all_retained(): void {
  const c1 = mkCandidate('Q-001')
  const cs = mkCandidateSet([c1], 1)
  const slot1 = mkSlot({ setNumber: 1, difficulty: 'Easy' })
  const slot2 = mkSlot({ setNumber: 1, difficulty: 'Hard', learningObjective: 'LO2' })
  const scores = [
    mkComposite('Q-001', slot1, 0.8),
    mkComposite('Q-001', slot2, 0.6),
  ]

  const result = buildPhysicalCandidateProfiles(cs, scores)
  const profile = result[0]!.profiles[0]!

  assert.equal(profile.suitabilityProfiles.length, 2, 'Both axis profiles retained')
}

// 4. Candidate with zero CompositeScores — retained with empty suitabilityProfiles
function test_zero_scores_candidate_retained(): void {
  const c1 = mkCandidate('Q-001')
  const c2 = mkCandidate('Q-002')
  const cs = mkCandidateSet([c1, c2], 1)
  const scores = [mkComposite('Q-001', mkSlot({ setNumber: 1 }))]

  const result = buildPhysicalCandidateProfiles(cs, scores)
  const q2Profile = result[0]!.profiles.find((p) => p.questionCode === 'Q-002')!

  assert.ok(q2Profile !== undefined, 'Q-002 still present')
  assert.equal(q2Profile.suitabilityProfiles.length, 0, 'Empty suitabilityProfiles')
}

// 5. 163 candidates in the same axis — all 163 represented, no truncation
function test_163_candidates_no_truncation(): void {
  const candidates = Array.from({ length: 163 }, (_, i) =>
    mkCandidate(`Q-${String(i + 1).padStart(6, '0')}`)
  )
  const cs = mkCandidateSet(candidates, 1)
  const slot = mkSlot({ setNumber: 1, learningObjective: 'LO1' })
  const scores = candidates.map((c) => mkComposite(c.identity.questionCode, slot))

  const result = buildPhysicalCandidateProfiles(cs, scores)

  assert.equal(result[0]!.profiles.length, 163, '163 profiles — no truncation')
  for (const profile of result[0]!.profiles) {
    assert.equal(profile.suitabilityProfiles.length, 1)
  }
}

// 6. No rank field on produced suitability profiles
function test_no_rank_field_on_profiles(): void {
  const c1 = mkCandidate('Q-001')
  const cs = mkCandidateSet([c1], 1)
  const slot = mkSlot({ setNumber: 1 })
  const scores = [mkComposite('Q-001', slot)]

  const result = buildPhysicalCandidateProfiles(cs, scores)
  const axisProfile = result[0]!.profiles[0]!.suitabilityProfiles[0]!

  assert.ok(!('rank' in axisProfile), 'No rank field on PreTieAxisProfile')
}

// 7. Candidate object references preserved exactly
function test_candidate_references_preserved(): void {
  const c1 = mkCandidate('Q-001')
  const c2 = mkCandidate('Q-002')
  const cs = mkCandidateSet([c1, c2], 1)
  const scores: CompositeScore[] = []

  const result = buildPhysicalCandidateProfiles(cs, scores)
  const p1 = result[0]!.profiles.find((p) => p.questionCode === 'Q-001')!
  const p2 = result[0]!.profiles.find((p) => p.questionCode === 'Q-002')!

  assert.equal(p1.candidate, c1, 'Q-001 candidate reference is same object')
  assert.equal(p2.candidate, c2, 'Q-002 candidate reference is same object')
}

// 8. Deterministic output — same input produces same output
function test_deterministic_output(): void {
  const candidates = ['Q-003', 'Q-001', 'Q-002'].map((c) => mkCandidate(c))
  const cs = mkCandidateSet(candidates, 1)
  const slot = mkSlot({ setNumber: 1 })
  const scores = candidates.map((c) => mkComposite(c.identity.questionCode, slot))

  const result1 = buildPhysicalCandidateProfiles(cs, scores)
  const result2 = buildPhysicalCandidateProfiles(cs, scores)

  const codes1 = result1[0]!.profiles.map((p) => p.questionCode)
  const codes2 = result2[0]!.profiles.map((p) => p.questionCode)
  assert.deepEqual(codes1, codes2, 'Same output order across calls')
}

// 9. candidateSet order preserved (insertion order, not sorted)
function test_insertion_order_preserved(): void {
  const codes = ['Q-ZZZ', 'Q-AAA', 'Q-MMM']
  const candidates = codes.map((c) => mkCandidate(c))
  const cs = mkCandidateSet(candidates, 1)

  const result = buildPhysicalCandidateProfiles(cs, [])
  const outputCodes = result[0]!.profiles.map((p) => p.questionCode)
  assert.deepEqual(outputCodes, codes, 'Insertion order preserved')
}

// 10. Input CandidateSet and CompositeScore[] not mutated
function test_input_immutability(): void {
  const c1 = mkCandidate('Q-001')
  const c2 = mkCandidate('Q-002')
  const candidates = [c1, c2]
  const cs = mkCandidateSet(candidates, 1)
  const slot = mkSlot({ setNumber: 1 })
  const scores = [mkComposite('Q-001', slot)]

  const originalCandidateCount = cs.candidates.length
  const originalScoreCount = scores.length
  const originalSlotRef = scores[0]!.slot

  buildPhysicalCandidateProfiles(cs, scores)

  assert.equal(cs.candidates.length, originalCandidateCount, 'CandidateSet not mutated')
  assert.equal(scores.length, originalScoreCount, 'scores array not mutated')
  assert.equal(scores[0]!.slot, originalSlotRef, 'score slot reference unchanged')
}

// 11. Unknown questionCode in CompositeScore fails-loud
function test_unknown_questioncode_fails_loud(): void {
  const c1 = mkCandidate('Q-001')
  const cs = mkCandidateSet([c1], 1)
  const slot = mkSlot({ setNumber: 1 })
  const scores = [mkComposite('Q-UNKNOWN', slot)]

  assert.throws(
    () => buildPhysicalCandidateProfiles(cs, scores),
    /unknown questionCode.*Q-UNKNOWN/,
    'Throws for unknown questionCode'
  )
}

// 12. Inactive setNumber in CompositeScore fails-loud
function test_inactive_setnumber_fails_loud(): void {
  const c1 = mkCandidate('Q-001')
  const cs = mkCandidateSet([c1], 1) // only 1 active set
  const slot = mkSlot({ setNumber: 3 }) // set 3 is inactive
  const scores = [mkComposite('Q-001', slot)]

  assert.throws(
    () => buildPhysicalCandidateProfiles(cs, scores),
    /inactive setNumber 3/,
    'Throws for inactive setNumber'
  )
}

// 13. Duplicate CompositeScore for same candidate + logical slot fails-loud
function test_duplicate_slot_score_fails_loud(): void {
  const c1 = mkCandidate('Q-001')
  const cs = mkCandidateSet([c1], 1)
  const slot = mkSlot({ setNumber: 1 })
  const scores = [
    mkComposite('Q-001', slot, 0.8),
    mkComposite('Q-001', slot, 0.9), // same slot, same candidate — duplicate
  ]

  assert.throws(
    () => buildPhysicalCandidateProfiles(cs, scores),
    /duplicate CompositeScore.*Q-001/,
    'Throws for duplicate (candidate × slot) score'
  )
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const tests = [
  { name: '1. One Set — all candidates appear exactly once', fn: test_one_set_all_candidates_present },
  { name: '2. Three Sets — every Set gets complete candidate universe', fn: test_three_sets_complete_universe },
  { name: '3. Multiple CompositeScores — all PreTieAxisProfiles retained', fn: test_multiple_axis_scores_all_retained },
  { name: '4. Zero CompositeScores — candidate retained with empty suitabilityProfiles', fn: test_zero_scores_candidate_retained },
  { name: '5. 163 candidates in same axis — no truncation', fn: test_163_candidates_no_truncation },
  { name: '6. No rank field on produced suitability profiles', fn: test_no_rank_field_on_profiles },
  { name: '7. Candidate object references preserved exactly', fn: test_candidate_references_preserved },
  { name: '8. Deterministic output', fn: test_deterministic_output },
  { name: '9. CandidateSet insertion order preserved', fn: test_insertion_order_preserved },
  { name: '10. Input CandidateSet and CompositeScore[] not mutated', fn: test_input_immutability },
  { name: '11. Unknown questionCode fails-loud', fn: test_unknown_questioncode_fails_loud },
  { name: '12. Inactive setNumber fails-loud', fn: test_inactive_setnumber_fails_loud },
  { name: '13. Duplicate (candidate × slot) score fails-loud', fn: test_duplicate_slot_score_fails_loud },
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
    console.error(err)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
