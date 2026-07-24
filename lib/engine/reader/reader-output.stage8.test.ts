/**
 * lib/engine/reader/reader-output.stage8.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 8 tests — Reader Output (final ReadBlueprintResult).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §3 (entry-point return),
 *     §10 (AssemblyRequest Generation), §11 (Fail Fast / Loud / Deterministic)
 *   - Implementation Planning v1.0 §3.2 (Reader acceptance criteria)
 *
 * RUN: npx jiti lib/engine/reader/reader-output.stage8.test.ts
 *
 * Coverage targets:
 *  - Success path: real-shape fixture → ok=true with AssemblyRequest + diagnostics + metadata + executionMeta.
 *  - Failure paths: each halt stage produces ok=false with the right diagnostics carried forward.
 *    - Stage 1 refusal (empty input).
 *    - Stage 2 halt (missing required section).
 *    - Stage 3 halt (blocking metadata diagnostic).
 *    - Stage 6 halt (missing required piece → generation.missing_contract_field).
 *  - Both branches carry shared fields (diagnostics, metadata, executionMeta).
 *  - Immutable output: readBlueprint is a pure function (no input mutation).
 *  - Deterministic output: same source → same ReaderResult.
 *  - Execution metadata: readerVersion constant, schemaVersionMajor extracted.
 *  - Real Blueprint v3.0 → success (golden-path smoke test).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readBlueprint } from './reader-output'
import { buildStage5CompleteBlueprint } from './testing/fixtures'
import type { ReadBlueprintResult } from './contracts'

// ─── helpers ────────────────────────────────────────────────────────────────

function readFromFixture(): ReadBlueprintResult {
  return readBlueprint(buildStage5CompleteBlueprint())
}

// ─── Success path ───────────────────────────────────────────────────────────

function verifies_success_path_produces_assembly_request(): void {
  const r = readFromFixture()
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.ok(r.assemblyRequest, 'success must carry assemblyRequest')
  assert.equal(r.assemblyRequest.identity.profile, 'simulation')
  assert.ok(r.assemblyRequest.documentRegistry.length >= 2)
}

function verifies_success_carries_metadata(): void {
  const r = readFromFixture()
  assert.equal(r.metadata.blueprintVersion, '3.0.0')
  assert.equal(r.metadata.positionId, 'test-position')
}

function verifies_success_carries_execution_meta(): void {
  const r = readFromFixture()
  assert.equal(r.executionMeta.readerVersion, '1.0.0')
  assert.equal(r.executionMeta.schemaVersionMajor, '3')
  // No caller-supplied timestamp → null (Reader never reads the wall clock).
  assert.equal(r.executionMeta.timestampIso, null)
}

function verifies_success_diagnostics_empty_on_clean_fixture(): void {
  const r = readFromFixture()
  assert.equal(r.diagnostics.length, 0)
}

// ─── Failure: Stage 1 refusal ───────────────────────────────────────────────

function verifies_empty_input_fails_at_stage_1(): void {
  const r = readBlueprint('')
  assert.equal(r.ok, false)
  // Stage 1 emits no ReaderErrors (typed refusal); diagnostics empty.
  assert.equal(r.diagnostics.length, 0)
  assert.equal(r.executionMeta.schemaVersionMajor, null)
  // Metadata is the synthetic empty block.
  assert.equal(r.metadata.blueprintVersion, null)
}

function verifies_whitespace_only_input_fails_at_stage_1(): void {
  const r = readBlueprint('   \n\t\n')
  assert.equal(r.ok, false)
}

// ─── Failure: Stage 2 halt (structural) ─────────────────────────────────────

function verifies_missing_required_section_halt_at_stage_2(): void {
  // Stripped Blueprint missing several required sections.
  const src = `# T

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`x\`

## Distribution Rules — Tier System
`
  const r = readBlueprint(src)
  assert.equal(r.ok, false)
  // Stage 2 emits structural.* diagnostics for the missing sections.
  assert.ok(r.diagnostics.length > 0, 'expected Stage 2 structural diagnostics')
  assert.ok(
    r.diagnostics.some((d) => d.category.startsWith('structural.')),
    'expected at least one structural.* diagnostic'
  )
}

// ─── Failure: Stage 6 halt (missing required piece) ─────────────────────────

function verifies_missing_position_id_halt_at_stage_6(): void {
  // Construct a Blueprint that passes Stage 2 + Stage 3 (warning, not halt)
  // but fails Stage 6 because positionId is missing.
  const src = `# T

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0

## Distribution Rules — Tier System

| Tier | Label | Range | เกณฑ์ |
|---|---|---|---|
| **Tier 1** | Core | 13–20 | a |

### Tier Mapping

| Document | Tier |
|---|---|
| 1. docA | Tier 1: Core |

### Distribution Constraints

\`\`\`
SUM(all documents) = 100
\`\`\`

## Coverage Rules

| Rule | Description | Enforcement |
|---|---|---|
| CR-1 | Mandatory | Hard |

## Learning Objectives — LO Mapping

### นิยาม Learning Objectives

| LO | Name | Bloom | Desc | Blueprint Type |
|---|---|---|---|---|
| LO1 | Recall | Remember | x | Memory |

## Question Pattern Layer

### Pattern Types

| Pattern | Desc | Example | Share |
|---|---|---|---|
| Positive | x | y | 35–40% |

## Duplicate Prevention Rules

### ระดับการป้องกัน

| Level | Scope | Rule | Enforcement |
|---|---|---|---|
| L1 | ภายใน Set | no dup | Hard |

## Distribution Master Table

### จำนวนข้อต่อ Document ต่อ Set

| Document | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|
| 1. docA | 20 | 20 | 20 | 20 | 20 |

## Set 1 — a
## Set 2 — b
## Set 3 — c
## Set 4 — d
## Set 5 — e
`
  const r = readBlueprint(src)
  assert.equal(r.ok, false)
  // The Stage 3 warning (missing positionId) AND the Stage 6 halt
  // (generation.missing_contract_field) should both be present.
  assert.ok(
    r.diagnostics.some((d) => d.category === 'semantic.smell' && /Position ID/.test(d.explanation)),
    'expected the Stage 3 missing-positionId warning to be carried forward'
  )
  assert.ok(
    r.diagnostics.some(
      (d) => d.category === 'generation.missing_contract_field' && d.severity === 'blocking'
    ),
    'expected the Stage 6 generation diagnostic'
  )
}

// ─── Shared fields on both branches ─────────────────────────────────────────

function verifies_both_branches_carry_diagnostics_metadata_execution_meta(): void {
  // Success path.
  const ok = readFromFixture()
  assert.ok('diagnostics' in ok && 'metadata' in ok && 'executionMeta' in ok)
  // Failure path.
  const fail = readBlueprint('')
  assert.ok('diagnostics' in fail && 'metadata' in fail && 'executionMeta' in fail)
}

// ─── Immutability: readBlueprint is a pure function ─────────────────────────

function verifies_readblueprint_does_not_mutate_input(): void {
  // The source string is the only mutable input; reading it should not alter
  // it. (Strings are immutable in JS, but the contract is that readBlueprint
  // has no side effects at all — including no shared-state mutation.)
  const src = buildStage5CompleteBlueprint()
  const before = src
  readBlueprint(src)
  readBlueprint(src)
  assert.equal(src, before)
}

// ─── Determinism ────────────────────────────────────────────────────────────

function verifies_deterministic_output(): void {
  // Same source → same ReaderResult, byte-for-byte. Includes diagnostics
  // order, AST, AssemblyRequest — everything.
  const src = buildStage5CompleteBlueprint()
  const a = readBlueprint(src)
  const b = readBlueprint(src)
  assert.deepEqual(a, b)
}

function verifies_deterministic_with_timestamp(): void {
  // When the caller supplies a timestamp, two runs with the same timestamp
  // produce identical results.
  const src = buildStage5CompleteBlueprint()
  const a = readBlueprint(src, { timestampIso: '2026-07-24T00:00:00Z' })
  const b = readBlueprint(src, { timestampIso: '2026-07-24T00:00:00Z' })
  assert.deepEqual(a, b)
  assert.equal(a.executionMeta.timestampIso, '2026-07-24T00:00:00Z')
}

// ─── Real Blueprint v3.0 golden path ────────────────────────────────────────

function verifies_real_blueprint_v3_produces_success_result(): void {
  // Smoke test against the actual frozen Blueprint document. This is the
  // Reader's primary acceptance criterion (Implementation Planning §3.2).
  const src = readFileSync(
    '/Users/kt_7297/Documents/sobdai/sobdai_v1/app_build/Blueprint/simulation_exam_blueprint.md',
    'utf8'
  )
  const r = readBlueprint(src)
  assert.equal(r.ok, true, 'real Blueprint v3.0 must produce a success ReaderResult')
  if (!r.ok) return
  assert.equal(r.assemblyRequest.identity.blueprint_id, 'bma-education-specialist')
  assert.equal(r.assemblyRequest.identity.blueprint_version, '3.0.0')
  assert.equal(r.assemblyRequest.target.sets, 5)
  assert.equal(r.assemblyRequest.target.perSet, 100)
  assert.equal(r.assemblyRequest.documentRegistry.length, 12)
  assert.equal(r.executionMeta.schemaVersionMajor, '3')
}

function verifies_real_blueprint_v3_zero_diagnostics(): void {
  // A clean Blueprint produces zero diagnostics on the success branch —
  // no warnings, no errors. This is the Reader's "real document is healthy"
  // property.
  const src = readFileSync(
    '/Users/kt_7297/Documents/sobdai/sobdai_v1/app_build/Blueprint/simulation_exam_blueprint.md',
    'utf8'
  )
  const r = readBlueprint(src)
  assert.equal(r.diagnostics.length, 0)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'success path produces AssemblyRequest', fn: verifies_success_path_produces_assembly_request },
  { name: 'success carries normalized metadata', fn: verifies_success_carries_metadata },
  { name: 'success carries executionMeta (readerVersion + schemaMajor)', fn: verifies_success_carries_execution_meta },
  { name: 'success diagnostics empty on clean fixture', fn: verifies_success_diagnostics_empty_on_clean_fixture },
  { name: 'empty input fails at Stage 1 (no diagnostics)', fn: verifies_empty_input_fails_at_stage_1 },
  { name: 'whitespace-only input fails at Stage 1', fn: verifies_whitespace_only_input_fails_at_stage_1 },
  { name: 'missing required section halts at Stage 2 with structural diagnostics', fn: verifies_missing_required_section_halt_at_stage_2 },
  { name: 'missing positionId halts at Stage 6 (Stage 3 warning carried forward)', fn: verifies_missing_position_id_halt_at_stage_6 },
  { name: 'both branches carry diagnostics + metadata + executionMeta', fn: verifies_both_branches_carry_diagnostics_metadata_execution_meta },
  { name: 'immutability: readBlueprint does not mutate input', fn: verifies_readblueprint_does_not_mutate_input },
  { name: 'deterministic: same source → same ReaderResult', fn: verifies_deterministic_output },
  { name: 'deterministic: same timestamp → same result with timestamp carried', fn: verifies_deterministic_with_timestamp },
  { name: 'REAL Blueprint v3.0 → success ReaderResult (golden path)', fn: verifies_real_blueprint_v3_produces_success_result },
  { name: 'REAL Blueprint v3.0 → zero diagnostics', fn: verifies_real_blueprint_v3_zero_diagnostics },
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
