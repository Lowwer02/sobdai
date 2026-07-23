/**
 * lib/engine/reader/ast-projection.stage5.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 5 tests — AST Projection: Markdown AST → Blueprint AST.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §5 (AST Projection),
 *     §5.3 (Transformation Rules)
 *   - IG-2 Architecture Amendment v1.0 §2.2 (Blueprint v3.0 vocabulary)
 *
 * RUN: npx jiti lib/engine/reader/ast-projection.stage5.test.ts
 *
 * Coverage targets:
 *  - Every business-node projector fires on the real-shaped fixture.
 *  - Tier Definitions: 4 tiers parse with correct min/max.
 *  - Tier Assignments: documents map to tiers (with leading "N." stripped).
 *  - Distribution Constraints: pseudocode parses (sumPerSet, tier1Floor,
 *    tier4Ceiling, anchor rule).
 *  - Coverage Rules: 5 rules CR-1..CR-5 with typed bindings (CR-1 carries
 *    Document×Topic pairs).
 *  - LO Definitions: 4 LOs with LO↔BlueprintType map.
 *  - LO Distribution Targets: 4 ranges → midpoints.
 *  - Pattern Definitions: ALL 6 patterns parse, INCLUDING `Matching Concept`
 *    (the two-word form — IG-2 Amendment D-6 regression guard).
 *  - Pattern Distribution Targets: 6 with correct min/max/target.
 *  - Pattern × Type correspondence: cells with ✅ projected correctly.
 *  - Duplicate Policies: 5 L-rules with scope (within_set/across_set).
 *  - Similarity Thresholds: BLOCK 0.85, WARN 0.70 parsed from pseudocode.
 *  - Distribution Master Table: per-Document per-Set counts with theme-anchor
 *    bold detection.
 *  - Difficulty Distribution + Blueprint Type Distribution: axis counts.
 *  - Set Definitions: themes parsed from "Set N — theme" headings.
 *  - Determinism: byte-identical input → byte-identical AST.
 */

import assert from 'node:assert/strict'
import { loadBlueprint } from './loader'
import { normalizeMetadata } from './normalizer'
import { projectToBlueprintAst } from './ast-projection'
import { buildStage5CompleteBlueprint } from './testing/fixtures'
import type { BlueprintAst } from './blueprint-ast'

// ─── helpers ────────────────────────────────────────────────────────────────

function projectFixture(): BlueprintAst {
  const r = loadBlueprint(buildStage5CompleteBlueprint())
  if (!r.ok) throw new Error(`load failed: ${r.reason}`)
  return projectToBlueprintAst(r.document, normalizeMetadata(r.document.metadata))
}

// ─── Tier Definitions ───────────────────────────────────────────────────────

function verifies_tier_definitions_parse_with_bounds(): void {
  const ast = projectFixture()
  assert.equal(ast.tierDefinitions.length, 4, 'expected 4 Tier Definitions')
  const t1 = ast.tierDefinitions.find((d) => d.tier === 1)
  assert.ok(t1)
  assert.equal(t1!.label, 'Core')
  assert.equal(t1!.min, 13)
  assert.equal(t1!.max, 20)
}

function verifies_tier_definitions_all_four_tiers(): void {
  const ast = projectFixture()
  const tiers = new Set(ast.tierDefinitions.map((d) => d.tier))
  assert.deepEqual([...tiers].sort(), [1, 2, 3, 4])
}

// ─── Tier Assignments ───────────────────────────────────────────────────────

function verifies_tier_assignments_strip_leading_number(): void {
  const ast = projectFixture()
  // Source row: "1. พ.ร.บ.ทดสอบ 2560" → name "พ.ร.บ.ทดสอบ 2560", number 1.
  const first = ast.tierAssignments[0]
  assert.ok(first)
  assert.equal(first!.documentName, 'พ.ร.บ.ทดสอบ 2560')
  assert.equal(first!.documentNumber, 1)
  assert.equal(first!.tier, 1)
}

