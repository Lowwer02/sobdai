/**
 * lib/engine/scoring/signals.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.1 — Signal Extraction tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.1, §2.3, §3.
 *   - Scoring Model Specification v1.0 §6, §10.1, §11.2, §12.2.
 *
 * RUN: npx jiti lib/engine/scoring/signals.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { Candidate, CandidateSet } from '../generator/contracts'
import type { RawSignalSource } from './contracts'
import {
  RAW_SIGNAL_SOURCE_ORDER,
  extractSignals,
} from './signals'
import { assertOrderInvariant, stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'

// ─── helpers ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  readonly confidenceLevel?: 'full' | 'reduced'
  readonly confidenceReason?: string | null
} = {}): Candidate {
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
      questionCode: overrides.questionCode ?? 'Q-000001',
      questionId: overrides.questionCode ?? 'Q-000001',
    },
    metadata: {
      document: overrides.document ?? 'LAW-ACT-HED-2562',
      difficulty: overrides.difficulty ?? 'Easy',
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
      eligibleSlots: [
        {
          setNumber: 1,
          difficulty: overrides.difficulty ?? 'Easy',
          document: overrides.document ?? 'LAW-ACT-HED-2562',
          blueprintType: blueprintType ?? undefined,
          pattern: questionPattern ?? undefined,
          learningObjective: learningObjective ?? undefined,
        },
      ],
      coverageSatisfied: [],
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
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot: buildConstraintSnapshot(),
    warnings: [],
    statistics: {
      totalCandidates: candidates.length,
      fullConfidenceCount: candidates.filter((c) => c.confidence.level === 'full').length,
      reducedConfidenceCount: candidates.filter((c) => c.confidence.level === 'reduced').length,
      incompleteAxesCount: candidates.filter(
        (c) =>
          c.completeness.blueprintType === 'incomplete' ||
          c.completeness.learningObjective === 'incomplete' ||
          c.completeness.questionPattern === 'incomplete' ||
          c.completeness.section === 'incomplete'
      ).length,
      distinctDocuments: new Set(candidates.map((c) => c.metadata.document)).size,
      distinctDifficulties: new Set(candidates.map((c) => c.metadata.difficulty)).size,
      distinctPatterns: new Set(candidates.map((c) => String(c.metadata.questionPattern))).size,
      distinctLearningObjectives: new Set(candidates.map((c) => String(c.metadata.learningObjective)))
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

function signalSources(candidate: ReturnType<typeof extractSignals>['candidates'][number]): readonly RawSignalSource[] {
  return candidate.signals.map((signal) => signal.source)
}

function source(
  candidate: ReturnType<typeof extractSignals>['candidates'][number],
  signalSource: RawSignalSource
) {
  const signal = candidate.signals.find((s) => s.source === signalSource)
  assert.ok(signal, `expected signal ${signalSource}`)
  return signal
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage-1 shape and extraction
// ═══════════════════════════════════════════════════════════════════════════

function verifies_extracts_closed_signal_inventory_per_candidate(): void {
  const result = extractSignals(mkCandidateSet([mkCandidate()]))
  assert.equal(result.candidates.length, 1)
  assert.deepEqual(signalSources(result.candidates[0]!), RAW_SIGNAL_SOURCE_ORDER)
  assert.equal(result.candidates[0]!.signals.length, 10)
  assert.equal(result.summary.totalSignals, 10)
}

function verifies_known_metadata_signals_copy_candidate_set_values(): void {
  const result = extractSignals(
    mkCandidateSet([
      mkCandidate({
        questionCode: 'Q-000010',
        difficulty: 'Hard',
        document: 'DOC-A',
        topic: 'Topic A',
        tier: 3,
        blueprintType: 'Scenario',
        learningObjective: 'LO4',
        questionPattern: 'Sequence',
      }),
    ])
  )
  const c = result.candidates[0]!
  assert.equal(source(c, 'difficulty').value, 'Hard')
  assert.equal(source(c, 'document').value, 'DOC-A')
  assert.equal(source(c, 'topic').value, 'Topic A')
  assert.equal(source(c, 'tier').value, 3)
  assert.equal(source(c, 'blueprint_type').value, 'Scenario')
  assert.equal(source(c, 'learning_objective').value, 'LO4')
  assert.equal(source(c, 'pattern').value, 'Sequence')
  assert.equal(source(c, 'difficulty').integrity, 'known')
}

function verifies_current_candidate_set_gaps_are_missing_not_invented(): void {
  const result = extractSignals(mkCandidateSet([mkCandidate()]))
  const c = result.candidates[0]!
  assert.equal(source(c, 'usage_count').integrity, 'missing')
  assert.equal(source(c, 'usage_count').value, null)
  assert.match(source(c, 'usage_count').extractionNote ?? '', /not carried/)
  assert.equal(source(c, 'last_used_at').integrity, 'missing')
  assert.equal(source(c, 'last_used_at').value, null)
  assert.match(source(c, 'last_used_at').extractionNote ?? '', /not carried/)
}

function verifies_missing_ig2_axes_are_missing_signals(): void {
  const result = extractSignals(
    mkCandidateSet([
      mkCandidate({
        blueprintType: null,
        learningObjective: null,
        questionPattern: null,
        confidenceLevel: 'reduced',
      }),
    ])
  )
  const c = result.candidates[0]!
  assert.equal(source(c, 'blueprint_type').integrity, 'missing')
  assert.equal(source(c, 'learning_objective').integrity, 'missing')
  assert.equal(source(c, 'pattern').integrity, 'missing')
  assert.match(source(c, 'pattern').extractionNote ?? '', /IG-2/)
}

function verifies_reduced_generator_confidence_is_incomplete_signal(): void {
  const result = extractSignals(
    mkCandidateSet([
      mkCandidate({
        questionCode: 'Q-000011',
        confidenceLevel: 'reduced',
        confidenceReason: 'questionPattern axis missing (IG-2 gap)',
      }),
    ])
  )
  const s = source(result.candidates[0]!, 'generator_confidence')
  assert.equal(s.integrity, 'incomplete')
  assert.deepEqual(s.value, {
    level: 'reduced',
    reason: 'questionPattern axis missing (IG-2 gap)',
  })
  assert.match(s.extractionNote ?? '', /questionPattern/)
}

function verifies_completeness_summary_uses_scoring_integrity_vocabulary(): void {
  const result = extractSignals(
    mkCandidateSet([mkCandidate({ topic: null, questionPattern: null })])
  )
  const completeness = result.candidates[0]!.completeness
  assert.deepEqual(completeness.byIntegrity.conflicting, [])
  assert.ok(completeness.byIntegrity.known.includes('difficulty'))
  assert.ok(completeness.byIntegrity.missing.includes('topic'))
  assert.ok(completeness.byIntegrity.missing.includes('pattern'))
  assert.equal(completeness.overallIntegrity, 'missing')
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism and purity
// ═══════════════════════════════════════════════════════════════════════════

function verifies_candidates_are_canonicalized_by_question_code(): void {
  const result = extractSignals(
    mkCandidateSet([
      mkCandidate({ questionCode: 'Q-000003' }),
      mkCandidate({ questionCode: 'Q-000001' }),
      mkCandidate({ questionCode: 'Q-000002' }),
    ])
  )
  assert.deepEqual(result.summary.questionCodes, ['Q-000001', 'Q-000002', 'Q-000003'])
}

function verifies_order_invariant_over_candidate_array(): void {
  const candidates = [
    mkCandidate({ questionCode: 'Q-000003', difficulty: 'Hard' }),
    mkCandidate({ questionCode: 'Q-000001', difficulty: 'Easy' }),
    mkCandidate({ questionCode: 'Q-000002', difficulty: 'Medium' }),
  ]
  assertOrderInvariant((input) => extractSignals(mkCandidateSet(input)), candidates, {
    runs: 20,
    seed: 37,
  })
}

function verifies_idempotent_and_stable_serialization(): void {
  const candidateSet = mkCandidateSet([mkCandidate({ questionCode: 'Q-000001' })])
  const a = extractSignals(candidateSet)
  const b = extractSignals(candidateSet)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_does_not_mutate_candidate_set(): void {
  const candidateSet = mkCandidateSet([mkCandidate({ questionCode: 'Q-000001' })])
  const before = stableStringify(candidateSet)
  extractSignals(candidateSet)
  assert.equal(stableStringify(candidateSet), before)
}

function verifies_duplicate_question_code_is_fatal_malformed_candidate_set(): void {
  assert.throws(
    () =>
      extractSignals(
        mkCandidateSet([
          mkCandidate({ questionCode: 'Q-000001' }),
          mkCandidate({ questionCode: 'Q-000001', difficulty: 'Hard' }),
        ])
      ),
    /Fatal Signal Extraction error: duplicate Candidate questionCode Q-000001/
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Boundary checks
// ═══════════════════════════════════════════════════════════════════════════

function verifies_signal_extraction_has_no_forbidden_runtime_dependencies(): void {
  const signalsPath = path.join(__dirname, 'signals.ts')
  const src = stripComments(readFileSync(signalsPath, 'utf8'))
  const forbidden = [
    /\bfrom\s+['"]@supabase/,
    /\bfrom\s+['"].*supabase/,
    /\bfrom\s+['"]react['"]/,
    /\bfrom\s+['"]next\//,
    /\bMath\.random\s*\(/,
    /\bDate\.now\s*\(/,
    /\bprocess\.hrtime\s*\(/,
    /\bperformance\.now\s*\(/,
    /\bcontent\b/,
    /\bchoice_[a-z]+\b/,
    /\bhint\b/,
    /\bcorrect_answer\b/,
  ]
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(src), `signals.ts must not contain forbidden pattern ${pattern}`)
  }
}

function verifies_signal_extraction_does_not_continue_to_stage_2(): void {
  const signalsPath = path.join(__dirname, 'signals.ts')
  const src = stripComments(readFileSync(signalsPath, 'utf8'))
  const forbiddenStage2 = [
    /\bCOMPONENT_VOCABULARY\b/,
    /\bScoreComponent\b/,
    /\bNormalizedScore\b/,
    /\bCompositeScore\b/,
    /\bPenalty\b/,
    /\bScoringConfidence\b/,
  ]
  for (const pattern of forbiddenStage2) {
    assert.ok(!pattern.test(src), `Stage 1 must not use Stage 2+ contract ${pattern}`)
  }
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  { name: 'extracts closed RawSignal inventory per Candidate (§10.1)', fn: verifies_extracts_closed_signal_inventory_per_candidate },
  { name: 'known metadata signals copy CandidateSet values (§3.3)', fn: verifies_known_metadata_signals_copy_candidate_set_values },
  { name: 'CandidateSet gaps are missing, not invented (§11.2)', fn: verifies_current_candidate_set_gaps_are_missing_not_invented },
  { name: 'missing IG-2 axes become missing signals (§6.3)', fn: verifies_missing_ig2_axes_are_missing_signals },
  { name: 'Generator Confidence is consumed as an input signal (§6.5)', fn: verifies_reduced_generator_confidence_is_incomplete_signal },
  { name: 'completeness summary uses integrity vocabulary (§3.5)', fn: verifies_completeness_summary_uses_scoring_integrity_vocabulary },
  { name: 'candidates canonicalized by Question Code', fn: verifies_candidates_are_canonicalized_by_question_code },
  { name: 'order-invariant over CandidateSet candidate order', fn: verifies_order_invariant_over_candidate_array },
  { name: 'idempotent and stable-serializable', fn: verifies_idempotent_and_stable_serialization },
  { name: 'does not mutate CandidateSet', fn: verifies_does_not_mutate_candidate_set },
  { name: 'duplicate questionCode is fatal malformed CandidateSet', fn: verifies_duplicate_question_code_is_fatal_malformed_candidate_set },
  { name: 'no forbidden runtime dependencies or content reads', fn: verifies_signal_extraction_has_no_forbidden_runtime_dependencies },
  { name: 'does not continue to Stage 2', fn: verifies_signal_extraction_does_not_continue_to_stage_2 },
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
