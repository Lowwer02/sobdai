/**
 * lib/engine/runtime/run-engine.ts
 * ----------------------------------------------------------------------------
 * Production orchestration entry point for the Assessment Engine.
 *
 * `runEngine()` composes the five production Stage Runtime entry points in the
 * canonical Runtime Stage Composition order. It owns only Runtime lifecycle,
 * immutable Runtime State transitions, diagnostic normalization, execution
 * metadata, and final AssemblyResult construction.
 */

import type {
  FatalDiagnostic,
  GeneratorWarning,
  ShortfallEntry,
} from '../generator/contracts'
import { runGenerator } from '../generator/runtime'
import type {
  RankingDiagnostic,
  RankingWarning,
} from '../ranking/contracts'
import { runRanking } from '../ranking/runtime'
import type { ReaderError } from '../reader/contracts'
import { readBlueprint } from '../reader/reader-output'
import { runScoring } from '../scoring/runtime'
import {
  engineError,
  engineWarning,
  type EngineError,
  type EngineModule,
  type EngineWarning,
  type ErrorCategory,
  type ErrorSeverity,
  type WarningType,
} from '../shared/errors'
import { moduleTiming } from '../shared/observability'
import type {
  SolverDiagnostic,
  SolverWarning,
} from '../solver/contracts'
import { runSolver } from '../solver/run-solver'
import type {
  EngineExecutionMetadata,
  EngineResponse,
  EngineRuntimeDependencies,
  EngineRequest,
} from './contracts'
import {
  RUNTIME_STAGE_ORDER,
  type RuntimeStage,
} from './stage-composition'
import {
  appendRuntimeErrors,
  appendRuntimeWarnings,
  captureExecutionSnapshot,
  createRuntimeState,
  transitionRuntimeState,
  transitionStage,
  withAllocatedCandidateSet,
  withAssemblyRequest,
  withCandidateSet,
  withCompositeScores,
  withRankedCandidateSet,
  type RuntimeState,
  type StageStatus,
} from './runtime-state'

const RUNTIME_API_VERSION = '1.0'
const ENGINE_VERSION = '1.0.0'

const RUNTIME_MODULE_VERSIONS: EngineExecutionMetadata['moduleVersions'] = {
  reader: '1.0.0',
  generator: '1.0.0',
  scoring: '1.0',
  ranking: '1.0.0',
  allocation: '1.0',
  solver: '1.0.0',
}

type StageExecutionOutcome =
  | {
      readonly ok: true
      readonly state: RuntimeState
    }
  | {
      readonly ok: false
      readonly state: RuntimeState
    }

/**
 * Executes one complete Assessment Engine pipeline.
 *
 * The canonical stage order is read directly from `RUNTIME_STAGE_ORDER`.
 * Every stage is invoked only through its production Runtime entry point, and
 * every emitted artifact is retained through immutable Runtime State helpers.
 *
 * Fatal stage outcomes and unexpected exceptions are returned as a failed
 * EngineResponse. Cooperative cancellation is observed only between stages,
 * after the preceding stage's atomic execution has completed.
 *
 * @param request Authoritative Engine request for one execution.
 * @param dependencies Injected Blueprint, Bank, clock, identity,
 * observability, and cancellation capabilities.
 * @returns The final AssemblyResult-compatible Engine response.
 */
