/**
 * lib/engine/runtime/revenue-academic-officer.generation.test.ts
 * ----------------------------------------------------------------------------
 * Revenue Academic Officer Blueprint V1 (revenue-academic-officer@3.0.0) —
 * QUANTIFIED DOCUMENT ALLOCATION executable proof (Document Quota Closure)
 * for package TAX-TRO-2026-V10 (กรมสรรพากร / นักวิชาการสรรพากร).
 *
 * Drives the REAL repository Blueprint source through the REAL production
 * Engine Runtime (Reader → Generator → Scoring → Ranking → Solver) over
 * deterministic SYNTHETIC Banks.
 *
 * The Blueprint declares `**Document Allocation**: quantified-physical`, so
 * the authored per-Document per-Set counts are AUTHORITATIVE PHYSICAL QUOTAS
 * (one hard marginal) and the authored LO distribution (PRODUCT DECISION —
 * LO1 28 / LO2 22 / LO3 23 / LO4 27, not copied from any sibling Blueprint) is
 * the second hard marginal. NO Document×LO matrix is authored anywhere: the
 * Ranking demand chooses the joint cells from ACTUAL supply via an exact
 * deterministic max-flow.
 *
 * Two Banks are exercised:
 *
 *   A. GENEROUS independent supply — every (Document, LO) cell is supplied
 *      with `multiplier ×` the Document's per-Set quota. It mirrors NO chosen
 *      joint matrix, so the Engine remains free to pick its own feasible
 *      Document×LO allocation.
 *
 *   B. PRODUCTION-SHAPE supply — a synthetic Bank whose per-(Document, LO)
 *      candidate CAPACITIES match the verified Production matrix EXACTLY
 *      (680 candidates total: 40 for ความรู้เบื้องต้นเกี่ยวกับภาษีอากร and
 *      80 for each of the remaining 8 Documents, LO column totals
 *      174/169/177/160, every question_code unique, question_pattern NULL,
 *      NO additional supply). This proves the chosen margins are jointly
 *      compatible with the MEASURED Production capacity shape — the test
 *      supplies the capacity MATRIX, never a preselected placement matrix.
 *
 * Proves:
 *   1. GENEROUS 1 Set × 100: document quotas land EXACTLY
 *      5/10/10/10/5/15/30/7/8 AND LO quotas land EXACTLY 28/22/23/27 —
 *      100 DISTINCT codes, feasible, zero fatals
 *   2. GENEROUS 2 Sets × 100: exact quotas in EVERY Set + 200 distinct codes
 *      across the whole run (cross-set uniqueness)
 *   3. PRODUCTION-SHAPE 1 Set × 100: Completed/feasible, exact Document
 *      quotas, exact LO 28/22/23/27, zero unresolved hard conflicts
 *   4. PRODUCTION-SHAPE 2 Sets × 100: Completed/feasible, per-Set exact
 *      Document quotas + LO, 200 distinct codes across the run
 *   5. PRODUCTION-SHAPE 3 Sets × 100: EXPECTED UNSUPPORTED — the
 *      เศรษฐกิจ สังคม และเทคโนโลยี quota is 30/Set against an 80-question
 *      supply (3 × 30 = 90 > 80), so the run must FAIL CLOSED loudly
 *      (document capacity, not a bug)
 *   6. question_pattern universal-NULL degraded/advisory semantics unchanged
 *      (never Fatal)
 *   7. document-NULL mock rows (the 50-question mock Exam Set projected to
 *      the empty-string document at the loader boundary) are rejected by the
 *      document filter and can NEVER fulfill any of the 9 quotas — the run
 *      stays exact with them present in the Bank
 *   8. NEGATIVE: a Document whose total supply is below its quota fails
 *      closed LOUDLY (no partial Set)
 *   9. NEGATIVE: a truly impossible joint supply (an LO reachable only
 *      through Documents whose quotas cannot cover its target) fails closed
 *  10. legacy gate: without the quantified-physical declaration the Blueprint
 *      keeps the historical LO-only advisory behavior (documentQuotas null)
 *
 * Position-isolation note: exclusion of the 120 unlinked -TAXSPO rows and the
 * 40 unlinked พ.ร.บ.ข้อมูลข่าวสารฯ rows happens in the package-scoped
 * Candidate Loader (exam_sets/exam_set_questions of TAX-TRO-2026-V10) BEFORE
 * the Engine sees the Bank — it is a loader boundary property (verified by
 * the source preflight), not an Engine filter, and DocumentCode plays no
 * matching role anywhere.
 *
 * This is an OFFLINE feasibility proof of the Blueprint mechanics (and, for
 * the production-shape Bank, of the margin/capacity compatibility) — the
 * REAL Bank still requires Preview QA before production use.
 *
 * RUN: npx jiti lib/engine/runtime/revenue-academic-officer.generation.test.ts
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

const TRO_SOURCE = readFileSync(
  new URL('../../../Blueprint/revenue_academic_officer_blueprint.md', import.meta.url),
  'utf8'
)

// ─── Authoritative V1 authored axes ─────────────────────────────────────────

/** Exact stored Document strings + authored per-Set quotas (Master Table). */
const ALLOCATION: ReadonlyArray<{ readonly document: string; readonly perSet: number }> = [
  { document: "ความรู้เบื้องต้นเกี่ยวกับภาษีอากร", perSet: 5 },
  { document: "ภาษีเงินได้บุคคลธรรมดา", perSet: 10 },
  { document: "ภาษีเงินได้นิติบุคคล", perSet: 10 },
  { document: "ภาษีมูลค่าเพิ่ม (VAT)", perSet: 10 },
  { document: "ภาษีธุรกิจเฉพาะ & อากรแสตมป์", perSet: 5 },
  { document: "ความรู้เกี่ยวกับกรมสรรพากร", perSet: 15 },
  { document: "เศรษฐกิจ สังคม และเทคโนโลยี", perSet: 30 },
  { document: "พ.ร.บ.ข้อมูลข่าวสารของราชการ พ.ศ. 2540", perSet: 7 },
  { document: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562", perSet: 8 },
]

/** Authored LO split — PRODUCT DECISION (Blueprint §สัดส่วน LO ต่อ Set). */
const AUTHORED_LO_TARGETS: Readonly<Record<'LO1' | 'LO2' | 'LO3' | 'LO4', number>> = {
  LO1: 28,
  LO2: 22,
  LO3: 23,
  LO4: 27,
}

/**
 * The VERIFIED PRODUCTION Document×LO capacity matrix (question-level SQL
 * audit of package TAX-TRO-2026-V10): 9 Documents — 40 questions for the
 * ภาษีอากรเบื้องต้น Document, 80 per remaining Document — LO column totals
 * 174/169/177/160, grand total 680. Used ONLY as test supply capacity —
 * never authored into the Blueprint.
 */
const PRODUCTION_SHAPE: ReadonlyArray<{
  readonly document: string
  readonly loCounts: readonly [number, number, number, number]
}> = [
  { document: "ความรู้เบื้องต้นเกี่ยวกับภาษีอากร", loCounts: [19, 10, 6, 5] },
  { document: "ภาษีเงินได้บุคคลธรรมดา", loCounts: [32, 28, 13, 7] },
  { document: "ภาษีเงินได้นิติบุคคล", loCounts: [12, 9, 38, 21] },
  { document: "ภาษีมูลค่าเพิ่ม (VAT)", loCounts: [15, 27, 19, 19] },
  { document: "ภาษีธุรกิจเฉพาะ & อากรแสตมป์", loCounts: [19, 10, 43, 8] },
  { document: "ความรู้เกี่ยวกับกรมสรรพากร", loCounts: [25, 18, 14, 23] },
  { document: "เศรษฐกิจ สังคม และเทคโนโลยี", loCounts: [25, 9, 15, 31] },
  { document: "พ.ร.บ.ข้อมูลข่าวสารของราชการ พ.ศ. 2540", loCounts: [17, 31, 11, 21] },
  { document: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562", loCounts: [10, 27, 18, 25] },
]

const LO_ORDER = ['LO1', 'LO2', 'LO3', 'LO4'] as const
const TYPE_BY_LO: Record<string, BankMetadataRow['blueprintType']> = {
  LO1: 'Memory',
  LO2: 'Concept',
  LO3: 'Procedure',
  LO4: 'Scenario',
}
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const

// ─── Synthetic Bank A: UNIFORM per-cell supply (no joint-matrix coupling) ────

/**
 * Every (Document, LO) cell is supplied with `multiplier ×` the Document's
 * per-Set quota. This references NO joint Document×LO matrix — authored or
 * greedy — so ANY joint assignment satisfying the two hard marginals is
 * supply-feasible for up to `multiplier` Sets. The optional
 * `cellAdjustments` hook powers the negative tests. questionPattern is NULL
 * on every row (the real TAX-TRO Bank condition).
 */
function buildTroUniformBank(
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
          questionCode: `Q-TRO-${String(seq).padStart(5, '0')}`,
          subject: null,
          document: entry.document,
          // Unique topic per row — keeps L1 (within-set uniqueness) satisfiable.
          topic: `${entry.document} #${lo} #${k}`,
          law: null,
          difficulty: DIFFICULTIES[seq % DIFFICULTIES.length]!,
          status: 'Published',
          blueprintType: TYPE_BY_LO[lo]!,
          learningObjective: lo,
          // The REAL TAX-TRO Bank condition: pattern absent on every row.
          questionPattern: null,
          section: null,
        })
      }
    }
  }
  return rows
}

