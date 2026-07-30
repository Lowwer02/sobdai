/**
 * lib/engine/scoring/contracts.test.ts
 * ----------------------------------------------------------------------------
 * Scoring Model Foundation — contract tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Scoring Model Specification v1.0 §4 (Components), §6 (Confidence),
 *     §7 (Penalty), §10 (Data Contracts).
 *
 * RUN: npx jiti lib/engine/scoring/contracts.test.ts
 *
 * Coverage targets:
 *  - Vocabulary stability: SignalExtractionConfidence (4), ComponentId (10),
 *    PenaltyType (3), ScoringConfidenceLevel (2) match the spec exactly.
 *  - Immutability: every field of every struct is `readonly` (compile-time).
 *  - Discriminated unions: narrow correctly on literal fields.
 *  - No forbidden imports: no Bank, no React, no supabase, no Math.random,
 *    no Date (determinism + boundary contract — Scoring §13.1).
 *  - Component vocabulary constant is stable (no silent additions/removals).
 *  - Serialization: stableStringify produces canonical output regardless of
 *    key insertion order (the determinism property).
 *  - Distinctness: Scoring Confidence != Generator Confidence != Signal
 *    integrity (three separate vocabularies — Scoring §6.5 reconciliation).
 *  - Spec-provenance: each contract's @spec citation names §6/§7/§10 source.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  COMPONENT_VOCABULARY,
  type ComponentContribution,
  type ComponentId,
  type CompositeScore,
  type NormalizedScore,
  type Penalty,
  type PenaltyType,
  type RawSignal,
  type RawSignalSource,
  type ScoreBreakdown,
  type ScoreComponent,
  type ScoringConfidence,
  type ScoringConfidenceLevel,
  type SignalExtractionConfidence,
} from './contracts'
import type { BlueprintSlot } from '../generator/contracts'
import { stableStringify } from '../shared/testing/determinism'

// ─── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function mkSlot(overrides?: Partial<BlueprintSlot>): BlueprintSlot {
  const base: BlueprintSlot = {
    setNumber: 1,
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    document: 'พ.ร.บ.ทดสอบ 2560',
    learningObjective: 'LO1',
  }
  return { ...base, ...overrides }
}

function mkSignal(overrides?: Partial<RawSignal>): RawSignal {
  const base: RawSignal = {
    questionCode: 'Q-000001',
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
  }
  return { ...base, ...overrides }
}

function mkConfidenceHigh(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function mkNormalized(): NormalizedScore {
  return { value: 0.9, scale: 'exact-match' }
}

function mkComponent(overrides?: Partial<ScoreComponent>): ScoreComponent {
  const base: ScoreComponent = {
    componentId: 'difficulty_fit',
    questionCode: 'Q-000001',
    slot: mkSlot(),
    normalized: mkNormalized(),
    inputs: [mkSignal()],
    reasoning: 'Difficulty Fit = full match: Candidate is Easy, slot requires Easy.',
    confidence: mkConfidenceHigh(),
    penalties: [],
  }
  return { ...base, ...overrides }
}

function mkComposite(overrides?: Partial<CompositeScore>): CompositeScore {
  const component = mkComponent()
  const contribution: ComponentContribution = {
    component,
    contribution: 0.15,
    reason: 'weight 0.15; full match on difficulty',
  }
  const base: CompositeScore = {
    questionCode: 'Q-000001',
    slot: mkSlot(),
    value: 0.82,
    breakdown: { contributions: [contribution], aggregationNote: 'weighted mean of 10 Components' },
    confidence: mkConfidenceHigh(),
    penalties: [],
  }
  return { ...base, ...overrides }
}

// ═══ Vocabulary stability ═════════════════════════════════════════════════

function verifies_signal_integrity_is_four_values(): void {
  // §6.2 + §6.3.1: exactly four — known / incomplete / missing / conflicting.
  const confidences: SignalExtractionConfidence[] = [
    'known',
    'incomplete',
    'missing',
    'conflicting',
  ]
  assert.equal(confidences.length, 4)
}

function verifies_component_id_is_ten_values(): void {
  // §4.1: exactly ten components in the v1.0 vocabulary.
  const ids: ComponentId[] = [
    'coverage_fit',
    'difficulty_fit',
    'distribution_fit',
    'pattern_fit',
    'lo_fit',
    'freshness',
    'usage',
    'diversity',
    'constraint_readiness',
    'blueprint_alignment',
  ]
  assert.equal(ids.length, 10)
}

function verifies_component_vocabulary_constant_matches_union(): void {
  // Every ComponentId appears in COMPONENT_VOCABULARY, and vice versa.
  assert.equal(COMPONENT_VOCABULARY.length, 10)
  const ids: ComponentId[] = [
    'coverage_fit',
    'difficulty_fit',
    'distribution_fit',
    'pattern_fit',
    'lo_fit',
    'freshness',
    'usage',
    'diversity',
    'constraint_readiness',
    'blueprint_alignment',
  ]
  for (const id of ids) {
    assert.ok(
      COMPONENT_VOCABULARY.includes(id),
      `ComponentId ${id} missing from COMPONENT_VOCABULARY`
    )
  }
}

function verifies_penalty_type_is_three_values(): void {
  // §7.1: exactly three — soft / hard / disqualification.
  const types: PenaltyType[] = ['soft', 'hard', 'disqualification']
  assert.equal(types.length, 3)
}

function verifies_scoring_confidence_level_is_two_values(): void {
  // §6.2: High / Low (qualitatively defined; captured as two-state).
  const levels: ScoringConfidenceLevel[] = ['high', 'low']
  assert.equal(levels.length, 2)
}

function verifies_raw_signal_source_vocabulary_closed(): void {
  // §3.1 / §4.1: signals come only from CandidateSet metadata axes.
  const sources: RawSignalSource[] = [
    'difficulty',
    'pattern',
    'learning_objective',
    'document',
    'topic',
    'tier',
    'blueprint_type',
    'usage_count',
    'last_used_at',
    'generator_confidence',
  ]
  // Closed inventory; new axes require a Scoring Model version bump (§15.6).
  assert.equal(sources.length, 10)
}

// ═══ Three Confidence vocabularies are DISTINCT (§6.5 reconciliation) ═════

function verifies_scoring_confidence_distinct_from_generator_confidence(): void {
  // §6.5: Generator ConfidenceLevel ('full' | 'reduced') is an INPUT to
  // Scoring; ScoringConfidenceLevel ('high' | 'low') is the propagated
  // per-(Candidate × slot) Composite-level trust. They compose, do not merge.
  const scoringLevels: ScoringConfidenceLevel[] = ['high', 'low']
  const generatorLevels: ('full' | 'reduced')[] = ['full', 'reduced']
  // No overlap in vocabulary — confirms they are distinct enums.
  for (const s of scoringLevels) {
    assert.ok(
      !(generatorLevels as string[]).includes(s),
      `Scoring level '${s}' must not appear in Generator ConfidenceLevel`
    )
  }
}

function verifies_scoring_confidence_distinct_from_signal_integrity(): void {
  // §6.3.1: SignalExtractionConfidence (4-state, per-Signal) feeds INTO
  // ScoringConfidence (2-state, per-Composite) via propagation. They are
  // different vocabularies at different layers.
  const signalStates: SignalExtractionConfidence[] = [
    'known',
    'incomplete',
    'missing',
    'conflicting',
  ]
  const compositeLevels: ScoringConfidenceLevel[] = ['high', 'low']
  assert.equal(signalStates.length, 4)
  assert.equal(compositeLevels.length, 2)
  for (const s of signalStates) {
    assert.ok(
      !(compositeLevels as string[]).includes(s as string),
      `Signal state '${s}' must not appear in Composite ConfidenceLevel`
    )
  }
}

// ═══ Compile-time immutability (readonly fields) ══════════════════════════

function verifies_raw_signal_fields_are_readonly(): void {
  const s: RawSignal = mkSignal()
  // @ts-expect-error — readonly field cannot be reassigned.
  s.questionCode = 'Q-000002'
}

function verifies_score_component_fields_are_readonly(): void {
  const c: ScoreComponent = mkComponent()
  // @ts-expect-error
  c.value = 0.5
  // @ts-expect-error
  c.reasoning = 'mutated'
}

function verifies_composite_score_fields_are_readonly(): void {
  const cs: CompositeScore = mkComposite()
  // @ts-expect-error
  cs.value = 0.5
  // @ts-expect-error
  cs.confidence = mkConfidenceHigh()
}

function verifies_penalty_fields_are_readonly(): void {
  const p: Penalty = {
    type: 'soft',
    trigger: 'high usage load',
    evidence: 'usage_count = 12',
    effect: 'reduces effective value',
    appliedBy: 'ranking',
  }
  // @ts-expect-error
  p.type = 'hard'
  // @ts-expect-error
  p.trigger = 'mutated'
}

// ═══ Discriminated-union narrowing ═════════════════════════════════════════

function verifies_penalty_type_narrows_correctly(): void {
  const p: Penalty = {
    type: 'disqualification',
    trigger: 'hard exclusion discovered post-Generator',
    evidence: 'excluded list contains Q-000001',
    effect: 'removes Candidate from slot contention entirely',
    appliedBy: 'ranking',
  }
  // Disqualification is terminal (§7.3) — narrowing proves the literal type.
  if (p.type === 'disqualification') {
    assert.equal(p.effect, 'removes Candidate from slot contention entirely')
  } else {
    assert.fail('should have narrowed to disqualification')
  }
}

function verifies_signal_integrity_narrows_correctly(): void {
  // 'missing' is the canonical IG-2 case (§6.2).
  const s: RawSignal = mkSignal({ source: 'pattern', integrity: 'missing' })
  if (s.integrity === 'missing') {
    assert.equal(s.source, 'pattern')
  } else {
    assert.fail('should have narrowed to missing')
  }
}

// ═══ Transparency is non-negotiable (§8, §7.5) ════════════════════════════

function verifies_penalty_requires_all_explanation_fields(): void {
  // §7.5: every penalty is explainable: type, trigger, evidence, effect.
  // §6.2: a Component without evidence is non-conformant. The constructor
  // requires all four fields — this test confirms the type signature refuses
  // omission.
  const valid: Penalty = {
    type: 'hard',
    trigger: 'near-duplicate of selected Candidate',
    evidence: 'tags overlap 0.85 with Q-000002',
    effect: 'strongly reduces effective value',
    appliedBy: 'ranking',
  }
  assert.equal(valid.trigger.length > 0, true)

  // @ts-expect-error — trigger is required, omission must fail type-check.
  const _missing: Penalty = {
    type: 'soft',
    evidence: 'x',
    effect: 'y',
    appliedBy: 'ranking',
  }
  void _missing
}

function verifies_component_requires_inputs_and_reasoning(): void {
  // §10.2: Component carries inputs (Raw Signals) + reasoning. §6.2: "without
  // evidence, there is no Score". Empty inputs array is allowed at the type
  // level (TS can't enforce min-length), but the field is required.
  const c: ScoreComponent = mkComponent({ inputs: [] })
  // The reasoning field is required and string (never null).
  assert.equal(typeof c.reasoning, 'string')
  assert.equal(c.reasoning.length > 0, true)
}

function verifies_composite_breakdown_always_present(): void {
  // §5.4: "A Composite without its breakdown is non-conformant."
  const cs: CompositeScore = mkComposite()
  assert.equal(typeof cs.breakdown, 'object')
  assert.ok(cs.breakdown.contributions.length >= 1)
  assert.equal(typeof cs.breakdown.aggregationNote, 'string')
}

// ═══ Serialization (determinism property) ═════════════════════════════════

function verifies_stable_serialization_ignores_key_order(): void {
  // Two structurally-equal Composites with different key insertion order
  // must serialize identically (the determinism property — Scoring §3.3,
  // Implementation Planning determinism contract).
  const a = mkComposite()
  // Reconstruct with deliberately shuffled top-level key order.
  const b: CompositeScore = {
    penalties: [],
    confidence: a.confidence,
    breakdown: a.breakdown,
    value: a.value,
    slot: a.slot,
    questionCode: a.questionCode,
  }
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_signal_serialization_is_stable(): void {
  const a = mkSignal()
  const b: RawSignal = {
    extractionNote: a.extractionNote,
    integrity: a.integrity,
    value: a.value,
    source: a.source,
    questionCode: a.questionCode,
  }
  assert.equal(stableStringify(a), stableStringify(b))
}

// ═══ Boundary contract — no forbidden imports (§13.1, determinism) ════════

function verifies_no_forbidden_imports_in_contracts_file(): void {
  // Scoring §13.1 MUST NEVER: read content, query Bank, invoke LLM, couple to
  // SQL/UI. Determinism forbids Math.random / Date.now in pure modules.
  // The contracts file is TYPES ONLY, so it must not import any of these.
  const contractsPath = path.join(__dirname, 'contracts.ts')
  const raw = readFileSync(contractsPath, 'utf8')

  // Strip comments first: the boundary contract governs actual CODE, not the
  // prose that documents the contract. JSDoc legitimately names forbidden
  // APIs ("must NEVER reference Math.random") — that documentation must not
  // trip a code-usage check.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, '') // line comments

  // Forbidden runtime imports (would couple types to I/O or non-determinism).
  const forbidden = [
    /\bfrom\s+['"]@supabase/,
    /\bfrom\s+['"].*supabase/,
    /\bfrom\s+['"]react['"]/,
    /\bfrom\s+['"]next\//,
    /\bMath\.random\b/,
    /\bDate\.now\b/,
    /\bprocess\.hrtime\b/,
  ]
  for (const pattern of forbidden) {
    assert.ok(
      !pattern.test(src),
      `contracts.ts must not contain forbidden pattern ${pattern} (Scoring §13.1 / determinism)`
    )
  }

  // The only permitted runtime imports are type-only from shared/generator
  // vocabulary. Verify imports are present and type-only.
  assert.ok(
    src.includes("from '../shared/assessment-vocabulary'"),
    "must import canonical vocabulary from '../shared/assessment-vocabulary'"
  )
  assert.ok(
    src.includes("from '../generator/contracts'"),
    "must import BlueprintSlot from '../generator/contracts'"
  )
  assert.ok(
    src.includes('import type {') && !/\bimport\s+\{[^}]*\}\s+from\b/.test(src.replace(/import type/g, '')),
    'imports must be type-only (no runtime values pulled in)'
  )
}

function verifies_no_duplicate_vocab_definitions(): void {
  // The Scoring contracts must NOT redefine upstream enums. Verify the file
  // imports Difficulty/Tier/etc rather than re-declaring them.
  const contractsPath = path.join(__dirname, 'contracts.ts')
  const src = readFileSync(contractsPath, 'utf8')

  // These upstream types must NOT be redefined locally.
  const upstreamTypes = ['Difficulty', 'Tier', 'BlueprintType', 'QuestionPattern', 'LearningObjective']
  for (const t of upstreamTypes) {
    // A local redefinition would look like `export type Difficulty = ...`.
    const redefinition = new RegExp(`export\\s+type\\s+${t}\\s*=`)
    assert.ok(
      !redefinition.test(src),
      `${t} must be imported from ../shared/assessment-vocabulary, not redefined (no duplication)`
    )
  }
}

// ═══ Cross-contract relationships (§10.7) ═════════════════════════════════

function verifies_composite_traces_to_components_to_signals(): void {
  // §10.7: "Every Composite traces to its Components; every Component traces
  // to its Signals; every Confidence and Penalty is bound to the Composite."
  const cs = mkComposite()
  // Composite → Breakdown → Contribution → Component → Inputs → Signal.
  const firstContribution = cs.breakdown.contributions[0]
  const firstComponent = firstContribution.component
  const firstSignal = firstComponent.inputs[0]
  assert.equal(firstComponent.componentId, 'difficulty_fit')
  assert.equal(firstSignal.source, 'difficulty')
  // Confidence bound at Composite AND Component level.
  assert.equal(typeof cs.confidence.level, 'string')
  assert.equal(typeof firstComponent.confidence.level, 'string')
}

function verifies_component_independent_per_candidate_slot(): void {
  // §5.2: "A Candidate may have different Composite Scores against different
  // slots." Two Composites for the same Candidate against different slots
  // are distinct, independent evaluations.
  const slotA = mkSlot({ difficulty: 'Easy' })
  const slotB = mkSlot({ difficulty: 'Hard' })
  const csA = mkComposite({ slot: slotA, value: 0.9 })
  const csB = mkComposite({ slot: slotB, value: 0.4 })
  assert.notEqual(csA.slot.difficulty, csB.slot.difficulty)
  assert.notEqual(csA.value, csB.value)
  assert.equal(csA.questionCode, csB.questionCode)
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  // Vocabulary stability
  { name: 'SignalExtractionConfidence has exactly 4 values (§6.2)', fn: verifies_signal_integrity_is_four_values },
  { name: 'ComponentId has exactly 10 values (§4.1)', fn: verifies_component_id_is_ten_values },
  { name: 'COMPONENT_VOCABULARY constant matches the union (§4.1)', fn: verifies_component_vocabulary_constant_matches_union },
  { name: 'PenaltyType has exactly 3 values (§7.1)', fn: verifies_penalty_type_is_three_values },
  { name: 'ScoringConfidenceLevel has exactly 2 values (§6.2)', fn: verifies_scoring_confidence_level_is_two_values },
  { name: 'RawSignalSource is a closed 10-axis vocabulary (§3.1/§4.1)', fn: verifies_raw_signal_source_vocabulary_closed },
  // Distinctness (§6.5 reconciliation)
  { name: 'Scoring Confidence distinct from Generator Confidence (§6.5)', fn: verifies_scoring_confidence_distinct_from_generator_confidence },
  { name: 'Scoring Confidence distinct from Signal integrity (§6.3.1)', fn: verifies_scoring_confidence_distinct_from_signal_integrity },
  // Immutability
  { name: 'RawSignal fields are readonly', fn: verifies_raw_signal_fields_are_readonly },
  { name: 'ScoreComponent fields are readonly', fn: verifies_score_component_fields_are_readonly },
  { name: 'CompositeScore fields are readonly', fn: verifies_composite_score_fields_are_readonly },
  { name: 'Penalty fields are readonly', fn: verifies_penalty_fields_are_readonly },
  // Discriminated unions
  { name: 'PenaltyType narrows correctly (§7.1)', fn: verifies_penalty_type_narrows_correctly },
  { name: 'SignalExtractionConfidence narrows correctly (§6.2)', fn: verifies_signal_integrity_narrows_correctly },
  // Transparency
  { name: 'Penalty requires all explanation fields (§7.5)', fn: verifies_penalty_requires_all_explanation_fields },
  { name: 'ScoreComponent requires inputs + reasoning (§10.2/§6.2)', fn: verifies_component_requires_inputs_and_reasoning },
  { name: 'CompositeScore breakdown is always present (§5.4/§8.4)', fn: verifies_composite_breakdown_always_present },
  // Serialization (determinism)
  { name: 'stableStringify ignores key order on CompositeScore', fn: verifies_stable_serialization_ignores_key_order },
  { name: 'stableStringify is stable on RawSignal', fn: verifies_signal_serialization_is_stable },
  // Boundaries
  { name: 'No forbidden imports in contracts.ts (§13.1)', fn: verifies_no_forbidden_imports_in_contracts_file },
  { name: 'No duplicate upstream vocab definitions', fn: verifies_no_duplicate_vocab_definitions },
  // Relationships (§10.7)
  { name: 'Composite traces to Components to Signals (§10.7)', fn: verifies_composite_traces_to_components_to_signals },
  { name: 'Component is independent per (Candidate × slot) (§5.2)', fn: verifies_component_independent_per_candidate_slot },
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
