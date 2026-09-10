/**
 * lib/engine/runtime/oag-policy-plan-analyst.generation.test.ts
 * ----------------------------------------------------------------------------
 * OAG Blueprint V1 (oag-policy-plan-analyst@3.0.0) — QUANTIFIED DOCUMENT
 * ALLOCATION executable proof (Document Quota Closure, joint-marginal fix).
 *
 * Drives the REAL repository OAG Blueprint source through the REAL production
 * Engine Runtime (Reader → Generator → Scoring → Ranking → Solver) over a
 * deterministic OAG-shaped SYNTHETIC Bank.
 *
 * The Blueprint declares `**Document Allocation**: quantified-physical`, so
 * the authored per-Document per-Set counts are AUTHORITATIVE PHYSICAL QUOTAS
 * (one hard marginal) and the authored LO distribution (PRODUCT DECISION —
 * the OAG authoring convention, not a live-bank measurement) is the second
 * hard marginal. NO Document×LO matrix is authored anywhere: the Ranking
 * demand chooses the joint cells from ACTUAL supply via an exact
 * deterministic max-flow (one Set at a time against the remaining pool).
 *
 * Proves:
 *   1. 1 Set × 100: document quotas land EXACTLY 18/13/9/9/5/9/7/6/9/5/10 AND
 *      LO quotas land EXACTLY 40/30/15/15 — 100 DISTINCT codes
 *   2. 2 Sets × 100: exact quotas in EVERY Set + cross-set uniqueness
 *   3. ADVERSARIAL: a bank that supplies EXACTLY a feasible NON-GREEDY joint
 *      matrix (zero supply for the greedy cross-table's first cell) still
 *      PASSES with both marginals exact — pass-iff-feasible, no manufactured
 *      cross-table (this test FAILED under the removed greedy split)
 *   4. question_pattern universal-NULL degraded semantics unchanged
 *   5. NEGATIVE: a Document whose total supply is below its quota fails
 *      closed LOUDLY (no partial Set)
 *   6. NEGATIVE: a truly impossible joint supply (an LO reachable only
 *      through Documents whose quotas cannot cover its target) fails closed
 *   7. legacy gate: without the quantified-physical declaration the Blueprint
 *      keeps the historical LO-only advisory behavior (documentQuotas null)
 *
 * This is an OFFLINE feasibility proof of the Blueprint mechanics only —
 * NOT a claim about the real Bank (real-bank feasibility REQUIRES PREVIEW QA).
 *
 * RUN: npx jiti lib/engine/runtime/oag-policy-plan-analyst.generation.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type {
  BankMetadataRow,
  BankReadAdapter,
} from '../shared/question-bank'
import type {
  EngineRequest,
  EngineRuntimeDependencies,
} from './contracts'
import { runEngine } from './run-engine'

const OAG_SOURCE = readFileSync(
  new URL('../../../Blueprint/oag_policy_plan_analyst_blueprint.md', import.meta.url),
  'utf8'
)

// ─── Authoritative V1 authored axes ─────────────────────────────────────────

/** Exact stored Document strings + authored per-Set quotas (Master Table). */
const ALLOCATION: ReadonlyArray<{ readonly document: string; readonly perSet: number }> = [
  { document: 'พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561', perSet: 18 },
  { document: 'พ.ร.บ. วินัยการเงินการคลังของรัฐ พ.ศ. 2561', perSet: 13 },
  { document: 'พ.ร.บ.วิธีการงบประมาณ พ.ศ. 2561 และที่แก้ไขเพิ่มเติม', perSet: 9 },
  { document: 'พ.ร.ฎ.ว่าด้วยหลักเกณฑ์และวิธีการบริหารกิจการบ้านเมืองที่ดี พ.ศ. 2546', perSet: 9 },
  { document: 'ประกาศ คตง. ข้อกําหนดจริยธรรมเจ้าหน้าที่และบุคลากรอื่นของสํานักงานการตรวจเงินแผ่นดิน', perSet: 5 },
  { document: 'ยุทธศาสตร์ชาติ พ.ศ. 2561 - 2580', perSet: 9 },
  { document: 'แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ ฉบับที่ 13', perSet: 7 },
  { document: 'ประกาศ คตง. เรื่อง นโยบายการตรวจเงินแผ่นดิน (พ.ศ. 2566 - 2570)', perSet: 6 },
  { document: 'แผนปฏิบัติราชการ สตง. ระยะ 5 ปี พ.ศ. 2566 - 2570', perSet: 9 },
  { document: 'ความรู้เกี่ยวกับนโยบายสาธารณะ', perSet: 5 },
  { document: 'ความรู้เกี่ยวกับการวางแผนยุทธศาสตร์', perSet: 10 },
]

