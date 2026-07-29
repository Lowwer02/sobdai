/**
 * lib/engine/generator/candidate-set-emitter.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator E-2F — Candidate Set Emission tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §2.2 (Stage Contracts — row 6),
 *     §6.2 (Pipeline Relationship), §9 (Provenance carried unchanged),
 *     §10 (CandidateSet — §10.3 shape, §10.4 immutability), §12.2 (Determinism).
 *
 * RUN: npx jiti lib/engine/generator/candidate-set-emitter.test.ts
 *
 * Coverage:
 *  §10.3 Shape — every CandidateSet field populated from the right source
 *  §10.4 Immutability — Candidates/pool/shortfall forwarded VERBATIM (same refs)
 *  Pure assembly — never ranks/solves/expands/queries; no new metadata invented
 *  slotIndex — reverse of provenance.eligibleSlots; Codes (not objects);
 *     encounter-order value arrays; deterministic slot-id canonicalization
 *  coverageSatisfaction — CR-1 (document, topic) → satisfying Codes; null/non-CR-1
 *     bindings produce no entries; null-topic Candidates match no pair
 *  statistics — pure counts over the emitted Candidates + carried shortfall count
 *  warnings — Expansion's cap-hit warning forwarded; absent → empty array
 *  exclusionsLog — caller-supplied; defaulted to [] when omitted
 *  identity/meta — caller-supplied identity; specVersion constant '1.0';
 *     generatorVersion overridable; specVersion NOT overridable
 *  Determinism — same input → byte-identical output (idempotent + order-invariant
 *     on the *pool's* candidate order, which Emission must preserve)
 *  Purity — no Supabase / clock / random in source
 *  Regression — end-to-end E-2C → E-2D → E-2E → E-2F produces a valid set
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  emitCandidateSet,
  slotId,
  type CandidateSetEmissionInput,
} from './candidate-set-emitter'
import type {
  Candidate,
  CandidatePool,
  CandidateSet,
  ExclusionEntry,
  GeneratorWarning,
} from './contracts'
import type { PoolExpansionResult } from './pool-expansion'
import { validatePool, discoverCandidates, type DiscoveryContext } from './discovery'
import { expandPool } from './pool-expansion'
import { planQuery } from './query-planner'
import {
  buildAssemblyRequest,
  buildBankRow,
  buildConstraintSnapshot,
  buildCoverageRule,
  buildDocument,
  type SyntheticBankRow,
} from '../shared/testing/fixtures'
import type { Tier } from '../reader/contracts'
import { stableStringify } from '../shared/testing/determinism'

// ─── helpers ────────────────────────────────────────────────────────────────

/** A single-doc ctx where the default buildBankRow().document is in the registry. */
function singleDocCtx(): DiscoveryContext {
  return {
    plan: planQuery(
      buildAssemblyRequest({
        documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
      })
    ),
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
  }
}

/** A row that passes E-2C's filters AND carries populated IG-2 axes. */
function okRow(code: string, overrides: Partial<SyntheticBankRow> = {}): SyntheticBankRow {
  return buildBankRow({
    questionCode: code,
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    blueprintType: 'Memory',
    learningObjective: 'LO1',
    questionPattern: 'Positive',
    section: 'ม.6–8',
    topic: 'มาตรา 6',
    ...overrides,
  })
}

/** Build a CandidatePool by materializing rows through Discovery. */
function poolWith(
  ctx: DiscoveryContext,
  candidates: readonly { code: string; overrides?: Partial<SyntheticBankRow> }[]
): CandidatePool {
  const rows = candidates.map((c) => okRow(c.code, c.overrides))
  const r = discoverCandidates({ rows, ctx })
  if (!r.ok) throw new Error('fixture pool failed to materialize: ' + JSON.stringify(r))
  return r.pool
}

/** A canonical identity block for tests (caller-supplied per decision F1). */
function testIdentity() {
  return {
    assemblyRequestId: 'req-test-001',
    generatedAt: null,
    bankStateHash: null,
  }
}

/** Build an E-2E result by running the real pipeline: validate → expand (no-op
 *  on Pass, which is what we want for a clean fixture). */
function expansionFromPool(pool: CandidatePool) {
  return expandPool({
    validation: validatePool(pool),
    supplementalRows: [],
    ctx: singleDocCtx(),
  })
}

