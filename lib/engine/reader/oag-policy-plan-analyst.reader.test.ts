/**
 * lib/engine/reader/oag-policy-plan-analyst.reader.test.ts
 * ----------------------------------------------------------------------------
 * OAG Blueprint V1 (oag-policy-plan-analyst@3.0.0) — Reader/contract tests.
 *
 * Drives the REAL repository Blueprint source
 * (Blueprint/oag_policy_plan_analyst_blueprint.md) through the REAL Reader
 * pipeline (Stage 1 Loader → Stage 2 Schema → Stage 3 Metadata → Stage 5 AST
 * Projection → Stage 6 AssemblyRequest Builder) and pins the V1 invariants:
 *
 *   1. exact Blueprint id/version accepted (schema major 3 — the current
 *      convention; position id doubles as Blueprint id)
 *   2. target.perSet = 100, sets = 5
 *   3. all 11 Documents present in the closed Document Registry, id === name
 *   4. Registry names are BYTE-EXACT vs the OAG Bank surface (no
 *      normalization — including the decomposed Thai SARA AM sequences
 *      U+0E4D U+0E32, which must NOT be recomposed to U+0E33)
 *   5. per-Document per-Set targets are the authoritative 11-row allocation,
 *      each Set sums to 100, grand total = 500
 *   6. the PRODUCT-DECISION LO distribution is authored as quantified targets
 *      (LO1 40 / LO2 30 / LO3 15 / LO4 15, sum 100 — the OAG authoring
 *      convention, NOT a live-bank measurement); no Pattern distribution
 *      targets authored, no Difficulty/Type distributions
 *   7. CR-1 binding empty; CR-4 minimum = 5; anchor bonus = 0
 *   8. determinism: byte-identical source → identical AssemblyRequest
 *
 * RUN: npx jiti lib/engine/reader/oag-policy-plan-analyst.reader.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { loadBlueprint } from './loader'
import { validateSchema } from './schema-validator'
import { validateMetadata } from './metadata-validator'
import { normalizeMetadata } from './normalizer'
import { projectToBlueprintAst } from './ast-projection'
import { buildAssemblyRequest } from './assembly-request-builder'
import type { BlueprintAst } from './blueprint-ast'
import type { AssemblyRequest } from './contracts'

const OAG_SOURCE = readFileSync(
  new URL('../../../Blueprint/oag_policy_plan_analyst_blueprint.md', import.meta.url),
  'utf8'
)

// ─── Authoritative V1 allocation (Document Code Intake audit, exact strings) ─

/**
 * The 11 exact stored Document strings and their authoritative per-Set
 * targets. These are copied byte-for-byte from the OAG Bank surface
 * (exam_sets.document / questions.document of package OAG-PPA-2026-V10).
 * Rows 5, 9 use DECOMPOSED Thai SARA AM (U+0E4D U+0E32) — do not "fix" them.
 */
const AUTHORITATIVE_ALLOCATION: ReadonlyArray<{ readonly document: string; readonly perSet: number; readonly tier: 1 | 2 | 3 | 4 }> = [
  { document: 'พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561', perSet: 18, tier: 1 },
  { document: 'พ.ร.บ. วินัยการเงินการคลังของรัฐ พ.ศ. 2561', perSet: 13, tier: 1 },
  { document: 'พ.ร.บ.วิธีการงบประมาณ พ.ศ. 2561 และที่แก้ไขเพิ่มเติม', perSet: 9, tier: 2 },
  { document: 'พ.ร.ฎ.ว่าด้วยหลักเกณฑ์และวิธีการบริหารกิจการบ้านเมืองที่ดี พ.ศ. 2546', perSet: 9, tier: 2 },
  { document: 'ประกาศ คตง. ข้อกําหนดจริยธรรมเจ้าหน้าที่และบุคลากรอื่นของสํานักงานการตรวจเงินแผ่นดิน', perSet: 5, tier: 4 },
  { document: 'ยุทธศาสตร์ชาติ พ.ศ. 2561 - 2580', perSet: 9, tier: 2 },
  { document: 'แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ ฉบับที่ 13', perSet: 7, tier: 3 },
  { document: 'ประกาศ คตง. เรื่อง นโยบายการตรวจเงินแผ่นดิน (พ.ศ. 2566 - 2570)', perSet: 6, tier: 3 },
  { document: 'แผนปฏิบัติราชการ สตง. ระยะ 5 ปี พ.ศ. 2566 - 2570', perSet: 9, tier: 3 },
  { document: 'ความรู้เกี่ยวกับนโยบายสาธารณะ', perSet: 5, tier: 4 },
  { document: 'ความรู้เกี่ยวกับการวางแผนยุทธศาสตร์', perSet: 10, tier: 2 },
]

