/**
 * lib/engine/reader/opsmoac-policy-plan-analyst.reader.test.ts
 * ----------------------------------------------------------------------------
 * SPKS Blueprint V1 (opsmoac-policy-plan-analyst@3.0.0) — Reader/contract tests.
 *
 * Drives the REAL repository Blueprint source
 * (Blueprint/opsmoac_policy_plan_analyst_blueprint.md) through the REAL Reader
 * pipeline (Stage 1 Loader → Stage 2 Schema → Stage 3 Metadata → Stage 5 AST
 * Projection → Stage 6 AssemblyRequest Builder) and pins the V1 invariants:
 *
 *   1. exact Blueprint id/version accepted (schema major 3 — the current
 *      convention; position id doubles as Blueprint id)
 *   2. registry binding: the source file under test IS the file registered for
 *      package OPSMOAC-PPA-2026-V10 (id/version/packageCode all pinned)
 *   3. Document Allocation = quantified-physical (hard physical quotas carried)
 *   4. target.perSet = 100, sets = 5
 *   5. all 21 Documents present in the closed Document Registry, id === name
 *      (NO DocumentCode dependency — v3.0 name identity only)
 *   6. Registry names are BYTE-EXACT vs the SPKS Bank surface (no
 *      normalization — including the composed Thai SARA AM (U+0E33) in
 *      documents 12/17, which must NOT be decomposed)
 *   7. per-Document per-Set targets are the authoritative 21-row allocation,
 *      every Set sums to 100, grand total = 500, and every Set carries the
 *      SAME quota vector (quantified-physical V1 uniform-marginals invariant)
 *   8. the PRODUCT-DECISION LO distribution is authored as quantified targets
 *      (LO1 35 / LO2 30 / LO3 20 / LO4 15, sum 100 — the SPKS V1 product
 *      decision, NOT a live-bank measurement, NOT copied from OAG/KSB); no
 *      Pattern distribution targets authored, no Difficulty/Type distributions
 *   9. NEGATIVE: mutating one Master-Table cell so a Set sums to 101 is
 *      refused fail-closed (invalid_document_quotas)
 *  10. determinism: byte-identical source → identical AssemblyRequest
 *
 * RUN: npx jiti lib/engine/reader/opsmoac-policy-plan-analyst.reader.test.ts
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
import { ADMIN_ASSESSMENT_BLUEPRINTS } from '../../../app/admin/generate/config'
import type { BlueprintAst } from './blueprint-ast'
import type { AssemblyRequest } from './contracts'

const SPKS_SOURCE = readFileSync(
  new URL('../../../Blueprint/opsmoac_policy_plan_analyst_blueprint.md', import.meta.url),
  'utf8'
)

// ─── Authoritative V1 allocation (SPKS Bank audit, exact strings) ────────────

/**
 * The 21 exact stored Document strings and their authoritative per-Set
 * targets. These are copied byte-for-byte from the SPKS Bank surface
 * (questions.document of package OPSMOAC-PPA-2026-V10). Do NOT normalize,
 * abbreviate, respell, or re-space any of them.
 */
