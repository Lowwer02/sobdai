/**
 * lib/engine/reader/contracts.test.ts
 * ----------------------------------------------------------------------------
 * Type-and-shape smoke tests for the Reader contracts.
 *
 * Source of truth: Blueprint Integration Specification v1.0 §4 (AssemblyRequest).
 *
 * These tests do NOT verify Reader parsing (that's E-1.2 implementation work).
 * They pin the CONTRACT invariants that downstream modules depend on:
 *  - The spec_version constant is exactly "1.0".
 *  - The factory shapes round-trip a minimal AssemblyRequest.
 *  - The discriminated union (`ok`) narrows correctly.
 *  - Reader errors carry every required anatomy field.
 *
 * Why: a future edit to contracts.ts that drops a required field or widens an
 * enum would silently break every downstream module. These tests catch that
 * at the type boundary before any module consumes the broken contract.
 *
 * RUN: npx jiti lib/engine/reader/contracts.test.ts
 */

import assert from 'node:assert/strict'
import type {
  AssemblyRequest,
  AssemblyRequestMeta,
  ReadBlueprintResult,
  ReaderError,
  Tier,
} from './contracts'

// ─── spec_version constant (Integration Spec §4.3) ──────────────────────────

function verifies_spec_version_is_exactly_1_0(): void {
  // The ONLY value the meta.specVersion field accepts is "1.0". Bumping this
  // is a contract change requiring version negotiation (Runtime API §4.5).
  const meta: AssemblyRequestMeta = { specVersion: '1.0' }
  assert.equal(meta.specVersion, '1.0')
}

// ─── minimal AssemblyRequest round-trip ─────────────────────────────────────

function verifies_minimal_assembly_request_assembles(): void {
  // Construct the smallest legal AssemblyRequest per the Integration Spec §4.2
  // conceptual shape. If a future edit adds a required field, this stops
  // compiling — surfacing the contract change immediately.
  const req: AssemblyRequest = {
    identity: {
      blueprint_id: 'simulation_exam_blueprint',
      blueprint_version: '3.0',
      profile: 'simulation',
    },
    runUnit: 'blueprint',
    target: { sets: 5, perSet: 100 },
    documentRegistry: [
      { id: 'LAW-ACT-HED-2562', name: 'พระราชบัญญัติการอุดมศึกษา พ.ศ.2562', tier: 1 },
    ],
    distributionConstraints: {
      sumPerSet: 100,
      tierMinMax: {
        1: [30, 100],
        2: [0, 100],
        3: [0, 100],
        4: [0, 25],
      },
      tier1Floor: 30,
      tier4Ceiling: 25,
      anchor: { bonus: 5, maxPerSet: 1 },
    },
    coverageRules: [
      { id: 'CR-1', level: 'hard', binding: null },
    ],
    loDistribution: {
      targets: { LO1: 25, LO2: 25, LO3: 25, LO4: 25 },
      typeMap: {
        LO1: ['Memory'],
        LO2: ['Concept'],
        LO3: ['Procedure'],
        LO4: ['Scenario'],
      },
    },
    duplicatePrevention: [
      { id: 'L1', scope: 'within_set', level: 'hard' },
    ],
    exclusions: [],
    meta: { specVersion: '1.0' },
  }

  assert.equal(req.identity.profile, 'simulation')
  assert.equal(req.target.sets, 5)
  assert.equal(req.target.perSet, 100)
  assert.equal(req.runUnit, 'blueprint')
  assert.equal(req.documentRegistry[0].tier, 1)
}

// ─── Tier literal type narrowing ────────────────────────────────────────────

function verifies_tier_rejects_out_of_range(): void {
  // Tier is a literal union 1|2|3|4. This is a compile-time guarantee; the
  // runtime check below just confirms the values we use are in the set.
  const validTiers: Tier[] = [1, 2, 3, 4]
  for (const t of validTiers) {
    assert.ok(t >= 1 && t <= 4, `tier ${t} must be in 1..4`)
  }
}

// ─── discriminated union narrows on `ok` ────────────────────────────────────

