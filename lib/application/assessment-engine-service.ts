/**
 * Canonical Application Service boundary for the Assessment Engine.
 *
 * The service validates Application-owned input concerns, invokes the Engine
 * exclusively through its public API, and translates exceptions that escape
 * the Engine boundary. Engine diagnostics returned in an EngineResponse remain
 * authoritative data and are never re-modeled here.
 */

import {
  runEngine,
  type EngineRequest,
  type EngineResponse,
  type EngineRuntimeDependencies,
} from '../engine'

export type AssessmentEngineServiceErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'ENGINE_INVOCATION_FAILED'

/**
 * Application-level failure raised before an EngineResponse can be returned.
 *
 * Engine `Failed`, `Invalid`, and `Cancelled` outcomes are not represented by
 * this error. They remain normal EngineResponse values with Engine-owned
 * diagnostics.
 */
export class AssessmentEngineServiceError extends Error {
  public readonly name = 'AssessmentEngineServiceError'

  public constructor(
    public readonly code: AssessmentEngineServiceErrorCode,
    message: string,
    public readonly field: string | null = null,
    public readonly cause?: unknown
  ) {
    super(message)
  }
}

/**
 * The only Application Layer entry point that executes the Assessment Engine.
 *
 * Runtime dependencies are supplied by a future composition root. This class
 * owns no persistence, transport, framework, or Engine orchestration logic.
 */
export class AssessmentEngineService {
  public constructor(
    private readonly dependencies: EngineRuntimeDependencies
  ) {
    validateDependencies(dependencies)
  }

  /**
   * Validates the public request at the Application boundary and executes one
   * complete Engine run.
   */
  public execute(request: EngineRequest): EngineResponse {
    validateRequest(request)

    try {
      return runEngine(request, this.dependencies)
    } catch (cause: unknown) {
      throw new AssessmentEngineServiceError(
        'ENGINE_INVOCATION_FAILED',
        'Assessment Engine execution ended before an EngineResponse was returned.',
        null,
        cause
      )
    }
  }
}

function validateDependencies(
  dependencies: EngineRuntimeDependencies
): void {
  const value: unknown = dependencies
  if (!isRecord(value)) {
    invalidConfiguration('dependencies')
  }

  assertFunction(value.readBlueprintSource, 'dependencies.readBlueprintSource')
  assertFunction(value.createExecutionId, 'dependencies.createExecutionId')
  assertFunction(value.nowIso, 'dependencies.nowIso')
  assertFunction(value.monotonicTimeMs, 'dependencies.monotonicTimeMs')
  assertFunction(
    value.isCancellationRequested,
    'dependencies.isCancellationRequested'
  )

  if (!isRecord(value.questionBank)) {
    invalidConfiguration('dependencies.questionBank')
  }
  assertFunction(
    value.questionBank.readMetadata,
    'dependencies.questionBank.readMetadata'
  )

  if (!isRecord(value.observability)) {
    invalidConfiguration('dependencies.observability')
  }
  assertFunction(
    value.observability.emit,
    'dependencies.observability.emit'
  )
}

function validateRequest(request: EngineRequest): void {
  const value: unknown = request
  if (!isRecord(value)) {
    invalidRequest('request')
  }

  if (!isRecord(value.blueprint)) {
    invalidRequest('blueprint')
  }
  assertNonBlankString(value.blueprint.id, 'blueprint.id')
  assertNonBlankString(value.blueprint.version, 'blueprint.version')

  if (value.profile !== 'simulation') {
    invalidRequest('profile')
  }
  if (value.runUnit !== 'blueprint') {
    invalidRequest('runUnit')
  }

  if (!isRecord(value.runtimeCompatibility)) {
    invalidRequest('runtimeCompatibility')
  }
  assertNonBlankString(
    value.runtimeCompatibility.targetVersion,
    'runtimeCompatibility.targetVersion'
  )
  assertNullableNonBlankString(
    value.runtimeCompatibility.minimumVersion,
    'runtimeCompatibility.minimumVersion'
  )

  if (!isRecord(value.options)) {
    invalidRequest('options')
  }
  assertPositiveFiniteNumber(
    value.options.overFetchFactor,
    'options.overFetchFactor'
  )
  assertNullableNonNegativeFiniteNumber(
    value.options.performanceBudgetMs,
    'options.performanceBudgetMs'
  )
  assertNullablePositiveInteger(
    value.options.parallelismHint,
    'options.parallelismHint'
  )
  if (
    value.options.auditVerbosity !== 'summary' &&
    value.options.auditVerbosity !== 'full'
  ) {
    invalidRequest('options.auditVerbosity')
  }

  if (!isRecord(value.context)) {
    invalidRequest('context')
  }
  assertNonBlankString(value.context.requestedBy, 'context.requestedBy')
  assertIsoTimestamp(
    value.context.submittedAtIso,
    'context.submittedAtIso'
  )
  assertNullableNonBlankString(
    value.context.correlationId,
    'context.correlationId'
  )
  assertNullableNonBlankString(value.context.traceId, 'context.traceId')
  assertNullableNonBlankString(
    value.context.parentSpanId,
    'context.parentSpanId'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertFunction(
  value: unknown,
  field: string
): asserts value is (...args: never[]) => unknown {
  if (typeof value !== 'function') {
    invalidConfiguration(field)
  }
}

function assertNonBlankString(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidRequest(field)
  }
}

function assertNullableNonBlankString(
  value: unknown,
  field: string
): asserts value is string | null {
  if (
    value !== null &&
    (typeof value !== 'string' || value.trim().length === 0)
  ) {
    invalidRequest(field)
  }
}

function assertPositiveFiniteNumber(
  value: unknown,
  field: string
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    invalidRequest(field)
  }
}

function assertNullableNonNegativeFiniteNumber(
  value: unknown,
  field: string
): asserts value is number | null {
  if (
    value !== null &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0)
  ) {
    invalidRequest(field)
  }
}

function assertNullablePositiveInteger(
  value: unknown,
  field: string
): asserts value is number | null {
  if (
    value !== null &&
    (typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value <= 0)
  ) {
    invalidRequest(field)
  }
}

function assertIsoTimestamp(
  value: unknown,
  field: string
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Number.isNaN(Date.parse(value))
  ) {
    invalidRequest(field)
  }
}

function invalidConfiguration(field: string): never {
  throw new AssessmentEngineServiceError(
    'INVALID_CONFIGURATION',
    `Assessment Engine Service configuration is invalid at "${field}".`,
    field
  )
}

function invalidRequest(field: string): never {
  throw new AssessmentEngineServiceError(
    'INVALID_REQUEST',
    `Assessment Engine request is invalid at "${field}".`,
    field
  )
}
