/**
 * lib/engine/runtime/contracts.ts
 * ----------------------------------------------------------------------------
 * Canonical public contracts for one Assessment Engine execution.
 *
 * Runtime owns orchestration state and metadata only. Every deterministic
 * domain artifact is composed from the stage that already owns it; no Reader,
 * Generator, Scoring, Ranking, or Solver model is redefined here.
 */

import type { CandidateSet } from '../generator/contracts'
import type { RankedCandidateSet } from '../ranking/contracts'
import type { AssemblyRequest } from '../reader/contracts'
import type { CompositeScore } from '../scoring/contracts'
import type {
  AssessmentProfile,
  RunUnit,
} from '../shared/assessment-vocabulary'
import type {
  EngineError,
  EngineWarning,
  ExecutionState,
} from '../shared/errors'
import type { ObservabilitySink } from '../shared/observability'
import type { BankReadAdapter } from '../shared/question-bank'
import type { AllocatedCandidateSet } from '../solver/contracts'

/**
 * Application-supplied metadata about the environment in which an Engine
 * execution was requested.
 *
 * Context is audit and tracing metadata. It must never influence deterministic
 * allocation decisions.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §4.2 and §4.6
 */
export interface EngineRuntimeContext {
  /** Stable identity of the actor or system requesting the execution. */
  readonly requestedBy: string

  /** Caller-supplied ISO-8601 submission timestamp used for audit. */
  readonly submittedAtIso: string

  /** Optional identifier correlating the execution across application systems. */
  readonly correlationId: string | null

  /** Optional distributed-trace identifier. */
  readonly traceId: string | null

  /** Optional parent span identifier associated with `traceId`. */
  readonly parentSpanId: string | null
}

/**
 * Application-selectable controls for how one Engine execution is performed.
 *
 * These options may affect resource usage, audit detail, or honestly reported
 * completeness. They must never weaken correctness constraints or change the
 * meaning of an allocation.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §4.3
 */
export interface EngineExecutionOptions {
  /** Bounded Generator/Solver headroom multiplier requested for the execution. */
  readonly overFetchFactor: number

  /**
   * Maximum execution budget in milliseconds, or `null` when no caller budget
   * is imposed.
   */
  readonly performanceBudgetMs: number | null

  /**
   * Preferred execution parallelism, or `null` when the Runtime should select
   * its normal execution strategy.
   */
  readonly parallelismHint: number | null

  /** Audit detail requested in the Assembly Result. */
  readonly auditVerbosity: 'summary' | 'full'

  /** Target number of sets to produce (1–5). Defaults to 5 if omitted. */
  readonly targetSetCount?: 1 | 2 | 3 | 4 | 5
}

/**
 * Authoritative input contract for one Assessment Engine execution.
 *
 * The request identifies a Blueprint; it does not contain Blueprint source,
 * Question Bank rows, stage outputs, infrastructure clients, or selection
 * decisions. Deterministic execution fields are kept separate from
 * `context`, which is application metadata only.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §4
 */
export interface EngineRequest {
  /** Stable reference to the exact Blueprint version to execute. */
  readonly blueprint: {
    /** Stable Blueprint identifier. */
    readonly id: string
    /** Exact Blueprint version requested by the caller. */
    readonly version: string
  }

  /** Assessment profile declared for this execution. */
  readonly profile: AssessmentProfile

  /** Unit produced by the execution. */
  readonly runUnit: RunUnit

  /** Runtime API compatibility range declared by the caller. */
  readonly runtimeCompatibility: {
    /** Runtime API version against which the caller was built. */
    readonly targetVersion: string
    /** Minimum acceptable Runtime API version, or `null` when unspecified. */
    readonly minimumVersion: string | null
  }

  /** Determinism-preserving execution controls. */
  readonly options: EngineExecutionOptions

  /** Non-deterministic application and trace metadata. */
  readonly context: EngineRuntimeContext
}

/**
 * Injected external capabilities required by Runtime orchestration.
 *
 * Runtime owns this dependency boundary. Implementations belong outside the
 * Engine and may access storage, clocks, tracing systems, or cancellation
 * state. Stage algorithms remain statically owned by their Engine modules and
 * are intentionally not reproduced as injectable business-logic callbacks.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §2.4, §4, and §11
 */
export interface EngineRuntimeDependencies {
  /**
   * Resolves the exact referenced Blueprint to its source document.
   *
   * The resolver must honor both Blueprint id and version and must not return a
   * mutable or floating version.
   */
  readonly readBlueprintSource: (
    reference: EngineRequest['blueprint']
  ) => string

  /** Read-only production ingress for the Question Bank metadata snapshot. */
  readonly questionBank: BankReadAdapter