const AUTHORITATIVE_ALLOCATION: ReadonlyArray<{ readonly document: string; readonly perSet: number; readonly tier: 1 | 2 | 3 | 4 }> = [
  { document: "แนวโน้มภาคเกษตรกรรมไทยและโลก ในปัจจุบัน", perSet: 9, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "แผนปฏิบัติราชการของ สป.กษ. 5 ปี พ.ศ. 2566 - 2570", perSet: 7, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "แนวทางการเขียนโครงการของ สป.กษ.", perSet: 7, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "ยุทธศาสตร์ชาติ พ.ศ. 2561 - 2580", perSet: 4, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "5 นโยบายหลัก เกษตรนวัตกรรม เพื่อความยั่งยืนเกษตรกรไทย", perSet: 6, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.วินัยการเงินการคลังของรัฐ พ.ศ. 2561", perSet: 6, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.วิธีการงบประมาณ พ.ศ. 2561 และที่แก้ไขเพิ่มเติม", perSet: 6, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "การบริหารโครงการ หลักการ วงจร การควบคุม และการประเมินผล", perSet: 6, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.ส่งเสริมและพัฒนาระบบเกษตรพันธสัญญา พ.ศ. 2560 และกฎหมายที่เกี่ยวข้อง", perSet: 6, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "แผนปฏิบัติการด้านการเกษตรและสหกรณ์ ระยะ 5 ปี พ.ศ. 2566 - 2570", perSet: 5, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "แผนปฏิบัติราชการของกระทรวงเกษตรและสหกรณ์ ระยะ 5 ปี พ.ศ. 2566 - 2570", perSet: 5, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "กฎกระทรวงแบ่งส่วนราชการสำนักงานปลัดกระทรวงเกษตรและสหกรณ์", perSet: 5, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "ความรู้เกี่ยวกับ สป.กษ.", perSet: 5, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 และที่แก้ไขเพิ่มเติม", perSet: 4, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "แผนแม่บทภายใต้ยุทธศาสตร์ชาติ ประเด็นการเกษตร", perSet: 4, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "แผนปฏิบัติราชการ พ.ศ. 2570 ของกระทรวงเกษตรและสหกรณ์", perSet: 3, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "แผนปฏิบัติราชการรายปี พ.ศ. 2570 สำนักงานปลัดกระทรวงเกษตรและสหกรณ์", perSet: 3, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.วิธีปฏิบัติราชการทางปกครอง พ.ศ. 2539 และที่แก้ไขเพิ่มเติม", perSet: 3, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.กองทุนสงเคราะห์เกษตรกร พ.ศ. 2554 และกฎหมายที่เกี่ยวข้อง", perSet: 3, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.ข้อมูลข่าวสารของราชการ พ.ศ. 2540", perSet: 2, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "แผนพัฒนาเศรษฐกิจและสังคมแห่งชาติ ฉบับที่ 13", perSet: 1, tier: 4 as 1 | 2 | 3 | 4 },
]

const SET_NUMBERS = [1, 2, 3, 4, 5] as const

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
  const { request } = runFullPipeline(SPKS_SOURCE)
  assert.equal(request.identity.blueprint_id, 'opsmoac-policy-plan-analyst')
  assert.equal(request.identity.blueprint_version, '3.0.0')
  assert.equal(request.identity.profile, 'simulation')
}

// ─── 2. package binding (registry/config) ───────────────────────────────────

function verifies_package_binding_opsmoac_ppa_2026_v10(): void {
  const entry = ADMIN_ASSESSMENT_BLUEPRINTS.find(
    (b) => b.id === 'opsmoac-policy-plan-analyst' && b.version === '3.0.0'
  )
  assert.ok(entry, 'opsmoac-policy-plan-analyst@3.0.0 must be a registered Blueprint')
  assert.equal(entry.key, 'opsmoac-policy-plan-analyst@3.0.0')
  assert.equal(entry.packageCode, 'OPSMOAC-PPA-2026-V10', 'the Blueprint binds exactly to OPSMOAC-PPA-2026-V10')
  // The registered source file IS the file under test (byte-identical).
  const registeredSource = readFileSync(
    new URL(`../../../${entry.sourcePath}`, import.meta.url),
    'utf8'
  )
  assert.equal(registeredSource, SPKS_SOURCE, 'the registered sourcePath must be the Blueprint under test')
  // No duplicate registry keys.
  const keys = ADMIN_ASSESSMENT_BLUEPRINTS.map((b) => b.key)
  assert.equal(new Set(keys).size, keys.length, 'registry keys must be unique')
}

// ─── 3. quantified-physical Document Allocation ─────────────────────────────

function verifies_document_allocation_is_quantified_physical(): void {
  const { request } = runFullPipeline(SPKS_SOURCE)
  assert.ok(
    (request.documentQuotas ?? []).length > 0,
    'Document Allocation quantified-physical must carry hard physical quotas'
  )
}

// ─── 4. run target ──────────────────────────────────────────────────────────

function verifies_target_per_set_100(): void {
  const { request } = runFullPipeline(SPKS_SOURCE)
  assert.equal(request.target.sets, 5)
  assert.equal(request.target.perSet, 100)
}

// ─── 5+6. document registry — all 21, byte-exact, no DocumentCode ───────────