/** Authored LO split — PRODUCT DECISION (Blueprint §สัดส่วน LO ต่อ Set). */
const AUTHORED_LO_TARGETS: Readonly<Record<'LO1' | 'LO2' | 'LO3' | 'LO4', number>> = {
  LO1: 40,
  LO2: 30,
  LO3: 15,
  LO4: 15,
}

const LO_ORDER = ['LO1', 'LO2', 'LO3', 'LO4'] as const
const TYPE_BY_LO: Record<string, BankMetadataRow['blueprintType']> = {
  LO1: 'Memory',
  LO2: 'Concept',
  LO3: 'Procedure',
  LO4: 'Scenario',
}
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const

// ─── Synthetic Bank: UNIFORM per-cell supply (no joint-matrix coupling) ──────

/**
 * Every (Document, LO) cell is supplied with 2× the Document's per-Set quota.
 * This references NO joint Document×LO matrix — authored or greedy — so ANY
 * joint assignment satisfying the two hard marginals is supply-feasible,
 * including for a 2-Set run (a Set could take a Document's whole quota from a
 * single LO twice over). The optional `cellAdjustments` hook powers the
 * negative tests. questionPattern is NULL on every row (the real OAG Bank
 * condition).
 */
function buildOagUniformBank(
  cellAdjustments?: (document: string, lo: string, supply: number) => number,
  multiplier: 2 | 3 = 2
): BankMetadataRow[] {
  const rows: BankMetadataRow[] = []
  let seq = 0
  for (const entry of ALLOCATION) {
    for (const lo of LO_ORDER) {
      const base = entry.perSet * multiplier
      const supply = cellAdjustments ? cellAdjustments(entry.document, lo, base) : base
      for (let k = 1; k <= supply; k++) {
        seq += 1
        rows.push({
          questionCode: `Q-OAG-${String(seq).padStart(5, '0')}`,
          subject: null,
          document: entry.document,
          // Unique topic per row — keeps L1 (within-set uniqueness) satisfiable.
          topic: `${entry.document} #${lo} #${k}`,
          law: null,
          difficulty: DIFFICULTIES[seq % DIFFICULTIES.length]!,
          status: 'Published',
          blueprintType: TYPE_BY_LO[lo]!,
          learningObjective: lo,
          // The REAL OAG Bank condition: pattern absent on every row.
          questionPattern: null,
          section: null,
        })
      }
    }
  }
  return rows
}

/**
 * Exact-cell bank: supplies EXACTLY the given per-(Document, LO) counts —
 * nothing more. Used by the adversarial and negative tests to pin the supply
 * matrix precisely. questionPattern NULL on every row (real OAG condition).
 */
function buildOagCellBank(
  cells: ReadonlyArray<{ readonly document: string; readonly lo: string; readonly count: number }>
): BankMetadataRow[] {
  const rows: BankMetadataRow[] = []
  let seq = 0
  for (const cell of cells) {
    for (let k = 1; k <= cell.count; k++) {
      seq += 1
      rows.push({
        questionCode: `Q-OAG-${String(seq).padStart(5, '0')}`,
        subject: null,
        document: cell.document,
        topic: `${cell.document} #${cell.lo} #${k}`,
        law: null,
        difficulty: DIFFICULTIES[seq % DIFFICULTIES.length]!,
        status: 'Published',
        blueprintType: TYPE_BY_LO[cell.lo]!,
        learningObjective: cell.lo as BankMetadataRow['learningObjective'],
        questionPattern: null,
        section: null,
      })
    }
  }
  return rows
}

class FixedBank implements BankReadAdapter {
  public constructor(private readonly rows: readonly BankMetadataRow[]) {}
  public readMetadata(): readonly BankMetadataRow[] {
    return this.rows
  }
}