// ─── Synthetic Bank B: PRODUCTION-SHAPE capacities (680, no extra supply) ───

/**
 * One row per real Production (Document, LO) capacity entry — 680 candidates
 * in total. `cellAdjustments` powers the negative tests. questionPattern is
 * NULL on every row; every question_code is unique.
 */
function buildTroProductionShapeBank(
  cellAdjustments?: (document: string, lo: string, supply: number) => number
): BankMetadataRow[] {
  const rows: BankMetadataRow[] = []
  let seq = 0
  for (const entry of PRODUCTION_SHAPE) {
    LO_ORDER.forEach((lo, loIdx) => {
      const base = entry.loCounts[loIdx]!
      const supply = cellAdjustments ? cellAdjustments(entry.document, lo, base) : base
      for (let k = 1; k <= supply; k++) {
        seq += 1
        rows.push({
          questionCode: `Q-TRO-PROD-${String(seq).padStart(5, '0')}`,
          subject: null,
          document: entry.document,
          topic: `${entry.document} #${lo} #${k}`,
          law: null,
          difficulty: DIFFICULTIES[seq % DIFFICULTIES.length]!,
          status: 'Published',
          blueprintType: TYPE_BY_LO[lo]!,
          learningObjective: lo,
          questionPattern: null,
          section: null,
        })
      }
    })
  }
  return rows
}