function verifies_registry_contains_all_21_byte_exact(): void {
  const { request } = runFullPipeline(SPKS_SOURCE)
  assert.equal(request.documentRegistry.length, 21)
  for (const entry of AUTHORITATIVE_ALLOCATION) {
    const found = request.documentRegistry.find((d) => d.id === entry.document)
    assert.ok(found, `registry must contain byte-exact: ${entry.document}`)
    assert.equal(found.name, entry.document, 'registry name must equal the exact stored string')
    assert.equal(found.id, found.name, 'v3.0 convention: id === name (no DocumentCode identity)')
    assert.equal(found.tier, entry.tier, `tier for ${entry.document}`)
  }
}

function verifies_registry_preserves_composed_sara_am(): void {
  // Documents 12/17 use COMPOSED Thai SARA AM (U+0E33) in the Bank surface.
  // A decomposition pass would rewrite U+0E33 → U+0E4D U+0E32 — must NOT happen.
  const { request } = runFullPipeline(SPKS_SOURCE)
  const doc12 = request.documentRegistry.find((d) => d.id.includes('กฎกระทรวงแบ่งส่วนราชการ'))
  assert.ok(doc12, 'the กฎกระทรวง document must be registered')
  assert.ok(doc12.id.includes('ำ'), 'composed SARA AM (U+0E33) must be preserved verbatim')
  assert.equal(doc12.id.includes('\u0e4d'), false, 'the decomposed form (U+0E4D) must NOT appear')
  const doc17 = request.documentRegistry.find((d) => d.id.includes('แผนปฏิบัติราชการรายปี'))
  assert.ok(doc17, 'the แผนปฏิบัติราชการรายปี document must be registered')
  assert.ok(doc17.id.includes('ำ'), 'composed SARA AM (U+0E33) must be preserved verbatim')
}

// ─── 7. per-document per-set allocation + uniform quota vectors ─────────────

function verifies_allocation_targets_sum_100_per_set(): void {
  const { ast } = runFullPipeline(SPKS_SOURCE)
  assert.equal(ast.documentSetCounts.length, 21 * 5, '21 documents × 5 sets of authored counts')
  for (const setNumber of SET_NUMBERS) {
    const perSet = ast.documentSetCounts.filter((c) => c.setNumber === setNumber)
    assert.equal(perSet.length, 21, `set ${setNumber} must allocate all 21 documents`)
    const sum = perSet.reduce((s, c) => s + c.count, 0)
    assert.equal(sum, 100, `set ${setNumber} document target sum must be 100`)
  }
  // Every document's per-set count matches the authoritative target on every set.
  for (const entry of AUTHORITATIVE_ALLOCATION) {
    for (const setNumber of SET_NUMBERS) {
      const cell = ast.documentSetCounts.find(
        (c) => c.documentName === entry.document && c.setNumber === setNumber
      )
      assert.ok(cell, `master table cell for ${entry.document} S${setNumber}`)
      assert.equal(cell.count, entry.perSet, `${entry.document} S${setNumber}`)
    }
  }
}

function verifies_document_quotas_survive_stage_6_uniform(): void {
  const { request } = runFullPipeline(SPKS_SOURCE)
  const quotas = request.documentQuotas ?? []
  assert.equal(quotas.length, 21 * 5, 'one quota cell per Document per Set')
  const vectorOf = (setNumber: number): Map<string, number> =>
    new Map(
      quotas
        .filter((q) => q.setNumber === setNumber)
        .map((q) => [q.document, q.count] as const)
    )
  const first = vectorOf(1)
  for (const setNumber of SET_NUMBERS) {
    const perSet = quotas.filter((q) => q.setNumber === setNumber)
    assert.equal(perSet.length, 21, `Set ${setNumber}: 21 quota entries`)
    assert.equal(
      perSet.reduce((acc, q) => acc + q.count, 0),
      100,
      `Set ${setNumber}: quota sum must equal target.perSet`
    )
    // quantified-physical V1: identical per-Document quota vector on every Set.
    const vector = vectorOf(setNumber)
    assert.equal(vector.size, 21, `Set ${setNumber}: uniform vector covers 21 documents`)
    for (const [document, count] of first) {
      assert.equal(
        vector.get(document),
        count,
        `Set ${setNumber} must carry Set 1's per-Document quota for ${document}`
      )
    }
  }
}

// ─── 8. authored LO distribution (product decision) ────────────────────────

