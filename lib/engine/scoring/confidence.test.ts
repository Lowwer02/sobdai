/**
 * lib/engine/scoring/confidence.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.4 — Confidence Propagation tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.2, §2.3.
 *   - Scoring Model Specification v1.0 §6, §10.5.
 *
 * RUN: npx jiti lib/engine/scoring/confidence.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import {
  COMPONENT_VOCABULARY,
  type ComponentId,
  type RawSignal,
  type ScoreComponent,
} from './contracts'
import type { ComponentEvaluationOutput, EvaluatedSlotComponents } from './components'
import { evaluateComponents } from './components'
import type { CompositeScoreOutput } from './composite'
import { computeCompositeScores } from './composite'
import { propagateConfidence } from './confidence'
import { extractSignals } from './signals'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'

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

function mkSignal(questionCode = 'Q-000001'): RawSignal {
  return {
    questionCode,
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
  }
}

function mkComponent(
  componentId: ComponentId,
  opts: {
    readonly questionCode?: string
    readonly lowSignal?: 'pattern' | 'usage_count' | 'last_used_at'
  } = {}
): ScoreComponent {
  const questionCode = opts.questionCode ?? 'Q-000001'
  return {
    componentId,
    questionCode,
    slot: sharedSlot,
    normalized: { value: 0.5, scale: `${componentId}-fixture` },
    inputs: [mkSignal(questionCode)],
    reasoning: `${componentId} fixture reasoning`,
    confidence:
      opts.lowSignal === undefined
        ? { level: 'high', reducingSignals: [], propagationNote: null }
        : {
            level: 'low',
            reducingSignals: [opts.lowSignal],
            propagationNote: `${componentId} reduced by ${opts.lowSignal}`,
          },
    penalties: [],
  }
}

function mkComponents(
  lowByComponent: Partial<Record<ComponentId, 'pattern' | 'usage_count' | 'last_used_at'>> = {}
): ComponentEvaluationOutput {
  const entry: EvaluatedSlotComponents = {
    questionCode: 'Q-000001',
    slot: sharedSlot,
    components: COMPONENT_VOCABULARY.map((id) =>
      mkComponent(id, { lowSignal: lowByComponent[id] })
    ),
  }
  return {
    entries: [entry],
    summary: {
      totalCandidateSlots: 1,
      totalComponents: COMPONENT_VOCABULARY.length,
      componentIds: COMPONENT_VOCABULARY,
    },
  }
}

function mkCompositeOutput(
  lowByComponent: Partial<Record<ComponentId, 'pattern' | 'usage_count' | 'last_used_at'>> = {}
): CompositeScoreOutput {
  return computeCompositeScores({ components: mkComponents(lowByComponent) })
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
    constraintSnapshot: buildConstraintSnapshot(),
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
// Confidence propagation
// ═══════════════════════════════════════════════════════════════════════════

function verifies_high_confidence_when_all_components_high(): void {
  const composites = mkCompositeOutput()
  const result = propagateConfidence({ composites })
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0]!.confidence.level, 'high')
  assert.deepEqual(result.entries[0]!.confidence.reducingSignals, [])
  assert.deepEqual(result.entries[0]!.reducingComponents, [])
  assert.equal(result.summary.highConfidenceCount, 1)
  assert.equal(result.summary.lowConfidenceCount, 0)
}

function verifies_low_confidence_when_any_component_low(): void {
  const composites = mkCompositeOutput({
    pattern_fit: 'pattern',
    usage: 'usage_count',
  })
  const result = propagateConfidence({ composites })
  const entry = result.entries[0]!
  assert.equal(entry.confidence.level, 'low')
  assert.deepEqual(entry.reducingComponents, ['pattern_fit', 'usage'])
  assert.deepEqual(entry.reducingSignals, ['pattern', 'usage_count'])
  assert.deepEqual(entry.confidence.reducingSignals, ['pattern', 'usage_count'])
  assert.equal(result.summary.highConfidenceCount, 0)
  assert.equal(result.summary.lowConfidenceCount, 1)
}

function verifies_confidence_is_parallel_to_value(): void {
  const composites = mkCompositeOutput({
    freshness: 'last_used_at',
  })
  const highValueLowConfidence = {
    ...composites.composites[0]!,
    value: 1,
  }
  const result = propagateConfidence({
    composites: {
      ...composites,
      composites: [highValueLowConfidence],
    },
  })
  assert.equal(result.entries[0]!.composite.value, 1)
  assert.equal(result.entries[0]!.confidence.level, 'low')
}

function verifies_rejects_composite_confidence_that_does_not_match_components(): void {
  const composites = mkCompositeOutput({
    pattern_fit: 'pattern',
  })
  const inconsistent = {
    ...composites.composites[0]!,
    confidence: {
      level: 'high' as const,
      reducingSignals: [],
      propagationNote: null,
    },
  }
  assert.throws(
    () =>
      propagateConfidence({
        composites: {
          ...composites,
          composites: [inconsistent],
        },
      }),
    /confidence does not match propagated Component confidence/
  )
}

function verifies_empty_breakdown_is_fatal(): void {
  const composites = mkCompositeOutput()
  const emptyBreakdown = {
    ...composites.composites[0]!,
    breakdown: {
      contributions: [],
      aggregationNote: 'empty fixture',
    },
  }
  assert.throws(
    () =>
      propagateConfidence({
        composites: {
          ...composites,
          composites: [emptyBreakdown],
        },
      }),
    /empty breakdown/
  )
}

function verifies_component_question_code_mismatch_is_fatal(): void {
  const composites = mkCompositeOutput()
  const composite = composites.composites[0]!
  const mismatch = {
    ...composite,
    breakdown: {
      ...composite.breakdown,
      contributions: [
        {
          ...composite.breakdown.contributions[0]!,
          component: mkComponent('coverage_fit', { questionCode: 'Q-OTHER' }),
        },
        ...composite.breakdown.contributions.slice(1),
      ],
    },
  }
  assert.throws(
    () =>
      propagateConfidence({
        composites: {
          ...composites,
          composites: [mismatch],
        },
      }),
    /questionCode does not match/
  )
}

function verifies_input_composite_is_preserved_and_immutable(): void {
  const composites = mkCompositeOutput({
    pattern_fit: 'pattern',
  })
  const before = stableStringify(composites)
  const result = propagateConfidence({ composites })
  assert.equal(result.entries[0]!.composite, composites.composites[0])
  assert.equal(stableStringify(composites), before)
}

function verifies_pipeline_smoke_signal_component_composite_confidence(): void {
  const cs = candidateSet()
  const signals = extractSignals(cs)
  const components = evaluateComponents({ candidateSet: cs, signals })
  const composites = computeCompositeScores({ components })
  const confidence = propagateConfidence({ composites })
  assert.equal(confidence.summary.totalComposites, 1)
  assert.equal(confidence.entries[0]!.questionCode, 'Q-000001')
  assert.equal(confidence.entries[0]!.composite, composites.composites[0])
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundary checks
// ═══════════════════════════════════════════════════════════════════════════

function verifies_no_hidden_runtime_dependency(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'confidence/index.ts'), 'utf8'))
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
    assert.ok(!pattern.test(src), `confidence/index.ts must not contain forbidden pattern ${pattern}`)
  }
}

function verifies_no_penalty_ranking_solver_or_composite_changes(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'confidence/index.ts'), 'utf8'))
  const forbidden = [
    /\bRankedCandidateSet\b/,
    /\bRanking\b/,
    /\bSolver\b/,
    /\ballocation\b/i,
    /\bselect\b/i,
    /\bPenalty\b/,
    /\bpenalties\b/,
    /\bCompositeScoreInput\b/,
    /\bcomputeCompositeScores\b/,
  ]
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(src), `Confidence stage must not use forbidden later/sibling behavior ${pattern}`)
  }
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  { name: 'high Confidence when all Components are high', fn: verifies_high_confidence_when_all_components_high },
  { name: 'low Confidence when any Component is low', fn: verifies_low_confidence_when_any_component_low },
  { name: 'Confidence remains parallel to Composite value', fn: verifies_confidence_is_parallel_to_value },
  { name: 'rejects Composite confidence inconsistent with Components', fn: verifies_rejects_composite_confidence_that_does_not_match_components },
  { name: 'empty Breakdown is Fatal', fn: verifies_empty_breakdown_is_fatal },
  { name: 'Component questionCode mismatch is Fatal', fn: verifies_component_question_code_mismatch_is_fatal },
  { name: 'input Composite preserved and immutable', fn: verifies_input_composite_is_preserved_and_immutable },
  { name: 'pipeline smoke: Signal → Component → Composite → Confidence', fn: verifies_pipeline_smoke_signal_component_composite_confidence },
  { name: 'no hidden runtime dependency', fn: verifies_no_hidden_runtime_dependency },
  { name: 'no penalty/ranking/solver/composite behavior', fn: verifies_no_penalty_ranking_solver_or_composite_changes },
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
