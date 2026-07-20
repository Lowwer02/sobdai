/**
 * lib/engine/shared/errors.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — Error, Warning, and Severity vocabulary.
 *
 * Source of truth: Assessment Engine Runtime API Specification v1.0
 *   - §6   Execution States
 *   - §7   Error Model (categories, ownership, anatomy, "No Silent Failure")
 *   - §8   Warning Model (types, severity, vs. errors)
 *   - §9.4 Audit Integrity (errors/warnings are part of the reproducible trail)
 *
 * These are pure vocabulary types — no DB coupling, no UI coupling, no side effects.
 * Every internal module that raises an issue constructs one of these; the Runtime API
 * collects them into the Assembly Result's Errors/Warnings collections.
 *
 * Constitution (Runtime API §7.4 "No Silent Failure"): the Runtime API never silently
 * swallows an error. Every error is reflected in the Assembly Result's status, the
 * Errors collection, and the Audit Trail.
 */

// ─── Severity (Runtime API §7.3) ────────────────────────────────────────────
// Severity is orthogonal to "is it an error or a warning": a Warning is by definition
// non-fatal (Runtime API §8.2), but an Error may be Fatal (run cannot continue) or
// Blocking (run may complete partially — e.g. one Slot infeasible).

/**
 * Error severity. From Runtime API §7.3.
 *
 * - 'fatal'     — the run cannot continue. Assembly Result status → 'Failed'.
 * - 'blocking'  — the run may complete partially. The affected unit (Slot, Set) is
 *                 Rejected; the run proceeds and may finish 'Completed With Warnings'.
 * - 'warning'   — reserved for completeness; in practice warnings use the Warning
 *                 type, not Error with severity 'warning'.
 */
export type ErrorSeverity = 'fatal' | 'blocking' | 'warning'

// ─── Error Categories (Runtime API §7.1) ────────────────────────────────────
// EXACT vocabulary from the spec. Adding a category is a spec change, not a code change.

/**
 * Error category. From Runtime API §7.1.
 *
 * Each category has a canonical owner (Runtime API §7.2): Validation/Runtime/System/
 * Version/Dependency Errors are owned by the Runtime API; Blueprint Errors by the Reader;
 * Constraint Errors by the Solver. Owners produce; the Runtime API surfaces.
 */
export type ErrorCategory =
  | 'Validation Error' // Engine Request failed Validation (bad format, missing field, invalid ref)
  | 'Blueprint Error' // Blueprint itself is invalid (malformed, self-contradictory) — surfaced from Reader
  | 'Runtime Error' // Internal Runtime API failure (orchestration bug, state corruption)
  | 'Constraint Error' // Solver determined the Blueprint is infeasible (constraint contradiction)
  | 'System Error' // Infrastructure failure (OOM, dependency unavailable, budget exhausted)
  | 'Version Error' // Version mismatch (Runtime, Engine, or internal module unsupported)
  | 'Dependency Error' // Upstream dependency failed (Bank unreachable, Blueprint storage unavailable)

// ─── Warning Types (Runtime API §8.1) ───────────────────────────────────────
// Warnings are non-fatal by definition (Runtime API §8.2). They contribute to the
// 'Completed With Warnings' Execution State but never to 'Failed'.

/**
 * Warning type. From Runtime API §8.1.
 *
 * Source modules (Runtime API §8.1): Shortfall (Generator/Solver), Reduced Confidence
 * (Scoring/Ranking — e.g. IG-2 missing metadata), Incomplete Metadata (Generator),
 * Deprecated Blueprint (Reader), Coverage/Distribution Warnings (Generator/Solver),
 * Future Compatibility Warning (Runtime API).
 */
export type WarningType =
  | 'Shortfall' // A Blueprint target couldn't be fully met (e.g. a Slot was Rejected)
  | 'Reduced Confidence' // A placement's evaluation is low-confidence (e.g. IG-2 missing metadata)
  | 'Incomplete Metadata' // A Candidate's metadata is incomplete (carried forward from Generator)
  | 'Deprecated Blueprint' // Blueprint version deprecated but still supported
  | 'Coverage Warning' // A coverage rule is strained (e.g. mandatory topic has one eligible Candidate)
  | 'Distribution Warning' // A distribution target is met with thin headroom
  | 'Future Compatibility Warning' // Result uses features that may change in future versions