type CandidateSetEmissionFixtureInput =
  Omit<CandidateSetEmissionInput, 'constraintSnapshot'> &
  Partial<Pick<CandidateSetEmissionInput, 'constraintSnapshot'>>

/** Emit + return; convenience. */
function emit(input: CandidateSetEmissionFixtureInput): CandidateSet {
  return emitCandidateSet({
    ...input,
    constraintSnapshot: input.constraintSnapshot ?? buildConstraintSnapshot(),
  })
}

/** Stable JSON of a CandidateSet's slotIndex ENTRIES (Map → {} under plain
 *  stableStringify, so we materialize entries explicitly for determinism tests). */
function slotIndexJson(cs: CandidateSet): string {
  const entries = [...cs.slotIndex.slots.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => ({ k, v: [...v] }))
  return stableStringify(entries)
}

/** Stable JSON of a CandidateSet's coverageSatisfaction (array — stable already). */
function coverageSatisfactionJson(cs: CandidateSet): string {
  return stableStringify(cs.coverageSatisfaction.bindings)
}

// ═══════════════════════════════════════════════════════════════════════════
// §10.3 Shape — every field populated from the right source
// ═══════════════════════════════════════════════════════════════════════════

function verifies_emits_all_candidate_set_fields(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const constraintSnapshot = buildConstraintSnapshot()
  const cs = emit({
    expansion: expansionFromPool(pool),
    identity: testIdentity(),
    constraintSnapshot,
    exclusionsLog: [{ code: 'Q-X', reason: { kind: 'excluded', code: 'Q-X' } }],
  })
  // Every §10.3 field is present and well-typed.
  assert.equal(typeof cs.identity.assemblyRequestId, 'string')
  assert.ok(Array.isArray(cs.candidates))
  assert.ok(cs.slotIndex.slots instanceof Map)
  assert.ok(Array.isArray(cs.shortfallReport.entries))
  assert.ok(Array.isArray(cs.coverageSatisfaction.bindings))
  assert.equal(cs.constraintSnapshot, constraintSnapshot)
  assert.ok(Array.isArray(cs.warnings))
  assert.ok(typeof cs.statistics.totalCandidates, 'number')
  assert.ok(Array.isArray(cs.exclusionsLog))
  assert.equal(cs.meta.specVersion, '1.0')
  assert.equal(typeof cs.meta.generatorVersion, 'string')
}

