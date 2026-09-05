/**
 * app/admin/generate/document-alias.test.ts
 * ----------------------------------------------------------------------------
 * Focused tests for the KSB emergency Document Alias Bridge.
 *
 * RUN: npx jiti app/admin/generate/document-alias.test.ts
 *
 * Proves, against the REAL Blueprint source and the REAL Engine Reader:
 *  - every one of the 11 evidence-backed aliases resolves to the EXACT
 *    registered KSB Document Registry name (Reader-projected, not duplicated
 *    literals — a Blueprint rename without an alias update fails here);
 *  - already-canonical and unknown document values pass through UNCHANGED;
 *  - the bridge is isolated to the exact Blueprint id + version (an unrelated
 *    Blueprint or a wrong version is NEVER mapped);
 *  - the resolver is deterministic and the registry is integrity-checked
 *    (no duplicates, no ambiguity, no shadowing of canonical names);
 *  - the ONLY normalization is trimming OUTER whitespace;
 *  - boundary integration: raw Bank document values that previously FAILED
 *    the Engine's Document Filter pass it AFTER the adapter projection —
 *    without any modification to that Engine filter.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { runEngine } from '../../../lib/engine'
import { planQuery } from '../../../lib/engine/generator/query-planner'
import { documentFilter } from '../../../lib/engine/generator/metadata-filters'
import type { BankMetadataRow } from '../../../lib/engine/shared/question-bank'

import {
  KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY,
  resolveAssessmentDocumentAlias,
  type AssessmentBlueprintIdentity,
} from './document-alias'

const KSB_IDENTITY: AssessmentBlueprintIdentity = {
  id: 'bma-education-specialist',
  version: '3.0.1',
}

const KSB_SOURCE = readFileSync(
  new URL('../../../Blueprint/simulation_exam_blueprint.md', import.meta.url),
  'utf8'
)

/**
 * The canonical KSB Document Registry names, derived from the REAL Blueprint
 * source through the Engine's REAL Reader (public API only) — the same
 * projection the generate transport and the Document Filter consume.
 */
function realKsbRegistryNames(): string[] {
  const response = runEngine(
    {
      blueprint: { ...KSB_IDENTITY },
      profile: 'simulation',
      runUnit: 'blueprint',
      runtimeCompatibility: { targetVersion: '1.0', minimumVersion: '1.0' },
      options: {
        overFetchFactor: 1,
        performanceBudgetMs: null,
        parallelismHint: null,
        auditVerbosity: 'summary',
        targetSetCount: 1,
      },
      context: {
        requestedBy: 'document-alias.test',
        submittedAtIso: '2026-01-01T00:00:00.000Z',
        correlationId: 'document-alias.test',
        traceId: null,
        parentSpanId: null,
      },
    },
    {
      readBlueprintSource: () => KSB_SOURCE,
      questionBank: { readMetadata: () => [] as const },
      observability: { emit: () => undefined },
      createExecutionId: () => 'document-alias.test',
      nowIso: () => '2026-01-01T00:00:00.000Z',
      monotonicTimeMs: () => 0,
      isCancellationRequested: () => false,
    }
  )
  const registry = response.assemblyRequest?.documentRegistry
  assert.ok(registry, 'the Reader must project a Document Registry')
  assert.equal(registry.length, 12, 'the KSB Blueprint registers 12 documents')
  return registry.map((entry) => entry.name)
}

/**
 * Minimal QueryPlan derived from the REAL Blueprint — the exact plan the
 * Engine's Document Filter receives in production.
 */