// ─── Internal Module identifiers (Runtime API §7.3 "Module" field) ──────────
// Used in the Error/Warning `module` field for audit attribution. Names mirror the
// frozen module list; 'Runtime API' is the orchestrator itself.

/**
 * Internal module that produced an Error or Warning. From Runtime API §7.3 "Module"
 * field. Used for audit attribution; Applications see this in the Audit Trail.
 */
export type EngineModule =
  | 'Runtime API'
  | 'Reader'
  | 'Generator'
  | 'Scoring'
  | 'Ranking'
  | 'Allocation'
  | 'Solver'
  | 'Draft Builder'
  | 'Review Workbench'

// ─── Error Anatomy (Runtime API §7.3) ───────────────────────────────────────

/**
 * The anatomy every Engine error carries. From Runtime API §7.3.
 *
 * Every field is required — "No Silent Failure" (Runtime API §7.4) means an error
 * without a Location, Explanation, or Recommendation is itself a bug.
 *
 * `location` is intentionally a string (not a structured type): the location grammar
 * differs per module ("Reader:line 42", "Slot S1.Easy.Memory.D1", "Transition
 * Reserved→Allocated"). Structuring it now would preempt module-specific needs; the
 * only universal contract is that a Human can read it (Runtime API §9.2 Explainability).
 */
export interface EngineError {
  /** One of ErrorCategory (Runtime API §7.1). */
  category: ErrorCategory
  /** Where the error occurred: module + slot/candidate/transition/line if applicable. */
  location: string
  /** Fatal / Blocking / Warning. From Runtime API §7.3. */
  severity: ErrorSeverity
  /** Plain-language description. */
  explanation: string
  /** Concrete suggested fix — never empty (an error without a fix is half-reported). */
  recommendation: string
  /** Which internal module produced the error (Runtime API §7.2 ownership). */
  module: EngineModule
}

// ─── Warning (Runtime API §8) ───────────────────────────────────────────────

/**
 * A non-blocking issue. From Runtime API §8.
 *
 * Mirrors EngineError anatomy minus Severity (warnings are non-fatal by definition,
 * Runtime API §8.2) and with `type` instead of `category`. Same Location/Explanation/
 * Recommendation/Module fields so a Reviewer can act on either uniformly.
 */
export interface EngineWarning {
  /** One of WarningType (Runtime API §8.1). */
  type: WarningType
  /** Where the warning applies: module + slot/candidate if applicable. */
  location: string
  /** Plain-language description of the non-blocking issue. */
  explanation: string
  /** Concrete suggested review action. */
  recommendation: string
  /** Which internal module produced the warning. */
  module: EngineModule
}

// ─── Execution States (Runtime API §6.1) ────────────────────────────────────
// EXACT vocabulary. The Assembly Result's `status` field is one of these.

/**
 * Execution state of an Engine run. From Runtime API §6.1.
 *
 * - 'Accepted'                — request received and validated; not yet running.
 * - 'Running'                 — execution in progress.
 * - 'Completed'               — finished, no warnings or errors.
 * - 'Completed With Warnings' — finished; warnings emitted (e.g. shortfalls, reduced
 *                               confidence). Result is usable; review recommended.
 * - 'Failed'                  — a Fatal error occurred; result is not usable.
 * - 'Cancelled'               — cancelled before completion (Runtime API §6.4).
 * - 'Invalid'                 — Validation or Version negotiation failed at intake.
 */
export type ExecutionState =
  | 'Accepted'
  | 'Running'
  | 'Completed'
  | 'Completed With Warnings'
  | 'Failed'
  | 'Cancelled'
  | 'Invalid'

// ─── Factory helpers ────────────────────────────────────────────────────────
// Constructors that enforce the "every field required" rule and centralize the
// vocabulary so a typo in a category string is a type error, not a runtime bug.

/**
 * Construct an EngineError with all required fields. Pure; no side effects.
 * Use this rather than the literal so missing fields are a compile error.
 */
export function engineError(input: {
  category: ErrorCategory
  location: string
  severity: ErrorSeverity
  explanation: string
  recommendation: string
  module: EngineModule
}): EngineError {
  return { ...input }
}

/**
 * Construct an EngineWarning with all required fields. Pure; no side effects.
 */
export function engineWarning(input: {
  type: WarningType
  location: string
  explanation: string
  recommendation: string
  module: EngineModule
}): EngineWarning {
  return { ...input }
}
