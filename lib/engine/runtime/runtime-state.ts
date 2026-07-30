/**
 * lib/engine/runtime/runtime-state.ts
 * ----------------------------------------------------------------------------
 * Immutable execution carrier for the Assessment Engine Runtime.
 *
 * Runtime State records orchestration progress and retains references to
 * stage-owned outputs. It contains no stage execution, validation, allocation,
 * scoring, ranking, filtering, persistence, or application behavior.
 */

import type {
  AssemblyResult,
  EngineExecutionMetadata,
  EngineRequest,
} from './contracts'
import {
  RUNTIME_STAGE_ORDER,
  type RuntimeStage,
} from './stage-composition'

/**
 * Compatibility re-export for consumers that imported RuntimeStage from the
 * Runtime State module before Stage Composition became its canonical owner.
 */
export type { RuntimeStage } from './stage-composition'

/**
 * Lifecycle status of one Engine stage within a Runtime execution.
 *
 * Stage status is orchestration metadata only. It does not reinterpret or
 * replace any stage-owned success, failure, warning, or diagnostic contract.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3 and §6
 */
export type StageStatus =
  | 'Pending'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Skipped'

/**
 * Immutable execution record for one Engine stage.
 *
 * Runtime supplies timing values. A pending or skipped stage may have no start
 * time; a non-terminal stage may have no completion time or duration.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3, §6, and §11
 */
export interface StageExecutionState {
  /** Stage represented by this record. */
  readonly stage: RuntimeStage

  /** Current lifecycle status of the stage. */
  readonly status: StageStatus

  /** Caller-supplied ISO-8601 start timestamp, or `null` before start. */
  readonly startedAtIso: string | null

  /** Caller-supplied ISO-8601 completion timestamp, or `null` before finish. */
  readonly completedAtIso: string | null

  /** Caller-measured stage duration, or `null` until one is available. */
  readonly durationMs: number | null
}

/**
 * Immutable quantitative view of Runtime stage progress.
 *
 * Counts are derived only from `StageExecutionState` records. They make no
 * statement about the correctness, feasibility, or completeness of stage
 * business outputs.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §6 and §11
 */
export interface RuntimeProgress {
  /** Total number of stages tracked by this Runtime version. */
  readonly totalStages: number

  /** Number of stages currently in the `Completed` state. */
  readonly completedStages: number

  /** Number of stages currently in the `Pending` state. */
  readonly pendingStages: number

  /** Number of stages currently in the `Failed` state. */
  readonly failedStages: number

  /** Number of stages currently in the `Cancelled` state. */
  readonly cancelledStages: number

  /** Number of stages currently in the `Skipped` state. */
  readonly skippedStages: number

  /** Currently running stage, or `null` when no stage is running. */
  readonly activeStage: RuntimeStage | null
}

/**
 * Append-only immutable snapshot of Runtime State at an orchestration
 * boundary.
 *
 * The snapshot omits the enclosing snapshot history to prevent recursive
 * growth. Stage artifacts remain the exact references owned by their stages;
 * the snapshot does not clone or reinterpret them.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §6.4 and §9
 */
export interface ExecutionSnapshot {
  /** Zero-based append order within the Runtime execution. */
  readonly sequence: number

  /** Caller-supplied ISO-8601 time at which the snapshot was captured. */
  readonly capturedAtIso: string

  /** Runtime State at capture time, excluding prior snapshots. */
  readonly state: Readonly<Omit<RuntimeState, 'snapshots'>>
}

/**
 * Authoritative immutable carrier for one Runtime execution.
 *
 * Runtime owns only lifecycle, progress, and snapshot bookkeeping. Request,
 * execution metadata, warnings, errors, and every stage artifact are composed
 * directly from the canonical Runtime or stage-owned contracts.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3, §6, and §9
 */
export interface RuntimeState {
  /** Immutable request that initiated the execution. */
  readonly request: EngineRequest

  /** Current Engine-level execution state. */
  readonly status: AssemblyResult['status']