function engineDeps(bank: readonly BankMetadataRow[]): EngineRuntimeDependencies {
  let iso = 0
  return {
    readBlueprintSource: () => OAG_SOURCE,
    questionBank: new FixedBank(bank),
    observability: { emit: () => undefined },
    createExecutionId: () => 'oag-blueprint-v1-generation',
    nowIso: () => `2026-01-01T00:00:00.${String(iso++).padStart(3, '0')}Z`,
    monotonicTimeMs: () => 0,
    isCancellationRequested: () => false,
  }
}

function oagRequest(targetSetCount: 1 | 2 | 3): EngineRequest {
  return {
    blueprint: { id: 'oag-policy-plan-analyst', version: '3.0.0' },
    profile: 'simulation',
    runUnit: 'blueprint',
    runtimeCompatibility: { targetVersion: '1.0', minimumVersion: '1.0' },
    options: {
      overFetchFactor: 2,
      performanceBudgetMs: null,
      parallelismHint: null,
      auditVerbosity: 'full',
      targetSetCount,
    },
    context: {
      requestedBy: 'oag-blueprint-v1-generation',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'oag-blueprint-v1-generation',
      traceId: null,
      parentSpanId: null,
    },
  }
}

// ─── assertion helpers ──────────────────────────────────────────────────────

function assertExactQuotas(
  result: ReturnType<typeof runEngine>,
  setCount: 1 | 2 | 3
): void {
  const allocation = result.allocatedCandidateSet!
  const byCode = new Map(
    result.candidateSet!.candidates.map((c) => [c.identity.questionCode, c.metadata] as const)
  )
  const allCodes: string[] = []
  for (let setNumber = 1; setNumber <= setCount; setNumber++) {
    const codes = allocation.placements
      .filter((p) => p.state === 'allocated' && p.slot.setNumber === setNumber)
      .map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : ''))
    assert.equal(codes.length, 100, `Set ${setNumber}: exactly 100 physical placements`)
    assert.equal(new Set(codes).size, 100, `Set ${setNumber}: 100 DISTINCT Question Codes`)

    const docCounts = new Map<string, number>()
    const loCounts: Record<string, number> = { LO1: 0, LO2: 0, LO3: 0, LO4: 0 }
    for (const code of codes) {
      const metadata = byCode.get(code)!
      docCounts.set(metadata.document, (docCounts.get(metadata.document) ?? 0) + 1)
      loCounts[metadata.learningObjective as string]! += 1
    }
    // EXACT per-Document physical quotas (the release blocker this run closes).
    for (const entry of ALLOCATION) {
      assert.equal(
        docCounts.get(entry.document) ?? 0,
        entry.perSet,
        `Set ${setNumber} document quota: ${entry.document}`
      )
    }
    // EXACT per-LO physical quotas.
    assert.deepEqual(
      loCounts,
      { ...AUTHORED_LO_TARGETS },
      `Set ${setNumber} LO physical allocation`
    )
    allCodes.push(...codes)
  }
  // Cross-set uniqueness semantics (unchanged): globally distinct codes.
  assert.equal(
    new Set(allCodes).size,
    allCodes.length,
    'no Question Code may be allocated twice across the whole run'
  )
}

// ─── 1. 1 Set × 100 — exact quotas ──────────────────────────────────────────

