/**
 * lib/engine/index.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — canonical public API.
 *
 * Source of truth: Assessment Engine Runtime API Specification v1.0 §2
 *   ("Why the Engine Exposes Only One Interface") and §2.5 (Orchestration Asymmetry).
 *
 * ENCAPSULATION CONTRACT (Runtime API §2):
 *  - Applications MAY import ONLY from this file.
 *  - Applications MUST NOT import from lib/engine/<module>/ internal paths.
 *  - The CI encapsulation gate (Backlog Task T-1.4.3.x) fails the build on violation.
 *
 * This barrel intentionally owns no contracts or implementation. It exposes the
 * Runtime-owned request/response boundary and the shared input vocabulary that
 * Application adapters require. Runtime State, snapshots, pipeline composition,
 * Stage contracts, and Stage implementations remain private to the Engine.
 */

// Single Engine execution entry point.
export { runEngine } from './runtime/run-engine'

// Runtime-owned public input, output, dependency, and metadata contracts.
export type {
  AssemblyResult,
  EngineExecutionMetadata,
  EngineExecutionOptions,
  EngineRequest,
  EngineResponse,
  EngineRuntimeContext,
  EngineRuntimeDependencies,
} from './runtime/contracts'

// Shared request and Question Bank input vocabulary required by Engine callers.
export type {
  AssessmentProfile,
  BlueprintType,
  Difficulty,
  LearningObjective,
  QuestionPattern,
  RunUnit,
} from './shared/assessment-vocabulary'

// Infrastructure boundary implemented by the Application integration layer.
export type {
  BankMetadataRow,
  BankReadAdapter,
} from './shared/question-bank'

// Public vocabulary — Applications need these to interpret Assembly Results.
export type {
  ErrorSeverity,
  ErrorCategory,
  WarningType,
  EngineModule,
  EngineError,
  EngineWarning,
  ExecutionState,
} from './shared/errors'

export { engineError, engineWarning } from './shared/errors'

// Public observability sink interface — Applications wiring monitoring need this.
// The built-in sinks (noopSink, CollectorSink) are intended for Engine-internal
// and test use; Applications inject their own sink implementation.
export type {
  ObservabilityEvent,
  ObservabilitySink,
} from './shared/observability'

// Intentionally not exported:
//   - RuntimeState, RuntimeExecutionSnapshot, or pipeline composition metadata.
//   - Reader, Generator, Scoring, Ranking, or Solver contracts and implementations.
//   - Built-in observability sinks and module-level Runtime helpers.
