/**
 * lib/engine/generator/metadata-filters.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator Stage 2 — Metadata Filters.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §4 (Metadata Filtering),
 *     §4.2 (the 7 filters), §4.3 (FIXED execution order — most selective first),
 *     §4.4 (what the stage does NOT do), §2.3 Invariant #2 (no info loss about
 *     eligibility), §11.2 (Failure Catalogue — Missing Metadata is Fatal),
 *     §11.4 (No Silent Weakening)
 *   - Engineering Execution Backlog v1.0 F-2.2.1 (7 filters in fixed order) and
 *     F-2.2.2 (selectivity instrumentation — counts; timing deferred to the
 *     Runtime API per the determinism contract, see design note at file foot).
 *
 * WHAT THIS STAGE IS. Apply the Query Plan's filters to Bank metadata (§4.1),
 * producing the set of ELIGIBLE ROWS. This is where "Filter Before Reason"
 * (Principle 3) becomes operational: every deterministic filter runs here,
 * before any Candidate is materialized or any reasoning stage sees a row.
 *
 * WHAT THIS STAGE IS NOT (§4.4):
 *  - ❌ Does NOT rank rows. Output is unordered (stable input order preserved).
 *  - ❌ Does NOT materialize Candidates. That is Discovery (§5 / F-2.3 / E-2D).
 *  - ❌ Does NOT read content. Metadata only.
 *  - ❌ Does NOT weaken or skip a filter. Every filter runs; an IG-2 axis column
 *         that the Bank cannot supply is surfaced loud (§11.2 / §11.4), not
 *         skipped. (Per-row NULL on an IG-2 axis is admitted — that is a
 *         Reduced-Confidence signal downstream, not a filter failure.)
 *  - ❌ Does NOT access the Bank's write path. Read-only.
 *  - ❌ Does NOT read the wall clock. Timing is caller-owned (README §1).
 *
 * IMMUTABILITY: every result is `readonly`. Inputs are never mutated.
 * DETERMINISM: pure functions of (rows, plan). Same input → same output, byte
 *              for byte (verified by the test suite via stableStringify).
 *
 * BANK ACCESS: per README §2 ("DB/Bank reads happen in the Generator's filter
 * layer only, and the Generator's filter adapters are injected, not imported"),
 * the module takes a `BankReadAdapter`. The contract adapter defined here is
 * metadata-only and read-only; tests inject an in-memory adapter. The module
 * imports ZERO Supabase (enforced by test: verifies_no_supabase_or_clock).
 */

import type {
  CoverageRuleId,
  Difficulty,
  LearningObjective,
  QuestionPattern,
} from '../shared/assessment-vocabulary'
import type {
  CandidateRejectionReason,
  ExclusionEntry,
  FatalDiagnostic,
  FilterId,
  PatternAvailability,
  QueryPlan,
  QuestionStatus,
} from './contracts'
import { FILTER_EXECUTION_ORDER } from './contracts'
import type {
  BankMetadataRow,
  BankReadAdapter,
} from '../shared/question-bank'
import {
  noopSink,
  type CounterEvent,
  type ObservabilitySink,
} from '../shared/observability'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Bank read adapter — the injected, metadata-only Bank interface
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Generator's window onto the Question Bank. Read-only, metadata-only.
 *
 * Per README §2 the Bank read adapter is INJECTED, never imported, so this
 * module stays pure and Supabase-free. A production adapter (built elsewhere —
 * outside `lib/engine/generator/`) implements `readMetadata()` against the
 * real Bank; tests wrap `buildBankRow(s)` fixtures.
 *
 * The row type is the canonical `BankMetadataRow` defined at the shared Engine
 * boundary. Every listed Bank column exists on the `questions` table
 * (migrations 019 / 026 / 027).
 */
export type { BankReadAdapter } from '../shared/question-bank'

/**
 * Convenience in-memory adapter for tests and any caller that already holds the
 * rows. Wraps the array without copying (the contract is read-only at the type
 * level); callers must not mutate the array during a run.
 */