// ─── pipeline harness ───────────────────────────────────────────────────────

function runFullPipeline(source: string): { ast: BlueprintAst; request: AssemblyRequest } {
  const loaded = loadBlueprint(source)
  assert.equal(loaded.ok, true, `Stage 1 must load the source: ${loaded.ok ? '' : loaded.message}`)
  const doc = loaded.ok ? loaded.document : null
  assert.ok(doc)

  const schemaErrors = validateSchema(doc)
  assert.equal(
    schemaErrors.filter((e) => e.severity === 'blocking' || e.severity === 'fatal').length,
    0,
    `Stage 2 blocking schema errors: ${JSON.stringify(schemaErrors)}`
  )

  const metadataErrors = validateMetadata(doc)
  assert.equal(
    metadataErrors.filter((e) => e.severity === 'blocking' || e.severity === 'fatal').length,
    0,
    `Stage 3 blocking metadata errors: ${JSON.stringify(metadataErrors)}`
  )

  const canonicalMeta = normalizeMetadata(doc.metadata)
  const ast = projectToBlueprintAst(doc, canonicalMeta)
  const result = buildAssemblyRequest(ast, canonicalMeta)
  assert.equal(result.ok, true, `Stage 6 must build the AssemblyRequest: ${result.ok ? '' : result.message}`)
  const request = result.ok ? result.request : null
  assert.ok(request)
  return { ast, request }
}

// ─── 1. identity ────────────────────────────────────────────────────────────

function verifies_identity_and_version_convention(): void {
  const { request } = runFullPipeline(OAG_SOURCE)
  assert.equal(request.identity.blueprint_id, 'oag-policy-plan-analyst')
  assert.equal(request.identity.blueprint_version, '3.0.0')
  assert.equal(request.identity.profile, 'simulation')
}

// ─── 2. run target ──────────────────────────────────────────────────────────

function verifies_target_per_set_100(): void {
  const { request } = runFullPipeline(OAG_SOURCE)
  assert.equal(request.target.sets, 5)
  assert.equal(request.target.perSet, 100)
}

// ─── 3+4. document registry — all 11, byte-exact ────────────────────────────

function verifies_registry_contains_all_11_byte_exact(): void {
  const { request } = runFullPipeline(OAG_SOURCE)
  assert.equal(request.documentRegistry.length, 11)
  for (const entry of AUTHORITATIVE_ALLOCATION) {
    const found = request.documentRegistry.find((d) => d.id === entry.document)
    assert.ok(found, `registry must contain byte-exact: ${entry.document}`)
    assert.equal(found.name, entry.document, 'registry name must equal the exact stored string')
    assert.equal(found.id, found.name, 'v3.0 convention: id === name')
    assert.equal(found.tier, entry.tier, `tier for ${entry.document}`)
  }
}