// ─── Distribution Constraints ───────────────────────────────────────────────

function verifies_distribution_constraints_from_pseudocode(): void {
  const ast = projectFixture()
  const dc = ast.distributionConstraints
  assert.equal(dc.sumPerSet, 100)
  assert.equal(dc.tier1Floor, 30)
  assert.equal(dc.tier4Ceiling, 25)
  assert.ok(dc.anchor)
  assert.equal(dc.anchor!.bonus, 5)
  assert.equal(dc.anchor!.maxPerSet, 1)
}

// ─── Coverage Rules ─────────────────────────────────────────────────────────

function verifies_coverage_rules_all_five_present(): void {
  const ast = projectFixture()
  const ids = ast.coverageRules.map((c) => c.id)
  assert.deepEqual(ids, ['CR-1', 'CR-2', 'CR-3', 'CR-4', 'CR-5'])
}

function verifies_cr1_carries_document_topic_pairs(): void {
  const ast = projectFixture()
  const cr1 = ast.coverageRules.find((c) => c.id === 'CR-1')
  assert.ok(cr1)
  assert.equal(cr1!.level, 'hard')
  const binding = cr1!.binding as { kind: string; mandatoryTopics: Array<{ document: string; topic: string }> }
  assert.equal(binding.kind, 'CR-1')
  assert.ok(binding.mandatoryTopics.length >= 2)
  const first = binding.mandatoryTopics[0]!
  assert.equal(first.document, 'พ.ร.บ.ทดสอบ 2560')
  assert.equal(first.topic, 'หลักการ (ม.6–8)')
}

function verifies_cr2_extracts_seventy_percent(): void {
  const ast = projectFixture()
  const cr2 = ast.coverageRules.find((c) => c.id === 'CR-2')
  assert.ok(cr2)
  const binding = cr2!.binding as { kind: string; minUniqueTopicPercent: number }
  assert.equal(binding.kind, 'CR-2')
  assert.equal(binding.minUniqueTopicPercent, 70)
}

// ─── LO Definitions ─────────────────────────────────────────────────────────

function verifies_lo_definitions_parse_with_type_map(): void {
  const ast = projectFixture()
  assert.equal(ast.loDefinitions.length, 4)
  const lo1 = ast.loDefinitions.find((d) => d.lo === 'LO1')
  assert.ok(lo1)
  assert.equal(lo1!.name, 'Knowledge Recall')
  assert.equal(lo1!.blueprintType, 'Memory')
  // The LO↔Type map is 1:1 in v3.0.
  const lo4 = ast.loDefinitions.find((d) => d.lo === 'LO4')
  assert.equal(lo4!.blueprintType, 'Scenario')
}

// ─── LO Distribution Targets ────────────────────────────────────────────────

function verifies_lo_distribution_targets_midpoint(): void {
  const ast = projectFixture()
  assert.equal(ast.loDistributionTargets.length, 4)
  const lo1 = ast.loDistributionTargets.find((t) => t.lo === 'LO1')
  assert.ok(lo1)
  assert.equal(lo1!.minPercent, 20)
  assert.equal(lo1!.maxPercent, 25)
  // Midpoint of 20..25 = 22.5 → rounded to 23 (Math.round rounds half up).
  assert.equal(lo1!.targetPercent, 23)
}

// ─── Pattern Definitions + Distribution + Correspondence ────────────────────

