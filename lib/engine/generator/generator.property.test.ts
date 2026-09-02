/**
 * lib/engine/generator/generator.property.test.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator E-2G — Generator Property Tests (Generator Verification).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0
 *       §1.4 (deterministic given Bank state), §2.3 (Invariants),
 *       §4.2/§11.2/§11.4 (Fail Loud — missing axis is Fatal; No Silent Weakening),
 *       §5.2 (Maximum Recall — incomplete axes are FLAGGED, not dropped),
 *       §8.4 (Bounded over-fetch), §10.4 (CandidateSet immutable once emitted),
 *       §12.2 (Determinism), §12.3 (scaling promise — bounded by structure).
 *
 * PURPOSE. This file is VERIFICATION ONLY. It composes the real Generator
 * pipeline (E-2B → E-2C → E-2D → E-2E → E-2F) end-to-end and asserts the
 * cross-cutting properties that hold across ALL stages. It introduces no new
 * runtime logic, modifies no contracts, and changes no production behavior.
 *
 * RUN: npx jiti lib/engine/generator/generator.property.test.ts
 *
 * Properties under test:
 *   1. Determinism           — same input → byte-identical CandidateSet
 *   2. Immutability          — AssemblyRequest/QueryPlan/CandidatePool/CandidateSet
 *                              never mutated by any stage
 *   3. Maximum Recall        — no eligible Candidate lost before required filtering
 *   4. Bounded Size          — CandidateSet size bounded by structure (≤ cap,
 *                              ≤ requested over-fetch budget)
 *   5. Stable Ordering       — repeated runs produce identical ordering
 *   6. Fail Loud             — missing required axis → Fatal; filters never weakened
 *   7. No Hidden State       — no cache/singleton/global/random/clock in pipeline
 *   8. Pure Function         — input → output only; no DB/Supabase/React/Runtime
 *   9. Regression            — protects E-2A..E-2F contract surface + vocabulary
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type {
  AssemblyRequest,
} from '../reader/contracts'
import type {
  CandidatePool,
  CandidateSet,
  QueryPlan,
} from './contracts'
import { planQuery } from './query-planner'
import { runFilters, InMemoryBankAdapter, type BankReadAdapter } from './metadata-filters'
import { discoverCandidates, validatePool, type DiscoveryContext } from './discovery'
import { expandPool, type PoolExpansionResult } from './pool-expansion'
import { emitCandidateSet } from './candidate-set-emitter'
import {
  buildAssemblyRequest,
  buildBankRow,
  buildConstraintSnapshot,
  buildCoverageRule,
  buildDocument,
  type SyntheticBankRow,
} from '../shared/testing/fixtures'
import { stableStringify } from '../shared/testing/determinism'

// ═══════════════════════════════════════════════════════════════════════════
// Test harness — the full Generator pipeline composed as ONE pure function.
// ═══════════════════════════════════════════════════════════════════════════
// This is the single composition point the property tests exercise. It mirrors
// how a future orchestrator would wire the stages; it adds NO behavior beyond
// threading outputs into inputs. Every property below asserts over its result.

/** Optional knobs for the pipeline driver. */
interface GenerateOptions {
  /** Bank rows to feed E-2C (the initial read). */
  readonly rows?: readonly SyntheticBankRow[]
  /** Supplemental rows for E-2E over-fetch (default: none). */
  readonly supplementalRows?: readonly SyntheticBankRow[]
  /** Caller-supplied CandidateSet identity (E-2F). */
  readonly assemblyRequestId?: string
  /** Exclusions log forwarded to E-2F (default: []). */
  readonly exclusionsLog?: CandidateSet['exclusionsLog']
  /** Hard total cap override passed to E-2E (default: derive from plan). */
  readonly maxPoolSize?: number
}

