/**
 * lib/engine/ranking/ranking.property.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.4 — Complete Ranking Runtime property tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §5 (Ordering), §6 (Tie Resolution),
 *     §7 (RankedCandidateSet), §9 (Transparency), §10 (Failure Handling).
 *
 * RUN: npx jiti lib/engine/ranking/ranking.property.test.ts
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
import type { RankedCandidateSet } from './contracts'
import { emitRankedCandidateSet } from './emission'
import { prepareScoreOrdering } from './runtime'
import { resolveTies } from './tie-resolution'

// ─── helpers ────────────────────────────────────────────────────────────────

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

function mkSignal(questionCode: string, source: RawSignal['source'] = 'difficulty'): RawSignal {
  return {
    questionCode,
    source,
    value: source === 'difficulty' ? 'Easy' : `${source}-value`,
    integrity: 'known',
    extractionNote: null,
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

function mkPenalty(type: Penalty['type'], trigger = `${type} fixture`): Penalty {
  return {
    type,
    trigger,
    evidence: `${type} evidence`,
    effect: `${type} effect`,
    appliedBy: 'ranking',
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
    inputs: [mkSignal(questionCode), mkSignal(questionCode, 'usage_count')],
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
  const slot = opts.slot ?? sharedSlot
  const componentIds = opts.componentIds ?? ['difficulty_fit', 'usage', 'freshness']
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

function mkCandidate(questionCode: string, slot = sharedSlot): Candidate {
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

function mkCandidateSet(codes: readonly string[], warning?: GeneratorWarning): CandidateSet {
  return {
    identity: { assemblyRequestId: 'req-test-001', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: codes.map((code) => mkCandidate(code)),
    slotIndex: { slots: new Map() },
    shortfallReport: {
      entries: [
        {
          axis: 'difficulty',
          severity: 'Warning',
          explanation: 'Fixture shortfall warning.',
          recommendation: 'Add more fixture Candidates.',
          setNumber: 1,
        },
      ],
    },
    coverageSatisfaction: {
      bindings: [
        {
          document: 'LAW-ACT-HED-2562',
          topic: 'มาตรา 6',
          satisfyingCodes: codes,
        },
      ],
    },
    warnings: warning === undefined ? [] : [warning],
    statistics: {
      totalCandidates: codes.length,
      fullConfidenceCount: codes.length,
      reducedConfidenceCount: 0,
      incompleteAxesCount: 0,
      distinctDocuments: 1,
      distinctDifficulties: 1,
      distinctPatterns: 1,
      distinctLearningObjectives: 1,
      shortfallCount: 1,
    },
    exclusionsLog: [],
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
}

function runRanking(
  composites: readonly CompositeScore[],
  candidateSet = mkCandidateSet(composites.map((composite) => composite.questionCode))
): RankedCandidateSet {
  const ordering = prepareScoreOrdering({ composites })
  const tieResolution = resolveTies({ ordering, maxTieGroupSize: 100 })
  return emitRankedCandidateSet({
    candidateSet,
    tieResolution,
    rankingVersion: '1.0.0',
  })
}

function fatalMessage(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('Expected function to throw')
}

const sharedSlot = mkSlot()
const alternateSlot = mkSlot({ setNumber: 2, difficulty: 'Hard', pattern: 'Scenario' })

// ═══════════════════════════════════════════════════════════════════════════
// Complete runtime properties
// ═══════════════════════════════════════════════════════════════════════════

function verifies_determinism_same_input_same_output(): void {
  const composites = scenarioComposites()
  const candidateSet = mkCandidateSet(composites.map((composite) => composite.questionCode))
  assert.equal(
    stableStringify(runRanking(composites, candidateSet)),
    stableStringify(runRanking(composites, candidateSet))
  )
}

function verifies_immutability_inputs_not_mutated(): void {
  const composites = scenarioComposites()
  const candidateSet = mkCandidateSet(composites.map((composite) => composite.questionCode))
  const beforeComposites = stableStringify(composites)
  const beforeCandidateSet = stableStringify(candidateSet)
  runRanking(composites, candidateSet)
  assert.equal(stableStringify(composites), beforeComposites)
  assert.equal(stableStringify(candidateSet), beforeCandidateSet)
}

function verifies_stable_ordering_independent_of_input_order(): void {
  const composites = scenarioComposites()
  const shuffled = [
    composites[3]!,
    composites[1]!,
    composites[4]!,
    composites[0]!,
    composites[2]!,
  ]
  const candidateSet = mkCandidateSet(
    composites.map((composite) => composite.questionCode).sort()
  )
  assert.equal(
    stableStringify(runRanking(composites, candidateSet)),
    stableStringify(runRanking(shuffled, candidateSet))
  )
}

function verifies_stable_rank_assignment(): void {
  const ranked = runRanking(scenarioComposites())
  assert.deepEqual(
    ranked.slots[0]!.rankedCandidates.map((candidate) => [candidate.code, candidate.rank]),
    [
      ['Q-000004', 1],
      ['Q-000003', 2],
      ['Q-000001', 3],
      ['Q-000002', 4],
      ['Q-000005', 5],
    ]
  )
}

function verifies_tie_visibility_and_no_hidden_tie_breakers(): void {
  const ranked = runRanking([
    mkComposite('Q-000003', 0.8),
    mkComposite('Q-000001', 0.8),
    mkComposite('Q-000002', 0.8),
  ])
  const slot = ranked.slots[0]!
  assert.equal(slot.slotSummary.tieGroups.length, 1)
  assert.deepEqual(slot.slotSummary.tieGroups[0]!.memberCodes, ['Q-000001', 'Q-000002', 'Q-000003'])
  assert.deepEqual(slot.slotSummary.tieGroups[0]!.resolvedOrder, ['Q-000001', 'Q-000002', 'Q-000003'])
  for (const candidate of slot.rankedCandidates) {
    assert.equal(candidate.tieGroupId, slot.slotSummary.tieGroups[0]!.tieGroupId)
    assert.equal(candidate.orderingReason.tieStatus.tieBreaker!.source, 'stable_identity')
    assert.equal(candidate.orderingReason.tieStatus.tieBreaker!.key, 'questionCode')
  }
}

function verifies_maximum_recall(): void {
  const composites = scenarioComposites()
  const ranked = runRanking(composites)
  assert.deepEqual(
    ranked.slots[0]!.rankedCandidates.map((candidate) => candidate.code).sort(),
    composites.map((composite) => composite.questionCode).sort()
  )
}

function verifies_stable_serialization(): void {
  const ranked = runRanking(scenarioComposites())
  assert.equal(stableStringify(ranked), stableStringify(ranked))
}

function verifies_identity_metadata_and_warning_propagation(): void {
  const warning: GeneratorWarning = {
    severity: 'Warning',
    axis: 'pattern',
    explanation: 'Pattern headroom warning.',
    recommendation: 'Add Pattern-tagged Candidates.',
  }
  const composites = scenarioComposites()
  const candidateSet = mkCandidateSet(composites.map((composite) => composite.questionCode), warning)
  const ranked = runRanking(composites, candidateSet)
  assert.equal(ranked.identity.candidateSetId, candidateSet.identity.assemblyRequestId)
  assert.equal(ranked.identity.rankingVersion, '1.0.0')
  assert.equal(ranked.meta.rankingVersion, '1.0.0')
  assert.equal(ranked.candidateSet, candidateSet)
  assert.equal(ranked.shortfallReport, candidateSet.shortfallReport)
  assert.equal(ranked.coverageSatisfaction, candidateSet.coverageSatisfaction)
  assert.equal(ranked.warnings, candidateSet.warnings)
  assert.equal(ranked.warnings[0], warning)
}

function verifies_diagnostic_failure_is_stable_and_not_invented_success(): void {
  const candidateSet = mkCandidateSet(['Q-000001'])
  const badComposite = mkComposite('Q-UNKNOWN', 0.9)
  const first = fatalMessage(() => runRanking([badComposite], candidateSet))
  const second = fatalMessage(() => runRanking([badComposite], candidateSet))
  assert.equal(first, second)

  const ranked = runRanking([mkComposite('Q-000001', 0.9)], candidateSet)
  const text = stableStringify(ranked)
  assert.ok(!text.includes('fatalDiagnostics'))
  assert.ok(!text.includes('RankingDiagnostic'))
}

function verifies_rank_monotonicity(): void {
  const ranked = runRanking(scenarioComposites())
  const ranks = ranked.slots[0]!.rankedCandidates.map((candidate) => candidate.rank)
  assert.deepEqual(ranks, [1, 2, 3, 4, 5])
}

function verifies_no_duplicate_rank_assignment(): void {
  const ranked = runRanking(scenarioComposites())
  for (const slot of ranked.slots) {
    const ranks = slot.rankedCandidates.map((candidate) => candidate.rank)
    assert.equal(new Set(ranks).size, ranks.length)
  }
}

function verifies_multiple_slots_are_independent_and_stable(): void {
  const composites = [
    mkComposite('Q-000001', 0.8, { slot: sharedSlot }),
    mkComposite('Q-000002', 0.9, { slot: sharedSlot }),
    mkComposite('Q-000003', 0.7, { slot: alternateSlot }),
    mkComposite('Q-000004', 0.7, { slot: alternateSlot }),
  ]
  const ranked = runRanking(composites)
  assert.equal(ranked.slots.length, 2)
  assert.deepEqual(
    ranked.slots[0]!.rankedCandidates.map((candidate) => [candidate.code, candidate.rank]),
    [['Q-000002', 1], ['Q-000001', 2]]
  )
  assert.deepEqual(
    ranked.slots[1]!.rankedCandidates.map((candidate) => [candidate.code, candidate.rank]),
    [['Q-000003', 1], ['Q-000004', 2]]
  )
}

function scenarioComposites(): readonly CompositeScore[] {
  return [
    mkComposite('Q-000001', 0.8),
    mkComposite('Q-000002', 0.8),
    mkComposite('Q-000003', 0.9, { penalties: [mkPenalty('hard')] }),
    mkComposite('Q-000004', 0.95),
    mkComposite('Q-000005', 0.8, { confidence: 'low' }),
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// runner
// ═══════════════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'Determinism: same input → same RankedCandidateSet', fn: verifies_determinism_same_input_same_output },
  { name: 'Immutability: inputs are not mutated', fn: verifies_immutability_inputs_not_mutated },
  { name: 'Stable ordering: input order invariant', fn: verifies_stable_ordering_independent_of_input_order },
  { name: 'Stable rank assignment', fn: verifies_stable_rank_assignment },
  { name: 'Tie visibility and no hidden tie-breakers', fn: verifies_tie_visibility_and_no_hidden_tie_breakers },
  { name: 'Maximum Recall: every Candidate remains ranked', fn: verifies_maximum_recall },
  { name: 'Stable serialization', fn: verifies_stable_serialization },
  { name: 'Identity, metadata, and warning propagation', fn: verifies_identity_metadata_and_warning_propagation },
  { name: 'Diagnostic failure stability and no invented success diagnostics', fn: verifies_diagnostic_failure_is_stable_and_not_invented_success },
  { name: 'Rank monotonicity', fn: verifies_rank_monotonicity },
  { name: 'No duplicate rank assignment', fn: verifies_no_duplicate_rank_assignment },
  { name: 'Multiple slots are independent and stable', fn: verifies_multiple_slots_are_independent_and_stable },
]

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