function verifies_candidates_are_the_pool_candidates_verbatim(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [
    { code: 'Q-000001' },
    { code: 'Q-000002', overrides: { difficulty: 'Hard' } },
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  // SAME reference — Emission does not copy or re-sort.
  assert.equal(cs.candidates, pool.candidates)
  assert.equal(cs.candidates.length, 2)
  assert.equal(cs.candidates[0]!.identity.questionCode, 'Q-000001')
  assert.equal(cs.candidates[1]!.identity.questionCode, 'Q-000002')
}

function verifies_shortfall_report_carried_forward_verbatim(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const expansion = expansionFromPool(pool)
  const cs = emit({ expansion, identity: testIdentity() })
  // SAME reference — Emission forwards the ShortfallReport untouched.
  assert.equal(cs.shortfallReport, expansion.shortfallReport)
}

function verifies_empty_pool_emits_honestly(): void {
  // §10.4: emission never fails. An empty pool (Blocking classification) still
  // produces a CandidateSet — halting is the orchestrator's call, not Emission's.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.candidates.length, 0)
  assert.equal(cs.statistics.totalCandidates, 0)
  assert.equal(cs.slotIndex.slots.size, 0)
  assert.equal(cs.coverageSatisfaction.bindings.length, 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// §10.4 Immutability — Candidates/pool/shortfall forwarded as same references
// ═══════════════════════════════════════════════════════════════════════════

function verifies_does_not_mutate_input_pool(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const before = stableStringify(pool)
  const beforeCandidates = stableStringify(pool.candidates)
  emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(stableStringify(pool), before, 'pool object unchanged')
  assert.equal(stableStringify(pool.candidates), beforeCandidates, 'candidates unchanged')
}

function verifies_does_not_mutate_input_shortfall_report(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const expansion = expansionFromPool(pool)
  const before = stableStringify(expansion.shortfallReport)
  emit({ expansion, identity: testIdentity() })
  assert.equal(stableStringify(expansion.shortfallReport), before)
}

function verifies_does_not_mutate_input_exclusions_log(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const exclusionsLog: ExclusionEntry[] = [
    { code: 'Q-X', reason: { kind: 'excluded', code: 'Q-X' } },
  ]
  const before = stableStringify(exclusionsLog)
  emit({
    expansion: expansionFromPool(pool),
    identity: testIdentity(),
    exclusionsLog,
  })
  assert.equal(stableStringify(exclusionsLog), before)
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure assembly — never invents metadata
// ═══════════════════════════════════════════════════════════════════════════

function verifies_candidate_facets_emitted_unchanged(): void {
  // A reduced-Confidence Candidate (missing IG-2 axis) is FLAGGED, not repaired.
  // Emission must forward the gap verbatim (§5.6 Maximum Recall).
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { questionPattern: null } }, // incomplete pattern
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  const cand = cs.candidates[0]! as Candidate
  assert.equal(cand.confidence.level, 'reduced', 'gap preserved, not repaired')
  assert.equal(cand.completeness.questionPattern, 'incomplete')
  assert.equal(cand.metadata.questionPattern, null)
}

// ═══════════════════════════════════════════════════════════════════════════
// slotIndex — reverse of provenance.eligibleSlots (decision F3)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_slot_index_maps_slot_id_to_codes(): void {
  const ctx = singleDocCtx()
  // Easy + LO1 + Positive → eligible for difficulty/pattern/LO slots per Set.
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.ok(cs.slotIndex.slots.size > 0, 'at least one slot indexed')
  // Every indexed value is a Code array referencing an emitted Candidate.
  const codes = new Set(cs.candidates.map((c) => c.identity.questionCode))
  for (const [id, codeList] of cs.slotIndex.slots) {
    assert.ok(typeof id === 'string' && id.length > 0)
    assert.ok(codeList.length > 0)
    for (const code of codeList) assert.ok(codes.has(code), `code ${code} is a real Candidate`)
  }
}

function verifies_slot_index_uses_codes_not_objects(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  for (const codeList of cs.slotIndex.slots.values()) {
    for (const v of codeList) assert.equal(typeof v, 'string', 'values are Code strings')
  }
}

function verifies_slot_id_canonicalization_is_axis_ordered(): void {
  // Decision F2: present axes in fixed order, value-safe delimiter.
  const id1 = slotId({ setNumber: 1, difficulty: 'Easy' })
  const id2 = slotId({ difficulty: 'Easy', setNumber: 1 }) // same axes, diff construction
  assert.equal(id1, id2, 'construction order does not affect slot-id')
  // set appears before difficulty in the canonical order.
  assert.ok(id1.indexOf('setNumber=1') < id1.indexOf('difficulty=Easy'))
  // Absent axes contribute nothing.
  const id3 = slotId({ setNumber: 2, pattern: 'Positive' })
  assert.ok(!id3.includes('difficulty='), 'absent difficulty axis omitted')
}

function verifies_slot_index_value_arrays_in_encounter_order(): void {
  // Two Candidates eligible for the same slot → Codes appended in pool order,
  // NOT re-sorted (re-sorting would impose a new order on the artifact).
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [
    { code: 'Q-000002', overrides: { difficulty: 'Easy' } },
    { code: 'Q-000001', overrides: { difficulty: 'Easy' } },
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  // Find the slot both are eligible for (Set-1 Easy difficulty slot).
  const easyKey = slotId({ setNumber: 1, difficulty: 'Easy' })
  const codes = cs.slotIndex.slots.get(easyKey)
  assert.ok(codes !== undefined, 'Easy slot indexed')
  assert.deepEqual([...codes!], ['Q-000002', 'Q-000001'], 'pool order preserved, not sorted')
}

function verifies_slot_index_empty_when_no_eligible_slots(): void {
  // A Candidate whose axes match no slot → empty index. (Hard to force via the
  // real pipeline — Discovery always emits ≥ difficulty slots — so this is the
  // empty-pool degenerate case.)
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.slotIndex.slots.size, 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// coverageSatisfaction — CR-1 (document, topic) → satisfying Codes
// ═══════════════════════════════════════════════════════════════════════════

function ctxWithCr1Binding(pairs: { document: string; topic: string }[]): DiscoveryContext {
  const docs = [...new Set(pairs.map((p) => p.document))].map((id) =>
    buildDocument({ id, tier: 1 as Tier })
  )
  // Ensure every test doc appears in the registry even if no pair references it.
  docs.push(buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 }))
  const req = buildAssemblyRequest({
    documentRegistry: docs,
    coverageRules: [
      buildCoverageRule({
        id: 'CR-1',
        level: 'hard',
        binding: { kind: 'document_topic_pairs', pairs },
      }),
    ],
  })
  return { plan: planQuery(req), documentRegistry: req.documentRegistry }
}

function verifies_coverage_satisfaction_populates_matching_pairs(): void {
  const ctx = ctxWithCr1Binding([{ document: 'DOC-A', topic: 'มาตรา 6' }])
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { document: 'DOC-A', topic: 'มาตรา 6' } },
    { code: 'Q-000002', overrides: { document: 'DOC-A', topic: 'มาตรา 6' } },
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.coverageSatisfaction.bindings.length, 1)
  const b = cs.coverageSatisfaction.bindings[0]!
  assert.equal(b.document, 'DOC-A')
  assert.equal(b.topic, 'มาตรา 6')
  assert.deepEqual([...b.satisfyingCodes], ['Q-000001', 'Q-000002'])
}