export function runEngine(
  request: EngineRequest,
  dependencies: EngineRuntimeDependencies
): EngineResponse {
  const executionStartedAtMs = dependencies.monotonicTimeMs()
  const startedAtIso = dependencies.nowIso()
  const execution = createExecutionMetadata(
    request,
    dependencies.createExecutionId(),
    startedAtIso
  )

  let state = createRuntimeState(request, execution)
  state = transitionRuntimeState(state, 'Running', execution)
  state = captureExecutionSnapshot(state, startedAtIso)

  for (const stage of RUNTIME_STAGE_ORDER) {
    if (dependencies.isCancellationRequested()) {
      return assembleEngineResponse(
        cancelExecution(
          state,
          stage,
          executionStartedAtMs,
          dependencies
        )
      )
    }

    const stageStartedAtMs = dependencies.monotonicTimeMs()
    const stageStartedAtIso = dependencies.nowIso()
    state = transitionStage(state, {
      stage,
      status: 'Running',
      startedAtIso: stageStartedAtIso,
      completedAtIso: null,
      durationMs: null,
    })
    state = captureExecutionSnapshot(state, stageStartedAtIso)

    let outcome: StageExecutionOutcome
    try {
      outcome = executeStage(stage, state, dependencies)
    } catch (error: unknown) {
      outcome = {
        ok: false,
        state: appendRuntimeErrors(state, [
          unexpectedStageError(stage, error),
        ]),
      }
    }

    const completedAtIso = dependencies.nowIso()
    const durationMs =
      dependencies.monotonicTimeMs() - stageStartedAtMs
    state = finishStage(
      outcome.state,
      stage,
      outcome.ok ? 'Completed' : 'Failed',
      completedAtIso,
      durationMs
    )
    dependencies.observability.emit(
      moduleTiming(stage, durationMs, state.execution.executionId)
    )
    state = captureExecutionSnapshot(state, completedAtIso)

    if (!outcome.ok) {
      state = skipStagesAfter(state, stage)
      state = finishExecution(
        state,
        'Failed',
        executionStartedAtMs,
        dependencies
      )
      return assembleEngineResponse(state)
    }
  }

  state = finishExecution(
    state,
    state.warnings.length > 0
      ? 'Completed With Warnings'
      : 'Completed',
    executionStartedAtMs,
    dependencies
  )

  return assembleEngineResponse(state)
}

function executeStage(
  stage: RuntimeStage,
  state: RuntimeState,
  dependencies: EngineRuntimeDependencies
): StageExecutionOutcome {
  switch (stage) {
    case 'Reader':
      return executeReader(state, dependencies)
    case 'Generator':
      return executeGenerator(state, dependencies)
    case 'Scoring':
      return executeScoring(state)
    case 'Ranking':
      return executeRanking(state)
    case 'Solver':
      return executeSolver(state)
  }
}

function executeReader(
  state: RuntimeState,
  dependencies: EngineRuntimeDependencies
): StageExecutionOutcome {
  let source: string
  try {
    source = dependencies.readBlueprintSource(state.request.blueprint)
  } catch (error: unknown) {
    return {
      ok: false,
      state: appendRuntimeErrors(state, [
        engineError({
          category: 'Dependency Error',
          location: 'Reader:Blueprint source',
          severity: 'fatal',
          explanation:
            `Blueprint source resolution failed: ${errorMessage(error)}.`,
          recommendation:
            'Restore access to the exact referenced Blueprint version and retry the Engine execution.',
          module: 'Reader',
        }),
      ]),
    }
  }

  const result = readBlueprint(source, {
    timestampIso: state.execution.startedAtIso,
  })
  let nextState = withModuleVersions(state, {
    reader: result.executionMeta.readerVersion,
  })
  nextState = appendRuntimeWarnings(
    nextState,
    result.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'warning')
      .map(readerWarning)
  )

  if (!result.ok) {
    const errors = result.diagnostics
      .filter((diagnostic) => diagnostic.severity !== 'warning')
      .map(readerError)

    return {
      ok: false,
      state: appendRuntimeErrors(
        nextState,
        errors.length > 0
          ? errors
          : [
              engineError({
                category: 'Blueprint Error',
                location: 'Reader:Blueprint source',
                severity: 'fatal',
                explanation:
                  'Reader rejected the Blueprint before an AssemblyRequest could be produced.',
                recommendation:
                  'Provide a non-empty Blueprint that conforms to the supported Blueprint schema.',
                module: 'Reader',
              }),
            ]
      ),
    }
  }

  return {
    ok: true,
    state: withAssemblyRequest(nextState, result.assemblyRequest),
  }
}

