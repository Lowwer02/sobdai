/**
 * Black-box contract tests for GenerateAssessmentAction.
 *
 * RUN: npx jiti lib/application/generate-assessment-action.test.ts
 */

import assert from 'node:assert/strict'

import type {
  EngineRequest,
  EngineRuntimeDependencies,
} from '../engine'
import {
  AssessmentEngineService,
  AssessmentEngineServiceError,
  GenerateAssessmentAction,
} from './index'

const REQUEST: EngineRequest = {
  blueprint: {
    id: 'generate-assessment-action-test',
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
    requestedBy: 'generate-assessment-action-test',
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
    createExecutionId: () => 'generate-assessment-action-test',
    nowIso: () => '2026-01-01T00:00:00.000Z',
    monotonicTimeMs(): number {
      monotonicTime += 1
      return monotonicTime
    },
    isCancellationRequested: () => false,
    ...overrides,
  }
}

function delegates_once_and_returns_engine_response(): void {
  let executionIdCalls = 0
  const action = GenerateAssessmentAction.create(
    dependencies({
      createExecutionId(): string {
        executionIdCalls += 1
        return 'generate-assessment-action-test'
      },
    })
  )

  const response = action.execute(REQUEST)

  assert.equal(executionIdCalls, 1)
  assert.equal(response.status, 'Failed')
  assert.equal(response.errors[0]?.category, 'Dependency Error')
  assert.equal(
    response.execution.executionId,
    'generate-assessment-action-test'
  )
}

function preserves_request_validation_failures(): void {
  const action = new GenerateAssessmentAction(
    new AssessmentEngineService(dependencies())
  )
  const invalidRequest = {
    ...REQUEST,
    context: {
      ...REQUEST.context,
      requestedBy: '',
    },
  }

  assert.throws(
    () => action.execute(invalidRequest),
    (error: unknown) => {
      assert.ok(error instanceof AssessmentEngineServiceError)
      assert.equal(error.code, 'INVALID_REQUEST')
      assert.equal(error.field, 'context.requestedBy')
      return true
    }
  )
}

function preserves_invocation_failures_and_causes(): void {
  const cause = new Error('clock unavailable')
  const action = new GenerateAssessmentAction(
    new AssessmentEngineService(
      dependencies({
        monotonicTimeMs(): number {
          throw cause
        },
      })
    )
  )

  assert.throws(
    () => action.execute(REQUEST),
    (error: unknown) => {
      assert.ok(error instanceof AssessmentEngineServiceError)
      assert.equal(error.code, 'ENGINE_INVOCATION_FAILED')
      assert.equal(error.cause, cause)
      return true
    }
  )
}

const tests: readonly {
  readonly name: string
  readonly fn: () => void
}[] = [
  {
    name: 'delegates once and returns EngineResponse',
    fn: delegates_once_and_returns_engine_response,
  },
  {
    name: 'preserves request validation failures',
    fn: preserves_request_validation_failures,
  },
  {
    name: 'preserves invocation failure causes',
    fn: preserves_invocation_failures_and_causes,
  },
]

for (const test of tests) {
  test.fn()
  console.log(`✓ ${test.name}`)
}

console.log('GenerateAssessmentAction tests passed.')
