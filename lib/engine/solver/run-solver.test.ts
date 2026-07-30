/**
 * lib/engine/solver/run-solver.test.ts
 * ----------------------------------------------------------------------------
 * Black-box regression tests for the production Solver Runtime entry point.
 *
 * RUN: npx jiti lib/engine/solver/run-solver.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type {
  BlueprintSlot,
  Candidate,
  CandidateSet,
  ConstraintSnapshot,
} from '../generator/contracts'
import type { RankedCandidateSet } from '../ranking/contracts'
import { runRanking } from '../ranking/runtime'
import { runScoring } from '../scoring/runtime'
import { stableStringify } from '../shared/testing/determinism'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { runSolver } from './run-solver'

function slot(setNumber: 1 | 2): BlueprintSlot {
  return {
    setNumber,
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    learningObjective: 'LO1',
  }
}

function candidate(
  questionCode: string,
  eligibleSlots: readonly BlueprintSlot[]
): Candidate {
  return {
    identity: {
      questionCode,
      questionId: questionCode,
    },
    metadata: {
      document: 'LAW-ACT-HED-2562',
      difficulty: 'Easy',
      topic: 'topic-1',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'section-1',
      tags: [],
      category: null,
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: {
      level: 'full',
      reason: null,
    },
    provenance: {
      filtersPassed: [
        'exclusion',
        'status',
        'document',
        'coverage',
        'difficulty',
        'pattern',
        'learning_objective',
      ],
      eligibleSlots,
      coverageSatisfied: [],
      source: {
        kind: 'metadata_query',
        queryId: 'solver-runtime-test',
      },
    },
  }
}

function candidateSet(
  eligibleSlots: readonly BlueprintSlot[]
): CandidateSet {
  const candidates = [candidate('Q-000001', eligibleSlots)]
  return {
    identity: {
      assemblyRequestId: 'assembly-solver-runtime',
      generatedAt: null,
      bankStateHash: 'bank-solver-runtime',
    },
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
    meta: {
      specVersion: '1.0',
      generatorVersion: '1.0.0',
    },
  }
}

function rank(candidateSetInput: CandidateSet): RankedCandidateSet {
  const scoring = runScoring(candidateSetInput)
  const ranking = runRanking({
    candidateSet: candidateSetInput,
    compositeScores: scoring.composites.composites,
  })
  if (!ranking.ok) {
    throw new Error(JSON.stringify(ranking.fatalDiagnostics))
  }
  return ranking.rankedCandidateSet
}

function withConstraintSnapshot(
  ranked: RankedCandidateSet,
  constraintSnapshot: ConstraintSnapshot
): RankedCandidateSet {
  const candidateSetWithSnapshot: CandidateSet = {
    ...ranked.candidateSet,
    constraintSnapshot,
  }
  return {
    ...ranked,
    candidateSet: candidateSetWithSnapshot,
    constraintSnapshot,
  }
}

function verifies_complete_solver_pipeline(): void {
  const ranked = rank(candidateSet([slot(1)]))
  const result = runSolver(ranked)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.allocatedCandidateSet.placements.length, 1)
  assert.equal(
    result.allocatedCandidateSet.placements[0]?.state,
    'allocated'
  )
  assert.equal(
    result.allocatedCandidateSet.placements[0]?.assignedCandidate.code,
    'Q-000001'
  )
  assert.ok(result.allocatedCandidateSet.auditTrail.length > 0)
  assert.equal(result.allocatedCandidateSet.rankedCandidateSet, ranked)
}

function verifies_blueprint_fatals_are_forwarded(): void {
  const ranked = rank(candidateSet([slot(1)]))
  const invalidSnapshot: ConstraintSnapshot = {
    ...ranked.constraintSnapshot,
    target: {
      ...ranked.constraintSnapshot.target,
      sets: 6,
    },
  }
  const result = runSolver(
    withConstraintSnapshot(ranked, invalidSnapshot)
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.fatalDiagnostics.length > 0)
  assert.equal(
    result.fatalDiagnostics[0]?.stage,
    'validate_constraints'
  )
  assert.equal(
    result.fatalDiagnostics[0]?.category,
    'blueprint_impossible'
  )
}

function verifies_allocation_fatals_are_forwarded(): void {
  const ranked = rank(candidateSet([slot(1), slot(2)]))
  const result = runSolver(ranked)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(
    result.fatalDiagnostics.some(
      (diagnostic) =>
        diagnostic.stage === 'allocation_validation' &&
        diagnostic.category === 'no_feasible_candidate'
    )
  )
}

function verifies_determinism_and_input_immutability(): void {
  const ranked = rank(candidateSet([slot(1)]))
  const before = stableStringify(ranked)
  const first = runSolver(ranked)
  const second = runSolver(ranked)

  assert.equal(stableStringify(first), stableStringify(second))
  assert.equal(stableStringify(ranked), before)
}

function verifies_runtime_has_no_testing_or_infrastructure_dependency(): void {
  const source = readFileSync(
    new URL('./run-solver.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(source, /shared\/testing/)
  assert.doesNotMatch(
    source,
    /Date\.now|Math\.random|@supabase|from\s+['"]react/i
  )
}

const tests: readonly { readonly name: string; readonly fn: () => void }[] = [
  {
    name: 'executes the complete Solver pipeline',
    fn: verifies_complete_solver_pipeline,
  },
  {
    name: 'forwards Blueprint fatal diagnostics',
    fn: verifies_blueprint_fatals_are_forwarded,
  },
  {
    name: 'forwards Allocation Validation fatal diagnostics',
    fn: verifies_allocation_fatals_are_forwarded,
  },
  {
    name: 'is deterministic and does not mutate RankedCandidateSet',
    fn: verifies_determinism_and_input_immutability,
  },
  {
    name: 'has no production testing or infrastructure dependency',
    fn: verifies_runtime_has_no_testing_or_infrastructure_dependency,
  },
]

let passed = 0
let failed = 0
for (const test of tests) {
  try {
    test.fn()
    console.log(`  ✓ ${test.name}`)
    passed += 1
  } catch (error: unknown) {
    console.error(`  ✗ ${test.name}`)
    console.error(
      `    ${error instanceof Error ? error.message : String(error)}`
    )
    failed += 1
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
