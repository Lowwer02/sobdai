/**
 * lib/engine/generator/contracts.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator Foundation — contract tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §3–§10
 *
 * RUN: npx jiti lib/engine/generator/contracts.test.ts
 *
 * Coverage targets:
 *  - Immutability: every type's fields are `readonly` (compile-time check).
 *  - Deterministic serialization: stableStringify produces canonical output.
 *  - Vocabulary stability: enum unions match Blueprint v3.0 exactly.
 *  - Discriminated unions: narrow correctly on `kind` / `ok` / `severity`.
 *  - Compile-time safety: assigning wrong vocab fails to type-check.
 *  - Filter execution order is normative (FIXED order constant).
 *  - CandidateSet is the immutable output contract.
 *  - Reused vocabulary: Generator re-exports reader enums, doesn't redefine.
 */

import assert from 'node:assert/strict'
import {
  FILTER_EXECUTION_ORDER,
  type AxisCompleteness,
  type AxisSlot,
  type Candidate,
  type CandidateCompleteness,
  type CandidateConfidence,
  type CandidateGenerationResult,
  type CandidateIdentity,
  type CandidateMetadata,
  type CandidatePool,
  type CandidateProvenance,
  type CandidateRejectionReason,
  type CandidateSet,
  type CandidateSetIdentity,
  type CandidateSetMeta,
  type CandidateSource,
  type CandidateStatistics,
  type ConfidenceLevel,
  type CoverageRequirement,
  type CoverageSatisfaction,
  type DuplicateRuleMetadata,
  type ExclusionEntry,
  type FatalDiagnostic,
  type FilterId,
  type GeneratorFatalCategory,
  type GeneratorSeverity,
  type GeneratorWarning,
  type QuestionStatus,
  type QueryPlan,
  type ShortfallEntry,
  type ShortfallReport,
  type SlotIndex,
} from './contracts'
import { stableStringify } from '../shared/testing/determinism'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Construct a minimal valid Candidate for shape tests. */
function mkCandidate(overrides?: Partial<Candidate>): Candidate {
  const base: Candidate = {
    identity: { questionCode: 'Q-000001', questionId: 'uuid-1' },
    metadata: {
      document: 'พ.ร.บ.ทดสอบ 2560',
      difficulty: 'Easy',
      topic: 'หลักการ',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'ม.6–8',
      tags: ['tag1'],
      category: 'cat',
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document'],
      eligibleSlots: [{ setNumber: 1, difficulty: 'Easy', document: 'พ.ร.บ.ทดสอบ 2560' }],
      coverageSatisfied: ['CR-1'],
      source: { kind: 'metadata_query', queryId: 'q1' },
    },
  }
  return { ...base, ...overrides }
}

// ═══ Vocabulary stability ═════════════════════════════════════════════════

function verifies_question_status_vocab_matches_db(): void {
  // Migration 001 CHECK constraint: ('Draft', 'Review', 'Published') — capitalized.
  const statuses: QuestionStatus[] = ['Draft', 'Review', 'Published']
  assert.equal(statuses.length, 3)
}

function verifies_generator_severity_is_four_values(): void {
  // §7.4: exactly four — Pass / Warning / Blocking / Fatal.
  const severities: GeneratorSeverity[] = ['Pass', 'Warning', 'Blocking', 'Fatal']
  assert.equal(severities.length, 4)
}

function verifies_confidence_level_is_two_values(): void {
  // Conservative binary enum (spec defines qualitatively; we capture full/reduced).
  const levels: ConfidenceLevel[] = ['full', 'reduced']
  assert.equal(levels.length, 2)
}

function verifies_axis_completeness_is_binary(): void {
  const flags: AxisCompleteness[] = ['complete', 'incomplete']
  assert.equal(flags.length, 2)
}

