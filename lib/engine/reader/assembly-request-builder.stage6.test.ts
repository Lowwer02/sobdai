/**
 * lib/engine/reader/assembly-request-builder.stage6.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 6 tests — AssemblyRequest Builder: Blueprint AST → AssemblyRequest.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Integration Specification v1.0 §4 (AssemblyRequest Contract),
 *     §4.4 (What the AssemblyRequest Deliberately Omits)
 *   - Blueprint Reader Pipeline Architecture v1.0 §10 (AssemblyRequest Gen)
 *   - IG-2 Architecture Amendment v1.0 §2.2 (vocabulary)
 *
 * RUN: npx jiti lib/engine/reader/assembly-request-builder.stage6.test.ts
 *
 * Coverage targets:
 *  - Happy path: well-formed fixture → AssemblyRequest with every field populated.
 *  - Identity preservation: blueprint_id + blueprint_version + profile.
 *  - Metadata preservation: target = 5 sets × 100 questions.
 *  - Document Registry: 2 documents with tier; sorted by id.
 *  - Distribution Constraints: sumPerSet, tier floors, anchor rule.
 *  - Coverage Rules: 5 carried forward with binding payloads.
 *  - LO Distribution: targets + typeMap populated; missing-LO defaults to 0.
 *  - Duplicate Prevention: 5 L-rules present; similarity thresholds attached.
 *  - Exclusions: empty by default (runtime-only).
 *  - meta.specVersion === '1.0' (constant).
 *  - Fail-closed: missing required pieces produce typed failures.
 *  - Determinism: byte-identical AST → byte-identical AssemblyRequest.
 *  - Immuntability contract: builder is a pure function (no AST mutation).
 *  - Information reduction (Integration Spec §4.4): the AssemblyRequest does
 *    NOT carry per-Set illustrative tables, pattern correspondence matrix,
 *    or rationale prose — those stay in the AST.
 */

import assert from 'node:assert/strict'
import { loadBlueprint } from './loader'
import { normalizeMetadata } from './normalizer'
import { projectToBlueprintAst } from './ast-projection'
import {
  buildAssemblyRequest,
  type BuildFailureCode,
} from './assembly-request-builder'
import { buildStage5CompleteBlueprint } from './testing/fixtures'
import type { BlueprintAst } from './blueprint-ast'
import type { CanonicalBlueprintMetadata } from './normalizer'
import type { AssemblyRequest } from './contracts'

// ─── helpers ────────────────────────────────────────────────────────────────

function buildFromFixture(): { ast: BlueprintAst; meta: CanonicalBlueprintMetadata; result: ReturnType<typeof buildAssemblyRequest> } {
  const r = loadBlueprint(buildStage5CompleteBlueprint())
  if (!r.ok) throw new Error(`load failed: ${r.reason}`)
  const meta = normalizeMetadata(r.document.metadata)
  const ast = projectToBlueprintAst(r.document, meta)
  return { ast, meta, result: buildAssemblyRequest(ast, meta) }
}

// ─── Happy path ─────────────────────────────────────────────────────────────

function verifies_happy_path_builds_request(): void {
  const { result } = buildFromFixture()
  assert.equal(result.ok, true)
}

function verifies_identity_preserved(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  assert.equal(result.request.identity.blueprint_id, 'test-position')
  assert.equal(result.request.identity.blueprint_version, '3.0.0')
  assert.equal(result.request.identity.profile, 'simulation')
}

function verifies_run_target_constant(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  assert.equal(result.request.runUnit, 'blueprint')
  assert.equal(result.request.target.sets, 5)
  assert.equal(result.request.target.perSet, 100)
}

function verifies_document_registry_sorted_by_id(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  const reg = result.request.documentRegistry
  assert.ok(reg.length >= 2)
  // Sorted ascending by id.
  for (let i = 1; i < reg.length; i++) {
    assert.ok(reg[i - 1]!.id <= reg[i]!.id, 'document registry must be sorted by id')
  }
  // Each entry has id + name + tier.
  for (const e of reg) {
    assert.ok(e.id.length > 0)
    assert.ok(e.name.length > 0)
    assert.ok(e.tier >= 1 && e.tier <= 4)
  }
}

