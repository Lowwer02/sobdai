/**
 * lib/engine/shared/observability.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — observability primitives.
 *
 * Source of truth: Assessment Engine Runtime API Specification v1.0
 *   - §5.9   Execution Summary
 *   - §11    Observability (per-module timing, error rates, runtime statistics,
 *            health information)
 *   - §9     Audit Model (Module Trace records timing per module)
 *
 * Design: an injectable sink, not a global. Pure modules emit timing/count events
 * through a sink they're handed; production wires the sink to monitoring, tests wire
 * it to an in-memory collector. This keeps modules deterministic and side-effect-free
 * (the determinism contract — `lib/engine/README.md` §1 — forbids reading the wall
 * clock inside a pure module; the sink receives already-measured deltas).
 *
 * Backlog: E-X.3 (Cross-Cutting Infrastructure).
 */

import type { ErrorCategory } from './errors'

// ─── Event vocabulary ───────────────────────────────────────────────────────

/**
 * A module-level timing event. Emitted once per module invocation.
 *
 * The `durationMs` is measured by the caller (Runtime API or the module wrapper),
 * never by reading the clock inside the module — preserves determinism. The sink is
 * the destination, not the measurer.
 */
export interface ModuleTimingEvent {
  /** Which module completed (matches EngineModule from errors.ts). */
  module: string
  /** Wall-clock duration in milliseconds (caller-measured). */
  durationMs: number
  /** Run id this timing belongs to (correlates with the Audit Trail). */
  runId: string
}

/**
 * A counted event — error rates by category, idempotency rejection counts, per-filter
 * row reductions, etc. Runtime API §11 "runtime statistics" + Implementation Planning
 * §8.4 monitoring signals.
 */
export interface CounterEvent {
  /** Counter name, e.g. 'error.by_category', 'draft.duplicate_rejection', 'generator.filter.rows_reduced'. */
  name: string
  /** Optional labels for dimensional counting (category, module, slot, etc.). */
  labels?: Record<string, string>
  /** Increment amount (default 1). */
  value?: number
  /** Run id this counter belongs to. */
  runId: string
}

/**
 * Union of all observability events. The sink receives one of these per call.
 */
export type ObservabilityEvent = ModuleTimingEvent | CounterEvent

// ─── Sink interface ─────────────────────────────────────────────────────────

/**
 * Destination for observability events. Implementations:
 *  - Production: forwards to monitoring backend (TBD — Runtime API §11).
 *  - Dev: console.
 *  - Tests: in-memory collector (assertable).
 *
 * The sink MUST NOT throw — observability is best-effort and must never break a run.
 * (Audit-write failure rolls back Draft writes per Draft Builder §9.1, but
 * observability events are fire-and-forget by design — they're metrics, not audit.)
 */
export interface ObservabilitySink {
  emit(event: ObservabilityEvent): void
}

// ─── Built-in sinks ─────────────────────────────────────────────────────────

/**
 * No-op sink. Default when no sink is injected. Pure; discards everything.
 * Useful as a safe fallback so module code never has to null-check the sink.
 */
export const noopSink: ObservabilitySink = {
  emit() {},
}

/**
 * In-memory collector sink for tests. Records every event for later assertion.
 * Use `collector.events` to inspect; `collector.counters` for aggregated counts.
 */
export class CollectorSink implements ObservabilitySink {
  readonly events: ObservabilityEvent[] = []

  emit(event: ObservabilityEvent): void {
    this.events.push(event)
  }

  /** All timing events, in emission order. */
  get timings(): ModuleTimingEvent[] {
    return this.events.filter(
      (e): e is ModuleTimingEvent => 'durationMs' in e
    )
  }

  /** All counter events, in emission order. */
  get counters(): CounterEvent[] {
    return this.events.filter((e): e is CounterEvent => !('durationMs' in e))
  }

  /**
   * Sum of counter values matching `name` (and optional label filter).
   * Returns 0 if no matches.
   */
  counterSum(
    name: string,
    labels?: Record<string, string>
  ): number {
    return this.counters
      .filter((c) => c.name === name)
      .filter((c) =>
        labels ? Object.entries(labels).every(([k, v]) => c.labels?.[k] === v) : true
      )
      .reduce((sum, c) => sum + (c.value ?? 1), 0)
  }
}

// ─── Convenience emitters ───────────────────────────────────────────────────
// Thin helpers so callers don't repeat the discriminator. Each is a pure constructor
// for an event; the caller chooses when (and whether) to forward to a sink.

/**
 * Build a module-timing event. Caller has already measured `durationMs`.
 */
export function moduleTiming(
  module: string,
  durationMs: number,
  runId: string
): ModuleTimingEvent {
  return { module, durationMs, runId }
}

/**
 * Build a counter event for an error occurrence (category-keyed).
 * Feeds Runtime API §11 "error rates by category".
 */
export function errorCounter(
  category: ErrorCategory,
  runId: string
): CounterEvent {
  return {
    name: 'error.by_category',
    labels: { category },
    value: 1,
    runId,
  }
}