/**
 * The 50-question mock Exam Set rows as the Engine sees them after the
 * package-scoped loader projection: linked + Published (so they ARE loaded
 * into the Bank snapshot) but `document` NULL → projected to the empty
 * string. The document filter must reject every one of them.
 */
function buildMockNullDocumentRows(): BankMetadataRow[] {
  const rows: BankMetadataRow[] = []
  for (let k = 1; k <= 50; k++) {
    rows.push({
      questionCode: `Q-TRO-MOCK-${String(k).padStart(3, '0')}`,
      subject: null,
      document: '',
      topic: `mock #${k}`,
      law: null,
      difficulty: DIFFICULTIES[k % DIFFICULTIES.length]!,
      status: 'Published',
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: null,
      section: null,
    })
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
    readBlueprintSource: () => TRO_SOURCE,
    questionBank: new FixedBank(bank),
    observability: { emit: () => undefined },
    createExecutionId: () => 'tax-tro-blueprint-v1-generation',
    nowIso: () => `2026-01-01T00:00:00.${String(iso++).padStart(3, '0')}Z`,
    monotonicTimeMs: () => 0,
    isCancellationRequested: () => false,
  }
}

function troRequest(targetSetCount: 1 | 2 | 3): EngineRequest {
  return {
    blueprint: { id: 'revenue-academic-officer', version: '3.0.0' },
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
      requestedBy: 'tax-tro-blueprint-v1-generation',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'tax-tro-blueprint-v1-generation',
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
    // EXACT per-Document physical quotas (all 9 authoritative targets).
    for (const entry of ALLOCATION) {
      assert.equal(
        docCounts.get(entry.document) ?? 0,
        entry.perSet,
        `Set ${setNumber} document quota: ${entry.document}`
      )
    }
    assert.equal(docCounts.size, 9, `Set ${setNumber}: every one of the 9 Documents is drawn from`)
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

// ─── 1. GENEROUS 1 Set × 100 — exact quotas ────────────────────────────────

function verifies_generous_1_set_x_100_exact_document_and_lo_quotas(): void {
  const rows = buildTroUniformBank()
  const result = runEngine(troRequest(1), engineDeps(rows))

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
  const again = runEngine(troRequest(1), engineDeps(rows))
  assert.deepEqual(
    again.allocatedCandidateSet!.placements.map((p) =>
      p.state === 'allocated' ? p.assignedCandidate.code : p.state
    ),
    allocation.placements.map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : p.state))
  )
}

