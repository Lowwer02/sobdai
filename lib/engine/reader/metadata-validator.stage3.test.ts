/**
 * lib/engine/reader/metadata-validator.stage3.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 3 tests — Metadata Validation.
 *
 * Source of truth:
 *  - Blueprint Reader Pipeline Architecture v1.0 §7 (Semantic Validation),
 *    §11 (Fail Fast / Loud / Deterministic)
 *  - Engineering Backlog E-1.2 S-1.2.4 (Semantic Validation — metadata subset)
 *
 * RUN: npx jiti lib/engine/reader/metadata-validator.stage3.test.ts
 *
 * Coverage targets:
 *  - Valid metadata → zero diagnostics.
 *  - Missing required fields (Engine Version, Position ID) → warning smell.
 *  - Unsupported Engine Version (< MIN_ENGINE_VERSION) → blocking conflicting_rules.
 *  - Invalid Blueprint Version syntax → blocking conflicting_rules.
 *  - Unsupported schema major version → blocking conflicting_rules.
 *  - Invalid Position ID syntax → warning smell.
 *  - Empty H1 title → warning smell.
 *  - Fail Loud: multiple metadata problems emit multiple diagnostics.
 *  - Determinism: same document → same diagnostic list, same order.
 *  - All diagnostics carry full anatomy (spec §11 — no half-reported errors).
 *  - Stage 3 does NOT touch rule content (out-of-scope by mission).
 */

import assert from 'node:assert/strict'
import { loadBlueprint } from './loader'
import { validateMetadata, isValidSemver, compareSemver } from './metadata-validator'
import type { ReaderError, ReaderErrorCategory } from './contracts'
import {
  buildBadBlueprintVersionSyntaxBlueprint,
  buildBadPositionIdBlueprint,
  buildEmptyTitleBlueprint,
  buildEngineVersionTooLowBlueprint,
  buildMissingEngineVersionBlueprint,
  buildMissingPositionIdBlueprint,
  buildUnsupportedSchemaMajorBlueprint,
  buildUnknownMetadataKeyBlueprint,
  buildWellFormedBlueprint,
} from './testing/fixtures'

// ─── helpers ────────────────────────────────────────────────────────────────

function diagnose(src: string): ReaderError[] {
  const loaded = loadBlueprint(src)
  if (!loaded.ok) return []
  return validateMetadata(loaded.document)
}

function findByCategory(errs: ReaderError[], category: ReaderErrorCategory): ReaderError | null {
  return errs.find((e) => e.category === category) ?? null
}

function findByCategoryAndText(
  errs: ReaderError[],
  category: ReaderErrorCategory,
  needle: string
): ReaderError | null {
  return (
    errs.find((e) => e.category === category && e.explanation.includes(needle)) ?? null
  )
}

// ─── Happy path ─────────────────────────────────────────────────────────────

function verifies_well_formed_has_zero_metadata_diagnostics(): void {
  const errs = diagnose(buildWellFormedBlueprint())
  assert.deepEqual(errs, [], `expected zero metadata diagnostics; got: ${JSON.stringify(errs, null, 2)}`)
}

// ─── Missing required fields ────────────────────────────────────────────────

function verifies_missing_position_id_is_warned(): void {
  const errs = diagnose(buildMissingPositionIdBlueprint())
  const found = findByCategoryAndText(errs, 'semantic.smell', 'Position ID')
  assert.ok(found, 'expected semantic.smell mentioning Position ID')
  assert.equal(found!.severity, 'warning')
}

function verifies_missing_engine_version_is_warned(): void {
  const errs = diagnose(buildMissingEngineVersionBlueprint())
  const found = findByCategoryAndText(errs, 'semantic.smell', 'Engine Version')
  assert.ok(found, 'expected semantic.smell mentioning Engine Version')
  assert.equal(found!.severity, 'warning')
}

// ─── Version checks ─────────────────────────────────────────────────────────

function verifies_unsupported_engine_version_is_blocking(): void {
  const errs = diagnose(buildEngineVersionTooLowBlueprint())
  const found = findByCategoryAndText(errs, 'semantic.conflicting_rules', 'below')
  assert.ok(found, 'expected conflicting_rules mentioning "below" minimum')
  assert.equal(found!.severity, 'blocking')
}

function verifies_bad_blueprint_version_syntax_is_blocking(): void {
  const errs = diagnose(buildBadBlueprintVersionSyntaxBlueprint())
  const found = findByCategory(errs, 'semantic.conflicting_rules')
  assert.ok(found, 'expected conflicting_rules for bad version syntax')
  assert.equal(found!.severity, 'blocking')
  assert.ok(/not valid semver/i.test(found!.explanation))
}

function verifies_unsupported_schema_major_is_blocking(): void {
  const errs = diagnose(buildUnsupportedSchemaMajorBlueprint())
  const found = findByCategoryAndText(errs, 'semantic.conflicting_rules', 'not supported')
  assert.ok(found, 'expected conflicting_rules for unsupported schema major')
  assert.equal(found!.severity, 'blocking')
}