  /** Runtime-owned identity, version, and timing metadata. */
  readonly execution: EngineExecutionMetadata

  /** Per-stage lifecycle records keyed by canonical Runtime stage. */
  readonly stages: Readonly<Record<RuntimeStage, StageExecutionState>>

  /** Progress derived from the current stage lifecycle records. */
  readonly progress: RuntimeProgress

  /** Reader-owned output, retained by reference. */
  readonly assemblyRequest: AssemblyResult['assemblyRequest']

  /** Generator-owned output, retained by reference. */
  readonly candidateSet: AssemblyResult['candidateSet']

  /** Scoring-owned outputs, retained by reference. */
  readonly compositeScores: AssemblyResult['compositeScores']

  /** Ranking-owned output, retained by reference. */
  readonly rankedCandidateSet: AssemblyResult['rankedCandidateSet']

  /** Solver-owned output, retained by reference. */
  readonly allocatedCandidateSet: AssemblyResult['allocatedCandidateSet']

  /** Runtime-normalized warnings accumulated without mutation. */
  readonly warnings: AssemblyResult['warnings']

  /** Runtime-normalized errors accumulated without mutation. */
  readonly errors: AssemblyResult['errors']

  /** Append-only execution snapshots. */
  readonly snapshots: readonly ExecutionSnapshot[]
}

/**
 * Creates the initial immutable Runtime State for an accepted request.
 *
 * All stages begin pending, every stage output is absent, diagnostics are
 * empty, and no snapshot is created implicitly.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3 and §6.2
 */
export function createRuntimeState(
  request: EngineRequest,
  execution: EngineExecutionMetadata
): RuntimeState {
  const stages = createInitialStageStates()

  return {
    request,
    status: 'Accepted',
    execution,
    stages,
    progress: deriveRuntimeProgress(stages),
    assemblyRequest: null,
    candidateSet: null,
    compositeScores: [],
    rankedCandidateSet: null,
    allocatedCandidateSet: null,
    warnings: [],
    errors: [],
    snapshots: [],
  }
}

/**
 * Replaces the Engine-level execution state and, optionally, its execution
 * metadata.
 *
 * This helper does not validate transition legality; orchestration owns the
 * decision to request a transition.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §6.2
 */
export function transitionRuntimeState(
  state: RuntimeState,
  status: AssemblyResult['status'],
  execution: EngineExecutionMetadata = state.execution
): RuntimeState {
  return {
    ...state,
    status,
    execution,
  }
}

/**
 * Replaces one stage lifecycle record and derives a fresh progress view.
 *
 * The supplied record is retained as-is. This helper does not validate stage
 * ordering, timestamps, durations, or allowed transition paths.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3 and §6
 */
export function transitionStage(
  state: RuntimeState,
  stageState: StageExecutionState
): RuntimeState {
  const stages: Readonly<Record<RuntimeStage, StageExecutionState>> = {
    ...state.stages,
    [stageState.stage]: stageState,
  }

  return {
    ...state,
    stages,
    progress: deriveRuntimeProgress(stages),
  }
}

/**
 * Returns a new Runtime State carrying the Reader-owned AssemblyRequest.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export function withAssemblyRequest(
  state: RuntimeState,
  assemblyRequest: NonNullable<AssemblyResult['assemblyRequest']>
): RuntimeState {
  return {
    ...state,
    assemblyRequest,
  }
}

/**
 * Returns a new Runtime State carrying the Generator-owned CandidateSet.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export function withCandidateSet(
  state: RuntimeState,
  candidateSet: NonNullable<AssemblyResult['candidateSet']>
): RuntimeState {
  return {
    ...state,
    candidateSet,
  }
}

/**
 * Returns a new Runtime State carrying the Scoring-owned Composite Scores.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export function withCompositeScores(
  state: RuntimeState,
  compositeScores: AssemblyResult['compositeScores']
): RuntimeState {
  return {
    ...state,
    compositeScores,
  }
}

/**
 * Returns a new Runtime State carrying the Ranking-owned RankedCandidateSet.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export function withRankedCandidateSet(
  state: RuntimeState,
  rankedCandidateSet: NonNullable<AssemblyResult['rankedCandidateSet']>
): RuntimeState {
  return {
    ...state,
    rankedCandidateSet,
  }
}

/**
 * Returns a new Runtime State carrying the Solver-owned AllocatedCandidateSet.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export function withAllocatedCandidateSet(
  state: RuntimeState,
  allocatedCandidateSet: NonNullable<AssemblyResult['allocatedCandidateSet']>
): RuntimeState {
  return {
    ...state,
    allocatedCandidateSet,
  }
}

/**
 * Appends normalized Runtime warnings without mutating either input array.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §7.4 and §8
 */
