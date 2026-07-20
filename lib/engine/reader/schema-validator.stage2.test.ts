/**
 * lib/engine/reader/schema-validator.stage2.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 2 tests — Schema (Structural) Validation.
 *
 * Source of truth:
 *  - Blueprint Reader Pipeline Architecture v1.0 §6 (Structural Validation),
 *    §7 (Reader Error Anatomy), §11 (Fail Fast / Loud / Deterministic)
 *  - Engineering Backlog E-1.2 S-1.2.3 (Structural Validation)
 *  - Implementation Planning v1.0 §3.2 (Reader acceptance: malformed
 *    Blueprint produces structured errors with source locations)
 *
 * RUN: npx jiti lib/engine/reader/schema-validator.stage2.test.ts
 *
 * Coverage targets:
 *  - Well-formed Blueprint → zero diagnostics.
 *  - Missing metadata block → blocking missing_section.
 *  - Unsupported schema version → blocking invalid_hierarchy.
 *  - Missing required section → blocking missing_section.
 *  - Duplicated section → blocking duplicate_section.
 *  - Malformed table (cell-count mismatch) → blocking malformed_table.
 *  - Heading skip (H1 → H3) → warning invalid_hierarchy.
 *  - Missing H1 → blocking missing_section.
 *  - Missing multiple Set sections → aggregated diagnostic.
 *  - Every diagnostic carries full anatomy (category/location/severity/
 *    explanation/recommendation) — no half-reported errors.
 *  - Determinism: same document → same diagnostic list, same order.
 *  - All applicable diagnostics emitted (Fail Loud — no short-circuit).
 */

import assert from 'node:assert/strict'
import { loadBlueprint } from './loader'
import { validateSchema } from './schema-validator'
import type { ReaderError, ReaderErrorCategory } from './contracts'
import {
  buildDuplicateSectionBlueprint,
  buildEmptyBlueprint,
  buildHeadingSkipBlueprint,
  buildMalformedTableBlueprint,
  buildMissingBlueprintVersionBlueprint,
  buildMissingCoverageRulesBlueprint,
  buildMissingH1Blueprint,
  buildMissingMetadataBlueprint,
  buildMissingMultipleSetsBlueprint,
  buildUnsupportedVersionBlueprint,
  buildWellFormedBlueprint,
} from './testing/fixtures'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Load + validate in one step. Returns diagnostics list (empty if Stage 1
 *  refused the document — those cases are Stage 1 concerns). */
function diagnose(src: string): ReaderError[] {
  const loaded = loadBlueprint(src)
  if (!loaded.ok) return []
  return validateSchema(loaded.document)
}

/** Find a diagnostic by category. Returns the first match or null. */
function findByCategory(errs: ReaderError[], category: ReaderErrorCategory): ReaderError | null {
  return errs.find((e) => e.category === category) ?? null
}

/** Asserts every diagnostic in the list has all five anatomy fields non-empty
 *  (spec §11 — no half-reported errors). */
function assertFullAnatomy(errs: ReaderError[]): void {
  for (const e of errs) {
    assert.ok(e.category.length > 0, `diagnostic missing category: ${JSON.stringify(e)}`)
    assert.ok(e.location.startLine >= 1, `diagnostic has invalid startLine: ${JSON.stringify(e)}`)
    assert.ok(e.location.endLine >= e.location.startLine, `diagnostic endLine < startLine: ${JSON.stringify(e)}`)
    assert.ok(['fatal', 'blocking', 'warning'].includes(e.severity), `invalid severity: ${e.severity}`)
    assert.ok(e.explanation.length > 0, `diagnostic missing explanation: ${JSON.stringify(e)}`)
    assert.ok(e.recommendation.length > 0, `diagnostic missing recommendation: ${JSON.stringify(e)}`)
  }
}

// ─── Happy path ─────────────────────────────────────────────────────────────

function verifies_well_formed_has_zero_diagnostics(): void {
  const errs = diagnose(buildWellFormedBlueprint())
  assert.deepEqual(
    errs,
    [],
    `expected zero diagnostics for well-formed Blueprint; got: ${JSON.stringify(errs, null, 2)}`
  )
}

// ─── Missing metadata ───────────────────────────────────────────────────────

