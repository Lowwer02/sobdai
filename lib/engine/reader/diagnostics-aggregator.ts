/**
 * lib/engine/reader/diagnostics-aggregator.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 7 — Diagnostics Aggregation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §11 (Fail Fast / Loud /
 *     Deterministic), §12 (Audit / Versioning)
 *   - Runtime API Specification v1.0 §9 (Audit Model — Decision Trace,
 *     carrying every Reader diagnostic through to the Assembly Result)
 *
 * Stage 7 aggregates the diagnostic lists emitted by every previous Reader
 * stage (currently Stage 2 Schema Validation + Stage 3 Metadata Validation;
 * Stage 5 Rule Expansion is plumbed for forward compat — currently emits no
 * diagnostics but the aggregator accepts its output uniformly).
 *
 * What Stage 7 DOES:
 *  - Merge diagnostic lists from all stages that ran, in fixed stage order.
 *  - Produce a deterministic ordering: stable sort by (stage, source line,
 *    category) so two byte-identical Blueprints produce byte-identical
 *    diagnostic lists regardless of which stage happened to emit first.
 *  - Preserve every field of every ReaderError (category, location, severity,
 *    explanation, recommendation) — the diagnostic anatomy is sacred (spec
 *    §7 "Reader Error Anatomy"; Runtime API §7.4 "No Silent Failure").
 *
 * What Stage 7 DELIBERATELY DOES NOT DO (per mission scope + spec §11):
 *  - ❌ No repair / auto-fix. The Reader never edits the Blueprint (spec §7.4).
 *  - ❌ No suppression. A warning is carried forward even when the run will
 *     still succeed; the caller (Application / Reviewer) decides what to do.
 *  - ❌ No deduplication. The spec does not define deduplication; two stages
 *     emitting the same diagnostic is informative (it shows the problem
 *     persists across stage boundaries), not noise. Dedup would silently
 *     hide cross-stage signal.
 *  - ❌ No severity escalation. A `warning` stays a `warning` even if many
 *     stages emit it.
 *
 * Determinism (Reader Pipeline Principle 2): pure function. Same inputs →
 * same output, byte-for-byte. No clocks, random, or I/O.
 *
 * IMMUTABILITY: the output array and every ReaderError inside it are
 * `readonly`. The aggregator copies inputs into a fresh array; it does not
 * mutate the source arrays (callers can re-run a stage and re-aggregate).
 */

import type { ReaderError } from './contracts'

// ─── Stage identifiers (for stable sort + audit attribution) ────────────────

/**
 * The Reader stage that produced a diagnostic. Used as the PRIMARY sort key
 * so diagnostics from earlier stages appear first in the aggregated list —
 * matching the pipeline's natural order and giving the author a top-down
 * debugging view.
 *
 * Adding a stage is additive. The numeric rank is the sort key; gaps are
 * intentional (forward compat).
 */
export type DiagnosticSourceStage =
  | 'stage-2-schema' // rank 20
  | 'stage-3-metadata' // rank 30
  | 'stage-5-projection' // rank 50 (reserved; Stage 5 currently emits none)

/**
 * Internal numeric rank for stable sort. Lower rank = earlier in output.
 * Matches the pipeline execution order.
 */
const STAGE_RANK: Record<DiagnosticSourceStage, number> = {
  'stage-2-schema': 20,
  'stage-3-metadata': 30,
  'stage-5-projection': 50,
}

// ─── Public API: aggregateDiagnostics ───────────────────────────────────────

/**
 * A bundle of diagnostic lists keyed by source stage. Each value is the
 * `ReaderError[]` returned by the corresponding stage's `validate*` function.
 *
 * All fields are optional: when a stage was skipped (e.g. because Stage 1
 * refused the document, or Stage 2 halted the pipeline), its source is
 * omitted. The aggregator handles missing sources gracefully — they
 * contribute zero diagnostics.
 */
export interface DiagnosticSources {
  readonly stage2Schema?: readonly ReaderError[]
  readonly stage3Metadata?: readonly ReaderError[]
  readonly stage5Projection?: readonly ReaderError[]
}

