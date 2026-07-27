/**
 * lib/engine/generator/candidate-set-emitter.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator Stage 6 — Candidate Set Emission.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0
 *       §2.2 (Stage Contracts — row 6: "Expanded Pool → CandidateSet; final
 *             immutable contract consumed by Ranking + Solver"),
 *       §6.2 (Pipeline Relationship: ... → Pool Expansion → CandidateSet),
 *       §9   (Provenance / Completeness / Confidence — Emitted unchanged),
 *       §10  (CandidateSet — the whole section; §10.3 Conceptual Shape,
 *             §10.4 Lifecycle — immutable once emitted),
 *       §12.2 (Determinism — byte-identical on identical inputs).
 *
 * WHAT THIS MODULE IS (§10 + the task brief).
 *  - Stage 6 (Candidate Set Emission): PURE ASSEMBLY. Package the existing
 *    artifacts produced upstream into the final immutable CandidateSet. It is the
 *    ONLY stage that produces a CandidateSet, and it is the LAST stage of
 *    Candidate Generation (E-2G, Ranking, Solver, Runtime are all downstream).
 *
 * WHAT THIS MODULE IS NOT (task brief — "Candidate Set Emission is pure
 * assembly. It NEVER ..."):
 *  - ❌ Does NOT change a Candidate (any facet). Candidates are emitted verbatim.
 *  - ❌ Does NOT mutate CandidatePool. The pool reference is read, never written.
 *  - ❌ Does NOT change Shortfall. The ShortfallReport is carried forward as-is.
 *  - ❌ Does NOT change a Warning. The upstream warning (if any) is forwarded.
 *  - ❌ Does NOT rank, score, or select (Ranking's job).
 *  - ❌ Does NOT solve constraints (Solver's job).
 *  - ❌ Does NOT repair metadata (§5.6 — Maximum Recall; gaps are FLAGGED, not
 *         fixed; that verdict stands into the CandidateSet).
 *  - ❌ Does NOT expand the pool (Pool Expansion's job, already done upstream).
 *  - ❌ Does NOT query the database / Supabase (purity contract, README §2).
 *  - ❌ Does NOT read content. Metadata only.
 *  - ❌ Does NOT read the wall clock (determinism contract, README §1). The
 *         identity.generatedAt is caller-supplied, never Date.now().
 *
 * WHY ASSEMBLY IS NON-TRIVIAL ENOUGH TO BE ITS OWN STAGE.
 *  The CandidateSet is a DENORMALIZED view (§10.3): it pre-computes the reverse
 *  lookups Ranking/Solver need so they don't re-derive eligibility. Three derived
 *  structures are assembled here, deterministically, from upstream artifacts:
 *   1. `slotIndex`         — slot-id → [Codes] reverse of provenance.eligibleSlots
 *                             (§10.3 slot_index; lets Ranking/Solver look up
 *                             "all Candidates eligible for slot X" in O(1)).
 *   2. `coverageSatisfaction` — CR-1 (document, topic) binding → [Codes]
 *                             (§10.3 coverage_satisfaction; mirrors the inverse
 *                             of provenance.coverageSatisfied).
 *   3. `statistics`        — aggregate counts (§11 / §10.3 metadata block;
 *                             audit + monitoring; pure counts, no opinions).
 *  Every one of these is a pure projection of the (already-frozen) Candidates +
 *  QueryPlan. No new metadata is invented; no survivor is dropped; no order is
 *  imposed beyond what the contracts already mandate.
 *
 * DETERMINISM (task brief: "Preserve determinism").
 *  - Candidate ORDER is preserved verbatim from the pool (Discovery's order,
 *    followed by Expansion's Code-sorted additions — already deterministic).
 *  - slotIndex / coverageSatisfaction iterate the Candidates in that SAME order;
 *    Codes are appended in encounter order so the value arrays are deterministic
 *    without any re-sort.
 *  - Map insertion order does NOT leak into the contract (a CandidateSet's slot
 *    keys are a Set of strings; the contract is "same keys + same value arrays").
 *    The determinism test compares Map ENTRIES (not JSON) precisely because the
 *    shared stableStringify helper renders a Map as `{}` (verified in test).
 *
 * FAILURE BEHAVIOUR.
 *  - Emission NEVER fails. It runs unconditionally on whatever Pool Expansion
 *    handed it (even a no-op Expansion with a Fatal classification — the
 *    CandidateSet is still emitted honestly; halting is the orchestrator's
 *    decision, not Emission's, per §10.4 "emitted with carried-forward report").
 *
 * ARCHITECTURE DECISIONS (spec ambiguities — recorded here for audit):
 *   F1 — Bundled input (user-approved). PoolExpansionResult alone does NOT carry
 *        three CandidateSet artifacts (exclusionsLog from E-2C's rejectionLog;
 *        identity from the runtime/orchestrator; meta = const + version). Rather
 *        than widen the FROZEN PoolExpansionResult contract or silently default
 *        exclusionsLog to [], Emission takes a composed input that threads these
 *        prior artifacts in. Pure assembly; zero existing files modified.
 *   F2 — slot-id is a canonical axis-ordered string over the BlueprintSlot's
 *        PRESENT axes (decision §3.2 / §9.2: slots may be axis-specific). Fixed
 *        axis order (set, document, difficulty, blueprintType, pattern,
 *        learningObjective) makes the id stable regardless of how the slot was
 *        constructed. Two slots with the same present axes + values share an id
 *        (they ARE the same cell). Separator `\u{0000}` mirrors E-2C's pair-key
 *        convention (a value-safe delimiter that cannot appear inside an enum).
 *   F3 — SlotIndex + CoverageSatisfaction carry Question CODES, not Candidate
 *        objects (§10.3 explicit: "Values are arrays of Question Codes"). The
 *        full Candidate lives in `candidates[]`; the indexes are Code-level
 *        lookups. This keeps the denormalization cheap + avoids duplicating the
 *        immutable Candidate graph.
 *   F4 — statistics is computed, not carried. §11 says CandidateStatistics is
 *        "aggregate statistics about a CandidateSet" — it is a DERIVED view of
 *        the very CandidateSet being emitted, so it is computed at emission time
 *        from the (already-frozen) candidates. It introduces no new information.
 *   F5 — warnings = [expansionReport.warning] filtered. The ONLY GeneratorWarning
 *        source today is Pool Expansion's cap-hit advisory (§11.2). Validation
 *        shortfalls live in the ShortfallReport, NOT in warnings[] (the contract
 *        separates them: warnings = general advisories; shortfallReport = per-
 *        axis). We forward Expansion's warning when present; the array form makes
 *        adding future warning sources additive.
 *   F6 — identity.generatedAt + bankStateHash are caller-supplied, nullable. The
 *        Generator is metadata-only + clock-free; it cannot compute a timestamp
 *        or a Bank hash (those are orchestrator/runtime concerns). The contract
 *        marks both `string | null` precisely so Emission never has to invent
 *        them. null is the honest value when the caller did not supply one.
 */

