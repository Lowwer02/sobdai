/**
 * lib/engine/ranking/set-profiles.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking Phase 2B — Candidate-centric projection bridge tests.
 *
 * Verifies the additive `setProfiles` projection on RankedCandidateSet:
 *   - exactly one CandidateProfile per questionCode per Set
 *   - multi-axis suitability preserved with original per-slot ranks
 *   - deterministic lexical-by-questionCode and by-slotId ordering
 *   - cross-Set reuse independent
 *   - no global/aggregated candidate score on the new contract
 *   - legacy `slots` output structurally and order-equivalent
 *   - input immutability (no mutation of tie-resolved data or legacy slots)
 *
 * RUN: npx jiti lib/engine/ranking/set-profiles.test.ts
 */

import assert from 'node:assert/strict'

import type {
  BlueprintSlot,
  Candidate,
  CandidateSet,
  GeneratorWarning,
} from '../generator/contracts'
import type {
  ComponentContribution,
  ComponentId,
  CompositeScore,
  Penalty,
  RawSignal,
  ScoreComponent,
  ScoringConfidence,
} from '../scoring/contracts'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import type { RankedCandidateSet } from './contracts'
import { emitRankedCandidateSet } from './emission'
import { prepareScoreOrdering } from './runtime'
import { resolveTies } from './tie-resolution'

// ─── helpers (mirror emission.test.ts conventions) ──────────────────────────

function mkSlot(overrides: Partial<BlueprintSlot> = {}): BlueprintSlot {
  return {
    setNumber: 1,
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    learningObjective: 'LO1',
    ...overrides,
  }
}

function mkSignal(questionCode = 'Q-000001', overrides: Partial<RawSignal> = {}): RawSignal {
  return {
    questionCode,
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
    ...overrides,
  }
}

function mkConfidence(level: ScoringConfidence['level'] = 'high'): ScoringConfidence {
  return level === 'high'
    ? { level: 'high', reducingSignals: [], propagationNote: null }
    : {
        level: 'low',
        reducingSignals: ['pattern'],
        propagationNote: 'pattern evidence missing',
      }
}

function mkComponent(
  componentId: ComponentId,
  questionCode: string,
  slot: BlueprintSlot
): ScoreComponent {
  return {
    componentId,
    questionCode,
    slot,
    normalized: { value: 0.8, scale: 'fixture-scale' },
    inputs: [mkSignal(questionCode)],
    reasoning: `${componentId} fixture reasoning`,
    confidence: mkConfidence(),
    penalties: [],
  }
}

function mkComposite(
  questionCode: string,
  value: number,
  opts: {
    readonly slot?: BlueprintSlot
    readonly confidence?: ScoringConfidence['level']
    readonly penalties?: readonly Penalty[]
    readonly componentIds?: readonly ComponentId[]
  } = {}
): CompositeScore {
  const slot = opts.slot ?? mkSlot()
  const componentIds = opts.componentIds ?? ['difficulty_fit', 'usage']
  const components = componentIds.map((id) => mkComponent(id, questionCode, slot))
  const contributions: ComponentContribution[] = components.map((component) => ({
    component,
    contribution: value / components.length,
    reason: `${component.componentId} fixture contribution`,
  }))
  return {
    questionCode,
    slot,
    value,
    breakdown: {
      contributions,
      aggregationNote: 'fixture aggregation',
    },
    confidence: mkConfidence(opts.confidence ?? 'high'),
    penalties: opts.penalties ?? [],
  }
}