/**
 * Aggregate diagnostics from all sources into a single deterministically-
 * ordered, immutable list.
 *
 * Pure and deterministic.
 *
 * Ordering contract: stable sort by
 *   1. source stage rank (Stage 2 < Stage 3 < Stage 5)
 *   2. start line (ascending)
 *   3. category (lexicographic, for ties on the same line)
 *
 * Within a single (stage, line, category) bucket, the input order is
 * preserved (stable sort). This guarantees byte-identical output across runs
 * regardless of which stage's internal ordering happens to vary.
 *
 * @param sources  The diagnostic lists from each stage that ran.
 */
export function aggregateDiagnostics(sources: DiagnosticSources): readonly ReaderError[] {
  // Tag each diagnostic with its source stage for stable sort.
  type Tagged = { stage: DiagnosticSourceStage; diag: ReaderError; emitOrder: number }

  const tagged: Tagged[] = []
  let emitOrder = 0

  // Fixed stage iteration order (defensive — even if STAGE_RANK were reordered,
  // the final sort uses ranks, not iteration order).
  const stageInputs: ReadonlyArray<readonly [DiagnosticSourceStage, readonly ReaderError[] | undefined]> = [
    ['stage-2-schema', sources.stage2Schema],
    ['stage-3-metadata', sources.stage3Metadata],
    ['stage-5-projection', sources.stage5Projection],
  ]

  for (const [stage, list] of stageInputs) {
    if (!list) continue
    for (const diag of list) {
      tagged.push({ stage, diag, emitOrder: emitOrder++ })
    }
  }

  // Stable sort by (stage rank, start line, category, emit order).
  // emit order is the final tie-breaker so the sort is fully deterministic
  // even when two diagnostics share stage+line+category (rare but possible).
  tagged.sort((a, b) => {
    const stageRankDiff = STAGE_RANK[a.stage] - STAGE_RANK[b.stage]
    if (stageRankDiff !== 0) return stageRankDiff
    const lineDiff = a.diag.location.startLine - b.diag.location.startLine
    if (lineDiff !== 0) return lineDiff
    const catDiff = a.diag.category < b.diag.category ? -1 : a.diag.category > b.diag.category ? 1 : 0
    if (catDiff !== 0) return catDiff
    return a.emitOrder - b.emitOrder
  })

  // Project to a fresh readonly array of the diagnostics (drop the tags).
  // The ReaderError objects themselves are shared with the inputs — Stage 7
  // treats them as immutable per the spec contract; it never copies or
  // alters them. Returning the same references is correct and efficient.
  return tagged.map((t) => t.diag)
}

// ─── Helper: classify a diagnostic list by halt semantics ──────────────────
// Stage 8 uses these to decide ok=true vs ok=false. Kept here (next to the
// aggregator) because they operate on the aggregated output and belong to the
// "diagnostics" concern, not the "result construction" concern.

/**
 * Does the aggregated diagnostic list contain any entry that halts the
 * pipeline? A `fatal` or `blocking` severity halts; `warning` does not.
 *
 * Per Reader Pipeline §7.3 (Severity Classification): Fatal = no
 * AssemblyRequest at all; Blocking = pipeline halts by default (override
 * pathway may exist for advanced users — NOT implemented in v1.0 Reader);
 * Warning = continue, carry forward.
 */
export function containsHaltDiagnostic(
  diagnostics: readonly ReaderError[]
): boolean {
  return diagnostics.some(
    (d) => d.severity === 'fatal' || d.severity === 'blocking'
  )
}

/**
 * Count diagnostics by severity. Returns a stable record for audit/logging.
 * Useful for the ReaderResult's execution summary and for monitoring dashboards.
 */
export function countBySeverity(
  diagnostics: readonly ReaderError[]
): { fatal: number; blocking: number; warning: number } {
  const counts = { fatal: 0, blocking: 0, warning: 0 }
  for (const d of diagnostics) {
    counts[d.severity]++
  }
  return counts
}
