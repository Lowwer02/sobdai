/**
 * Black-box contract tests for the AssessmentEngineService boundary.
 *
 * RUN: npx jiti lib/application/assessment-engine-service.test.ts
 */

import assert from 'node:assert/strict'

import type {
  EngineRequest,
  EngineRuntimeDependencies,
} from '../engine'
import {
  AssessmentEngineService,
  AssessmentEngineServiceError,
} from './index'

const REQUEST: EngineRequest = {
  blueprint: {
    id: 'application-service-test',
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
    requestedBy: 'application-service-test',
    submittedAtIso: '2026-01-01T00:00:00.000Z',
    correlationId: null,
    traceId: null,
    parentSpanId: null,
  },
}

function dependencies(
  overrides: Partial<EngineRuntimeDependencies> = {}
): EngineRuntimeDependencies {
  let monotonicTime = 0

  return {
    readBlueprintSource(): string {
      throw new Error('blueprint storage unavailable')
    },
    questionBank: {
      readMetadata: () => [],
    },
    observability: {
      emit: () => undefined,
    },
    createExecutionId: () => 'application-service-test',
    nowIso: () => '2026-01-01T00:00:00.000Z',
    monotonicTimeMs(): number {
      monotonicTime += 1
      return monotonicTime
    },
    isCancellationRequested: () => false,
    ...overrides,
  }
}

function preserves_engine_failure_responses(): void {
  const service = new AssessmentEngineService(dependencies())
  const response = service.execute(REQUEST)

  assert.equal(response.status, 'Failed')
  assert.equal(response.errors[0]?.category, 'Dependency Error')
  assert.equal(response.errors[0]?.module, 'Reader')
}

function validates_before_invoking_engine(): void {
  let engineBoundaryCalls = 0
  const service = new AssessmentEngineService(
    dependencies({
      monotonicTimeMs(): number {
        engineBoundaryCalls += 1
        return engineBoundaryCalls
      },
    })
  )
  const invalidRequest = {
    ...REQUEST,
    blueprint: {
      ...REQUEST.blueprint,
      id: '   ',
    },
  }

  assert.throws(
    () => service.execute(invalidRequest),
    (error: unknown) => {
      assert.ok(error instanceof AssessmentEngineServiceError)
      assert.equal(error.code, 'INVALID_REQUEST')
      assert.equal(error.field, 'blueprint.id')
      return true
    }
  )
  assert.equal(engineBoundaryCalls, 0)
}

function translates_escaped_engine_exceptions(): void {
  const cause = new Error('clock unavailable')
  const service = new AssessmentEngineService(
    dependencies({
      monotonicTimeMs(): number {
        throw cause
      },
    })
  )

  assert.throws(
    () => service.execute(REQUEST),
    (error: unknown) => {
      assert.ok(error instanceof AssessmentEngineServiceError)
      assert.equal(error.code, 'ENGINE_INVOCATION_FAILED')
      assert.equal(error.field, null)
      assert.equal(error.cause, cause)
      return true
    }
  )
}

function rejects_invalid_service_configuration(): void {
  assert.throws(
    () =>
      new AssessmentEngineService(
        null as unknown as EngineRuntimeDependencies
      ),
    (error: unknown) => {
      assert.ok(error instanceof AssessmentEngineServiceError)
      assert.equal(error.code, 'INVALID_CONFIGURATION')
      assert.equal(error.field, 'dependencies')
      return true
    }
  )
}

const tests: readonly {
  readonly name: string
  readonly fn: () => void
}[] = [
  {
    name: 'preserves Engine failure responses',
    fn: preserves_engine_failure_responses,
  },
  {
    name: 'validates before invoking the Engine',
    fn: validates_before_invoking_engine,
  },
  {
    name: 'translates exceptions escaping runEngine',
    fn: translates_escaped_engine_exceptions,
  },
  {
    name: 'rejects invalid service configuration',
    fn: rejects_invalid_service_configuration,
  },
]

for (const test of tests) {
  test.fn()
  console.log(`✓ ${test.name}`)
}

console.log('AssessmentEngineService tests passed.')
