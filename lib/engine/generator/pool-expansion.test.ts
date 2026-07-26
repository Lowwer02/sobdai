/**
 * lib/engine/generator/pool-expansion.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator E-2E — Pool Expansion tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §2.2 (Stage Contracts),
 *     §2.3 (Invariant #1 — monotonic growth), §6.2 (Pipeline Relationship),
 *     §8 (Pool Expansion), §11.2 (Expansion Limit Hit → Warning),
 *     §11.4 (No Silent Weakening), §12.4 (Maximum Recall).
 *
 * RUN: npx jiti lib/engine/generator/pool-expansion.test.ts
 *
 * Coverage:
 *  §8.1 Gate — runs only on Warning (Pass/Blocking/Fatal → no-op)
 *  §8.3 Non-Negotiable Rule — supplemental rows re-pass the FULL filter
 *     pipeline; no axis is weakened; exclusions respected; status respected;
 *     out-of-enum difficulty rejected; non-permitted document rejected
 *  §8.4 Caps — per-bucket (LO) cap; total cap; bank exhaustion; explicit
 *     maxPoolSize override; headroomFactor override; headroomFactor < 1 rejected
 *  §2.3 Invariant #1 — only ADDS; never removes a survivor; dedup by Code
 *  §6.2 + decision E1 — ShortfallReport + classification CARRIED FORWARD
 *     unchanged (Validation remains source of truth)
 *  §11.2 / §11.4 — cap hits become GeneratorWarning; never fails
 *  Determinism — same input → same output (idempotent + order-invariant)
 *  Immutability — input validation pool not mutated
 *  Purity — no Supabase / clock / random in source
 *  Regression — end-to-end E-2C → E-2D → E-2E; reduced-headroom Warning is
 *     actually relieved by supplemental rows
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  expandPool,
  type PoolExpansionInput,
  type PoolExpansionResult,
} from './pool-expansion'
import type { CandidatePool, ShortfallReport } from './contracts'
import { validatePool, type DiscoveryContext } from './discovery'
import { planQuery } from './query-planner'
import {
  buildAssemblyRequest,
  buildBankRow,
  buildCoverageRule,
  buildDocument,
  type SyntheticBankRow,
} from '../shared/testing/fixtures'
import type { Tier } from '../reader/contracts'
import { stableStringify } from '../shared/testing/determinism'
import { CollectorSink } from '../shared/observability'

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

/** Build a ctx whose plan's LO targets are explicitly set (others 0). */
function ctxWithLoTargets(
  targets: Partial<Record<'LO1' | 'LO2' | 'LO3' | 'LO4', number>>,
  docs: { id: string; tier: Tier }[] = [{ id: 'LAW-ACT-HED-2562', tier: 1 }]
): DiscoveryContext {
  const req = buildAssemblyRequest({
    documentRegistry: docs.map((d) => buildDocument({ id: d.id, tier: d.tier })),
    loDistribution: {
      targets: { LO1: 0, LO2: 0, LO3: 0, LO4: 0, ...targets } as never,
      typeMap: {
        LO1: ['Memory'],
        LO2: ['Concept'],
        LO3: ['Procedure'],
        LO4: ['Scenario'],
      },
    },
  })
  return { plan: planQuery(req), documentRegistry: req.documentRegistry }
}

/** A row that passes E-2C's filters AND carries populated IG-2 axes. */
function okRow(code: string, overrides: Partial<SyntheticBankRow> = {}): SyntheticBankRow {
  return buildBankRow({
    questionCode: code,
    status: 'Published',
    document: 'LAW-ACT-HED-2562',
    difficulty: 'Easy',
    questionPattern: 'Positive',
    learningObjective: 'LO1',
    topic: 'มาตรา 6',
    ...overrides,
  })
}

/** Build a CandidatePool by materializing rows through Discovery (so facets
 *  stay valid). The ctx's documentRegistry is required for Tier derivation
 *  (Discovery D3 invariant). */
function poolWith(
  ctx: DiscoveryContext,
  candidates: readonly { code: string; overrides?: Partial<SyntheticBankRow> }[]
): CandidatePool {
  const { discoverCandidates } = require('./discovery')
  const rows = candidates.map((c) => okRow(c.code, c.overrides))
  const r = discoverCandidates({ rows, ctx })
  if (!r.ok) throw new Error('fixture pool failed to materialize: ' + JSON.stringify(r))
  return r.pool
}