function verifies_1_set_x_100_exact_document_and_lo_quotas(): void {
  const rows = buildOagUniformBank()
  const result = runEngine(oagRequest(1), engineDeps(rows))

  assert.equal(result.status, 'Completed')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors)}`
  )
  assert.ok(result.assemblyRequest, 'Reader must emit the AssemblyRequest')
  // The quantified-physical declaration survives Stage 6 as hard quotas.
  assert.ok(
    (result.assemblyRequest!.documentQuotas ?? []).length > 0,
    'AssemblyRequest must carry the quantified document quotas'
  )
  assert.deepEqual(
    result.assemblyRequest!.loDistribution.targets,
    { ...AUTHORED_LO_TARGETS }
  )

  const allocation = result.allocatedCandidateSet
  assert.ok(allocation, 'Solver must allocate')
  assert.equal(allocation.feasibility, 'feasible')
  assert.ok(allocation.perSetPhysicalCounts, 'quantified runs carry physical evidence')
  assert.equal(allocation.perSetPhysicalCounts![0]!.expectedQuestionCount, 100)
  assert.equal(allocation.perSetPhysicalCounts![0]!.allocatedQuestionCount, 100)
  assert.equal(allocation.perSetPhysicalCounts![0]!.distinctQuestionCount, 100)

  assertExactQuotas(result, 1)

  // Determinism: identical input → identical allocation.
  const again = runEngine(oagRequest(1), engineDeps(rows))
  assert.deepEqual(
    again.allocatedCandidateSet!.placements.map((p) =>
      p.state === 'allocated' ? p.assignedCandidate.code : p.state
    ),
    allocation.placements.map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : p.state))
  )
}

// ─── 2. 2 Sets × 100 — exact quotas per Set ─────────────────────────────────

function verifies_2_sets_x_100_exact_quotas_per_set(): void {
  const rows = buildOagUniformBank()
  const result = runEngine(oagRequest(2), engineDeps(rows))

  assert.equal(result.status, 'Completed')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors)}`
  )
  assert.ok(result.allocatedCandidateSet, 'Solver must allocate both Sets')
  assert.equal(result.assemblyRequest!.target.sets, 2)
  assertExactQuotas(result, 2)
}

// ─── 3. degraded pattern semantics unchanged ────────────────────────────────

function verifies_pattern_null_degraded_semantics_unchanged(): void {
  const rows = buildOagUniformBank()
  const result = runEngine(oagRequest(1), engineDeps(rows))
  assert.equal(
    result.candidateSet!.patternAvailability,
    'UNAVAILABLE',
    'question_pattern universal-NULL stays degraded/advisory, never fatal'
  )
  const resultText = JSON.stringify({ errors: result.errors, warnings: result.warnings })
  assert.equal(resultText.includes('absent from every Bank row'), false)
  assert.equal(resultText.includes('question_pattern'), false)
}

// ─── 5. NEGATIVE B: a Document whose TOTAL supply is below its quota ────────

function verifies_document_shortfall_fails_loud(): void {
  // ความรู้เกี่ยวกับการวางแผนยุทธศาสตร์ demands quota 10 but its whole supply
  // (2 + 2 + 2 + 3 = 9, across every LO) is below 10 — NO joint assignment
  // can satisfy the Document marginal, under ANY Document×LO choice.
  const shortDoc = ALLOCATION[10]!.document
  const rows = buildOagUniformBank((document, lo, supply) =>
    document === shortDoc ? (lo === 'LO4' ? 3 : 2) : supply
  )
  const result = runEngine(oagRequest(1), engineDeps(rows))

  assert.equal(
    result.allocatedCandidateSet,
    null,
    'a short Document supply must NOT produce an allocation'
  )
  const fatals = result.errors.filter((e) => e.severity === 'fatal')
  assert.ok(fatals.length > 0, 'the shortfall must fail LOUD')
  assert.ok(
    fatals.some((e) => e.explanation.includes('of exactly 100 required Question placements')),
    `the per-Set quantity invariant must fire: ${JSON.stringify(fatals).slice(0, 400)}`
  )
}

// ─── 6. NEGATIVE C: truly impossible joint supply ───────────────────────────

function verifies_impossible_joint_supply_fails_loud(): void {
  // LO1 (target 40) is reachable ONLY through Documents 5, 8, 10 — whose
  // combined quotas are 5 + 6 + 5 = 16 < 40. Both marginals are individually
  // plausible, but NO joint Document×LO assignment exists: the max-flow
  // cannot saturate, and the run must fail closed (never a partial Set).
  const lo1Docs = new Set([
    ALLOCATION[4]!.document,
    ALLOCATION[7]!.document,
    ALLOCATION[9]!.document,
  ])
  const rows = buildOagUniformBank((document, lo, supply) =>
    lo === 'LO1' && !lo1Docs.has(document) ? 0 : supply
  )
  const result = runEngine(oagRequest(1), engineDeps(rows))

  assert.equal(result.allocatedCandidateSet, null, 'no allocation may be emitted')
  const fatals = result.errors.filter((e) => e.severity === 'fatal')
  assert.ok(fatals.length > 0, 'the impossible joint supply must fail LOUD')
  assert.ok(
    fatals.some((e) => e.explanation.includes('of exactly 100 required Question placements')),
    'the per-Set quantity invariant must fire'
  )
}