export function appendRuntimeWarnings(
  state: RuntimeState,
  warnings: AssemblyResult['warnings']
): RuntimeState {
  return {
    ...state,
    warnings: [...state.warnings, ...warnings],
  }
}

/**
 * Appends normalized Runtime errors without mutating either input array.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §7.4
 */
export function appendRuntimeErrors(
  state: RuntimeState,
  errors: AssemblyResult['errors']
): RuntimeState {
  return {
    ...state,
    errors: [...state.errors, ...errors],
  }
}

/**
 * Captures and appends an immutable Runtime State snapshot.
 *
 * Snapshot sequence derives only from the append-only snapshot count. No clock
 * or external state is read; the capture timestamp is supplied by the caller.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §6.4 and §9
 */
export function captureExecutionSnapshot(
  state: RuntimeState,
  capturedAtIso: string
): RuntimeState {
  const snapshotState: ExecutionSnapshot['state'] = {
    request: state.request,
    status: state.status,
    execution: state.execution,
    stages: state.stages,
    progress: state.progress,
    assemblyRequest: state.assemblyRequest,
    candidateSet: state.candidateSet,
    compositeScores: state.compositeScores,
    rankedCandidateSet: state.rankedCandidateSet,
    allocatedCandidateSet: state.allocatedCandidateSet,
    warnings: state.warnings,
    errors: state.errors,
  }

  const snapshot: ExecutionSnapshot = {
    sequence: state.snapshots.length,
    capturedAtIso,
    state: snapshotState,
  }

  return {
    ...state,
    snapshots: [...state.snapshots, snapshot],
  }
}

function createInitialStageStates(): Readonly<
  Record<RuntimeStage, StageExecutionState>
> {
  const [reader, generator, scoring, ranking, solver] = RUNTIME_STAGE_ORDER

  return {
    [reader]: createPendingStage(reader),
    [generator]: createPendingStage(generator),
    [scoring]: createPendingStage(scoring),
    [ranking]: createPendingStage(ranking),
    [solver]: createPendingStage(solver),
  }
}

function createPendingStage(stage: RuntimeStage): StageExecutionState {
  return {
    stage,
    status: 'Pending',
    startedAtIso: null,
    completedAtIso: null,
    durationMs: null,
  }
}

function deriveRuntimeProgress(
  stages: Readonly<Record<RuntimeStage, StageExecutionState>>
): RuntimeProgress {
  const orderedStages = RUNTIME_STAGE_ORDER.map((stage) => stages[stage])

  return {
    totalStages: RUNTIME_STAGE_ORDER.length,
    completedStages: countStages(orderedStages, 'Completed'),
    pendingStages: countStages(orderedStages, 'Pending'),
    failedStages: countStages(orderedStages, 'Failed'),
    cancelledStages: countStages(orderedStages, 'Cancelled'),
    skippedStages: countStages(orderedStages, 'Skipped'),
    activeStage:
      orderedStages.find((stage) => stage.status === 'Running')?.stage ?? null,
  }
}

function countStages(
  stages: readonly StageExecutionState[],
  status: StageStatus
): number {
  return stages.filter((stage) => stage.status === status).length
}