/**
 * The authoritative V1 LO distribution — a PRODUCT DECISION for SPKS
 * (LO1 35 / LO2 30 / LO3 20 / LO4 15). NOT measured from the live SPKS Bank
 * and NOT copied from the OAG (40/30/15/15) or KSB conventions; live-bank
 * feasibility still requires Preview QA.
 */
const AUTHORITATIVE_LO: ReadonlyArray<{
  readonly lo: 'LO1' | 'LO2' | 'LO3' | 'LO4'
  readonly min: number
  readonly max: number
  readonly target: number
}> = [
  { lo: 'LO1', min: 30, max: 40, target: 35 },
  { lo: 'LO2', min: 25, max: 35, target: 30 },
  { lo: 'LO3', min: 15, max: 25, target: 20 },
  { lo: 'LO4', min: 10, max: 20, target: 15 },
]

function verifies_authored_lo_distribution_35_30_20_15(): void {
  const { ast, request } = runFullPipeline(SPKS_SOURCE)
  assert.equal(ast.loDefinitions.length, 4, 'LO vocabulary (LO1–LO4) must be defined')
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
  // Pattern: vocabulary only, no distribution targets authored (universal-NULL bank).
  assert.ok(ast.patternDefinitions.length > 0, 'pattern vocabulary must be present')
  assert.equal(ast.patternDistributionTargets.length, 0, 'V1 must not author pattern targets')
  // Difficulty / Blueprint Type per-set distributions: not authored.
  assert.equal(ast.difficultySetCounts.length, 0, 'no difficulty distribution in V1')
  assert.equal(ast.blueprintTypeSetCounts.length, 0, 'no blueprint-type distribution in V1')
}

// ─── 9. NEGATIVE: quota sum != perSet refuses the build ─────────────────────

function verifies_neg_quota_sum_mismatch_fails_build(): void {
  // Bump ONE authored Master-Table cell (9 → 10): the Set-1 sum becomes 101.
  const firstDoc = AUTHORITATIVE_ALLOCATION[0]!
  const brokenSource = SPKS_SOURCE.replace(
    `| 1. ${firstDoc.document} | 9 | 9 | 9 | 9 | 9 | 45 |`,
    `| 1. ${firstDoc.document} | 10 | 9 | 9 | 9 | 9 | 46 |`
  )
  assert.notEqual(brokenSource, SPKS_SOURCE, 'the Master-Table cell must have been mutated')

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

// ─── 10. determinism ────────────────────────────────────────────────────────

function verifies_reader_determinism(): void {
  const a = runFullPipeline(SPKS_SOURCE)
  const b = runFullPipeline(SPKS_SOURCE)
  assert.deepEqual(a.request, b.request, 'same bytes → identical AssemblyRequest')
  assert.deepEqual(a.ast, b.ast, 'same bytes → identical Blueprint AST')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'identity: opsmoac-policy-plan-analyst@3.0.0 accepted (schema major 3)', fn: verifies_identity_and_version_convention },
  { name: 'registry: package binding = OPSMOAC-PPA-2026-V10, registered bytes = tested bytes, unique keys', fn: verifies_package_binding_opsmoac_ppa_2026_v10 },
  { name: 'Document Allocation: quantified-physical (hard physical quotas carried)', fn: verifies_document_allocation_is_quantified_physical },
  { name: 'target.perSet = 100, sets = 5', fn: verifies_target_per_set_100 },
  { name: 'registry: all 21 documents, byte-exact, id === name (no DocumentCode), tiers as authored', fn: verifies_registry_contains_all_21_byte_exact },
  { name: 'registry: composed SARA AM preserved (no normalization)', fn: verifies_registry_preserves_composed_sara_am },
  { name: 'allocation: authoritative targets, every Set sums to 100', fn: verifies_allocation_targets_sum_100_per_set },
  { name: 'quantified document quotas survive Stage 6 (105 cells, sum 100 per Set, uniform vectors)', fn: verifies_document_quotas_survive_stage_6_uniform },
  { name: 'authored LO distribution targets 35/30/20/15 (product decision), no pattern/difficulty/type targets', fn: verifies_authored_lo_distribution_35_30_20_15 },
  { name: 'NEGATIVE: authored quota sum != perSet → build refused (invalid_document_quotas)', fn: verifies_neg_quota_sum_mismatch_fails_build },
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