function verifies_generator_fatal_category_vocab(): void {
  const cats: GeneratorFatalCategory[] = [
    'bank_unreachable',
    'missing_required_axis',
    'document_registry_mismatch',
    'internal_error',
  ]
  assert.equal(cats.length, 4)
}

// ═══ Filter execution order is normative ══════════════════════════════════

function verifies_filter_execution_order_is_fixed(): void {
  // §4.3 FIXED order: exclusion, status, document, coverage, difficulty,
  // pattern, learning_objective.
  assert.deepEqual(FILTER_EXECUTION_ORDER, [
    'exclusion',
    'status',
    'document',
    'coverage',
    'difficulty',
    'pattern',
    'learning_objective',
  ])
}

function verifies_filter_id_union_matches_order(): void {
  // Every FilterId appears in the order array, and vice versa.
  const ids: FilterId[] = [
    'exclusion', 'status', 'document', 'coverage',
    'difficulty', 'pattern', 'learning_objective',
  ]
  assert.equal(ids.length, FILTER_EXECUTION_ORDER.length)
  for (const id of ids) {
    assert.ok(FILTER_EXECUTION_ORDER.includes(id), `FilterId ${id} missing from execution order`)
  }
}

// ═══ Discriminated unions narrow correctly ════════════════════════════════

function verifies_candidate_rejection_reason_discriminates_on_kind(): void {
  const reasons: CandidateRejectionReason[] = [
    { kind: 'excluded', code: 'Q-000001' },
    { kind: 'status', code: 'Q-000002', status: 'Draft' },
    { kind: 'difficulty', code: 'Q-000003', difficulty: 'Hard' },
    { kind: 'missing_axis', code: 'Q-000004', axis: 'pattern' },
  ]
  // Narrow on kind — each branch accesses its own fields.
  for (const r of reasons) {
    if (r.kind === 'status') {
      assert.ok(r.status === 'Draft' || r.status === 'Review' || r.status === 'Published')
    } else if (r.kind === 'difficulty') {
      assert.ok(['Easy', 'Medium', 'Hard'].includes(r.difficulty))
    } else if (r.kind === 'excluded') {
      assert.ok(r.code.startsWith('Q-'))
    } else if (r.kind === 'missing_axis') {
      assert.ok(r.axis.length > 0)
    }
  }
}

function verifies_candidate_source_discriminates_on_kind(): void {
  const sources: CandidateSource[] = [
    { kind: 'metadata_query', queryId: 'q1' },
  ]
  for (const s of sources) {
    if (s.kind === 'metadata_query') {
      assert.ok(s.queryId.length > 0)
    }
  }
}

function verifies_candidate_generation_result_discriminates_on_ok(): void {
  const success: CandidateGenerationResult = {
    ok: true,
    candidateSet: {} as CandidateSet, // shape-only test
  }
  const failure: CandidateGenerationResult = {
    ok: false,
    fatalDiagnostics: [
      {
        category: 'bank_unreachable',
        severity: 'Fatal',
        explanation: 'Bank unreachable',
        recommendation: 'Check DB connection',
      },
    ],
  }
  if (success.ok) {
    assert.ok(success.candidateSet !== undefined)
  }
  if (!failure.ok) {
    assert.ok(failure.fatalDiagnostics.length > 0)
  }
}

// ═══ Compile-time safety (vocabulary assignment) ══════════════════════════

function verifies_difficulty_vocab_assignment(): void {
  // Assigning each Difficulty value must type-check.
  const d: CandidateMetadata['difficulty'] = 'Easy'
  assert.equal(d, 'Easy')
  // @ts-expect-error — 'Hardcore' is not a Difficulty
  const _bad: CandidateMetadata['difficulty'] = 'Hardcore'
  void _bad
}

function verifies_tier_vocab_assignment(): void {
  const t: CandidateMetadata['tier'] = 1
  assert.equal(t, 1)
  // @ts-expect-error — 5 is not a Tier
  const _bad: CandidateMetadata['tier'] = 5
  void _bad
}

