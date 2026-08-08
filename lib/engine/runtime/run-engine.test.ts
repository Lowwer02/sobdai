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
  ) {}

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

function verifies_default_target_set_count_is_5(): void {
  const res = runEngine(REQUEST, dependencies())
  assert.ok(res.assemblyRequest)
  assert.equal(res.assemblyRequest.target.sets, 5)
  assert.equal(res.assemblyRequest.target.perSet, 100)
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
