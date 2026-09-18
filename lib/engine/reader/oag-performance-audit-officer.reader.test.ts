/**
 * lib/engine/reader/oag-performance-audit-officer.reader.test.ts
 * ----------------------------------------------------------------------------
 * OAG Performance Audit Blueprint V1 (oag-performance-audit-officer@3.0.0) —
 * Reader/contract tests for package OAG-PFA-2026-V10.
 *
 * Drives the REAL repository Blueprint source
 * (Blueprint/oag_performance_audit_officer_blueprint.md) through the REAL
 * Reader pipeline (Stage 1 Loader → Stage 2 Schema → Stage 3 Metadata →
 * Stage 5 AST Projection → Stage 6 AssemblyRequest Builder) and pins the V1
 * invariants:
 *
 *   1. exact Blueprint id/version accepted (schema major 3 — the current
 *      convention; position id doubles as Blueprint id)
 *   2. registry binding: the source file under test IS the file registered for
 *      package OAG-PFA-2026-V10 (id/version/packageCode all pinned, exactly
 *      one entry, unique registry keys) — NOT the OAG-PPA identity
 *   3. Document Allocation = quantified-physical (hard physical quotas carried)
 *   4. target.perSet = 100, sets = 5
 *   5. all 11 Documents present in the closed Document Registry, id === name
 *      (NO DocumentCode execution dependency — v3.0 name identity only; the
 *      440/440 Bank DocumentCode coverage is audit evidence, not matching)
 *   6. Registry names are BYTE-EXACT vs the OAG-PFA Bank surface (no
 *      normalization — including the DECOMPOSED Thai NIKHAHIT + SARA AA
 *      (U+0E4D U+0E32) in the ethics Document «ข้อกําหนด...สํานักงาน...», which
 *      must NOT be composed into SARA AM (U+0E33))
 *   7. per-Document per-Set targets are the authoritative 11-row allocation
 *      18/12/10/5/5/15/10/10/7/5/3, every Set sums to 100, grand total = 500,
 *      and every Set carries the SAME quota vector (quantified-physical V1
 *      uniform-marginals invariant)
 *   8. the PRODUCT-DECISION LO distribution is authored as quantified targets
 *      (LO1 27 / LO2 29 / LO3 27 / LO4 17, sum 100 — supply-weighted
 *      largest-remainder decision, NOT copied from OAG-PPA 40/30/15/15 or
 *      OPSMOAC-PPA 35/30/20/15); no Pattern distribution targets authored, no
 *      Difficulty/Type distributions, and NO Document×LO matrix anywhere
 *   9. NEGATIVE: mutating one Master-Table cell so a Set sums to 101 is
 *      refused fail-closed (invalid_document_quotas)
 *  10. determinism: byte-identical source → identical AssemblyRequest
 *
 * RUN: npx jiti lib/engine/reader/oag-performance-audit-officer.reader.test.ts
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

const PFA_SOURCE = readFileSync(
  new URL('../../../Blueprint/oag_performance_audit_officer_blueprint.md', import.meta.url),
  'utf8'
)

// ─── Authoritative V1 allocation (OAG-PFA Bank audit, exact strings) ─────────

/**
 * The 11 exact stored Document strings and their authoritative per-Set
 * targets. These are copied byte-for-byte from the OAG-PFA Bank surface
 * (questions.document of package OAG-PFA-2026-V10). Do NOT normalize,
 * abbreviate, respell, re-space, or convert Thai vowel composition.
 */