function verifies_registry_preserves_decomposed_sara_am(): void {
  // The จริยธรรม document uses decomposed SARA AM (U+0E4D U+0E32) in the Bank.
  // A normalization pass would recompose it to U+0E33 — that must NOT happen.
  const { request } = runFullPipeline(OAG_SOURCE)
  const ethics = request.documentRegistry.find((d) => d.id.includes('จริยธรรม'))
  assert.ok(ethics, 'the ethics document must be registered')
  assert.ok(
    ethics.id.includes('\u0e4d\u0e32'),
    'decomposed SARA AM (U+0E4D U+0E32) must be preserved verbatim'
  )
  assert.equal(
    /กำ/.test(ethics.id),
    false,
    'the recomposed form (U+0E33) must NOT appear in the stored name'
  )
}

// ─── 5. per-document per-set allocation ─────────────────────────────────────

function verifies_allocation_targets_sum_100_per_set(): void {
  const { ast } = runFullPipeline(OAG_SOURCE)
  assert.equal(ast.documentSetCounts.length, 11 * 5, '11 documents × 5 sets of authored counts')
  for (const setNumber of [1, 2, 3, 4, 5] as const) {
    const perSet = ast.documentSetCounts.filter((c) => c.setNumber === setNumber)
    assert.equal(perSet.length, 11, `set ${setNumber} must allocate all 11 documents`)
    const sum = perSet.reduce((s, c) => s + c.count, 0)
    assert.equal(sum, 100, `set ${setNumber} document target sum must be 100`)
  }
  // Every document's per-set count matches the authoritative target on every set.
  for (const entry of AUTHORITATIVE_ALLOCATION) {
    for (const setNumber of [1, 2, 3, 4, 5] as const) {
      const cell = ast.documentSetCounts.find(
        (c) => c.documentName === entry.document && c.setNumber === setNumber
      )
      assert.ok(cell, `master table cell for ${entry.document} S${setNumber}`)
      assert.equal(cell.count, entry.perSet, `${entry.document} S${setNumber}`)
    }
  }
}


// ─── 5b. quantified document quotas survive Stage 6 (Document Quota Closure)

function verifies_document_quotas_survive_stage_6(): void {
  const { request } = runFullPipeline(OAG_SOURCE)
  const quotas = request.documentQuotas ?? []
  assert.equal(quotas.length, 11 * 5, 'one quota cell per Document per Set')
  for (const setNumber of [1, 2, 3, 4, 5] as const) {
    const perSet = quotas.filter((q) => q.setNumber === setNumber)
    assert.equal(perSet.length, 11, `Set ${setNumber}: 11 quota entries`)
    const sum = perSet.reduce((acc, q) => acc + q.count, 0)
    assert.equal(sum, 100, `Set ${setNumber}: quota sum must equal target.perSet`)
  }
  for (const entry of AUTHORITATIVE_ALLOCATION) {
    for (const setNumber of [1, 2, 3, 4, 5] as const) {
      const cell = quotas.find((q) => q.document === entry.document && q.setNumber === setNumber)
      assert.ok(cell, `quota cell for ${entry.document} S${setNumber}`)
      assert.equal(cell.count, entry.perSet, `${entry.document} S${setNumber} quota`)
    }
  }
}

// ─── 5c. NEGATIVE B: authored quota sum ≠ perSet refuses the build ──────────

function verifies_neg_b_quota_sum_mismatch_fails_build(): void {
  // Bump ONE authored Master-Table cell (18 → 19): the Set-1 sum becomes 101.
  const brokenSource = OAG_SOURCE.replace(
    'พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561 | 18 |',
    'พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561 | 19 |'
  )
  assert.notEqual(brokenSource, OAG_SOURCE, 'the Master-Table cell must have been mutated')

  const loaded = loadBlueprint(brokenSource)
  assert.equal(loaded.ok, true)
  const doc = loaded.ok ? loaded.document : null
  assert.ok(doc)
  const canonicalMeta = normalizeMetadata(doc.metadata)
  const ast = projectToBlueprintAst(doc, canonicalMeta)
  const result = buildAssemblyRequest(ast, canonicalMeta)
  assert.equal(result.ok, false, 'the build must refuse a quota sum != perSet')
  assert.equal(
    result.ok ? '' : result.code,
    'invalid_document_quotas',
    'the failure must be the document-quota validation'
  )
  assert.match(
    result.ok ? '' : result.message,
    /Set 1 sum to 101, not target\.perSet \(100\)/,
    'the message must name the offending Set and both sums'
  )
}

