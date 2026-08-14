/**
 * app/admin/generate/admin-options.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for pure Admin options transport & validation (PHASE 3F5-D2B2).
 *
 * RUN: npx jiti app/admin/generate/admin-options.test.ts
 */

import assert from 'node:assert/strict'
import {
  validateAdminGenerateInput,
  mapAdminOptions,
  resolveAdminExecutionOptions,
  type AdminGenerateAssessmentInput,
} from './admin-options'
import { resolveBlueprintPhysicalSolverBudget } from './config'

const BASE_INPUT: AdminGenerateAssessmentInput = {
  blueprintKey: 'bma-education-specialist@3.0.0',
  targetSetCount: 5,
  overFetchFactor: 2,
  auditVerbosity: 'summary',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. OMITTED FIELD
function test_omitted_field(): void {
  const input: AdminGenerateAssessmentInput = { ...BASE_INPUT }
  delete (input as any).physicalSolverMaxNodesVisited

  const validationError = validateAdminGenerateInput(input)
  assert.equal(validationError, null, 'Validation must pass when physical solver option is omitted')

  const options = mapAdminOptions(input)
  const hasKey = Object.prototype.hasOwnProperty.call(options, 'physicalSolver')
  assert.equal(hasKey, false, 'options must NOT contain physicalSolver key when omitted')
}

// 2. VALID VALUES
function test_valid_values(): void {
  const valids = [1, 100, 500]

  for (const val of valids) {
    const input: AdminGenerateAssessmentInput = {
      ...BASE_INPUT,
      physicalSolverMaxNodesVisited: val,
    }

    const validationError = validateAdminGenerateInput(input)
    assert.equal(validationError, null, `Validation must pass for valid budget value: ${val}`)

    const options = mapAdminOptions(input)
    assert.ok(
      Object.prototype.hasOwnProperty.call(options, 'physicalSolver'),
      'options must contain physicalSolver when provided'
    )
    assert.equal(
      options.physicalSolver?.maxNodesVisited,
      val,
      `maxNodesVisited must map exactly to ${val}`
    )
  }
}

// 3. INVALID VALUES
function test_invalid_values(): void {
  const invalids = [0, -1, 1.5, NaN, Infinity]

  for (const val of invalids) {
    const input: AdminGenerateAssessmentInput = {
      ...BASE_INPUT,
      physicalSolverMaxNodesVisited: val,
    }

    const validationError = validateAdminGenerateInput(input)
    assert.equal(
      validationError,
      'Physical solver budget must be a positive integer.',
      `Validation must reject invalid value: ${val}`
    )
  }
}

// 4. EXACT VALUE PRESERVATION
function test_exact_value_preservation(): void {
  const input: AdminGenerateAssessmentInput = {
    ...BASE_INPUT,
    physicalSolverMaxNodesVisited: 137,
  }

  const options = mapAdminOptions(input)
  assert.equal(
    options.physicalSolver?.maxNodesVisited,
    137,
    'Budget value 137 must be preserved without clamps or modifications'
  )
}

// 5. EXISTING OPTION PRESERVATION
function test_existing_option_preservation(): void {
  const input: AdminGenerateAssessmentInput = {
    ...BASE_INPUT,
    physicalSolverMaxNodesVisited: 100,
  }

  const options = mapAdminOptions(input)
  assert.equal(options.targetSetCount, BASE_INPUT.targetSetCount)
  assert.equal(options.overFetchFactor, BASE_INPUT.overFetchFactor)
  assert.equal(options.auditVerbosity, BASE_INPUT.auditVerbosity)
}

// 6. OPT-IN SEMANTICS
function test_opt_in_semantics(): void {
  // Case A: Omitted
  const inputOmitted = { ...BASE_INPUT }
  delete (inputOmitted as any).physicalSolverMaxNodesVisited
  const optionsOmitted = mapAdminOptions(inputOmitted)
  assert.equal(Object.prototype.hasOwnProperty.call(optionsOmitted, 'physicalSolver'), false)

  // Case B: Provided
  const inputProvided = { ...BASE_INPUT, physicalSolverMaxNodesVisited: 200 }
  const optionsProvided = mapAdminOptions(inputProvided)
  assert.equal(Object.prototype.hasOwnProperty.call(optionsProvided, 'physicalSolver'), true)
}

// 7. INPUT IMMUTABILITY
function test_input_immutability(): void {
  const input: AdminGenerateAssessmentInput = {
    ...BASE_INPUT,
    physicalSolverMaxNodesVisited: 100,
  }
  const originalJSON = JSON.stringify(input)

  validateAdminGenerateInput(input)
  mapAdminOptions(input)

  assert.equal(JSON.stringify(input), originalJSON, 'Input settings must be immutable')
}

// 8. CHARACTERIZED PHYSICAL SOLVER BUDGET POLICY (config registry)
function test_characterized_budget_policy(): void {
  // Characterized key resolves to the production budget.
  const characterized = resolveBlueprintPhysicalSolverBudget(
    'bma-education-specialist@3.0.0'
  )
  assert.equal(
    characterized,
    7000,
    'Characterized blueprint must resolve to the production budget 7000'
  )

  // Unknown / uncharacterized key resolves to undefined (fail-closed).
  const unknown = resolveBlueprintPhysicalSolverBudget(
    'some-future-blueprint@9.9.9'
  )
  assert.equal(
    unknown,
    undefined,
    'Unknown blueprint must resolve to undefined — no default budget'
  )
}

// 9. ADMIN POLICY COMPOSITION — characterized key supplies 7000
function test_admin_options_characterized_budget(): void {
  const options = resolveAdminExecutionOptions(
    BASE_INPUT,
    'bma-education-specialist@3.0.0'
  )
  assert.ok(
    Object.prototype.hasOwnProperty.call(options, 'physicalSolver'),
    'characterized blueprint must request the Physical Solver'
  )
  assert.equal(
    options.physicalSolver?.maxNodesVisited,
    7000,
    'characterized blueprint must supply the production budget 7000'
  )
}

// 10. ADMIN POLICY COMPOSITION — caller cannot override registry policy
function test_admin_options_caller_cannot_override(): void {
  const options = resolveAdminExecutionOptions(
    { ...BASE_INPUT, physicalSolverMaxNodesVisited: 100 },
    'bma-education-specialist@3.0.0'
  )
  assert.equal(
    options.physicalSolver?.maxNodesVisited,
    7000,
    'caller value 100 must not override the registry policy 7000'
  )
}

// 11. ADMIN POLICY COMPOSITION — uncharacterized key is fail-closed
function test_admin_options_uncharacterized_fail_closed(): void {
  const options = resolveAdminExecutionOptions(
    BASE_INPUT,
    'some-future-blueprint@9.9.9'
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(options, 'physicalSolver'),
    false,
    'uncharacterized blueprint must NOT request the Physical Solver'
  )
}

// Run all tests
const tests = [
  test_omitted_field,
  test_valid_values,
  test_invalid_values,
  test_exact_value_preservation,
  test_existing_option_preservation,
  test_opt_in_semantics,
  test_input_immutability,
  test_characterized_budget_policy,
  test_admin_options_characterized_budget,
  test_admin_options_caller_cannot_override,
  test_admin_options_uncharacterized_fail_closed,
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(err)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