  /**
   * Destination for Runtime and stage observability events.
   *
   * The sink is best-effort and must not alter Engine outcomes.
   */
  readonly observability: ObservabilitySink

  /** Creates the unique identifier attached to one execution. */
  readonly createExecutionId: () => string

  /** Supplies an ISO-8601 timestamp without allowing stages to read the clock. */
  readonly nowIso: () => string

  /**
   * Supplies a monotonic millisecond value used only for duration measurement.
   */
  readonly monotonicTimeMs: () => number

  /**
   * Reports whether cooperative cancellation has been requested.
   *
   * Runtime may inspect this only at orchestration boundaries; stage
   * algorithms remain deterministic and unchanged.
   */
  readonly isCancellationRequested: () => boolean
}

/**
 * Runtime-owned execution and version metadata attached to an Assembly Result.
 *
 * Timing and identifiers describe the run but do not participate in
 * deterministic stage decisions. A `null` completion timestamp or duration is
 * valid for non-terminal snapshots.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §4.4, §5.8, §10,
 *       and §11
 */
export interface EngineExecutionMetadata {
  /** Unique identifier for this execution. */
  readonly executionId: string

  /** Runtime API contract version used for the execution. */
  readonly runtimeApiVersion: string

  /** Encapsulated Engine implementation version. */
  readonly engineVersion: string

  /** Blueprint identifier resolved for the execution. */
  readonly blueprintId: string

  /** Exact Blueprint version resolved for the execution. */
  readonly blueprintVersion: string

  /** ISO-8601 timestamp at which execution entered the Running state. */
  readonly startedAtIso: string | null

  /** ISO-8601 timestamp at which execution reached a terminal state. */
  readonly completedAtIso: string | null

  /** Total measured execution duration, or `null` before termination. */
  readonly durationMs: number | null

  /** Internal version stack recorded for reproducibility. */
  readonly moduleVersions: {
    /** Reader implementation version. */
    readonly reader: string
    /** Generator implementation version. */
    readonly generator: string
    /** Scoring Model version. */
    readonly scoring: string
    /** Ranking implementation version. */
    readonly ranking: string
    /** Allocation Model version spoken by Solver. */
    readonly allocation: string
    /** Solver implementation version. */
    readonly solver: string
  }

  /**
   * Measured duration for every module that ran.
   *
   * Missing properties identify modules that had not started or were skipped
   * after an earlier terminal failure.
   */
  readonly moduleDurationsMs: {
    readonly reader?: number
    readonly generator?: number
    readonly scoring?: number
    readonly ranking?: number
    readonly solver?: number
  }
}

/**
 * Authoritative output of one Runtime execution.
 *
 * Stage artifacts are referenced through their existing owner contracts.
 * Nullable artifacts indicate that execution terminated before that stage
 * emitted an output. `compositeScores` is empty when Scoring did not emit an
 * output because Scoring owns `CompositeScore` but has no parallel run-level
 * wrapper contract.
 *
 * Warnings, errors, shortfalls, coverage information, and decision audit remain
 * available through the composed stage artifacts and the normalized Runtime
 * warning/error collections. Runtime never reconstructs those domain models.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §5–§9
 */
export interface AssemblyResult {
  /** Terminal or observable execution state represented by this result. */
  readonly status: ExecutionState

  /** Reader-owned output, or `null` when Reader did not emit it. */
  readonly assemblyRequest: AssemblyRequest | null

  /** Generator-owned output, or `null` when Generator did not emit it. */
  readonly candidateSet: CandidateSet | null

  /** Scoring-owned Composite Scores emitted before Ranking. */
  readonly compositeScores: readonly CompositeScore[]

  /** Ranking-owned output, or `null` when Ranking did not emit it. */
  readonly rankedCandidateSet: RankedCandidateSet | null

  /** Solver-owned output, or `null` when Solver did not emit it. */
  readonly allocatedCandidateSet: AllocatedCandidateSet | null

  /** Normalized non-fatal issues collected from every stage that ran. */
  readonly warnings: readonly EngineWarning[]

  /** Normalized failures collected from every stage that ran. */
  readonly errors: readonly EngineError[]

  /** Runtime-owned identity, timing, and version metadata. */
  readonly execution: EngineExecutionMetadata
}

/**
 * Transport-independent response returned by the Engine Runtime.
 *
 * Every outcome—including invalid, failed, and cancelled executions—is an
 * `AssemblyResult`; failures are represented as data rather than a parallel
 * response model. This alias preserves a single authoritative output shape.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §2 and §5.1
 */
export type EngineResponse = AssemblyResult