// ─── 2. GENEROUS 2 Sets × 100 — exact quotas per Set + uniqueness ───────────

function verifies_generous_2_sets_x_100_exact_quotas_per_set(): void {
  const rows = buildTroUniformBank()
  const result = runEngine(troRequest(2), engineDeps(rows))

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

// ─── 3. PRODUCTION-SHAPE 1 Set × 100 — joint feasibility proof ──────────────

function verifies_production_shape_1_set_x_100_joint_feasible(): void {
  const rows = buildTroProductionShapeBank()
  assert.equal(rows.length, 680, 'the production-shape Bank carries exactly 680 candidates')
  assert.equal(new Set(rows.map((r) => r.questionCode)).size, 680, 'every question_code unique')

  const result = runEngine(troRequest(1), engineDeps(rows))

  assert.equal(result.status, 'Completed', 'the real Production capacity shape must be 1×100-feasible')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero unresolved hard conflicts: ${JSON.stringify(result.errors).slice(0, 400)}`
  )
  const allocation = result.allocatedCandidateSet
  assert.ok(allocation, 'Solver must allocate')
  assert.equal(allocation.feasibility, 'feasible', 'no unresolved allocation conflict')
  assertExactQuotas(result, 1)
}

// ─── 4. PRODUCTION-SHAPE 2 Sets × 100 — joint feasibility proof ────────────

function verifies_production_shape_2_sets_x_100_joint_feasible(): void {
  const rows = buildTroProductionShapeBank()
  const result = runEngine(troRequest(2), engineDeps(rows))

  assert.equal(result.status, 'Completed', 'the real Production capacity shape must be 2×100-feasible')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero unresolved hard conflicts: ${JSON.stringify(result.errors).slice(0, 400)}`
  )
  const allocation = result.allocatedCandidateSet
  assert.ok(allocation, 'Solver must allocate both Sets')
  assert.equal(allocation.feasibility, 'feasible')
  // Each Set: exact Document quotas + exact LO 28/22/23/27; 200 distinct codes.
  assertExactQuotas(result, 2)
  const codes = allocation.placements
    .filter((p) => p.state === 'allocated')
    .map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : ''))
  assert.equal(codes.length, 200)
  assert.equal(new Set(codes).size, 200, '200 distinct question_code across the whole run')
  // Every drawn candidate belongs to the production-shape Bank (no phantom supply).
  const bankCodes = new Set(rows.map((r) => r.questionCode))
  for (const code of codes) {
    assert.ok(bankCodes.has(code), `placed code ${code} must come from the 680-row Bank`)
  }
}