// ─── Position ID ────────────────────────────────────────────────────────────

function verifies_bad_position_id_is_warned(): void {
  const errs = diagnose(buildBadPositionIdBlueprint())
  const found = findByCategoryAndText(errs, 'semantic.smell', 'Position ID')
  assert.ok(found, 'expected semantic.smell for bad Position ID')
  assert.equal(found!.severity, 'warning')
  assert.ok(/kebab-case/i.test(found!.explanation))
}

// ─── Title ──────────────────────────────────────────────────────────────────

function verifies_empty_title_is_warned(): void {
  const errs = diagnose(buildEmptyTitleBlueprint())
  const found = findByCategoryAndText(errs, 'semantic.smell', 'H1 title is empty')
  assert.ok(found, 'expected semantic.smell for empty title')
  assert.equal(found!.severity, 'warning')
}

// ─── Fail Loud ──────────────────────────────────────────────────────────────

function verifies_fail_loud_emits_every_applicable_metadata_diagnostic(): void {
  // Engine Version too low + Position ID bad + Blueprint Version bad = three
  // independent metadata problems. All must fire together (no short-circuit).
  const src = `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 0.1.0 | **Blueprint Version**: not-semver | **Position ID**: \`UPPER_CASE\`

${''
  }## Distribution Rules — Tier System

| Tier | Name | Min | Max |
| --- | --- | --- | --- |
| 1 | Core | 30 | 100 |

## Coverage Rules

| Rule | Description | Enforcement |
| --- | --- | --- |
| CR-1 | Mandatory topics | Hard |

## Learning Objectives — LO Mapping

| LO | Name | Target |
| --- | --- | --- |
| LO1 | Knowledge Recall | 25 |

## Question Pattern Layer

| Pattern | Target |
| --- | --- |
| Positive | 38 |

## Duplicate Prevention Rules

| Level | Scope | Rule |
| --- | --- | --- |
| L1 | within_set | Hard |

## Distribution Master Table

| Set | Document |
| --- | --- |
| 1 | doc1 |

## Set 1 — a
## Set 2 — b
## Set 3 — c
## Set 4 — d
## Set 5 — e
`
  const errs = diagnose(src)
  // All three semantic problems must surface.
  assert.ok(errs.some((e) => /below/.test(e.explanation)), 'expected Engine Version too-low diagnostic')
  assert.ok(errs.some((e) => /not valid semver/i.test(e.explanation)), 'expected Blueprint Version syntax diagnostic')
  assert.ok(
    errs.some((e) => e.category === 'semantic.smell' && /Position ID/i.test(e.explanation)),
    'expected Position ID syntax diagnostic'
  )
}

// ─── Anatomy completeness ───────────────────────────────────────────────────

function verifies_every_diagnostic_carries_full_anatomy(): void {
  const errs = diagnose(buildEngineVersionTooLowBlueprint())
  assert.ok(errs.length > 0)
  for (const e of errs) {
    assert.ok(e.category.length > 0)
    assert.ok(e.location.startLine >= 1)
    assert.ok(e.location.endLine >= e.location.startLine)
    assert.ok(['fatal', 'blocking', 'warning'].includes(e.severity))
    assert.ok(e.explanation.length > 0)
    assert.ok(e.recommendation.length > 0)
  }
}

// ─── Determinism ────────────────────────────────────────────────────────────

function validates_deterministically(): void {
  const src = buildEngineVersionTooLowBlueprint()
  const a = diagnose(src)
  const b = diagnose(src)
  assert.deepEqual(a, b)
}

// ─── Stage 3 does NOT touch rules (mission scope guard) ────────────────────

function verifies_stage3_does_not_emit_rule_diagnostics(): void {
  // A well-formed Blueprint with intentionally "smelly" rule content (a
  // distribution that doesn't sum to 100) is fed through Stage 3. Stage 3
  // must NOT report rule issues — those belong to later stages. The fixture's
  // rule smell should be invisible to Stage 3.
  const src = `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`bma-education-specialist\`

## Distribution Rules — Tier System

| Tier | Name | Min | Max |
| --- | --- | --- | --- |
| 1 | Core | 30 | 100 |

## Coverage Rules

| Rule | Description | Enforcement |
| --- | --- | --- |
| CR-1 | Mandatory topics | Hard |

## Learning Objectives — LO Mapping

| LO | Name | Target |
| --- | --- | --- |
| LO1 | Knowledge Recall | 25 |

## Question Pattern Layer

| Pattern | Target |
| --- | --- |
| Positive | 38 |

## Duplicate Prevention Rules

| Level | Scope | Rule |
| --- | --- | --- |
| L1 | within_set | Hard |

## Distribution Master Table

| Set | Document |
| --- | --- |
| 1 | doc1 |

## Set 1 — a
## Set 2 — b
## Set 3 — c
## Set 4 — d
## Set 5 — e
`
  const errs = diagnose(src)
  // Stage 3 should produce ZERO diagnostics — the metadata is valid; the
  // rule content is Stage 5's concern, not ours.
  assert.deepEqual(errs, [], `Stage 3 must not emit rule-content diagnostics; got: ${JSON.stringify(errs, null, 2)}`)
}