// ─── 5d. quantified-physical V1: uniform per-Set quota vectors ──────────────

/**
 * Run the full Reader pipeline (Stage 1 → Stage 6) with optional Stage 6
 * build options (e.g. a reduced targetSetCount).
 */
function buildRequestFromSource(
  source: string,
  options?: { readonly targetSetCount?: number | null }
): ReturnType<typeof buildAssemblyRequest> {
  const loaded = loadBlueprint(source)
  assert.equal(loaded.ok, true, `Stage 1 must load the source: ${loaded.ok ? '' : loaded.message}`)
  const doc = loaded.ok ? loaded.document : null
  assert.ok(doc)
  const schemaErrors = validateSchema(doc)
  assert.equal(
    schemaErrors.filter((e) => e.severity === 'blocking' || e.severity === 'fatal').length,
    0,
    `Stage 2 blocking schema errors: ${JSON.stringify(schemaErrors)}`
  )
  const metadataErrors = validateMetadata(doc)
  assert.equal(
    metadataErrors.filter((e) => e.severity === 'blocking' || e.severity === 'fatal').length,
    0,
    `Stage 3 blocking metadata errors: ${JSON.stringify(metadataErrors)}`
  )
  const canonicalMeta = normalizeMetadata(doc.metadata)
  const ast = projectToBlueprintAst(doc, canonicalMeta)
  return buildAssemblyRequest(ast, canonicalMeta, options)
}

/** A non-uniform-but-summing-100 mutation: Set 2 doc1 18→17, doc2 13→14. */
function nonUniformMasterTableSource(): string {
  const mutated = OAG_SOURCE
    .replace(
      'พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561 | 18 | 18 |',
      'พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561 | 18 | 17 |'
    )
    .replace(
      '2. พ.ร.บ. วินัยการเงินการคลังของรัฐ พ.ศ. 2561 | 13 | 13 |',
      '2. พ.ร.บ. วินัยการเงินการคลังของรัฐ พ.ศ. 2561 | 13 | 14 |'
    )
  assert.notEqual(mutated, OAG_SOURCE, 'the Master-Table Set-2 cells must have been mutated')
  return mutated
}

function verifies_reduced_targets_keep_uniform_quota_vectors(): void {
  // The OAG Master Table authors the SAME quota vector for every Set; reduced
  // executable targets (Stage 6 target.sets behavior) must keep passing the
  // uniformity guard and carry identical vectors.
  for (const targetSetCount of [2, 3] as const) {
    const result = buildRequestFromSource(OAG_SOURCE, { targetSetCount })
    assert.equal(result.ok, true, `targetSetCount ${targetSetCount} must build`)
    if (!result.ok) continue
    assert.equal(result.request.target.sets, targetSetCount)
    const quotas = result.request.documentQuotas ?? []
    assert.ok(quotas.length > 0, 'quantified quotas must be carried')
    const vectorOf = (setNumber: number): Map<string, number> =>
      new Map(
        quotas
          .filter((q) => q.setNumber === setNumber)
          .map((q) => [q.document, q.count] as const)
      )
    const first = vectorOf(1)
    for (const setNumber of [1, 2, 3, 4, 5] as const) {
      const vector = vectorOf(setNumber)
      assert.equal(vector.size, 11, `Set ${setNumber}: 11 quota entries`)
      for (const [document, count] of first) {
        assert.equal(
          vector.get(document),
          count,
          `Set ${setNumber} must carry Set 1's per-Document quota for ${document}`
        )
      }
    }
  }
}