function realKsbQueryPlan(): ReturnType<typeof planQuery> {
  const response = runEngine(
    {
      blueprint: { ...KSB_IDENTITY },
      profile: 'simulation',
      runUnit: 'blueprint',
      runtimeCompatibility: { targetVersion: '1.0', minimumVersion: '1.0' },
      options: {
        overFetchFactor: 1,
        performanceBudgetMs: null,
        parallelismHint: null,
        auditVerbosity: 'summary',
        targetSetCount: 1,
      },
      context: {
        requestedBy: 'document-alias.test',
        submittedAtIso: '2026-01-01T00:00:00.000Z',
        correlationId: 'document-alias.test',
        traceId: null,
        parentSpanId: null,
      },
    },
    {
      readBlueprintSource: () => KSB_SOURCE,
      questionBank: { readMetadata: () => [] as const },
      observability: { emit: () => undefined },
      createExecutionId: () => 'document-alias.test',
      nowIso: () => '2026-01-01T00:00:00.000Z',
      monotonicTimeMs: () => 0,
      isCancellationRequested: () => false,
    }
  )
  const request = response.assemblyRequest
  assert.ok(request, 'the Reader must project an AssemblyRequest')
  return planQuery(request)
}

function bankRowWithDocument(document: string): BankMetadataRow {
  return {
    questionCode: `DOC-PROBE-${document.length}`,
    subject: null,
    document,
    topic: null,
    law: null,
    difficulty: 'Easy',
    status: 'Published',
    blueprintType: null,
    learningObjective: null,
    questionPattern: null,
    section: null,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function every_alias_resolves_to_exact_registered_name(): Promise<void> {
  const registryNames = realKsbRegistryNames()
  const aliases = Object.entries(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY)
  assert.equal(aliases.length, 11, 'the KSB registry carries 11 aliases')
  for (const [raw, expected] of aliases) {
    const resolved = resolveAssessmentDocumentAlias(KSB_IDENTITY, raw)
    assert.equal(
      resolved,
      expected,
      `alias target mismatch for raw document '${raw}'`
    )
    assert.ok(
      registryNames.includes(resolved),
      `resolved name '${resolved}' must be an EXACT registered KSB Document Registry name`
    )
  }
}

async function canonical_document_is_unchanged(): Promise<void> {
  const canonical = 'การประกันคุณภาพการศึกษา'
  assert.equal(
    resolveAssessmentDocumentAlias(KSB_IDENTITY, canonical),
    canonical,
    'an already-canonical document must pass through unchanged'
  )
}

async function unknown_document_is_unchanged(): Promise<void> {
  const unknowns = [
    'สัญญาจะจ้างที่ไม่มีในระบบ',
    'บันทึกข้อความภายใน',
    '',
    '   ',
    'การประกันคุณภาพการศึกษา (ฉบับแก้ไข)',
  ]
  for (const raw of unknowns) {
    assert.equal(
      resolveAssessmentDocumentAlias(KSB_IDENTITY, raw),
      raw,
      `unknown document must be returned byte-identical: '${raw}'`
    )
  }
}

async function unrelated_blueprint_identity_is_never_mapped(): Promise<void> {
  for (const raw of Object.keys(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY)) {
    assert.equal(
      resolveAssessmentDocumentAlias(
        { id: 'oag-education-audit', version: '1.0' },
        raw
      ),
      raw,
      'an unregistered Blueprint id must never receive the KSB bridge'
    )
  }
}

async function wrong_blueprint_version_is_never_mapped(): Promise<void> {
  for (const raw of Object.keys(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY)) {
    assert.equal(
      resolveAssessmentDocumentAlias(
        { id: 'bma-education-specialist', version: '3.0.2' },
        raw
      ),
      raw,
      'a non-registered Blueprint version must never receive the KSB bridge'
    )
  }
}

async function resolver_is_deterministic(): Promise<void> {
  const inputs = [
    ...Object.keys(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY),
    'การประกันคุณภาพการศึกษา',
    'ไม่รู้จัก',
  ]
  const first = inputs.map((raw) =>
    resolveAssessmentDocumentAlias(KSB_IDENTITY, raw)
  )
  for (let round = 0; round < 3; round++) {
    const again = inputs.map((raw) =>
      resolveAssessmentDocumentAlias(KSB_IDENTITY, raw)
    )
    assert.deepEqual(again, first, 'repeat invocations must be byte-identical')
  }
}

async function registry_has_no_duplicate_or_ambiguous_entries(): Promise<void> {
  const registryNames = realKsbRegistryNames()
  const entries = Object.entries(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY)
  assert.equal(entries.length, 11, 'exactly 11 explicit aliases')

  const keys = entries.map(([key]) => key)
  assert.equal(
    new Set(keys).size,
    keys.length,
    'no duplicate alias keys within the KSB registry'
  )
  assert.equal(
    new Set(keys.map((key) => key.trim())).size,
    keys.length,
    'no alias keys that collide after outer-whitespace trimming'
  )

  for (const [key, value] of entries) {
    assert.ok(key.trim().length > 0, 'alias keys must be non-blank')
    assert.ok(value.trim().length > 0, 'alias values must be non-blank')
    assert.ok(
      registryNames.includes(value),
      `alias value '${value}' must be an exact registered Blueprint document name`
    )
    assert.ok(
      !registryNames.includes(key),
      `alias key '${key}' must NOT shadow an already-canonical registry name`
    )
  }
}

async function only_outer_whitespace_is_normalized(): Promise<void> {
  const raw = 'พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม'
  const expected = 'พ.ร.บ.การศึกษาแห่งชาติ 2542'
  assert.equal(
    resolveAssessmentDocumentAlias(KSB_IDENTITY, `  ${raw}  `),
    expected,
    'outer whitespace is trimmed for lookup'
  )
  assert.equal(
    resolveAssessmentDocumentAlias(KSB_IDENTITY, raw.replace(' 2542', '  2542')),
    raw.replace(' 2542', '  2542'),
    'an internally-differing string must NOT be mapped (no content normalization)'
  )
}

async function document_filter_boundary_raw_fails_resolved_passes(): Promise<void> {
  const plan = realKsbQueryPlan()
  for (const [raw] of Object.entries(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY)) {
    const resolved = resolveAssessmentDocumentAlias(KSB_IDENTITY, raw)

    const rawOutcome = documentFilter([bankRowWithDocument(raw)], plan)
    assert.equal(
      rawOutcome.kept.length,
      0,
      `the RAW bank document must fail KSB document eligibility: '${raw}'`
    )
    assert.equal(rawOutcome.rejected.length, 1)

    const resolvedOutcome = documentFilter([bankRowWithDocument(resolved)], plan)
    assert.equal(
      resolvedOutcome.kept.length,
      1,
      `the RESOLVED document must pass the UNMODIFIED Document Filter: '${resolved}'`
    )
    assert.equal(resolvedOutcome.rejected.length, 0)
  }

  // The already-canonical document passes unchanged.
  const canonicalOutcome = documentFilter(
    [bankRowWithDocument('การประกันคุณภาพการศึกษา')],
    plan
  )
  assert.equal(canonicalOutcome.kept.length, 1)
}

// ─── Runner (established jiti convention) ───────────────────────────────────

const tests = [
  {
    name: 'A: all 11 evidence-backed aliases resolve to exact registered KSB names',
    fn: every_alias_resolves_to_exact_registered_name,
  },
  {
    name: 'B: already-canonical document passes through unchanged',
    fn: canonical_document_is_unchanged,
  },
  {
    name: 'C: unknown documents pass through unchanged (never guessed)',
    fn: unknown_document_is_unchanged,
  },
  {
    name: 'D: unrelated Blueprint identity is NEVER mapped',
    fn: unrelated_blueprint_identity_is_never_mapped,
  },
  {
    name: 'E: wrong Blueprint version is NEVER mapped',
    fn: wrong_blueprint_version_is_never_mapped,
  },
  {
    name: 'F: resolver is deterministic',
    fn: resolver_is_deterministic,
  },
  {
    name: 'G: registry integrity — no duplicates, no ambiguity, no shadowing',
    fn: registry_has_no_duplicate_or_ambiguous_entries,
  },
  {
    name: 'H: only OUTER whitespace is normalized (no content normalization)',
    fn: only_outer_whitespace_is_normalized,
  },
  {
    name: 'I: Document Filter boundary — raw FAILS, resolved PASSES, filter unmodified',
    fn: document_filter_boundary_raw_fails_resolved_passes,
  },
]

let failed = 0
for (const test of tests) {
  try {
    await test.fn()
    console.log(`  ✓ ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${test.name}`)
    console.error(error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