function verifies_coverage_satisfaction_empty_for_unmatched_pair(): void {
  // A bound pair no Candidate matches → binding present with empty satisfyingCodes
  // (honest: the requirement is declared but unmet; the ShortfallReport carries
  // the Blocking verdict — coverageSatisfaction just records the Codes that DO
  // satisfy, which is none).
  const ctx = ctxWithCr1Binding([{ document: 'DOC-A', topic: 'มาตรา 6' }])
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { document: 'DOC-A', topic: 'มาตรา 99' } },
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.coverageSatisfaction.bindings.length, 1)
  assert.equal(cs.coverageSatisfaction.bindings[0]!.satisfyingCodes.length, 0)
}

function verifies_coverage_satisfaction_empty_when_no_cr1_binding(): void {
  // Default fixture: CR-1 with null binding → no per-Question predicate →
  // coverageSatisfaction has no entries (consistent with E-2C/E-2D treatment).
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.coverageSatisfaction.bindings.length, 0)
}

function verifies_coverage_satisfaction_skips_null_topic_candidates(): void {
  const ctx = ctxWithCr1Binding([{ document: 'DOC-A', topic: 'มาตรา 6' }])
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { document: 'DOC-A', topic: null } },
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  // null topic matches no (document, topic) pair.
  assert.equal(cs.coverageSatisfaction.bindings[0]!.satisfyingCodes.length, 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// statistics — pure counts (decision F4)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_statistics_counts_match_candidates(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { difficulty: 'Easy', questionPattern: 'Positive', learningObjective: 'LO1' } },
    { code: 'Q-000002', overrides: { difficulty: 'Hard', questionPattern: 'Negative', learningObjective: 'LO2' } },
    { code: 'Q-000003', overrides: { difficulty: 'Easy', questionPattern: null, learningObjective: null } }, // reduced + incomplete
  ])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.statistics.totalCandidates, 3)
  assert.equal(cs.statistics.fullConfidenceCount, 2)
  assert.equal(cs.statistics.reducedConfidenceCount, 1)
  assert.equal(cs.statistics.incompleteAxesCount, 1)
  assert.equal(cs.statistics.distinctDocuments, 1) // all DOC LAW-ACT-HED-2562
  assert.equal(cs.statistics.distinctDifficulties, 2) // Easy, Hard
}

function verifies_statistics_shortfall_count_carried_from_report(): void {
  // A pool with a real shortfall (LO target unmet → Blocking) must reflect the
  // entry count in statistics.shortfallCount — Emission does NOT re-detect.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    loDistribution: {
      targets: { LO1: 5, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: { LO1: ['Memory'], LO2: ['Concept'], LO3: ['Procedure'], LO4: ['Scenario'] },
    },
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = poolWith(ctx, [{ code: 'Q-000001', overrides: { learningObjective: 'LO1' } }])
  const expansion = expandPool({ validation: validatePool(pool), supplementalRows: [], ctx })
  // Sanity: Validation classified Blocking (LO1 target 5, have 1).
  assert.equal(expansion.classification, 'Blocking')
  const cs = emit({ expansion, identity: testIdentity() })
  assert.ok(cs.statistics.shortfallCount >= 1, 'shortfall count carried from report')
  assert.equal(cs.statistics.shortfallCount, expansion.shortfallReport.entries.length)
}