function executeGenerator(
  state: RuntimeState,
  dependencies: EngineRuntimeDependencies
): StageExecutionOutcome {
  if (state.assemblyRequest === null) {
    return runtimeInvariantFailure(
      state,
      'Generator',
      'Reader completed without an AssemblyRequest.'
    )
  }

  const result = runGenerator({
    assemblyRequest: state.assemblyRequest,
    bank: dependencies.questionBank,
    identity: {
      assemblyRequestId:
        state.assemblyRequest.identity.blueprint_id,
      generatedAt: state.stages.Generator.startedAtIso,
      bankStateHash: null,
    },
    expansionOptions: {
      headroomFactor: state.request.options.overFetchFactor,
      sink: dependencies.observability,
    },
  })

  if (!result.ok) {
    return {
      ok: false,
      state: appendRuntimeErrors(
        state,
        result.fatalDiagnostics.map(generatorError)
      ),
    }
  }

  let nextState = withCandidateSet(state, result.candidateSet)
  nextState = withModuleVersions(nextState, {
    generator: result.candidateSet.meta.generatorVersion,
  })
  nextState = appendRuntimeWarnings(nextState, [
    ...result.candidateSet.warnings.map(generatorWarning),
    ...result.candidateSet.shortfallReport.entries.map(shortfallWarning),
  ])

  return {
    ok: true,
    state: nextState,
  }
}

function executeScoring(
  state: RuntimeState
): StageExecutionOutcome {
  if (state.candidateSet === null) {
    return runtimeInvariantFailure(
      state,
      'Scoring',
      'Generator completed without a CandidateSet.'
    )
  }

  const output = runScoring(state.candidateSet)
  return {
    ok: true,
    state: withCompositeScores(
      state,
      output.composites.composites
    ),
  }
}

function executeRanking(
  state: RuntimeState
): StageExecutionOutcome {
  if (state.candidateSet === null) {
    return runtimeInvariantFailure(
      state,
      'Ranking',
      'Ranking started without a CandidateSet.'
    )
  }

  const result = runRanking({
    candidateSet: state.candidateSet,
    compositeScores: state.compositeScores,
  })
  if (!result.ok) {
    return {
      ok: false,
      state: appendRuntimeErrors(
        state,
        result.fatalDiagnostics.map(rankingError)
      ),
    }
  }

  let nextState = withRankedCandidateSet(
    state,
    result.rankedCandidateSet
  )
  nextState = withModuleVersions(nextState, {
    scoring:
      result.rankedCandidateSet.meta.scoringModelVersion,
    ranking: result.rankedCandidateSet.meta.rankingVersion,
  })
  nextState = appendRuntimeWarnings(
    nextState,
    result.rankedCandidateSet.warnings
      .filter(isRankingWarning)
      .map(rankingWarning)
  )

  return {
    ok: true,
    state: nextState,
  }
}

function executeSolver(
  state: RuntimeState
): StageExecutionOutcome {
  if (state.rankedCandidateSet === null) {
    return runtimeInvariantFailure(
      state,
      'Solver',
      'Ranking completed without a RankedCandidateSet.'
    )
  }

  const result = runSolver(state.rankedCandidateSet)
  if (!result.ok) {
    return {
      ok: false,
      state: appendRuntimeErrors(
        state,
        result.fatalDiagnostics.map(solverError)
      ),
    }
  }

  let nextState = withAllocatedCandidateSet(
    state,
    result.allocatedCandidateSet
  )
  nextState = withModuleVersions(nextState, {
    allocation:
      result.allocatedCandidateSet.meta.allocationModelVersion,
    solver: result.allocatedCandidateSet.meta.solverVersion,
  })
  nextState = appendRuntimeWarnings(nextState, [
    ...result.allocatedCandidateSet.warnings
      .filter(isSolverWarning)
      .map(solverWarning),
    ...allocationShortfallWarnings(
      result.allocatedCandidateSet.shortfallSummary
    ),
  ])

  return {
    ok: true,
    state: nextState,
  }
}

function createExecutionMetadata(
  request: EngineRequest,
  executionId: string,
  startedAtIso: string
): EngineExecutionMetadata {
  return {
    executionId,
    runtimeApiVersion: RUNTIME_API_VERSION,
    engineVersion: ENGINE_VERSION,
    blueprintId: request.blueprint.id,
    blueprintVersion: request.blueprint.version,
    startedAtIso,
    completedAtIso: null,
    durationMs: null,
    moduleVersions: RUNTIME_MODULE_VERSIONS,
    moduleDurationsMs: {},
  }
}