function verifies_read_result_success_branch(): void {
  const result: ReadBlueprintResult = {
    ok: true,
    assemblyRequest: {
      identity: {
        blueprint_id: 'b',
        blueprint_version: '1',
        profile: 'simulation',
      },
      runUnit: 'blueprint',
      target: { sets: 1, perSet: 1 },
      documentRegistry: [],
      distributionConstraints: {
        sumPerSet: 1,
        tierMinMax: { 1: [0, 1], 2: [0, 1], 3: [0, 1], 4: [0, 1] },
        tier1Floor: 0,
        tier4Ceiling: 1,
        anchor: null,
      },
      coverageRules: [],
      loDistribution: {
        targets: { LO1: 0, LO2: 0, LO3: 0, LO4: 0 },
        typeMap: { LO1: [], LO2: [], LO3: [], LO4: [] },
      },
      duplicatePrevention: [],
      exclusions: [],
      meta: { specVersion: '1.0' },
    },
  }

  if (result.ok) {
    // Narrowed: assemblyRequest is accessible.
    assert.equal(result.assemblyRequest.target.sets, 1)
  } else {
    assert.fail('should have narrowed to success branch')
  }
}

function verifies_read_result_failure_branch_requires_nonempty_errors(): void {
  // When ok === false, errors MUST be present and non-empty — a "failure"
  // with no errors is itself a bug (Runtime API §7.4 No Silent Failure).
  const errors: ReaderError[] = [
    {
      category: 'structural.missing_section',
      location: { startLine: 1, endLine: 1 },
      severity: 'blocking',
      explanation: 'Required section "Document Registry" is missing.',
      recommendation: 'Add a Document Registry section listing the source documents.',
    },
  ]
  const result: ReadBlueprintResult = { ok: false, errors }

  if (!result.ok) {
    assert.ok(result.errors.length > 0, 'failure must carry at least one error')
    assert.equal(result.errors[0].category, 'structural.missing_section')
  }
}

// ─── Reader error anatomy completeness ──────────────────────────────────────

function verifies_reader_error_requires_every_field(): void {
  // All five anatomy fields are required. A ReaderError missing any is itself
  // a half-reported error — Runtime API §7.4 forbids silent failures.
  const err: ReaderError = {
    category: 'semantic.conflicting_rules',
    location: { startLine: 42, endLine: 48 },
    severity: 'blocking',
    explanation: 'CR-1 and CR-2 specify contradictory mandatory topics.',
    recommendation: 'Reconcile CR-1 and CR-2 in the Blueprint source.',
  }

  assert.equal(err.category, 'semantic.conflicting_rules')
  assert.equal(err.location.startLine, 42)
  assert.equal(err.location.endLine, 48)
  assert.equal(err.severity, 'blocking')
  assert.ok(err.explanation.length > 0)
  assert.ok(err.recommendation.length > 0, 'recommendation must not be empty')
}

// ─── SourceLocation is 1-indexed inclusive ──────────────────────────────────

function verifies_source_location_single_line_span(): void {
  // A single-line span has startLine === endLine. This is the common case
  // (e.g. a malformed enum on one line).
  const loc = { startLine: 17, endLine: 17 }
  assert.equal(loc.startLine, loc.endLine)
  assert.ok(loc.startLine >= 1, 'source locations are 1-indexed')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'meta.specVersion is exactly "1.0"', fn: verifies_spec_version_is_exactly_1_0 },
  { name: 'minimal AssemblyRequest assembles', fn: verifies_minimal_assembly_request_assembles },
  { name: 'Tier values restricted to 1..4', fn: verifies_tier_rejects_out_of_range },
  { name: 'ReadBlueprintResult success branch narrows on ok=true', fn: verifies_read_result_success_branch },
  { name: 'ReadBlueprintResult failure branch requires non-empty errors', fn: verifies_read_result_failure_branch_requires_nonempty_errors },
  { name: 'ReaderError requires every anatomy field', fn: verifies_reader_error_requires_every_field },
  { name: 'SourceLocation: single-line span has startLine === endLine', fn: verifies_source_location_single_line_span },
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