// ─── 6. NEGATIVE D: no quantified-physical declaration → legacy behavior ────

function verifies_legacy_mode_without_declaration(): void {
  const legacySource = OAG_SOURCE.replace(
    ' | **Document Allocation**: quantified-physical',
    ''
  )
  assert.notEqual(legacySource, OAG_SOURCE, 'the declaration must have been stripped')
  const rows = buildOagUniformBank()
  const deps: EngineRuntimeDependencies = {
    ...engineDeps(rows),
    readBlueprintSource: () => legacySource,
  }
  const result = runEngine(oagRequest(1), deps)

  // The legacy (LO-only quantified) path still completes — historical behavior.
  assert.equal(result.status, 'Completed')
  assert.ok(result.allocatedCandidateSet, 'legacy path still allocates')
  // The gate is OFF: no document quotas are carried anywhere.
  assert.equal(
    result.assemblyRequest!.documentQuotas ?? null,
    null,
    'without the declaration the AssemblyRequest must carry NO document quotas'
  )
  assert.equal(
    result.candidateSet!.constraintSnapshot.documentQuotas ?? null,
    null,
    'the ConstraintSnapshot must carry NO document quotas in legacy mode'
  )
}

// ─── 7. ADVERSARIAL: feasible-non-greedy joint supply MUST pass ─────────────

/**
 * A joint Document × LO matrix that satisfies BOTH authored marginals but
 * shares NO cell layout with the authored-order greedy cross-table: it is the
 * exact REVERSED-corner split (documents in authored order × LOs in
 * LO4→LO3→LO2→LO1 order, cell = min(remaining doc, remaining LO)).
 *
 * marginals: docs 18/13/9/9/5/9/7/6/9/5/10 · LOs 40/30/15/15 · total 100.
 *
 * A bank supplying EXACTLY this matrix is feasible, yet the greedy
 * authored-order cross-table is IMPOSSIBLE on it: the greedy demands
 * doc1×LO1 = 18 while this matrix supplies doc1×LO1 = 0. The allocation must
 * still PASS — the contract has no authored Document×LO matrix, only the two
 * hard marginals, and the Engine must find a feasible joint assignment from
 * ACTUAL supply.
 */
const ANTI_GREEDY_CELLS: ReadonlyArray<{
  readonly document: string
  readonly lo: string
  readonly count: number
}> = [
  { document: ALLOCATION[0]!.document, lo: 'LO4', count: 15 },
  { document: ALLOCATION[0]!.document, lo: 'LO3', count: 3 },
  { document: ALLOCATION[1]!.document, lo: 'LO3', count: 12 },
  { document: ALLOCATION[1]!.document, lo: 'LO2', count: 1 },
  { document: ALLOCATION[2]!.document, lo: 'LO2', count: 9 },
  { document: ALLOCATION[3]!.document, lo: 'LO2', count: 9 },
  { document: ALLOCATION[4]!.document, lo: 'LO2', count: 5 },
  { document: ALLOCATION[5]!.document, lo: 'LO2', count: 6 },
  { document: ALLOCATION[5]!.document, lo: 'LO1', count: 3 },
  { document: ALLOCATION[6]!.document, lo: 'LO1', count: 7 },
  { document: ALLOCATION[7]!.document, lo: 'LO1', count: 6 },
  { document: ALLOCATION[8]!.document, lo: 'LO1', count: 9 },
  { document: ALLOCATION[9]!.document, lo: 'LO1', count: 5 },
  { document: ALLOCATION[10]!.document, lo: 'LO1', count: 10 },
]