function verifies_statistics_empty_pool_all_zero(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  const s = cs.statistics
  assert.equal(s.totalCandidates, 0)
  assert.equal(s.fullConfidenceCount, 0)
  assert.equal(s.reducedConfidenceCount, 0)
  assert.equal(s.incompleteAxesCount, 0)
  assert.equal(s.distinctDocuments, 0)
  assert.equal(s.distinctDifficulties, 0)
  assert.equal(s.distinctPatterns, 0)
  assert.equal(s.distinctLearningObjectives, 0)
  assert.equal(s.shortfallCount, cs.shortfallReport.entries.length)
}

// ═══════════════════════════════════════════════════════════════════════════
// warnings — Expansion's cap-hit warning forwarded (decision F5)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_warnings_empty_when_no_expansion_warning(): void {
  // No-op expansion (Pass classification) → no warning → empty array.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.warnings.length, 0)
}

function verifies_warnings_forward_expansion_cap_hit(): void {
  // E-2F's contract is to FORWARD whatever GeneratorWarning Pool Expansion
  // produced (decision F5). E-2E's cap-detection logic is tested in its own
  // suite; here we isolate E-2F's forwarding by constructing a
  // PoolExpansionResult whose expansionReport.warning is set, then asserting
  // Emission surfaces it verbatim on the CandidateSet.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const validation = validatePool(pool)
  const warning: GeneratorWarning = {
    severity: 'Warning',
    axis: 'coverage',
    explanation: 'Pool Expansion hit the total cap.',
    recommendation: 'Raise the cap or add more Bank Questions.',
  }
  // Assemble a synthetic expansion result carrying the warning. The pool +
  // shortfallReport + classification come from the real Validation; only the
  // expansionReport is synthesized to exercise the warning-forwarding path.
  const expansion: PoolExpansionResult = {
    pool: validation.pool,
    shortfallReport: validation.shortfallReport,
    classification: validation.classification,
    expansionReport: {
      outcome: { kind: 'expanded', candidatesAdded: 0 },
      phasesRun: ['gate', 'search_window', 'filter_pipeline', 'materialize', 'carry_forward'],
      rowsConsidered: 1,
      rowsEligible: 1,
      candidatesAdded: 0,
      candidatesSkippedDuplicate: 0,
      candidatesSkippedCap: 1,
      totalCapHit: true,
      bucketCapHit: false,
      bankExhausted: false,
      warning,
    },
  }
  const cs = emit({ expansion, identity: testIdentity() })
  assert.equal(cs.warnings.length, 1)
  assert.equal(cs.warnings[0], warning, 'SAME reference forwarded verbatim')
  assert.equal(cs.warnings[0]!.severity, 'Warning')
}

// ═══════════════════════════════════════════════════════════════════════════
// exclusionsLog — caller-supplied; defaulted to []
// ═══════════════════════════════════════════════════════════════════════════

function verifies_exclusions_log_forwarded_verbatim(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const exclusionsLog: readonly ExclusionEntry[] = [
    { code: 'Q-DRAFT', reason: { kind: 'status', code: 'Q-DRAFT', status: 'Draft' } },
    { code: 'Q-FOREIGN', reason: { kind: 'document', code: 'Q-FOREIGN', document: 'OTHER' } },
  ]
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity(), exclusionsLog })
  assert.equal(cs.exclusionsLog, exclusionsLog, 'SAME reference forwarded')
  assert.equal(cs.exclusionsLog.length, 2)
}

function verifies_exclusions_log_defaults_to_empty(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.deepEqual([...cs.exclusionsLog], [])
}

// ═══════════════════════════════════════════════════════════════════════════
// identity + meta (decisions F1, F6)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_identity_forwarded_verbatim(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const identity = {
    assemblyRequestId: 'req-abc',
    generatedAt: '2026-07-27T00:00:00Z',
    bankStateHash: 'sha256:deadbeef',
  }
  const cs = emit({ expansion: expansionFromPool(pool), identity })
  assert.equal(cs.identity.assemblyRequestId, 'req-abc')
  assert.equal(cs.identity.generatedAt, '2026-07-27T00:00:00Z')
  assert.equal(cs.identity.bankStateHash, 'sha256:deadbeef')
}