function finishStage(
  state: RuntimeState,
  stage: RuntimeStage,
  status: Extract<StageStatus, 'Completed' | 'Failed'>,
  completedAtIso: string,
  durationMs: number
): RuntimeState {
  let nextState = transitionStage(state, {
    stage,
    status,
    startedAtIso: state.stages[stage].startedAtIso,
    completedAtIso,
    durationMs,
  })
  nextState = transitionRuntimeState(
    nextState,
    nextState.status,
    withModuleDuration(
      nextState.execution,
      stage,
      durationMs
    )
  )
  return nextState
}

function cancelExecution(
  state: RuntimeState,
  stage: RuntimeStage,
  executionStartedAtMs: number,
  dependencies: EngineRuntimeDependencies
): RuntimeState {
  const completedAtIso = dependencies.nowIso()
  let nextState = transitionStage(state, {
    stage,
    status: 'Cancelled',
    startedAtIso: null,
    completedAtIso,
    durationMs: null,
  })
  nextState = skipStagesAfter(nextState, stage)
  return finishExecution(
    nextState,
    'Cancelled',
    executionStartedAtMs,
    dependencies,
    completedAtIso
  )
}

function skipStagesAfter(
  state: RuntimeState,
  terminalStage: RuntimeStage
): RuntimeState {
  const terminalIndex =
    RUNTIME_STAGE_ORDER.indexOf(terminalStage)
  let nextState = state

  for (const stage of RUNTIME_STAGE_ORDER.slice(terminalIndex + 1)) {
    nextState = transitionStage(nextState, {
      stage,
      status: 'Skipped',
      startedAtIso: null,
      completedAtIso: null,
      durationMs: null,
    })
  }

  return nextState
}

function finishExecution(
  state: RuntimeState,
  status: Extract<
    EngineResponse['status'],
    | 'Completed'
    | 'Completed With Warnings'
    | 'Failed'
    | 'Cancelled'
  >,
  executionStartedAtMs: number,
  dependencies: EngineRuntimeDependencies,
  completedAtIso = dependencies.nowIso()
): RuntimeState {
  const execution: EngineExecutionMetadata = {
    ...state.execution,
    completedAtIso,
    durationMs:
      dependencies.monotonicTimeMs() - executionStartedAtMs,
  }
  const nextState = transitionRuntimeState(
    state,
    status,
    execution
  )
  return captureExecutionSnapshot(nextState, completedAtIso)
}

function withModuleDuration(
  execution: EngineExecutionMetadata,
  stage: RuntimeStage,
  durationMs: number
): EngineExecutionMetadata {
  const moduleDurationsMs = execution.moduleDurationsMs

  switch (stage) {
    case 'Reader':
      return {
        ...execution,
        moduleDurationsMs: {
          ...moduleDurationsMs,
          reader: durationMs,
        },
      }
    case 'Generator':
      return {
        ...execution,
        moduleDurationsMs: {
          ...moduleDurationsMs,
          generator: durationMs,
        },
      }
    case 'Scoring':
      return {
        ...execution,
        moduleDurationsMs: {
          ...moduleDurationsMs,
          scoring: durationMs,
        },
      }
    case 'Ranking':
      return {
        ...execution,
        moduleDurationsMs: {
          ...moduleDurationsMs,
          ranking: durationMs,
        },
      }
    case 'Solver':
      return {
        ...execution,
        moduleDurationsMs: {
          ...moduleDurationsMs,
          solver: durationMs,
        },
      }
  }
}

function withModuleVersions(
  state: RuntimeState,
  versions: Partial<
    EngineExecutionMetadata['moduleVersions']
  >
): RuntimeState {
  return transitionRuntimeState(state, state.status, {
    ...state.execution,
    moduleVersions: {
      ...state.execution.moduleVersions,
      ...versions,
    },
  })
}

