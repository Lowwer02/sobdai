/**
 * lib/engine/index.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — public barrel.
 *
 * Source of truth: Assessment Engine Runtime API Specification v1.0 §2
 *   ("Why the Engine Exposes Only One Interface") and §2.5 (Orchestration Asymmetry).
 *
 * ENCAPSULATION CONTRACT (Runtime API §2):
 *  - Applications MAY import ONLY from this file (or its sub-paths declared below).
 *  - Applications MUST NOT import from lib/engine/<module>/ internal paths.
 *  - The CI encapsulation gate (Backlog Task T-1.4.3.x) fails the build on violation.
 *
 * Currently exported (Phase: pre-Phase-1; contracts only):
 *  - Error/Warning/ExecutionState vocabulary (Runtime API §6/§7/§8)
 *  - Observability sink interfaces (Runtime API §11)
 *
 * NOT yet exported (pending their Epics):
 *  - runEngine (Runtime API orchestrator — E-1.4)
 *  - Engine Request / Assembly Result types (E-1.4)
 *  - Internal contracts (AssemblyRequest, CandidateSet, RankedCandidateSet,
 *    AllocatedCandidateSet) — these are internal; Applications see summary views
 *    only (Runtime API §5.5 Summary View Principle).
 */

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

// NOTE: The following are intentionally NOT re-exported here:
//   - Reader contracts (AssemblyRequest, Blueprint AST) — internal; consumed by
//     Generator only.
//   - CandidateSet / RankedCandidateSet / AllocatedCandidateSet full contracts —
//     internal; Applications see summary views via Assembly Result (Runtime API §5).
//   - runEngine — not yet implemented (E-1.4).
//
// When E-1.4 ships, this barrel grows to:
//   export { runEngine } from './runtime'
//   export type { EngineRequest, AssemblyResult } from './runtime'