function mkCandidate(questionCode: string, slot = mkSlot()): Candidate {
  return {
    identity: { questionCode, questionId: questionCode },
    metadata: {
      document: slot.document ?? 'LAW-ACT-HED-2562',
      difficulty: slot.difficulty ?? 'Easy',
      topic: 'มาตรา 6',
      status: 'Published',
      tier: 1,
      blueprintType: slot.blueprintType ?? 'Memory',
      learningObjective: slot.learningObjective ?? 'LO1',
      questionPattern: slot.pattern ?? 'Positive',
      section: 'ม.6',
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
      eligibleSlots: [slot],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function mkCandidateSet(codes: readonly string[], opts: { warning?: GeneratorWarning, targetSets?: number } = {}): CandidateSet {
  const snapshot = buildConstraintSnapshot()
  const constraintSnapshot = {
    ...snapshot,
    target: { ...snapshot.target, sets: opts.targetSets ?? snapshot.target.sets }
  }
  return {
    identity: { assemblyRequestId: 'req-test-001', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: codes.map((code) => mkCandidate(code)),
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot,
    warnings: opts.warning === undefined ? [] : [opts.warning],
    statistics: {
      totalCandidates: codes.length,
      fullConfidenceCount: codes.length,
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

function emit(composites: readonly CompositeScore[], codes?: readonly string[], targetSets?: number): RankedCandidateSet {
  const uniqueCodes = [...new Set(codes ?? composites.map((composite) => composite.questionCode))]
  const candidateSet = mkCandidateSet(uniqueCodes, { targetSets })
  const ordering = prepareScoreOrdering({ composites })
  const tieResolution = resolveTies({ ordering, maxTieGroupSize: 10 })
  return emitRankedCandidateSet({
    candidateSet,
    tieResolution,
    rankingVersion: '1.0.0',
  })
}

// ─── Test 1. Unique candidate per Set ───────────────────────────────────────

function verifies_unique_candidate_per_set(): void {
  // Q-001 evaluated against THREE different AxisTargets in Set 1.
  const slotA = mkSlot({ difficulty: 'Easy', learningObjective: 'LO1' })
  const slotB = mkSlot({ difficulty: 'Medium', learningObjective: 'LO2' })
  const slotC = mkSlot({ difficulty: 'Hard', learningObjective: 'LO3' })
  const ranked = emit([
    mkComposite('Q-001', 0.9, { slot: slotA }),
    mkComposite('Q-001', 0.8, { slot: slotB }),
    mkComposite('Q-001', 0.7, { slot: slotC }),
  ])

  assert.ok(ranked.setProfiles !== undefined, 'setProfiles must be emitted')
  const set1 = ranked.setProfiles!.find((profile) => profile.setNumber === 1)
  assert.ok(set1, 'Set 1 profile must exist')

  const q1Profiles = set1!.profiles.filter((profile) => profile.questionCode === 'Q-001')
  assert.equal(q1Profiles.length, 1, 'Q-001 must appear exactly once in Set 1')
}

// ─── Test 2. Multi-axis preservation ────────────────────────────────────────

function verifies_multi_axis_preservation(): void {
  const slotA = mkSlot({ difficulty: 'Easy', learningObjective: 'LO1' })
  const slotB = mkSlot({ difficulty: 'Medium', learningObjective: 'LO2' })
  const slotC = mkSlot({ difficulty: 'Hard', learningObjective: 'LO3' })
  const ranked = emit([
    mkComposite('Q-001', 0.9, { slot: slotA }),
    mkComposite('Q-001', 0.8, { slot: slotB }),
    mkComposite('Q-001', 0.7, { slot: slotC }),
  ])

  const set1 = ranked.setProfiles!.find((profile) => profile.setNumber === 1)!
  const q1 = set1.profiles.find((profile) => profile.questionCode === 'Q-001')!

  // Must retain all three axis evaluations, each with its original slot + rank.
  assert.equal(q1.suitabilityProfiles.length, 3, 'must retain all 3 AxisProfiles')

  // Each AxisProfile must reference one of the original slots and a valid rank.
  const seenSlotIds = new Set(q1.suitabilityProfiles.map((axis) => axis.slotId))
  assert.equal(seenSlotIds.size, 3, 'all three distinct slotIds must be present')

  // The retained compositeScore must be the original by identity, per slot.
  for (const axis of q1.suitabilityProfiles) {
    assert.equal(axis.compositeScore.questionCode, 'Q-001')
    assert.equal(axis.compositeScore.slot, axis.slot)
    assert.equal(axis.rank >= 1, true, 'rank must be one-based and positive')
  }

  // No ownership: every AxisProfile carries its own slot identity.
  const slotDocumentCounts = new Map<string, number>()
  for (const axis of q1.suitabilityProfiles) {
    const key = axis.slotId
    slotDocumentCounts.set(key, (slotDocumentCounts.get(key) ?? 0) + 1)
  }
  for (const count of slotDocumentCounts.values()) {
    assert.equal(count, 1, 'each axis appears once per candidate')
  }
}

// ─── Test 3. Deterministic candidate order ──────────────────────────────────

function verifies_deterministic_candidate_order(): void {
  // Provide composites in a deliberately non-lexical order.
  const ranked = emit([
    mkComposite('Q-003', 0.5),
    mkComposite('Q-001', 0.9),
    mkComposite('Q-002', 0.7),
  ])

  const set1 = ranked.setProfiles!.find((profile) => profile.setNumber === 1)!
  assert.deepEqual(
    set1.profiles.map((profile) => profile.questionCode),
    ['Q-001', 'Q-002', 'Q-003'],
    'profiles must be sorted lexical ascending by questionCode'
  )
}

// ─── Test 4. Deterministic suitability profile order ────────────────────────

function verifies_deterministic_suitability_profile_order(): void {
  // Build slots whose stable slotIds sort differently than insertion order.
  // slotId is derived from set + document + difficulty + blueprintType + pattern + lo.
  const slotZ = mkSlot({ learningObjective: 'LO4' }) // later slotId
  const slotA = mkSlot({ learningObjective: 'LO1' }) // earlier slotId
  const ranked = emit([
    mkComposite('Q-001', 0.9, { slot: slotZ }),
    mkComposite('Q-001', 0.8, { slot: slotA }),
  ])

  const set1 = ranked.setProfiles!.find((profile) => profile.setNumber === 1)!
  const q1 = set1.profiles.find((profile) => profile.questionCode === 'Q-001')!

  const slotIds = q1.suitabilityProfiles.map((axis) => axis.slotId)
  const sorted = [...slotIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  assert.deepEqual(slotIds, sorted, 'suitabilityProfiles must be sorted by slotId ascending')

  // And the order must be stable across repeated emissions.
  const ranked2 = emit([
    mkComposite('Q-001', 0.9, { slot: slotZ }),
    mkComposite('Q-001', 0.8, { slot: slotA }),
  ])
  const set1b = ranked2.setProfiles!.find((profile) => profile.setNumber === 1)!
  const q1b = set1b.profiles.find((profile) => profile.questionCode === 'Q-001')!
  assert.deepEqual(
    q1b.suitabilityProfiles.map((axis) => axis.slotId),
    slotIds,
    'suitabilityProfile order must be stable across emissions'
  )
}

// ─── Test 5. Cross-Set reuse ────────────────────────────────────────────────

function verifies_cross_set_reuse(): void {
  // Q-001 evaluated in both Set 1 and Set 2 (cross-set reuse allowed).
  const slotSet1 = mkSlot({ setNumber: 1, learningObjective: 'LO1' })
  const slotSet2 = mkSlot({ setNumber: 2, learningObjective: 'LO2' })
  // By passing targetSets = 2, we expect exactly 2 sets in the output.
  const ranked = emit([
    mkComposite('Q-001', 0.9, { slot: slotSet1 }),
    mkComposite('Q-001', 0.8, { slot: slotSet2 }),
  ], undefined, 2)

  // setProfiles ordered by setNumber ascending for all active sets.
  assert.deepEqual(
    ranked.setProfiles!.map((profile) => profile.setNumber),
    [1, 2],
    'setProfiles must be ordered by setNumber ascending covering the complete universe'
  )

  const set1 = ranked.setProfiles!.find((profile) => profile.setNumber === 1)!
  const set2 = ranked.setProfiles!.find((profile) => profile.setNumber === 2)!

  // Q-001 appears independently in each Set, once.
  assert.equal(set1.profiles.filter((profile) => profile.questionCode === 'Q-001').length, 1)
  assert.equal(set2.profiles.filter((profile) => profile.questionCode === 'Q-001').length, 1)

  // Each Set's profile carries only its own Set's AxisProfile.
  const set1Axes = set1.profiles.find((profile) => profile.questionCode === 'Q-001')!.suitabilityProfiles
  const set2Axes = set2.profiles.find((profile) => profile.questionCode === 'Q-001')!.suitabilityProfiles
  assert.equal(set1Axes.length, 1)
  assert.equal(set2Axes.length, 1)
  assert.equal(set1Axes[0]!.slot.setNumber, 1)
  assert.equal(set2Axes[0]!.slot.setNumber, 2)
}

// ─── Test 6. No global score ────────────────────────────────────────────────

function verifies_no_global_score(): void {
  const ranked = emit([mkComposite('Q-001', 0.9), mkComposite('Q-002', 0.8)])

  // The CandidateProfile / AxisProfile / SetCandidateProfiles objects must not
  // carry any candidate-level aggregated numeric score field. Confirm at runtime
  // by inspecting the emitted own-keys against a forbidden field-name set.
  const forbiddenFields = new Set([
    'globalScore',
    'candidateScore',
    'aggregatedComposite',
    'globalRank',
    'globalComposite',
    'maxComposite',
    'meanComposite',
    'bestSlotScore',
    'aggregatedScore',
  ])

  for (const setProfile of ranked.setProfiles ?? []) {
    for (const key of Object.keys(setProfile)) {
      assert.ok(!forbiddenFields.has(key), `SetCandidateProfiles must not carry ${key}`)
    }
    for (const profile of setProfile.profiles) {
      for (const key of Object.keys(profile)) {
        assert.ok(!forbiddenFields.has(key), `CandidateProfile must not carry ${key}`)
      }
      for (const axis of profile.suitabilityProfiles) {
        for (const key of Object.keys(axis)) {
          assert.ok(!forbiddenFields.has(key), `AxisProfile must not carry ${key}`)
        }
        // The only numeric scores present are the ORIGINAL per-axis compositeScore values.
        assert.equal(typeof axis.compositeScore.value, 'number')
        assert.equal(typeof axis.rank, 'number')
      }
    }
  }

  // The setProfiles presentation order is lexical by questionCode, NOT a score
  // ranking: prove it by emitting two candidates where the higher-scored one
  // would NOT sort first under a score order.
  const rankedScored = emit([
    mkComposite('Q-AAA', 0.3), // low score, but sorts first lexically
    mkComposite('Q-ZZZ', 0.9), // high score, sorts last lexically
  ])
  const set1 = rankedScored.setProfiles!.find((profile) => profile.setNumber === 1)!
  assert.deepEqual(
    set1.profiles.map((profile) => profile.questionCode),
    ['Q-AAA', 'Q-ZZZ'],
    'profiles must be lexical, NOT score-ordered'
  )
}

// ─── Test 7. Legacy slots equivalence ───────────────────────────────────────

function verifies_legacy_slots_equivalence(): void {
  // The bridge must not change the legacy `slots` shape or ordering. Build the
  // legacy slots directly via the same path, and compare to a RankedCandidateSet
  // emission with setProfiles.
  const composites = [
    mkComposite('Q-002', 0.9),
    mkComposite('Q-001', 0.7),
  ]
  const candidateSet = mkCandidateSet(['Q-001', 'Q-002'])
  const ordering = prepareScoreOrdering({ composites })
  const tieResolution = resolveTies({ ordering, maxTieGroupSize: 10 })

  const ranked = emitRankedCandidateSet({ candidateSet, tieResolution, rankingVersion: '1.0.0' })

  // Structural and order equivalence: legacy slots are stable and present.
  assert.ok(ranked.slots.length >= 1)
  const slot = ranked.slots[0]!
  assert.deepEqual(
    slot.rankedCandidates.map((candidate) => [candidate.code, candidate.rank]),
    [
      ['Q-002', 1],
      ['Q-001', 2],
    ]
  )

  // The same setProfiles-derived information is consistent with slots: every
  // (slotId, code, rank) in setProfiles exists in legacy slots.
  for (const setProfile of ranked.setProfiles ?? []) {
    for (const profile of setProfile.profiles) {
      for (const axis of profile.suitabilityProfiles) {
        const legacySlot = ranked.slots.find((slotItem) => slotItem.slotId === axis.slotId)
        assert.ok(legacySlot, `legacy slot ${axis.slotId} must exist`)
        const legacyCandidate = legacySlot!.rankedCandidates.find((candidate) => candidate.code === profile.questionCode)
        assert.ok(legacyCandidate, `legacy candidate ${profile.questionCode} must exist in slot ${axis.slotId}`)
        assert.equal(legacyCandidate!.rank, axis.rank, 'rank must match legacy')
        assert.equal(legacyCandidate!.composite, axis.compositeScore, 'composite must be the same reference as legacy')
      }
    }
  }
}

// ─── Test 8. Immutability ───────────────────────────────────────────────────

function verifies_immutability(): void {
  const composites = [
    mkComposite('Q-001', 0.9, { slot: mkSlot({ difficulty: 'Easy' }) }),
    mkComposite('Q-001', 0.8, { slot: mkSlot({ difficulty: 'Hard' }) }),
    mkComposite('Q-002', 0.7, { slot: mkSlot({ difficulty: 'Easy' }) }),
  ]
  const candidateSet = mkCandidateSet(['Q-001', 'Q-002'])
  const ordering = prepareScoreOrdering({ composites })
  const tieResolution = resolveTies({ ordering, maxTieGroupSize: 10 })
  const beforeTieResolution = stableStringify(tieResolution)
  const beforeCandidateSet = stableStringify(candidateSet)

  const ranked = emitRankedCandidateSet({ candidateSet, tieResolution, rankingVersion: '1.0.0' })

  // Touch the projection to ensure building it has no side effects.
  const serializedProjection = stableStringify(ranked.setProfiles ?? [])

  assert.equal(stableStringify(tieResolution), beforeTieResolution, 'tie-resolution input must not mutate')
  assert.equal(stableStringify(candidateSet), beforeCandidateSet, 'CandidateSet must not mutate')

  // Re-running emission must produce a byte-identical projection (determinism).
  const ranked2 = emitRankedCandidateSet({ candidateSet, tieResolution, rankingVersion: '1.0.0' })
  assert.equal(stableStringify(ranked2.setProfiles ?? []), serializedProjection, 'projection must be deterministic')

  // setProfiles and its nested arrays are readonly at the type level.
  // Access before reassignment so no line depends on a prior mutation.
  // @ts-expect-error — suitabilityProfiles is readonly
  ranked.setProfiles![0].profiles[0].suitabilityProfiles = []
  // @ts-expect-error — profiles is readonly
  ranked.setProfiles![0].profiles = []
  // @ts-expect-error — setProfiles is readonly
  ranked.setProfiles = []
  assert.ok(true, 'readonly type errors confirmed by @ts-expect-error directives')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests = [
  { name: 'unique CandidateProfile per questionCode per Set', fn: verifies_unique_candidate_per_set },
  { name: 'multi-axis suitability preserved with original ranks', fn: verifies_multi_axis_preservation },
  { name: 'deterministic lexical candidate order', fn: verifies_deterministic_candidate_order },
  { name: 'deterministic suitability profile order by slotId', fn: verifies_deterministic_suitability_profile_order },
  { name: 'cross-Set reuse appears independently per Set', fn: verifies_cross_set_reuse },
  { name: 'no global/aggregated candidate score on new contract', fn: verifies_no_global_score },
  { name: 'legacy slots structurally and order-equivalent', fn: verifies_legacy_slots_equivalence },
  { name: 'building setProfiles does not mutate inputs', fn: verifies_immutability },
  { name: '1 / 3 / 5 SET REGRESSION', fn: verifies_target_sets_regression },
  { name: 'ZERO RankedSlot SET', fn: verifies_zero_rankedslot_set },
  { name: 'CROSS-SET ZERO-AXIS CANDIDATE', fn: verifies_cross_set_zero_axis_candidate },
]

// ─── Phase 2B-C regression tests ────────────────────────────────────────────

function verifies_target_sets_regression(): void {
  const composites = [mkComposite('Q-001', 0.9, { slot: mkSlot({ setNumber: 1 }) })]

  const ranked1 = emit(composites, undefined, 1)
  assert.deepEqual(ranked1.setProfiles!.map(x => x.setNumber), [1], 'target.sets = 1')

  const ranked3 = emit(composites, undefined, 3)
  assert.deepEqual(ranked3.setProfiles!.map(x => x.setNumber), [1, 2, 3], 'target.sets = 3')

  const ranked5 = emit(composites, undefined, 5)
  assert.deepEqual(ranked5.setProfiles!.map(x => x.setNumber), [1, 2, 3, 4, 5], 'target.sets = 5')
}

function verifies_zero_rankedslot_set(): void {
  const slotSet1 = mkSlot({ setNumber: 1 })
  const ranked = emit([
    mkComposite('Q-A', 0.9, { slot: slotSet1 }),
    mkComposite('Q-B', 0.8, { slot: slotSet1 }),
  ], undefined, 3)

  const set3 = ranked.setProfiles!.find(p => p.setNumber === 3)
  assert.ok(set3, 'Set 3 must exist')
  assert.equal(set3.profiles.length, 2, 'Set 3 must contain every CandidateSet candidate')

  for (const profile of set3.profiles) {
    assert.equal(profile.suitabilityProfiles.length, 0, `Candidate ${profile.questionCode} in Set 3 must have no suitability profiles`)
  }
}

function verifies_cross_set_zero_axis_candidate(): void {
  const slotSet1 = mkSlot({ setNumber: 1 })
  const ranked = emit([
    mkComposite('Q-X', 0.9, { slot: slotSet1 })
  ], undefined, 3)

  const set1 = ranked.setProfiles!.find(p => p.setNumber === 1)!
  const qx1 = set1.profiles.find(p => p.questionCode === 'Q-X')!
  assert.equal(qx1.suitabilityProfiles.length, 1, 'Set 1: Q-X exists with its AxisProfile(s)')

  const set2 = ranked.setProfiles!.find(p => p.setNumber === 2)!
  const qx2 = set2.profiles.find(p => p.questionCode === 'Q-X')!
  assert.equal(qx2.suitabilityProfiles.length, 0, 'Set 2: Q-X exists with suitabilityProfiles === []')

  const set3 = ranked.setProfiles!.find(p => p.setNumber === 3)!
  const qx3 = set3.profiles.find(p => p.questionCode === 'Q-X')!
  assert.equal(qx3.suitabilityProfiles.length, 0, 'Set 3: Q-X exists with suitabilityProfiles === []')
}

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