/** Build an E-2D PoolValidationResult with a chosen classification, for gate
 *  tests. The pool is real (materialized); the shortfallReport is whatever
 *  validatePool produces, but classification is FORCED to exercise the gate. */
function validationWith(
  pool: CandidatePool,
  classification: 'Pass' | 'Warning' | 'Blocking' | 'Fatal',
  shortfallReport?: ShortfallReport
): { pool: CandidatePool; shortfallReport: ShortfallReport; classification: typeof classification } {
  const report: ShortfallReport = shortfallReport ?? { entries: [] }
  return { pool, shortfallReport: report, classification }
}

/** Run expandPool and assert the outcome; return the result. */
function expandOk(input: PoolExpansionInput): PoolExpansionResult {
  return expandPool(input)
}

// ═══════════════════════════════════════════════════════════════════════════
// §8.1 Gate — expansion runs ONLY for Warning classification
// ═══════════════════════════════════════════════════════════════════════════

function verifies_gate_pass_is_noop(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Pass'),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  if (r.expansionReport.outcome.kind === 'no_op') {
    assert.equal(r.expansionReport.outcome.reason, 'classification_not_warning')
  }
  assert.equal(r.pool, pool, 'pool reference unchanged on no-op')
  assert.equal(r.pool.candidates.length, 1)
}

function verifies_gate_blocking_is_noop(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Blocking'),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  if (r.expansionReport.outcome.kind === 'no_op') {
    assert.equal(r.expansionReport.outcome.reason, 'classification_not_warning')
  }
}

function verifies_gate_fatal_is_noop(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Fatal'),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  assert.equal(r.pool.candidates.length, 1)
}

function verifies_gate_empty_supplemental_is_noop(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  if (r.expansionReport.outcome.kind === 'no_op') {
    assert.equal(r.expansionReport.outcome.reason, 'no_supplemental_rows')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §8.3 Non-Negotiable Rule — supplemental rows re-pass the FULL filter pipeline
// ═══════════════════════════════════════════════════════════════════════════

function verifies_supplemental_excluded_code_is_not_admitted(): void {
  // A supplemental row whose Code is in plan.exclusions must NOT be admitted.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    exclusions: ['Q-BANNED'],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-BANNED'), okRow('Q-000099')],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'expanded')
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 1, 'only the non-excluded row admitted')
  const codes = r.pool.candidates.map((c) => c.identity.questionCode)
  assert.ok(!codes.includes('Q-BANNED'), 'excluded Code must NOT appear in expanded pool')
  assert.ok(codes.includes('Q-000099'))
}

function verifies_supplemental_draft_status_is_not_admitted(): void {
  // Only Published Questions may appear; a Draft supplemental row is filtered out.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [
      okRow('Q-DRAFT', { status: 'Draft' }),
      okRow('Q-000099'),
    ],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 1)
  const codes = r.pool.candidates.map((c) => c.identity.questionCode)
  assert.ok(!codes.includes('Q-DRAFT'))
}

function verifies_supplemental_out_of_enum_difficulty_is_rejected(): void {
  // An out-of-enum difficulty must be rejected by the re-applied Difficulty Filter.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [
      okRow('Q-BAD-DIFF', { difficulty: 'Impossible' as SyntheticBankRow['difficulty'] }),
      okRow('Q-000099'),
    ],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 1)
  const codes = r.pool.candidates.map((c) => c.identity.questionCode)
  assert.ok(!codes.includes('Q-BAD-DIFF'))
}

function verifies_supplemental_non_permitted_document_is_rejected(): void {
  // A supplemental row whose document is NOT in the registry is rejected by the
  // re-applied Document Filter (closed-set semantics — §8.3).
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [
      okRow('Q-FOREIGN', { document: 'DOC-NOT-IN-REGISTRY' }),
      okRow('Q-000099'),
    ],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 1)
  const codes = r.pool.candidates.map((c) => c.identity.questionCode)
  assert.ok(!codes.includes('Q-FOREIGN'))
}