// ─── 5. PRODUCTION-SHAPE 3 Sets × 100 — EXPECTED UNSUPPORTED ────────────────

function verifies_production_shape_3_sets_x_100_expected_unsupported(): void {
  // Known raw Document limit: the เศรษฐกิจ สังคม และเทคโนโลยี target is 30/Set
  // against an 80-question supply (3 × 30 = 90 > 80). The current real-shape
  // Bank cannot support 3×100 with cross-set uniqueness — EXPECTED, not a bug.
  const rows = buildTroProductionShapeBank()
  const result = runEngine(troRequest(3), engineDeps(rows))

  assert.notEqual(result.status, 'Completed', '3×100 must NOT complete against the 680-row real-shape Bank')
  const fatals = result.errors.filter((e) => e.severity === 'fatal')
  assert.ok(fatals.length > 0, 'the document-capacity ceiling must fail LOUD')
  assert.ok(
    fatals.some((e) => e.explanation.includes('of exactly 100 required Question placements')),
    `the per-Set quantity invariant must fire: ${JSON.stringify(fatals).slice(0, 400)}`
  )
  // No partial result, no reuse, no relaxed quotas.
  assert.equal(result.allocatedCandidateSet, null, 'no partial allocation may be emitted for 3×100')
}

// ─── 6. degraded pattern semantics unchanged ────────────────────────────────

function verifies_pattern_null_degraded_semantics_unchanged(): void {
  const rows = buildTroProductionShapeBank()
  const result = runEngine(troRequest(1), engineDeps(rows))
  assert.equal(
    result.candidateSet!.patternAvailability,
    'UNAVAILABLE',
    'question_pattern universal-NULL stays degraded/advisory, never fatal'
  )
  const resultText = JSON.stringify({ errors: result.errors, warnings: result.warnings })
  assert.equal(resultText.includes('absent from every Bank row'), false)
  assert.equal(resultText.includes('question_pattern'), false)
}

// ─── 7. document-NULL mock rows can never fulfill the 9 quotas ──────────────

function verifies_mock_document_null_rows_never_placed(): void {
  // The 50-question mock Exam Set IS linked + Published, so the package-scoped
  // loader DOES load its rows — projected to the empty-string document (the
  // loader's NULL → '' bridge). The document filter must reject every one:
  // they can never fill any of the 9 permitted Document quotas, and their
  // presence must not change the exact allocation.
  const rows = [...buildTroProductionShapeBank(), ...buildMockNullDocumentRows()]
  assert.equal(rows.length, 730, '680 production-shape rows + 50 document-NULL mock rows')
  const result = runEngine(troRequest(2), engineDeps(rows))

  assert.equal(result.status, 'Completed', 'mock rows must not break the 2×100 run')
  assert.equal(
    result.errors.filter((e) => e.severity === 'fatal').length,
    0,
    `zero fatals: ${JSON.stringify(result.errors).slice(0, 400)}`
  )
  assertExactQuotas(result, 2)
  const placedCodes = new Set(
    result.allocatedCandidateSet!.placements
      .filter((p) => p.state === 'allocated')
      .map((p) => (p.state === 'allocated' ? p.assignedCandidate.code : ''))
  )
  for (const mock of buildMockNullDocumentRows()) {
    assert.equal(
      placedCodes.has(mock.questionCode),
      false,
      `document-NULL mock row ${mock.questionCode} must never be placed`
    )
  }
}

// ─── 8. NEGATIVE: a Document whose TOTAL supply is below its quota ──────────

