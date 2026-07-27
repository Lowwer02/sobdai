/**
 * lib/engine/scoring/penalties.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.5 — Penalty Aggregation tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.3.
 *   - Scoring Model Specification v1.0 §7, §10.6.
 *
 * RUN: npx jiti lib/engine/scoring/penalties.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import {
  COMPONENT_VOCABULARY,
  type ComponentContribution,
  type CompositeScore,
  type Penalty,
  type PenaltyType,
  type RawSignal,
  type ScoreComponent,
} from './contracts'
import { evaluateComponents } from './components'
import { computeCompositeScores } from './composite'
import type {
  ConfidencePropagationOutput,
  PropagatedCompositeConfidence,
} from './confidence'
import { propagateConfidence } from './confidence'
import { aggregatePenalties } from './penalties'
import { extractSignals } from './signals'
import { stableStringify } from '../shared/testing/determinism'

// ─── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sharedSlot: BlueprintSlot = {
  setNumber: 1,
  document: 'LAW-ACT-HED-2562',
  difficulty: 'Easy',
  blueprintType: 'Memory',
  pattern: 'Positive',
  learningObjective: 'LO1',
}

function mkPenalty(type: PenaltyType, overrides: Partial<Penalty> = {}): Penalty {
  return {
    type,
    trigger: `${type} trigger`,
    evidence: `${type} evidence`,
    effect: `${type} effect`,
    appliedBy: 'ranking',
    ...overrides,
  }
}

function mkSignal(questionCode = 'Q-000001'): RawSignal {
  return {
    questionCode,
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
  }
}

function mkComponent(id: string, penalties: readonly Penalty[] = []): ScoreComponent {
  return {
    componentId: id as ScoreComponent['componentId'],
    questionCode: 'Q-000001',
    slot: sharedSlot,
    normalized: { value: 0.5, scale: `${id}-fixture` },
    inputs: [mkSignal()],
    reasoning: `${id} fixture reasoning`,
    confidence: { level: 'high', reducingSignals: [], propagationNote: null },
    penalties,
  }
}

function mkComposite(opts: {
  readonly componentPenalties?: readonly Penalty[]
  readonly compositePenalties?: readonly Penalty[]
} = {}): CompositeScore {
  const components = COMPONENT_VOCABULARY.map((id, index) =>
    mkComponent(id, index === 0 ? opts.componentPenalties ?? [] : [])
  )
  const contributions: readonly ComponentContribution[] = components.map((component) => ({
    component,
    contribution: 0.05,
    reason: 'fixture contribution',
  }))
  return {
    questionCode: 'Q-000001',
    slot: sharedSlot,
    value: 0.5,
    breakdown: {
      contributions,
      aggregationNote: 'fixture aggregation',
    },
    confidence: { level: 'high', reducingSignals: [], propagationNote: null },
    penalties: opts.compositePenalties ?? [],
  }
}

function confidenceOutput(composite: CompositeScore): ConfidencePropagationOutput {
  const entry: PropagatedCompositeConfidence = {
    questionCode: composite.questionCode,
    composite,
    confidence: composite.confidence,
    reducingComponents: [],
    reducingSignals: [],
  }
  return {
    entries: [entry],
    summary: {
      totalComposites: 1,
      highConfidenceCount: 1,
      lowConfidenceCount: 0,
    },
  }
}

function fullCandidate(): Candidate {
  return {
    identity: { questionCode: 'Q-000001', questionId: 'Q-000001' },
    metadata: {
      document: 'LAW-ACT-HED-2562',
      difficulty: 'Easy',
      topic: 'มาตรา 6',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
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
      eligibleSlots: [sharedSlot],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function candidateSet(): CandidateSet {
  return {
    identity: { assemblyRequestId: 'req-test-001', generatedAt: null, bankStateHash: null },
    candidates: [fullCandidate()],
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    warnings: [],
    statistics: {
      totalCandidates: 1,
      fullConfidenceCount: 1,
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

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// Penalty aggregation
// ═══════════════════════════════════════════════════════════════════════════

function verifies_empty_pipeline_penalties_aggregate_honestly(): void {
  const cs = candidateSet()
  const signals = extractSignals(cs)
  const components = evaluateComponents({ candidateSet: cs, signals })
  const composites = computeCompositeScores({ components })
  const confidence = propagateConfidence({ composites })
  const penalties = aggregatePenalties({ confidence })
  assert.equal(penalties.entries.length, 1)
  assert.equal(penalties.entries[0]!.penalties.length, 0)
  assert.equal(penalties.entries[0]!.dominantPenaltyType, null)
  assert.equal(penalties.entries[0]!.terminal, false)
  assert.equal(penalties.summary.totalPenalties, 0)
}

function verifies_aggregates_existing_component_and_composite_penalties(): void {
  const soft = mkPenalty('soft')
  const hard = mkPenalty('hard')
  const composite = mkComposite({
    componentPenalties: [soft],
    compositePenalties: [hard],
  })
  const result = aggregatePenalties({ confidence: confidenceOutput(composite) })
  const entry = result.entries[0]!
  assert.deepEqual(entry.penalties, [soft, hard])
  assert.deepEqual(entry.byType.soft, [soft])
  assert.deepEqual(entry.byType.hard, [hard])
  assert.deepEqual(entry.byType.disqualification, [])
  assert.equal(entry.dominantPenaltyType, 'hard')
  assert.equal(result.summary.softCount, 1)
  assert.equal(result.summary.hardCount, 1)
}

function verifies_disqualification_is_terminal_and_dominates(): void {
  const soft = mkPenalty('soft')
  const hard = mkPenalty('hard')
  const disqualification = mkPenalty('disqualification')
  const composite = mkComposite({
    componentPenalties: [soft, hard],
    compositePenalties: [disqualification],
  })
  const entry = aggregatePenalties({ confidence: confidenceOutput(composite) }).entries[0]!
  assert.equal(entry.dominantPenaltyType, 'disqualification')
  assert.equal(entry.terminal, true)
  assert.equal(entry.byType.soft.length, 1)
  assert.equal(entry.byType.hard.length, 1)
  assert.equal(entry.byType.disqualification.length, 1)
}

function verifies_soft_penalties_accumulate_without_becoming_hard(): void {
  const composite = mkComposite({
    componentPenalties: [mkPenalty('soft'), mkPenalty('soft')],
  })
  const entry = aggregatePenalties({ confidence: confidenceOutput(composite) }).entries[0]!
  assert.equal(entry.byType.soft.length, 2)
  assert.equal(entry.byType.hard.length, 0)
  assert.equal(entry.dominantPenaltyType, 'soft')
  assert.equal(entry.terminal, false)
}

function verifies_preserves_composite_and_confidence_references(): void {
  const composite = mkComposite({
    componentPenalties: [mkPenalty('soft')],
  })
  const confidence = confidenceOutput(composite)
  const entry = aggregatePenalties({ confidence }).entries[0]!
  assert.equal(entry.composite, composite)
  assert.equal(entry.confidence, confidence.entries[0])
}

function verifies_does_not_mutate_inputs_or_penalties(): void {
  const composite = mkComposite({
    componentPenalties: [mkPenalty('soft')],
  })
  const confidence = confidenceOutput(composite)
  const before = stableStringify(confidence)
  const first = aggregatePenalties({ confidence })
  const second = aggregatePenalties({ confidence })
  assert.equal(stableStringify(first), stableStringify(second))
  assert.equal(stableStringify(confidence), before)
}

function verifies_non_transparent_penalty_is_fatal(): void {
  const composite = mkComposite({
    componentPenalties: [mkPenalty('soft', { trigger: '' })],
  })
  assert.throws(
    () => aggregatePenalties({ confidence: confidenceOutput(composite) }),
    /non-transparent soft penalty/
  )
}

function verifies_solver_owned_existing_penalty_is_accepted_but_not_created(): void {
  const solverPenalty = mkPenalty('hard', { appliedBy: 'solver' })
  const composite = mkComposite({
    compositePenalties: [solverPenalty],
  })
  const entry = aggregatePenalties({ confidence: confidenceOutput(composite) }).entries[0]!
  assert.deepEqual(entry.penalties, [solverPenalty])
  assert.equal(entry.penalties[0], solverPenalty)
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundary checks
// ═══════════════════════════════════════════════════════════════════════════

function verifies_no_hidden_runtime_dependency(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'penalties/index.ts'), 'utf8'))
  const forbidden = [
    /\bfrom\s+['"]@supabase/,
    /\bfrom\s+['"].*supabase/,
    /\bfrom\s+['"]react['"]/,
    /\bfrom\s+['"]next\//,
    /\bDate\.now\s*\(/,
    /\bprocess\.hrtime\s*\(/,
    /\bperformance\.now\s*\(/,
    /\bMath\.random\s*\(/,
    /\bcreateClient\s*\(/,
    /\.rpc\s*\(/,
  ]
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(src), `penalties/index.ts must not contain forbidden pattern ${pattern}`)
  }
}

function verifies_no_ranking_solver_or_new_scoring_stage_behavior(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'penalties/index.ts'), 'utf8'))
  const forbidden = [
    /\bRankedCandidateSet\b/,
    /\bRanking\b/,
    /\bSolver\b/,
    /\ballocation\b/i,
    /\bselect\b/i,
    /\bextractSignals\b/,
    /\bevaluateComponents\b/,
    /\bcomputeCompositeScores\b/,
    /\bpropagateConfidence\b/,
  ]
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(src), `Penalty stage must not use forbidden behavior ${pattern}`)
  }
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  { name: 'empty pipeline penalties aggregate honestly', fn: verifies_empty_pipeline_penalties_aggregate_honestly },
  { name: 'aggregates existing Component and Composite penalties', fn: verifies_aggregates_existing_component_and_composite_penalties },
  { name: 'Disqualification is terminal and dominates', fn: verifies_disqualification_is_terminal_and_dominates },
  { name: 'Soft penalties accumulate without becoming Hard', fn: verifies_soft_penalties_accumulate_without_becoming_hard },
  { name: 'preserves Composite and Confidence references', fn: verifies_preserves_composite_and_confidence_references },
  { name: 'does not mutate inputs or penalties', fn: verifies_does_not_mutate_inputs_or_penalties },
  { name: 'non-transparent penalty is Fatal', fn: verifies_non_transparent_penalty_is_fatal },
  { name: 'existing solver-owned penalty accepted but not created', fn: verifies_solver_owned_existing_penalty_is_accepted_but_not_created },
  { name: 'no hidden runtime dependency', fn: verifies_no_hidden_runtime_dependency },
  { name: 'no Ranking/Solver/new scoring stage behavior', fn: verifies_no_ranking_solver_or_new_scoring_stage_behavior },
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
