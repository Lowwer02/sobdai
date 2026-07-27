/**
 * lib/engine/ranking/tie-resolution.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3E.2 — Deterministic Tie Resolution tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §6, §9, §10.
 *
 * RUN: npx jiti lib/engine/ranking/tie-resolution.test.ts
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
  type ScoreOrderingGroup,
  type ScoreOrderingOutput,
} from './runtime'
import {
  resolveTies,
  type TieResolutionOutput,
} from './tie-resolution'

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

const sharedSlot = mkSlot()

function prepare(composites: readonly CompositeScore[]): ScoreOrderingOutput {
  return prepareScoreOrdering({ composites })
}

function resolve(ordering: ScoreOrderingOutput, maxTieGroupSize = 10): TieResolutionOutput {
  return resolveTies({ ordering, maxTieGroupSize })
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
// Shape and tie resolution
// ═══════════════════════════════════════════════════════════════════════════

function verifies_empty_ordering_emits_empty_output(): void {
  const output = resolve(prepare([]))
  assert.deepEqual(output.slots, [])
  assert.deepEqual(output.summary, {
    totalSlots: 0,
    totalCandidates: 0,
    totalGroups: 0,
    resolvedTieGroups: 0,
  })
}

function verifies_non_tied_group_is_preserved_without_tie_metadata(): void {
  const ordering = prepare([mkComposite('Q-000001', 0.9), mkComposite('Q-000002', 0.8)])
  const output = resolve(ordering)
  assert.equal(output.slots[0]!.groups.length, 2)
  assert.equal(output.slots[0]!.groups[0]!.tieGroup, null)
  assert.equal(output.slots[0]!.groups[0]!.candidates[0]!.tieStatus.tieGroupId, null)
  assert.equal(
    output.slots[0]!.groups[0]!.candidates[0]!.orderingCandidate,
    ordering.slots[0]!.groups[0]!.candidates[0]
  )
}

function verifies_tied_group_resolves_by_question_code(): void {
  const output = resolve(
    prepare([
      mkComposite('Q-000003', 0.8),
      mkComposite('Q-000001', 0.8),
      mkComposite('Q-000002', 0.8),
    ])
  )
  const group = output.slots[0]!.groups[0]!
  assert.deepEqual(
    group.candidates.map((candidate) => candidate.questionCode),
    ['Q-000001', 'Q-000002', 'Q-000003']
  )
  assert.deepEqual(group.tieGroup!.resolvedOrder, ['Q-000001', 'Q-000002', 'Q-000003'])
}

function verifies_tie_group_is_visible_and_uses_stable_identity(): void {
  const output = resolve(prepare([mkComposite('Q-000002', 0.8), mkComposite('Q-000001', 0.8)]))
  const group = output.slots[0]!.groups[0]!
  assert.equal(group.tieGroup!.tieGroupId, group.groupId)
  assert.deepEqual(group.tieGroup!.memberCodes, ['Q-000001', 'Q-000002'])
  assert.equal(group.tieGroup!.tieBreaker.source, 'stable_identity')
  assert.equal(group.tieGroup!.tieBreaker.key, 'questionCode')
  assert.match(group.tieGroup!.tieBreaker.reason, /Question Code/)
}

function verifies_each_tied_candidate_carries_tie_status(): void {
  const output = resolve(prepare([mkComposite('Q-000002', 0.8), mkComposite('Q-000001', 0.8)]))
  const group = output.slots[0]!.groups[0]!
  for (const candidate of group.candidates) {
    assert.equal(candidate.tieStatus.tieGroupId, group.groupId)
    assert.deepEqual(candidate.tieStatus.memberCodes, ['Q-000001', 'Q-000002'])
    assert.equal(candidate.tieStatus.tieBreaker!.key, 'questionCode')
  }
}

function verifies_non_tie_ordering_groups_remain_in_existing_order(): void {
  const output = resolve(
    prepare([
      mkComposite('Q-000003', 0.5),
      mkComposite('Q-000002', 0.9),
      mkComposite('Q-000001', 0.7),
    ])
  )
  assert.deepEqual(
    output.slots[0]!.groups.map((group) => group.candidates[0]!.questionCode),
    ['Q-000002', 'Q-000001', 'Q-000003']
  )
}

function verifies_tie_resolution_does_not_modify_ordering_keys_or_scores(): void {
  const ordering = prepare([mkComposite('Q-000002', 0.8), mkComposite('Q-000001', 0.8)])
  const before = stableStringify(ordering)
  const output = resolve(ordering)
  assert.equal(stableStringify(ordering), before)
  assert.equal(
    output.slots[0]!.groups[0]!.orderingKey,
    ordering.slots[0]!.groups[0]!.orderingKey
  )
  assert.equal(
    output.slots[0]!.groups[0]!.candidates[0]!.orderingCandidate.composite.value,
    0.8
  )
}

function verifies_maximum_recall_preserves_every_candidate(): void {
  const output = resolve(
    prepare([
      mkComposite('Q-000003', 0.4, { penalties: [mkPenalty('disqualification')] }),
      mkComposite('Q-000002', 0.8),
      mkComposite('Q-000001', 0.8),
    ])
  )
  const codes = output.slots[0]!.groups.flatMap((group) =>
    group.candidates.map((candidate) => candidate.questionCode)
  )
  assert.deepEqual(codes, ['Q-000001', 'Q-000002', 'Q-000003'])
}

function verifies_summary_counts_resolved_ties(): void {
  const output = resolve(
    prepare([
      mkComposite('Q-000001', 0.8),
      mkComposite('Q-000002', 0.8),
      mkComposite('Q-000003', 0.7),
    ])
  )
  assert.deepEqual(output.summary, {
    totalSlots: 1,
    totalCandidates: 3,
    totalGroups: 2,
    resolvedTieGroups: 1,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism and immutability
// ═══════════════════════════════════════════════════════════════════════════

function verifies_input_order_invariant_for_ties(): void {
  const a = resolve(prepare([
    mkComposite('Q-000003', 0.8),
    mkComposite('Q-000001', 0.8),
    mkComposite('Q-000002', 0.8),
  ]))
  const b = resolve(prepare([
    mkComposite('Q-000002', 0.8),
    mkComposite('Q-000003', 0.8),
    mkComposite('Q-000001', 0.8),
  ]))
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_idempotent_and_stable_serializable(): void {
  const ordering = prepare([mkComposite('Q-000002', 0.8), mkComposite('Q-000001', 0.8)])
  const a = resolve(ordering)
  const b = resolve(ordering)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_output_fields_are_readonly(): void {
  const output: TieResolutionOutput = resolve(
    prepare([mkComposite('Q-000002', 0.8), mkComposite('Q-000001', 0.8)])
  )
  // @ts-expect-error — group candidates is readonly
  output.slots[0].groups[0].candidates = []
  // @ts-expect-error — slots is readonly
  output.slots = []
  assert.ok(true, 'readonly type errors confirmed by @ts-expect-error directives')
}

// ═══════════════════════════════════════════════════════════════════════════
// Fail loud
// ═══════════════════════════════════════════════════════════════════════════

function verifies_invalid_tie_limit_is_fatal(): void {
  assertThrowsFatal(
    () => resolveTies({ ordering: prepare([mkComposite('Q-000001', 0.8)]), maxTieGroupSize: 0 }),
    /maxTieGroupSize/
  )
}

function verifies_tie_overflow_is_fatal(): void {
  assertThrowsFatal(
    () =>
      resolveTies({
        ordering: prepare([
          mkComposite('Q-000001', 0.8),
          mkComposite('Q-000002', 0.8),
          mkComposite('Q-000003', 0.8),
        ]),
        maxTieGroupSize: 2,
      }),
    /tie overflow/
  )
}

function verifies_empty_group_is_fatal(): void {
  const ordering = prepare([mkComposite('Q-000001', 0.8)])
  const bad: ScoreOrderingOutput = {
    ...ordering,
    slots: [
      {
        ...ordering.slots[0]!,
        groups: [
          {
            ...ordering.slots[0]!.groups[0]!,
            candidates: [],
          },
        ],
      },
    ],
  }
  assertThrowsFatal(() => resolve(bad), /empty ordering group/)
}

function verifies_group_flag_candidate_count_mismatch_is_fatal(): void {
  const ordering = prepare([mkComposite('Q-000001', 0.8), mkComposite('Q-000002', 0.7)])
  const groupA = ordering.slots[0]!.groups[0]!
  const groupB = ordering.slots[0]!.groups[1]!
  const badGroup: ScoreOrderingGroup = {
    ...groupA,
    candidates: [groupA.candidates[0]!, groupB.candidates[0]!],
    unresolvedTie: false,
  }
  const bad: ScoreOrderingOutput = {
    ...ordering,
    slots: [{ ...ordering.slots[0]!, groups: [badGroup] }],
  }
  assertThrowsFatal(() => resolve(bad), /marked non-tied/)
}

function verifies_mismatched_ordering_key_is_fatal(): void {
  const ordering = prepare([mkComposite('Q-000001', 0.8), mkComposite('Q-000002', 0.7)])
  const groupA = ordering.slots[0]!.groups[0]!
  const groupB = ordering.slots[0]!.groups[1]!
  const badGroup: ScoreOrderingGroup = {
    ...groupA,
    candidates: [groupA.candidates[0]!, groupB.candidates[0]!],
    unresolvedTie: true,
  }
  const bad: ScoreOrderingOutput = {
    ...ordering,
    slots: [{ ...ordering.slots[0]!, groups: [badGroup] }],
  }
  assertThrowsFatal(() => resolve(bad), /ordering key does not match/)
}

function verifies_duplicate_question_code_inside_group_is_fatal(): void {
  const ordering = prepare([mkComposite('Q-000001', 0.8), mkComposite('Q-000002', 0.8)])
  const group = ordering.slots[0]!.groups[0]!
  const duplicate = {
    ...group.candidates[1]!,
    questionCode: group.candidates[0]!.questionCode,
  }
  const badGroup: ScoreOrderingGroup = {
    ...group,
    candidates: [group.candidates[0]!, duplicate],
  }
  const bad: ScoreOrderingOutput = {
    ...ordering,
    slots: [{ ...ordering.slots[0]!, groups: [badGroup] }],
  }
  assertThrowsFatal(() => resolve(bad), /duplicate Question Code/)
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundaries
// ═══════════════════════════════════════════════════════════════════════════

function verifies_source_has_no_hidden_state_or_forbidden_dependencies(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'tie-resolution.ts'), 'utf8'))
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
    assert.ok(!source.includes(token), `tie-resolution.ts must not contain ${token}`)
  }
}

function verifies_source_does_not_emit_rank_or_ranked_candidate_set(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'tie-resolution.ts'), 'utf8'))
  assert.ok(!source.includes('RankedCandidateSet'))
  assert.ok(!source.includes('RankedCandidate'))
  assert.ok(!source.includes('rank:'))
}

function verifies_source_uses_only_question_code_tie_breaker(): void {
  const source = stripComments(readFileSync(path.join(__dirname, 'tie-resolution.ts'), 'utf8'))
  assert.ok(source.includes('questionCode'))
  assert.ok(!source.includes('createdAt'))
  assert.ok(!source.includes('documentId'))
  assert.ok(!source.includes('difficultyRank'))
  assert.ok(!source.includes('component.value'))
}

// ═══════════════════════════════════════════════════════════════════════════
// runner
// ═══════════════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'empty ordering emits empty output', fn: verifies_empty_ordering_emits_empty_output },
  { name: 'non-tied group preserved without tie metadata', fn: verifies_non_tied_group_is_preserved_without_tie_metadata },
  { name: 'tied group resolves by Question Code (§6.3/§6.4)', fn: verifies_tied_group_resolves_by_question_code },
  { name: 'tie group visible and uses stable identity', fn: verifies_tie_group_is_visible_and_uses_stable_identity },
  { name: 'each tied Candidate carries tie status', fn: verifies_each_tied_candidate_carries_tie_status },
  { name: 'non-tie ordering groups remain in existing order', fn: verifies_non_tie_ordering_groups_remain_in_existing_order },
  { name: 'does not modify ordering keys or scores', fn: verifies_tie_resolution_does_not_modify_ordering_keys_or_scores },
  { name: 'Maximum Recall preserves every Candidate', fn: verifies_maximum_recall_preserves_every_candidate },
  { name: 'summary counts resolved ties', fn: verifies_summary_counts_resolved_ties },
  { name: 'input order invariant for ties', fn: verifies_input_order_invariant_for_ties },
  { name: 'idempotent and stable serializable', fn: verifies_idempotent_and_stable_serializable },
  { name: 'output fields are readonly', fn: verifies_output_fields_are_readonly },
  { name: 'invalid tie limit is Fatal', fn: verifies_invalid_tie_limit_is_fatal },
  { name: 'tie overflow is Fatal (§6.5)', fn: verifies_tie_overflow_is_fatal },
  { name: 'empty group is Fatal', fn: verifies_empty_group_is_fatal },
  { name: 'group flag/candidate count mismatch is Fatal', fn: verifies_group_flag_candidate_count_mismatch_is_fatal },
  { name: 'mismatched ordering key is Fatal', fn: verifies_mismatched_ordering_key_is_fatal },
  { name: 'duplicate Question Code inside group is Fatal', fn: verifies_duplicate_question_code_inside_group_is_fatal },
  { name: 'source has no hidden state or forbidden dependencies', fn: verifies_source_has_no_hidden_state_or_forbidden_dependencies },
  { name: 'source does not emit rank or RankedCandidateSet', fn: verifies_source_does_not_emit_rank_or_ranked_candidate_set },
  { name: 'source uses only Question Code tie-breaker', fn: verifies_source_uses_only_question_code_tie_breaker },
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

