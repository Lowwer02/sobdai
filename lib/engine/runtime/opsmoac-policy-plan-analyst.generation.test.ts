/**
 * lib/engine/runtime/opsmoac-policy-plan-analyst.generation.test.ts
 * ----------------------------------------------------------------------------
 * SPKS Blueprint V1 (opsmoac-policy-plan-analyst@3.0.0) — QUANTIFIED DOCUMENT
 * ALLOCATION executable proof (Document Quota Closure).
 *
 * Drives the REAL repository SPKS Blueprint source through the REAL production
 * Engine Runtime (Reader → Generator → Scoring → Ranking → Solver) over a
 * deterministic SPKS-shaped SYNTHETIC Bank.
 *
 * The Blueprint declares `**Document Allocation**: quantified-physical`, so
 * the authored per-Document per-Set counts are AUTHORITATIVE PHYSICAL QUOTAS
 * (one hard marginal) and the authored LO distribution (PRODUCT DECISION —
 * LO1 35 / LO2 30 / LO3 20 / LO4 15, not a live-bank measurement, not copied
 * from OAG/KSB) is the second hard marginal. NO Document×LO matrix is
 * authored anywhere: the Ranking demand chooses the joint cells from ACTUAL
 * supply via an exact deterministic max-flow.
 *
 * The synthetic Bank supplies GENEROUS INDEPENDENT per-(Document, LO) cells
 * (quota × multiplier in every cell) — it mirrors NO chosen joint matrix, so
 * the Engine remains free to pick its own feasible Document×LO allocation.
 * question_pattern is NULL on every row (the real SPKS Bank condition).
 *
 * Proves:
 *   1. 1 Set × 100: document quotas land EXACTLY
 *      9/7/7/4/6/6/6/6/6/5/5/5/5/4/4/3/3/3/3/2/1 AND LO quotas land EXACTLY
 *      35/30/20/15 — 100 DISTINCT codes, feasible, zero fatals
 *   2. 2 Sets × 100: exact quotas in EVERY Set + 200 distinct codes across
 *      the whole run (cross-set uniqueness)
 *   3. 3 Sets × 100: exact quotas in EVERY Set + 300 distinct codes
 *   4. question_pattern universal-NULL degraded/advisory semantics unchanged
 *      (never Fatal)
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
 * RUN: npx jiti lib/engine/runtime/opsmoac-policy-plan-analyst.generation.test.ts
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

const SPKS_SOURCE = readFileSync(
  new URL('../../../Blueprint/opsmoac_policy_plan_analyst_blueprint.md', import.meta.url),
  'utf8'
)

// ─── Authoritative V1 authored axes ─────────────────────────────────────────

/** Exact stored Document strings + authored per-Set quotas (Master Table). */
const ALLOCATION: ReadonlyArray<{ readonly document: string; readonly perSet: number }> = [
  { document: "แนวโน้มภาคเกษตรกรรมไทยและโลก ในปัจจุบัน", perSet: 9 },
  { document: "แผนปฏิบัติราชการของ สป.กษ. 5 ปี พ.ศ. 2566 - 2570", perSet: 7 },
  { document: "แนวทางการเขียนโครงการของ สป.กษ.", perSet: 7 },
  { document: "ยุทธศาสตร์ชาติ พ.ศ. 2561 - 2580", perSet: 4 },
  { document: "5 นโยบายหลัก เกษตรนวัตกรรม เพื่อความยั่งยืนเกษตรกรไทย", perSet: 6 },
  { document: "พ.ร.บ.วินัยการเงินการคลังของรัฐ พ.ศ. 2561", perSet: 6 },
  { document: "พ.ร.บ.วิธีการงบประมาณ พ.ศ. 2561 และที่แก้ไขเพิ่มเติม", perSet: 6 },
  { document: "การบริหารโครงการ หลักการ วงจร การควบคุม และการประเมินผล", perSet: 6 },
  { document: "พ.ร.บ.ส่งเสริมและพัฒนาระบบเกษตรพันธสัญญา พ.ศ. 2560 และกฎหมายที่เกี่ยวข้อง", perSet: 6 },
  { document: "แผนปฏิบัติการด้านการเกษตรและสหกรณ์ ระยะ 5 ปี พ.ศ. 2566 - 2570", perSet: 5 },
  { document: "แผนปฏิบัติราชการของกระทรวงเกษตรและสหกรณ์ ระยะ 5 ปี พ.ศ. 2566 - 2570", perSet: 5 },
  { document: "กฎกระทรวงแบ่งส่วนราชการสำนักงานปลัดกระทรวงเกษตรและสหกรณ์", perSet: 5 },
  { document: "ความรู้เกี่ยวกับ สป.กษ.", perSet: 5 },
  { document: "พ.ร.บ.ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 และที่แก้ไขเพิ่มเติม", perSet: 4 },
  { document: "แผนแม่บทภายใต้ยุทธศาสตร์ชาติ ประเด็นการเกษตร", perSet: 4 },
  { document: "แผนปฏิบัติราชการ พ.ศ. 2570 ของกระทรวงเกษตรและสหกรณ์", perSet: 3 },
  { document: "แผนปฏิบัติราชการรายปี พ.ศ. 2570 สำนักงานปลัดกระทรวงเกษตรและสหกรณ์", perSet: 3 },
  { document: "พ.ร.บ.วิธีปฏิบัติราชการทางปกครอง พ.ศ. 2539 และที่แก้ไขเพิ่มเติม", perSet: 3 },
  { document: "พ.ร.บ.กองทุนสงเคราะห์เกษตรกร พ.ศ. 2554 และกฎหมายที่เกี่ยวข้อง", perSet: 3 },
  { document: "พ.ร.บ.ข้อมูลข่าวสารของราชการ พ.ศ. 2540", perSet: 2 },
  { document: "แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ ฉบับที่ 13", perSet: 1 },
]

