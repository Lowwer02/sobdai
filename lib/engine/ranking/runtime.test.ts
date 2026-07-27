/**
 * lib/engine/ranking/runtime.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.1 — Score Ordering Preparation tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §5, §8, §9, §10.
 *
 * RUN: npx jiti lib/engine/ranking/runtime.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { BlueprintSlot } from '../generator/contracts'
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
import {
  prepareScoreOrdering,
  type PenaltyOrderingStatus,
  type ScoreOrderingInput,
  type ScoreOrderingKey,
  type ScoreOrderingOutput,
} from './runtime'

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

const sharedSlot = mkSlot()

function key(
  compositeValue: number,
  confidenceLevel: ScoringConfidence['level'] = 'high',
  penaltyStatus: PenaltyOrderingStatus = 'none',
  penaltyCount = 0
): ScoreOrderingKey {
  return { compositeValue, confidenceLevel, penaltyStatus, penaltyCount }
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
// Shape and ordering preparation
// ═══════════════════════════════════════════════════════════════════════════

function verifies_empty_input_emits_empty_output(): void {
  const output = prepareScoreOrdering({ composites: [] })
  assert.deepEqual(output.slots, [])
  assert.deepEqual(output.summary, {
    totalSlots: 0,
    totalCandidates: 0,
    totalGroups: 0,
    unresolvedTieGroups: 0,
  })
}

function verifies_groups_composites_by_slot(): void {
  const slotA = mkSlot({ setNumber: 1, difficulty: 'Easy' })
  const slotB = mkSlot({ setNumber: 2, difficulty: 'Hard' })
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000002', 0.7, { slot: slotB }),
      mkComposite('Q-000001', 0.9, { slot: slotA }),
    ],
  })
  assert.equal(output.slots.length, 2)
  assert.equal(output.summary.totalSlots, 2)
  assert.deepEqual(
    output.slots.map((slot) => slot.slot.setNumber),
    [1, 2]
  )
}

function verifies_composite_value_descending_prepares_groups(): void {
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000001', 0.4),
      mkComposite('Q-000002', 0.9),
      mkComposite('Q-000003', 0.7),
    ],
  })
  assert.deepEqual(
    output.slots[0]!.groups.map((group) => group.orderingKey.compositeValue),
    [0.9, 0.7, 0.4]
  )
}

function verifies_high_confidence_precedes_low_for_equal_value(): void {
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000001', 0.8, { confidence: 'low' }),
      mkComposite('Q-000002', 0.8, { confidence: 'high' }),
    ],
  })
  assert.deepEqual(
    output.slots[0]!.groups.map((group) => group.orderingKey.confidenceLevel),
    ['high', 'low']
  )
}

function verifies_penalty_status_prepares_less_severe_first(): void {
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000004', 0.8, { penalties: [mkPenalty('disqualification')] }),
      mkComposite('Q-000003', 0.8, { penalties: [mkPenalty('hard')] }),
      mkComposite('Q-000002', 0.8, { penalties: [mkPenalty('soft')] }),
      mkComposite('Q-000001', 0.8),
    ],
  })
  assert.deepEqual(
    output.slots[0]!.groups.map((group) => group.orderingKey.penaltyStatus),
    ['none', 'soft', 'hard', 'disqualification']
  )
}

function verifies_penalty_count_prepares_fewer_first_for_same_status(): void {
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000002', 0.8, {
        penalties: [mkPenalty('soft', 'a'), mkPenalty('soft', 'b')],
      }),
      mkComposite('Q-000001', 0.8, { penalties: [mkPenalty('soft', 'a')] }),
    ],
  })
  assert.deepEqual(
    output.slots[0]!.groups.map((group) => group.orderingKey.penaltyCount),
    [1, 2]
  )
}

function verifies_maximum_recall_preserves_disqualified_candidates(): void {
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000001', 0.9),
      mkComposite('Q-000002', 0.2, { penalties: [mkPenalty('disqualification')] }),
    ],
  })
  const codes = output.slots[0]!.groups.flatMap((group) =>
    group.candidates.map((candidate) => candidate.questionCode)
  )
  assert.deepEqual(codes, ['Q-000001', 'Q-000002'])
}

function verifies_equal_keys_are_unresolved_ties_not_ranked_candidates(): void {
  const output = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000002', 0.8),
      mkComposite('Q-000001', 0.8),
    ],
  })
  const groups = output.slots[0]!.groups
  assert.equal(groups.length, 1)
  assert.equal(groups[0]!.unresolvedTie, true)
  assert.deepEqual(
    groups[0]!.candidates.map((candidate) => candidate.questionCode),
    ['Q-000001', 'Q-000002']
  )
  assert.ok(!('rank' in groups[0]!.candidates[0]!))
}

function verifies_signals_are_carried_from_composite_breakdown(): void {
  const output = prepareScoreOrdering({
    composites: [mkComposite('Q-000001', 0.8)],
  })
  const candidate = output.slots[0]!.groups[0]!.candidates[0]!
  assert.equal(candidate.signals.length, 1)
  assert.equal(candidate.signals[0]!.source, 'difficulty')
}

function verifies_ordering_key_descriptor_is_inspectable(): void {
  const output = prepareScoreOrdering({
    composites: [mkComposite('Q-000001', 0.8)],
  })
  assert.deepEqual(output.slots[0]!.orderingKey.facets, [
    'composite.value',
    'confidence.level',
    'penalties.status',
    'penalties.count',
  ])
  assert.ok(output.slots[0]!.orderingKey.description.length > 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism and immutability
// ═══════════════════════════════════════════════════════════════════════════

function verifies_candidate_order_invariant_for_grouping(): void {
  const a = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000003', 0.7),
      mkComposite('Q-000001', 0.9),
      mkComposite('Q-000002', 0.7),
    ],
  })
  const b = prepareScoreOrdering({
    composites: [
      mkComposite('Q-000002', 0.7),
      mkComposite('Q-000003', 0.7),
      mkComposite('Q-000001', 0.9),
    ],
  })
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_idempotent_and_stable_serializable(): void {
  const input: ScoreOrderingInput = {
    composites: [
      mkComposite('Q-000001', 0.9),
      mkComposite('Q-000002', 0.6, { confidence: 'low' }),
    ],
  }
  const a = prepareScoreOrdering(input)
  const b = prepareScoreOrdering(input)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_does_not_mutate_input_composites(): void {
  const composite = mkComposite('Q-000001', 0.8)
  const before = stableStringify(composite)
  const output = prepareScoreOrdering({ composites: [composite] })
  assert.equal(stableStringify(composite), before)
  assert.equal(output.slots[0]!.groups[0]!.candidates[0]!.composite, composite)
}

function verifies_output_fields_are_readonly(): void {
  const output: ScoreOrderingOutput = prepareScoreOrdering({
    composites: [mkComposite('Q-000001', 0.8)],
  })
  // @ts-expect-error — group candidates is readonly
  output.slots[0].groups[0].candidates = []
  // @ts-expect-error — slots is readonly
  output.slots = []
  assert.ok(true, 'readonly type errors confirmed by @ts-expect-error directives')
}

function verifies_key_fields_are_readonly(): void {
  const orderingKey = key(0.8)
  // @ts-expect-error — compositeValue is readonly
  orderingKey.compositeValue = 0.1
  assert.equal(orderingKey.compositeValue, 0.1)
}

// ═══════════════════════════════════════════════════════════════════════════
// Fail loud
// ═══════════════════════════════════════════════════════════════════════════

function verifies_out_of_range_composite_value_is_fatal(): void {
  assertThrowsFatal(
    () => prepareScoreOrdering({ composites: [mkComposite('Q-000001', 1.1)] }),
    /out-of-range value/
  )
}

function verifies_empty_breakdown_is_fatal(): void {
  const composite = {
    ...mkComposite('Q-000001', 0.8),
    breakdown: { contributions: [], aggregationNote: 'empty' },
  }
  assertThrowsFatal(
    () => prepareScoreOrdering({ composites: [composite] }),
    /empty Breakdown/
  )
}

function verifies_component_question_code_mismatch_is_fatal(): void {
  const composite = mkComposite('Q-000001', 0.8)
  const badComponent = mkComponent('difficulty_fit', 'Q-OTHER', sharedSlot)
  const bad: CompositeScore = {
    ...composite,
    breakdown: {
      ...composite.breakdown,
      contributions: [
        {
          component: badComponent,
          contribution: 0.5,
          reason: 'bad fixture',
        },
      ],
    },
  }
  assertThrowsFatal(
    () => prepareScoreOrdering({ composites: [bad] }),
    /questionCode does not match/
  )
}

function verifies_duplicate_candidate_slot_is_fatal(): void {
  assertThrowsFatal(
    () =>
      prepareScoreOrdering({
        composites: [
          mkComposite('Q-000001', 0.8),
          mkComposite('Q-000001', 0.7),
        ],
      }),
    /duplicate Composite/
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundaries
// ═══════════════════════════════════════════════════════════════════════════

function verifies_runtime_has_no_hidden_state_or_forbidden_dependencies(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'runtime.ts'), 'utf8'))
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
    assert.ok(!source.includes(token), `runtime.ts must not contain ${token}`)
  }
}

function verifies_runtime_does_not_emit_ranked_candidate_set(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'runtime.ts'), 'utf8'))
  assert.ok(!source.includes('RankedCandidateSet'))
  assert.ok(!source.includes('RankedCandidate'))
  assert.ok(!source.includes('rank:'))
  assert.ok(!source.includes('tieBreaker'))
}

// ═══════════════════════════════════════════════════════════════════════════
// runner
// ═══════════════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'empty input emits empty output', fn: verifies_empty_input_emits_empty_output },
  { name: 'groups Composites by Blueprint slot', fn: verifies_groups_composites_by_slot },
  { name: 'Composite value descending prepares groups', fn: verifies_composite_value_descending_prepares_groups },
  { name: 'high Confidence precedes low for equal value', fn: verifies_high_confidence_precedes_low_for_equal_value },
  { name: 'Penalty status prepares less severe first', fn: verifies_penalty_status_prepares_less_severe_first },
  { name: 'Penalty count prepares fewer first for same status', fn: verifies_penalty_count_prepares_fewer_first_for_same_status },
  { name: 'Maximum Recall preserves disqualified Candidates', fn: verifies_maximum_recall_preserves_disqualified_candidates },
  { name: 'equal keys remain unresolved ties, not RankedCandidates', fn: verifies_equal_keys_are_unresolved_ties_not_ranked_candidates },
  { name: 'Signals are carried from Composite Breakdown', fn: verifies_signals_are_carried_from_composite_breakdown },
  { name: 'ordering key descriptor is inspectable', fn: verifies_ordering_key_descriptor_is_inspectable },
  { name: 'Candidate input order invariant for grouping', fn: verifies_candidate_order_invariant_for_grouping },
  { name: 'idempotent and stable serializable', fn: verifies_idempotent_and_stable_serializable },
  { name: 'does not mutate input Composites', fn: verifies_does_not_mutate_input_composites },
  { name: 'output fields are readonly', fn: verifies_output_fields_are_readonly },
  { name: 'ScoreOrderingKey fields are readonly', fn: verifies_key_fields_are_readonly },
  { name: 'out-of-range Composite value is Fatal', fn: verifies_out_of_range_composite_value_is_fatal },
  { name: 'empty Breakdown is Fatal', fn: verifies_empty_breakdown_is_fatal },
  { name: 'Component questionCode mismatch is Fatal', fn: verifies_component_question_code_mismatch_is_fatal },
  { name: 'duplicate Candidate×slot Composite is Fatal', fn: verifies_duplicate_candidate_slot_is_fatal },
  { name: 'runtime has no hidden state or forbidden dependencies', fn: verifies_runtime_has_no_hidden_state_or_forbidden_dependencies },
  { name: 'runtime does not emit RankedCandidateSet or tie-breakers', fn: verifies_runtime_does_not_emit_ranked_candidate_set },
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