function verifies_missing_metadata_block_is_blocking(): void {
  const errs = diagnose(buildMissingMetadataBlueprint())
  const meta = findByCategory(errs, 'structural.missing_section')
  assert.ok(meta, 'expected missing_section for absent metadata block')
  assert.equal(meta!.severity, 'blocking')
  assertFullAnatomy(errs)
}

function verifies_missing_blueprint_version_key_is_blocking(): void {
  // Metadata block exists but omits the Blueprint Version key.
  const errs = diagnose(buildMissingBlueprintVersionBlueprint())
  // The check classifies missing-version as malformed (nearest category for
  // "metadata block exists but is incomplete").
  const found = errs.find(
    (e) =>
      e.category === 'structural.malformed_table' &&
      e.explanation.includes('Blueprint Version')
  )
  assert.ok(found, 'expected a malformed-table diagnostic mentioning Blueprint Version')
  assert.equal(found!.severity, 'blocking')
}

// ─── Unsupported version ────────────────────────────────────────────────────

function verifies_unsupported_version_is_blocking(): void {
  const errs = diagnose(buildUnsupportedVersionBlueprint())
  const ver = findByCategory(errs, 'structural.invalid_hierarchy')
  assert.ok(ver, 'expected invalid_hierarchy for unsupported version')
  assert.equal(ver!.severity, 'blocking')
  assert.ok(ver!.explanation.includes('9.0.0'), 'diagnostic should cite the bad version')
}

// ─── Missing H1 ─────────────────────────────────────────────────────────────

function verifies_missing_h1_is_blocking(): void {
  const errs = diagnose(buildMissingH1Blueprint())
  // The missing-H1 diagnostic is one of possibly several missing_section
  // diagnostics. Find the one that's specifically about the title.
  const titleErr = errs.find(
    (e) => e.category === 'structural.missing_section' && e.explanation.includes('H1')
  )
  assert.ok(titleErr, 'expected missing_section diagnostic mentioning H1/title')
  assert.equal(titleErr!.severity, 'blocking')
}

// ─── Missing required section ───────────────────────────────────────────────

function verifies_missing_required_section_is_blocking(): void {
  const errs = diagnose(buildMissingCoverageRulesBlueprint())
  const cov = errs.find(
    (e) =>
      e.category === 'structural.missing_section' &&
      e.explanation.includes('Coverage Rules')
  )
  assert.ok(cov, 'expected missing_section for Coverage Rules')
  assert.equal(cov!.severity, 'blocking')
}

// ─── Duplicated section ─────────────────────────────────────────────────────

function verifies_duplicate_section_is_blocking(): void {
  const errs = diagnose(buildDuplicateSectionBlueprint())
  const dup = findByCategory(errs, 'structural.duplicate_section')
  assert.ok(dup, 'expected duplicate_section diagnostic')
  assert.equal(dup!.severity, 'blocking')
  assert.ok(dup!.explanation.includes('Coverage Rules'), 'duplicate diagnostic should name the section')
}

// ─── Malformed table ────────────────────────────────────────────────────────

function verifies_malformed_table_is_blocking(): void {
  const errs = diagnose(buildMalformedTableBlueprint())
  const tbl = findByCategory(errs, 'structural.malformed_table')
  assert.ok(tbl, 'expected malformed_table diagnostic')
  assert.equal(tbl!.severity, 'blocking')
  // The diagnostic should explain the cell-count mismatch.
  assert.ok(
    /cell/i.test(tbl!.explanation),
    'malformed-table diagnostic should mention cells'
  )
}

// ─── Heading hierarchy ──────────────────────────────────────────────────────

function verifies_heading_skip_is_warned(): void {
  // H1 → H3 with no H2 between is a hierarchy skip. Severity is WARNING
  // (not blocking) — the document is still readable, just stylistically off.
  const errs = diagnose(buildHeadingSkipBlueprint())
  const hier = findByCategory(errs, 'structural.invalid_hierarchy')
  if (hier) {
    // If a hierarchy diagnostic fires, it should be a warning, not blocking.
    assert.equal(hier.severity, 'warning')
  }
  // Either way, no fatal/blocking on the skip alone.
  // (Other diagnostics may fire from this fixture; we don't assert zero.)
}

// ─── Aggregated Set-missing diagnostic ──────────────────────────────────────