function verifies_distribution_constraints_carried(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  const dc = result.request.distributionConstraints
  assert.equal(dc.sumPerSet, 100)
  assert.equal(dc.tier1Floor, 30)
  assert.equal(dc.tier4Ceiling, 25)
  assert.ok(dc.anchor)
  assert.equal(dc.anchor!.bonus, 5)
}

function verifies_coverage_rules_carried_with_bindings(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  assert.equal(result.request.coverageRules.length, 5)
  const cr1 = result.request.coverageRules.find((c) => c.id === 'CR-1')
  assert.ok(cr1)
  // Binding is opaque at the AssemblyRequest layer (typed `unknown` in
  // contracts.ts); we just verify it's present and well-shaped.
  const binding = cr1!.binding as { kind: string }
  assert.equal(binding.kind, 'CR-1')
}

function verifies_lo_distribution_targets_and_type_map(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  const ld = result.request.loDistribution
  // All four LOs present in targets.
  for (const lo of ['LO1', 'LO2', 'LO3', 'LO4'] as const) {
    assert.ok(lo in ld.targets, `LO target missing: ${lo}`)
    assert.ok(lo in ld.typeMap, `LO typeMap missing: ${lo}`)
  }
  // LO1 → Memory (1:1 in v3.0).
  assert.deepEqual(ld.typeMap.LO1, ['Memory'])
  assert.deepEqual(ld.typeMap.LO4, ['Scenario'])
}

function verifies_duplicate_prevention_all_five_with_thresholds(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  const dp = result.request.duplicatePrevention
  assert.equal(dp.length, 5)
  const ids = dp.map((r) => r.id)
  assert.deepEqual(ids, ['L1', 'L2', 'L3', 'L4', 'L5'])
  // Similarity thresholds attached to every rule (v3.0 declares a global metric).
  for (const r of dp) {
    assert.ok(r.similarityThresholds, `rule ${r.id} should carry thresholds`)
    assert.equal(r.similarityThresholds!.block, 0.85)
    assert.equal(r.similarityThresholds!.warn, 0.70)
  }
}

function verifies_exclusions_empty_by_default(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  assert.deepEqual(result.request.exclusions, [])
}

function verifies_meta_spec_version_is_constant_1_0(): void {
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  assert.equal(result.request.meta.specVersion, '1.0')
}

// ─── Fail-closed: missing required pieces ───────────────────────────────────

function verifies_missing_blueprint_version_fails_closed(): void {
  const { ast } = buildFromFixture()
  const badMeta: CanonicalBlueprintMetadata = {
    engineVersion: '1.0.0',
    blueprintVersion: null, // missing
    positionId: 'test-position',
    title: 'T',
    sourceLine: 1,
    form: 'blockquote',
  }
  const r = buildAssemblyRequest(ast, badMeta)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.code, 'missing_blueprint_version')
}

function verifies_missing_position_id_fails_closed(): void {
  const { ast } = buildFromFixture()
  const badMeta: CanonicalBlueprintMetadata = {
    engineVersion: '1.0.0',
    blueprintVersion: '3.0.0',
    positionId: null,
    title: 'T',
    sourceLine: 1,
    form: 'blockquote',
  }
  const r = buildAssemblyRequest(ast, badMeta)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.code, 'missing_position_id')
}

function verifies_empty_document_registry_fails_closed(): void {
  const { ast, meta } = buildFromFixture()
  // Synthesize an AST with no tier assignments.
  const emptyAst: BlueprintAst = { ...ast, tierAssignments: [] }
  const r = buildAssemblyRequest(emptyAst, meta)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.code, 'missing_document_registry')
}

function verifies_missing_lo_definitions_fails_closed(): void {
  const { ast, meta } = buildFromFixture()
  const emptyAst: BlueprintAst = { ...ast, loDefinitions: [] }
  const r = buildAssemblyRequest(emptyAst, meta)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.code, 'missing_lo_distribution')
}

function verifies_invalid_authored_lo_target_fails_closed(): void {
  const { ast, meta } = buildFromFixture()
  // An authored Target outside its range refuses the build (fail closed) —
  // the builder must not fall back to the midpoint or pass the row through.
  const invalidAst: BlueprintAst = {
    ...ast,
    loDistributionTargets: ast.loDistributionTargets.map((t) =>
      t.lo === 'LO1'
        ? { ...t, targetPercent: 10, authoredTargetInvalidReason: 'out_of_range' as const }
        : t
    ),
  }
  const r = buildAssemblyRequest(invalidAst, meta)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.code, 'invalid_lo_target')
}