function verifies_adversarial_feasible_non_greedy_supply_passes(): void {
  // Sanity: the adversarial matrix itself carries the exact authored marginals.
  const docTotals = new Map<string, number>()
  const loTotals: Record<string, number> = { LO1: 0, LO2: 0, LO3: 0, LO4: 0 }
  for (const cell of ANTI_GREEDY_CELLS) {
    docTotals.set(cell.document, (docTotals.get(cell.document) ?? 0) + cell.count)
    loTotals[cell.lo]! += cell.count
  }
  for (const entry of ALLOCATION) {
    assert.equal(docTotals.get(entry.document) ?? 0, entry.perSet, `adversarial doc marginal ${entry.document}`)
  }
  assert.deepEqual(loTotals, { ...AUTHORED_LO_TARGETS }, 'adversarial LO marginals')
  // And it is genuinely anti-greedy: doc1×LO1 supply is ZERO (greedy demands 18).
  assert.equal(
    ANTI_GREEDY_CELLS.find((c) => c.document === ALLOCATION[0]!.document && c.lo === 'LO1')?.count ?? 0,
    0,
    'the greedy first cell (doc1×LO1) must have NO supply in this bank'
  )

  const rows = buildOagCellBank(ANTI_GREEDY_CELLS)
  assert.equal(rows.length, 100, 'the adversarial bank supplies exactly 100 rows (no headroom)')
  const result = runEngine(oagRequest(1), engineDeps(rows))

  // FEASIBLE supply → the run MUST complete with BOTH marginals exact. The
  // bank has zero headroom by design, so 'Completed With Warnings' is the
  // expected terminal state — the warnings are the Generator's benign
  // "no headroom for Ranking to optimize" advisories, never errors.
  assert.ok(
    result.status === 'Completed' || result.status === 'Completed With Warnings',
    `a feasible joint assignment exists — the run must PASS: ${JSON.stringify(result.errors).slice(0, 400)}`
  )
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    'zero fatals on a feasible joint supply'
  )
  assert.ok(
    result.warnings.every((w) => w.explanation.includes('no headroom')),
    'the only warnings allowed on the zero-headroom bank are the no-headroom advisories'
  )
  assert.ok(result.allocatedCandidateSet, 'the Solver must allocate')
  assert.equal(result.allocatedCandidateSet!.feasibility, 'feasible')
  assertExactQuotas(result, 1)
}

// ─── 8. ADVERSARIAL 2-SET: globally feasible, sequential-starving bank ──────

/**
 * A 2-Set supply matrix that is GLOBALLY feasible (an aggregate plan covering
 * both Sets exists) on which the INHERITED sequential Set-1-first solver
 * picked a feasible Set-1 matrix that starves Set 2 (false infeasible).
 * Found by a deterministic seeded search over OAG-shaped supplies that
 * compared the sequential algorithm against the global aggregate solve.
 *
 * Per-Document [LO1, LO2, LO3, LO4] supply (authored document order):
 */
const GLOBAL_TRAP_SUPPLY: ReadonlyArray<readonly [number, number, number, number]> = [
  [7, 17, 5, 7],   // พ.ร.บ.ประกอบรัฐธรรมนูญฯ (quota 18, total 36 = 2×)
  [17, 0, 1, 10],  // พ.ร.บ. วินัยการเงินการคลังฯ (quota 13, total 28 ≥ 2×)
  [12, 5, 3, 1],   // พ.ร.บ.วิธีการงบประมาณฯ (quota 9, total 21 ≥ 2×)
  [10, 5, 5, 1],   // พ.ร.ฎ. ราชการบ้านเมืองที่ดีฯ (quota 9, total 21 ≥ 2×)
  [0, 7, 4, 1],    // ประกาศ คตง. จริยธรรมฯ (quota 5, total 12 ≥ 2×)
  [9, 7, 4, 1],    // ยุทธศาสตร์ชาติฯ (quota 9, total 21 ≥ 2×)
  [6, 7, 2, 1],    // แผนพัฒนาฯ ฉบับที่ 13 (quota 7, total 16 ≥ 2×)
  [5, 6, 2, 0],    // ประกาศ คตง. นโยบายฯ (quota 6, total 13 ≥ 2×)
  [2, 9, 1, 7],    // แผนปฏิบัติราชการฯ (quota 9, total 19 ≥ 2×)
  [6, 0, 3, 2],    // ความรู้นโยบายสาธารณะ (quota 5, total 11 ≥ 2×)
  [10, 2, 2, 6],   // ความรู้การวางแผนยุทธศาสตร์ (quota 10, total 20 = 2×)
]