function verifies_non_uniform_per_set_quotas_refused(): void {
  // Every Set still sums to exactly 100, but Set 2's vector differs from
  // Set 1's — quantified-physical V1 supports only uniform per-Set vectors.
  const result = buildRequestFromSource(nonUniformMasterTableSource())
  assert.equal(result.ok, false, 'non-uniform per-Set quotas must be refused')
  if (result.ok) return
  assert.equal(result.code, 'invalid_document_quotas')
  assert.match(result.message, /Set 2 differ from Set 1/)
  assert.match(result.message, /SAME per-Document quota vector/)
  assert.match(result.message, /14 versus 13/)
}

function verifies_non_uniform_table_without_declaration_stays_advisory(): void {
  // The same non-uniform Master Table WITHOUT the quantified-physical
  // declaration keeps the historical advisory treatment — legacy unchanged.
  const legacySource = nonUniformMasterTableSource().replace(
    ' | **Document Allocation**: quantified-physical',
    ''
  )
  assert.notEqual(legacySource, OAG_SOURCE)
  const result = buildRequestFromSource(legacySource)
  assert.equal(result.ok, true, 'legacy Blueprint must build despite non-uniform counts')
  if (!result.ok) return
  assert.equal(result.request.documentQuotas ?? null, null)
}

// ─── 6. authored LO distribution (product decision) ────────────────────────

/**
 * The authoritative V1 LO distribution — a PRODUCT DECISION following the OAG
 * Question authoring convention (Memory 40 / Concept 30 / Procedure 15 /
 * Scenario 15). NOT measured from the live OAG Bank; live-bank feasibility
 * still requires Preview QA.
 */
const AUTHORITATIVE_LO: ReadonlyArray<{
  readonly lo: 'LO1' | 'LO2' | 'LO3' | 'LO4'
  readonly min: number
  readonly max: number
  readonly target: number
}> = [
  { lo: 'LO1', min: 35, max: 45, target: 40 },
  { lo: 'LO2', min: 25, max: 35, target: 30 },
  { lo: 'LO3', min: 10, max: 20, target: 15 },
  { lo: 'LO4', min: 10, max: 20, target: 15 },
]

function verifies_authored_lo_distribution_40_30_15_15(): void {
  const { ast, request } = runFullPipeline(OAG_SOURCE)
  // LO vocabulary intact (1:1 LO ↔ Blueprint Type correspondence).
  assert.equal(ast.loDefinitions.length, 4, 'LO vocabulary (LO1–LO4) must be defined')
  // The product-decision LO distribution is authored as quantified targets.
  assert.equal(ast.loDistributionTargets.length, 4, 'V1 authors one LO distribution row per LO')
  for (const entry of AUTHORITATIVE_LO) {
    const row = ast.loDistributionTargets.find((t) => t.lo === entry.lo)
    assert.ok(row, `${entry.lo} distribution row must be projected`)
    assert.equal(row.minPercent, entry.min, `${entry.lo} authored range min`)
    assert.equal(row.maxPercent, entry.max, `${entry.lo} authored range max`)
    assert.equal(row.targetPercent, entry.target, `${entry.lo} authored Target`)
    assert.equal(
      row.authoredTargetInvalidReason,
      undefined,
      `${entry.lo} Target must be valid (inside its authored range)`
    )
    assert.equal(request.loDistribution.targets[entry.lo], entry.target, `AssemblyRequest ${entry.lo} target`)
  }
  const loSum =
    request.loDistribution.targets.LO1 +
    request.loDistribution.targets.LO2 +
    request.loDistribution.targets.LO3 +
    request.loDistribution.targets.LO4
  assert.equal(loSum, 100, 'LO targets must sum to 100 (Solver contract)')
  // Pattern: vocabulary only, no distribution targets authored.
  assert.ok(ast.patternDefinitions.length > 0, 'pattern vocabulary must be present')
  assert.equal(ast.patternDistributionTargets.length, 0, 'V1 must not author pattern targets')
  // Difficulty / Blueprint Type per-set distributions: not authored.
  assert.equal(ast.difficultySetCounts.length, 0, 'no difficulty distribution in V1')
  assert.equal(ast.blueprintTypeSetCounts.length, 0, 'no blueprint-type distribution in V1')
}