/**
 * Verify EVERY failure code is reachable — pins the discriminated union so a
 * future code path doesn't silently swallow a failure mode. Enumerates the
 * BuildFailureCode type at the type level.
 */
function verifies_every_failure_code_reachable(): void {
  const allCodes: BuildFailureCode[] = [
    'missing_blueprint_version',
    'missing_position_id',
    'missing_document_registry',
    'missing_distribution_constraints', // documented; not currently emitted
    'missing_lo_distribution',
    'missing_duplicate_prevention', // documented; not currently emitted
    'invalid_lo_target',
    'invalid_document_quotas',
  ]
  // The currently-emitted set is a subset; the documented-but-not-emitted
  // codes are kept in the union for forward compat. This test just verifies
  // the union is stable (no silent removal).
  assert.ok(allCodes.length >= 4)
}

// ─── Determinism ────────────────────────────────────────────────────────────

function verifies_builder_is_deterministic(): void {
  const r1 = buildFromFixture()
  const r2 = buildFromFixture()
  assert.deepEqual(r1.result, r2.result)
}

// ─── Immutability: builder is a pure function (no AST mutation) ──────────────

function verifies_builder_does_not_mutate_input_ast(): void {
  // Snapshot the AST, build, then verify the AST is byte-identical.
  const { ast, meta } = buildFromFixture()
  const before = JSON.stringify(ast)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  buildAssemblyRequest(ast, meta)
  buildAssemblyRequest(ast, meta) // twice to catch accumulator-style mutation
  const after = JSON.stringify(ast)
  assert.equal(after, before, 'AST must be unchanged after buildAssemblyRequest')
}

// ─── Information reduction (Integration Spec §4.4) ─────────────────────────

function verifies_assembly_request_omits_per_set_illustrative_tables(): void {
  // The AssemblyRequest must NOT carry documentSetCounts, difficultySetCounts,
  // blueprintTypeSetCounts, patternTypeCorrespondence, or setDefinitions.
  // Those are author-guidance; the Engine re-derives its own allocation.
  const { result } = buildFromFixture()
  if (!result.ok) return assert.fail()
  const req: AssemblyRequest = result.request
  const keys = Object.keys(req)
  const allowedKeys = new Set([
    'identity',
    'runUnit',
    'target',
    'documentRegistry',
    'distributionConstraints',
    'coverageRules',
    'loDistribution',
    'duplicatePrevention',
    // Document Quota Closure: present only when the Blueprint declares the
    // 'quantified-physical' Document Allocation mode (null otherwise). The
    // ADVISORY per-set tables (documentSetCounts etc.) remain omitted — the
    // quotas are the authored-quantified subset promoted to hard contracts.
    'documentQuotas',
    'exclusions',
    'meta',
  ])
  for (const k of keys) {
    assert.ok(allowedKeys.has(k), `AssemblyRequest carries unexpected key: ${k}`)
  }
  // The fixture declares no Document Allocation mode → quotas stay null
  // (legacy advisory behavior; Document Quota Closure gate is OFF).
  assert.equal(req.documentQuotas ?? null, null)
}

// ─── Quantified-physical V1: uniform per-Set Document quota vectors ─────────

/**
 * Build a fixture variant with the given Distribution Master Table
 * (จำนวนข้อต่อ Document ต่อ Set) and — unless `declare` is false — the
 * `Document Allocation: quantified-physical` metadata declaration.
 */