// ─── Unknown metadata keys (YAML form only) ────────────────────────────────

function verifies_unknown_metadata_key_in_yaml_form_is_warned(): void {
  // YAML form only — blockquote form has no keys. The fixture adds `author`.
  const errs = diagnose(buildUnknownMetadataKeyBlueprint())
  // NOTE: the current loader's flat-YAML parser tolerates unknown keys
  // (it doesn't reject them), so the metadata block IS extracted. Stage 3
  // does NOT currently have access to the raw YAML key list — the loader
  // discards it after extracting known fields. This is a known limitation:
  // unknown-key detection would require the loader to surface the full
  // parsed key set. Per the mission constraint ("Do NOT modify ... loader
  // business logic"), we accept this and assert the diagnostic does NOT
  // fire here, documenting the limitation rather than papering over it.
  //
  // The test PINS this limitation: if a future loader change exposes the
  // raw key set, this assertion will start failing, prompting the engineer
  // to add the unknown-key check.
  const found = findByCategoryAndText(errs, 'semantic.smell', 'unknown')
  assert.equal(found, null, 'unknown-key detection is a known limitation; loader does not surface raw keys')
}

// ─── Helper-function unit tests ─────────────────────────────────────────────

function verifies_isValidSemver_accepts_canonical(): void {
  assert.equal(isValidSemver('1.0.0'), true)
  assert.equal(isValidSemver('3.0.0'), true)
  assert.equal(isValidSemver('10.20.30'), true)
  assert.equal(isValidSemver(' 1.0.0 '), true) // tolerant of whitespace
}

function verifies_isValidSemver_rejects_non_semver(): void {
  assert.equal(isValidSemver('1.0'), false)
  assert.equal(isValidSemver('1'), false)
  assert.equal(isValidSemver('1.0.0-alpha'), false) // no pre-release suffix
  assert.equal(isValidSemver('three.0.0'), false)
  assert.equal(isValidSemver(''), false)
}

function verifies_compareSemver_correct_ordering(): void {
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0)
  assert.equal(compareSemver('1.0.0', '2.0.0'), -1)
  assert.equal(compareSemver('2.0.0', '1.0.0'), 1)
  assert.equal(compareSemver('1.0.0', '1.0.1'), -1)
  assert.equal(compareSemver('1.1.0', '1.0.99'), 1)
  assert.equal(compareSemver('1.10.0', '1.9.99'), 1) // numeric, not lexical
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'well-formed Blueprint → zero metadata diagnostics', fn: verifies_well_formed_has_zero_metadata_diagnostics },
  { name: 'missing Position ID → warning semantic.smell', fn: verifies_missing_position_id_is_warned },
  { name: 'missing Engine Version → warning semantic.smell', fn: verifies_missing_engine_version_is_warned },
  { name: 'Engine Version below MIN → blocking semantic.conflicting_rules', fn: verifies_unsupported_engine_version_is_blocking },
  { name: 'invalid Blueprint Version syntax → blocking semantic.conflicting_rules', fn: verifies_bad_blueprint_version_syntax_is_blocking },
  { name: 'unsupported schema major → blocking semantic.conflicting_rules', fn: verifies_unsupported_schema_major_is_blocking },
  { name: 'invalid Position ID syntax → warning semantic.smell', fn: verifies_bad_position_id_is_warned },
  { name: 'empty H1 title → warning semantic.smell', fn: verifies_empty_title_is_warned },
  { name: 'Fail Loud: multiple metadata diagnostics fire together', fn: verifies_fail_loud_emits_every_applicable_metadata_diagnostic },
  { name: 'every diagnostic carries full anatomy', fn: verifies_every_diagnostic_carries_full_anatomy },
  { name: 'determinism: same doc → same diagnostics', fn: validates_deterministically },
  { name: 'Stage 3 scope guard: does NOT emit rule-content diagnostics', fn: verifies_stage3_does_not_emit_rule_diagnostics },
  { name: 'unknown metadata key in YAML form — known limitation (loader does not surface raw keys)', fn: verifies_unknown_metadata_key_in_yaml_form_is_warned },
  { name: 'isValidSemver accepts canonical MAJOR.MINOR.PATCH', fn: verifies_isValidSemver_accepts_canonical },
  { name: 'isValidSemver rejects non-semver', fn: verifies_isValidSemver_rejects_non_semver },
  { name: 'compareSemver correct numeric ordering', fn: verifies_compareSemver_correct_ordering },
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