function verifies_identity_nullable_fields_accept_null(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({
    expansion: expansionFromPool(pool),
    identity: { assemblyRequestId: 'r', generatedAt: null, bankStateHash: null },
  })
  assert.equal(cs.identity.generatedAt, null)
  assert.equal(cs.identity.bankStateHash, null)
}

function verifies_meta_spec_version_is_constant(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const cs = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.equal(cs.meta.specVersion, '1.0')
}

function verifies_meta_generator_version_default_and_override(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  // Default: module constant.
  const cs1 = emit({ expansion: expansionFromPool(pool), identity: testIdentity() })
  assert.ok(cs1.meta.generatorVersion.length > 0, 'default generatorVersion present')
  // Override.
  const cs2 = emit({
    expansion: expansionFromPool(pool),
    identity: testIdentity(),
    meta: { generatorVersion: '9.9.9-staging' },
  })
  assert.equal(cs2.meta.generatorVersion, '9.9.9-staging')
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism — same input → byte-identical output (§12.2)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_deterministic_same_input_same_output(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [
    { code: 'Q-000001' },
    { code: 'Q-000002', overrides: { difficulty: 'Hard' } },
  ])
  const input: CandidateSetEmissionFixtureInput = {
    expansion: expansionFromPool(pool),
    identity: testIdentity(),
    exclusionsLog: [{ code: 'Q-X', reason: { kind: 'excluded', code: 'Q-X' } }],
  }
  const a = emit(input)
  const b = emit(input)
  // Core fields byte-identical.
  assert.equal(stableStringify(a.candidates), stableStringify(b.candidates))
  assert.equal(slotIndexJson(a), slotIndexJson(b))
  assert.equal(coverageSatisfactionJson(a), coverageSatisfactionJson(b))
  assert.equal(stableStringify(a.statistics), stableStringify(b.statistics))
  assert.equal(stableStringify(a.shortfallReport), stableStringify(b.shortfallReport))
  assert.equal(stableStringify(a.warnings), stableStringify(b.warnings))
  assert.equal(stableStringify(a.exclusionsLog), stableStringify(b.exclusionsLog))
  assert.equal(stableStringify(a.identity), stableStringify(b.identity))
  assert.equal(stableStringify(a.meta), stableStringify(b.meta))
}

function verifies_idempotent(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const input: CandidateSetEmissionFixtureInput = {
    expansion: expansionFromPool(pool),
    identity: testIdentity(),
  }
  const first = emit(input)
  for (let i = 0; i < 3; i++) {
    const again = emit(input)
    assert.equal(stableStringify(again), stableStringify(first))
  }
}

function verifies_order_invariant_on_candidate_pool_order(): void {
  // Emission must preserve the pool's candidate order EXACTLY — it must NOT
  // re-sort or otherwise reorder. Build two pools with the SAME Candidates in
  // DIFFERENT orders; each emits its own order deterministically (the slot-index
  // value arrays follow encounter order, so they differ between the two — but
  // each is internally deterministic + the candidates array preserves order).
  const ctx = singleDocCtx()
  const poolA = poolWith(ctx, [
    { code: 'Q-000001', overrides: { difficulty: 'Easy' } },
    { code: 'Q-000002', overrides: { difficulty: 'Easy' } },
  ])
  const poolB = poolWith(ctx, [
    { code: 'Q-000002', overrides: { difficulty: 'Easy' } },
    { code: 'Q-000001', overrides: { difficulty: 'Easy' } },
  ])
  const csA = emit({ expansion: expansionFromPool(poolA), identity: testIdentity() })
  const csB = emit({ expansion: expansionFromPool(poolB), identity: testIdentity() })
  // Candidates preserved in pool order (Emission does not reorder).
  assert.deepEqual(
    csA.candidates.map((c) => c.identity.questionCode),
    ['Q-000001', 'Q-000002']
  )
  assert.deepEqual(
    csB.candidates.map((c) => c.identity.questionCode),
    ['Q-000002', 'Q-000001']
  )
  // The shared-Easy-slot value array follows encounter order in each.
  const easyKey = slotId({ setNumber: 1, difficulty: 'Easy' })
  assert.deepEqual([...csA.slotIndex.slots.get(easyKey)!], ['Q-000001', 'Q-000002'])
  assert.deepEqual([...csB.slotIndex.slots.get(easyKey)!], ['Q-000002', 'Q-000001'])
}