function verifies_supplemental_all_filtered_out_is_noop(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-DRAFT', { status: 'Draft' })], // all filtered out
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  if (r.expansionReport.outcome.kind === 'no_op') {
    assert.equal(r.expansionReport.outcome.reason, 'no_eligible_supplemental_rows')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §2.3 Invariant #1 — monotonic growth; only ADDS; dedup by Code
// ═══════════════════════════════════════════════════════════════════════════

function verifies_only_adds_never_removes_survivors(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [
    { code: 'Q-000001' },
    { code: 'Q-000002' },
    { code: 'Q-000003' },
  ])
  const originalCodes = new Set(pool.candidates.map((c) => c.identity.questionCode))
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099'), okRow('Q-000100')],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  // Every original Code is still present.
  for (const code of originalCodes) {
    assert.ok(
      r.pool.candidates.some((c) => c.identity.questionCode === code),
      `original Code ${code} must survive expansion (§2.3 Invariant #1)`
    )
  }
  assert.equal(r.pool.candidates.length, 5)
}

function verifies_dedup_by_code(): void {
  // A supplemental row whose Code is ALREADY in the pool is not duplicated.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000001'), okRow('Q-000099')], // Q-000001 already present
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesSkippedDuplicate, 1)
  assert.equal(r.expansionReport.candidatesAdded, 1)
  // Only one Q-000001 in the result.
  const q1 = r.pool.candidates.filter((c) => c.identity.questionCode === 'Q-000001')
  assert.equal(q1.length, 1)
}

function verifies_all_supplemental_already_present_is_noop(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000001')], // already present
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  if (r.expansionReport.outcome.kind === 'no_op') {
    assert.equal(r.expansionReport.outcome.reason, 'all_supplemental_already_present')
  }
  assert.equal(r.pool, pool)
}

// ═══════════════════════════════════════════════════════════════════════════
// §6.2 + decision E1 — ShortfallReport + classification CARRIED FORWARD
// ═══════════════════════════════════════════════════════════════════════════

function verifies_shortfall_report_carried_forward_unchanged(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  // Construct an arbitrary non-empty shortfall report (Validation owns it).
  const shortfallReport: ShortfallReport = {
    entries: [
      {
        axis: 'coverage',
        severity: 'Warning',
        setNumber: null,
        explanation: 'sentinel — must be preserved verbatim',
        recommendation: 'do not change me',
      },
    ],
  }
  const r = expandOk({
    validation: validationWith(pool, 'Warning', shortfallReport),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  })
  // The shortfallReport must be byte-identical to the input (decision E1).
  assert.equal(stableStringify(r.shortfallReport), stableStringify(shortfallReport))
  // Even after expansion added a Candidate.
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.ok(r.expansionReport.candidatesAdded > 0)
}

function verifies_classification_carried_forward(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  })
  // Classification is NOT recomputed — it stays 'Warning' even though the pool
  // grew (decision E1: Validation remains source of truth).
  assert.equal(r.classification, 'Warning')
}

// ═══════════════════════════════════════════════════════════════════════════
// §8.4 Caps — per-bucket (LO), total, bank exhaustion, overrides
// ═══════════════════════════════════════════════════════════════════════════

function verifies_lo_bucket_cap_enforced(): void {
  // LO1 target = 2 per Set → 5 Sets → maxTarget across Sets = 2. With default
  // headroomFactor 2, the LO1 bucket cap = 4. Seed the pool with 3 LO1
  // Candidates; feed 5 more LO1 supplemental rows. Only 1 should be admitted
  // (3 + 1 = 4 = cap); the rest skipped on the bucket cap.
  const ctx = ctxWithLoTargets({ LO1: 2 })
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { learningObjective: 'LO1', topic: 'T1' } },
    { code: 'Q-000002', overrides: { learningObjective: 'LO1', topic: 'T2' } },
    { code: 'Q-000003', overrides: { learningObjective: 'LO1', topic: 'T3' } },
  ])
  const supplemental: SyntheticBankRow[] = []
  for (let i = 4; i <= 8; i++) {
    const seq = String(i).padStart(6, '0')
    supplemental.push(okRow(`Q-0000${i}`, { learningObjective: 'LO1', topic: `T${i}` }))
    void seq
  }
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: supplemental,
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 1, 'only 1 LO1 Candidate fits the bucket cap (3+1=4)')
  assert.ok(r.expansionReport.bucketCapHit, 'bucket cap must be recorded as hit')
  assert.ok(r.expansionReport.candidatesSkippedCap >= 4)
  assert.ok(r.expansionReport.warning !== null, 'cap hit → GeneratorWarning (§11.2)')
}