/** Authored LO split — PRODUCT DECISION (Blueprint §สัดส่วน LO ต่อ Set). */
const AUTHORED_LO_TARGETS: Readonly<Record<'LO1' | 'LO2' | 'LO3' | 'LO4', number>> = {
  LO1: 35,
  LO2: 30,
  LO3: 20,
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
 * Every (Document, LO) cell is supplied with `multiplier ×` the Document's
 * per-Set quota. This references NO joint Document×LO matrix — authored or
 * greedy — so ANY joint assignment satisfying the two hard marginals is
 * supply-feasible for up to `multiplier` Sets. The optional
 * `cellAdjustments` hook powers the negative tests. questionPattern is NULL
 * on every row (the real SPKS Bank condition).
 */
function buildSpksUniformBank(
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
          questionCode: `Q-SPKS-${String(seq).padStart(5, '0')}`,
          subject: null,
          document: entry.document,
          // Unique topic per row — keeps L1 (within-set uniqueness) satisfiable.
          topic: `${entry.document} #${lo} #${k}`,
          law: null,
          difficulty: DIFFICULTIES[seq % DIFFICULTIES.length]!,
          status: 'Published',
          blueprintType: TYPE_BY_LO[lo]!,
          learningObjective: lo,
          // The REAL SPKS Bank condition: pattern absent on every row.
          questionPattern: null,
          section: null,
        })
      }
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
    readBlueprintSource: () => SPKS_SOURCE,
    questionBank: new FixedBank(bank),
    observability: { emit: () => undefined },
    createExecutionId: () => 'spks-blueprint-v1-generation',
    nowIso: () => `2026-01-01T00:00:00.${String(iso++).padStart(3, '0')}Z`,
    monotonicTimeMs: () => 0,
    isCancellationRequested: () => false,
  }
}

function spksRequest(targetSetCount: 1 | 2 | 3): EngineRequest {
  return {
    blueprint: { id: 'opsmoac-policy-plan-analyst', version: '3.0.0' },
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
      requestedBy: 'spks-blueprint-v1-generation',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'spks-blueprint-v1-generation',
      traceId: null,
      parentSpanId: null,
    },
  }
}