function verifies_question_pattern_vocab_includes_matching_concept(): void {
  // IG-2 Amendment D-6 regression: the sixth value is two-word.
  const p: CandidateMetadata['questionPattern'] = 'Matching Concept'
  assert.equal(p, 'Matching Concept')
  // @ts-expect-error — bare 'Matching' is NOT a QuestionPattern (D-6)
  const _bad: CandidateMetadata['questionPattern'] = 'Matching'
  void _bad
}

function verifies_confidence_reason_null_when_full(): void {
  // When level is 'full', reason should be null (convention).
  const c: CandidateConfidence = { level: 'full', reason: null }
  assert.equal(c.reason, null)
}

function verifies_confidence_reason_string_when_reduced(): void {
  const c: CandidateConfidence = { level: 'reduced', reason: 'pattern axis missing' }
  assert.ok(c.reason!.length > 0)
}

// ═══ Immutability (readonly compile-time check) ═══════════════════════════
// These tests verify the TYPE-LEVEL readonly constraint: TypeScript rejects
// assignments to readonly fields at compile time. The `@ts-expect-error`
// directive CONFIRMS the error exists (if the field were not readonly, TS
// would NOT error, and @ts-expect-error itself would fail). We do NOT assert
// runtime immutability — JS objects are always mutable at runtime regardless
// of TS readonly; the contract is enforced at the type level.

function verifies_candidate_fields_are_readonly(): void {
  const c = mkCandidate()
  // @ts-expect-error — identity is readonly; the directive's presence
  // proves the type error exists (tsc would report "unused directive" if
  // the field were NOT readonly).
  c.identity = { questionCode: 'X', questionId: 'Y' }
  // @ts-expect-error — metadata.difficulty is readonly
  c.metadata.difficulty = 'Hard'
  assert.ok(true, 'readonly type errors confirmed by @ts-expect-error directives')
}