function verifies_lo_target_zero_not_capped(): void {
  // LOs with target=0 are NOT capped (decision E4 — capping at 0 would exclude
  // every Candidate, violating Maximum Recall §12.4). Feed many LO2 rows when
  // LO2 target = 0; all should be admitted (bounded only by total cap).
  const ctx = ctxWithLoTargets({ LO1: 0, LO2: 0 })
  const pool = poolWith(ctx, [{ code: 'Q-000001', overrides: { learningObjective: 'LO1' } }])
  const supplemental: SyntheticBankRow[] = []
  for (let i = 2; i <= 6; i++) {
    supplemental.push(okRow(`Q-0000${i}`, { learningObjective: 'LO2', topic: `T${i}` }))
  }
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: supplemental,
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 5, 'LO2 (target=0) must not be bucket-capped')
  assert.equal(r.expansionReport.bucketCapHit, false)
}

function verifies_total_cap_enforced(): void {
  // Force a tight total cap; feed enough supplemental rows to exceed it.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const supplemental: SyntheticBankRow[] = []
  for (let i = 2; i <= 20; i++) {
    supplemental.push(okRow(`Q-0000${String(i).padStart(2, '0')}`, { topic: `T${i}` }))
  }
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: supplemental,
    ctx,
    options: { maxPoolSize: 4 }, // total cap = 4 Candidates
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.pool.candidates.length, 4, 'pool must not exceed explicit maxPoolSize')
  assert.ok(r.expansionReport.totalCapHit)
  assert.ok(r.expansionReport.warning !== null)
}

function verifies_explicit_max_pool_size_override(): void {
  // An explicit maxPoolSize overrides the plan-derived default.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000002'), okRow('Q-000003')],
    ctx,
    options: { maxPoolSize: 2 },
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.pool.candidates.length, 2)
}

function verifies_headroom_factor_override_widens_bucket_cap(): void {
  // LO1 target = 2 → with factor 4, bucket cap = 8. Seed 3, feed 6 more →
  // all 6 admitted (3 + 6 = 9 > 8 would cap, so test with 5 → 3+5=8 = cap).
  const ctx = ctxWithLoTargets({ LO1: 2 })
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { learningObjective: 'LO1', topic: 'T1' } },
    { code: 'Q-000002', overrides: { learningObjective: 'LO1', topic: 'T2' } },
    { code: 'Q-000003', overrides: { learningObjective: 'LO1', topic: 'T3' } },
  ])
  const supplemental: SyntheticBankRow[] = []
  for (let i = 4; i <= 8; i++) {
    supplemental.push(okRow(`Q-0000${i}`, { learningObjective: 'LO1', topic: `T${i}` }))
  }
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: supplemental,
    ctx,
    options: { headroomFactor: 4 }, // cap = 2 × 4 = 8
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  // 3 existing + 5 supplemental = 8 = cap; all 5 admitted.
  assert.equal(r.expansionReport.candidatesAdded, 5)
  assert.equal(r.expansionReport.bucketCapHit, false, 'factor 4 raises cap to 8; 5 additions fit')
}

function verifies_headroom_factor_below_one_rejected(): void {
  // A factor < 1 would shrink the pool — §2.3 violation. Must throw.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  assert.throws(
    () =>
      expandPool({
        validation: validationWith(pool, 'Warning'),
        supplementalRows: [okRow('Q-000099')],
        ctx,
        options: { headroomFactor: 0.5 },
      }),
    RangeError
  )
}

function verifies_bank_exhausted_flag(): void {
  // When ALL eligible supplemental rows are consumed without hitting a cap,
  // bankExhausted must be true.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099'), okRow('Q-000100')],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 2)
  assert.equal(r.expansionReport.bankExhausted, true)
  assert.equal(r.expansionReport.totalCapHit, false)
  assert.equal(r.expansionReport.warning, null)
}

// ═══════════════════════════════════════════════════════════════════════════
// §11.2 / §11.4 — never fails; cap hits become Warnings
// ═══════════════════════════════════════════════════════════════════════════

function verifies_cap_hit_warning_is_warning_severity(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000002'), okRow('Q-000003'), okRow('Q-000004')],
    ctx,
    options: { maxPoolSize: 2 },
  })
  assert.ok(r.expansionReport.warning)
  assert.equal(r.expansionReport.warning!.severity, 'Warning')
}

function verifies_expansion_never_returns_undefined_or_throws(): void {
  // Even with adversarial input (all filtered out), expansion must produce a
  // well-formed result, never throw.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandOk({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-X', { status: 'Draft' })], // all filtered
    ctx,
  })
  assert.ok(r.expansionReport)
  assert.ok(r.pool)
  assert.equal(r.classification, 'Warning')
}