import type {
  Candidate,
  CandidateSet,
  CandidateSetIdentity,
  CandidateSetMeta,
  CandidateStatistics,
  CoverageSatisfaction,
  ExclusionEntry,
  GeneratorWarning,
  BlueprintSlot,
  SlotIndex,
} from './contracts'
import type { PoolExpansionResult } from './pool-expansion'
import type { Cr1DocumentTopicBinding } from './metadata-filters'

//////////////////////////////////////////////////////////////////////////
// STAGE 6 — CANDIDATE SET EMISSION
//
// Pure assembly of the final immutable CandidateSet (Architecture §10).
// Packages upstream artifacts (Expanded Pool, carried-forward ShortfallReport,
// carried-forward warning, exclusionsLog, runtime identity) into the contract
// consumed by Ranking + Solver. Never changes a Candidate, never mutates the
// pool, never repairs, ranks, solves, or queries the Bank.
//
// This stage group contains:
//   - Public API   : CandidateSetEmissionInput
//   - Helpers      : slot-id canonicalization, slot/coverage indexes, statistics
//   - Entry point  : emitCandidateSet()
//////////////////////////////////////////////////////////////////////////

// ═══════════════════════════════════════════════════════════════════════════
// 6.1 Module constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The CandidateSet spec version (§10.3 CandidateSetMeta.specVersion). Constant
 * for Candidate Generation Architecture v1.0. Bumping it is a contract change
 * requiring downstream negotiation — Emission hard-codes it; it is NOT a
 * parameter (so a misconfigured caller cannot produce a CandidateSet claiming a
 * spec version the Generator does not implement).
 */
const SPEC_VERSION = '1.0' as const

/**
 * The Generator implementation version stamped onto every emitted CandidateSet
 * (§10.3 CandidateSetMeta.generatorVersion). A single source of truth for "which
 * Generator produced this set" — bumped when the Generator's observable output
 * changes. NOT a Git SHA (that would couple the contract to build metadata the
 * pure module cannot read); a hand-maintained semver string.
 */
const GENERATOR_VERSION = '1.0.0'