// ═══════════════════════════════════════════════════════════════════════════
// Purity — no Supabase / clock / random in source
// ═══════════════════════════════════════════════════════════════════════════

function verifies_emitter_source_is_pure(): void {
  const src = readFileSync(__dirname + '/candidate-set-emitter.ts', 'utf8')
  const codeOnly = stripComments(src)
  assert.ok(
    !/\bfrom\s+['"][^'"]*@supabase/.test(codeOnly),
    'candidate-set-emitter.ts must not import from any @supabase/* package'
  )
  assert.ok(!/\bcreateClient\s*\(/.test(codeOnly), 'no createClient')
  assert.ok(!/\.rpc\s*\(/.test(codeOnly), 'no Supabase RPC')
  assert.ok(
    !/\b(Date\.now|process\.hrtime|performance\.now)\s*\(/.test(codeOnly),
    'no wall clock'
  )
  assert.ok(!/\bMath\.random\s*\(/.test(codeOnly), 'no Math.random')
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\/])\/\/[^\n]*/g, '$1')
}

// ═══════════════════════════════════════════════════════════════════════════
// Regression — end-to-end E-2C → E-2D → E-2E → E-2F
// ═══════════════════════════════════════════════════════════════════════════

function verifies_end_to_end_produces_valid_candidate_set(): void {
  // Drive the real pipeline all the way to a CandidateSet.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    coverageRules: [
      buildCoverageRule({
        id: 'CR-1',
        level: 'hard',
        binding: {
          kind: 'document_topic_pairs',
          pairs: [{ document: 'LAW-ACT-HED-2562', topic: 'มาตรา 6' }],
        },
      }),
    ],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const rows = [
    okRow('Q-000001', { topic: 'มาตรา 6' }),
    okRow('Q-000002', { topic: 'มาตรา 6', difficulty: 'Hard' }),
  ]
  const discovery = discoverCandidates({ rows, ctx })
  if (!discovery.ok) throw new Error('discovery failed')
  const validation = validatePool(discovery.pool)
  const expansion = expandPool({ validation, supplementalRows: [], ctx })
  const cs = emit({
    expansion,
    identity: { assemblyRequestId: 'req-e2e', generatedAt: null, bankStateHash: null },
    exclusionsLog: [],
  })
  // End-to-end invariants.
  assert.equal(cs.candidates.length, 2)
  assert.equal(cs.identity.assemblyRequestId, 'req-e2e')
  assert.equal(cs.meta.specVersion, '1.0')
  assert.equal(cs.statistics.totalCandidates, 2)
  assert.equal(cs.statistics.distinctDifficulties, 2) // Easy + Hard
  assert.ok(cs.slotIndex.slots.size > 0)
  assert.equal(cs.coverageSatisfaction.bindings.length, 1)
  assert.deepEqual(
    [...cs.coverageSatisfaction.bindings[0]!.satisfyingCodes].sort(),
    ['Q-000001', 'Q-000002']
  )
  assert.equal(cs.shortfallReport, expansion.shortfallReport, 'shortfall carried forward')
}

function verifies_end_to_end_carries_real_shortfall_report(): void {
  // A Blocking pool (LO target unmet) carries the shortfall into the set.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    loDistribution: {
      targets: { LO1: 5, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: { LO1: ['Memory'], LO2: ['Concept'], LO3: ['Procedure'], LO4: ['Scenario'] },
    },
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = poolWith(ctx, [{ code: 'Q-000001', overrides: { learningObjective: 'LO1' } }])
  const expansion = expandPool({ validation: validatePool(pool), supplementalRows: [], ctx })
  const cs = emit({ expansion, identity: testIdentity() })
  assert.equal(cs.shortfallReport, expansion.shortfallReport)
  assert.ok(cs.shortfallReport.entries.length >= 1)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  // §10.3 Shape
  { name: '§10.3: emits all CandidateSet fields', fn: verifies_emits_all_candidate_set_fields },
  { name: '§10.3: candidates are the pool candidates verbatim (same ref)', fn: verifies_candidates_are_the_pool_candidates_verbatim },
  { name: '§10.3: shortfall report carried forward verbatim (same ref)', fn: verifies_shortfall_report_carried_forward_verbatim },
  { name: '§10.4: empty pool emits honestly (never fails)', fn: verifies_empty_pool_emits_honestly },
  // §10.4 Immutability
  { name: 'Immutability: input pool not mutated', fn: verifies_does_not_mutate_input_pool },
  { name: 'Immutability: input shortfall report not mutated', fn: verifies_does_not_mutate_input_shortfall_report },
  { name: 'Immutability: input exclusions log not mutated', fn: verifies_does_not_mutate_input_exclusions_log },
  // Pure assembly
  { name: 'Assembly: reduced-Confidence Candidate gap preserved (not repaired)', fn: verifies_candidate_facets_emitted_unchanged },
  // slotIndex
  { name: 'slotIndex: maps slot-id to Codes', fn: verifies_slot_index_maps_slot_id_to_codes },
  { name: 'slotIndex: values are Codes, not objects (§10.3)', fn: verifies_slot_index_uses_codes_not_objects },
  { name: 'slotIndex: slot-id canonicalization is axis-ordered (F2)', fn: verifies_slot_id_canonicalization_is_axis_ordered },
  { name: 'slotIndex: value arrays in encounter order (no re-sort)', fn: verifies_slot_index_value_arrays_in_encounter_order },
  { name: 'slotIndex: empty when no eligible slots', fn: verifies_slot_index_empty_when_no_eligible_slots },
  // coverageSatisfaction
  { name: 'coverageSatisfaction: populates matching CR-1 pairs', fn: verifies_coverage_satisfaction_populates_matching_pairs },
  { name: 'coverageSatisfaction: empty satisfyingCodes for unmatched pair', fn: verifies_coverage_satisfaction_empty_for_unmatched_pair },
  { name: 'coverageSatisfaction: empty when no CR-1 binding', fn: verifies_coverage_satisfaction_empty_when_no_cr1_binding },
  { name: 'coverageSatisfaction: null-topic Candidates match no pair', fn: verifies_coverage_satisfaction_skips_null_topic_candidates },
  // statistics
  { name: 'statistics: counts match candidates', fn: verifies_statistics_counts_match_candidates },
  { name: 'statistics: shortfallCount carried from report', fn: verifies_statistics_shortfall_count_carried_from_report },
  { name: 'statistics: empty pool → all zero', fn: verifies_statistics_empty_pool_all_zero },
  // warnings
  { name: 'warnings: empty when no expansion warning', fn: verifies_warnings_empty_when_no_expansion_warning },
  { name: 'warnings: forward Expansion cap-hit warning (same ref)', fn: verifies_warnings_forward_expansion_cap_hit },
  // exclusionsLog
  { name: 'exclusionsLog: forwarded verbatim (same ref)', fn: verifies_exclusions_log_forwarded_verbatim },
  { name: 'exclusionsLog: defaults to []', fn: verifies_exclusions_log_defaults_to_empty },
  // identity + meta
  { name: 'identity: forwarded verbatim', fn: verifies_identity_forwarded_verbatim },
  { name: 'identity: nullable fields accept null', fn: verifies_identity_nullable_fields_accept_null },
  { name: "meta: specVersion is constant '1.0'", fn: verifies_meta_spec_version_is_constant },
  { name: 'meta: generatorVersion default + override', fn: verifies_meta_generator_version_default_and_override },
  // Determinism
  { name: 'Determinism: same input → same output', fn: verifies_deterministic_same_input_same_output },
  { name: 'Determinism: idempotent', fn: verifies_idempotent },
  { name: 'Determinism: preserves pool candidate order (no re-sort)', fn: verifies_order_invariant_on_candidate_pool_order },
  // Purity
  { name: 'Purity: candidate-set-emitter.ts has no supabase/clock/random', fn: verifies_emitter_source_is_pure },
  // Regression
  { name: 'Regression: end-to-end E-2C → E-2D → E-2E → E-2F valid set', fn: verifies_end_to_end_produces_valid_candidate_set },
  { name: 'Regression: end-to-end carries real shortfall report', fn: verifies_end_to_end_carries_real_shortfall_report },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