function runtimeInvariantFailure(
  state: RuntimeState,
  stage: RuntimeStage,
  explanation: string
): StageExecutionOutcome {
  return {
    ok: false,
    state: appendRuntimeErrors(state, [
      engineError({
        category: 'Runtime Error',
        location: `Runtime API:${stage} transition`,
        severity: 'fatal',
        explanation,
        recommendation:
          'Inspect the Runtime orchestration state transition and restore the required upstream artifact.',
        module: 'Runtime API',
      }),
    ]),
  }
}

function readerError(diagnostic: ReaderError): EngineError {
  return engineError({
    category: 'Blueprint Error',
    location: readerLocation(diagnostic),
    severity: diagnostic.severity,
    explanation: diagnostic.explanation,
    recommendation: diagnostic.recommendation,
    module: 'Reader',
  })
}

function readerWarning(
  diagnostic: ReaderError
): EngineWarning {
  return engineWarning({
    type: 'Deprecated Blueprint',
    location: readerLocation(diagnostic),
    explanation: diagnostic.explanation,
    recommendation: diagnostic.recommendation,
    module: 'Reader',
  })
}

function readerLocation(diagnostic: ReaderError): string {
  const { startLine, endLine } = diagnostic.location
  return startLine === endLine
    ? `Reader:line ${startLine}`
    : `Reader:lines ${startLine}-${endLine}`
}

function generatorError(
  diagnostic: FatalDiagnostic
): EngineError {
  const category: ErrorCategory =
    diagnostic.category === 'bank_unreachable' ||
    diagnostic.category === 'missing_required_axis'
      ? 'Dependency Error'
      : diagnostic.category === 'document_registry_mismatch'
        ? 'Blueprint Error'
        : 'Runtime Error'

  return engineError({
    category,
    location: `Generator:${diagnostic.category}`,
    severity: 'fatal',
    explanation: diagnostic.explanation,
    recommendation: diagnostic.recommendation,
    module: 'Generator',
  })
}

function generatorWarning(
  warning: GeneratorWarning
): EngineWarning {
  return engineWarning({
    type:
      warning.axis === 'coverage'
        ? 'Coverage Warning'
        : 'Shortfall',
    location: `Generator:${warning.axis ?? 'run'}`,
    explanation: warning.explanation,
    recommendation: warning.recommendation,
    module: 'Generator',
  })
}

function shortfallWarning(
  shortfall: ShortfallEntry
): EngineWarning {
  return engineWarning({
    type:
      shortfall.axis === 'coverage'
        ? 'Coverage Warning'
        : 'Shortfall',
    location:
      shortfall.setNumber === null
        ? `Generator:${shortfall.axis}`
        : `Generator:${shortfall.axis}:set ${shortfall.setNumber}`,
    explanation: shortfall.explanation,
    recommendation: shortfall.recommendation,
    module: 'Generator',
  })
}

function rankingError(
  diagnostic: RankingDiagnostic
): EngineError {
  return engineError({
    category:
      diagnostic.category === 'version_mismatch'
        ? 'Version Error'
        : 'Runtime Error',
    location: diagnosticLocation(
      'Ranking',
      diagnostic.stage,
      diagnostic.slotId,
      diagnostic.code,
      diagnostic.componentId
    ),
    severity: diagnosticSeverity(diagnostic.severity),
    explanation: diagnostic.explanation,
    recommendation: diagnostic.recommendation,
    module: 'Ranking',
  })
}

function rankingWarning(
  warning: RankingWarning
): EngineWarning {
  return engineWarning({
    type:
      warning.category === 'incomplete_candidate'
        ? 'Incomplete Metadata'
        : 'Reduced Confidence',
    location: diagnosticLocation(
      'Ranking',
      warning.stage,
      warning.slotId,
      warning.code,
      null
    ),
    explanation: warning.explanation,
    recommendation: warning.recommendation,
    module: 'Ranking',
  })
}