/**
 * The axis order used to canonicalize a BlueprintSlot into a slot-id (decision
 * F2). Fixed + normative — reordering would change every slot-id, breaking the
 * SlotIndex contract. Mirrors the field-declaration order of `BlueprintSlot` in
 * contracts.ts so a reader can trace each axis to its contract field.
 */
const SLOT_AXIS_ORDER = [
  'setNumber',
  'document',
  'difficulty',
  'blueprintType',
  'pattern',
  'learningObjective',
] as const

/** Value-safe delimiter for slot-ids (mirrors E-2C's CR-1 pair-key convention). */
const SLOT_ID_DELIMITER = '\u{0000}'

// ═══════════════════════════════════════════════════════════════════════════
// 6.2 Public API — Candidate Set Emission
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 6 input. Composes the Stage-5 result with the three artifacts
 * `PoolExpansionResult` does NOT carry (decision F1):
 *
 *  - `expansion`     — the E-2E result. Source of: the expanded pool (→
 *                      candidates[]), the carried-forward ShortfallReport, and
 *                      the carried-forward warning (if any). Read-only.
 *  - `exclusionsLog` — E-2C's cumulative `FilterStageResult.rejectionLog`. The
 *                      §10.3 exclusions_log audit trail. The orchestrator threads
 *                      it forward from E-2C (it is not part of the E-2D/E-2E
 *                      carrier types). Defaults to `[]` when not supplied.
 *  - `identity`      — runtime-pinned CandidateSet identity (assemblyRequestId,
 *                      generatedAt, bankStateHash). The Generator is clock-free
 *                      and Bank-hash-free, so these are caller-supplied;
 *                      `generatedAt`/`bankStateHash` are nullable per contract.
 *  - `meta`          — optional override of `generatorVersion` (the specVersion
 *                      is a constant and NOT overridable). When omitted, the
 *                      module constant applies. Useful for staging/audit; the
 *                      default is the production version.
 *
 * None of these inputs are mutated. The function reads them and assembles.
 */