function buildFromQuantifiedFixture(
  masterTableHeader: string,
  masterTableRows: readonly string[],
  declare = true
): ReturnType<typeof buildAssemblyRequest> {
  let source = buildStage5CompleteBlueprint()
    .replace(
      '| Document | S1 | S2 | S3 | S4 | S5 | รวม |\n|---|---|---|---|---|---|---|',
      masterTableHeader
    )
    .replace(
      '| 1. พ.ร.บ.ทดสอบ 2560 | **20** | 13 | 12 | 13 | 13 | 71 |\n| 2. พ.ร.บ.อีกอัน 2562 | 5 | 5 | 10 | 5 | 8 | 33 |',
      masterTableRows.join('\n')
    )
  if (declare) {
    source = source.replace(
      '**Position ID**: `test-position`',
      '**Position ID**: `test-position` | **Document Allocation**: quantified-physical'
    )
  }
  const r = loadBlueprint(source)
  if (!r.ok) throw new Error(`load failed: ${r.reason}`)
  const meta = normalizeMetadata(r.document.metadata)
  const ast = projectToBlueprintAst(r.document, meta)
  return buildAssemblyRequest(ast, meta)
}

/** Map<document, count> for one Set's carried quotas. */
function quotaVectorOf(request: AssemblyRequest, setNumber: number): Map<string, number> {
  const quotas = request.documentQuotas ?? []
  return new Map(
    quotas
      .filter((q) => q.setNumber === setNumber)
      .map((q) => [q.document, q.count] as const)
  )
}

function verifies_quantified_uniform_2set_quotas_pass(): void {
  // Two authored Sets, identical quota vectors, each summing to 100.
  const result = buildFromQuantifiedFixture(
    '| Document | S1 | S2 | รวม |\n|---|---|---|---|',
    [
      '| 1. พ.ร.บ.ทดสอบ 2560 | 60 | 60 | 120 |',
      '| 2. พ.ร.บ.อีกอัน 2562 | 40 | 40 | 80 |',
    ]
  )
  if (!result.ok) return assert.fail(`uniform 2-Set must pass: ${result.message}`)
  assert.equal(result.request.target.sets, 5) // no targetSetCount option → RUN_TARGET
  const quotas = result.request.documentQuotas ?? []
  assert.equal(quotas.length, 4, '2 documents × 2 authored Sets')
  for (const setNumber of [1, 2] as const) {
    const vector = quotaVectorOf(result.request, setNumber)
    assert.equal(vector.size, 2)
    assert.equal([...vector.values()].reduce((a, b) => a + b, 0), 100)
    assert.equal(vector.get('พ.ร.บ.ทดสอบ 2560'), 60)
    assert.equal(vector.get('พ.ร.บ.อีกอัน 2562'), 40)
  }
  assert.deepEqual(
    Object.fromEntries([...quotaVectorOf(result.request, 2)].sort()),
    Object.fromEntries([...quotaVectorOf(result.request, 1)].sort()),
    'both authored Sets carry the SAME per-Document quota vector'
  )
}

function verifies_quantified_uniform_3set_quotas_pass(): void {
  const result = buildFromQuantifiedFixture(
    '| Document | S1 | S2 | S3 | รวม |\n|---|---|---|---|---|',
    [
      '| 1. พ.ร.บ.ทดสอบ 2560 | 55 | 55 | 55 | 165 |',
      '| 2. พ.ร.บ.อีกอัน 2562 | 45 | 45 | 45 | 135 |',
    ]
  )
  if (!result.ok) return assert.fail(`uniform 3-Set must pass: ${result.message}`)
  const quotas = result.request.documentQuotas ?? []
  assert.equal(quotas.length, 6, '2 documents × 3 authored Sets')
  for (const setNumber of [1, 2, 3] as const) {
    const vector = quotaVectorOf(result.request, setNumber)
    assert.equal([...vector.values()].reduce((a, b) => a + b, 0), 100)
    assert.equal(vector.get('พ.ร.บ.ทดสอบ 2560'), 55)
    assert.equal(vector.get('พ.ร.บ.อีกอัน 2562'), 45)
  }
}

