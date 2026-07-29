/**
 * lib/engine/solver/blueprint-validation.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.3 — Blueprint Constraint Validation tests.
 *
 * RUN: npx jiti lib/engine/solver/blueprint-validation.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { ConstraintSnapshot } from '../generator/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { stableStringify } from '../shared/testing/determinism'
import type { AllocationRuntimeState } from './runtime'
import type { BlueprintValidationResult } from './blueprint-validation'
import { validateBlueprintConstraints } from './blueprint-validation'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Fixtures ───────────────────────────────────────────────────────────────

function runtimeStateFor(constraintSnapshot: ConstraintSnapshot): AllocationRuntimeState {
  return {
    rankedCandidateSet: {} as AllocationRuntimeState['rankedCandidateSet'],
    constraintSnapshot,
    slots: [],
    slotsById: new Map(),
    candidates: [],
    candidatesByCode: new Map(),
    progress: {
      totalSlots: 0,
      openSlotCount: 0,
      reservedSlotCount: 0,
      allocatedSlotCount: 0,
      lockedSlotCount: 0,
      rejectedSlotCount: 0,
      releasedSlotCount: 0,
      totalCandidates: 0,
      reservedCandidateCount: 0,
      assignedCandidateCount: 0,
      unresolvedConflictCount: 0,
    },
  }
}

function snapshot(overrides: Partial<ConstraintSnapshot> = {}): ConstraintSnapshot {
  return { ...buildConstraintSnapshot(), ...overrides }
}

function distribution(
  overrides: Partial<ConstraintSnapshot['distributionConstraints']>
): ConstraintSnapshot['distributionConstraints'] {
  const base = buildConstraintSnapshot().distributionConstraints
  return { ...base, ...overrides }
}

function validate(s: ConstraintSnapshot): BlueprintValidationResult {
  return validateBlueprintConstraints(runtimeStateFor(s))
}

function hasFatal(result: BlueprintValidationResult, needle: string): boolean {
  return result.fatalDiagnostics.some((diagnostic) => diagnostic.explanation.includes(needle))
}

function hasWarning(result: BlueprintValidationResult, needle: string): boolean {
  return result.warnings.some((warning) => warning.explanation.includes(needle))
}

// ═══ Shape and boundary ══════════════════════════════════════════════════════

function validates_default_snapshot_and_keeps_reference(): void {
  const s = buildConstraintSnapshot()
  const result = validate(s)
  assert.equal(result.status, 'valid')
  assert.equal(result.constraintSnapshot, s)
  assert.equal(result.fatalDiagnostics.length, 0)
  assert.ok(result.warnings.length > 0, 'null coverage bindings are surfaced as warnings')
}

function consumes_only_constraint_snapshot_from_runtime_state(): void {
  const s = buildConstraintSnapshot()
  const state = {
    get constraintSnapshot() {
      return s
    },
    get rankedCandidateSet() {
      throw new Error('rankedCandidateSet must not be read')
    },
    get slots() {
      throw new Error('slots must not be read')
    },
    get slotsById() {
      throw new Error('slotsById must not be read')
    },
    get candidates() {
      throw new Error('candidates must not be read')
    },
    get candidatesByCode() {
      throw new Error('candidatesByCode must not be read')
    },
    get progress() {
      throw new Error('progress must not be read')
    },
  } as unknown as AllocationRuntimeState
  const result = validateBlueprintConstraints(state)
  assert.equal(result.constraintSnapshot, s)
}

function does_not_mutate_runtime_state_or_snapshot(): void {
  const s = buildConstraintSnapshot()
  const state = runtimeStateFor(s)
  const beforeSnapshot = stableStringify(s)
  const beforeState = stableStringify({
    constraintSnapshot: state.constraintSnapshot,
    progress: state.progress,
  })
  validateBlueprintConstraints(state)
  assert.equal(stableStringify(s), beforeSnapshot)
  assert.equal(
    stableStringify({ constraintSnapshot: state.constraintSnapshot, progress: state.progress }),
    beforeState
  )
}

function deterministic_same_input_same_output(): void {
  const s = snapshot({
    coverageRules: [
      {
        id: 'CR-1',
        level: 'hard',
        binding: {
          kind: 'document_topic_pairs',
          pairs: [{ document: 'LAW-ACT-HED-2562', topic: 'section 1' }],
        },
      },
    ],
  })
  assert.equal(stableStringify(validate(s)), stableStringify(validate(s)))
}

// ═══ Run context and distribution ═══════════════════════════════════════════

function rejects_target_sets_outside_frozen_range(): void {
  const result = validate(snapshot({ target: { sets: 6, perSet: 100 } }))
  assert.equal(result.status, 'invalid')
  assert.ok(hasFatal(result, 'supports Sets 1-5'))
}

function rejects_sum_per_set_target_mismatch(): void {
  const result = validate(snapshot({ distributionConstraints: distribution({ sumPerSet: 90 }) }))
  assert.ok(hasFatal(result, 'does not match target.perSet'))
}

function rejects_tier_minimums_exceeding_sum(): void {
  const result = validate(
    snapshot({
      distributionConstraints: distribution({
        tierMinMax: {
          1: [70, 100],
          2: [40, 100],
          3: [0, 100],
          4: [0, 25],
        },
      }),
    })
  )
  assert.ok(hasFatal(result, 'Tier minimums require at least 110'))
}

function rejects_tier_maximums_below_sum(): void {
  const result = validate(
    snapshot({
      distributionConstraints: distribution({
        tierMinMax: {
          1: [0, 10],
          2: [0, 10],
          3: [0, 10],
          4: [0, 10],
        },
        tier1Floor: 0,
      }),
    })
  )
  assert.ok(hasFatal(result, 'Tier maximums allow at most 40'))
}

function rejects_tier_floor_ceiling_contradictions(): void {
  const floorResult = validate(
    snapshot({
      distributionConstraints: distribution({
        tierMinMax: {
          1: [0, 20],
          2: [0, 100],
          3: [0, 100],
          4: [0, 25],
        },
        tier1Floor: 30,
      }),
    })
  )
  assert.ok(hasFatal(floorResult, 'tier1Floor (30) exceeds Tier 1 maximum'))

  const ceilingResult = validate(
    snapshot({
      distributionConstraints: distribution({
        tierMinMax: {
          1: [30, 100],
          2: [0, 100],
          3: [0, 100],
          4: [30, 40],
        },
        tier4Ceiling: 25,
      }),
    })
  )
  assert.ok(hasFatal(ceilingResult, 'tier4Ceiling (25) is below Tier 4 minimum'))
}

function rejects_malformed_anchor(): void {
  const result = validate(
    snapshot({
      distributionConstraints: distribution({
        anchor: { bonus: -1, maxPerSet: 1 },
      }),
    })
  )
  assert.ok(hasFatal(result, 'Anchor bonus must be a non-negative integer'))
}

// ═══ Document tier consistency ══════════════════════════════════════════════

function rejects_empty_document_registry_for_nonempty_run(): void {
  const result = validate(snapshot({ documentRegistry: [] }))
  assert.ok(hasFatal(result, 'Document Registry is empty'))
}

function rejects_duplicate_document_ids(): void {
  const result = validate(
    snapshot({
      documentRegistry: [
        { id: 'DUP', tier: 1 },
        { id: 'DUP', tier: 2 },
      ],
    })
  )
  assert.ok(hasFatal(result, "duplicate document id 'DUP'"))
}

function rejects_required_tier_with_no_document(): void {
  const result = validate(
    snapshot({
      documentRegistry: [{ id: 'ONLY-T2', tier: 2 }],
      distributionConstraints: distribution({
        tierMinMax: {
          1: [30, 100],
          2: [0, 100],
          3: [0, 100],
          4: [0, 25],
        },
      }),
    })
  )
  assert.ok(hasFatal(result, 'no Tier 1 document exists'))
}

// ═══ Coverage constraints ═══════════════════════════════════════════════════

function warns_on_missing_coverage_binding(): void {
  const result = validate(snapshot({ coverageRules: [{ id: 'CR-1', level: 'hard', binding: null }] }))
  assert.equal(result.status, 'valid')
  assert.ok(hasWarning(result, "Coverage rule 'CR-1' has no static binding"))
}

function rejects_duplicate_coverage_rule_ids(): void {
  const result = validate(
    snapshot({
      coverageRules: [
        { id: 'CR-1', level: 'hard', binding: null },
        { id: 'CR-1', level: 'soft', binding: null },
      ],
    })
  )
  assert.ok(hasFatal(result, "Coverage rule 'CR-1' is declared more than once"))
}

function rejects_hard_cr1_unknown_document(): void {
  const result = validate(
    snapshot({
      coverageRules: [
        {
          id: 'CR-1',
          level: 'hard',
          binding: {
            kind: 'document_topic_pairs',
            pairs: [{ document: 'MISSING-DOC', topic: 'topic' }],
          },
        },
      ],
    })
  )
  assert.ok(hasFatal(result, "CR-1 references document 'MISSING-DOC'"))
}

function warns_soft_cr1_unknown_document(): void {
  const result = validate(
    snapshot({
      coverageRules: [
        {
          id: 'CR-1',
          level: 'soft',
          binding: {
            kind: 'document_topic_pairs',
            pairs: [{ document: 'MISSING-DOC', topic: 'topic' }],
          },
        },
      ],
    })
  )
  assert.equal(result.status, 'valid')
  assert.ok(hasWarning(result, "CR-1 references document 'MISSING-DOC'"))
}

// ═══ Duplicate-prevention constraints ═══════════════════════════════════════

function rejects_duplicate_prevention_rule_ids(): void {
  const result = validate(
    snapshot({
      duplicatePrevention: [
        { id: 'L1', scope: 'within_set', level: 'hard' },
        { id: 'L1', scope: 'across_set', level: 'soft' },
      ],
    })
  )
  assert.ok(hasFatal(result, "Duplicate-prevention rule 'L1' is declared more than once"))
}

function rejects_invalid_similarity_thresholds(): void {
  const result = validate(
    snapshot({
      duplicatePrevention: [
        {
          id: 'L2',
          scope: 'within_set',
          level: 'hard',
          similarityThresholds: { block: 0.7, warn: 0.8 },
        },
      ],
    })
  )
  assert.ok(hasFatal(result, 'warn threshold 0.8 above block threshold 0.7'))
}

// ═══ Learning-objective distribution ════════════════════════════════════════

function rejects_lo_targets_that_do_not_sum_to_100(): void {
  const base = buildConstraintSnapshot()
  const result = validate(
    snapshot({
      loDistribution: {
        ...base.loDistribution,
        targets: { LO1: 50, LO2: 50, LO3: 50, LO4: 50 },
      },
    })
  )
  assert.ok(hasFatal(result, 'LO targets sum to 200, not 100'))
}

function rejects_fractional_lo_question_counts(): void {
  const result = validate(snapshot({ target: { sets: 5, perSet: 101 } }))
  assert.ok(hasFatal(result, "LO target 'LO1' yields fractional per-Set count"))
}

function rejects_positive_lo_target_without_type_map(): void {
  const base = buildConstraintSnapshot()
  const result = validate(
    snapshot({
      loDistribution: {
        ...base.loDistribution,
        typeMap: { ...base.loDistribution.typeMap, LO1: [] },
      },
    })
  )
  assert.ok(hasFatal(result, "LO target 'LO1' is 25% but has no allowed BlueprintTypes"))
}

function rejects_duplicate_blueprint_type_in_lo_type_map(): void {
  const base = buildConstraintSnapshot()
  const result = validate(
    snapshot({
      loDistribution: {
        ...base.loDistribution,
        typeMap: { ...base.loDistribution.typeMap, LO1: ['Memory', 'Memory'] },
      },
    })
  )
  assert.ok(hasFatal(result, "LO typeMap 'LO1' repeats BlueprintType 'Memory'"))
}

// ═══ Source boundary checks ═════════════════════════════════════════════════

function source_has_no_forbidden_runtime_dependencies(): void {
  const source = readFileSync(path.join(__dirname, 'blueprint-validation.ts'), 'utf8')
  assert.ok(!source.includes('@supabase'))
  assert.ok(!source.includes('react'))
  assert.ok(!source.includes('next/'))
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
  assert.ok(!/import type \{[^}]*AllocatedCandidateSet/.test(source))
  assert.ok(!/:\s*AllocatedCandidateSet\b/.test(source))
}

function source_reads_only_constraint_snapshot_from_runtime_state(): void {
  const source = readFileSync(path.join(__dirname, 'blueprint-validation.ts'), 'utf8')
  const runtimeReads = source.match(/runtimeState\.[A-Za-z0-9_]+/g) ?? []
  assert.deepEqual([...new Set(runtimeReads)], ['runtimeState.constraintSnapshot'])
}

function source_has_no_mutable_globals(): void {
  const source = readFileSync(path.join(__dirname, 'blueprint-validation.ts'), 'utf8')
  assert.ok(!/^let\s+/m.test(source))
  assert.ok(!/^var\s+/m.test(source))
}

// ═══ runner ════════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'validates default Snapshot and keeps reference', fn: validates_default_snapshot_and_keeps_reference },
  { name: 'consumes only ConstraintSnapshot from Runtime State', fn: consumes_only_constraint_snapshot_from_runtime_state },
  { name: 'does not mutate Runtime State or ConstraintSnapshot', fn: does_not_mutate_runtime_state_or_snapshot },
  { name: 'deterministic: same input -> same output', fn: deterministic_same_input_same_output },
  { name: 'rejects target.sets outside frozen range', fn: rejects_target_sets_outside_frozen_range },
  { name: 'rejects sumPerSet/target.perSet mismatch', fn: rejects_sum_per_set_target_mismatch },
  { name: 'rejects Tier minimums exceeding sumPerSet', fn: rejects_tier_minimums_exceeding_sum },
  { name: 'rejects Tier maximums below sumPerSet', fn: rejects_tier_maximums_below_sum },
  { name: 'rejects Tier floor/ceiling contradictions', fn: rejects_tier_floor_ceiling_contradictions },
  { name: 'rejects malformed anchor rule', fn: rejects_malformed_anchor },
  { name: 'rejects empty Document Registry for non-empty run', fn: rejects_empty_document_registry_for_nonempty_run },
  { name: 'rejects duplicate Document ids', fn: rejects_duplicate_document_ids },
  { name: 'rejects required Tier with no Document', fn: rejects_required_tier_with_no_document },
  { name: 'warns on missing coverage binding', fn: warns_on_missing_coverage_binding },
  { name: 'rejects duplicate coverage rule ids', fn: rejects_duplicate_coverage_rule_ids },
  { name: 'rejects hard CR-1 unknown document', fn: rejects_hard_cr1_unknown_document },
  { name: 'warns soft CR-1 unknown document', fn: warns_soft_cr1_unknown_document },
  { name: 'rejects duplicate-prevention rule ids', fn: rejects_duplicate_prevention_rule_ids },
  { name: 'rejects invalid similarity thresholds', fn: rejects_invalid_similarity_thresholds },
  { name: 'rejects LO targets that do not sum to 100', fn: rejects_lo_targets_that_do_not_sum_to_100 },
  { name: 'rejects fractional LO question counts', fn: rejects_fractional_lo_question_counts },
  { name: 'rejects positive LO target without typeMap', fn: rejects_positive_lo_target_without_type_map },
  { name: 'rejects duplicate BlueprintType in LO typeMap', fn: rejects_duplicate_blueprint_type_in_lo_type_map },
  { name: 'source has no forbidden runtime dependencies', fn: source_has_no_forbidden_runtime_dependencies },
  { name: 'source reads only constraintSnapshot from Runtime State', fn: source_reads_only_constraint_snapshot_from_runtime_state },
  { name: 'source has no mutable globals', fn: source_has_no_mutable_globals },
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