function verifies_adversarial_2set_globally_feasible_passes(): void {
  // Expand the supply matrix into exact bank cells.
  const cells: Array<{ document: string; lo: string; count: number }> = []
  ALLOCATION.forEach((entry, docIdx) => {
    LO_ORDER.forEach((lo, loIdx) => {
      const count = GLOBAL_TRAP_SUPPLY[docIdx]![loIdx]!
      if (count > 0) cells.push({ document: entry.document, lo, count })
    })
  })
  // Sanity: every Document can cover 2× its quota; every LO column ≥ 2× target.
  ALLOCATION.forEach((entry, docIdx) => {
    const total = GLOBAL_TRAP_SUPPLY[docIdx]!.reduce((s, c) => s + c, 0)
    assert.ok(
      total >= entry.perSet * 2,
      `adversarial doc supply ${total} must cover 2× quota ${entry.perSet * 2}`
    )
  })
  LO_ORDER.forEach((lo, loIdx) => {
    const total = GLOBAL_TRAP_SUPPLY.reduce((s, row) => s + row[loIdx]!, 0)
    assert.ok(
      total >= AUTHORED_LO_TARGETS[lo] * 2,
      `adversarial LO supply ${total} must cover 2× target ${AUTHORED_LO_TARGETS[lo] * 2}`
    )
  })

  const rows = buildOagCellBank(cells)
  const result = runEngine(oagRequest(2), engineDeps(rows))

  // A GLOBAL assignment satisfying both Sets exists — the run MUST complete
  // with exact marginals in BOTH Sets (never a sequential false infeasible).
  assert.ok(
    result.status === 'Completed' || result.status === 'Completed With Warnings',
    `a globally feasible 2-Set assignment exists — the run must PASS: ${JSON.stringify(result.errors).slice(0, 400)}`
  )
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    'zero fatals on a globally feasible 2-Set supply'
  )
  assert.ok(result.allocatedCandidateSet, 'the Solver must allocate both Sets')
  assert.equal(result.allocatedCandidateSet!.feasibility, 'feasible')
  assertExactQuotas(result, 2)
}

// ─── 9. 3 Sets × 100 — exact quotas in every Set ────────────────────────────

function verifies_3_sets_x_100_exact_quotas(): void {
  // The Engine supports multi-Set generation; the global solve must hold for
  // N = 3 as ONE feasibility problem (uniform 3× headroom per cell).
  const rows = buildOagUniformBank(undefined, 3)
  const result = runEngine(oagRequest(3), engineDeps(rows))

  assert.equal(result.status, 'Completed', 'the fully supplied 3-Set run must Complete')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors).slice(0, 300)}`
  )
  assert.ok(result.allocatedCandidateSet, 'the Solver must allocate all three Sets')
  assertExactQuotas(result, 3)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: '1×100: document quotas EXACT 18/13/9/9/5/9/7/6/9/5/10 + LO 40/30/15/15 + 100 distinct', fn: verifies_1_set_x_100_exact_document_and_lo_quotas },
  { name: '2×100: exact quotas in EVERY Set + cross-set uniqueness', fn: verifies_2_sets_x_100_exact_quotas_per_set },
  { name: 'question_pattern universal-NULL degraded semantics unchanged', fn: verifies_pattern_null_degraded_semantics_unchanged },
  { name: 'NEGATIVE: Document total supply below quota → FAILS CLOSED (loud per-Set fatal)', fn: verifies_document_shortfall_fails_loud },
  { name: 'NEGATIVE: truly impossible joint supply (LO1 capacity 16 < target 40) → FAILS CLOSED', fn: verifies_impossible_joint_supply_fails_loud },
  { name: 'NEGATIVE D: without quantified-physical declaration → legacy behavior (no quotas)', fn: verifies_legacy_mode_without_declaration },
  { name: 'ADVERSARIAL: feasible-non-greedy joint supply → PASSES with exact marginals (greedy would fail)', fn: verifies_adversarial_feasible_non_greedy_supply_passes },
  { name: 'ADVERSARIAL 2-SET: globally feasible supply → BOTH Sets exact (sequential Set-1-first would starve Set 2)', fn: verifies_adversarial_2set_globally_feasible_passes },
  { name: '3×100: exact quotas in EVERY Set + cross-set uniqueness', fn: verifies_3_sets_x_100_exact_quotas },
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