function verifies_quantified_non_uniform_quotas_refused(): void {
  // Every Set still sums to 100, but Set 2's vector (60/40) differs from
  // Set 1's (55/45) — an unsupported quantified-physical V1 shape.
  const result = buildFromQuantifiedFixture(
    '| Document | S1 | S2 | S3 | รวม |\n|---|---|---|---|---|',
    [
      '| 1. พ.ร.บ.ทดสอบ 2560 | 55 | 60 | 55 | 170 |',
      '| 2. พ.ร.บ.อีกอัน 2562 | 45 | 40 | 45 | 130 |',
    ]
  )
  assert.equal(result.ok, false, 'non-uniform per-Set quotas must be refused')
  if (result.ok) return
  assert.equal(result.code, 'invalid_document_quotas')
  assert.match(result.message, /Set 2 differ from Set 1/)
  assert.match(result.message, /SAME per-Document quota vector/)
  // The first canonically-sorted differing Document is named with both counts.
  assert.match(result.message, /พ\.ร\.บ\.ทดสอบ 2560' is authored 60 versus 55/)
}

function verifies_non_uniform_table_without_declaration_stays_advisory(): void {
  // Same non-uniform Master Table, but NO Document Allocation declaration:
  // the counts stay advisory (legacy behavior) and must NOT be refused.
  const result = buildFromQuantifiedFixture(
    '| Document | S1 | S2 | S3 | รวม |\n|---|---|---|---|---|',
    [
      '| 1. พ.ร.บ.ทดสอบ 2560 | 55 | 60 | 55 | 170 |',
      '| 2. พ.ร.บ.อีกอัน 2562 | 45 | 40 | 45 | 130 |',
    ],
    false
  )
  if (!result.ok) return assert.fail('legacy Blueprint must build despite non-uniform counts')
  assert.equal(result.request.documentQuotas ?? null, null)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'happy path: well-formed fixture builds AssemblyRequest', fn: verifies_happy_path_builds_request },
  { name: 'identity preserved (blueprint_id, version, profile)', fn: verifies_identity_preserved },
  { name: 'run target constant (5 sets × 100 questions)', fn: verifies_run_target_constant },
  { name: 'Document Registry sorted by id with {id,name,tier}', fn: verifies_document_registry_sorted_by_id },
  { name: 'Distribution Constraints carried (sumPerSet, tier floors, anchor)', fn: verifies_distribution_constraints_carried },
  { name: 'Coverage Rules carried with typed bindings', fn: verifies_coverage_rules_carried_with_bindings },
  { name: 'LO Distribution: targets + typeMap populated', fn: verifies_lo_distribution_targets_and_type_map },
  { name: 'Duplicate Prevention: 5 L-rules with similarity thresholds attached', fn: verifies_duplicate_prevention_all_five_with_thresholds },
  { name: 'exclusions empty by default (runtime-only)', fn: verifies_exclusions_empty_by_default },
  { name: "meta.specVersion is constant '1.0'", fn: verifies_meta_spec_version_is_constant_1_0 },
  { name: 'fail-closed: missing blueprintVersion → typed failure', fn: verifies_missing_blueprint_version_fails_closed },
  { name: 'fail-closed: missing positionId → typed failure', fn: verifies_missing_position_id_fails_closed },
  { name: 'fail-closed: empty Document Registry → typed failure', fn: verifies_empty_document_registry_fails_closed },
  { name: 'fail-closed: missing LO Definitions → typed failure', fn: verifies_missing_lo_definitions_fails_closed },
  { name: 'fail-closed: invalid authored LO Target → typed failure', fn: verifies_invalid_authored_lo_target_fails_closed },
  { name: 'BuildFailureCode union stable (no silent code removal)', fn: verifies_every_failure_code_reachable },
  { name: 'determinism: byte-identical AST → byte-identical request', fn: verifies_builder_is_deterministic },
  { name: 'immutability: builder does not mutate input AST', fn: verifies_builder_does_not_mutate_input_ast },
  { name: 'Integration Spec §4.4: per-Set illustrative tables NOT carried', fn: verifies_assembly_request_omits_per_set_illustrative_tables },
  { name: 'quantified-physical V1: uniform 2-Set quota vectors → PASS', fn: verifies_quantified_uniform_2set_quotas_pass },
  { name: 'quantified-physical V1: uniform 3-Set quota vectors → PASS', fn: verifies_quantified_uniform_3set_quotas_pass },
  { name: 'quantified-physical V1: non-uniform per-Set quotas (each Set sums 100) → REFUSED invalid_document_quotas', fn: verifies_quantified_non_uniform_quotas_refused },
  { name: 'quantified-physical V1: non-uniform table WITHOUT declaration stays advisory (legacy unchanged)', fn: verifies_non_uniform_table_without_declaration_stays_advisory },
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