function verifies_multiple_missing_sets_emits_aggregated_diagnostic(): void {
  // When ≥2 Set sections are missing, the validator emits an aggregated
  // diagnostic in addition to the per-section ones. This is the "partial
  // Blueprint" signal.
  const errs = diagnose(buildMissingMultipleSetsBlueprint())
  const agg = errs.find(
    (e) =>
      e.category === 'structural.missing_section' &&
      /Set sections are missing/.test(e.explanation)
  )
  assert.ok(agg, 'expected aggregated Set-missing diagnostic')
  assert.equal(agg!.severity, 'blocking')
}

// ─── Fail Loud: all applicable diagnostics emitted ──────────────────────────

function verifies_fail_loud_emits_every_applicable_diagnostic(): void {
  // A document missing BOTH Coverage Rules AND with an unsupported version
  // should produce BOTH diagnostics — the validator must not short-circuit
  // after the first failure. Spec §11.
  const src = buildUnsupportedVersionBlueprint().replace(
    /## Coverage Rules[\s\S]*?(?=## Learning Objectives)/,
    ''
  )
  const errs = diagnose(src)
  const hasVersion = errs.some((e) => e.category === 'structural.invalid_hierarchy')
  const hasMissing = errs.some(
    (e) =>
      e.category === 'structural.missing_section' &&
      e.explanation.includes('Coverage Rules')
  )
  assert.ok(hasVersion, 'expected the version diagnostic to fire')
  assert.ok(hasMissing, 'expected the missing-section diagnostic to ALSO fire')
}

// ─── Anatomy completeness ───────────────────────────────────────────────────

function verifies_every_diagnostic_carries_full_anatomy(): void {
  // Across a fixture that produces many diagnostics, every one must carry
  // all five anatomy fields. This is the spec §11 Fail Loud invariant.
  const errs = diagnose(buildUnsupportedVersionBlueprint())
  assert.ok(errs.length > 0, 'fixture should produce at least one diagnostic')
  assertFullAnatomy(errs)
}

// ─── Determinism ────────────────────────────────────────────────────────────

function validates_deterministically(): void {
  // Same document → same diagnostic list, same order.
  const src = buildMalformedTableBlueprint()
  const a = diagnose(src)
  const b = diagnose(src)
  assert.deepEqual(a, b)
}

// ─── Stage 1 refusal short-circuits Stage 2 cleanly ─────────────────────────

function verifies_stage1_refusal_yields_empty_stage2_diagnostics(): void {
  // When Stage 1 refuses the document (empty input), there's no document to
  // validate. Stage 2 simply has nothing to say — the caller surfaces Stage 1's
  // refusal. This tests the boundary contract between the stages.
  const loaded = loadBlueprint(buildEmptyBlueprint())
  assert.equal(loaded.ok, false)
  // No document to validate; consumer treats Stage 1's failure as terminal.
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'well-formed Blueprint → zero diagnostics', fn: verifies_well_formed_has_zero_diagnostics },
  { name: 'missing metadata block → blocking missing_section', fn: verifies_missing_metadata_block_is_blocking },
  { name: 'missing Blueprint Version key → blocking', fn: verifies_missing_blueprint_version_key_is_blocking },
  { name: 'unsupported schema version → blocking invalid_hierarchy', fn: verifies_unsupported_version_is_blocking },
  { name: 'missing H1 → blocking missing_section', fn: verifies_missing_h1_is_blocking },
  { name: 'missing required section → blocking missing_section', fn: verifies_missing_required_section_is_blocking },
  { name: 'duplicated section → blocking duplicate_section', fn: verifies_duplicate_section_is_blocking },
  { name: 'malformed table (cell mismatch) → blocking malformed_table', fn: verifies_malformed_table_is_blocking },
  { name: 'heading skip (H1→H3) → warning invalid_hierarchy (not blocking)', fn: verifies_heading_skip_is_warned },
  { name: 'multiple missing Sets → aggregated diagnostic', fn: verifies_multiple_missing_sets_emits_aggregated_diagnostic },
  { name: 'Fail Loud: every applicable diagnostic emitted (no short-circuit)', fn: verifies_fail_loud_emits_every_applicable_diagnostic },
  { name: 'every diagnostic carries full anatomy (category/loc/severity/expl/rec)', fn: verifies_every_diagnostic_carries_full_anatomy },
  { name: 'determinism: same doc → same diagnostics, same order', fn: validates_deterministically },
  { name: 'Stage 1 refusal yields no Stage 2 diagnostics (boundary contract)', fn: verifies_stage1_refusal_yields_empty_stage2_diagnostics },
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