function solverError(
  diagnostic: SolverDiagnostic
): EngineError {
  const category: ErrorCategory =
    diagnostic.category === 'version_mismatch'
      ? 'Version Error'
      : diagnostic.category === 'runtime_inconsistency' ||
          diagnostic.category === 'invalid_runtime_state' ||
          diagnostic.category === 'corrupted_allocation'
        ? 'Runtime Error'
        : 'Constraint Error'

  return engineError({
    category,
    location: diagnosticLocation(
      'Solver',
      diagnostic.stage,
      diagnostic.slotId,
      diagnostic.candidateCode,
      diagnostic.componentId
    ),
    severity: diagnosticSeverity(diagnostic.severity),
    explanation: diagnostic.explanation,
    recommendation: diagnostic.recommendation,
    module: 'Solver',
  })
}

function solverWarning(
  warning: SolverWarning
): EngineWarning {
  return engineWarning({
    type: solverWarningType(warning),
    location: diagnosticLocation(
      'Solver',
      warning.stage,
      warning.slotId,
      warning.candidateCode,
      null
    ),
    explanation: warning.explanation,
    recommendation: warning.recommendation,
    module: 'Solver',
  })
}

function solverWarningType(
  warning: SolverWarning
): WarningType {
  if (warning.category === 'coverage') {
    return 'Coverage Warning'
  }
  if (warning.category === 'distribution') {
    return 'Distribution Warning'
  }
  return 'Shortfall'
}

function allocationShortfallWarnings(
  summary: NonNullable<
    EngineResponse['allocatedCandidateSet']
  >['shortfallSummary']
): readonly EngineWarning[] {
  if (
    summary.rejectedSlotCount === 0 &&
    summary.unresolvedConflictCount === 0 &&
    summary.strainedSoftConstraintCount === 0
  ) {
    return []
  }

  return [
    engineWarning({
      type: 'Shortfall',
      location: 'Solver:allocation',
      explanation: summary.summary,
      recommendation:
        'Review rejected Slots, unresolved Conflicts, and strained Soft Constraints in the AllocatedCandidateSet.',
      module: 'Solver',
    }),
  ]
}

function isRankingWarning(
  warning:
    | GeneratorWarning
    | RankingWarning
): warning is RankingWarning {
  return warning.severity === 'Non-fatal'
}

function isSolverWarning(
  warning:
    | GeneratorWarning
    | RankingWarning
    | SolverWarning
): warning is SolverWarning {
  return (
    warning.severity === 'Non-fatal' &&
    'candidateCode' in warning
  )
}

function diagnosticSeverity(
  severity: 'Fatal' | 'Non-fatal'
): ErrorSeverity {
  return severity === 'Fatal' ? 'fatal' : 'blocking'
}

function diagnosticLocation(
  module: Extract<EngineModule, 'Ranking' | 'Solver'>,
  stage: string,
  slotId: string | null,
  candidateCode: string | null,
  componentId: string | null
): string {
  const details = [
    slotId === null ? null : `slot ${slotId}`,
    candidateCode === null
      ? null
      : `candidate ${candidateCode}`,
    componentId === null ? null : `component ${componentId}`,
  ].filter((detail): detail is string => detail !== null)

  return details.length === 0
    ? `${module}:${stage}`
    : `${module}:${stage}:${details.join(':')}`
}

function unexpectedStageError(
  stage: RuntimeStage,
  error: unknown
): EngineError {
  return engineError({
    category: 'Runtime Error',
    location: `${stage}:runtime`,
    severity: 'fatal',
    explanation:
      `${stage} Runtime failed unexpectedly: ${errorMessage(error)}.`,
    recommendation:
      `Inspect the ${stage} Runtime diagnostic and restore a valid deterministic stage execution.`,
    module: stage,
  })
}

function assembleEngineResponse(
  state: RuntimeState
): EngineResponse {
  return {
    status: state.status,
    assemblyRequest: state.assemblyRequest,
    candidateSet: state.candidateSet,
    compositeScores: state.compositeScores,
    rankedCandidateSet: state.rankedCandidateSet,
    allocatedCandidateSet: state.allocatedCandidateSet,
    warnings: state.warnings,
    errors: state.errors,
    execution: state.execution,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