const AUTHORITATIVE_ALLOCATION: ReadonlyArray<{ readonly document: string; readonly perSet: number; readonly tier: 1 | 2 | 3 | 4 }> = [
  { document: "พ.ร.บ.ประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน พ.ศ. 2561", perSet: 18, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.วินัยการเงินการคลังของรัฐ พ.ศ. 2561", perSet: 12, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "พ.ร.บ.วิธีการงบประมาณ พ.ศ. 2561 และที่แก้ไขเพิ่มเติม", perSet: 10, tier: 1 as 1 | 2 | 3 | 4 },
  { document: "ประกาศ คตง. ข้อกําหนดจริยธรรมเจ้าหน้าที่และบุคลากรอื่นของสํานักงานการตรวจเงินแผ่นดิน", perSet: 5, tier: 4 as 1 | 2 | 3 | 4 },
  { document: "ประกาศ คตง. เรื่อง นโยบายการตรวจเงินแผ่นดิน (พ.ศ. 2566 - 2570)", perSet: 5, tier: 4 as 1 | 2 | 3 | 4 },
  { document: "เศรษฐศาสตร์จุลภาคและมหภาค", perSet: 15, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "การวิเคราะห์ภาวะเศรษฐกิจ การเงินและการคลัง", perSet: 10, tier: 2 as 1 | 2 | 3 | 4 },
  { document: "การวิเคราะห์โครงการ", perSet: 10, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "การประเมินผลโครงการ", perSet: 7, tier: 3 as 1 | 2 | 3 | 4 },
  { document: "หลักสถิติเบื้องต้น", perSet: 5, tier: 4 as 1 | 2 | 3 | 4 },
  { document: "หลักความคุ้มค่า", perSet: 3, tier: 4 as 1 | 2 | 3 | 4 },
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
  const { request } = runFullPipeline(PFA_SOURCE)
  assert.equal(request.identity.blueprint_id, 'oag-performance-audit-officer')
  assert.equal(request.identity.blueprint_version, '3.0.0')
  assert.equal(request.identity.profile, 'simulation')
}

// ─── 2. package binding (registry/config) ───────────────────────────────────

function verifies_package_binding_oag_pfa_2026_v10(): void {
  const entry = ADMIN_ASSESSMENT_BLUEPRINTS.find(
    (b) => b.id === 'oag-performance-audit-officer' && b.version === '3.0.0'
  )
  assert.ok(entry, 'oag-performance-audit-officer@3.0.0 must be a registered Blueprint')
  assert.equal(entry.key, 'oag-performance-audit-officer@3.0.0')
  assert.equal(entry.packageCode, 'OAG-PFA-2026-V10', 'the Blueprint binds exactly to OAG-PFA-2026-V10')
  // The registered source file IS the file under test (byte-identical).
  const registeredSource = readFileSync(
    new URL(`../../../${entry.sourcePath}`, import.meta.url),
    'utf8'
  )
  assert.equal(registeredSource, PFA_SOURCE, 'the registered sourcePath must be the Blueprint under test')
  // No duplicate registry keys; exactly ONE entry bound to this package.
  const keys = ADMIN_ASSESSMENT_BLUEPRINTS.map((b) => b.key)
  assert.equal(new Set(keys).size, keys.length, 'registry keys must be unique')
  assert.equal(
    ADMIN_ASSESSMENT_BLUEPRINTS.filter((b) => b.packageCode === 'OAG-PFA-2026-V10').length,
    1,
    'exactly one registry entry binds OAG-PFA-2026-V10'
  )
  // The PFA identity must NOT collide with the PPA identity or its package.
  assert.notEqual(entry.id, 'oag-policy-plan-analyst', 'the PFA Blueprint is NOT the OAG-PPA Blueprint')
  assert.notEqual(entry.sourcePath, 'Blueprint/oag_policy_plan_analyst_blueprint.md')
}

// ─── 3. quantified-physical Document Allocation ─────────────────────────────

function verifies_document_allocation_is_quantified_physical(): void {
  const { request } = runFullPipeline(PFA_SOURCE)
  assert.ok(
    (request.documentQuotas ?? []).length > 0,
    'Document Allocation quantified-physical must carry hard physical quotas'
  )
}

// ─── 4. run target ──────────────────────────────────────────────────────────

function verifies_target_per_set_100(): void {
  const { request } = runFullPipeline(PFA_SOURCE)
  assert.equal(request.target.sets, 5)
  assert.equal(request.target.perSet, 100)
}

// ─── 5+6. document registry — all 11, byte-exact, no DocumentCode ───────────

function verifies_registry_contains_all_11_byte_exact(): void {
  const { request } = runFullPipeline(PFA_SOURCE)
  assert.equal(request.documentRegistry.length, 11)
  for (const entry of AUTHORITATIVE_ALLOCATION) {
    const found = request.documentRegistry.find((d) => d.id === entry.document)
    assert.ok(found, `registry must contain byte-exact: ${entry.document}`)
    assert.equal(found.name, entry.document, 'registry name must equal the exact stored string')
    assert.equal(found.id, found.name, 'v3.0 convention: id === name (no DocumentCode identity)')
    assert.equal(found.tier, entry.tier, `tier for ${entry.document}`)
  }
  // DocumentCode evidence stays OUT of the executable identity contract.
  for (const entry of request.documentRegistry) {
    assert.equal(entry.id.includes('DOC-'), false, `no DocumentCode in the registry id: ${entry.id}`)
  }
}

function verifies_registry_preserves_decomposed_thai(): void {
  // The ethics Document stores DECOMPOSED Thai NIKHAHIT + SARA AA
  // (U+0E4D U+0E32) in «ข้อกําหนด» and «สํานักงาน». A composition pass would
  // rewrite U+0E4D U+0E32 → U+0E33 (ำ) — must NOT happen.
  const { request } = runFullPipeline(PFA_SOURCE)
  const ethics = request.documentRegistry.find((d) => d.id.includes('ข้อก'))
  assert.ok(ethics, 'the ethics Document must be registered')
  assert.ok(ethics.id.includes('\u0e4d\u0e32'), 'the decomposed NIKHAHIT + SARA AA sequence must be preserved verbatim')
  assert.equal(ethics.id.includes('ำ'), false, 'the composed SARA AM (U+0E33) must NOT appear in the ethics Document id')
  assert.equal(ethics.id, "ประกาศ คตง. ข้อกําหนดจริยธรรมเจ้าหน้าที่และบุคลากรอื่นของสํานักงานการตรวจเงินแผ่นดิน", 'byte-exact ethics Document string')
}

// ─── 7. per-document per-set allocation + uniform quota vectors ─────────────

function verifies_allocation_targets_sum_100_per_set(): void {
  const { ast } = runFullPipeline(PFA_SOURCE)
  assert.equal(ast.documentSetCounts.length, 11 * 5, '11 documents × 5 sets of authored counts')
  for (const setNumber of SET_NUMBERS) {
    const perSet = ast.documentSetCounts.filter((c) => c.setNumber === setNumber)
    assert.equal(perSet.length, 11, `set ${setNumber} must allocate all 11 documents`)
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
  const { request } = runFullPipeline(PFA_SOURCE)
  const quotas = request.documentQuotas ?? []
  assert.equal(quotas.length, 11 * 5, 'one quota cell per Document per Set')
  const vectorOf = (setNumber: number): Map<string, number> =>
    new Map(
      quotas
        .filter((q) => q.setNumber === setNumber)
        .map((q) => [q.document, q.count] as const)
    )
  const first = vectorOf(1)
  for (const setNumber of SET_NUMBERS) {
    const perSet = quotas.filter((q) => q.setNumber === setNumber)
    assert.equal(perSet.length, 11, `Set ${setNumber}: 11 quota entries`)
    assert.equal(
      perSet.reduce((acc, q) => acc + q.count, 0),
      100,
      `Set ${setNumber}: quota sum must equal target.perSet`
    )
    // quantified-physical V1: identical per-Document quota vector on every Set.
    const vector = vectorOf(setNumber)
    assert.equal(vector.size, 11, `Set ${setNumber}: uniform vector covers 11 documents`)
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
 * The authoritative V1 LO distribution — a PRODUCT DECISION for OAG-PFA
 * (LO1 27 / LO2 29 / LO3 27 / LO4 17), derived by weighting the verified
 * Production Document×LO supply with the authored 100-question Document
 * quotas (≈ 26.700/28.900/26.725/17.675) and rounding by largest remainder.
 * NOT copied from OAG-PPA (40/30/15/15) or OPSMOAC-PPA (35/30/20/15).
 */
const AUTHORITATIVE_LO: ReadonlyArray<{
  readonly lo: 'LO1' | 'LO2' | 'LO3' | 'LO4'
  readonly min: number
  readonly max: number
  readonly target: number
}> = [
  { lo: 'LO1', min: 20, max: 30, target: 27 },
  { lo: 'LO2', min: 24, max: 34, target: 29 },
  { lo: 'LO3', min: 20, max: 30, target: 27 },
  { lo: 'LO4', min: 12, max: 22, target: 17 },
]

function verifies_authored_lo_distribution_27_29_27_17(): void {
  const { ast, request } = runFullPipeline(PFA_SOURCE)
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

// ─── 8b. NO Document×LO matrix — marginals only ─────────────────────────────

function verifies_no_document_x_lo_matrix_authored(): void {
  // The two hard marginals are authored (per-Document quotas; set-wide LO
  // targets). NO Document×LO cross-table exists in any contract: every
  // documentQuotas entry is a pure per-Set Document marginal, and the only
  // LO quantities are the four set-wide targets.
  const { request } = runFullPipeline(PFA_SOURCE)
  const quotas = request.documentQuotas ?? []
  for (const q of quotas) {
    assert.equal(typeof q.document, 'string', 'quota entries carry only document identity')
    assert.equal('learningObjective' in (q as object), false, 'quota entries must NOT carry an LO axis (no Document×LO matrix)')
  }
  assert.deepEqual(
    Object.keys(request.loDistribution.targets).sort(),
    ['LO1', 'LO2', 'LO3', 'LO4'],
    'the LO contract is exactly the four set-wide targets'
  )
}

// ─── 9. NEGATIVE: quota sum != perSet refuses the build ─────────────────────

function verifies_neg_quota_sum_mismatch_fails_build(): void {
  // Bump ONE authored Master-Table cell (18 → 19): the Set-1 sum becomes 101.
  const firstDoc = AUTHORITATIVE_ALLOCATION[0]!
  const brokenSource = PFA_SOURCE.replace(
    `| 1. ${firstDoc.document} | 18 | 18 | 18 | 18 | 18 | 90 |`,
    `| 1. ${firstDoc.document} | 19 | 18 | 18 | 18 | 18 | 91 |`
  )
  assert.notEqual(brokenSource, PFA_SOURCE, 'the Master-Table cell must have been mutated')

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
  const a = runFullPipeline(PFA_SOURCE)
  const b = runFullPipeline(PFA_SOURCE)
  assert.deepEqual(a.request, b.request, 'same bytes → identical AssemblyRequest')
  assert.deepEqual(a.ast, b.ast, 'same bytes → identical Blueprint AST')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'identity: oag-performance-audit-officer@3.0.0 accepted (schema major 3)', fn: verifies_identity_and_version_convention },
  { name: 'registry: package binding = OAG-PFA-2026-V10 (unique, registered bytes = tested bytes, NOT OAG-PPA)', fn: verifies_package_binding_oag_pfa_2026_v10 },
  { name: 'Document Allocation: quantified-physical (hard physical quotas carried)', fn: verifies_document_allocation_is_quantified_physical },
  { name: 'target.perSet = 100, sets = 5', fn: verifies_target_per_set_100 },
  { name: 'registry: all 11 documents, byte-exact, id === name (no DocumentCode), tiers as authored', fn: verifies_registry_contains_all_11_byte_exact },
  { name: 'registry: decomposed Thai NIKHAHIT + SARA AA preserved (no composition)', fn: verifies_registry_preserves_decomposed_thai },
  { name: 'allocation: authoritative targets 18/12/10/5/5/15/10/10/7/5/3, every Set sums to 100', fn: verifies_allocation_targets_sum_100_per_set },
  { name: 'quantified document quotas survive Stage 6 (55 cells, sum 100 per Set, uniform vectors)', fn: verifies_document_quotas_survive_stage_6_uniform },
  { name: 'authored LO distribution targets 27/29/27/17 (product decision), no pattern/difficulty/type targets', fn: verifies_authored_lo_distribution_27_29_27_17 },
  { name: 'marginals only: no Document×LO matrix in any Reader contract', fn: verifies_no_document_x_lo_matrix_authored },
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
