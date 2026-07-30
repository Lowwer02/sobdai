/**
 * lib/engine/scoring/scoring.property.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.6 — Scoring Runtime Property Tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2 (Runtime Pipeline), §3
 *     (Signal Extraction), §4 (Scoring Integration).
 *   - Scoring Model Specification v1.0 §5 (Composite), §6 (Confidence),
 *     §7 (Penalties), §8 (Transparency), §10 (Data Contracts).
 *
 * PURPOSE. Verification only. This file invokes the production Scoring Runtime
 * and asserts cross-cutting properties. It introduces no production behavior
 * and modifies no contracts.
 *
 * RUN: npx jiti lib/engine/scoring/scoring.property.test.ts
 */

import assert from 'node:assert/strict'

import type { BlueprintSlot, Candidate, CandidateSet } from '../generator/contracts'
import type { Penalty } from './contracts'
import { aggregatePenalties } from './penalties'
import { runScoring } from './runtime'
import {
  assertIdempotent,
  assertOrderInvariant,
  stableStringify,
} from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'

// ─── Fixtures ───────────────────────────────────────────────────────────────

function slot(overrides: Partial<BlueprintSlot> = {}): BlueprintSlot {
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

function candidate(overrides: {
  readonly questionCode: string
  readonly difficulty?: 'Easy' | 'Medium' | 'Hard'
  readonly topic?: string | null
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
}): Candidate {
  const difficulty = overrides.difficulty ?? 'Easy'
  const blueprintType = overrides.blueprintType === undefined ? 'Memory' : overrides.blueprintType
  const learningObjective =
    overrides.learningObjective === undefined ? 'LO1' : overrides.learningObjective
  const questionPattern =
    overrides.questionPattern === undefined ? 'Positive' : overrides.questionPattern
  const confidenceReduced =
    blueprintType === null || learningObjective === null || questionPattern === null

  return {
    identity: {
      questionCode: overrides.questionCode,
      questionId: overrides.questionCode,
    },
    metadata: {
      document: 'LAW-ACT-HED-2562',
      difficulty,
      topic: overrides.topic === undefined ? 'มาตรา 6' : overrides.topic,
      status: 'Published',
      tier: 1,
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
      level: confidenceReduced ? 'reduced' : 'full',
      reason: confidenceReduced ? 'one or more IG-2 axes missing' : null,
    },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document', 'coverage', 'difficulty'],
      eligibleSlots:
        overrides.eligibleSlots ??
        [
          slot({
            difficulty,
            blueprintType: blueprintType ?? undefined,
            pattern: questionPattern ?? undefined,
            learningObjective: learningObjective ?? undefined,
          }),
        ],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function candidateSet(candidates: readonly Candidate[]): CandidateSet {
  return {
    identity: {
      assemblyRequestId: 'req-scoring-property',
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
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
}

function propertyCandidates(): Candidate[] {
  return [
    candidate({ questionCode: 'Q-000003', difficulty: 'Hard', questionPattern: 'Negative' }),
    candidate({ questionCode: 'Q-000001', difficulty: 'Easy' }),
    candidate({
      questionCode: 'Q-000002',
      difficulty: 'Medium',
      questionPattern: null,
      eligibleSlots: [slot({ difficulty: 'Medium', pattern: 'Positive' })],
    }),
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Determinism
// ═══════════════════════════════════════════════════════════════════════════

function property_determinism_same_input_same_output(): void {
  const input = candidateSet(propertyCandidates())
  const a = runScoring(input)
  const b = runScoring(input)
  assert.equal(stableStringify(a), stableStringify(b))
}

function property_determinism_order_invariant_candidate_order(): void {
  assertOrderInvariant(
    (input) => runScoring(candidateSet(input)),
    propertyCandidates(),
    { runs: 25, seed: 73 }
  )
}

function property_determinism_idempotent_across_runs(): void {
  const input = candidateSet(propertyCandidates())
  assertIdempotent(runScoring, input, 5)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Immutability + stable serialization
// ═══════════════════════════════════════════════════════════════════════════

function property_immutability_candidate_set_not_mutated(): void {
  const input = candidateSet(propertyCandidates())
  const before = stableStringify(input)
  runScoring(input)
  assert.equal(stableStringify(input), before)
}

function property_stable_serialization_is_canonical(): void {
  const output = runScoring(candidateSet(propertyCandidates()))
  const a = {
    penalties: output.penalties,
    confidence: output.confidence,
    composites: output.composites,
    components: output.components,
    signals: output.signals,
  }
  const b = {
    signals: output.signals,
    components: output.components,
    composites: output.composites,
    confidence: output.confidence,
    penalties: output.penalties,
  }
  assert.equal(stableStringify(a), stableStringify(b))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Confidence propagation
// ═══════════════════════════════════════════════════════════════════════════

function property_confidence_propagates_from_component_evidence(): void {
  const output = runScoring(candidateSet(propertyCandidates()))
  for (const entry of output.confidence.entries) {
    const reducingSignals = entry.composite.breakdown.contributions.flatMap(
      (contribution) => contribution.component.confidence.reducingSignals
    )
    const expectedLevel = reducingSignals.length === 0 ? 'high' : 'low'
    assert.equal(entry.confidence.level, expectedLevel)
    assert.equal(entry.composite.confidence.level, expectedLevel)
    assert.deepEqual(entry.confidence.reducingSignals, entry.composite.confidence.reducingSignals)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Penalty transparency
// ═══════════════════════════════════════════════════════════════════════════

function property_penalty_transparency_on_runtime_output(): void {
  const output = runScoring(candidateSet(propertyCandidates()))
  for (const entry of output.penalties.entries) {
    for (const penalty of entry.penalties) {
      assert.ok(penalty.trigger.trim().length > 0)
      assert.ok(penalty.evidence.trim().length > 0)
      assert.ok(penalty.effect.trim().length > 0)
      assert.ok(penalty.appliedBy === 'ranking' || penalty.appliedBy === 'solver')
    }
  }
}

function property_penalty_transparency_rejects_opaque_existing_penalty(): void {
  const output = runScoring(candidateSet([candidate({ questionCode: 'Q-000001' })]))
  const opaquePenalty: Penalty = {
    type: 'soft',
    trigger: '',
    evidence: 'fixture evidence',
    effect: 'fixture effect',
    appliedBy: 'ranking',
  }
  const composite = output.confidence.entries[0]!.composite
  const firstContribution = composite.breakdown.contributions[0]!
  const opaqueComposite = {
    ...composite,
    breakdown: {
      ...composite.breakdown,
      contributions: [
        {
          ...firstContribution,
          component: {
            ...firstContribution.component,
            penalties: [opaquePenalty],
          },
        },
        ...composite.breakdown.contributions.slice(1),
      ],
    },
  }
  assert.throws(
    () =>
      aggregatePenalties({
        confidence: {
          ...output.confidence,
          entries: [
            {
              ...output.confidence.entries[0]!,
              composite: opaqueComposite,
            },
          ],
        },
      }),
    /non-transparent soft penalty/
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Composite breakdown consistency
// ═══════════════════════════════════════════════════════════════════════════

function property_composite_breakdown_consistency(): void {
  const output = runScoring(candidateSet(propertyCandidates()))
  for (const composite of output.composites.composites) {
    assert.ok(composite.breakdown.contributions.length > 0)
    const contributionSum = composite.breakdown.contributions.reduce(
      (sum, contribution) => sum + contribution.contribution,
      0
    )
    assert.equal(round(contributionSum), composite.value)
    for (const contribution of composite.breakdown.contributions) {
      assert.equal(contribution.component.questionCode, composite.questionCode)
      assert.equal(contribution.component.slot, composite.slot)
      assert.ok(contribution.reason.length > 0)
    }
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
}

// ═══ Test runner ══════════════════════════════════════════════════════════

const tests: { name: string; fn: () => void }[] = [
  { name: 'determinism: same input → same output', fn: property_determinism_same_input_same_output },
  { name: 'determinism: candidate order invariant', fn: property_determinism_order_invariant_candidate_order },
  { name: 'determinism: idempotent across runs', fn: property_determinism_idempotent_across_runs },
  { name: 'immutability: CandidateSet not mutated', fn: property_immutability_candidate_set_not_mutated },
  { name: 'stable serialization is canonical', fn: property_stable_serialization_is_canonical },
  { name: 'confidence propagates from component evidence', fn: property_confidence_propagates_from_component_evidence },
  { name: 'penalty transparency on runtime output', fn: property_penalty_transparency_on_runtime_output },
  { name: 'penalty transparency rejects opaque existing penalty', fn: property_penalty_transparency_rejects_opaque_existing_penalty },
  { name: 'composite breakdown consistency', fn: property_composite_breakdown_consistency },
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