/** Compose E-2B → E-2C → E-2D → E-2E → E-2F into one pure call. */
function generate(
  request: AssemblyRequest,
  opts: GenerateOptions = {}
): { candidateSet: CandidateSet; plan: QueryPlan; pool: CandidatePool; expansion: PoolExpansionResult } {
  const plan = planQuery(request)
  const ctx: DiscoveryContext = { plan, documentRegistry: request.documentRegistry }
  const adapter: BankReadAdapter = new InMemoryBankAdapter([...(opts.rows ?? [])])

  const filterResult = runFilters(adapter, plan)
  // Fatal on missing required axis is asserted by the Fail-Loud property; here
  // we only thread the success branch through. The pipeline driver surfaces a
  // Fatal as an empty CandidateSet-equivalent via the assertion path.
  if (!filterResult.ok) {
    throw new Error('generate(): filter stage went Fatal — see Fail-Loud property tests')
  }

  const discovery = discoverCandidates({ rows: filterResult.rows, ctx })
  if (!discovery.ok) {
    throw new Error('generate(): discovery stage went Fatal — ' + JSON.stringify(discovery.fatalDiagnostics))
  }

  const validation = validatePool(discovery.pool)
  const expansion = expandPool({
    validation,
    supplementalRows: opts.supplementalRows ?? [],
    ctx,
    options: opts.maxPoolSize !== undefined ? { maxPoolSize: opts.maxPoolSize } : undefined,
  })

  const candidateSet = emitCandidateSet({
    expansion,
    identity: {
      assemblyRequestId: opts.assemblyRequestId ?? request.identity.blueprint_id,
      generatedAt: null,
      bankStateHash: null,
    },
    constraintSnapshot: buildConstraintSnapshot(request),
    exclusionsLog: opts.exclusionsLog,
  })

  return { candidateSet, plan, pool: expansion.pool, expansion }
}

// ─── Shared fixtures ────────────────────────────────────────────────────────

/** A row that passes E-2C's filters (Published, permitted doc, in-enum axes). */
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

/** A minimal valid request pinned to one document + zero LO targets. */
function minimalRequest(overrides: Partial<AssemblyRequest> = {}): AssemblyRequest {
  return buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    // Zero every LO target so validatePool() Passes (no LO shortfall) and
    // Maximum-Recall/Immutability assertions can focus on the candidate surface.
    loDistribution: {
      targets: { LO1: 0, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: { LO1: ['Memory'], LO2: ['Concept'], LO3: ['Procedure'], LO4: ['Scenario'] },
    },
    ...overrides,
  })
}

/** N distinct ok rows, varying topic so Discovery never dedups them. */
function okRows(n: number, baseOverrides: Partial<SyntheticBankRow> = {}): SyntheticBankRow[] {
  return Array.from({ length: n }, (_, i) =>
    okRow(`Q-${String(i + 1).padStart(6, '0')}`, {
      ...baseOverrides,
      topic: `มาตรา ${i + 1}`,
    })
  )
}