export interface CandidateSetEmissionInput {
  readonly expansion: PoolExpansionResult
  /** E-2C cumulative rejection log; defaulted to [] when omitted. */
  readonly exclusionsLog?: readonly ExclusionEntry[]
  /** Runtime-pinned identity (caller-supplied; generatedAt/bankStateHash nullable). */
  readonly identity: CandidateSetIdentity
  /** Optional generatorVersion override; specVersion is constant, not overridable. */
  readonly meta?: { readonly generatorVersion?: string }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6.3 Helpers — slot-id canonicalization (decision F2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonicalize a BlueprintSlot into a stable slot-id string (decision F2).
 *
 * Only the slot's PRESENT axes participate (§3.2 / §9.2: a slot may be axis-
 * specific — a Difficulty slot carries only `setNumber + difficulty`). Each
 * present axis contributes `axis=value`, joined in the fixed SLOT_AXIS_ORDER
 * with a value-safe delimiter. Absent axes contribute nothing.
 *
 * Two slots that name the same cell (same present axes, same values) share an
 * id — that is the SlotIndex key. The canonicalization is deterministic for a
 * given slot regardless of how the slot object was constructed.
 */
export function slotId(slot: BlueprintSlot): string {
  const parts: string[] = []
  for (const axis of SLOT_AXIS_ORDER) {
    const value = slot[axis]
    if (value === undefined) continue
    parts.push(`${axis}=${String(value)}`)
  }
  return parts.join(SLOT_ID_DELIMITER)
}

// ═══════════════════════════════════════════════════════════════════════════
// 6.4 Helpers — SlotIndex (§10.3 slot_index; decision F3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the SlotIndex (§10.3) — the reverse map from slot-id to the Question
 * Codes eligible for it.
 *
 * Pure projection of `provenance.eligibleSlots` (already computed in E-2D and
 * frozen on each Candidate). Iterates the Candidates in their emitted order, so
 * each slot's Code array is in deterministic encounter order WITHOUT any re-sort
 * (re-sorting would silently impose a new order on the artifact — forbidden).
 *
 * Codes (NOT Candidate objects) per the contract — the full Candidate lives in
 * `candidates[]`; the index is a Code-level lookup for Ranking/Solver (decision
 * F3).
 */
function buildSlotIndex(candidates: readonly Candidate[]): SlotIndex {
  const slots = new Map<string, string[]>()
  for (const cand of candidates) {
    const code = cand.identity.questionCode
    for (const slot of cand.provenance.eligibleSlots) {
      const id = slotId(slot)
      const list = slots.get(id)
      if (list === undefined) {
        slots.set(id, [code])
      } else {
        list.push(code)
      }
    }
  }
  // Freeze the value arrays at the type level (readonly). The Map itself is
  // wrapped in a ReadonlyMap by the SlotIndex contract; the inner arrays are
  // exposed as readonly via the contract's `readonly string[]` value type.
  return { slots: slots as ReadonlyMap<string, readonly string[]> }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6.5 Helpers — CoverageSatisfaction (§10.3 coverage_satisfaction; decision F3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build CoverageSatisfaction (§10.3) — the inverse of
 * `provenance.coverageSatisfied`. For each CR-1 (document, topic) binding the
 * Blueprint declares, records which Candidate Codes satisfy it.
 *
 * CR-1 is the ONLY coverage rule with a recognized per-Question binding shape
 * (`Cr1DocumentTopicBinding`, E-2C / E-2D). Other rules carry null/unknown
 * bindings and satisfy no per-Question predicate — they are therefore absent
 * from coverageSatisfaction (consistent with how E-2C/E-2D treat them).
 *
 * Bindings are sourced from the QueryPlan carried on the pool (the same plan
 * E-2D's `computeCoverageSatisfied` matched against); satisfying Codes are
 * accumulated from each Candidate's `provenance.coverageSatisfied` — but only
 * when the Candidate's (document, topic) actually matches the pair (the
 * authoritative check; provenance.coverageSatisfied is a rule-id list, not a
 * pair match, so we re-derive the pair membership here to populate the binding's
 * satisfyingCodes accurately).
 */
function buildCoverageSatisfaction(
  candidates: readonly Candidate[],
  coverageBindings: readonly { document: string; topic: string }[]
): CoverageSatisfaction {
  if (coverageBindings.length === 0) {
    return { bindings: [] }
  }
  // Pre-compute, for each (document, topic) pair, the satisfying Codes. Iterate
  // candidates in emitted order so the Code arrays are deterministic.
  const byPair = new Map<string, string[]>()
  for (const pair of coverageBindings) {
    byPair.set(pairKey(pair.document, pair.topic), [])
  }
  for (const cand of candidates) {
    const doc = cand.metadata.document
    const topic = cand.metadata.topic
    if (topic === null) continue // a null topic matches no (document, topic) pair.
    const key = pairKey(doc, topic)
    const list = byPair.get(key)
    if (list !== undefined) {
      list.push(cand.identity.questionCode)
    }
  }
  // Preserve the binding declaration order (deterministic; mirrors the plan).
  const bindings = coverageBindings.map((pair) => ({
    document: pair.document,
    topic: pair.topic,
    satisfyingCodes: byPair.get(pairKey(pair.document, pair.topic))!,
  }))
  return { bindings }
}

/** Stable key for a (document, topic) pair (mirrors E-2C's pair-key convention). */
function pairKey(document: string, topic: string): string {
  return `${document}\u{0000}${topic}`
}

/**
 * Extract the CR-1 (document, topic) bindings from the QueryPlan, in plan
 * declaration order. Reuses E-2C's exported `Cr1DocumentTopicBinding` shape —
 * the ONLY binding shape the Generator narrows `unknown` to. Other bindings are
 * skipped (they satisfy no per-Question predicate; consistent with E-2C/E-2D).
 */
function extractCr1Bindings(
  coverageRequirements: ReadonlyArray<{ ruleId: string; binding: unknown }>
): { document: string; topic: string }[] {
  const pairs: { document: string; topic: string }[] = []
  for (const req of coverageRequirements) {
    if (req.ruleId !== 'CR-1') continue
    if (!isCr1Binding(req.binding)) continue
    for (const p of req.binding.pairs) pairs.push({ document: p.document, topic: p.topic })
  }
  return pairs
}

/** Type guard mirroring E-2C/E-2D's `isCr1Binding` (not exported there). */
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

// ═══════════════════════════════════════════════════════════════════════════
// 6.6 Helpers — Statistics (§10.3 metadata block / §11; decision F4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute CandidateStatistics (§11 / §10.3) — aggregate counts over the emitted
 * Candidates + the carried-forward ShortfallReport. Pure counts; no opinions,
 * no derived scores (decision F4).
 *
 * `distinct*` counts use Sets over the metadata axis values (null counted as a
 * distinct value where the contract permits null — documents/patterns/LOs are
 * nullable axes, so a null is one of the distinct values present).
 */
function computeStatistics(
  candidates: readonly Candidate[],
  shortfallCount: number
): CandidateStatistics {
  const documents = new Set<string>()
  const difficulties = new Set<string>()
  const patterns = new Set<string>()
  const learningObjectives = new Set<string>()
  let fullConfidence = 0
  let reducedConfidence = 0
  let incompleteAxes = 0

  for (const c of candidates) {
    documents.add(c.metadata.document)
    difficulties.add(c.metadata.difficulty)
    patterns.add(String(c.metadata.questionPattern)) // null → 'null' distinct value
    learningObjectives.add(String(c.metadata.learningObjective))

    if (c.confidence.level === 'full') {
      fullConfidence++
    } else {
      reducedConfidence++
    }
    if (
      c.completeness.blueprintType === 'incomplete' ||
      c.completeness.learningObjective === 'incomplete' ||
      c.completeness.questionPattern === 'incomplete' ||
      c.completeness.section === 'incomplete'
    ) {
      incompleteAxes++
    }
  }

  return {
    totalCandidates: candidates.length,
    fullConfidenceCount: fullConfidence,
    reducedConfidenceCount: reducedConfidence,
    incompleteAxesCount: incompleteAxes,
    distinctDocuments: documents.size,
    distinctDifficulties: difficulties.size,
    distinctPatterns: patterns.size,
    distinctLearningObjectives: learningObjectives.size,
    shortfallCount,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6.7 Helpers — warnings assembly (decision F5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Collect the GeneratorWarnings to forward onto the CandidateSet (decision F5).
 *
 * Today the ONLY warning source is Pool Expansion's cap-hit advisory
 * (`expansionReport.warning`, §11.2). Validation shortfalls are NOT warnings —
 * they live in the ShortfallReport (the contract separates the two). Forwarding
 * the upstream warning when present is honest assembly; the array form makes
 * adding future warning sources additive.
 */
function collectWarnings(expansion: PoolExpansionResult): readonly GeneratorWarning[] {
  const w = expansion.expansionReport.warning
  return w === null ? [] : [w]
}

// ═══════════════════════════════════════════════════════════════════════════
// 6.8 Candidate Set Emission — the public entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assemble the final immutable CandidateSet (Stage 6, §10). PURE ASSEMBLY.
 *
 * Packages the upstream artifacts (Expanded Pool, carried-forward ShortfallReport
 * + classification-derived warning, E-2C exclusions log, runtime identity) into
 * the CandidateSet contract consumed by Ranking + Solver. Pre-computes the three
 * denormalized views (slotIndex, coverageSatisfaction, statistics) so downstream
 * stages need not re-derive them.
 *
 * NEVER changes a Candidate, never mutates the pool, never ranks/solves/expands/
 * queries, never reads the clock or content (task brief + §10.4 immutability).
 * NEVER fails — emits honestly whatever Pool Expansion handed it, with the
 * carried-forward report intact (§10.4).
 *
 * @param input.expansion     E-2E result (source of pool + shortfall + warning).
 * @param input.exclusionsLog E-2C cumulative rejection log (default []).
 * @param input.identity      Runtime-pinned CandidateSet identity.
 * @param input.meta          Optional generatorVersion override.
 */
export function emitCandidateSet(input: CandidateSetEmissionInput): CandidateSet {
  const { expansion, identity } = input
  const pool = expansion.pool
  const candidates = pool.candidates

  // ── Carried-forward artifacts (read-only; never mutated) ─────────────────
  // The ShortfallReport is Validation's verdict (E-2D, carried through E-2E).
  // Forwarded VERBATIM — Emission never re-classifies or repairs.
  const shortfallReport = expansion.shortfallReport

  // The exclusions log is E-2C's cumulative rejection log. Defaulted to [] when
  // the orchestrator did not supply it (e.g. a fixture); never invented beyond
  // what the caller provides.
  const exclusionsLog: readonly ExclusionEntry[] = input.exclusionsLog ?? []

  // ── Derived views (pure projections of the frozen Candidates + plan) ─────
  const slotIndex = buildSlotIndex(candidates)
  const coverageBindings = extractCr1Bindings(pool.queryPlan.coverageRequirements)
  const coverageSatisfaction = buildCoverageSatisfaction(candidates, coverageBindings)
  const statistics = computeStatistics(candidates, shortfallReport.entries.length)
  const warnings = collectWarnings(expansion)

  // ── Meta (specVersion constant; generatorVersion overridable) ────────────
  const meta: CandidateSetMeta = {
    specVersion: SPEC_VERSION,
    generatorVersion: input.meta?.generatorVersion ?? GENERATOR_VERSION,
  }

  // ── Assemble. The Candidates array is the SAME readonly reference as the
  //    pool's — no copy, no re-sort (preserves Discovery + Expansion order;
  //    re-sorting would impose a new order on the artifact, which is forbidden).
  return {
    identity,
    candidates,
    slotIndex,
    shortfallReport,
    coverageSatisfaction,
    warnings,
    statistics,
    exclusionsLog,
    meta,
  }
}