// ─── 7. coverage rules + constraints ────────────────────────────────────────

function verifies_coverage_rules_and_constraints(): void {
  const { request } = runFullPipeline(OAG_SOURCE)
  const cr1 = request.coverageRules.find((r) => r.id === 'CR-1')
  assert.ok(cr1, 'CR-1 must be projected')
  const cr1Binding = cr1.binding as { kind: string; mandatoryTopics: ReadonlyArray<unknown> }
  assert.equal(cr1Binding.mandatoryTopics.length, 0, 'CR-1 binding must be empty in V1')

  const cr4 = request.coverageRules.find((r) => r.id === 'CR-4')
  assert.ok(cr4, 'CR-4 must be projected')
  assert.equal(
    (cr4.binding as { kind: string; minPerDocumentPerSet: number }).minPerDocumentPerSet,
    5,
    'CR-4 minimum derives from the smallest authoritative target (5)'
  )

  assert.equal(request.distributionConstraints.sumPerSet, 100)
  assert.equal(request.distributionConstraints.tier1Floor, 31, 'tier-1 floor = 18 + 13 from V1')
  assert.ok(request.distributionConstraints.anchor, 'anchor rule must be present')
  assert.equal(request.distributionConstraints.anchor!.bonus, 0, 'V1 declares no anchor bonus')
  // All 5 coverage rules present in canonical order.
  assert.deepEqual(
    request.coverageRules.map((r) => r.id),
    ['CR-1', 'CR-2', 'CR-3', 'CR-4', 'CR-5']
  )
}

// ─── 8. determinism ─────────────────────────────────────────────────────────

function verifies_reader_determinism(): void {
  const a = runFullPipeline(OAG_SOURCE)
  const b = runFullPipeline(OAG_SOURCE)
  assert.deepEqual(a.request, b.request, 'same bytes → identical AssemblyRequest')
  assert.deepEqual(a.ast, b.ast, 'same bytes → identical Blueprint AST')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'identity: oag-policy-plan-analyst@3.0.0 accepted (schema major 3)', fn: verifies_identity_and_version_convention },
  { name: 'target.perSet = 100, sets = 5', fn: verifies_target_per_set_100 },
  { name: 'registry: all 11 documents, byte-exact, id === name, tiers as authored', fn: verifies_registry_contains_all_11_byte_exact },
  { name: 'registry: decomposed SARA AM preserved (no normalization)', fn: verifies_registry_preserves_decomposed_sara_am },
  { name: 'allocation: authoritative targets, every Set sums to 100', fn: verifies_allocation_targets_sum_100_per_set },
  { name: 'authored LO distribution targets 40/30/15/15 (product decision), no pattern/difficulty/type targets', fn: verifies_authored_lo_distribution_40_30_15_15 },
  { name: 'quantified document quotas survive Stage 6 (55 cells, sum 100 per Set)', fn: verifies_document_quotas_survive_stage_6 },
  { name: 'NEGATIVE B: authored quota sum != perSet → build refused (invalid_document_quotas)', fn: verifies_neg_b_quota_sum_mismatch_fails_build },
  { name: 'quantified-physical V1: reduced targets (2/3 Sets) keep uniform quota vectors', fn: verifies_reduced_targets_keep_uniform_quota_vectors },
  { name: 'NEGATIVE E: non-uniform per-Set quota vectors (each Set sums 100) → build refused (invalid_document_quotas)', fn: verifies_non_uniform_per_set_quotas_refused },
  { name: 'NEGATIVE F: non-uniform Master Table without declaration stays advisory (legacy unchanged)', fn: verifies_non_uniform_table_without_declaration_stays_advisory },
  { name: 'coverage rules: empty CR-1, CR-4 = 5, tier-1 floor 31, anchor 0', fn: verifies_coverage_rules_and_constraints },
  { name: 'determinism: byte-identical source → identical output', fn: verifies_reader_determinism },
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