/** Deep snapshot of any JSON-serializable structure, for immutability diffs. */
function snapshot<T>(v: T): string {
  return stableStringify(v)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Determinism — same input → byte-identical CandidateSet (§1.4, §12.2)
// ═══════════════════════════════════════════════════════════════════════════

function property_determinism_same_input_same_output(): void {
  const request = minimalRequest()
  const rows = okRows(5)
  const a = generate(request, { rows })
  const b = generate(request, { rows })
  assert.equal(snapshot(a.candidateSet), snapshot(b.candidateSet))
}

function property_determinism_byte_identical_candidates(): void {
  // The candidates array ordering must be byte-identical across runs — not just
  // set-equal. A tie-breaker leaking order would fail this.
  const request = minimalRequest()
  const rows = okRows(10)
  const a = generate(request, { rows }).candidateSet
  const b = generate(request, { rows }).candidateSet
  assert.deepEqual(
    a.candidates.map((c) => c.identity.questionCode),
    b.candidates.map((c) => c.identity.questionCode)
  )
  assert.equal(snapshot(a.candidates), snapshot(b.candidates))
}

function property_determinism_idempotent_across_many_runs(): void {
  const request = minimalRequest()
  const rows = okRows(8)
  const first = snapshot(generate(request, { rows }).candidateSet)
  for (let i = 0; i < 5; i++) {
    assert.equal(snapshot(generate(request, { rows }).candidateSet), first)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Immutability — Generator never mutates its inputs (§2.3, §10.4)
// ═══════════════════════════════════════════════════════════════════════════

function property_immutable_assembly_request(): void {
  const request = minimalRequest()
  const before = snapshot(request)
  generate(request, { rows: okRows(3) })
  assert.equal(snapshot(request), before, 'AssemblyRequest unmutated by full pipeline')
}

function property_immutable_query_plan(): void {
  const request = minimalRequest()
  const plan = planQuery(request)
  const before = snapshot(plan)
  generate(request, { rows: okRows(3) })
  assert.equal(snapshot(plan), before, 'QueryPlan unmutated')
}

function property_immutable_input_rows(): void {
  const request = minimalRequest()
  const rows = okRows(4)
  const before = snapshot(rows)
  generate(request, { rows })
  generate(request, { rows }) // twice to catch accumulator-style mutation
  assert.equal(snapshot(rows), before, 'input Bank rows unmutated')
}

function property_immutable_candidate_pool_references(): void {
  // E-2D/E-2E/E-2F forward the pool/candidates as the SAME reference where the
  // contract says so (E-2E no-op; E-2F forwards the pool's candidates verbatim).
  const request = minimalRequest()
  const { candidateSet, pool } = generate(request, { rows: okRows(2) })
  assert.equal(
    candidateSet.candidates,
    pool.candidates,
    'CandidateSet.candidates is the SAME readonly reference as the pool'
  )
}

function property_immutable_supplemental_rows_not_mutated(): void {
  const request = minimalRequest()
  const supplemental = okRows(2, { topic: 'extra-1' })
  const before = snapshot(supplemental)
  generate(request, { rows: okRows(1), supplementalRows: supplemental })
  assert.equal(snapshot(supplemental), before, 'supplemental rows unmutated')
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Maximum Recall — no eligible Candidate lost before required filtering (§5.2)
// ═══════════════════════════════════════════════════════════════════════════

function property_maximum_recall_no_eligible_candidate_lost(): void {
  // Every row that passes the filter pipeline must appear in the CandidateSet
  // EXACTLY once. The Generator never silently drops a survivor.
  const request = minimalRequest()
  const rows = okRows(6)
  const { candidateSet } = generate(request, { rows })
  const codes = new Set(candidateSet.candidates.map((c) => c.identity.questionCode))
  // All six input rows are Published + permitted + in-enum → all must survive.
  for (const row of rows) {
    assert.ok(codes.has(row.questionCode), `${row.questionCode} not lost`)
  }
}

function property_maximum_recall_incomplete_axis_flagged_not_dropped(): void {
  // A row with a NULL IG-2 axis (e.g. no pattern) is still ADMITTED — it is
  // FLAGGED via Completeness/Confidence, never dropped (§5.2 Maximum Recall).
  const request = minimalRequest()
  const rows = [
    okRow('Q-COMPLETE'),
    okRow('Q-NO-PATTERN', { questionPattern: null }),
    okRow('Q-NO-LO', { learningObjective: null }),
    okRow('Q-NO-SECTION', { section: null }),
  ]
  const { candidateSet } = generate(request, { rows })
  const codes = new Set(candidateSet.candidates.map((c) => c.identity.questionCode))
  for (const row of rows) {
    assert.ok(codes.has(row.questionCode), `${row.questionCode}: incomplete axis still admitted`)
  }
  // The gaps surface as reduced Confidence / incomplete Completeness (flagged).
  const noPattern = candidateSet.candidates.find((c) => c.identity.questionCode === 'Q-NO-PATTERN')!
  assert.equal(noPattern.confidence.level, 'reduced')
  assert.equal(noPattern.completeness.questionPattern, 'incomplete')
}

function property_maximum_recall_dedup_is_by_code_not_drop(): void {
  // A duplicate Code with IDENTICAL metadata is de-duplicated to one Candidate
  // (the same Question read twice is not two Candidates) — this is NOT a recall
  // loss; the Candidate is present exactly once (§5.4 identity = Code).
  const request = minimalRequest()
  const row = okRow('Q-DUP')
  const { candidateSet } = generate(request, { rows: [row, { ...row }] })
  const count = candidateSet.candidates.filter((c) => c.identity.questionCode === 'Q-DUP').length
  assert.equal(count, 1, 'duplicate Code present exactly once')
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Bounded Size — never more candidates than the structure allows (§8.4, §12.3)
// ═══════════════════════════════════════════════════════════════════════════

function property_bounded_size_never_exceeds_explicit_cap(): void {
  // The §8.4 total cap is a hard ceiling. With an explicit maxPoolSize and
  // abundant supplemental rows, the emitted CandidateSet cannot exceed it.
  const request = minimalRequest()
  const initial = okRows(1)
  // 20 supplemental rows + a cap of 5 → ≤ 5 candidates total.
  const supplemental = okRows(20, { topic: 'supp' })
  const { candidateSet } = generate(request, {
    rows: initial,
    supplementalRows: supplemental,
    maxPoolSize: 5,
  })
  assert.ok(
    candidateSet.candidates.length <= 5,
    `emitted ${candidateSet.candidates.length} > cap 5`
  )
}

function property_bounded_size_never_exceeds_rows_available(): void {
  // Without over-fetch, the Generator cannot manufacture Candidates: total ≤
  // distinct eligible input Codes.
  const request = minimalRequest()
  const rows = okRows(7)
  const { candidateSet } = generate(request, { rows })
  assert.ok(candidateSet.candidates.length <= rows.length)
}

function property_bounded_size_scales_with_structure_not_bank(): void {
  // §12.3 scaling promise: the §8.4 total cap scales with the Blueprint's
  // STRUCTURE, NOT with Bank size. To exercise the cap we must trigger Pool
  // Expansion (it only runs on a Warning classification). We engineer a real
  // Warning (LO exactly-target → no headroom), then feed a large supplemental
  // window under a tight explicit cap. The emitted CandidateSet must stay at or
  // below the cap regardless of how many supplemental rows are available — i.e.
  // the bound is the structural cap, not the Bank size.
  const request = buildAssemblyRequest({
    documentRegistry: [buildDocument({ id: 'LAW-ACT-HED-2562', tier: 1 })],
    loDistribution: {
      // LO1 target = 1/Set → 1 LO1 survivor == target → Warning (no headroom).
      targets: { LO1: 1, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: { LO1: ['Memory'], LO2: ['Concept'], LO3: ['Procedure'], LO4: ['Scenario'] },
    },
  })
  const initial = [okRow('Q-INIT', { learningObjective: 'LO1', topic: 'init' })]
  // 50 supplemental rows, all eligible — far more than the cap below.
  const supplemental = Array.from({ length: 50 }, (_, i) =>
    okRow(`Q-S${String(i).padStart(3, '0')}`, { learningObjective: 'LO1', topic: `s${i}` })
  )
  const { candidateSet, expansion } = generate(request, {
    rows: initial,
    supplementalRows: supplemental,
    maxPoolSize: 5, // structural cap, far below 50 supplemental rows
  })
  // Some cap was actually engaged (otherwise the bound assertion is vacuous).
  // Either the total cap or the per-bucket LO cap may fire first; both prove the
  // output is bounded by STRUCTURE, not by the 50-row Bank offering.
  const report = expansion.expansionReport
  assert.ok(
    report.totalCapHit || report.bucketCapHit,
    'a structural cap was engaged (total or LO bucket)'
  )
  assert.ok(
    candidateSet.candidates.length <= 5,
    `emitted ${candidateSet.candidates.length} > structural cap 5 (Bank offered 50)`
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Stable Ordering — repeated runs produce identical ordering (§12.2)
// ═══════════════════════════════════════════════════════════════════════════

function property_stable_ordering_slot_index_deterministic(): void {
  // The slotIndex's value arrays (per slot-id) must be identical across runs —
  // no hidden randomness in slot ordering. (stableStringify renders a Map as {},
  // so materialize the entries explicitly for the comparison.)
  const request = minimalRequest()
  const rows = okRows(4)
  const a = generate(request, { rows }).candidateSet
  const b = generate(request, { rows }).candidateSet
  const entries = (cs: CandidateSet) =>
    [...cs.slotIndex.slots.entries()]
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
      .map(([k, v]) => ({ k, v: [...v] }))
  assert.deepEqual(entries(a), entries(b))
}

function property_stable_ordering_no_input_order_leak(): void {
  // The EMITTED candidate order follows Discovery's dedup-map insertion order
  // (which follows input order). This is by design (the contract preserves pool
  // order). The property: feeding the SAME set of rows in the SAME order twice
  // yields the SAME emitted order — i.e. ordering is a pure function of input,
  // with no randomness injected between runs.
  const request = minimalRequest()
  const rows = okRows(5)
  const orderA = generate(request, { rows }).candidateSet.candidates.map((c) => c.identity.questionCode)
  const orderB = generate(request, { rows }).candidateSet.candidates.map((c) => c.identity.questionCode)
  assert.deepEqual(orderA, orderB, 'ordering stable across runs (no hidden randomness)')
}

function property_stable_ordering_statistics_stable(): void {
  const request = minimalRequest()
  // Two batches with DISTINCT codes (okRows would otherwise collide on Q-000001).
  const easy = okRows(6, { difficulty: 'Easy' })
  const hard = Array.from({ length: 4 }, (_, i) =>
    okRow(`Q-${String(100 + i).padStart(6, '0')}`, { difficulty: 'Hard', topic: `มาตรา h${i}` })
  )
  const rows = easy.concat(hard)
  const a = generate(request, { rows }).candidateSet.statistics
  const b = generate(request, { rows }).candidateSet.statistics
  assert.deepEqual(a, b)
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Fail Loud — missing required metadata → Fatal; filters never weakened
//    (§4.2 / §11.2 / §11.4)
// ═══════════════════════════════════════════════════════════════════════════

function property_fail_loud_missing_required_pattern_axis_is_not_fatal(): void {
  // question_pattern universal-null hotfix: if EVERY row lacks the IG-2
  // question_pattern axis, the Pattern Filter must NOT fatal anymore — rows
  // are retained and the pool classifies as UNAVAILABLE (degraded semantics).
  // learningObjective is populated so the LO filter doesn't fatal instead.
  const request = minimalRequest()
  const plan = planQuery(request)
  const adapter = new InMemoryBankAdapter(
    okRows(3, { questionPattern: undefined, learningObjective: 'LO1' })
  )
  const result = runFilters(adapter, plan)
  assert.equal(result.ok, true, 'entirely-absent pattern axis is not Fatal')
  if (result.ok) {
    assert.equal(result.rows.length, 3)
  }
}

function property_fail_loud_missing_required_lo_axis_is_fatal(): void {
  const request = minimalRequest()
  const plan = planQuery(request)
  const adapter = new InMemoryBankAdapter(
    okRows(3, { learningObjective: undefined })
  )
  const result = runFilters(adapter, plan)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.fatalDiagnostics[0]!.category, 'missing_required_axis')
  }
}

function property_fail_loud_partial_null_axis_not_fatal(): void {
  // Contrast: a MIX of null + present is NOT fatal. Nulls are admitted (Maximum
  // Recall); only an entirely-absent column is Fatal.
  const request = minimalRequest()
  const plan = planQuery(request)
  const adapter = new InMemoryBankAdapter([
    okRow('Q-1', { questionPattern: 'Positive' }), // present
    okRow('Q-2', { questionPattern: null }), // null but column exists
  ])
  const result = runFilters(adapter, plan)
  assert.equal(result.ok, true, 'partial-null axis is NOT fatal')
}

function property_fail_loud_duplicate_code_conflict_is_fatal(): void {
  // A duplicate Code with CONFLICTING metadata is a Bank-integrity violation →
  // Discovery goes Fatal (never silently picks one).
  const request = minimalRequest()
  const ctx: DiscoveryContext = {
    plan: planQuery(request),
    documentRegistry: request.documentRegistry,
  }
  const r = discoverCandidates({
    rows: [
      okRow('Q-CONFLICT', { difficulty: 'Easy' }),
      okRow('Q-CONFLICT', { difficulty: 'Hard' }), // same Code, different metadata
    ],
    ctx,
  })
  assert.equal(r.ok, false, 'conflicting duplicate Code is Fatal')
  if (!r.ok) {
    assert.equal(r.fatalDiagnostics[0]!.severity, 'Fatal')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. No Hidden State — no cache/singleton/global/random/clock in the pipeline
// ═══════════════════════════════════════════════════════════════════════════

function property_no_hidden_state_no_module_level_mutation(): void {
  // Assert: NO Generator source file declares MODULE-LEVEL `let`/`var`. A
  // module-scope `let`/`var` would be shared mutable state across calls — a
  // hidden-state bug. Function-local `let`s (e.g. loop counters) are fine: they
  // are per-call, not shared.
  //
  // Sound proxy for "module-level": the declaration is at column 0 (no leading
  // whitespace). Every function/class body in this codebase is indented, so an
  // unindented `let`/`var` is necessarily at module scope.
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  )
  assert.ok(files.length >= 6, 'found the Generator source files')
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), 'utf8')
    const codeOnly = stripComments(src)
    const offenders = codeOnly
      .split('\n')
      .map((l, i) => ({ l, n: i + 1 }))
      .filter((e) => /^(?:export\s+)?(?:let|var)\s/.test(e.l)) // column-0 only
    assert.equal(
      offenders.length,
      0,
      `${f} must not declare module-level let/var (found lines: ${offenders.map((o) => o.n).join(', ')})`
    )
  }
}

function property_no_hidden_state_no_random_or_clock_in_source(): void {
  // Assert: no Math.random / Date.now / process.hrtime / performance.now in any
  // Generator source file. (References inside comments are stripped first.)
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  )
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), 'utf8')
    const codeOnly = stripComments(src)
    assert.ok(
      !/\b(Math\.random|Date\.now|process\.hrtime|performance\.now)\s*\(/.test(codeOnly),
      `${f}: no randomness or wall-clock`
    )
  }
}

function property_no_hidden_state_repeated_calls_isolated(): void {
  // Calling the pipeline many times in sequence must not accumulate state — each
  // call is independent (no singleton/cache). Identical inputs across N calls →
  // identical outputs, AND no call's output depends on a prior call.
  const request = minimalRequest()
  const rows = okRows(4)
  // Interleave two distinct inputs; verify each is unaffected by the other.
  const r1 = snapshot(generate(request, { rows, assemblyRequestId: 'A' }).candidateSet)
  generate(request, { rows: okRows(20), assemblyRequestId: 'B' }) // unrelated call
  generate(request, { rows: okRows(1), assemblyRequestId: 'C' }) // unrelated call
  const r1Again = snapshot(generate(request, { rows, assemblyRequestId: 'A' }).candidateSet)
  assert.equal(r1, r1Again, 'no state carried between calls')
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Pure Function — input → output only; no DB/Supabase/React/Runtime (§1.4)
// ═══════════════════════════════════════════════════════════════════════════

function property_pure_no_supabase_imports_in_source(): void {
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  )
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), 'utf8')
    const codeOnly = stripComments(src)
    assert.ok(
      !/\bfrom\s+['"][^'"]*@supabase/.test(codeOnly),
      `${f}: must not import @supabase/*`
    )
    assert.ok(!/\bcreateClient\s*\(/.test(codeOnly), `${f}: no createClient`)
    assert.ok(!/\.rpc\s*\(/.test(codeOnly), `${f}: no Supabase RPC`)
  }
}

function property_pure_no_react_or_runtime_imports_in_source(): void {
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  )
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), 'utf8')
    const codeOnly = stripComments(src)
    assert.ok(
      !/\bfrom\s+['"]react['"]/i.test(codeOnly),
      `${f}: must not import react`
    )
    assert.ok(
      !/\bfrom\s+['"][^'"]*next\//.test(codeOnly),
      `${f}: must not import next/* runtime`
    )
  }
}

