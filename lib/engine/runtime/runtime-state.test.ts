/**
 * lib/engine/runtime/runtime-state.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for RuntimeState physicalSolverResult and physicalRankingBridge behavior.
 *
 * RUN: npx jiti lib/engine/runtime/runtime-state.test.ts
 */

import assert from 'node:assert/strict'
import type { PhysicalSolverRun } from '../solver/physical-solver-orchestrator'
import type { PhysicalSolverInput } from '../solver/set-solver-input'
import type { EngineExecutionMetadata, EngineRequest } from './contracts'
import type { Candidate } from '../generator/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import {
  createRuntimeState,
  withPhysicalSolverResult,
  withPhysicalRankingBridge,
} from './runtime-state'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REQUEST: EngineRequest = {
  blueprint: {
    id: 'test-blueprint',
    version: '1.0.0',
  },
  profile: 'simulation',
  runUnit: 'blueprint',
  runtimeCompatibility: {
    targetVersion: '1.0',
    minimumVersion: '1.0',
  },
  options: {
    overFetchFactor: 2,
    performanceBudgetMs: null,
    parallelismHint: null,
    auditVerbosity: 'summary',
  },
  context: {
    requestedBy: 'runtime-state-test',
    submittedAtIso: '2026-01-01T00:00:00.000Z',
    correlationId: null,
    traceId: null,
    parentSpanId: null,
  },
}

const EXECUTION_META: EngineExecutionMetadata = {
  executionId: 'exec-123',
  runtimeApiVersion: '1.0',
  engineVersion: '1.0',
  blueprintId: 'test-blueprint',
  blueprintVersion: '1.0.0',
  startedAtIso: '2026-01-01T00:00:00.000Z',
  completedAtIso: null,
  durationMs: null,
  moduleVersions: {
    reader: '1.0',
    generator: '1.0',
    scoring: '1.0',
    ranking: '1.0',
    allocation: '1.0',
    solver: '1.0',
  },
  moduleDurationsMs: {},
}

const RUN_A: PhysicalSolverRun = { results: [] }
const RUN_B: PhysicalSolverRun = { results: [] }

const MOCK_CANDIDATE: Candidate = {
  identity: { questionCode: 'Q-001', questionId: 'Q-001' },
  metadata: {
    document: 'DOC-A',
    difficulty: 'Easy',
    topic: 'Topic A',
    status: 'Published',
    tier: 1,
    blueprintType: 'Memory',
    learningObjective: 'LO1',
    questionPattern: 'Positive',
    section: 'Sec 1',
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
    filtersPassed: [],
    eligibleSlots: [],
    coverageSatisfied: [],
    source: { kind: 'metadata_query', queryId: 'q-fixture' },
  },
}

const BRIDGE_INPUT: PhysicalSolverInput = {
  candidateSet: {
    identity: { assemblyRequestId: 'run-123', generatedAt: '2026-08-12T00:00:00Z', bankStateHash: 'hash123' },
    candidates: [],
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot: buildConstraintSnapshot(),
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
    meta: { specVersion: '1.0', generatorVersion: '1.0' },
  },
  setProfiles: [
    {
      setNumber: 1,
      profiles: [
        {
          questionCode: 'Q-001',
          candidate: MOCK_CANDIDATE,
          suitabilityProfiles: [], // Verified empty / no rank fabricated
        },
      ],
    },
  ],
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. Initial state
function test_initial_state(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  assert.equal(state.physicalSolverResult, null, 'physicalSolverResult must start as null')
  assert.equal(state.physicalRankingBridge, null, 'physicalRankingBridge must start as null')
}

// 2. Attach PhysicalSolverRun
function test_attach_physical_solver_run(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  const nextState = withPhysicalSolverResult(state, RUN_A)

  assert.equal(nextState.physicalSolverResult, RUN_A, 'physicalSolverResult must equal the attached run')
}

// 3. Immutability
function test_immutability(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  const originalJSON = JSON.stringify(state)
  const runJSON = JSON.stringify(RUN_A)

  withPhysicalSolverResult(state, RUN_A)

  assert.equal(JSON.stringify(state), originalJSON, 'Input RuntimeState must not be mutated')
  assert.equal(JSON.stringify(RUN_A), runJSON, 'PhysicalSolverRun must not be mutated')
}

// 4. Existing-state preservation
function test_existing_state_preservation(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  const nextState = withPhysicalSolverResult(state, RUN_A)

  // Unrelated fields must be preserved exactly
  assert.equal(nextState.request, state.request)
  assert.equal(nextState.status, state.status)
  assert.equal(nextState.execution, state.execution)
  assert.equal(nextState.progress, state.progress)
  assert.equal(nextState.assemblyRequest, state.assemblyRequest)
  assert.equal(nextState.candidateSet, state.candidateSet)
  assert.equal(nextState.compositeScores, state.compositeScores)
  assert.equal(nextState.rankedCandidateSet, state.rankedCandidateSet)
  assert.equal(nextState.allocatedCandidateSet, state.allocatedCandidateSet)
  assert.deepEqual(nextState.warnings, state.warnings)
  assert.deepEqual(nextState.errors, state.errors)
}

// 5. Replacement behavior
function test_replacement_behavior(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  
  const stateA = withPhysicalSolverResult(state, RUN_A)
  const stateB = withPhysicalSolverResult(stateA, RUN_B)

  assert.equal(stateA.physicalSolverResult, RUN_A, 'stateA must retain RUN_A')
  assert.equal(stateB.physicalSolverResult, RUN_B, 'stateB must contain RUN_B')
}

// 6. Null authority
function test_null_authority(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  assert.equal(state.physicalSolverResult, null, 'Only createRuntimeState establishes initial null')
}

// 7. Attach PhysicalRankingBridge
function test_attach_physical_ranking_bridge(): void {
  const state = createRuntimeState(REQUEST, EXECUTION_META)
  const nextState = withPhysicalRankingBridge(state, BRIDGE_INPUT)

  assert.equal(nextState.physicalRankingBridge, BRIDGE_INPUT, 'physicalRankingBridge must equal the attached bridge')
  assert.equal(nextState.physicalRankingBridge.candidateSet, BRIDGE_INPUT.candidateSet, 'candidateSet reference must be preserved')
  assert.equal(nextState.physicalRankingBridge.setProfiles, BRIDGE_INPUT.setProfiles, 'setProfiles reference must be preserved')
  
  // Immutability check
  const stateJSON = JSON.stringify(state)
  withPhysicalRankingBridge(state, BRIDGE_INPUT)
  assert.equal(JSON.stringify(state), stateJSON, 'previous RuntimeState remains unchanged')

  // Check no rank verification
  const firstProfile = nextState.physicalRankingBridge.setProfiles[0]!.profiles[0]!
  assert.equal((firstProfile as any).rank, undefined, 'PreTie candidate profile requires no rank')
  assert.deepEqual(firstProfile.suitabilityProfiles, [], 'Empty suitabilityProfiles is valid')
}

// Run all tests
const tests = [
  test_initial_state,
  test_attach_physical_solver_run,
  test_immutability,
  test_existing_state_preservation,
  test_replacement_behavior,
  test_null_authority,
  test_attach_physical_ranking_bridge,
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(err)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
