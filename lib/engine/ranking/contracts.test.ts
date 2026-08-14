/**
 * lib/engine/ranking/contracts.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking — contract tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §5–§7, §9–§10.
 *
 * RUN: npx jiti lib/engine/ranking/contracts.test.ts
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
  CompositeScore,
  Penalty,
  RawSignal,
  ScoreComponent,
  ScoringConfidence,
} from '../scoring/contracts'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import type {
  CandidateRankingResult,
  OrderingKeyDescriptor,
  OrderingReason,
  RankedCandidate,
  RankedCandidateSet,
  RankedCandidateSetMeta,
  RankedSlot,
  RankingDiagnostic,
  RankingDiagnosticCategory,
  RankingSeverity,
  RankingStage,
  RankingWarning,
  TieBreakerSource,
  TieGroup,
  AxisProfile,
  CandidateProfile,
  SetCandidateProfiles,
  PreTieAxisProfile,
  PreTieCandidateProfile,
  PreTieSetCandidateProfiles,
} from './contracts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── helpers ────────────────────────────────────────────────────────────────

function mkSlot(overrides?: Partial<BlueprintSlot>): BlueprintSlot {
  return {
    setNumber: 1,
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    document: 'พ.ร.บ.ทดสอบ 2560',
    learningObjective: 'LO1',
    ...overrides,
  }
}

function mkSignal(overrides?: Partial<RawSignal>): RawSignal {
  return {
    questionCode: 'Q-000001',
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
    ...overrides,
  }
}

function mkConfidence(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function mkPenalty(overrides?: Partial<Penalty>): Penalty {
  return {
    type: 'soft',
    trigger: 'high usage load',
    evidence: 'usage_count signal',
    effect: 'reduces effective value by Soft demerit',
    appliedBy: 'ranking',
    ...overrides,
  }
}

function mkComponent(overrides?: Partial<ScoreComponent>): ScoreComponent {
  return {
    componentId: 'difficulty_fit',
    questionCode: 'Q-000001',
    slot: mkSlot(),
    normalized: { value: 0.9, scale: 'exact-match' },
    inputs: [mkSignal()],
    reasoning: 'Difficulty Fit = full match.',
    confidence: mkConfidence(),
    penalties: [],
    ...overrides,
  }
}

function mkComposite(overrides?: Partial<CompositeScore>): CompositeScore {
  const component = mkComponent()
  const contribution: ComponentContribution = {
    component,
    contribution: 0.15,
    reason: 'weight 0.15; full match',
  }
  return {
    questionCode: 'Q-000001',
    slot: mkSlot(),
    value: 0.82,
    breakdown: { contributions: [contribution], aggregationNote: 'weighted mean' },
    confidence: mkConfidence(),
    penalties: [],
    ...overrides,
  }
}

function mkCandidate(): Candidate {
  return {
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
      section: 'ม.6-8',
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
      eligibleSlots: [mkSlot()],
      coverageSatisfied: ['CR-1'],
      source: { kind: 'metadata_query', queryId: 'q1' },
    },
  }
}

function mkCandidateSet(): CandidateSet {
  return {
    identity: { assemblyRequestId: 'assembly-1', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: [mkCandidate()],
    slotIndex: { slots: new Map([['slot-1', ['Q-000001']]]) },
    shortfallReport: { entries: [] },
    coverageSatisfaction: {
      bindings: [{ document: 'พ.ร.บ.ทดสอบ 2560', topic: 'หลักการ', satisfyingCodes: ['Q-000001'] }],
    },
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

function mkOrderingReason(overrides?: Partial<OrderingReason>): OrderingReason {
  return {
    summary: 'Composite value and high confidence put this Candidate first.',
    determiningFacets: ['composite.value', 'confidence.level', 'penalties'],
    neighborComparison: {
      aboveCode: null,
      belowCode: 'Q-000002',
      explanation: 'No Candidate above; next Candidate has lower effective value.',
    },
    tieStatus: { tieGroupId: null, memberCodes: [], tieBreaker: null },
    ...overrides,
  }
}

function mkRankedCandidate(overrides?: Partial<RankedCandidate>): RankedCandidate {
  const composite = mkComposite()
  const confidence = composite.confidence
  const penalties = composite.penalties
  const signals = [mkSignal()]
  return {
    code: 'Q-000001',
    rank: 1,
    tieGroupId: null,
    composite,
    confidence,
    penalties,
    signals,
    orderingReason: mkOrderingReason(),
    auditTrail: {
      candidateCode: 'Q-000001',
      signals,
      componentIds: ['difficulty_fit'],
      composite,
      confidence,
      penalties,
      rank: 1,
    },
    ...overrides,
  }
}

function mkRankedSlot(overrides?: Partial<RankedSlot>): RankedSlot {
  return {
    slotId: 'slot-1',
    slot: mkSlot(),
    rankedCandidates: [mkRankedCandidate()],
    slotSummary: {
      tieGroups: [],
      topOfSlotRationale: 'Highest composite value with high confidence.',
      orderingKey: {
        facets: ['composite.value', 'confidence.level', 'penalties', 'tieBreaker'],
        description: 'Fixed inspectable ordering key.',
      },
    },
    ...overrides,
  }
}

function mkRankedCandidateSet(overrides?: Partial<RankedCandidateSet>): RankedCandidateSet {
  const candidateSet = mkCandidateSet()
  return {
    identity: {
      candidateSetId: candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet,
    slots: [mkRankedSlot()],
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    constraintSnapshot: candidateSet.constraintSnapshot,
    warnings: candidateSet.warnings,
    meta: {
      specVersion: '1.0',
      rankingVersion: '1.0.0',
      scoringModelVersion: '1.0',
    },
    ...overrides,
  }
}

// ═══ Vocabulary stability ═════════════════════════════════════════════════

function verifies_ranking_stage_vocab(): void {
  const stages: RankingStage[] = [
    'signal_extraction',
    'scoring',
    'confidence',
    'penalty_application',
    'ordering',
    'tie_resolution',
    'ranked_candidate_set_emission',
  ]
  assert.equal(stages.length, 7)
}

function verifies_ranking_severity_vocab(): void {
  const severities: RankingSeverity[] = ['Fatal', 'Non-fatal']
  assert.equal(severities.length, 2)
}

function verifies_diagnostic_categories_match_failure_modes(): void {
  const categories: RankingDiagnosticCategory[] = [
    'missing_score',
    'missing_confidence',
    'unknown_score',
    'incomplete_candidate',
    'version_mismatch',
    'conflicting_metadata',
    'tie_overflow',
    'ordering_inconsistency',
  ]
  assert.equal(categories.length, 8)
}

function verifies_tie_breaker_sources_are_permitted_sources_only(): void {
  const sources: TieBreakerSource[] = [
    'stable_identity',
    'deterministic_metadata',
    'scoring_model_derived_sub_facet',
  ]
  assert.equal(sources.length, 3)
}

function verifies_meta_spec_version_is_constant(): void {
  const meta: RankedCandidateSetMeta = {
    specVersion: '1.0',
    rankingVersion: '1.0.0',
    scoringModelVersion: '1.0',
  }
  assert.equal(meta.specVersion, '1.0')
  assert.equal(meta.scoringModelVersion, '1.0')
}

// ═══ Immutability (readonly compile-time check) ═══════════════════════════

function verifies_ranked_candidate_fields_are_readonly(): void {
  const ranked = mkRankedCandidate()
  // @ts-expect-error — rank is readonly
  ranked.rank = 2
  // @ts-expect-error — composite is readonly and imported from Scoring
  ranked.composite = mkComposite({ value: 0.1 })
  assert.ok(true, 'readonly type errors confirmed')
}

function verifies_ranked_candidate_set_fields_are_readonly(): void {
  const rcs = mkRankedCandidateSet()
  // @ts-expect-error — slots is readonly
  rcs.slots = []
  // @ts-expect-error — meta.specVersion is readonly
  rcs.meta.specVersion = '2.0'
  assert.ok(rcs.identity.candidateSetId.length > 0)
}

function verifies_ordering_key_fields_are_readonly(): void {
  const key: OrderingKeyDescriptor = {
    facets: ['composite.value'],
    description: 'fixed key',
  }
  // @ts-expect-error — facets is readonly
  key.facets = []
  assert.ok(key.description.length > 0)
}

// ═══ Scoring and Generator contract reuse ═════════════════════════════════

function verifies_ranked_candidate_reuses_scoring_contracts(): void {
  const composite = mkComposite({
    penalties: [mkPenalty()],
  })
  const ranked = mkRankedCandidate({
    composite,
    confidence: composite.confidence,
    penalties: composite.penalties,
  })
  assert.equal(ranked.composite.breakdown.contributions[0].component.componentId, 'difficulty_fit')
  assert.equal(ranked.confidence, composite.confidence)
  assert.equal(ranked.penalties, composite.penalties)
}

function verifies_ranked_candidate_set_carries_forward_generator_fields(): void {
  const candidateSet = mkCandidateSet()
  const generatorWarning: GeneratorWarning = {
    severity: 'Warning',
    axis: 'difficulty',
    explanation: 'Thin headroom',
    recommendation: 'Add more Questions',
  }
  const rcs = mkRankedCandidateSet({
    candidateSet: { ...candidateSet, warnings: [generatorWarning] },
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    constraintSnapshot: candidateSet.constraintSnapshot,
    warnings: [generatorWarning],
  })
  assert.equal(rcs.shortfallReport, candidateSet.shortfallReport)
  assert.equal(rcs.coverageSatisfaction, candidateSet.coverageSatisfaction)
  assert.equal(rcs.constraintSnapshot, candidateSet.constraintSnapshot)
  assert.equal(rcs.warnings[0], generatorWarning)
}

function verifies_ranking_warning_is_nonfatal_only(): void {
  const warning: RankingWarning = {
    severity: 'Non-fatal',
    category: 'conflicting_metadata',
    stage: 'signal_extraction',
    slotId: 'slot-1',
    code: 'Q-000001',
    explanation: 'Document-implied Tier conflicts with tag-implied Tier.',
    recommendation: 'Review Candidate metadata.',
  }
  assert.equal(warning.severity, 'Non-fatal')
}

// ═══ Tie visibility and transparency ══════════════════════════════════════

function verifies_tie_group_is_visible_and_resolved(): void {
  const group: TieGroup = {
    tieGroupId: 'tie-slot-1-001',
    memberCodes: ['Q-000001', 'Q-000002'],
    resolvedOrder: ['Q-000001', 'Q-000002'],
    tieBreaker: {
      source: 'stable_identity',
      key: 'questionCode',
      reason: 'Question Code is the final deterministic fallback.',
    },
  }
  assert.deepEqual(group.memberCodes, group.resolvedOrder)
}

function verifies_ordering_reason_carries_required_transparency(): void {
  const reason = mkOrderingReason({
    tieStatus: {
      tieGroupId: 'tie-slot-1-001',
      memberCodes: ['Q-000001', 'Q-000002'],
      tieBreaker: {
        source: 'stable_identity',
        key: 'questionCode',
        reason: 'Question Code fallback.',
      },
    },
  })
  assert.ok(reason.summary.length > 0)
  assert.ok(reason.determiningFacets.includes('composite.value'))
  assert.equal(reason.tieStatus.memberCodes.length, 2)
}

function verifies_audit_trail_links_candidate_to_rank(): void {
  const ranked = mkRankedCandidate()
  assert.equal(ranked.auditTrail.candidateCode, ranked.code)
  assert.equal(ranked.auditTrail.composite, ranked.composite)
  assert.equal(ranked.auditTrail.confidence, ranked.confidence)
  assert.equal(ranked.auditTrail.rank, ranked.rank)
  assert.equal(ranked.auditTrail.signals[0].source, 'difficulty')
}

// ═══ Result and diagnostics ═══════════════════════════════════════════════

function verifies_candidate_ranking_result_discriminates_on_ok(): void {
  const success: CandidateRankingResult = {
    ok: true,
    rankedCandidateSet: mkRankedCandidateSet(),
  }
  const failure: CandidateRankingResult = {
    ok: false,
    fatalDiagnostics: [
      {
        category: 'tie_overflow',
        severity: 'Fatal',
        stage: 'tie_resolution',
        slotId: 'slot-1',
        code: null,
        componentId: null,
        explanation: 'Tie group exceeded the configured overflow threshold.',
        recommendation: 'Inspect CandidateSet degeneracy and scoring evidence.',
      },
    ],
  }
  if (success.ok) {
    assert.ok(success.rankedCandidateSet.slots.length > 0)
  }
  if (!failure.ok) {
    assert.equal(failure.fatalDiagnostics[0].severity, 'Fatal')
  }
}

function verifies_diagnostic_carries_full_anatomy(): void {
  const diagnostic: RankingDiagnostic = {
    category: 'missing_score',
    severity: 'Fatal',
    stage: 'scoring',
    slotId: 'slot-1',
    code: 'Q-000001',
    componentId: 'pattern_fit',
    explanation: 'Pattern Fit component could not be computed.',
    recommendation: 'Verify IG-2 pattern metadata is present or propagate reduced Confidence.',
  }
  assert.ok(diagnostic.explanation.length > 0)
  assert.ok(diagnostic.recommendation.length > 0)
}

// ═══ Serialization and boundaries ═════════════════════════════════════════

function verifies_ranked_candidate_set_serializes_deterministically(): void {
  const rcs = mkRankedCandidateSet()
  assert.equal(stableStringify(rcs), stableStringify(rcs))
}

function verifies_stable_serialization_ignores_key_order(): void {
  const a = mkRankedCandidateSet()
  const b: RankedCandidateSet = {
    warnings: a.warnings,
    meta: a.meta,
    coverageSatisfaction: a.coverageSatisfaction,
    constraintSnapshot: a.constraintSnapshot,
    shortfallReport: a.shortfallReport,
    slots: a.slots,
    candidateSet: a.candidateSet,
    identity: a.identity,
  }
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_contract_file_has_no_forbidden_imports(): void {
  const source = readFileSync(path.join(__dirname, 'contracts.ts'), 'utf8')
  const forbidden = [
    'react',
    '@supabase',
    'next/',
    'Math.random',
    'Date.now',
    'fetch(',
    'from \'fs\'',
    'from "fs"',
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `contracts.ts must not contain ${token}`)
  }
}

function verifies_no_duplicate_scoring_contracts_are_defined(): void {
  const source = readFileSync(path.join(__dirname, 'contracts.ts'), 'utf8')
  const forbiddenDeclarations = [
    'interface CompositeScore',
    'interface ScoringConfidence',
    'interface Penalty',
    'interface RawSignal',
    'type ComponentId',
  ]
  for (const declaration of forbiddenDeclarations) {
    assert.ok(!source.includes(declaration), `Ranking must import, not redefine: ${declaration}`)
  }
}

function verifies_no_ranking_logic_keywords(): void {
  const source = readFileSync(path.join(__dirname, 'contracts.ts'), 'utf8')
  const forbidden = ['sort(', '.sort(', 'compare(', 'function rank', 'function score']
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `contracts.ts must not implement or reference logic token: ${token}`)
  }
}

function verifies_pretie_profile_contracts(): void {
  // 1. PreTieAxisProfile contains NO rank field and maps to composite score
  const composite = mkComposite()
  const preTieAxis: PreTieAxisProfile = {
    slotId: 'slot-1',
    slot: mkSlot(),
    compositeScore: composite,
  }
  assert.equal(preTieAxis.slotId, 'slot-1')
  assert.equal(preTieAxis.compositeScore, composite)
  // @ts-expect-error — PreTieAxisProfile has no rank
  preTieAxis.rank = 1

  // 2. PreTieCandidateProfile preserves questionCode, candidate reference, and suitabilityProfiles shape
  const candidate = mkCandidate()
  const preTieCandidate: PreTieCandidateProfile = {
    questionCode: 'Q-000001',
    candidate,
    suitabilityProfiles: [preTieAxis],
  }
  assert.equal(preTieCandidate.questionCode, 'Q-000001')
  assert.equal(preTieCandidate.candidate, candidate)
  assert.equal(preTieCandidate.suitabilityProfiles[0], preTieAxis)

  // 3. Empty suitabilityProfiles is valid
  const emptyPreTieCandidate: PreTieCandidateProfile = {
    questionCode: 'Q-000002',
    candidate,
    suitabilityProfiles: [],
  }
  assert.equal(emptyPreTieCandidate.suitabilityProfiles.length, 0)

  // 4. PreTieSetCandidateProfiles preserves setNumber and profiles array
  const preTieSet: PreTieSetCandidateProfiles = {
    setNumber: 1,
    profiles: [preTieCandidate],
  }
  assert.equal(preTieSet.setNumber, 1)
  assert.equal(preTieSet.profiles[0], preTieCandidate)

  // 5. Existing AxisProfile still requires/contains a legitimate rank
  const postTieAxis: AxisProfile = {
    slotId: 'slot-1',
    slot: mkSlot(),
    rank: 3,
    compositeScore: composite,
  }
  assert.equal(postTieAxis.rank, 3)

  // 6. Existing CandidateProfile & SetCandidateProfiles behavior is unchanged
  const postTieCandidate: CandidateProfile = {
    questionCode: 'Q-000001',
    candidate,
    suitabilityProfiles: [postTieAxis],
  }
  const postTieSet: SetCandidateProfiles = {
    setNumber: 1,
    profiles: [postTieCandidate],
  }
  assert.equal(postTieSet.profiles[0].suitabilityProfiles[0].rank, 3)
}


// ═══ runner ═══════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'RankingStage has exactly 7 runtime stages (§2.1)', fn: verifies_ranking_stage_vocab },
  { name: 'RankingSeverity has Fatal and Non-fatal (§10.1)', fn: verifies_ranking_severity_vocab },
  { name: 'Diagnostic categories match §10.1 failure modes', fn: verifies_diagnostic_categories_match_failure_modes },
  { name: 'TieBreakerSource has only permitted §6.3 sources', fn: verifies_tie_breaker_sources_are_permitted_sources_only },
  { name: "RankedCandidateSet meta pins spec/scoring version '1.0'", fn: verifies_meta_spec_version_is_constant },
  { name: 'RankedCandidate fields are readonly', fn: verifies_ranked_candidate_fields_are_readonly },
  { name: 'RankedCandidateSet fields are readonly', fn: verifies_ranked_candidate_set_fields_are_readonly },
  { name: 'OrderingKeyDescriptor fields are readonly', fn: verifies_ordering_key_fields_are_readonly },
  { name: 'RankedCandidate reuses Scoring contracts', fn: verifies_ranked_candidate_reuses_scoring_contracts },
  { name: 'RankedCandidateSet carries forward Generator fields unchanged', fn: verifies_ranked_candidate_set_carries_forward_generator_fields },
  { name: 'RankingWarning severity is Non-fatal only', fn: verifies_ranking_warning_is_nonfatal_only },
  { name: 'TieGroup is visible and resolved (§6.2/§6.4)', fn: verifies_tie_group_is_visible_and_resolved },
  { name: 'OrderingReason carries required transparency (§5.6/§9.2)', fn: verifies_ordering_reason_carries_required_transparency },
  { name: 'Audit trail links Candidate to Signals/Score/Rank (§9.3)', fn: verifies_audit_trail_links_candidate_to_rank },
  { name: 'CandidateRankingResult discriminates on ok', fn: verifies_candidate_ranking_result_discriminates_on_ok },
  { name: 'RankingDiagnostic carries full anatomy (§10.4)', fn: verifies_diagnostic_carries_full_anatomy },
  { name: 'RankedCandidateSet serializes deterministically', fn: verifies_ranked_candidate_set_serializes_deterministically },
  { name: 'stableStringify ignores key order on RankedCandidateSet', fn: verifies_stable_serialization_ignores_key_order },
  { name: 'No forbidden imports or side-effect APIs in contracts.ts', fn: verifies_contract_file_has_no_forbidden_imports },
  { name: 'No duplicate Scoring contracts are defined', fn: verifies_no_duplicate_scoring_contracts_are_defined },
  { name: 'No ranking/scoring/solver logic keywords in contracts.ts', fn: verifies_no_ranking_logic_keywords },
  { name: 'Pre-tie candidate profile contracts compile and preserve invariants', fn: verifies_pretie_profile_contracts },
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