function verifies_pattern_definitions_all_six_including_matching_concept(): void {
  // CRITICAL regression guard for IG-2 Amendment D-6: the sixth Pattern is
  // the two-word `Matching Concept`, NOT `Matching`. If contracts.ts or
  // ast-projection.ts regresses to the bare form, this test fails.
  const ast = projectFixture()
  assert.equal(
    ast.patternDefinitions.length,
    6,
    `expected 6 Pattern Definitions; got ${ast.patternDefinitions.length} → ${ast.patternDefinitions.map((p) => p.pattern).join(', ')}`
  )
  const patterns = ast.patternDefinitions.map((p) => p.pattern)
  assert.ok(patterns.includes('Matching Concept'), 'Matching Concept MUST be in the parsed set')
  // String-level check that the bare form is absent. Cast to string first so
  // the comparison is structurally legal even though 'Matching' is no longer
  // a QuestionPattern union member — the type-level guard in contracts.test.ts
  // already blocks re-introduction; this runtime check is belt-and-suspenders
  // for any string-typed leak.
  assert.ok(
    !patterns.some((p) => (p as string) === 'Matching'),
    'bare "Matching" MUST NOT appear (IG-2 Amendment D-6)'
  )
}

function verifies_pattern_distribution_targets_all_six(): void {
  const ast = projectFixture()
  assert.equal(ast.patternDistributionTargets.length, 6)
  const positive = ast.patternDistributionTargets.find((p) => p.pattern === 'Positive')
  assert.ok(positive)
  assert.equal(positive!.min, 35)
  assert.equal(positive!.max, 40)
  assert.equal(positive!.target, 38)
  const mc = ast.patternDistributionTargets.find((p) => p.pattern === 'Matching Concept')
  assert.ok(mc, 'Matching Concept target must be present')
  assert.equal(mc!.target, 7)
}

function verifies_pattern_type_correspondence_marks_primary(): void {
  const ast = projectFixture()
  // At least one Primary correspondence (e.g. Positive × Memory).
  const primaries = ast.patternTypeCorrespondence.filter((c) => c.isPrimary)
  assert.ok(primaries.length > 0, 'expected at least one Primary correspondence')
  const posMem = ast.patternTypeCorrespondence.find(
    (c) => c.pattern === 'Positive' && c.blueprintType === 'Memory'
  )
  assert.ok(posMem)
  assert.equal(posMem!.isPrimary, true)
}

// ─── Duplicate Policies + Similarity ────────────────────────────────────────

function verifies_duplicate_policies_all_five_with_scope(): void {
  const ast = projectFixture()
  assert.equal(ast.duplicatePolicies.length, 5)
  const l1 = ast.duplicatePolicies.find((p) => p.id === 'L1')
  assert.ok(l1)
  assert.equal(l1!.scope, 'within_set')
  assert.equal(l1!.level, 'hard')
  const l3 = ast.duplicatePolicies.find((p) => p.id === 'L3')
  assert.equal(l3!.scope, 'across_set')
  assert.equal(l3!.level, 'soft')
}

function verifies_similarity_thresholds_from_pseudocode(): void {
  const ast = projectFixture()
  assert.ok(ast.similarityThresholds)
  assert.equal(ast.similarityThresholds!.block, 0.85)
  assert.equal(ast.similarityThresholds!.warn, 0.70)
}

// ─── Distribution Master Table ──────────────────────────────────────────────

function verifies_document_set_counts_include_theme_anchor(): void {
  const ast = projectFixture()
  // 2 documents × 5 sets = 10 entries.
  assert.equal(ast.documentSetCounts.length, 10)
  // "พ.ร.บ.ทดสอบ 2560" S1 = **20** (bolded = theme anchor).
  const anchorCell = ast.documentSetCounts.find(
    (c) => c.documentName === 'พ.ร.บ.ทดสอบ 2560' && c.setNumber === 1
  )
  assert.ok(anchorCell)
  assert.equal(anchorCell!.count, 20)
  assert.equal(anchorCell!.isThemeAnchor, true)
}

function verifies_difficulty_set_counts(): void {
  const ast = projectFixture()
  // 3 difficulties × 5 sets = 15.
  assert.equal(ast.difficultySetCounts.length, 15)
  const easy1 = ast.difficultySetCounts.find(
    (c) => c.difficulty === 'Easy' && c.setNumber === 1
  )
  assert.ok(easy1)
  assert.equal(easy1!.count, 26)
}

