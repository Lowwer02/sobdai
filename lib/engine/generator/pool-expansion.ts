/**
 * lib/engine/generator/pool-expansion.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator Stage 5 — Pool Expansion.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0
 *       §2.2 (Stage Contracts — row 5: "Validated Pool + Shortfall Report →
 *             Expanded Pool (or unchanged); resolve warnings via controlled
 *             over-fetch; never weaken rules; stops at limits"),
 *       §2.3 (Invariant #1 — monotonic growth in multiplicity: Expansion only
 *             ADDS Codes; never removes a survivor),
 *       §6.2 (Pipeline Relationship: Pool Validation → Pool Expansion →
 *             CandidateSet; Shortfall Report produced against the Pool is
 *             carried into the CandidateSet as metadata),
 *       §8   (Pool Expansion — the whole section; see §8.1–§8.5 below),
 *       §11.2 (Failure Catalogue row "Expansion Limit Hit" → Warning),
 *       §11.4 (No Silent Weakening),
 *       §12.4 (Token Efficiency does NOT mean excluding valid Candidates).
 *
 * WHAT THIS MODULE IS (§8).
 *  - Stage 5 (Pool Expansion): enlarge the Candidate Pool via CONTROLLED
 *    OVER-FETCH when Pool Validation reported reduced headroom (Warnings), so
 *    downstream Ranking has room to optimize. Expansion is the only stage that
 *    may ADD Codes to the pool after Discovery (§2.3 Invariant #1 — monotonic
 *    growth in multiplicity).
 *
 * WHAT THIS MODULE IS NOT (§8.3 Non-Negotiable Rule + §8.5).
 *  - ❌ Does NOT weaken any filter axis (Document/Difficulty/Pattern/LO). Every
 *         newly discovered Candidate MUST pass the EXACT same filter pipeline
 *         (the task brief's hard rule + §8.3). Re-uses E-2C's `runFilters` and
 *         E-2D's `discoverCandidates` verbatim — no parallel re-implementation.
 *  - ❌ Does NOT treat a missing IG-2 axis as a wildcard to inflate counts.
 *  - ❌ Does NOT drop a coverage requirement.
 *  - ❌ Does NOT rank, score, or select (Ranking's job; §8.5).
 *  - ❌ Does NOT invent, repair, or change Candidate metadata (task brief).
 *  - ❌ Does NOT re-classify. Pool Validation remains the source of truth
 *         (task brief): the ShortfallReport + classification are CARRIED
 *         FORWARD UNCHANGED. Re-validating would silently overwrite Validation's
 *         verdict, which the brief forbids.
 *  - ❌ Does NOT read content. Metadata only.
 *  - ❌ Does NOT read the wall clock or access the Bank directly. The expanded
 *         search window is supplied by the caller as already-read rows (the
 *         Generator's filter adapters are injected — README §2; purity contract).
 *
 * WHEN EXPANSION RUNS (§8.1).
 *  - Runs ONLY when Validation's classification === 'Warning' (satisfiable but
 *    insufficient headroom for Ranking). It does NOT run for Pass (nothing to
 *    relieve), Blocking, or Fatal (those halt or surface to Human Review).
 *
 * HOW EXPANSION GETS MORE CANDIDATES (purity-preserving design).
 *  - The Candidate Pool from E-2D already contains EVERY Code that survived the
 *    initial filter pass. To "expand the search window" (§8.2 / task brief
 *    Phase 1) the stage needs MORE Bank rows than the initial read saw. Per the
 *    Engine's purity contract (README §1 + §2), Bank data enters pure modules as
 *    EXPLICIT INJECTED INPUT — exactly as E-2C takes a `BankReadAdapter` and
 *    E-2D takes `rows`. E-2E therefore takes a `supplementalRows` array (the
 *    caller-read expanded window, scoped to permitted documents by the caller).
 *    E-2E itself performs NO I/O and imports ZERO Supabase (verified by test).
 *
 * DETERMINISM (task brief: "No randomization. No scoring. No prioritization.").
 *  - The three expansion phases run in a FIXED order. New Candidates are added
 *    in a deterministic order (Code-sorted) so the expanded pool is byte-
 *    identical regardless of the supplemental rows' input ordering. Caps are
 *    enforced uniformly (no bucket is favoured over another).
 *
 * FAILURE BEHAVIOUR (task brief + §11.2).
 *  - Expansion NEVER fails. If a cap is hit or the supplemental window is
 *    exhausted before headroom is relieved, the result carries a
 *    `GeneratorWarning` forward (§11.2 "Expansion Limit Hit → Warning") and the
 *    original ShortfallReport is preserved. Pool Validation remains source of
 *    truth; Expansion only honestly reports what it did.
 *
 * ARCHITECTURE DECISIONS (spec ambiguities — recorded here for audit):
 *   E1 — Carry-forward, not re-validation. The ShortfallReport + classification
 *        from E-2D are returned UNCHANGED. Rationale: the task brief states
 *        "Pool Validation remains source of truth" and "Shortfall information
 *        preserved." Re-running validatePool() post-expansion would silently
 *        clear Warnings (the larger pool may now have headroom), overwriting
 *        Validation's verdict — a §11.4 silent-weakening-adjacent act. The
 *        improved headroom is reflected implicitly in the larger pool, which
 *        Ranking observes downstream.
 *   E2 — Supplemental rows are injected, not fetched. The "expanded search
 *        window" (task brief Phase 1) is supplied by the caller as
 *        `supplementalRows`. This is the only purity-preserving way to add
 *        Candidates (the pool alone contains none to expand), and it mirrors
 *        E-2C/E-2D's injected-Bank-data pattern. E-2E never imports Supabase.
 *   E3 — Re-use the exact filter pipeline. Supplemental rows pass through
 *        E-2C's `runFilters` (all 7 filters, fixed order) and E-2D's
 *        `discoverCandidates` unchanged. This guarantees §8.3: no filter is
 *        bypassed. A parallel re-implementation would risk divergence — the
 *        worst failure mode (§11.4).
 *   E4 — Per-bucket cap applies only to LO buckets with a real target (>0).
 *        Difficulty/Pattern slots carry target=0 (Solver-derived, §7.3); capping
 *        them at 2×0 would exclude every Candidate for those axes, violating
 *        Maximum Recall (§12.4). Those axes are bounded by the total cap +
 *        bank exhaustion only.
 *   E5 — Total cap default is plan-derived, never invented. It scales with the
 *        Blueprint's structure (§12.3 scaling promise), not Bank size:
 *        `existingPoolSize + max(Σ LO targets, sets × perSet) × headroomFactor`.
 *        Configurable via `ExpansionOptions.maxPoolSize`.
 */