// ═══════════════════════════════════════════════════════════════════════════
// Determinism + Immutability
// ═══════════════════════════════════════════════════════════════════════════

function verifies_deterministic_same_input_same_output(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const input: PoolExpansionInput = {
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099'), okRow('Q-000100')],
    ctx,
  }
  const a = expandPool(input)
  const b = expandPool(input)
  assert.equal(stableStringify(a), stableStringify(b))
}

function verifies_idempotent(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const input: PoolExpansionInput = {
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  }
  const a = stableStringify(expandPool(input))
  const b = stableStringify(expandPool(input))
  const c = stableStringify(expandPool(input))
  assert.equal(a, b)
  assert.equal(b, c)
}

function verifies_order_invariant_on_supplemental_input(): void {
  // The expanded pool must be byte-identical regardless of supplemental-row
  // input ORDERING (no input-order leakage — determinism contract).
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const supplemental = [
    okRow('Q-000010', { topic: 'T10' }),
    okRow('Q-000002', { topic: 'T2' }),
    okRow('Q-000005', { topic: 'T5' }),
    okRow('Q-000001', { topic: 'T1' }), // dup of existing
    okRow('Q-000008', { topic: 'T8' }),
  ]
  // Canonical order.
  const canonical = stableStringify(
    expandPool({
      validation: validationWith(pool, 'Warning'),
      supplementalRows: supplemental,
      ctx,
    })
  )
  // Reverse order.
  const reversed = stableStringify(
    expandPool({
      validation: validationWith(pool, 'Warning'),
      supplementalRows: [...supplemental].reverse(),
      ctx,
    })
  )
  assert.equal(canonical, reversed, 'expanded pool must not depend on supplemental input order')
}

function verifies_does_not_mutate_input_pool(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const before = stableStringify(pool)
  expandPool({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099'), okRow('Q-000100')],
    ctx,
  })
  assert.equal(stableStringify(pool), before, 'input pool must not be mutated')
}

function verifies_does_not_mutate_input_supplemental_rows(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const supplemental = [okRow('Q-000099'), okRow('Q-000100')]
  const before = stableStringify(supplemental)
  expandPool({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: supplemental,
    ctx,
  })
  assert.equal(stableStringify(supplemental), before, 'supplemental rows must not be mutated')
}

// ═══════════════════════════════════════════════════════════════════════════
// Observability (best-effort; never affects result)
// ═══════════════════════════════════════════════════════════════════════════

function verifies_sink_receives_added_counter(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const sink = new CollectorSink()
  expandPool({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099'), okRow('Q-000100')],
    ctx,
    options: { sink },
  })
  assert.equal(sink.counterSum('candidates_added'), 2)
}

function verifies_sink_receives_cap_skip_counter(): void {
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const sink = new CollectorSink()
  expandPool({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000002'), okRow('Q-000003'), okRow('Q-000004')],
    ctx,
    options: { sink, maxPoolSize: 2 },
  })
  assert.ok(sink.counterSum('candidates_skipped_cap') >= 1)
}

function verifies_sink_does_not_affect_determinism(): void {
  // The result must be identical whether or not a sink is injected.
  const ctx = singleDocCtx()
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const baseInput = {
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [okRow('Q-000099')],
    ctx,
  }
  const withoutSink = stableStringify(expandPool(baseInput))
  const withSink = stableStringify(
    expandPool({ ...baseInput, options: { sink: new CollectorSink() } })
  )
  assert.equal(withoutSink, withSink)
}

// ═══════════════════════════════════════════════════════════════════════════
// Regression — end-to-end E-2C → E-2D → E-2E
// ═══════════════════════════════════════════════════════════════════════════