function verifies_document_shortfall_fails_loud(): void {
  // ความรู้เบื้องต้นเกี่ยวกับภาษีอากร demands quota 5 but its whole supply is 0
  // (every LO cell zeroed) — NO joint assignment can satisfy the Document
  // marginal, under ANY Document×LO choice.
  const shortDoc = ALLOCATION[0]!.document
  const rows = buildTroUniformBank((document, _lo, supply) =>
    document === shortDoc ? 0 : supply
  )
  const result = runEngine(troRequest(1), engineDeps(rows))

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

// ─── 9. NEGATIVE: truly impossible joint supply ─────────────────────────────

function verifies_impossible_joint_supply_fails_loud(): void {
  // LO2 (target 22) is reachable ONLY through ความรู้เบื้องต้นเกี่ยวกับภาษีอากร
  // — whose quota is 5 < 22. Both marginals are individually plausible, but
  // NO joint Document×LO assignment exists: the max-flow cannot saturate, and
  // the run must fail closed (never a partial Set).
  const onlyDoc = ALLOCATION[0]!.document
  const rows = buildTroUniformBank((document, lo, supply) =>
    lo === 'LO2' && document !== onlyDoc ? 0 : supply
  )
  const result = runEngine(troRequest(1), engineDeps(rows))

  assert.equal(result.allocatedCandidateSet, null, 'no allocation may be emitted')
  const fatals = result.errors.filter((e) => e.severity === 'fatal')
  assert.ok(fatals.length > 0, 'the impossible joint supply must fail LOUD')
  assert.ok(
    fatals.some((e) => e.explanation.includes('of exactly 100 required Question placements')),
    'the per-Set quantity invariant must fire'
  )
}

// ─── 10. NEGATIVE: no quantified-physical declaration → legacy behavior ─────

function verifies_legacy_mode_without_declaration(): void {
  const legacySource = TRO_SOURCE.replace(
    ' | **Document Allocation**: quantified-physical',
    ''
  )
  assert.notEqual(legacySource, TRO_SOURCE, 'the declaration must have been stripped')
  const rows = buildTroUniformBank()
  const deps: EngineRuntimeDependencies = {
    ...engineDeps(rows),
    readBlueprintSource: () => legacySource,
  }
  const result = runEngine(troRequest(1), deps)

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
  { name: 'GENEROUS 1×100: document quotas EXACT 5/10/10/10/5/15/30/7/8 + LO 28/22/23/27 + 100 distinct', fn: verifies_generous_1_set_x_100_exact_document_and_lo_quotas },
  { name: 'GENEROUS 2×100: exact quotas in EVERY Set + 200 distinct codes (cross-set uniqueness)', fn: verifies_generous_2_sets_x_100_exact_quotas_per_set },
  { name: 'PRODUCTION-SHAPE 1×100: Completed/feasible + exact Document quotas + exact LO 28/22/23/27 (680-row capacity matrix)', fn: verifies_production_shape_1_set_x_100_joint_feasible },
  { name: 'PRODUCTION-SHAPE 2×100: per-Set exact Document quotas + LO + 200 distinct codes (680-row capacity matrix)', fn: verifies_production_shape_2_sets_x_100_joint_feasible },
  { name: 'PRODUCTION-SHAPE 3×100: EXPECTED UNSUPPORTED (เศรษฐกิจ สังคม และเทคโนโลยี capacity 80 < 90) — fails closed loudly, no partial result', fn: verifies_production_shape_3_sets_x_100_expected_unsupported },
  { name: 'question_pattern universal-NULL degraded semantics unchanged (advisory, never fatal)', fn: verifies_pattern_null_degraded_semantics_unchanged },
  { name: 'document-NULL mock rows (50) never placed and never fulfill the 9 quotas — 2×100 stays exact', fn: verifies_mock_document_null_rows_never_placed },
  { name: 'NEGATIVE: Document total supply below quota → FAILS CLOSED (loud per-Set fatal)', fn: verifies_document_shortfall_fails_loud },
  { name: 'NEGATIVE: truly impossible joint supply (LO2 capacity 5 < target 22) → FAILS CLOSED', fn: verifies_impossible_joint_supply_fails_loud },
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
