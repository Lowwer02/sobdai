/**
 * lib/engine/runtime/run-engine.test.ts
 * ----------------------------------------------------------------------------
 * Black-box regression tests for the production Engine Runtime orchestrator.
 *
 * RUN: npx jiti lib/engine/runtime/run-engine.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CollectorSink,
  type ObservabilitySink,
} from '../shared/observability'
import type {
  BankMetadataRow,
  BankReadAdapter,
} from '../shared/question-bank'
import { buildStage5CompleteBlueprint } from '../reader/testing/fixtures'
import type {
  EngineRuntimeDependencies,
  EngineRequest,
} from './contracts'
import { runEngine } from './run-engine'
import { RUNTIME_STAGE_ORDER } from './stage-composition'

const REQUEST: EngineRequest = {
  blueprint: {
    id: 'test-position',
    version: '3.0.0',
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
    auditVerbosity: 'full',
  },
  context: {
    requestedBy: 'runtime-test',
    submittedAtIso: '2026-01-01T00:00:00.000Z',
    correlationId: 'correlation-runtime-test',
    traceId: null,
    parentSpanId: null,
  },
}

const BANK_ROWS: readonly BankMetadataRow[] = [
  {
    questionCode: 'Q-RUNTIME-001',
    subject: null,
    document: 'พ.ร.บ.ทดสอบ 2560',
    topic: 'หลักการ (ม.6–8)',
    law: null,
    difficulty: 'Easy',
    status: 'Published',
    blueprintType: 'Memory',
    learningObjective: 'LO1',
    questionPattern: 'Positive',
    section: 'section-1',
  },
]

class CountingBankAdapter implements BankReadAdapter {
  public reads = 0

  public constructor(
    private readonly rows: readonly BankMetadataRow[]
  ) { }

  public readMetadata(): readonly BankMetadataRow[] {
    this.reads += 1
    return this.rows
  }
}

class DeterministicClock {
  private isoSequence = 0
  private monotonicSequence = 0

  public nowIso(): string {
    const milliseconds = String(this.isoSequence).padStart(3, '0')
    this.isoSequence += 1
    return `2026-01-01T00:00:00.${milliseconds}Z`
  }

  public monotonicTimeMs(): number {
    this.monotonicSequence += 10
    return this.monotonicSequence
  }
}

function dependencies(options: {
  readonly source?: string
  readonly bank?: CountingBankAdapter
  readonly sink?: ObservabilitySink
  readonly cancellation?: () => boolean
  readonly sourceFailure?: Error
} = {}): EngineRuntimeDependencies {
  const clock = new DeterministicClock()

  return {
    readBlueprintSource(): string {
      if (options.sourceFailure !== undefined) {
        throw options.sourceFailure
      }
      return options.source ?? buildStage5CompleteBlueprint()
    },
    questionBank:
      options.bank ?? new CountingBankAdapter(BANK_ROWS),
    observability: options.sink ?? new CollectorSink(),
    createExecutionId: () => 'engine-runtime-test',
    nowIso: () => clock.nowIso(),
    monotonicTimeMs: () => clock.monotonicTimeMs(),
    isCancellationRequested:
      options.cancellation ?? (() => false),
  }
}

function verifies_canonical_pipeline_and_failure_propagation(): void {
  const bank = new CountingBankAdapter(BANK_ROWS)
  const sink = new CollectorSink()
  const requestBefore = JSON.stringify(REQUEST)
  const bankBefore = JSON.stringify(BANK_ROWS)

  const result = runEngine(
    REQUEST,
    dependencies({ bank, sink })
  )

  assert.equal(result.status, 'Failed')
  assert.ok(result.assemblyRequest)
  assert.ok(result.candidateSet)
  assert.ok(result.compositeScores.length > 0)
  assert.ok(result.rankedCandidateSet)
  assert.equal(result.allocatedCandidateSet, null)
  assert.equal(result.errors[0]?.category, 'Constraint Error')
  assert.equal(result.errors[0]?.module, 'Solver')
  assert.ok(result.warnings.length > 0)
  assert.equal(bank.reads, 1)
  assert.deepEqual(
    sink.timings.map((event) => event.module),
    RUNTIME_STAGE_ORDER
  )
  assert.deepEqual(
    Object.keys(result.execution.moduleDurationsMs),
    ['reader', 'generator', 'scoring', 'ranking', 'solver']
  )
  assert.equal(result.execution.runtimeApiVersion, '1.0')
  assert.equal(result.execution.completedAtIso !== null, true)
  assert.equal(result.execution.durationMs !== null, true)
  assert.equal(JSON.stringify(REQUEST), requestBefore)
  assert.equal(JSON.stringify(BANK_ROWS), bankBefore)
}

function verifies_reader_failure_halts_pipeline(): void {
  const bank = new CountingBankAdapter(BANK_ROWS)
  const sink = new CollectorSink()

  const result = runEngine(
    REQUEST,
    dependencies({
      source: '',
      bank,
      sink,
    })
  )

  assert.equal(result.status, 'Failed')
  assert.equal(result.assemblyRequest, null)
  assert.equal(result.candidateSet, null)
  assert.equal(result.compositeScores.length, 0)
  assert.equal(result.rankedCandidateSet, null)
  assert.equal(result.allocatedCandidateSet, null)
  assert.equal(result.errors[0]?.category, 'Blueprint Error')
  assert.equal(bank.reads, 0)
  assert.deepEqual(
    sink.timings.map((event) => event.module),
    ['Reader']
  )
}

function verifies_blueprint_dependency_failure_is_structured(): void {
  const result = runEngine(
    REQUEST,
    dependencies({
      sourceFailure: new Error('snapshot unavailable'),
    })
  )

  assert.equal(result.status, 'Failed')
  assert.equal(result.errors[0]?.category, 'Dependency Error')
  assert.equal(result.errors[0]?.module, 'Reader')
  assert.match(
    result.errors[0]?.explanation ?? '',
    /snapshot unavailable/
  )
}

function verifies_cancellation_preserves_completed_artifacts(): void {
  const sink = new CollectorSink()
  let checks = 0

  const result = runEngine(
    REQUEST,
    dependencies({
      sink,
      cancellation(): boolean {
        checks += 1
        return checks === 3
      },
    })
  )

  assert.equal(result.status, 'Cancelled')
  assert.ok(result.assemblyRequest)
  assert.ok(result.candidateSet)
  assert.equal(result.compositeScores.length, 0)
  assert.equal(result.rankedCandidateSet, null)
  assert.equal(result.allocatedCandidateSet, null)
  assert.equal(result.errors.length, 0)
  assert.deepEqual(
    sink.timings.map((event) => event.module),
    ['Reader', 'Generator']
  )
}

function verifies_runtime_has_no_testing_dependency(): void {
  const source = readFileSync(
    new URL('./run-engine.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /shared\/testing|reader\/testing/)
}

function verifies_target_set_count_plumbing(): void {
  for (const count of [1, 3, 5] as const) {
    const req: EngineRequest = {
      ...REQUEST,
      options: {
        ...REQUEST.options,
        targetSetCount: count,
      },
    }
    const res = runEngine(req, dependencies())
    assert.ok(res.assemblyRequest)
    assert.equal(res.assemblyRequest.target.sets, count)
    assert.equal(res.assemblyRequest.target.perSet, 100)
  }
}

function buildTestBank(count: number): BankMetadataRow[] {
  return Array.from({ length: count }, (_, i) => ({
    questionCode: `Q-RUNTIME-${String(i + 1).padStart(3, '0')}`,
    subject: null,
    document: 'พ.ร.บ.ทดสอบ 2560',
    topic: 'หลักการ (ม.6–8)',
    law: null,
    difficulty: 'Easy' as const,
    status: 'Published' as const,
    blueprintType: 'Memory' as const,
    learningObjective: 'LO1' as const,
    questionPattern: 'Positive' as const,
    section: 'section-1',
  }))
}

function verifies_default_target_set_count_is_5(): void {
  const res = runEngine(REQUEST, dependencies())
  assert.ok(res.assemblyRequest)
  assert.equal(res.assemblyRequest.target.sets, 5)
  assert.equal(res.assemblyRequest.target.perSet, 100)
}

function verifies_physical_solver_omitted(): void {
  const result = runEngine(REQUEST, dependencies())
  assert.equal(result.physicalSolverResult, null, 'physicalSolverResult must be null when physicalSolver option is omitted')
}

function verifies_physical_solver_present_and_coexistence(): void {
  const bank = new CountingBankAdapter(buildTestBank(100))

  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
      physicalSolver: {
        maxNodesVisited: 500,
      },
    },
  }

  const result = runEngine(req, dependencies({ bank }))

  assert.ok(result.physicalSolverResult !== null, 'physicalSolverResult should be non-null')
  if (result.physicalSolverResult !== null) {
    assert.equal(result.physicalSolverResult.results.length, 1)
    const runRes = result.physicalSolverResult.results[0]!
    assert.equal(runRes.status, 'COMPLETE')
    if (runRes.status === 'COMPLETE') {
      assert.equal(runRes.assignment.placements.length, 100)
      for (const placement of runRes.assignment.placements) {
        assert.equal(placement.position.setNumber, 1)
      }
    }
  }

  assert.ok('allocatedCandidateSet' in result)
}

function verifies_physical_solver_budget_exhausted(): void {
  const bank = new CountingBankAdapter(buildTestBank(100))

  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
      physicalSolver: {
        maxNodesVisited: 1,
      },
    },
  }

  const result = runEngine(req, dependencies({ bank }))
  assert.ok(result.physicalSolverResult !== null && result.physicalSolverResult !== undefined)
  if (result.physicalSolverResult !== null) {
    const runRes = result.physicalSolverResult.results[0]!
    assert.equal(runRes.status, 'SEARCH_BUDGET_EXHAUSTED')
    assert.equal(runRes.diagnostics.nodesVisited, 1)
  }
}

function verifies_physical_solver_determinism(): void {
  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
      physicalSolver: {
        maxNodesVisited: 500,
      },
    },
  }

  const res1 = runEngine(req, dependencies())
  const res2 = runEngine(req, dependencies())

  assert.deepEqual(res1.physicalSolverResult, res2.physicalSolverResult)
}

function verifies_physical_solver_immutability(): void {
  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
      physicalSolver: {
        maxNodesVisited: 500,
      },
    },
  }
  const originalJSON = JSON.stringify(req)

  runEngine(req, dependencies())

  assert.equal(JSON.stringify(req), originalJSON, 'runEngine must not mutate input request')
}

function verifies_legacy_failure_with_physical_enabled(): void {
  // Use a bank with 100 candidates to let the physical solver COMPLETE,
  // but the legacy solver will fail because of unsatisfied Blueprint constraints
  // (e.g. buildStage5CompleteBlueprint requires specific distributions that are not met by buildTestBank(100)).
  const bank = new CountingBankAdapter(buildTestBank(100))

  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
      physicalSolver: {
        maxNodesVisited: 500,
      },
    },
  }

  const result = runEngine(req, dependencies({ bank }))

  // 1. Overall legacy Engine failure semantics remain exactly as currently defined
  assert.equal(result.status, 'Failed')

  // 2. physicalSolverResult is NOT null
  assert.ok(result.physicalSolverResult !== null, 'physicalSolverResult must not be null')
  if (result.physicalSolverResult !== null) {
    assert.equal(result.physicalSolverResult.results.length, 1)
    const runRes = result.physicalSolverResult.results[0]!

    // 3. physicalSolverResult contains the actual physical per-Set result (status === COMPLETE)
    assert.equal(runRes.status, 'COMPLETE')
  }

  // 5. The legacy fatal/error diagnostics are still present
  assert.ok(result.errors.length > 0)
  assert.equal(result.errors[0]?.category, 'Constraint Error')
  assert.equal(result.errors[0]?.module, 'Solver')
}

function verifies_legacy_failure_with_physical_omitted(): void {
  const bank = new CountingBankAdapter(buildTestBank(100))

  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
    },
  }

  const result = runEngine(req, dependencies({ bank }))

  assert.equal(result.status, 'Failed')
  assert.equal(result.physicalSolverResult, null, 'physicalSolverResult must be null when physicalSolver is omitted')
  assert.ok(result.errors.length > 0)
  assert.equal(result.errors[0]?.category, 'Constraint Error')
  assert.equal(result.errors[0]?.module, 'Solver')
}

function verifies_tie_overflow_failure_with_physical_enabled(): void {
  // 101 candidates with identical ordering-relevant metadata form ONE
  // unresolved tie group of 101 > DEFAULT_MAX_TIE_GROUP_SIZE (100), so legacy
  // Ranking throws a genuine tie-overflow exception from resolveTies(...).
  // The pre-tie Physical Solver bridge must still execute exactly once from
  // physicalRankingBridge while the exact legacy Ranking error is preserved.
  const bank = new CountingBankAdapter(buildTestBank(101))

  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
      physicalSolver: {
        maxNodesVisited: 500,
      },
    },
  }

  const result = runEngine(req, dependencies({ bank }))

  // Scoring succeeded; Ranking threw genuine tie overflow.
  assert.equal(result.status, 'Failed')
  assert.equal(result.rankedCandidateSet, null)
  assert.ok(result.compositeScores.length > 0)

  // Legacy Ranking error semantics preserved exactly.
  assert.equal(result.errors[0]?.module, 'Ranking')
  assert.equal(result.errors[0]?.category, 'Runtime Error')
  assert.equal(result.errors[0]?.location, 'Ranking:runtime')
  assert.equal(result.errors[0]?.severity, 'fatal')
  assert.match(result.errors[0]?.explanation ?? '', /tie overflow/)

  // Physical Solver executed exactly once from the pre-tie bridge despite the
  // overall Failed status.
  assert.ok(
    result.physicalSolverResult !== null,
    'physicalSolverResult must be populated despite Ranking failure'
  )
  if (result.physicalSolverResult !== null) {
    assert.equal(result.physicalSolverResult.results.length, 1)
    const runRes = result.physicalSolverResult.results[0]!
    assert.equal(runRes.status, 'COMPLETE')
    if (runRes.status === 'COMPLETE') {
      assert.equal(runRes.assignment.placements.length, 100)
      for (const placement of runRes.assignment.placements) {
        assert.equal(placement.position.setNumber, 1)
      }
    }
  }
}

function verifies_tie_overflow_failure_with_physical_omitted(): void {
  // Same genuine tie-overflow Ranking failure, but physicalSolver is omitted.
  // Existing legacy behavior must remain unchanged: no Physical Solver runs and
  // physicalSolverResult stays null.
  const bank = new CountingBankAdapter(buildTestBank(101))

  const req: EngineRequest = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      targetSetCount: 1,
    },
  }

  const result = runEngine(req, dependencies({ bank }))

  assert.equal(result.status, 'Failed')
  assert.equal(result.rankedCandidateSet, null)

  // Same legacy Ranking error semantics preserved.
  assert.equal(result.errors[0]?.module, 'Ranking')
  assert.equal(result.errors[0]?.category, 'Runtime Error')
  assert.equal(result.errors[0]?.location, 'Ranking:runtime')
  assert.equal(result.errors[0]?.severity, 'fatal')
  assert.match(result.errors[0]?.explanation ?? '', /tie overflow/)

  assert.equal(
    result.physicalSolverResult,
    null,
    'physicalSolverResult must be null when physicalSolver is omitted'
  )
}

const tests: readonly {
  readonly name: string
  readonly fn: () => void
}[] = [
    {
      name: 'executes canonical order and propagates Solver failure',
      fn: verifies_canonical_pipeline_and_failure_propagation,
    },
    {
      name: 'halts after Reader failure',
      fn: verifies_reader_failure_halts_pipeline,
    },
    {
      name: 'maps Blueprint dependency failure',
      fn: verifies_blueprint_dependency_failure_is_structured,
    },
    {
      name: 'preserves completed artifacts on cancellation',
      fn: verifies_cancellation_preserves_completed_artifacts,
    },
    {
      name: 'has no production dependency on testing fixtures',
      fn: verifies_runtime_has_no_testing_dependency,
    },
    {
      name: 'defaults targetSetCount to 5 sets',
      fn: verifies_default_target_set_count_is_5,
    },
    {
      name: 'plumbs targetSetCount for 1, 3, and 5 sets',
      fn: verifies_target_set_count_plumbing,
    },
    {
      name: 'verifies physical solver omitted',
      fn: verifies_physical_solver_omitted,
    },
    {
      name: 'verifies physical solver present and coexistence',
      fn: verifies_physical_solver_present_and_coexistence,
    },
    {
      name: 'verifies physical solver budget exhausted',
      fn: verifies_physical_solver_budget_exhausted,
    },
    {
      name: 'verifies physical solver determinism',
      fn: verifies_physical_solver_determinism,
    },
    {
      name: 'verifies physical solver immutability',
      fn: verifies_physical_solver_immutability,
    },
    {
      name: 'verifies legacy failure with physical enabled',
      fn: verifies_legacy_failure_with_physical_enabled,
    },
    {
      name: 'verifies legacy failure with physical omitted',
      fn: verifies_legacy_failure_with_physical_omitted,
    },
    {
      name: 'verifies tie-overflow Ranking failure with physical enabled',
      fn: verifies_tie_overflow_failure_with_physical_enabled,
    },
    {
      name: 'verifies tie-overflow Ranking failure with physical omitted',
      fn: verifies_tie_overflow_failure_with_physical_omitted,
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

console.log(
  `\n${passed}/${tests.length} passed, ${failed} failed`
)
if (failed > 0) process.exit(1)