function verifies_end_to_end_reduces_real_warning_headroom(): void {
  // Construct a REAL Warning via validatePool (LO exactly-target → Warning),
  // then feed supplemental rows that increase headroom. The expanded pool must
  // contain strictly more LO1 Candidates than the original.
  const ctx = ctxWithLoTargets({ LO1: 1 }) // LO1 target = 1/Set → 1 LO1 Candidate = Warning
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { learningObjective: 'LO1', topic: 'T1' } },
  ])
  // Sanity: validatePool must classify this as Warning (LO exactly-target).
  const validation = validatePool(pool)
  assert.equal(validation.classification, 'Warning', 'fixture must produce a Warning')

  const r = expandPool({
    validation,
    supplementalRows: [
      okRow('Q-000099', { learningObjective: 'LO1', topic: 'T99' }),
      okRow('Q-000100', { learningObjective: 'LO1', topic: 'T100' }),
    ],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.ok(r.expansionReport.candidatesAdded >= 1)
  const lo1After = r.pool.candidates.filter((c) => c.metadata.learningObjective === 'LO1').length
  assert.ok(lo1After > 1, 'expanded pool must have more LO1 headroom than original')
  // Verdict carried forward unchanged.
  assert.equal(r.classification, 'Warning')
}

function verifies_end_to_end_pass_does_not_expand(): void {
  // A Pass-classified pool must NOT expand even with supplemental rows available.
  const ctx = ctxWithLoTargets({ LO1: 0, LO2: 0, LO3: 0, LO4: 0 })
  const rows: SyntheticBankRow[] = []
  for (let i = 1; i <= 120; i++) {
    rows.push(
      okRow(`Q-${String(i).padStart(6, '0')}`, {
        topic: `T${i}`,
        difficulty: (['Easy', 'Medium', 'Hard'] as const)[i % 3],
        questionPattern: (['Positive', 'Negative', 'Best Answer', 'Scenario', 'Sequence', 'Matching Concept'] as const)[i % 6],
      })
    )
  }
  const pool = poolWith(ctx, rows.map((r) => ({ code: r.questionCode, overrides: r })))
  const validation = validatePool(pool)
  assert.equal(validation.classification, 'Pass')
  const r = expandPool({
    validation,
    supplementalRows: [okRow('Q-999999')],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  assert.equal(r.pool, pool, 'Pass pool returned unchanged')
}

function verifies_end_to_end_blocking_does_not_expand(): void {
  // A Blocking-classified pool (LO shortfall) must NOT expand (§8.1).
  const ctx = ctxWithLoTargets({ LO1: 5 })
  const pool = poolWith(ctx, [
    { code: 'Q-000001', overrides: { learningObjective: 'LO1' } },
  ])
  const validation = validatePool(pool)
  assert.equal(validation.classification, 'Blocking')
  const r = expandPool({
    validation,
    supplementalRows: [okRow('Q-000099', { learningObjective: 'LO1' })],
    ctx,
  })
  assert.equal(r.expansionReport.outcome.kind, 'no_op')
  if (r.expansionReport.outcome.kind === 'no_op') {
    assert.equal(r.expansionReport.outcome.reason, 'classification_not_warning')
  }
}

function verifies_end_to_end_supplemental_passes_full_pipeline_again(): void {
  // A supplemental row that violates ANY filter is rejected — the full 7-filter
  // pipeline re-runs. Combine multiple violations to prove the pipeline runs.
  const req = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    exclusions: ['Q-EXCLUDED'],
  })
  const ctx: DiscoveryContext = { plan: planQuery(req), documentRegistry: req.documentRegistry }
  const pool = poolWith(ctx, [{ code: 'Q-000001' }])
  const r = expandPool({
    validation: validationWith(pool, 'Warning'),
    supplementalRows: [
      okRow('Q-EXCLUDED'), // exclusion filter
      okRow('Q-DRAFT', { status: 'Draft' }), // status filter
      okRow('Q-FOREIGN', { document: 'OTHER' }), // document filter
      okRow('Q-BADDIFF', { difficulty: 'Wrong' as SyntheticBankRow['difficulty'] }), // difficulty
      okRow('Q-OK'), // should pass
    ],
    ctx,
  })
  if (r.expansionReport.outcome.kind !== 'expanded') throw new Error('unreachable')
  assert.equal(r.expansionReport.candidatesAdded, 1, 'only the one clean row survives')
  const codes = r.pool.candidates.map((c) => c.identity.questionCode)
  assert.deepEqual(codes.sort(), ['Q-000001', 'Q-OK'])
}

// ═══════════════════════════════════════════════════════════════════════════
// Purity — no Supabase / clock / random in source
// ═══════════════════════════════════════════════════════════════════════════

function verifies_pool_expansion_source_is_pure(): void {
  const src = readFileSync(__dirname + '/pool-expansion.ts', 'utf8')
  const codeOnly = stripComments(src)
  assert.ok(
    !/\bfrom\s+['"][^'"]*@supabase/.test(codeOnly),
    'pool-expansion.ts must not import from any @supabase/* package'
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

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  // §8.1 Gate
  { name: 'Gate: Pass classification → no-op', fn: verifies_gate_pass_is_noop },
  { name: 'Gate: Blocking classification → no-op', fn: verifies_gate_blocking_is_noop },
  { name: 'Gate: Fatal classification → no-op', fn: verifies_gate_fatal_is_noop },
  { name: 'Gate: empty supplemental → no-op', fn: verifies_gate_empty_supplemental_is_noop },
  // §8.3 Non-Negotiable Rule — full pipeline re-applied
  { name: '§8.3: excluded Code not admitted', fn: verifies_supplemental_excluded_code_is_not_admitted },
  { name: '§8.3: Draft status not admitted', fn: verifies_supplemental_draft_status_is_not_admitted },
  { name: '§8.3: out-of-enum difficulty rejected', fn: verifies_supplemental_out_of_enum_difficulty_is_rejected },
  { name: '§8.3: non-permitted document rejected', fn: verifies_supplemental_non_permitted_document_is_rejected },
  { name: '§8.3: all filtered out → no-op', fn: verifies_supplemental_all_filtered_out_is_noop },
  // §2.3 Invariant #1
  { name: '§2.3: only adds, never removes survivors', fn: verifies_only_adds_never_removes_survivors },
  { name: '§2.3: dedup by Code', fn: verifies_dedup_by_code },
  { name: '§2.3: all supplemental already present → no-op', fn: verifies_all_supplemental_already_present_is_noop },
  // §6.2 + E1 — carry forward
  { name: '§6.2: shortfall report carried forward unchanged', fn: verifies_shortfall_report_carried_forward_unchanged },
  { name: '§6.2: classification carried forward', fn: verifies_classification_carried_forward },
  // §8.4 Caps
  { name: '§8.4: LO bucket cap enforced', fn: verifies_lo_bucket_cap_enforced },
  { name: '§8.4: LO target=0 not capped (Maximum Recall)', fn: verifies_lo_target_zero_not_capped },
  { name: '§8.4: total cap enforced', fn: verifies_total_cap_enforced },
  { name: '§8.4: explicit maxPoolSize override', fn: verifies_explicit_max_pool_size_override },
  { name: '§8.4: headroomFactor override widens bucket cap', fn: verifies_headroom_factor_override_widens_bucket_cap },
  { name: '§8.4: headroomFactor < 1 rejected (§2.3)', fn: verifies_headroom_factor_below_one_rejected },
  { name: '§8.4: bankExhausted flag set when no cap hit', fn: verifies_bank_exhausted_flag },
  // §11.2 / §11.4 — never fails
  { name: '§11.2: cap-hit warning is Warning severity', fn: verifies_cap_hit_warning_is_warning_severity },
  { name: '§11.4: never throws on adversarial input', fn: verifies_expansion_never_returns_undefined_or_throws },
  // Determinism + Immutability
  { name: 'Determinism: same input → same output', fn: verifies_deterministic_same_input_same_output },
  { name: 'Determinism: idempotent', fn: verifies_idempotent },
  { name: 'Determinism: order-invariant on supplemental input', fn: verifies_order_invariant_on_supplemental_input },
  { name: 'Immutability: input pool not mutated', fn: verifies_does_not_mutate_input_pool },
  { name: 'Immutability: supplemental rows not mutated', fn: verifies_does_not_mutate_input_supplemental_rows },
  // Observability
  { name: 'Observability: sink receives candidates_added counter', fn: verifies_sink_receives_added_counter },
  { name: 'Observability: sink receives cap-skip counter', fn: verifies_sink_receives_cap_skip_counter },
  { name: 'Observability: sink does not affect determinism', fn: verifies_sink_does_not_affect_determinism },
  // Regression
  { name: 'Regression: end-to-end reduces real Warning headroom', fn: verifies_end_to_end_reduces_real_warning_headroom },
  { name: 'Regression: Pass pool does not expand', fn: verifies_end_to_end_pass_does_not_expand },
  { name: 'Regression: Blocking pool does not expand', fn: verifies_end_to_end_blocking_does_not_expand },
  { name: 'Regression: supplemental passes full pipeline again', fn: verifies_end_to_end_supplemental_passes_full_pipeline_again },
  // Purity
  { name: 'Purity: pool-expansion.ts has no supabase/clock/random', fn: verifies_pool_expansion_source_is_pure },
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