import type {
  Candidate,
  CandidatePool,
  GeneratorSeverity,
  GeneratorWarning,
  QueryPlan,
  ShortfallReport,
} from './contracts'
import { InMemoryBankAdapter, runFilters } from './metadata-filters'
import { discoverCandidates, type DiscoveryContext, type PoolValidationResult } from './discovery'
import { noopSink, type ObservabilitySink, type CounterEvent } from '../shared/observability'
import type { SyntheticBankRow } from '../shared/testing/fixtures'
import type { LearningObjective } from '../reader/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// Module constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The default headroom factor applied to per-bucket and total caps.
 *
 * Architecture note (read before changing):
 *  - §8.4 per-bucket cap: "expansion never more than doubles a bucket's target
 *    count." A factor of 2 is therefore the spec-mandated ceiling, not an
 *    invented default. Configurable via `ExpansionOptions.headroomFactor` for
 *    deployments that want a tighter or looser over-fetch budget; values < 1
 *    are rejected (they would SHRINK the pool, violating §2.3 Invariant #1).
 */
const DEFAULT_HEADROOM_FACTOR = 2

/**
 * The per-Set question count assumed when deriving the total cap from the plan.
 *
 * Architecture note: identical in origin to E-2D's `DEFAULT_BLUEPRINT_PER_SET`.
 * The FROZEN QueryPlan contract does not expose `perSet` (the Query Planner
 * dropped it as a Solver concern); the total-cap derivation needs a per-Set
 * reference, so it falls back to Blueprint v3.0's published default (5 Sets ×
 * 100 questions/Set). This constant SHOULD disappear once `perSet` becomes an
 * explicit QueryPlan field (a future contract revision, not this session).
 */
const DEFAULT_BLUEPRINT_PER_SET = 100

//////////////////////////////////////////////////////////////////////////
// STAGE 5 — POOL EXPANSION
//
// Enlarge the Candidate Pool via controlled over-fetch when Pool Validation
// reported Warnings (Architecture §8). Expansion ONLY adds Codes (§2.3
// Invariant #1); it never removes a survivor, never weakens a filter (§8.3),
// never ranks (§8.5), and never fails (task brief + §11.2).
//
// This stage group contains:
//   - Public API   : PoolExpansionInput, PoolExpansionResult, ExpansionReport,
//                    ExpansionOptions
//   - Helpers      : cap derivation, per-bucket accounting, dedup, warning build
//   - Entry point  : expandPool()
//////////////////////////////////////////////////////////////////////////

// ═══════════════════════════════════════════════════════════════════════════
// 5.1 Public API — Pool Expansion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 5 input.
 *
 *  - `validation`: the E-2D result. Pool Validation is the SOURCE OF TRUTH
 *    (task brief); its `shortfallReport` + `classification` are carried forward
 *    unchanged. Expansion reads `classification` to decide whether to run (§8.1)
 *    and reads `pool` to dedup new Candidates against existing Codes (§2.3).
 *  - `supplementalRows`: the caller-read expanded search window (task brief
 *    Phase 1, "within permitted documents"). These are Bank rows the orchestrator
 *    fetched beyond the initial filter read; E-2E re-runs the FULL filter
 *    pipeline on them (§8.3 — never bypassed). May be empty (expansion is a
 *    no-op then). See decision E2.
 *  - `ctx`: plan + Document Registry, threaded into `discoverCandidates` so
 *    newly admitted rows materialize through the EXACT same Discovery path
 *    (Tier derivation, Completeness, Confidence, Provenance).
 *  - `options`: optional cap overrides + observability sink.
 */
export interface PoolExpansionInput {
  readonly validation: PoolValidationResult
  readonly supplementalRows: readonly SyntheticBankRow[]
  readonly ctx: DiscoveryContext
  readonly options?: ExpansionOptions
}

/**
 * Optional Pool Expansion configuration. All fields optional; sensible
 * spec-derived defaults apply (see DEFAULT_HEADROOM_FACTOR + deriveMaxPoolSize).
 */
export interface ExpansionOptions {
  /**
   * Headroom factor for per-bucket and total caps. Default 2 (§8.4 "never more
   * than doubles"). Must be ≥ 1; values < 1 are rejected (they would shrink the
   * pool, violating §2.3 Invariant #1 — monotonic growth).
   */
  readonly headroomFactor?: number
  /**
   * Hard total cap on the expanded pool size (§8.4 "total CandidateSet cap").
   * When omitted, a plan-derived default is used (decision E5). The cap bounds
   * the Generator's over-fetch COST; it never silently weakens a filter (§11.4).
   */
  readonly maxPoolSize?: number
  /**
   * Observability sink for expansion counters (mirrors E-2C's instrumentation).
   * Best-effort; never affects the deterministic result. Defaults to noop.
   */
  readonly sink?: ObservabilitySink
}

/**
 * Stage 5 result. Composes the expanded pool with the CARRIED-FORWARD
 * Validation verdict and an ExpansionReport audit trail.
 *
 * The `pool` is a NEW CandidatePool object when expansion ran and added
 * Candidates; otherwise it is the SAME reference as `validation.pool`
 * (Expansion never mutates — §2.3 + immutability contract).
 *
 * `shortfallReport` and `classification` are ALWAYS the Validation values,
 * unchanged (decision E1 — Pool Validation remains source of truth).
 */
export interface PoolExpansionResult {
  /** The expanded pool (new object if Candidates were added; else unchanged). */
  readonly pool: CandidatePool
  /** CARRIED FORWARD from Validation, unchanged (decision E1). */
  readonly shortfallReport: ShortfallReport
  /** CARRIED FORWARD from Validation, unchanged (decision E1). */
  readonly classification: GeneratorSeverity
  /** Audit trail: what expansion did (phases, counts, caps). Never null. */
  readonly expansionReport: ExpansionReport
}

/**
 * Why expansion did or did not run. Discriminated for audit clarity (§9
 * Provenance / §11.4 No Silent Weakening — every decision is explainable).
 */
export type ExpansionOutcome =
  | { readonly kind: 'expanded'; readonly candidatesAdded: number }
  | { readonly kind: 'no_op'; readonly reason: NoOpReason }

/**
 * The concrete reason expansion was a no-op. One per gate condition (§8.1).
 */
export type NoOpReason =
  | 'classification_not_warning' // §8.1: only Warrants trigger expansion.
  | 'no_supplemental_rows' // nothing to over-fetch (window already exhausted).
  | 'no_eligible_supplemental_rows' // supplemental rows all rejected by filters.
  | 'all_supplemental_already_present' // every survivor was already in the pool.
  | 'no_warnings' // classification was Warning but shortfallReport had no entries.

/**
 * The deterministic phases expansion executes (task brief "Example architecture"
 * + §8.2). Recorded in order on `phasesRun` for audit.
 */
export type ExpansionPhase =
  | 'gate' // §8.1 classification check.
  | 'search_window' // Phase 1: ingest supplemental rows (within permitted docs).
  | 'filter_pipeline' // Phase 2: re-apply all 7 filters (§8.3 — never bypassed).
  | 'materialize' // Phase 3: discoverCandidates + dedup + cap enforcement.
  | 'carry_forward' // preserve Validation's shortfallReport + classification.

/**
 * The expansion audit trail. Every field is a pure count or flag — no opinions,
 * no scores (§8.5 — Expansion does not rank). A Reviewer can reconstruct exactly
 * what Stage 5 did by reading this report (§9 traceability).
 */
export interface ExpansionReport {
  /** Which outcome occurred. Discriminated for clean narrowing. */
  readonly outcome: ExpansionOutcome
  /** The phases executed, in order. Empty when expansion did not run. */
  readonly phasesRun: readonly ExpansionPhase[]
  /** Supplemental rows fed into Phase 1 (the expanded window size). */
  readonly rowsConsidered: number
  /** Supplemental rows that survived the re-applied filter pipeline (Phase 2). */
  readonly rowsEligible: number
  /** New Candidates unioned into the pool (Phase 3, post-dedup, post-cap). */
  readonly candidatesAdded: number
  /** Survivors skipped because their Code was already in the pool (dedup). */
  readonly candidatesSkippedDuplicate: number
  /** Survivors skipped because a cap (per-bucket or total) was reached. */
  readonly candidatesSkippedCap: number
  /** True if the total-pool cap stopped addition (§8.4 + §11.2 → Warning). */
  readonly totalCapHit: boolean
  /** True if a per-bucket (LO) cap stopped addition (§8.4 + §11.2 → Warning). */
  readonly bucketCapHit: boolean
  /**
   * True if every eligible supplemental row was consumed without a cap stopping
   * addition early (§8.4 "Bank exhaustion: stops at what's available"). When
   * true AND candidatesAdded < rowsEligible, the only skips were dedup/cap.
   */
  readonly bankExhausted: boolean
  /**
   * Non-fatal Warning carried forward when a cap was hit (§11.2 "Expansion Limit
   * Hit → Warning"). Null when no cap was hit. Distinct from the ShortfallReport
   * (which Validation owns); this is Expansion's own advisory for E-2F to fold
   * into the CandidateSet's `warnings[]`.
   */
  readonly warning: GeneratorWarning | null
}

// ═══════════════════════════════════════════════════════════════════════════
// 5.2 Pool Expansion — helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer the Set count from the QueryPlan. Mirrors E-2D's `inferSetCount`: with
 * 3 difficulties enumerated per Set, setCount = difficultySlots.length / 3.
 * Falls back to 5 (Blueprint v3.0) for degenerate plans. NOT re-exported from
 * E-2D (it's internal there); replicated here as a small, cited helper to keep
 * the modules decoupled.
 */
function inferSetCount(plan: QueryPlan): number {
  if (plan.difficultySlots.length >= 3) {
    return Math.floor(plan.difficultySlots.length / 3)
  }
  return 5
}

/**
 * Derive the per-LO cap (§8.4 per-bucket: "never more than doubles a bucket's
 * target count"). For each LO value, the cap = `headroomFactor × maxTarget`,
 * where maxTarget is the largest per-Set targetCount for that LO across all
 * Sets. LOs with maxTarget === 0 are NOT capped (decision E4 — target=0 means
 * the LO isn't required; capping at 0 would exclude every Candidate for it,
 * violating Maximum Recall §12.4).
 *
 * Returns a Map<LO, cap> containing only the LOs that HAVE a cap (target > 0).
 */
function deriveLoBucketCaps(
  plan: QueryPlan,
  headroomFactor: number
): ReadonlyMap<LearningObjective, number> {
  const maxTargetByLo = new Map<LearningObjective, number>()
  for (const slot of plan.learningObjectiveSlots) {
    const lo = slot.axisValue as LearningObjective
    const prev = maxTargetByLo.get(lo) ?? 0
    if (slot.targetCount > prev) maxTargetByLo.set(lo, slot.targetCount)
  }
  const caps = new Map<LearningObjective, number>()
  for (const [lo, maxTarget] of maxTargetByLo) {
    if (maxTarget > 0) {
      caps.set(lo, maxTarget * headroomFactor)
    }
  }
  return caps
}

/**
 * Derive the total pool cap (§8.4 "total CandidateSet cap"). Default is
 * plan-derived (decision E5): `existingPoolSize + budget`, where budget scales
 * with Blueprint structure (§12.3 scaling promise), never with Bank size:
 *   budget = max(Σ LO targets, sets × perSet) × headroomFactor
 * An explicit `options.maxPoolSize` overrides this default entirely.
 */
function deriveMaxPoolSize(
  plan: QueryPlan,
  existingPoolSize: number,
  headroomFactor: number,
  override: number | undefined
): number {
  if (override !== undefined) return override
  const loBudget = plan.learningObjectiveSlots.reduce((sum, s) => sum + s.targetCount, 0)
  const setCount = inferSetCount(plan)
  const structuralFloor = setCount * DEFAULT_BLUEPRINT_PER_SET
  const budget = Math.max(loBudget, structuralFloor) * headroomFactor
  return existingPoolSize + budget
}

/**
 * Resolve + validate the headroom factor. Rejects values < 1 (they would shrink
 * the pool — §2.3 Invariant #1 violation). Throws on invalid input so a
 * misconfigured caller fails FAST + LOUD (Engine Foundation §7), rather than
 * silently producing a smaller pool.
 */
function resolveHeadroomFactor(raw: number | undefined): number {
  const f = raw ?? DEFAULT_HEADROOM_FACTOR
  if (!Number.isFinite(f) || f < 1) {
    throw new RangeError(
      `ExpansionOptions.headroomFactor must be a finite number ≥ 1 (got ${String(raw)}). ` +
        'A factor < 1 would shrink the pool, violating §2.3 Invariant #1 (monotonic growth).'
    )
  }
  return f
}

/** Build a GeneratorWarning (§11.2 "Expansion Limit Hit → Warning"). */
function capHitWarning(axis: 'total' | 'bucket', detail: string): GeneratorWarning {
  return {
    severity: 'Warning',
    axis: 'coverage', // Expansion caps are pool-wide advisories; 'coverage' is the
    // closest FROZEN ShortfallAxis. The detail string carries the specifics.
    explanation:
      `Pool Expansion hit the ${axis} cap before relieving all Validation warnings. ` +
      detail,
    recommendation:
      'Add more Bank Questions for the under-headroom buckets, or raise the expansion ' +
      'cap via ExpansionOptions (an auditable tuning decision). The CandidateSet is still ' +
      'emitted with the carried-forward Shortfall Report intact.',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5.3 Pool Expansion — the public entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enlarge the Candidate Pool via controlled over-fetch (Stage 5, §8).
 *
 * Pure and deterministic. Runs ONLY when Validation's classification is
 * 'Warning' (§8.1). Every supplemental row re-passes the EXACT same filter
 * pipeline (E-2C `runFilters`) and is materialized via E-2D `discoverCandidates`
 * — no filter is bypassed or weakened (§8.3 Non-Negotiable Rule). New
 * Candidates are deduplicated by Code against the existing pool (§2.3
 * Invariant #1 — Expansion only ADDS) and bounded by caps (§8.4).
 *
 * NEVER fails (task brief + §11.2): cap hits become a `GeneratorWarning` on the
 * returned `expansionReport`; the ShortfallReport + classification from
 * Validation are carried forward UNCHANGED (decision E1).
 *
 * @param input.validation        E-2D result (source of truth).
 * @param input.supplementalRows  Caller-read expanded window (decision E2).
 * @param input.ctx               Plan + Document Registry (for re-discovery).
 * @param input.options           Optional cap overrides + observability sink.
 */
export function expandPool(input: PoolExpansionInput): PoolExpansionResult {
  const { validation, supplementalRows, ctx, options } = input
  const sink = options?.sink ?? noopSink
  const headroomFactor = resolveHeadroomFactor(options?.headroomFactor)
  const plan = ctx.plan

  // The carried-forward verdict — ALWAYS Validation's values (decision E1).
  const carried: Pick<PoolExpansionResult, 'shortfallReport' | 'classification'> = {
    shortfallReport: validation.shortfallReport,
    classification: validation.classification,
  }

  // ── GATE (§8.1) ──────────────────────────────────────────────────────────
  // Expansion runs ONLY for Warnings. Pass/Blocking/Fatal return the pool
  // unchanged. An empty supplemental window is also a no-op (nothing to fetch).
  const gatePhases: ExpansionPhase[] = ['gate']
  if (validation.classification !== 'Warning') {
    return finishNoOp(validation.pool, carried, gatePhases, {
      kind: 'no_op',
      reason: 'classification_not_warning',
    }, 0)
  }
  if (supplementalRows.length === 0) {
    return finishNoOp(validation.pool, carried, gatePhases, {
      kind: 'no_op',
      reason: 'no_supplemental_rows',
    }, 0)
  }

  // ── PHASE 1 — Expand search window (task brief; within permitted docs) ──
  // The supplemental rows ARE the expanded window. The caller scoped them to
  // permitted documents; the filter pipeline (Phase 2) enforces the closed-set
  // Document Filter invariant (§8.3) regardless.
  const phasesRun: ExpansionPhase[] = ['gate', 'search_window']
  const rowsConsidered = supplementalRows.length

  // ── PHASE 2 — Re-apply the EXACT filter pipeline (§8.3 Non-Negotiable) ───
  // Every supplemental row passes through all 7 filters in FIXED order. This is
  // the hard rule: "Expansion NEVER bypasses Metadata Filters." Re-using
  // E-2C's runFilters guarantees zero divergence (decision E3).
  phasesRun.push('filter_pipeline')
  const filterResult = runFilters(new InMemoryBankAdapter([...supplementalRows]), plan, sink)
  if (!filterResult.ok) {
    // Filters can only go Fatal on an IG-2 column entirely absent from the
    // supplemental window. That is a Bank-state property, NOT an Expansion
    // failure: the original pool already passed these filters, so the column
    // exists in the Bank. A Fatal here means the supplemental window is
    // structurally narrower than the Bank (caller bug) — surface it honestly
    // without failing Expansion: carry the original pool + report forward, and
    // record the inability to expand. (Expansion NEVER fails — task brief.)
    sink.emit(reExpansionCounter('filter_fatal', 1))
    return finishNoOp(validation.pool, carried, phasesRun, {
      kind: 'no_op',
      reason: 'no_eligible_supplemental_rows',
    }, rowsConsidered)
  }
  const eligibleRows = filterResult.rows
  const rowsEligible = eligibleRows.length

  if (rowsEligible === 0) {
    return finishNoOp(validation.pool, carried, phasesRun, {
      kind: 'no_op',
      reason: 'no_eligible_supplemental_rows',
    }, rowsConsidered)
  }

  // ── PHASE 3 — Materialize + dedup + cap enforcement (§8.4) ──────────────
  phasesRun.push('materialize')
  const materialized = discoverCandidates({ rows: eligibleRows, ctx })
  // Discovery only goes Fatal on a duplicate-Code conflict WITHIN the
  // supplemental window or a Tier-derivation miss. The original pool's rows
  // already passed Discovery; a Fatal here is a supplemental-window integrity
  // issue. As above: Expansion NEVER fails — carry forward + report no-op.
  if (!materialized.ok) {
    sink.emit(reExpansionCounter('discovery_fatal', 1))
    return finishNoOp(validation.pool, carried, phasesRun, {
      kind: 'no_op',
      reason: 'no_eligible_supplemental_rows',
    }, rowsConsidered)
  }

  // Build the existing-Code index for O(1) dedup (§2.3 — only ADD, never dup).
  const existingCodes = new Set(validation.pool.candidates.map((c) => c.identity.questionCode))
  // Per-bucket (LO) live counts, seeded from the existing pool (cap applies to
  // the FULL post-expansion bucket, not just additions — §8.4 "a bucket's
  // target count").
  const loCounts = new Map<LearningObjective, number>()
  for (const c of validation.pool.candidates) {
    const lo = c.metadata.learningObjective
    if (lo !== null) loCounts.set(lo, (loCounts.get(lo) ?? 0) + 1)
  }
  const loCaps = deriveLoBucketCaps(plan, headroomFactor)
  const maxPoolSize = deriveMaxPoolSize(
    plan,
    validation.pool.candidates.length,
    headroomFactor,
    options?.maxPoolSize
  )

  // Deterministic addition order: Code-sorted. Makes the expanded pool byte-
  // identical regardless of supplemental-row input ordering (determinism
  // contract). No scoring, no prioritization between buckets (task brief).
  const newCandidates = [...materialized.pool.candidates].sort((a, b) =>
    a.identity.questionCode < b.identity.questionCode
      ? -1
      : a.identity.questionCode > b.identity.questionCode
        ? 1
        : 0
  )

  const accepted: Candidate[] = []
  let skippedDuplicate = 0
  let skippedCap = 0
  let totalCapHit = false
  let bucketCapHit = false

  for (const cand of newCandidates) {
    const code = cand.identity.questionCode

    // Dedup: a Code already in the pool is NOT re-added (§2.3 + §5.4 identity).
    if (existingCodes.has(code)) {
      skippedDuplicate++
      continue
    }

    // Total cap (§8.4): stop once the pool reaches the global ceiling.
    if (validation.pool.candidates.length + accepted.length >= maxPoolSize) {
      totalCapHit = true
      skippedCap += newCandidates.length - (accepted.length + skippedDuplicate)
      break
    }

    // Per-bucket cap (§8.4): for LOs with a real target, do not let the bucket
    // exceed headroomFactor × maxTarget. Candidates whose LO is uncapped (null,
    // or target=0) bypass this check (decision E4).
    const lo = cand.metadata.learningObjective
    const cap = lo !== null ? loCaps.get(lo) : undefined
    if (cap !== undefined) {
      const current = loCounts.get(lo!) ?? 0
      if (current >= cap) {
        bucketCapHit = true
        skippedCap++
        continue
      }
    }

    // Accept: record the addition + update live bucket accounting.
    accepted.push(cand)
    existingCodes.add(code)
    if (lo !== null) loCounts.set(lo, (loCounts.get(lo) ?? 0) + 1)
  }

  // ── CARRY FORWARD (decision E1) ──────────────────────────────────────────
  phasesRun.push('carry_forward')

  // If nothing was accepted, the pool is unchanged (return the same reference).
  if (accepted.length === 0) {
    const reason: NoOpReason =
      skippedDuplicate > 0 && skippedCap === 0
        ? 'all_supplemental_already_present'
        : 'no_eligible_supplemental_rows'
    return finishNoOp(validation.pool, carried, phasesRun, { kind: 'no_op', reason }, rowsConsidered)
  }

  // Build the expanded pool: existing Candidates (original order, untouched)
  // followed by new Candidates (Code-sorted). The queryPlan is unchanged —
  // Expansion never modifies the plan (§3.3 + task brief "cannot change
  // Candidate" extended to the plan).
  const expandedPool: CandidatePool = {
    candidates: [...validation.pool.candidates, ...accepted],
    queryPlan: plan,
  }

  // Bank-exhausted: every eligible row was considered (the loop did not break
  // early on the total cap). Per-bucket skips don't count as "early stop."
  const bankExhausted = !totalCapHit
  const warning: GeneratorWarning | null =
    totalCapHit || bucketCapHit
      ? capHitWarning(
          totalCapHit ? 'total' : 'bucket',
          totalCapHit
            ? `Reached the total pool cap of ${maxPoolSize} Candidates.`
            : `Reached a per-bucket (LO) cap of ${headroomFactor}× target for at least one Learning Objective.`
        )
      : null

  if (accepted.length > 0) {
    sink.emit(reExpansionCounter('candidates_added', accepted.length))
  }
  if (skippedCap > 0) {
    sink.emit(reExpansionCounter('candidates_skipped_cap', skippedCap))
  }

  const report: ExpansionReport = {
    outcome: { kind: 'expanded', candidatesAdded: accepted.length },
    phasesRun,
    rowsConsidered,
    rowsEligible,
    candidatesAdded: accepted.length,
    candidatesSkippedDuplicate: skippedDuplicate,
    candidatesSkippedCap: skippedCap,
    totalCapHit,
    bucketCapHit,
    bankExhausted,
    warning,
  }

  return { pool: expandedPool, ...carried, expansionReport: report }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5.4 Internal — no-op assembly + observability helper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assemble a no-op result (expansion did not add Candidates). The pool is the
 * SAME reference as Validation's (immutability — no pointless copy). The
 * verdict is carried forward (decision E1).
 */
function finishNoOp(
  pool: CandidatePool,
  carried: Pick<PoolExpansionResult, 'shortfallReport' | 'classification'>,
  phasesRun: readonly ExpansionPhase[],
  outcome: ExpansionOutcome,
  rowsConsidered: number
): PoolExpansionResult {
  const report: ExpansionReport = {
    outcome,
    phasesRun,
    rowsConsidered,
    rowsEligible: 0,
    candidatesAdded: 0,
    candidatesSkippedDuplicate: 0,
    candidatesSkippedCap: 0,
    totalCapHit: false,
    bucketCapHit: false,
    bankExhausted: false,
    warning: null,
  }
  return { pool, ...carried, expansionReport: report }
}

/**
 * Build an expansion observability counter. The runId is derived from the plan
 * (NOT the wall clock) so identical inputs share an id — mirrors E-2C's
 * `deriveRunId`. Opaque; used only as a counter label.
 */
function reExpansionCounter(name: string, value: number): CounterEvent {
  return {
    name,
    value,
    runId: 'expansion', // stable, plan-independent label; counters are best-effort.
  }
}