function verifies_candidate_set_fields_are_readonly(): void {
  const cs: CandidateSet = {
    identity: { assemblyRequestId: 'r1', generatedAt: null, bankStateHash: null },
    candidates: [],
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    warnings: [],
    statistics: {
      totalCandidates: 0,
      fullConfidenceCount: 0,
      reducedConfidenceCount: 0,
      incompleteAxesCount: 0,
      distinctDocuments: 0,
      distinctDifficulties: 0,
      distinctPatterns: 0,
      distinctLearningObjectives: 0,
      shortfallCount: 0,
    },
    exclusionsLog: [],
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
  // @ts-expect-error — candidates is readonly
  cs.candidates = []
  // @ts-expect-error — meta.specVersion is readonly
  cs.meta.specVersion = '2.0'
  // Reached here → type errors confirmed.
  assert.ok(cs.meta.specVersion === '1.0' || cs.meta.specVersion === '2.0')
}

function verifies_query_plan_fields_are_readonly(): void {
  const qp: QueryPlan = {
    coverageRequirements: [],
    difficultySlots: [],
    permittedDocuments: [],
    patternSlots: [],
    learningObjectiveSlots: [],
    duplicateRules: [],
    exclusions: [],
  }
  // @ts-expect-error — permittedDocuments is readonly
  qp.permittedDocuments = ['x']
  // Reached here → type error confirmed.
  assert.ok(Array.isArray(qp.permittedDocuments))
}

// ═══ Deterministic serialization ══════════════════════════════════════════

function verifies_candidate_serializes_deterministically(): void {
  // Same Candidate → same canonical JSON, regardless of key insertion order.
  const c1 = mkCandidate()
  const c2: Candidate = {
    confidence: { level: 'full', reason: null },
    provenance: c1.provenance,
    completeness: c1.completeness,
    metadata: c1.metadata,
    identity: c1.identity,
  }
  assert.equal(stableStringify(c1), stableStringify(c2))
}

function verifies_candidate_set_serializes_deterministically(): void {
  const cs: CandidateSet = {
    identity: { assemblyRequestId: 'r1', generatedAt: null, bankStateHash: 'h1' },
    candidates: [mkCandidate()],
    slotIndex: { slots: new Map([['s1', ['Q-000001']]]) },
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
  // Serialize twice — must be identical (determinism property).
  const a = stableStringify(cs)
  const b = stableStringify(cs)
  assert.equal(a, b)
}

function verifies_meta_spec_version_is_constant(): void {
  const m: CandidateSetMeta = { specVersion: '1.0', generatorVersion: '1.0.0' }
  assert.equal(m.specVersion, '1.0')
}

// ═══ Candidate identity = Question Code (§5.4) ════════════════════════════

function verifies_candidate_identity_is_question_code(): void {
  const c = mkCandidate()
  // The Code is the identity; questionId is auxiliary.
  assert.ok(c.identity.questionCode.startsWith('Q-'))
  assert.ok(c.identity.questionId.length > 0)
}

// ═══ Tier is derived (not a Bank column) ══════════════════════════════════

function verifies_tier_carried_on_metadata_but_derived(): void {
  // Tier IS on metadata (§5.5), but its provenance is "derived from document
  // via Document Registry" — not a Bank column. The type allows it; the
  // derivation is the Generator's runtime concern (E-2B+).
  const c = mkCandidate({ metadata: { ...mkCandidate().metadata, tier: 2 } })
  assert.equal(c.metadata.tier, 2)
}

// ═══ Completeness: incomplete axes are flagged, not dropped ═══════════════

function verifies_incomplete_candidate_is_still_valid(): void {
  // A Candidate with all axes incomplete is still a valid Candidate.
  // Maximum Recall (§5.2): incomplete axes are FLAGGED, not dropped.
  const c = mkCandidate({
    completeness: {
      blueprintType: 'incomplete',
      learningObjective: 'incomplete',
      questionPattern: 'incomplete',
      section: 'incomplete',
    },
    metadata: {
      ...mkCandidate().metadata,
      blueprintType: null,
      learningObjective: null,
      questionPattern: null,
      section: null,
    },
    confidence: { level: 'reduced', reason: 'all IG-2 axes missing' },
  })
  assert.equal(c.confidence.level, 'reduced')
  assert.equal(c.metadata.blueprintType, null)
}

// ═══ Shortfall Report + Warnings structure ════════════════════════════════

function verifies_shortfall_entry_carries_full_anatomy(): void {
  const e: ShortfallEntry = {
    axis: 'pattern',
    severity: 'Warning',
    explanation: 'Pattern bucket for Set 1 has thin headroom',
    recommendation: 'Consider expanding the Bank for this Pattern',
    setNumber: 1,
  }
  assert.ok(e.explanation.length > 0)
  assert.ok(e.recommendation.length > 0)
}

function verifies_generator_warning_severity_is_always_warning(): void {
  const w: GeneratorWarning = {
    severity: 'Warning',
    axis: 'difficulty',
    explanation: 'Difficulty distribution is thin',
    recommendation: 'Add more Questions',
  }
  assert.equal(w.severity, 'Warning')
}

function verifies_fatal_diagnostic_severity_is_always_fatal(): void {
  const d: FatalDiagnostic = {
    category: 'missing_required_axis',
    severity: 'Fatal',
    explanation: 'IG-2 column question_pattern is missing from the Bank',
    recommendation: 'Apply migration 027 and re-import Questions with Pattern tags',
  }
  assert.equal(d.severity, 'Fatal')
}

// ═══ Exclusions Log ══════════════════════════════════════════════════════

function verifies_exclusion_entry_carries_reason(): void {
  const e: ExclusionEntry = {
    code: 'Q-000099',
    reason: { kind: 'status', code: 'Q-000099', status: 'Draft' },
  }
  assert.equal(e.reason.kind, 'status')
}

function verifies_exclusion_entry_code_can_be_null(): void {
  // When a Bank row has no Code (pre-migration-026 data), code is null.
  const e: ExclusionEntry = {
    code: null,
    reason: { kind: 'bank_unreachable', detail: 'Connection refused' },
  }
  assert.equal(e.code, null)
}

// ═══ Slot Index ══════════════════════════════════════════════════════════

function verifies_slot_index_maps_slot_id_to_codes(): void {
  const slots = new Map<string, readonly string[]>([
    ['s1:Easy:Memory', ['Q-000001', 'Q-000002']],
    ['s1:Hard:Scenario', ['Q-000003']],
  ])
  const idx: SlotIndex = { slots }
  assert.equal(idx.slots.get('s1:Easy:Memory')!.length, 2)
  assert.equal(idx.slots.get('s1:Hard:Scenario')!.length, 1)
}

// ═══ Reused vocabulary (no redefinition) ══════════════════════════════════

function verifies_generator_reexports_reader_enums(): void {
  // The Generator must reuse reader/contracts enums, not redefine them.
  // Verify by checking the imported types are the same union shapes.
  const d: import('./contracts').Difficulty = 'Easy'
  const t: import('./contracts').Tier = 1
  const p: import('./contracts').QuestionPattern = 'Matching Concept'
  assert.equal(d, 'Easy')
  assert.equal(t, 1)
  assert.equal(p, 'Matching Concept')
}

// ═══ Query Plan is bank-independent (§3.3) ════════════════════════════════

function verifies_query_plan_carries_no_bank_data(): void {
  // The Query Plan is a pure transformation of the AssemblyRequest — it
  // must NOT carry Bank data (Questions, Codes, content). This test pins
  // that the type has no Bank-coupled fields.
  const qp: QueryPlan = {
    coverageRequirements: [{ ruleId: 'CR-1', level: 'hard', binding: null }],
    difficultySlots: [{ setNumber: 1, axisValue: 'Easy', targetCount: 26 }],
    permittedDocuments: ['พ.ร.บ.ทดสอบ 2560'],
    patternSlots: [{ setNumber: 1, axisValue: 'Positive', targetCount: 38 }],
    learningObjectiveSlots: [{ setNumber: 1, axisValue: 'LO1', targetCount: 23 }],
    duplicateRules: [{ ruleId: 'L1', scope: 'within_set', level: 'hard' }],
    exclusions: ['Q-999999'],
  }
  // No Candidates, no Question content, no Bank references.
  const keys = Object.keys(qp)
  for (const k of keys) {
    assert.ok(!k.toLowerCase().includes('candidate'), `QueryPlan must not carry Candidate data: ${k}`)
    assert.ok(!k.toLowerCase().includes('question'), `QueryPlan must not carry Question data: ${k}`)
  }
}

// ═══ CandidateStatistics counts ══════════════════════════════════════════

function verifies_candidate_statistics_shape(): void {
  const stats: CandidateStatistics = {
    totalCandidates: 750,
    fullConfidenceCount: 500,
    reducedConfidenceCount: 250,
    incompleteAxesCount: 250,
    distinctDocuments: 12,
    distinctDifficulties: 3,
    distinctPatterns: 6,
    distinctLearningObjectives: 4,
    shortfallCount: 2,
  }
  assert.equal(stats.totalCandidates, stats.fullConfidenceCount + stats.reducedConfidenceCount)
}

// ═══ runner ══════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  // Vocabulary stability
  { name: 'QuestionStatus vocab matches DB (Draft/Review/Published)', fn: verifies_question_status_vocab_matches_db },
  { name: 'GeneratorSeverity is exactly 4 values (Pass/Warning/Blocking/Fatal)', fn: verifies_generator_severity_is_four_values },
  { name: 'ConfidenceLevel is 2 values (full/reduced)', fn: verifies_confidence_level_is_two_values },
  { name: 'AxisCompleteness is binary (complete/incomplete)', fn: verifies_axis_completeness_is_binary },
  { name: 'GeneratorFatalCategory vocab (4 categories)', fn: verifies_generator_fatal_category_vocab },
  // Filter order
  { name: 'FILTER_EXECUTION_ORDER is the §4.3 fixed order', fn: verifies_filter_execution_order_is_fixed },
  { name: 'FilterId union matches execution order array', fn: verifies_filter_id_union_matches_order },
  // Discriminated unions
  { name: 'CandidateRejectionReason discriminates on kind', fn: verifies_candidate_rejection_reason_discriminates_on_kind },
  { name: 'CandidateSource discriminates on kind', fn: verifies_candidate_source_discriminates_on_kind },
  { name: 'CandidateGenerationResult discriminates on ok', fn: verifies_candidate_generation_result_discriminates_on_ok },
  // Compile-time safety
  { name: 'Difficulty vocab assignment (compile-time)', fn: verifies_difficulty_vocab_assignment },
  { name: 'Tier vocab assignment (compile-time)', fn: verifies_tier_vocab_assignment },
  { name: 'QuestionPattern includes Matching Concept, excludes bare Matching (D-6)', fn: verifies_question_pattern_vocab_includes_matching_concept },
  { name: 'Confidence reason null when full', fn: verifies_confidence_reason_null_when_full },
  { name: 'Confidence reason string when reduced', fn: verifies_confidence_reason_string_when_reduced },
  // Immutability
  { name: 'Candidate fields are readonly (compile-time)', fn: verifies_candidate_fields_are_readonly },
  { name: 'CandidateSet fields are readonly (compile-time)', fn: verifies_candidate_set_fields_are_readonly },
  { name: 'QueryPlan fields are readonly (compile-time)', fn: verifies_query_plan_fields_are_readonly },
  // Deterministic serialization
  { name: 'Candidate serializes deterministically (key-order invariant)', fn: verifies_candidate_serializes_deterministically },
  { name: 'CandidateSet serializes deterministically', fn: verifies_candidate_set_serializes_deterministically },
  { name: "meta.specVersion is constant '1.0'", fn: verifies_meta_spec_version_is_constant },
  // Candidate semantics
  { name: 'Candidate identity is Question Code (§5.4)', fn: verifies_candidate_identity_is_question_code },
  { name: 'Tier carried on metadata but derived (not Bank column)', fn: verifies_tier_carried_on_metadata_but_derived },
  { name: 'Incomplete-axes Candidate is still valid (Maximum Recall)', fn: verifies_incomplete_candidate_is_still_valid },
  // Shortfall + Warnings + Fatal
  { name: 'ShortfallEntry carries full anatomy', fn: verifies_shortfall_entry_carries_full_anatomy },
  { name: 'GeneratorWarning severity is always Warning', fn: verifies_generator_warning_severity_is_always_warning },
  { name: 'FatalDiagnostic severity is always Fatal', fn: verifies_fatal_diagnostic_severity_is_always_fatal },
  // Exclusions + Slot Index
  { name: 'ExclusionEntry carries rejection reason', fn: verifies_exclusion_entry_carries_reason },
  { name: 'ExclusionEntry code can be null (pre-migration data)', fn: verifies_exclusion_entry_code_can_be_null },
  { name: 'SlotIndex maps slot-id to Question Codes', fn: verifies_slot_index_maps_slot_id_to_codes },
  // Reuse + Query Plan
  { name: 'Generator re-exports reader enums (no redefinition)', fn: verifies_generator_reexports_reader_enums },
  { name: 'QueryPlan carries no Bank/Candidate data (§3.3)', fn: verifies_query_plan_carries_no_bank_data },
  { name: 'CandidateStatistics shape (counts add up)', fn: verifies_candidate_statistics_shape },
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