export class InMemoryBankAdapter implements BankReadAdapter {
  constructor(private readonly rows: ReadonlyArray<BankMetadataRow>) {}
  readMetadata(): ReadonlyArray<BankMetadataRow> {
    return this.rows
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Filter result + report shapes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The output of a single filter. `kept` carries rows that survived; `rejected`
 * carries one `ExclusionEntry` per dropped row (using the rejection-reason
 * vocabulary defined in contracts.ts). `stats` is the selectivity report
 * (F-2.2.2.1 — row-count reduction).
 */
export interface FilterResult {
  readonly kept: readonly BankMetadataRow[]
  readonly rejected: readonly ExclusionEntry[]
  readonly stats: FilterStats
}

/**
 * Per-filter selectivity counters (F-2.2.2.1). Row counts only — timing is
 * owned by the Runtime API wrapper, never read inside this pure module
 * (README §1 + shared/observability.ts contract). See file-foot design note.
 */
export interface FilterStats {
  /** Rows fed into this filter. */
  readonly rowsIn: number
  /** Rows that survived this filter. */
  readonly rowsKept: number
  /** Rows dropped by this filter. */
  readonly rowsRejected: number
}

/**
 * A single filter applied to a set of rows against a QueryPlan. Pure: no I/O,
 * no clock, never mutates inputs. Each of the 7 filters below conforms to this.
 */
export type FilterFn = (
  rows: readonly BankMetadataRow[],
  plan: QueryPlan
) => FilterResult

/**
 * One entry in the orchestrator's per-filter selectivity report.
 */
export interface PerFilterReport {
  readonly filterId: FilterId
  readonly stats: FilterStats
}

/**
 * The result of Stage 2. Discriminated on `ok`:
 *  - `ok: true`  — filtering succeeded; `rows` are the eligible rows that flow
 *                  into Discovery (Stage 3). `rejectionLog` is the cumulative
 *                  audit trail of every dropped row across all 7 filters.
 *                  `perFilter` is the selectivity report (F-2.2.2).
 *  - `ok: false` — Fatal failure (§11.2). No rows produced. The diagnostics
 *                  explain why (e.g. an IG-2 axis column the Bank cannot supply).
 */
export type FilterStageResult =
  | {
      readonly ok: true
      readonly rows: readonly BankMetadataRow[]
      readonly rejectionLog: readonly ExclusionEntry[]
      readonly perFilter: readonly PerFilterReport[]
    }
  | { readonly ok: false; readonly fatalDiagnostics: readonly FatalDiagnostic[] }

// ═══════════════════════════════════════════════════════════════════════════
// 3. Axis vocabularies — mirror reader/contracts (the fixed enum surface)
// ═══════════════════════════════════════════════════════════════════════════
// These mirror the FROZEN enums in reader/contracts.ts verbatim. Duplicated
// here ONLY as readonly sets for O(1) membership tests; the source of truth
// remains reader/contracts.ts. (We cannot `import` a `Set` of literal values
// without re-listing them; this is a value, not a redefinition of the type.)

const DIFFICULTY_VALUES: ReadonlySet<Difficulty> = new Set([
  'Easy',
  'Medium',
  'Hard',
])

const PATTERN_VALUES: ReadonlySet<QuestionPattern> = new Set([
  'Positive',
  'Negative',
  'Best Answer',
  'Scenario',
  'Sequence',
  // NOTE: the two-word form, not bare 'Matching' (reader/contracts.ts D-6).
  'Matching Concept',
])

const LO_VALUES: ReadonlySet<LearningObjective> = new Set([
  'LO1',
  'LO2',
  'LO3',
  'LO4',
])

// ═══════════════════════════════════════════════════════════════════════════
// 4. Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Build an ExclusionEntry from a row + reason. */
function exclusion(
  row: BankMetadataRow,
  reason: CandidateRejectionReason
): ExclusionEntry {
  return { code: row.questionCode, reason }
}

/** Build stats from in/kept counts. */
function statsOf(rowsIn: number, rowsKept: number): FilterStats {
  return { rowsIn, rowsKept, rowsRejected: rowsIn - rowsKept }
}

/**
 * Whether a Bank row's IG-2 axis is "absent". Per `BankMetadataRow`, an absent
 * axis appears as `undefined` (the field is optional) OR an explicit `null`.
 * Both are treated as "incomplete" — the row is ADMITTED at filtering
 * (Maximum Recall, §2.3 Invariant #2 + §4.4), and the incompleteness becomes a
 * Reduced-Confidence signal downstream at Discovery.
 */
function axisAbsent(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

/**
 * Whether a Bank row's IG-2 axis is present and out of the allowed enum.
 * Returns false when the axis is absent (absent ≠ invalid; absent is admitted).
 */
function axisOutOfEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>
): boolean {
  if (axisAbsent(value)) return false
  return typeof value === 'string' && !allowed.has(value as T)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. The 7 filters (each a standalone, pure FilterFn)
// ═══════════════════════════════════════════════════════════════════════════
// Order in this file is reading order, NOT execution order. The normative
// execution order is FILTER_EXECUTION_ORDER in contracts.ts (§4.3) and is
// applied by runFilters below. Each filter is independently testable.

// ─── Filter 1 (in execution order): Exclusion ────────────────────────────────

/**
 * Exclusion Filter. §4.2 / §4.3 (1st — cheapest: set membership on Codes).
 *
 * Drops rows whose Question Code is in `plan.exclusions` (the runtime-only
 * "already-used / recent Codes" set the AssemblyRequest carries). Exclusion is
 * recorded as a negative in provenance; here it just drops the row with the
 * `'excluded'` reason kind.
 */
export function exclusionFilter(
  rows: readonly BankMetadataRow[],
  plan: QueryPlan
): FilterResult {
  if (plan.exclusions.length === 0) {
    return {
      kept: rows,
      rejected: [],
      stats: statsOf(rows.length, rows.length),
    }
  }
  // Set for O(1) membership; Code strings are short and few.
  const excluded = new Set(plan.exclusions)
  const kept: BankMetadataRow[] = []
  const rejected: ExclusionEntry[] = []
  for (const row of rows) {
    if (excluded.has(row.questionCode)) {
      rejected.push(exclusion(row, { kind: 'excluded', code: row.questionCode }))
    } else {
      kept.push(row)
    }
  }
  return { kept, rejected, stats: statsOf(rows.length, kept.length) }
}

// ─── Filter 2 (in execution order): Status ───────────────────────────────────

/**
 * Status Filter. §4.2 / §4.3 (2nd — cheap: single enum check).
 *
 * Admits only rows whose lifecycle status qualifies them for a published
 * Blueprint. Per the Generator's stated policy (contracts.ts QuestionStatus
 * doc): only `'Published'` Questions may appear in a published Blueprint.
 * `'Draft'` and `'Review'` are rejected with the `'status'` reason kind
 * (which carries the offending status for audit).
 */
export function statusFilter(
  rows: readonly BankMetadataRow[],
  _plan: QueryPlan
): FilterResult {
  const kept: BankMetadataRow[] = []
  const rejected: ExclusionEntry[] = []
  for (const row of rows) {
    if (row.status === 'Published') {
      kept.push(row)
    } else {
      rejected.push(
        exclusion(row, {
          kind: 'status',
          code: row.questionCode,
          // BankMetadataRow.status is a free string; narrow to the union for
          // the reason payload. Unknown statuses are still rejected; they
          // surface here as their raw value cast into the narrow type so a
          // Reviewer sees exactly what the Bank held.
          status: row.status as QuestionStatus,
        })
      )
    }
  }
  return { kept, rejected, stats: statsOf(rows.length, kept.length) }
}

// ─── Filter 3 (in execution order): Document ─────────────────────────────────

/**
 * Document Filter. §4.2 / §4.3 (3rd — highly selective, ~90% reduction).
 *
 * Restricts to Questions whose `document` is in the Blueprint's CLOSED document
 * set. `plan.permittedDocuments` carries document NAMES (the Query Planner
 * extracts `documentRegistry[].name` — see query-planner.ts:129-133); the
 * Document Filter therefore matches `row.document` against NAMES.
 *
 * IMPLEMENTATION NOTE for callers: `BankMetadataRow.document` defaults to a
 * document ID (e.g. `'LAW-ACT-HED-2562'`). A test or production adapter that
 * wants a row to pass this filter must align `row.document` with a registry
 * entry's NAME, not its id. (The default fixture's first registry entry uses
 * its id as its name, so they coincide there; this is a fixture coincidence,
 * not a contract.)
 */
export function documentFilter(
  rows: readonly BankMetadataRow[],
  plan: QueryPlan
): FilterResult {
  if (plan.permittedDocuments.length === 0) {
    // Empty closed set → no row can qualify. Reject all (closed-set semantics,
    // NOT a Fatal — the Blueprint legitimately declared no documents).
    const rejected: ExclusionEntry[] = rows.map((row) =>
      exclusion(row, {
        kind: 'document',
        code: row.questionCode,
        document: row.document,
      })
    )
    return { kept: [], rejected, stats: statsOf(rows.length, 0) }
  }
  const permitted = new Set(plan.permittedDocuments)
  const kept: BankMetadataRow[] = []
  const rejected: ExclusionEntry[] = []
  for (const row of rows) {
    if (permitted.has(row.document)) {
      kept.push(row)
    } else {
      rejected.push(
        exclusion(row, {
          kind: 'document',
          code: row.questionCode,
          document: row.document,
        })
      )
    }
  }
  return { kept, rejected, stats: statsOf(rows.length, kept.length) }
}

// ─── Filter 4 (in execution order): Coverage ─────────────────────────────────

/**
 * The recognized CR-1 binding shape. The ONLY coverage binding E-2C narrows
 * `unknown` to; other rules (CR-2/CR-3/CR-4/CR-5) currently carry null or
 * unrecognized bindings and are treated as "no per-Question predicate" (admit).
 *
 * CR-1 (per CoverageRuleId doc + Integration Spec §4.3): mandatory
 * (Document × Topic) pairs must appear in every Set. As a per-Question filter
 * this means: a row is admissible iff it matches at least one bound pair.
 */
export interface Cr1DocumentTopicBinding {
  readonly kind: 'document_topic_pairs'
  readonly pairs: ReadonlyArray<{
    readonly document: string
    readonly topic: string
  }>
}

/** Type guard: is this binding a recognized CR-1 shape? */
function isCr1Binding(b: unknown): b is Cr1DocumentTopicBinding {
  if (b === null || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  if (o['kind'] !== 'document_topic_pairs') return false
  const pairs = o['pairs']
  if (!Array.isArray(pairs)) return false
  return pairs.every(
    (p) =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>)['document'] === 'string' &&
      typeof (p as Record<string, unknown>)['topic'] === 'string'
  )
}

/**
 * Coverage Filter. §4.2 / §4.3 (4th — selective: mandatory-topic bindings).
 *
 * DESIGN DECISION (Architecture-approved): a CoverageRequirement whose binding
 * is null, or whose shape this filter has not been taught, ADMITS every row.
 * Rationale:
 *  - §2.3 Invariant #2: "A Code that survives filtering is never silently
 *    dropped later." The converse is also honored: a rule we cannot interpret
 *    as a per-Question predicate does not become a silent exclusion.
 *  - §4.4: the filter "Does not weaken filters" — but admitting for an
 *    unbound rule is NOT weakening; it is honestly saying "this rule imposes
 *    no per-Question constraint at this stage." Whether the rule is ultimately
 *    satisfied is detected at Pool Validation (§7 / F-2.3 / E-2D) and surfaced
 *    in the Shortfall Report — never silently swallowed here.
 *
 * Rules that are NOT per-Question predicates by nature:
 *  - CR-3 (cross-Set cap) → Solver concern (IG-5); never a per-row filter.
 *  - CR-5 (Section Sweep) → needs the IG-2 `section` axis (currently null
 *    pending E-0 closure); a future session adds CR-5 narrowing additively.
 *  - CR-2, CR-4 → spec/contract gives no binding shape; treated as null.
 *
 * The recognized CR-1 binding (`Cr1DocumentTopicBinding` above) IS narrowed:
 * a row is admitted iff it matches at least one `{document, topic}` pair.
 * Adding more rule narrowings later is additive — append a `case` below.
 */
export function coverageFilter(
  rows: readonly BankMetadataRow[],
  plan: QueryPlan
): FilterResult {
  // Pre-compute the set of CR-1 (document, topic) pairs across all CR-1
  // requirements. A row matches if (document, topic) is in this set for ANY
  // bound CR-1 requirement. If NO CR-1 requirement carries a recognized
  // binding, `pairKeys` is empty and the "matches at least one pair" path is
  // skipped — every row is admitted via the unbound-rule path.
  const pairKeys: Set<string> = new Set()
  let hasRecognizedBinding = false
  for (const req of plan.coverageRequirements) {
    if (req.ruleId === 'CR-1' && isCr1Binding(req.binding)) {
      hasRecognizedBinding = true
      for (const pair of req.binding.pairs) {
        pairKeys.add(`${pair.document}\u{0000}${pair.topic}`)
      }
    }
    // Other rule ids (CR-2/CR-3/CR-4/CR-5) and unrecognized bindings: admit.
    // Additive — a future session can add `case 'CR-5'` narrowing here.
  }

  // No recognized binding anywhere → admit everything (Maximum Recall).
  if (!hasRecognizedBinding) {
    return {
      kept: rows,
      rejected: [],
      stats: statsOf(rows.length, rows.length),
    }
  }

  const kept: BankMetadataRow[] = []
  const rejected: ExclusionEntry[] = []
  for (const row of rows) {
    const topic = row.topic ?? ''
    const key = `${row.document}\u{0000}${topic}`
    if (row.topic !== null && pairKeys.has(key)) {
      kept.push(row)
    } else {
      rejected.push(
        exclusion(row, {
          kind: 'coverage',
          code: row.questionCode,
          detail: `no CR-1 (document, topic) match for (${row.document}, ${topic})`,
        })
      )
    }
  }
  return { kept, rejected, stats: statsOf(rows.length, kept.length) }
}

// ─── Filter 5 (in execution order): Difficulty ───────────────────────────────

/**
 * Difficulty Filter. §4.2 / §4.3 (5th — moderately selective).
 *
 * The Query Plan enumerates all three Difficulty values per Set (Easy/Medium/
 * Hard), so the per-row predicate is "the row's difficulty is one of the three
 * enum values." This is a Bank-data-quality gate: a row carrying an
 * out-of-enum difficulty (corrupt import, schema drift) is rejected — the
 * Generator never silently invents a difficulty for it (§4.4 / AP-9).
 *
 * NOTE: this is NOT a slot-count check. Whether enough Easy/Medium/Hard rows
 * exist to fill each slot is Pool Validation's job (§7 / F-2.3 / E-2D).
 */
export function difficultyFilter(
  rows: readonly BankMetadataRow[],
  _plan: QueryPlan
): FilterResult {
  const kept: BankMetadataRow[] = []
  const rejected: ExclusionEntry[] = []
  for (const row of rows) {
    if (DIFFICULTY_VALUES.has(row.difficulty)) {
      kept.push(row)
    } else {
      rejected.push(
        exclusion(row, {
          kind: 'difficulty',
          code: row.questionCode,
          difficulty: row.difficulty as Difficulty,
        })
      )
    }
  }
  return { kept, rejected, stats: statsOf(rows.length, kept.length) }
}

// ─── Filters 6 & 7: IG-2 axes (Pattern, Learning Objective) ──────────────────

/**
 * The outcome of an IG-2 axis filter. Discriminated union on `kind`:
 *  - `'fatal'`  — the Bank column is entirely absent; the orchestrator halts.
 *  - `'result'` — normal FilterResult (kept/rejected/stats).
 *
 * Defined as its own type (rather than `{kind:'fatal'} | FilterResult`) so
 * TypeScript can discriminate cleanly — `FilterResult` has no `kind` field of
 * its own, so the bare union would not narrow without this discriminant.
 */
export type Ig2FilterOutcome =
  | { readonly kind: 'fatal'; readonly axis: string }
  | ({ readonly kind: 'result' } & FilterResult)

/**
 * Shared IG-2 axis membership helper. The IG-2 fail-loud rule (§4.2 / §11.2 /
 * §11.4): if the Bank column is ENTIRELY ABSENT across every row, the filter
 * cannot run and the Generator halts Fatal — it must NOT silently skip the
 * filter (that would weaken the Blueprint, the worst failure mode).
 *
 * "Entirely absent" means every row's axis is null/undefined. A mix of null
 * and populated is NOT absent — the filter runs, nulls are admitted (incomplete
 * → Reduced Confidence downstream), and populated values are enum-checked.
 *
 * Returns:
 *  - {kind:'fatal'}         — column entirely absent; caller emits a Fatal.
 *  - {kind:'result', ...}   — the normal FilterResult (kept/rejected/stats).
 */
function ig2AxisFilter(
  rows: readonly BankMetadataRow[],
  axis: 'pattern' | 'learning_objective',
  allowed: ReadonlySet<string>,
  readAxis: (row: BankMetadataRow) => unknown,
  reasonKind: 'pattern' | 'learning_objective'
): Ig2FilterOutcome {
  // Detect "column entirely absent." If even one row carries a value, the
  // column is considered present (the Bank has the axis; some rows just lack it).
  let anyPresent = false
  for (const row of rows) {
    if (!axisAbsent(readAxis(row))) {
      anyPresent = true
      break
    }
  }
  if (!anyPresent) {
    // IG-2 fail-loud. The Bank cannot supply this required axis at all.
    return {
      kind: 'fatal',
      axis: axis === 'pattern' ? 'question_pattern' : 'learning_objective',
    }
  }

  const kept: BankMetadataRow[] = []
  const rejected: ExclusionEntry[] = []
  for (const row of rows) {
    const value = readAxis(row)
    if (axisAbsent(value)) {
      // Incomplete axis → ADMIT (Maximum Recall, §2.3 Invariant #2 + §4.4).
      // The incompleteness becomes a Reduced-Confidence signal at Discovery.
      kept.push(row)
    } else if (typeof value === 'string' && allowed.has(value)) {
      kept.push(row)
    } else {
      // Present but out-of-enum → reject (Bank-data-quality gate, AP-9).
      rejected.push(exclusion(row, { kind: reasonKind, code: row.questionCode }))
    }
  }
  return {
    kind: 'result',
    kept,
    rejected,
    stats: statsOf(rows.length, kept.length),
  }
}

/**
 * Pattern Filter. §4.2 / §4.3 (6th — requires IG-2 `question_pattern`).
 *
 * IG-2 axis. Fail-loud if the column is entirely absent; per-row null admitted;
 * out-of-enum (anything outside the 6-value Pattern vocabulary, including the
 * D-6-corrected two-word `'Matching Concept'`) rejected.
 *
 * Returns the raw `Ig2FilterOutcome` — the Fatal path is PRESERVED (not
 * converted to an empty `kept[]`), so a standalone caller can observe the
 * missing-axis outcome. The orchestrator `runFilters` is what turns a Fatal
 * into a `FilterStageResult.ok:false` with a diagnostic; that transformation
 * lives in exactly one place (the orchestrator), not duplicated in the wrapper.
 *
 * Why this return type differs from the other 5 filters (`FilterResult`):
 * Pattern and Learning Objective are the only IG-2 axes (§4.2). Their fail-
 * loud-on-missing-column posture (§11.2 / §11.4) is an OUTCOME that callers
 * must be able to see, not a value to silently flatten. The other 5 filters
 * have no Fatal path and return `FilterResult` directly.
 */
export function patternFilter(
  rows: readonly BankMetadataRow[],
  _plan: QueryPlan
): Ig2FilterOutcome {
  // Universal-null pattern column (every row NULL/absent) is NOT fatal: the
  // rows are retained through this axis and the runtime classifies the pool's
  // availability as 'UNAVAILABLE' (degraded pattern semantics downstream).
  // Only a PARTIALLY populated column still runs the per-row enum filter, and
  // the other IG-2 axis (learning_objective) remains fail-loud.
  let anyPresent = false
  for (const row of rows) {
    if (!axisAbsent(row.questionPattern)) {
      anyPresent = true
      break
    }
  }
  if (!anyPresent) {
    return {
      kind: 'result',
      kept: rows,
      rejected: [],
      stats: statsOf(rows.length, rows.length),
    }
  }

  return ig2AxisFilter(
    rows,
    'pattern',
    PATTERN_VALUES,
    (row) => row.questionPattern,
    'pattern'
  )
}

/**
 * Learning Objective Filter. §4.2 / §4.3 (7th — requires IG-2 `learning_objective`).
 *
 * IG-2 axis. Fail-loud if the column is entirely absent; per-row null admitted;
 * out-of-enum (anything outside LO1..LO4) rejected.
 *
 * Returns the raw `Ig2FilterOutcome` — see patternFilter for rationale. The
 * Fatal-with-diagnostic transformation lives in the orchestrator, not here.
 */
export function learningObjectiveFilter(
  rows: readonly BankMetadataRow[],
  _plan: QueryPlan
): Ig2FilterOutcome {
  return ig2AxisFilter(
    rows,
    'learning_objective',
    LO_VALUES,
    (row) => row.learningObjective,
    'learning_objective'
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Fatal diagnostic builder — for IG-2 missing-axis halts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the Fatal diagnostic for an IG-2 axis the Bank cannot supply (§11.2
 * "Missing Metadata" / GeneratorFatalCategory `'missing_required_axis'`).
 *
 * Per §11.3 the diagnostic carries category, severity, explanation, and a
 * recommendation a Reviewer can act on (here: add the column to the Bank /
 * unblock E-0). Mirrors ReaderError anatomy so the Runtime API can surface
 * Generator failures uniformly with Reader failures.
 */
function missingAxisFatal(axis: string): FatalDiagnostic {
  return {
    category: 'missing_required_axis',
    severity: 'Fatal',
    explanation: `Required IG-2 axis '${axis}' is absent from every Bank row — the Generator cannot execute the corresponding filter without silently weakening the Blueprint.`,
    recommendation:
      'Add the column to the Bank (unblock E-0 / IG-2 closure) and re-import, or remove the axis from the Blueprint via an auditable change. Do NOT skip the filter.',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Filter registry — maps FilterId → implementation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The 7 filters keyed by their FilterId. This is the SINGLE place a new filter
 * implementation is wired in; `runFilters` iterates FILTER_EXECUTION_ORDER and
 * looks each id up here. Adding a filter = add the FilterId to contracts.ts
 * (a contract change) + add the implementation + add it here.
 *
 * The IG-2 filters (pattern, learning_objective) are special-cased inside
 * `runFilters` because they can return a Fatal; the others are plain FilterFns.
 */
const FILTERS: Record<
  Exclude<FilterId, 'pattern' | 'learning_objective'>,
  FilterFn
> = {
  exclusion: exclusionFilter,
  status: statusFilter,
  document: documentFilter,
  coverage: coverageFilter,
  difficulty: difficultyFilter,
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Orchestrator — runFilters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run Stage 2 (Metadata Filtering). Pulls the Bank rows once via the injected
 * adapter, then applies the 7 filters in the FIXED normative order
 * (FILTER_EXECUTION_ORDER, §4.3 — most selective first), threading each
 * filter's `kept` into the next.
 *
 * On any IG-2 missing-axis Fatal, halts immediately and returns `ok:false`
 * with the diagnostic (§11.2 / §11.4 — never silently skip a filter).
 *
 * Emits one `generator.filter.rows_reduced` counter per filter that dropped
 * ≥1 row to the optional sink (F-2.2.2 instrumentation). The sink is
 * best-effort (observability contract; never throws).
 *
 * DETERMINISM: pure function of (adapter, plan, sink state is ignored for
 *              equality — sink calls are side-effects for metrics only).
 *              Same adapter+plan → same rows/rejectionLog/perFilter.
 */
export function runFilters(
  adapter: BankReadAdapter,
  plan: QueryPlan,
  sink: ObservabilitySink = noopSink
): FilterStageResult {
  let rows: readonly BankMetadataRow[] = adapter.readMetadata()
  const rejectionLog: ExclusionEntry[] = []
  const perFilter: PerFilterReport[] = []
  // A stable run id for observability counters. The Generator is deterministic
  // given Bank state; this id correlates counters within a run. It is derived
  // from the inputs (NOT the wall clock) so two identical runs share an id.
  const runId = deriveRunId(plan)

  for (const filterId of FILTER_EXECUTION_ORDER) {
    let result: FilterResult

    if (filterId === 'pattern') {
      // The public wrapper preserves the raw Ig2FilterOutcome; this is the
      // single place a Fatal outcome is converted to the orchestrator's
      // `ok:false` FilterStageResult. No duplicated ig2AxisFilter call.
      const outcome = patternFilter(rows, plan)
      if (outcome.kind === 'fatal') {
        return { ok: false, fatalDiagnostics: [missingAxisFatal(outcome.axis)] }
      }
      result = outcome
    } else if (filterId === 'learning_objective') {
      const outcome = learningObjectiveFilter(rows, plan)
      if (outcome.kind === 'fatal') {
        return { ok: false, fatalDiagnostics: [missingAxisFatal(outcome.axis)] }
      }
      result = outcome
    } else {
      result = FILTERS[filterId as Exclude<FilterId, 'pattern' | 'learning_objective'>](
        rows,
        plan
      )
    }

    // Thread survivors into the next filter.
    rows = result.kept

    // Accumulate the audit trail (cumulative across all 7 filters).
    for (const e of result.rejected) rejectionLog.push(e)

    // Selectivity report.
    perFilter.push({ filterId, stats: result.stats })

    // Observability: emit a counter when this filter dropped ≥1 row.
    if (result.stats.rowsRejected > 0) {
      const counter: CounterEvent = {
        name: 'generator.filter.rows_reduced',
        labels: { filter: filterId },
        value: result.stats.rowsRejected,
        runId,
      }
      sink.emit(counter)
    }
  }

  return {
    ok: true,
    rows,
    rejectionLog,
    perFilter,
  }
}

/**
 * Derive a stable run id from the QueryPlan. NOT the wall clock — the
 * Generator is deterministic given inputs. Two runs with the same plan share
 * an id; this is correct (they ARE the same run for correlation purposes).
 * The id is opaque and used only as a counter label.
 */
function deriveRunId(plan: QueryPlan): string {
  // Cheap, stable, collision-unlikely for correlation purposes. Not a security
  // hash — observability only.
  const docKey = plan.permittedDocuments.join(',')
  const exclKey = plan.exclusions.join(',')
  const covKey = plan.coverageRequirements.map((c) => c.ruleId).join(',')
  return `gen:${docKey}|${exclKey}|${covKey}`
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN NOTE — F-2.2.2.1 "and timing"
// ═══════════════════════════════════════════════════════════════════════════
// The backlog item reads "per-filter row-count reduction AND timing." The
// timing half is intentionally NOT implemented inside this module:
//
//   - lib/engine/README.md §1: "No Date.now(), Math.random(), process.hrtime(),
//     or wall-clock in any pure module."
//   - shared/observability.ts: ModuleTimingEvent.durationMs "is measured by
//     the caller (Runtime API or the module wrapper), never by reading the
//     clock inside the module."
//
// Timing belongs to the future Runtime API wrapper (E-1.4 / E-7) that owns the
// wall clock and wraps runFilters. E-2C delivers the deterministic half
// (row-count reduction via PerFilterReport.stats + CounterEvent emission); the
// timing half is deferred by design, not cut. This is the spec-consistent
// reading of F-2.2.2.1.

// ═══════════════════════════════════════════════════════════════════════════
// 9. Pattern Availability Classifier (question_pattern universal-null hotfix)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pure derivation of the structural pattern pool:
 * Raw Bank rows -> Status Filter -> Document Filter.
 *
 * Ignores transient exclusions, coverage, difficulty, pattern, and LO filters.
 */
export function deriveStructuralPatternPool(
  rows: readonly BankMetadataRow[],
  plan: QueryPlan
): readonly BankMetadataRow[] {
  const statusKept = statusFilter(rows, plan).kept
  return documentFilter(statusKept, plan).kept
}

/**
 * Pure classifier for Pattern availability in a structural eligible pool.
 *
 * - FULL: Every row has a usable non-null questionPattern.
 * - PARTIAL: At least one row has a usable pattern, AND at least one row has NULL/absent pattern.
 * - UNAVAILABLE: Every row has NULL/absent questionPattern.
 *
 * Empty pool semantic: Handled defensively via explicit precondition.
 * A completely empty pool is structurally unreachable at this boundary because
 * downstream components (Pool Expansion / Shortfall) intercept empty pools before
 * Pattern measurement.
 */
export function classifyPatternAvailability(
  rows: readonly BankMetadataRow[]
): PatternAvailability {
  if (rows.length === 0) {
    throw new Error('classifyPatternAvailability precondition failed: structural eligible pool cannot be empty')
  }

  let hasUsable = false
  let hasNull = false

  for (const row of rows) {
    if (axisAbsent(row.questionPattern)) {
      hasNull = true
    } else {
      hasUsable = true
    }
  }

  if (hasUsable && hasNull) return 'PARTIAL'
  if (hasUsable) return 'FULL'
  return 'UNAVAILABLE'
}
