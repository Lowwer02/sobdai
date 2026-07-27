/**
 * lib/engine/ranking/emission.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.3 — RankedCandidateSet Emission tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §7, §8, §9, §10.
 *
 * RUN: npx jiti lib/engine/ranking/emission.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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
import { resolveTies, type TieResolutionOutput } from './tie-resolution'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function mkPenalty(type: Penalty['type']): Penalty {
  return {
    type,
    trigger: `${type} fixture`,
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
  const slot = opts.slot ?? sharedSlot
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
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
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
      shortfallCount: 0,
    },
    exclusionsLog: [],
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
}

const sharedSlot = mkSlot()

function emit(
  composites: readonly CompositeScore[],
  candidateSet = mkCandidateSet(composites.map((composite) => composite.questionCode))
): RankedCandidateSet {
  const ordering = prepareScoreOrdering({ composites })
  const tieResolution = resolveTies({ ordering, maxTieGroupSize: 10 })
  return emitRankedCandidateSet({
    candidateSet,
    tieResolution,
    rankingVersion: '1.0.0',
  })
}

function assertThrowsFatal(fn: () => unknown, match: RegExp): void {
  assert.throws(fn, (error) => error instanceof Error && match.test(error.message))
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// RankedCandidateSet shape and propagation
// ═══════════════════════════════════════════════════════════════════════════

function verifies_emits_ranked_candidate_set_shape(): void {
  const candidateSet = mkCandidateSet(['Q-000001'])
  const ranked = emit([mkComposite('Q-000001', 0.9)], candidateSet)
  assert.equal(ranked.identity.candidateSetId, candidateSet.identity.assemblyRequestId)
  assert.equal(ranked.identity.scoringModelVersion, '1.0')
  assert.equal(ranked.identity.rankingVersion, '1.0.0')
  assert.equal(ranked.meta.specVersion, '1.0')
  assert.equal(ranked.meta.scoringModelVersion, '1.0')
  assert.equal(ranked.slots.length, 1)
}

function verifies_carries_forward_candidate_set_fields_by_reference(): void {
  const warning: GeneratorWarning = {
    severity: 'Warning',
    axis: 'difficulty',
    explanation: 'Thin headroom',
    recommendation: 'Add more Questions',
  }
  const candidateSet = mkCandidateSet(['Q-000001'], warning)
  const ranked = emit([mkComposite('Q-000001', 0.9)], candidateSet)
  assert.equal(ranked.candidateSet, candidateSet)
  assert.equal(ranked.shortfallReport, candidateSet.shortfallReport)
  assert.equal(ranked.coverageSatisfaction, candidateSet.coverageSatisfaction)
  assert.equal(ranked.warnings, candidateSet.warnings)
  assert.equal(ranked.warnings[0], warning)
}

function verifies_assigns_final_ranks_from_resolved_order(): void {
  const ranked = emit([
    mkComposite('Q-000003', 0.4),
    mkComposite('Q-000002', 0.9),
    mkComposite('Q-000001', 0.7),
  ])
  assert.deepEqual(
    ranked.slots[0]!.rankedCandidates.map((candidate) => [candidate.code, candidate.rank]),
    [
      ['Q-000002', 1],
      ['Q-000001', 2],
      ['Q-000003', 3],
    ]
  )
}

function verifies_assigns_ranks_after_tie_resolution(): void {
  const ranked = emit([
    mkComposite('Q-000003', 0.8),
    mkComposite('Q-000001', 0.8),
    mkComposite('Q-000002', 0.8),
  ])
  assert.deepEqual(
    ranked.slots[0]!.rankedCandidates.map((candidate) => [candidate.code, candidate.rank]),
    [
      ['Q-000001', 1],
      ['Q-000002', 2],
      ['Q-000003', 3],
    ]
  )
}

function verifies_preserves_tie_status_and_slot_summary_tie_groups(): void {
  const ranked = emit([mkComposite('Q-000002', 0.8), mkComposite('Q-000001', 0.8)])
  const slot = ranked.slots[0]!
  assert.equal(slot.slotSummary.tieGroups.length, 1)
  assert.equal(slot.rankedCandidates[0]!.tieGroupId, slot.slotSummary.tieGroups[0]!.tieGroupId)
  assert.equal(slot.rankedCandidates[0]!.orderingReason.tieStatus.tieBreaker!.key, 'questionCode')
}

function verifies_preserves_scores_confidence_penalties_and_signals(): void {
  const soft = mkPenalty('soft')
  const composite = mkComposite('Q-000001', 0.7, { penalties: [soft], confidence: 'low' })
  const ranked = emit([composite])
  const entry = ranked.slots[0]!.rankedCandidates[0]!
  assert.equal(entry.composite, composite)
  assert.equal(entry.confidence, composite.confidence)
  assert.equal(entry.penalties, composite.penalties)
  assert.equal(entry.penalties[0], soft)
  assert.equal(entry.signals[0]!.questionCode, 'Q-000001')
}

function verifies_audit_trail_links_final_rank_to_existing_artifacts(): void {
  const composite = mkComposite('Q-000001', 0.9, {
    componentIds: ['difficulty_fit', 'usage', 'freshness'],
  })
  const ranked = emit([composite])
  const entry = ranked.slots[0]!.rankedCandidates[0]!
  assert.equal(entry.auditTrail.candidateCode, entry.code)
  assert.equal(entry.auditTrail.rank, entry.rank)
  assert.equal(entry.auditTrail.composite, composite)
  assert.deepEqual(entry.auditTrail.componentIds, ['difficulty_fit', 'usage', 'freshness'])
}

function verifies_neighbor_comparison_is_emitted_for_multi_candidate_slot(): void {
  const ranked = emit([
    mkComposite('Q-000001', 0.9),
    mkComposite('Q-000002', 0.8),
    mkComposite('Q-000003', 0.7),
  ])
  const middle = ranked.slots[0]!.rankedCandidates[1]!
  assert.equal(middle.orderingReason.neighborComparison!.aboveCode, 'Q-000001')
  assert.equal(middle.orderingReason.neighborComparison!.belowCode, 'Q-000003')
}

function verifies_single_candidate_slot_has_no_neighbor_comparison(): void {
  const ranked = emit([mkComposite('Q-000001', 0.9)])
  assert.equal(ranked.slots[0]!.rankedCandidates[0]!.orderingReason.neighborComparison, null)
}

function verifies_slot_summary_carries_ordering_key(): void {
  const ranked = emit([mkComposite('Q-000001', 0.9)])
  assert.deepEqual(ranked.slots[0]!.slotSummary.orderingKey.facets, [
    'composite.value',
    'confidence.level',
    'penalties.status',
    'penalties.count',
  ])
  assert.match(ranked.slots[0]!.slotSummary.topOfSlotRationale, /Top Candidate/)
}

function verifies_maximum_recall_preserves_every_resolved_candidate(): void {
  const ranked = emit([
    mkComposite('Q-000001', 0.9),
    mkComposite('Q-000002', 0.2, { penalties: [mkPenalty('disqualification')] }),
  ])
  assert.deepEqual(
    ranked.slots[0]!.rankedCandidates.map((candidate) => candidate.code),
    ['Q-000001', 'Q-000002']
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism and immutability
// ═══════════════════════════════════════════════════════════════════════════

function verifies_deterministic_and_stable_serializable(): void {
  const composites = [
    mkComposite('Q-000002', 0.8),
    mkComposite('Q-000001', 0.8),
  ]
  const candidateSet = mkCandidateSet(['Q-000001', 'Q-000002'])
  const a = emit(composites, candidateSet)
  const b = emit(composites, candidateSet)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_does_not_mutate_inputs(): void {
  const composites = [mkComposite('Q-000001', 0.9)]
  const candidateSet = mkCandidateSet(['Q-000001'])
  const ordering = prepareScoreOrdering({ composites })
  const tieResolution = resolveTies({ ordering, maxTieGroupSize: 10 })
  const beforeCandidateSet = stableStringify(candidateSet)
  const beforeTieResolution = stableStringify(tieResolution)
  emitRankedCandidateSet({ candidateSet, tieResolution, rankingVersion: '1.0.0' })
  assert.equal(stableStringify(candidateSet), beforeCandidateSet)
  assert.equal(stableStringify(tieResolution), beforeTieResolution)
}

function verifies_ranked_candidate_set_fields_are_readonly(): void {
  const ranked: RankedCandidateSet = emit([mkComposite('Q-000001', 0.9)])
  // @ts-expect-error — rankedCandidates is readonly
  ranked.slots[0].rankedCandidates = []
  // @ts-expect-error — slots is readonly
  ranked.slots = []
  assert.ok(true, 'readonly type errors confirmed by @ts-expect-error directives')
}

// ═══════════════════════════════════════════════════════════════════════════
// Fail loud
// ═══════════════════════════════════════════════════════════════════════════

function verifies_missing_ranking_version_is_fatal(): void {
  const candidateSet = mkCandidateSet(['Q-000001'])
  const tieResolution = resolveTies({
    ordering: prepareScoreOrdering({ composites: [mkComposite('Q-000001', 0.9)] }),
    maxTieGroupSize: 10,
  })
  assertThrowsFatal(
    () => emitRankedCandidateSet({ candidateSet, tieResolution, rankingVersion: ' ' }),
    /rankingVersion/
  )
}

function verifies_unknown_candidate_is_fatal(): void {
  const candidateSet = mkCandidateSet(['Q-000001'])
  const tieResolution = resolveTies({
    ordering: prepareScoreOrdering({ composites: [mkComposite('Q-UNKNOWN', 0.9)] }),
    maxTieGroupSize: 10,
  })
  assertThrowsFatal(
    () => emitRankedCandidateSet({ candidateSet, tieResolution, rankingVersion: '1.0.0' }),
    /not present in CandidateSet/
  )
}

function verifies_duplicate_candidate_in_slot_is_fatal(): void {
  const candidateSet = mkCandidateSet(['Q-000001'])
  const tieResolution = resolveTies({
    ordering: prepareScoreOrdering({ composites: [mkComposite('Q-000001', 0.9)] }),
    maxTieGroupSize: 10,
  })
  const group = tieResolution.slots[0]!.groups[0]!
  const bad: TieResolutionOutput = {
    ...tieResolution,
    slots: [
      {
        ...tieResolution.slots[0]!,
        groups: [
          {
            ...group,
            candidates: [group.candidates[0]!, group.candidates[0]!],
          },
        ],
      },
    ],
  }
  assertThrowsFatal(
    () => emitRankedCandidateSet({ candidateSet, tieResolution: bad, rankingVersion: '1.0.0' }),
    /duplicate Candidate/
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundaries
// ═══════════════════════════════════════════════════════════════════════════

function verifies_source_has_no_hidden_state_or_forbidden_dependencies(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'emission.ts'), 'utf8'))
  const forbidden = [
    'Math.random',
    'Date.now',
    'new Date',
    '@supabase',
    'react',
    'next/',
    'fetch(',
    'let ',
    'var ',
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `emission.ts must not contain ${token}`)
  }
}

function verifies_source_does_not_recompute_scores_or_invoke_solver(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'emission.ts'), 'utf8'))
  const forbidden = [
    'computeComposite',
    'prepareScoreOrdering',
    'resolveTies',
    'solver',
    'select',
    'penaltyStatus',
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `emission.ts must not contain ${token}`)
  }
}

function verifies_source_does_not_invent_warnings_or_diagnostics(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'emission.ts'), 'utf8'))
  assert.ok(!source.includes('RankingWarning'))
  assert.ok(!source.includes('RankingDiagnostic'))
  assert.ok(!source.includes('severity:'))
}

// ═══════════════════════════════════════════════════════════════════════════
// runner
// ═══════════════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'emits RankedCandidateSet shape', fn: verifies_emits_ranked_candidate_set_shape },
  { name: 'carries forward CandidateSet fields by reference', fn: verifies_carries_forward_candidate_set_fields_by_reference },
  { name: 'assigns final ranks from resolved order', fn: verifies_assigns_final_ranks_from_resolved_order },
  { name: 'assigns ranks after Tie Resolution', fn: verifies_assigns_ranks_after_tie_resolution },
  { name: 'preserves tie status and slot summary tie groups', fn: verifies_preserves_tie_status_and_slot_summary_tie_groups },
  { name: 'preserves scores, confidence, penalties, and signals', fn: verifies_preserves_scores_confidence_penalties_and_signals },
  { name: 'audit trail links final rank to existing artifacts', fn: verifies_audit_trail_links_final_rank_to_existing_artifacts },
  { name: 'neighbor comparison emitted for multi-Candidate slot', fn: verifies_neighbor_comparison_is_emitted_for_multi_candidate_slot },
  { name: 'single-Candidate slot has no neighbor comparison', fn: verifies_single_candidate_slot_has_no_neighbor_comparison },
  { name: 'slot summary carries ordering key', fn: verifies_slot_summary_carries_ordering_key },
  { name: 'Maximum Recall preserves every resolved Candidate', fn: verifies_maximum_recall_preserves_every_resolved_candidate },
  { name: 'deterministic and stable serializable', fn: verifies_deterministic_and_stable_serializable },
  { name: 'does not mutate inputs', fn: verifies_does_not_mutate_inputs },
  { name: 'RankedCandidateSet fields are readonly', fn: verifies_ranked_candidate_set_fields_are_readonly },
  { name: 'missing rankingVersion is Fatal', fn: verifies_missing_ranking_version_is_fatal },
  { name: 'unknown Candidate is Fatal', fn: verifies_unknown_candidate_is_fatal },
  { name: 'duplicate Candidate in slot is Fatal', fn: verifies_duplicate_candidate_in_slot_is_fatal },
  { name: 'source has no hidden state or forbidden dependencies', fn: verifies_source_has_no_hidden_state_or_forbidden_dependencies },
  { name: 'source does not recompute scores or invoke Solver', fn: verifies_source_does_not_recompute_scores_or_invoke_solver },
  { name: 'source does not invent warnings or diagnostics', fn: verifies_source_does_not_invent_warnings_or_diagnostics },
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