// ─── assertion helpers ──────────────────────────────────────────────────────

/**
 * Assert EXACT physical quotas by grouping ACTUAL placements by
 * candidate.metadata.document and candidate.metadata.learningObjective
 * (never by demand buckets).
 */
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
    // EXACT per-Document physical quotas (all 21 authoritative targets).
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
  // Cross-set uniqueness semantics: globally distinct codes across the run.
  assert.equal(
    new Set(allCodes).size,
    allCodes.length,
    'no Question Code may be allocated twice across the whole run'
  )
}

// ─── 1. 1 Set × 100 — exact quotas ──────────────────────────────────────────

function verifies_1_set_x_100_exact_document_and_lo_quotas(): void {
  const rows = buildSpksUniformBank()
  const result = runEngine(spksRequest(1), engineDeps(rows))

  assert.equal(result.status, 'Completed')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors)}`
  )
  assert.ok(result.assemblyRequest, 'Reader must emit the AssemblyRequest')
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
  assert.equal(allocation.feasibility, 'feasible', 'no unresolved allocation conflict')
  assert.ok(allocation.perSetPhysicalCounts, 'quantified runs carry physical evidence')
  assert.equal(allocation.perSetPhysicalCounts![0]!.expectedQuestionCount, 100)
  assert.equal(allocation.perSetPhysicalCounts![0]!.allocatedQuestionCount, 100)
  assert.equal(allocation.perSetPhysicalCounts![0]!.distinctQuestionCount, 100)

  assertExactQuotas(result, 1)

  // Determinism: identical input → identical allocation.
  const again = runEngine(spksRequest(1), engineDeps(rows))
  assert.deepEqual(
    again.allocatedCandidateSet!.placements.map((p) =>
      p.state === 'allocated' ? p.assignedCandidate.code : p.state
    ),
    allocation.placements.map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : p.state))
  )
}

// ─── 2. 2 Sets × 100 — exact quotas per Set + cross-set uniqueness ──────────

function verifies_2_sets_x_100_exact_quotas_per_set(): void {
  const rows = buildSpksUniformBank()
  const result = runEngine(spksRequest(2), engineDeps(rows))

  assert.equal(result.status, 'Completed')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors)}`
  )
  assert.ok(result.allocatedCandidateSet, 'Solver must allocate both Sets')
  assert.equal(result.assemblyRequest!.target.sets, 2)
  assertExactQuotas(result, 2)
  // 200 distinct question_code across the whole run.
  const codes = result.allocatedCandidateSet!.placements
    .filter((p) => p.state === 'allocated')
    .map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : ''))
  assert.equal(codes.length, 200)
  assert.equal(new Set(codes).size, 200, '200 distinct question_code across the run')
}

// ─── 3. 3 Sets × 100 — exact quotas in every Set ────────────────────────────

