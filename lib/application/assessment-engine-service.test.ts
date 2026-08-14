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

function rejects_invalid_target_set_count(): void {
  const service = new AssessmentEngineService(dependencies())
  for (const invalidValue of [0, 6, 2.5, '3'] as unknown[]) {
    const invalidReq = {
      ...REQUEST,
      options: {
        ...REQUEST.options,
        targetSetCount: invalidValue as any,
      },
    }
    assert.throws(
      () => service.execute(invalidReq),
      (error: unknown) => {
        assert.ok(error instanceof AssessmentEngineServiceError)
        assert.equal(error.code, 'INVALID_REQUEST')
        assert.equal(error.field, 'options.targetSetCount')
        return true
      }
    )
  }
}

function rejects_invalid_physical_solver_options(): void {
  const service = new AssessmentEngineService(dependencies())

  // Test invalid values
  for (const invalidValue of [0, -1, 1.5, NaN, Infinity] as unknown[]) {
    const invalidReq = {
      ...REQUEST,
      options: {
        ...REQUEST.options,
        physicalSolver: {
          maxNodesVisited: invalidValue as any,
        },
      },
    }
    assert.throws(
      () => service.execute(invalidReq),
      (error: unknown) => {
        assert.ok(error instanceof AssessmentEngineServiceError)
        assert.equal(error.code, 'INVALID_REQUEST')
        assert.equal(error.field, 'options.physicalSolver.maxNodesVisited')
        return true
      }
    )
  }

  // Test malformed/non-object physicalSolver shape
  for (const invalidShape of [123, 'not-an-object'] as unknown[]) {
    const invalidReq = {
      ...REQUEST,
      options: {
        ...REQUEST.options,
        physicalSolver: invalidShape as any,
      },
    }
    assert.throws(
      () => service.execute(invalidReq),
      (error: unknown) => {
        assert.ok(error instanceof AssessmentEngineServiceError)
        assert.equal(error.code, 'INVALID_REQUEST')
        assert.equal(error.field, 'options.physicalSolver')
        return true
      }
    )
  }

  // null is a special object shape that fails on options.physicalSolver
  const nullReq = {
    ...REQUEST,
    options: {
      ...REQUEST.options,
      physicalSolver: null as any,
    },
  }
  assert.throws(
    () => service.execute(nullReq),
    (error: unknown) => {
      assert.ok(error instanceof AssessmentEngineServiceError)
      assert.equal(error.code, 'INVALID_REQUEST')
      assert.equal(error.field, 'options.physicalSolver')
      return true
    }
  )
}

function accepts_valid_physical_solver_options(): void {
  const service = new AssessmentEngineService(dependencies())
  const originalJSON = JSON.stringify(REQUEST)

  // 1. Omitted physicalSolver passes
  assert.doesNotThrow(() => {
    const res = service.execute(REQUEST)
    assert.equal(res.status, 'Failed') // triggers dependency error, proving validation passed
  })

  // 2. Valid values: 1, 100, 500
  for (const validValue of [1, 100, 500]) {
    const validReq = {
      ...REQUEST,
      options: {
        ...REQUEST.options,
        physicalSolver: {
          maxNodesVisited: validValue,
        },
      },
    }
    assert.doesNotThrow(() => {
      const res = service.execute(validReq)
      assert.equal(res.status, 'Failed') // validation passed
    })
  }

  // 3. Immutability
  assert.equal(JSON.stringify(REQUEST), originalJSON, 'Validation must not mutate request options')
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
  {
    name: 'rejects invalid targetSetCount values',
    fn: rejects_invalid_target_set_count,
  },
  {
    name: 'rejects invalid physicalSolver options',
    fn: rejects_invalid_physical_solver_options,
  },
  {
    name: 'accepts valid physicalSolver options',
    fn: accepts_valid_physical_solver_options,
  },
]

for (const test of tests) {
  test.fn()
  console.log(`✓ ${test.name}`)
}

console.log('AssessmentEngineService tests passed.')
