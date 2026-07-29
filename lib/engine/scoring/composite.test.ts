/**
 * lib/engine/scoring/composite.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.3 — Composite Score tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.1, §2.3, §4.2.
 *   - Scoring Model Specification v1.0 §5, §8, §10.3, §10.4.
 *
 * RUN: npx jiti lib/engine/scoring/composite.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import {
  COMPONENT_VOCABULARY,
  type ComponentId,
  type Penalty,
  type RawSignal,
  type ScoreComponent,
} from './contracts'
import type { ComponentEvaluationOutput, EvaluatedSlotComponents } from './components'
import { evaluateComponents } from './components'
import { computeCompositeScores } from './composite'
import { extractSignals } from './signals'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'

// ─── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function mkSignal(componentId: ComponentId, questionCode = 'Q-000001'): RawSignal {
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
  value: number,
  opts: {
    readonly questionCode?: string
    readonly slot?: BlueprintSlot
    readonly lowConfidenceSignal?: 'pattern' | 'usage_count'
    readonly penalties?: readonly Penalty[]
  } = {}
): ScoreComponent {
  const questionCode = opts.questionCode ?? 'Q-000001'
  return {
    componentId,
    questionCode,
    slot: opts.slot ?? sharedSlot,
    normalized: {
      value,
      scale: `${componentId}-fixture-scale`,
    },
    inputs: [mkSignal(componentId, questionCode)],
    reasoning: `${componentId} fixture reasoning`,
    confidence:
      opts.lowConfidenceSignal === undefined
        ? { level: 'high', reducingSignals: [], propagationNote: null }
        : {
            level: 'low',
            reducingSignals: [opts.lowConfidenceSignal],
            propagationNote: `${componentId} low confidence fixture`,
          },
    penalties: opts.penalties ?? [],
  }
}

const sharedSlot = mkSlot()

function mkEntry(values?: Partial<Record<ComponentId, number>>): EvaluatedSlotComponents {
  return {
    questionCode: 'Q-000001',
    slot: sharedSlot,
    components: COMPONENT_VOCABULARY.map((id, index) =>
      mkComponent(id, values?.[id] ?? (index + 1) / 10)
    ),
  }
}

function mkOutput(entry = mkEntry()): ComponentEvaluationOutput {
  return {
    entries: [entry],
    summary: {
      totalCandidateSlots: 1,
      totalComponents: entry.components.length,
      componentIds: COMPONENT_VOCABULARY,
    },
  }
}

function fullCandidate(overrides: {
  readonly questionCode?: string
  readonly eligibleSlots?: readonly BlueprintSlot[]
} = {}): Candidate {
  const code = overrides.questionCode ?? 'Q-000001'
  return {
    identity: { questionCode: code, questionId: code },
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
      eligibleSlots: overrides.eligibleSlots ?? [mkSlot()],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function mkCandidateSet(candidates: readonly Candidate[]): CandidateSet {
  return {
    identity: { assemblyRequestId: 'req-test-001', generatedAt: null, bankStateHash: null },
    candidates,
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot: buildConstraintSnapshot(),
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

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// Composite shape and aggregation
// ═══════════════════════════════════════════════════════════════════════════

function verifies_composite_aggregates_existing_components(): void {
  const output = computeCompositeScores({
    components: mkOutput(mkEntry({ difficulty_fit: 1, usage: 0 })),
  })
  assert.equal(output.composites.length, 1)
  const composite = output.composites[0]!
  assert.equal(composite.questionCode, 'Q-000001')
  assert.equal(composite.slot, sharedSlot)
  assert.equal(composite.breakdown.contributions.length, 10)
  assert.ok(composite.value >= 0 && composite.value <= 1)
  assert.deepEqual(composite.penalties, [])
}

function verifies_equal_component_mean_and_transparent_contributions(): void {
  const entry = mkEntry(Object.fromEntries(COMPONENT_VOCABULARY.map((id) => [id, 0.5])))
  const composite = computeCompositeScores({ components: mkOutput(entry) }).composites[0]!
  assert.equal(composite.value, 0.5)
  for (let i = 0; i < COMPONENT_VOCABULARY.length; i++) {
    const contribution = composite.breakdown.contributions[i]!
    assert.equal(contribution.component, entry.components[i])
    assert.equal(contribution.contribution, 0.05)
    assert.match(contribution.reason, /equal weight/)
  }
  assert.match(composite.breakdown.aggregationNote, /equal-component mean/)
}

function verifies_composite_preserves_component_order_from_vocabulary(): void {
  const entry = mkEntry()
  const composite = computeCompositeScores({ components: mkOutput(entry) }).composites[0]!
  assert.deepEqual(
    composite.breakdown.contributions.map((contribution) => contribution.component.componentId),
    COMPONENT_VOCABULARY
  )
}

function verifies_composite_materializes_required_confidence_field_from_components(): void {
  const entry: EvaluatedSlotComponents = {
    ...mkEntry(),
    components: COMPONENT_VOCABULARY.map((id, index) =>
      mkComponent(id, 0.5, {
        lowConfidenceSignal:
          index === 0 ? 'pattern' : index === 1 ? 'usage_count' : undefined,
      })
    ),
  }
  const composite = computeCompositeScores({ components: mkOutput(entry) }).composites[0]!
  assert.equal(composite.confidence.level, 'low')
  assert.deepEqual(composite.confidence.reducingSignals, ['pattern', 'usage_count'])
  assert.match(composite.confidence.propagationNote ?? '', /Component evidence/)
}

function verifies_high_confidence_when_all_components_high(): void {
  const composite = computeCompositeScores({ components: mkOutput(mkEntry()) }).composites[0]!
  assert.equal(composite.confidence.level, 'high')
  assert.deepEqual(composite.confidence.reducingSignals, [])
  assert.equal(composite.confidence.propagationNote, null)
}

function verifies_pipeline_smoke_components_to_composite(): void {
  const candidateSet = mkCandidateSet([fullCandidate()])
  const components = evaluateComponents({
    candidateSet,
    signals: extractSignals(candidateSet),
  })
  const composites = computeCompositeScores({ components })
  assert.equal(composites.summary.totalComposites, 1)
  assert.equal(composites.summary.aggregationScale, 'equal-component-mean')
  assert.deepEqual(composites.summary.componentIds, COMPONENT_VOCABULARY)
  assert.equal(composites.composites[0]!.breakdown.contributions.length, 10)
}

// ═══════════════════════════════════════════════════════════════════════════
// Contract guards
// ═══════════════════════════════════════════════════════════════════════════

function verifies_missing_component_is_fatal(): void {
  const entry = {
    ...mkEntry(),
    components: mkEntry().components.filter((component) => component.componentId !== 'usage'),
  }
  assert.throws(
    () => computeCompositeScores({ components: mkOutput(entry) }),
    /expected 10/
  )
}

function verifies_duplicate_component_is_fatal(): void {
  const base = mkEntry()
  const entry = {
    ...base,
    components: [...base.components.slice(0, 9), base.components[0]!],
  }
  assert.throws(
    () => computeCompositeScores({ components: mkOutput(entry) }),
    /duplicate Component coverage_fit/
  )
}

function verifies_component_question_code_mismatch_is_fatal(): void {
  const base = mkEntry()
  const entry = {
    ...base,
    components: [
      mkComponent('coverage_fit', 0.5, { questionCode: 'Q-OTHER', slot: sharedSlot }),
      ...base.components.slice(1),
    ],
  }
  assert.throws(
    () => computeCompositeScores({ components: mkOutput(entry) }),
    /questionCode does not match/
  )
}

function verifies_component_slot_mismatch_is_fatal(): void {
  const base = mkEntry()
  const entry = {
    ...base,
    components: [
      mkComponent('coverage_fit', 0.5, { slot: mkSlot({ setNumber: 2 }) }),
      ...base.components.slice(1),
    ],
  }
  assert.throws(
    () => computeCompositeScores({ components: mkOutput(entry) }),
    /slot does not match/
  )
}

function verifies_pre_applied_component_penalty_is_fatal(): void {
  const penalty: Penalty = {
    type: 'soft',
    trigger: 'fixture',
    evidence: 'fixture',
    effect: 'fixture',
    appliedBy: 'ranking',
  }
  const base = mkEntry()
  const entry = {
    ...base,
    components: [
      mkComponent('coverage_fit', 0.5, { penalties: [penalty] }),
      ...base.components.slice(1),
    ],
  }
  assert.throws(
    () => computeCompositeScores({ components: mkOutput(entry) }),
    /penalty application is not part of E-3C\.3/
  )
}

function verifies_idempotent_and_input_immutable(): void {
  const components = mkOutput(mkEntry())
  const before = stableStringify(components)
  const a = computeCompositeScores({ components })
  const b = computeCompositeScores({ components })
  assert.equal(stableStringify(a), stableStringify(b))
  assert.equal(stableStringify(components), before)
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundary checks
// ═══════════════════════════════════════════════════════════════════════════

function verifies_no_hidden_runtime_dependency(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'composite/index.ts'), 'utf8'))
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
    assert.ok(!pattern.test(src), `composite/index.ts must not contain forbidden pattern ${pattern}`)
  }
}

function verifies_no_later_stage_or_upstream_contract_modification(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'composite/index.ts'), 'utf8'))
  const forbiddenLaterStageContracts = [
    /\bRankedCandidateSet\b/,
    /\bRanking\b/,
    /\bSolver\b/,
    /\ballocation\b/i,
    /\bselect\b/i,
  ]
  for (const pattern of forbiddenLaterStageContracts) {
    assert.ok(!pattern.test(src), `Composite stage must not use later-stage contract ${pattern}`)
  }
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  { name: 'aggregates existing immutable Components into CompositeScore', fn: verifies_composite_aggregates_existing_components },
  { name: 'uses equal-component mean with transparent contributions', fn: verifies_equal_component_mean_and_transparent_contributions },
  { name: 'preserves Component vocabulary order in Breakdown', fn: verifies_composite_preserves_component_order_from_vocabulary },
  { name: 'materializes required Composite confidence field from Components', fn: verifies_composite_materializes_required_confidence_field_from_components },
  { name: 'high Composite confidence when all Components are high', fn: verifies_high_confidence_when_all_components_high },
  { name: 'pipeline smoke: Components → Composite', fn: verifies_pipeline_smoke_components_to_composite },
  { name: 'missing Component is Fatal', fn: verifies_missing_component_is_fatal },
  { name: 'duplicate Component is Fatal', fn: verifies_duplicate_component_is_fatal },
  { name: 'Component questionCode mismatch is Fatal', fn: verifies_component_question_code_mismatch_is_fatal },
  { name: 'Component slot mismatch is Fatal', fn: verifies_component_slot_mismatch_is_fatal },
  { name: 'pre-applied Component penalty is Fatal', fn: verifies_pre_applied_component_penalty_is_fatal },
  { name: 'idempotent and input immutable', fn: verifies_idempotent_and_input_immutable },
  { name: 'no hidden runtime dependency', fn: verifies_no_hidden_runtime_dependency },
  { name: 'no later-stage or upstream contract modification', fn: verifies_no_later_stage_or_upstream_contract_modification },
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
