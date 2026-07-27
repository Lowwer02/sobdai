/**
 * lib/engine/scoring/components.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.2 — Component Evaluator tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.1, §2.3, §4.
 *   - Scoring Model Specification v1.0 §3, §4, §6.3.2, §8.3, §10.2.
 *
 * RUN: npx jiti lib/engine/scoring/components.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import type { ComponentId, RawSignalSource, ScoreComponent } from './contracts'
import { COMPONENT_VOCABULARY } from './contracts'
import { extractSignals } from './signals'
import {
  evaluateComponents,
  type ComponentEvaluationOutput,
} from './components'
import { assertOrderInvariant, stableStringify } from '../shared/testing/determinism'

// ─── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function fullSlot(overrides: Partial<BlueprintSlot> = {}): BlueprintSlot {
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

function mkCandidate(overrides: {
  readonly questionCode?: string
  readonly document?: string
  readonly difficulty?: 'Easy' | 'Medium' | 'Hard'
  readonly topic?: string | null
  readonly tier?: 1 | 2 | 3 | 4
  readonly blueprintType?: 'Memory' | 'Concept' | 'Procedure' | 'Scenario' | null
  readonly learningObjective?: 'LO1' | 'LO2' | 'LO3' | 'LO4' | null
  readonly questionPattern?:
    | 'Positive'
    | 'Negative'
    | 'Best Answer'
    | 'Scenario'
    | 'Sequence'
    | 'Matching Concept'
    | null
  readonly eligibleSlots?: readonly BlueprintSlot[]
  readonly confidenceLevel?: 'full' | 'reduced'
  readonly confidenceReason?: string | null
} = {}): Candidate {
  const code = overrides.questionCode ?? 'Q-000001'
  const document = overrides.document ?? 'LAW-ACT-HED-2562'
  const difficulty = overrides.difficulty ?? 'Easy'
  const blueprintType = overrides.blueprintType === undefined ? 'Memory' : overrides.blueprintType
  const learningObjective =
    overrides.learningObjective === undefined ? 'LO1' : overrides.learningObjective
  const questionPattern =
    overrides.questionPattern === undefined ? 'Positive' : overrides.questionPattern
  const confidenceLevel =
    overrides.confidenceLevel ??
    (blueprintType === null || learningObjective === null || questionPattern === null
      ? 'reduced'
      : 'full')

  return {
    identity: {
      questionCode: code,
      questionId: code,
    },
    metadata: {
      document,
      difficulty,
      topic: overrides.topic === undefined ? 'มาตรา 6' : overrides.topic,
      status: 'Published',
      tier: overrides.tier ?? 1,
      blueprintType,
      learningObjective,
      questionPattern,
      section: 'ม.6',
      tags: [],
      category: null,
    },
    completeness: {
      blueprintType: blueprintType === null ? 'incomplete' : 'complete',
      learningObjective: learningObjective === null ? 'incomplete' : 'complete',
      questionPattern: questionPattern === null ? 'incomplete' : 'complete',
      section: 'complete',
    },
    confidence: {
      level: confidenceLevel,
      reason:
        confidenceLevel === 'full'
          ? null
          : overrides.confidenceReason ?? 'one or more IG-2 axes missing',
    },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document', 'coverage', 'difficulty'],
      eligibleSlots: overrides.eligibleSlots ?? [
        fullSlot({
          document,
          difficulty,
          blueprintType: blueprintType ?? undefined,
          pattern: questionPattern ?? undefined,
          learningObjective: learningObjective ?? undefined,
        }),
      ],
      coverageSatisfied: ['CR-1'],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function mkCandidateSet(candidates: readonly Candidate[]): CandidateSet {
  return {
    identity: {
      assemblyRequestId: 'req-test-001',
      generatedAt: null,
      bankStateHash: null,
    },
    candidates,
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: {
      bindings: [
        {
          document: 'LAW-ACT-HED-2562',
          topic: 'มาตรา 6',
          satisfyingCodes: candidates
            .filter((candidate) => candidate.metadata.document === 'LAW-ACT-HED-2562')
            .filter((candidate) => candidate.metadata.topic === 'มาตรา 6')
            .map((candidate) => candidate.identity.questionCode),
        },
      ],
    },
    warnings: [],
    statistics: {
      totalCandidates: candidates.length,
      fullConfidenceCount: candidates.filter((candidate) => candidate.confidence.level === 'full').length,
      reducedConfidenceCount: candidates.filter((candidate) => candidate.confidence.level === 'reduced').length,
      incompleteAxesCount: candidates.filter(
        (candidate) =>
          candidate.completeness.blueprintType === 'incomplete' ||
          candidate.completeness.learningObjective === 'incomplete' ||
          candidate.completeness.questionPattern === 'incomplete' ||
          candidate.completeness.section === 'incomplete'
      ).length,
      distinctDocuments: new Set(candidates.map((candidate) => candidate.metadata.document)).size,
      distinctDifficulties: new Set(candidates.map((candidate) => candidate.metadata.difficulty)).size,
      distinctPatterns: new Set(candidates.map((candidate) => String(candidate.metadata.questionPattern))).size,
      distinctLearningObjectives: new Set(candidates.map((candidate) => String(candidate.metadata.learningObjective)))
        .size,
      shortfallCount: 0,
    },
    exclusionsLog: [],
    meta: {
      specVersion: '1.0',
      generatorVersion: '1.0.0',
    },
  }
}

function evaluate(candidateSet: CandidateSet): ComponentEvaluationOutput {
  return evaluateComponents({
    candidateSet,
    signals: extractSignals(candidateSet),
  })
}

function component(
  output: ComponentEvaluationOutput,
  componentId: ComponentId,
  entryIndex = 0
): ScoreComponent {
  const found = output.entries[entryIndex]!.components.find((c) => c.componentId === componentId)
  assert.ok(found, `expected component ${componentId}`)
  return found
}

function inputSources(c: ScoreComponent): readonly RawSignalSource[] {
  return c.inputs.map((input) => input.source)
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// Component vocabulary and shape
// ═══════════════════════════════════════════════════════════════════════════

function verifies_evaluates_exactly_ten_frozen_components(): void {
  const output = evaluate(mkCandidateSet([mkCandidate()]))
  assert.equal(output.entries.length, 1)
  assert.deepEqual(
    output.entries[0]!.components.map((c) => c.componentId),
    COMPONENT_VOCABULARY
  )
  assert.equal(output.summary.totalComponents, 10)
  assert.deepEqual(output.summary.componentIds, COMPONENT_VOCABULARY)
}

function verifies_every_component_has_required_score_component_fields(): void {
  const output = evaluate(mkCandidateSet([mkCandidate()]))
  for (const c of output.entries[0]!.components) {
    assert.equal(c.questionCode, 'Q-000001')
    assert.ok(c.slot)
    assert.ok(c.inputs.length > 0)
    assert.ok(c.reasoning.length > 0)
    assert.equal(typeof c.normalized.scale, 'string')
    assert.ok(c.normalized.scale.length > 0)
    assert.ok(c.normalized.value >= 0 && c.normalized.value <= 1)
    assert.ok(c.confidence.level === 'high' || c.confidence.level === 'low')
    assert.deepEqual(c.penalties, [])
  }
}

function verifies_slot_axis_fit_components_match_exactly(): void {
  const output = evaluate(mkCandidateSet([mkCandidate()]))
  assert.equal(component(output, 'difficulty_fit').normalized.value, 1)
  assert.equal(component(output, 'pattern_fit').normalized.value, 1)
  assert.equal(component(output, 'lo_fit').normalized.value, 1)
  assert.equal(component(output, 'blueprint_alignment').normalized.value, 1)
}

function verifies_slot_axis_mismatch_is_evaluated_without_dropping_candidate(): void {
  const output = evaluate(
    mkCandidateSet([
      mkCandidate({
        difficulty: 'Hard',
        questionPattern: 'Negative',
        learningObjective: 'LO2',
        eligibleSlots: [fullSlot()],
      }),
    ])
  )
  assert.equal(output.entries.length, 1)
  assert.equal(component(output, 'difficulty_fit').normalized.value, 0)
  assert.equal(component(output, 'pattern_fit').normalized.value, 0)
  assert.equal(component(output, 'lo_fit').normalized.value, 0)
}

function verifies_component_inputs_trace_to_raw_signal_sources(): void {
  const output = evaluate(mkCandidateSet([mkCandidate()]))
  assert.deepEqual(inputSources(component(output, 'coverage_fit')), ['document', 'topic'])
  assert.deepEqual(inputSources(component(output, 'difficulty_fit')), ['difficulty'])
  assert.deepEqual(inputSources(component(output, 'pattern_fit')), ['pattern'])
  assert.deepEqual(inputSources(component(output, 'lo_fit')), ['learning_objective'])
  assert.deepEqual(inputSources(component(output, 'freshness')), ['last_used_at'])
  assert.deepEqual(inputSources(component(output, 'usage')), ['usage_count'])
  assert.deepEqual(inputSources(component(output, 'constraint_readiness')), ['tier'])
}

function verifies_coverage_fit_does_not_read_coverage_satisfaction(): void {
  const candidateSet = mkCandidateSet([mkCandidate()])
  const signals = extractSignals(candidateSet)
  const withCoverage = evaluateComponents({ candidateSet, signals })
  const withoutCoverage = evaluateComponents({
    candidateSet: {
      ...candidateSet,
      coverageSatisfaction: { bindings: [] },
    },
    signals,
  })
  assert.equal(
    stableStringify(component(withCoverage, 'coverage_fit')),
    stableStringify(component(withoutCoverage, 'coverage_fit'))
  )
}

function verifies_missing_signal_drives_component_low_confidence_not_penalty(): void {
  const output = evaluate(
    mkCandidateSet([
      mkCandidate({
        questionPattern: null,
        confidenceLevel: 'reduced',
        eligibleSlots: [fullSlot()],
      }),
    ])
  )
  const pattern = component(output, 'pattern_fit')
  assert.equal(pattern.normalized.value, 0)
  assert.equal(pattern.confidence.level, 'low')
  assert.deepEqual(pattern.confidence.reducingSignals, ['pattern'])
  assert.deepEqual(pattern.penalties, [])
}

function verifies_usage_and_freshness_do_not_invent_missing_values(): void {
  const output = evaluate(mkCandidateSet([mkCandidate()]))
  const freshness = component(output, 'freshness')
  const usage = component(output, 'usage')
  assert.equal(freshness.normalized.value, 0)
  assert.equal(freshness.confidence.level, 'low')
  assert.deepEqual(freshness.confidence.reducingSignals, ['last_used_at'])
  assert.match(freshness.reasoning, /missing/)
  assert.equal(usage.normalized.value, 0)
  assert.equal(usage.confidence.level, 'low')
  assert.deepEqual(usage.confidence.reducingSignals, ['usage_count'])
  assert.match(usage.reasoning, /missing/)
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism and purity
// ═══════════════════════════════════════════════════════════════════════════

function verifies_canonicalizes_candidate_and_slot_order(): void {
  const slotA = fullSlot({ setNumber: 2, difficulty: 'Hard' })
  const slotB = fullSlot({ setNumber: 1, difficulty: 'Easy' })
  const output = evaluate(
    mkCandidateSet([
      mkCandidate({ questionCode: 'Q-000002' }),
      mkCandidate({ questionCode: 'Q-000001', eligibleSlots: [slotA, slotB] }),
    ])
  )
  assert.deepEqual(
    output.entries.map((entry) => `${entry.questionCode}:${entry.slot.setNumber}`),
    ['Q-000001:1', 'Q-000001:2', 'Q-000002:1']
  )
}

function verifies_order_invariant_over_candidate_order(): void {
  const candidates = [
    mkCandidate({ questionCode: 'Q-000003', difficulty: 'Hard' }),
    mkCandidate({ questionCode: 'Q-000001', difficulty: 'Easy' }),
    mkCandidate({ questionCode: 'Q-000002', difficulty: 'Medium' }),
  ]
  assertOrderInvariant(
    (input) => evaluate(mkCandidateSet(input)),
    candidates,
    { runs: 20, seed: 41 }
  )
}

function verifies_idempotent_and_does_not_mutate_inputs(): void {
  const candidateSet = mkCandidateSet([mkCandidate({ questionCode: 'Q-000001' })])
  const before = stableStringify(candidateSet)
  const a = evaluate(candidateSet)
  const b = evaluate(candidateSet)
  assert.equal(stableStringify(a), stableStringify(b))
  assert.equal(stableStringify(candidateSet), before)
}

function verifies_missing_signal_output_is_fatal(): void {
  const candidateSet = mkCandidateSet([mkCandidate()])
  const signals = extractSignals(candidateSet)
  const withoutPattern = {
    ...signals,
    candidates: [
      {
        ...signals.candidates[0]!,
        signals: signals.candidates[0]!.signals.filter((signal) => signal.source !== 'pattern'),
      },
    ],
  }
  assert.throws(
    () => evaluateComponents({ candidateSet, signals: withoutPattern }),
    /missing required pattern signal/
  )
}

function verifies_candidate_without_eligible_slot_is_fatal(): void {
  const candidateSet = mkCandidateSet([
    mkCandidate({
      eligibleSlots: [],
    }),
  ])
  assert.throws(
    () => evaluate(candidateSet),
    /has no eligible slots/
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundary checks
// ═══════════════════════════════════════════════════════════════════════════

function verifies_component_evaluators_have_no_forbidden_runtime_dependencies(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'components/index.ts'), 'utf8'))
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
    assert.ok(!pattern.test(src), `components/index.ts must not contain forbidden pattern ${pattern}`)
  }
}

function verifies_component_evaluators_do_not_continue_to_later_stages(): void {
  const src = stripComments(readFileSync(path.join(__dirname, 'components/index.ts'), 'utf8'))
  const forbiddenLaterStageContracts = [
    /\bCompositeScore\b/,
    /\bScoreBreakdown\b/,
    /\bComponentContribution\b/,
    /\bRanking\b/,
    /\bRankedCandidateSet\b/,
    /\bSolver\b/,
  ]
  for (const pattern of forbiddenLaterStageContracts) {
    assert.ok(!pattern.test(src), `Stage 2 must not use later-stage contract ${pattern}`)
  }
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  { name: 'evaluates exactly ten frozen components (§4.1)', fn: verifies_evaluates_exactly_ten_frozen_components },
  { name: 'each component has ScoreComponent fields (§10.2)', fn: verifies_every_component_has_required_score_component_fields },
  { name: 'slot-axis fit components match exactly', fn: verifies_slot_axis_fit_components_match_exactly },
  { name: 'slot-axis mismatch is evaluated without dropping Candidate', fn: verifies_slot_axis_mismatch_is_evaluated_without_dropping_candidate },
  { name: 'component inputs trace to RawSignal sources (§8.3)', fn: verifies_component_inputs_trace_to_raw_signal_sources },
  { name: 'Coverage Fit does not bypass Signal Extraction', fn: verifies_coverage_fit_does_not_read_coverage_satisfaction },
  { name: 'missing signal drives low component confidence, not penalty', fn: verifies_missing_signal_drives_component_low_confidence_not_penalty },
  { name: 'usage/freshness do not invent missing values (§11.2)', fn: verifies_usage_and_freshness_do_not_invent_missing_values },
  { name: 'canonicalizes Candidate and slot order', fn: verifies_canonicalizes_candidate_and_slot_order },
  { name: 'order-invariant over Candidate order', fn: verifies_order_invariant_over_candidate_order },
  { name: 'idempotent and input-immutable', fn: verifies_idempotent_and_does_not_mutate_inputs },
  { name: 'missing Signal Extraction output is Fatal', fn: verifies_missing_signal_output_is_fatal },
  { name: 'Candidate without eligible slot is Fatal', fn: verifies_candidate_without_eligible_slot_is_fatal },
  { name: 'no forbidden runtime dependencies', fn: verifies_component_evaluators_have_no_forbidden_runtime_dependencies },
  { name: 'does not continue to later stages', fn: verifies_component_evaluators_do_not_continue_to_later_stages },
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