function property_pure_output_is_pure_function_of_input(): void {
  // The defining property of a pure function: same input → same output, AND the
  // output depends ONLY on the input. Vary the input → output varies; freeze the
  // input → output is frozen. (A side-effecting function would fail this under
  // repeated identical calls.)
  const request = minimalRequest()
  const rows = okRows(3)
  const base = snapshot(generate(request, { rows }).candidateSet)
  // Different input → different output (confirms output tracks input).
  const different = snapshot(
    generate(request, { rows: okRows(5) }).candidateSet
  )
  assert.notEqual(base, different, 'output changes when input changes')
  // Same input again → same base output.
  assert.equal(base, snapshot(generate(request, { rows }).candidateSet))
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Regression — protect the E-2A..E-2F contract surface against change
// ═══════════════════════════════════════════════════════════════════════════

function property_regression_pipeline_stage_chain_completes(): void {
  // Smoke test: the full E-2B → E-2F chain runs to a valid CandidateSet. If any
  // stage's signature or contract changes, this fails at compile or runtime.
  // The CR-1 binding requires (LAW-ACT-HED-2562, มาตรา 6); rows MUST match it or
  // the coverage filter rejects them all, leaving none for the downstream IG-2
  // filters (which then correctly go Fatal on an "entirely absent" column).
  const request = minimalRequest({
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
  // All rows match the CR-1 pair (topic มาตรา 6) so they survive coverage.
  const rows = Array.from({ length: 3 }, (_, i) =>
    okRow(`Q-${String(i + 1).padStart(6, '0')}`, { topic: 'มาตรา 6' })
  )
  const { candidateSet, plan, pool, expansion } = generate(request, { rows })
  // Every contract field is populated.
  assert.ok(candidateSet.candidates.length > 0)
  assert.ok(plan.permittedDocuments.length > 0)
  assert.ok(pool.candidates.length > 0)
  assert.ok(expansion.expansionReport !== undefined)
  assert.equal(candidateSet.meta.specVersion, '1.0')
  assert.equal(candidateSet.identity.assemblyRequestId, request.identity.blueprint_id)
  assert.ok(candidateSet.statistics.totalCandidates > 0)
  assert.ok(candidateSet.coverageSatisfaction.bindings.length >= 1)
}

function property_regression_candidate_carries_all_five_facets(): void {
  // §5.2: a Candidate is composed of EXACTLY five facets. If the contract drops
  // or renames one, this fails.
  const request = minimalRequest()
  const { candidateSet } = generate(request, { rows: okRows(1) })
  const c = candidateSet.candidates[0]!
  assert.ok(c.identity && 'questionCode' in c.identity)
  assert.ok(c.metadata && 'difficulty' in c.metadata)
  assert.ok(c.completeness && 'blueprintType' in c.completeness)
  assert.ok(c.confidence && 'level' in c.confidence)
  assert.ok(c.provenance && 'filtersPassed' in c.provenance)
}

function property_regression_filter_execution_order_is_normative(): void {
  // §4.3: the 7 filters run in a FIXED order. If FILTER_EXECUTION_ORDER changes,
  // selectivity characteristics change — this locks the normative order.
  const { FILTER_EXECUTION_ORDER } = require('./contracts')
  assert.deepEqual([...FILTER_EXECUTION_ORDER], [
    'exclusion',
    'status',
    'document',
    'coverage',
    'difficulty',
    'pattern',
    'learning_objective',
  ])
}

function property_regression_candidate_set_identity_pinned_to_request(): void {
  // The emitted CandidateSet's identity.assemblyRequestId is caller-supplied
  // (E-2F decision F1) and defaults to the request's blueprint_id. Two distinct
  // requests produce distinct identities (no cross-contamination).
  const r1 = minimalRequest()
  r1.identity.blueprint_id = 'blueprint-AAA'
  const r2 = minimalRequest()
  r2.identity.blueprint_id = 'blueprint-BBB'
  const cs1 = generate(r1, { rows: okRows(1) }).candidateSet
  const cs2 = generate(r2, { rows: okRows(1) }).candidateSet
  assert.notEqual(cs1.identity.assemblyRequestId, cs2.identity.assemblyRequestId)
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Strip block + line comments so regex scans don't match commented-out code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\/])\/\/[^\n]*/g, '$1')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  // 1. Determinism
  { name: 'Determinism: same input → same CandidateSet', fn: property_determinism_same_input_same_output },
  { name: 'Determinism: candidates byte-identical across runs', fn: property_determinism_byte_identical_candidates },
  { name: 'Determinism: idempotent across many runs', fn: property_determinism_idempotent_across_many_runs },
  // 2. Immutability
  { name: 'Immutability: AssemblyRequest not mutated', fn: property_immutable_assembly_request },
  { name: 'Immutability: QueryPlan not mutated', fn: property_immutable_query_plan },
  { name: 'Immutability: input rows not mutated', fn: property_immutable_input_rows },
  { name: 'Immutability: CandidateSet.candidates same ref as pool', fn: property_immutable_candidate_pool_references },
  { name: 'Immutability: supplemental rows not mutated', fn: property_immutable_supplemental_rows_not_mutated },
  // 3. Maximum Recall
  { name: 'Maximum Recall: no eligible candidate lost', fn: property_maximum_recall_no_eligible_candidate_lost },
  { name: 'Maximum Recall: incomplete axis flagged, not dropped', fn: property_maximum_recall_incomplete_axis_flagged_not_dropped },
  { name: 'Maximum Recall: dedup is by Code (present exactly once)', fn: property_maximum_recall_dedup_is_by_code_not_drop },
  // 4. Bounded Size
  { name: 'Bounded Size: never exceeds explicit cap', fn: property_bounded_size_never_exceeds_explicit_cap },
  { name: 'Bounded Size: never exceeds rows available', fn: property_bounded_size_never_exceeds_rows_available },
  { name: 'Bounded Size: scales with structure, not Bank size', fn: property_bounded_size_scales_with_structure_not_bank },
  // 5. Stable Ordering
  { name: 'Stable Ordering: slotIndex deterministic', fn: property_stable_ordering_slot_index_deterministic },
  { name: 'Stable Ordering: emitted order stable across runs', fn: property_stable_ordering_no_input_order_leak },
  { name: 'Stable Ordering: statistics stable', fn: property_stable_ordering_statistics_stable },
  // 6. Fail Loud
  { name: 'universal-null hotfix: entirely-absent pattern axis is NOT Fatal', fn: property_fail_loud_missing_required_pattern_axis_is_not_fatal },
  { name: 'Fail Loud: entirely-absent LO axis is Fatal', fn: property_fail_loud_missing_required_lo_axis_is_fatal },
  { name: 'Fail Loud: partial-null axis is NOT fatal', fn: property_fail_loud_partial_null_axis_not_fatal },
  { name: 'Fail Loud: conflicting duplicate Code is Fatal', fn: property_fail_loud_duplicate_code_conflict_is_fatal },
  // 7. No Hidden State
  { name: 'No Hidden State: no module-level let/var in source', fn: property_no_hidden_state_no_module_level_mutation },
  { name: 'No Hidden State: no random/clock in source', fn: property_no_hidden_state_no_random_or_clock_in_source },
  { name: 'No Hidden State: repeated calls are isolated', fn: property_no_hidden_state_repeated_calls_isolated },
  // 8. Pure Function
  { name: 'Pure: no @supabase imports in source', fn: property_pure_no_supabase_imports_in_source },
  { name: 'Pure: no react/next runtime imports in source', fn: property_pure_no_react_or_runtime_imports_in_source },
  { name: 'Pure: output is a pure function of input', fn: property_pure_output_is_pure_function_of_input },
  // 9. Regression
  { name: 'Regression: full E-2B → E-2F chain completes', fn: property_regression_pipeline_stage_chain_completes },
  { name: 'Regression: Candidate carries all five facets', fn: property_regression_candidate_carries_all_five_facets },
  { name: 'Regression: FILTER_EXECUTION_ORDER normative', fn: property_regression_filter_execution_order_is_normative },
  { name: 'Regression: CandidateSet identity pinned to request', fn: property_regression_candidate_set_identity_pinned_to_request },
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