function verifies_3_sets_x_100_exact_quotas(): void {
  // The Engine supports multi-Set generation; the global solve must hold for
  // N = 3 as ONE feasibility problem (uniform 3× headroom per cell).
  const rows = buildSpksUniformBank(undefined, 3)
  const result = runEngine(spksRequest(3), engineDeps(rows))

  assert.equal(result.status, 'Completed', 'the fully supplied 3-Set run must Complete')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors).slice(0, 300)}`
  )
  assert.ok(result.allocatedCandidateSet, 'Solver must allocate all three Sets')
  assertExactQuotas(result, 3)
}

// ─── 4. degraded pattern semantics unchanged ────────────────────────────────

function verifies_pattern_null_degraded_semantics_unchanged(): void {
  const rows = buildSpksUniformBank()
  const result = runEngine(spksRequest(1), engineDeps(rows))
  assert.equal(
    result.candidateSet!.patternAvailability,
    'UNAVAILABLE',
    'question_pattern universal-NULL stays degraded/advisory, never fatal'
  )
  const resultText = JSON.stringify({ errors: result.errors, warnings: result.warnings })
  assert.equal(resultText.includes('absent from every Bank row'), false)
  assert.equal(resultText.includes('question_pattern'), false)
}

// ─── 5. NEGATIVE: a Document whose TOTAL supply is below its quota ──────────

function verifies_document_shortfall_fails_loud(): void {
  // แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ ฉบับที่ 13 demands quota 1 but its whole
  // supply is 0 (every LO cell zeroed) — NO joint assignment can satisfy the
  // Document marginal, under ANY Document×LO choice.
  const shortDoc = "แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ ฉบับที่ 13"
  const rows = buildSpksUniformBank((document, _lo, supply) =>
    document === shortDoc ? 0 : supply
  )
  const result = runEngine(spksRequest(1), engineDeps(rows))

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

// ─── 6. NEGATIVE: truly impossible joint supply ─────────────────────────────

function verifies_impossible_joint_supply_fails_loud(): void {
  // LO4 (target 15) is reachable ONLY through the two smallest Documents —
  // whose combined quotas are 2 + 1 = 3 < 15. Both marginals are individually
  // plausible, but NO joint Document×LO assignment exists: the max-flow cannot
  // saturate, and the run must fail closed (never a partial Set).
  const lo4Docs = new Set([
    ALLOCATION[19]!.document,
    ALLOCATION[20]!.document,
  ])
  const rows = buildSpksUniformBank((document, lo, supply) =>
    lo === 'LO4' && !lo4Docs.has(document) ? 0 : supply
  )
  const result = runEngine(spksRequest(1), engineDeps(rows))

  assert.equal(result.allocatedCandidateSet, null, 'no allocation may be emitted')
  const fatals = result.errors.filter((e) => e.severity === 'fatal')
  assert.ok(fatals.length > 0, 'the impossible joint supply must fail LOUD')
  assert.ok(
    fatals.some((e) => e.explanation.includes('of exactly 100 required Question placements')),
    'the per-Set quantity invariant must fire'
  )
}

// ─── 7. NEGATIVE: no quantified-physical declaration → legacy behavior ──────

function verifies_legacy_mode_without_declaration(): void {
  const legacySource = SPKS_SOURCE.replace(
    ' | **Document Allocation**: quantified-physical',
    ''
  )
  assert.notEqual(legacySource, SPKS_SOURCE, 'the declaration must have been stripped')
  const rows = buildSpksUniformBank()
  const deps: EngineRuntimeDependencies = {
    ...engineDeps(rows),
    readBlueprintSource: () => legacySource,
  }
  const result = runEngine(spksRequest(1), deps)

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

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: '1×100: document quotas EXACT 9/7/7/4/6/6/6/6/6/5/5/5/5/4/4/3/3/3/3/2/1 + LO 35/30/20/15 + 100 distinct', fn: verifies_1_set_x_100_exact_document_and_lo_quotas },
  { name: '2×100: exact quotas in EVERY Set + 200 distinct codes (cross-set uniqueness)', fn: verifies_2_sets_x_100_exact_quotas_per_set },
  { name: '3×100: exact quotas in EVERY Set + 300 distinct codes', fn: verifies_3_sets_x_100_exact_quotas },
  { name: 'question_pattern universal-NULL degraded semantics unchanged (advisory, never fatal)', fn: verifies_pattern_null_degraded_semantics_unchanged },
  { name: 'NEGATIVE: Document total supply below quota → FAILS CLOSED (loud per-Set fatal)', fn: verifies_document_shortfall_fails_loud },
  { name: 'NEGATIVE: truly impossible joint supply (LO4 capacity 3 < target 15) → FAILS CLOSED', fn: verifies_impossible_joint_supply_fails_loud },
  { name: 'NEGATIVE: without quantified-physical declaration → legacy behavior (no quotas)', fn: verifies_legacy_mode_without_declaration },
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