function verifies_blueprint_type_set_counts(): void {
  const ast = projectFixture()
  // 4 types × 5 sets = 20.
  assert.equal(ast.blueprintTypeSetCounts.length, 20)
  const mem1 = ast.blueprintTypeSetCounts.find(
    (c) => c.blueprintType === 'Memory' && c.setNumber === 1
  )
  assert.ok(mem1)
  assert.equal(mem1!.count, 24)
}

// ─── Set Definitions ────────────────────────────────────────────────────────

function verifies_set_definitions_themes_parsed(): void {
  const ast = projectFixture()
  assert.equal(ast.setDefinitions.length, 5)
  const set1 = ast.setDefinitions.find((s) => s.setNumber === 1)
  assert.ok(set1)
  assert.equal(set1!.theme, 'กฎหมายหลัก')
}

// ─── Determinism ────────────────────────────────────────────────────────────

function verifies_projection_is_deterministic(): void {
  const a = projectFixture()
  const b = projectFixture()
  assert.deepEqual(a, b)
}

// ─── Identity carries normalized metadata ───────────────────────────────────

function verifies_identity_carries_normalized_metadata(): void {
  const ast = projectFixture()
  assert.equal(ast.identity.profile, 'simulation')
  assert.equal(ast.identity.blueprintVersion, '3.0.0')
  assert.equal(ast.identity.blueprintId, 'test-position')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'Tier Definitions: 4 tiers with min/max bounds', fn: verifies_tier_definitions_parse_with_bounds },
  { name: 'Tier Definitions: all four tiers 1..4 present', fn: verifies_tier_definitions_all_four_tiers },
  { name: 'Tier Assignments: leading "N." stripped, tier captured', fn: verifies_tier_assignments_strip_leading_number },
  { name: 'Distribution Constraints parsed from pseudocode', fn: verifies_distribution_constraints_from_pseudocode },
  { name: 'Coverage Rules: CR-1..CR-5 all present in canonical order', fn: verifies_coverage_rules_all_five_present },
  { name: 'CR-1 binding carries Document×Topic pairs', fn: verifies_cr1_carries_document_topic_pairs },
  { name: 'CR-2 binding extracts 70% threshold', fn: verifies_cr2_extracts_seventy_percent },
  { name: 'LO Definitions: 4 LOs with LO↔Type map', fn: verifies_lo_definitions_parse_with_type_map },
  { name: 'LO Distribution Targets: midpoint computed from range', fn: verifies_lo_distribution_targets_midpoint },
  { name: 'Pattern Definitions: ALL 6 including Matching Concept (D-6 regression)', fn: verifies_pattern_definitions_all_six_including_matching_concept },
  { name: 'Pattern Distribution Targets: 6 with min/max/target', fn: verifies_pattern_distribution_targets_all_six },
  { name: 'Pattern × Type correspondence marks Primary cells', fn: verifies_pattern_type_correspondence_marks_primary },
  { name: 'Duplicate Policies: 5 L-rules with scope', fn: verifies_duplicate_policies_all_five_with_scope },
  { name: 'Similarity Thresholds parsed from pseudocode (0.85/0.70)', fn: verifies_similarity_thresholds_from_pseudocode },
  { name: 'Document Set Counts: theme-anchor bold detected', fn: verifies_document_set_counts_include_theme_anchor },
  { name: 'Difficulty Set Counts: 3×5=15 entries', fn: verifies_difficulty_set_counts },
  { name: 'Blueprint Type Set Counts: 4×5=20 entries', fn: verifies_blueprint_type_set_counts },
  { name: 'Set Definitions: themes parsed from H2', fn: verifies_set_definitions_themes_parsed },
  { name: 'Determinism: byte-identical input → byte-identical AST', fn: verifies_projection_is_deterministic },
  { name: 'Identity carries normalized metadata', fn: verifies_identity_carries_normalized_metadata },
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
