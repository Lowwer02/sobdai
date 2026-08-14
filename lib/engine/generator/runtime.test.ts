/**
 * lib/engine/generator/runtime.test.ts
 * ----------------------------------------------------------------------------
 * Black-box regression tests for the production Generator Runtime entry point.
 *
 * RUN: npx jiti lib/engine/generator/runtime.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type { AssemblyRequest } from '../reader/contracts'
import type {
  BankMetadataRow,
  BankReadAdapter,
} from '../shared/question-bank'
import { stableStringify } from '../shared/testing/determinism'
import {
  buildAssemblyRequest,
  buildBankRow,
  buildDocument,
} from '../shared/testing/fixtures'
import type { CandidateSetIdentity } from './contracts'
import { runGenerator } from './runtime'

const IDENTITY: CandidateSetIdentity = {
  assemblyRequestId: 'assembly-runtime-test',
  generatedAt: null,
  bankStateHash: 'bank-runtime-test',
}

function minimalRequest(): AssemblyRequest {
  return buildAssemblyRequest({
    documentRegistry: [
      buildDocument({
        id: 'LAW-ACT-HED-2562',
        name: 'LAW-ACT-HED-2562',
        tier: 1,
      }),
    ],
    loDistribution: {
      targets: { LO1: 0, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: {
        LO1: ['Memory'],
        LO2: ['Concept'],
        LO3: ['Procedure'],
        LO4: ['Scenario'],
      },
    },
  })
}

function eligibleRow(
  questionCode: string,
  overrides: Partial<BankMetadataRow> = {}
): BankMetadataRow {
  return buildBankRow({
    questionCode,
    document: 'LAW-ACT-HED-2562',
    status: 'Published',
    difficulty: 'Easy',
    blueprintType: 'Memory',
    learningObjective: 'LO1',
    questionPattern: 'Positive',
    section: 'section-1',
    topic: 'topic-1',
    ...overrides,
  })
}

class CountingBankAdapter implements BankReadAdapter {
  public reads = 0

  public constructor(private readonly rows: readonly BankMetadataRow[]) {}

  public readMetadata(): readonly BankMetadataRow[] {
    this.reads += 1
    return this.rows
  }
}

function verifies_complete_pipeline_and_single_bank_read(): void {
  const request = minimalRequest()
  const bank = new CountingBankAdapter([eligibleRow('Q-000001')])

  const result = runGenerator({
    assemblyRequest: request,
    bank,
    identity: IDENTITY,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(bank.reads, 1)
  assert.deepEqual(
    result.candidateSet.candidates.map(
      (candidate) => candidate.identity.questionCode
    ),
    ['Q-000001']
  )
  assert.equal(result.candidateSet.identity, IDENTITY)
  assert.equal(
    result.candidateSet.constraintSnapshot.distributionConstraints,
    request.distributionConstraints
  )
  assert.deepEqual(result.candidateSet.constraintSnapshot.documentRegistry, [
    { id: 'LAW-ACT-HED-2562', tier: 1 },
  ])
}

function verifies_component_fatal_is_forwarded(): void {
  const row = eligibleRow('Q-000001')
  const {
    learningObjective: omittedLearningObjective,
    ...rowWithoutLearningObjective
  } = row
  void omittedLearningObjective

  const result = runGenerator({
    assemblyRequest: minimalRequest(),
    bank: new CountingBankAdapter([rowWithoutLearningObjective]),
    identity: IDENTITY,
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.fatalDiagnostics[0]?.category, 'missing_required_axis')
}

function verifies_bank_failure_is_structured(): void {
  const bank: BankReadAdapter = {
    readMetadata(): readonly BankMetadataRow[] {
      throw new Error('snapshot unavailable')
    },
  }

  const result = runGenerator({
    assemblyRequest: minimalRequest(),
    bank,
    identity: IDENTITY,
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.fatalDiagnostics[0]?.category, 'bank_unreachable')
  assert.match(
    result.fatalDiagnostics[0]?.explanation ?? '',
    /snapshot unavailable/
  )
}

function verifies_unexpected_failure_is_structured(): void {
  const result = runGenerator({
    assemblyRequest: minimalRequest(),
    bank: new CountingBankAdapter([eligibleRow('Q-000001')]),
    identity: IDENTITY,
    expansionOptions: { headroomFactor: 0 },
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.fatalDiagnostics[0]?.category, 'internal_error')
}

function verifies_determinism_and_input_immutability(): void {
  const request = minimalRequest()
  const rows = [
    eligibleRow('Q-000002', { topic: 'topic-2' }),
    eligibleRow('Q-000001', { topic: 'topic-1' }),
  ]
  const inputBefore = stableStringify({ request, rows })

  const first = runGenerator({
    assemblyRequest: request,
    bank: new CountingBankAdapter(rows),
    identity: IDENTITY,
  })
  const second = runGenerator({
    assemblyRequest: request,
    bank: new CountingBankAdapter(rows),
    identity: IDENTITY,
  })

  assert.equal(stableStringify(first), stableStringify(second))
  assert.equal(stableStringify({ request, rows }), inputBefore)
}

function verifies_production_runtime_has_no_testing_dependency(): void {
  const source = readFileSync(
    new URL('./runtime.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(source, /shared\/testing/)
}

function requestWithLo1Shortfall(): AssemblyRequest {
  return buildAssemblyRequest({
    documentRegistry: [
      buildDocument({
        id: 'LAW-ACT-HED-2562',
        name: 'LAW-ACT-HED-2562',
        tier: 1,
      }),
    ],
    loDistribution: {
      targets: { LO1: 1, LO2: 0, LO3: 0, LO4: 0 } as never,
      typeMap: {
        LO1: ['Memory'],
        LO2: ['Concept'],
        LO3: ['Procedure'],
        LO4: ['Scenario'],
      },
    },
  })
}

function hundredFullRows(): BankMetadataRow[] {
  const rows: BankMetadataRow[] = []
  for (let i = 1; i <= 100; i++) {
    rows.push(
      eligibleRow(`Q-FULL-${i}`, {
        topic: `topic-${i}`,
        questionPattern: 'Positive',
      })
    )
  }
  return rows
}

function verifies_expansion_case_1_unactivated_expansion_ignores_supplemental(): void {
  const request = minimalRequest() // lo targets = 0, 100 distinct topics -> Pass -> expansion NOT activated
  const bank = new CountingBankAdapter(hundredFullRows())
  const supplementalRows = [
    eligibleRow('Q-SUPP-1', { questionPattern: null }),
  ]

  const result = runGenerator({
    assemblyRequest: request,
    bank,
    supplementalRows,
    identity: IDENTITY,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.candidateSet.patternAvailability, 'FULL')
}

function verifies_expansion_case_2_activated_expansion_includes_supplemental_null(): void {
  const request = requestWithLo1Shortfall() // target 10 -> 1 initial row -> shortfall Warning -> expansion ACTIVATED
  const bank = new CountingBankAdapter([
    eligibleRow('Q-000001', { questionPattern: 'Positive' }),
  ])
  const supplementalRows = [
    eligibleRow('Q-SUPP-1', { questionPattern: null }),
  ]

  const result = runGenerator({
    assemblyRequest: request,
    bank,
    supplementalRows,
    identity: IDENTITY,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.candidateSet.patternAvailability, 'PARTIAL')
}

function verifies_expansion_case_3_activated_expansion_initial_unavailable_supp_populated(): void {
  const request = requestWithLo1Shortfall()
  const bank = new CountingBankAdapter([
    eligibleRow('Q-000001', { questionPattern: null }),
  ])
  const supplementalRows = [
    eligibleRow('Q-SUPP-1', { questionPattern: 'Positive' }),
  ]

  const result = runGenerator({
    assemblyRequest: request,
    bank,
    supplementalRows,
    identity: IDENTITY,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.candidateSet.patternAvailability, 'PARTIAL')
}

function verifies_expansion_case_4_structural_purity_includes_secondary_rejected_supplemental(): void {
  const request = requestWithLo1Shortfall()
  const bank = new CountingBankAdapter([
    eligibleRow('Q-000001', { questionPattern: 'Positive' }),
  ])
  const supplementalRows = [
    // Q1: Published + correct document + Pattern NULL, but invalid difficulty (rejected secondary)
    eligibleRow('Q-SUPP-1', { questionPattern: null, difficulty: 'Corrupt' as never }),
    // Q2: Published + correct document + Pattern Positive (accepted)
    eligibleRow('Q-SUPP-2', { questionPattern: 'Positive', difficulty: 'Easy' }),
  ]

  const result = runGenerator({
    assemblyRequest: request,
    bank,
    supplementalRows,
    identity: IDENTITY,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.candidateSet.patternAvailability, 'PARTIAL')
}

function verifies_expansion_case_5_structurally_invalid_supplemental_has_no_effect(): void {
  const request = requestWithLo1Shortfall()
  const bank = new CountingBankAdapter([
    eligibleRow('Q-000001', { questionPattern: 'Positive' }),
  ])
  const supplementalRows = [
    // Wrong document -> excluded structurally
    eligibleRow('Q-SUPP-1', { document: 'WRONG-DOC', questionPattern: null }),
    // Unpublished -> excluded structurally
    eligibleRow('Q-SUPP-2', { status: 'Draft', questionPattern: null }),
  ]

  const result = runGenerator({
    assemblyRequest: request,
    bank,
    supplementalRows,
    identity: IDENTITY,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.candidateSet.patternAvailability, 'FULL')
}

const tests: readonly { readonly name: string; readonly fn: () => void }[] = [
  {
    name: 'executes the complete pipeline and reads the Bank once',
    fn: verifies_complete_pipeline_and_single_bank_read,
  },
  {
    name: 'forwards component fatal diagnostics',
    fn: verifies_component_fatal_is_forwarded,
  },
  {
    name: 'surfaces Bank read failures as bank_unreachable',
    fn: verifies_bank_failure_is_structured,
  },
  {
    name: 'surfaces unexpected failures as internal_error',
    fn: verifies_unexpected_failure_is_structured,
  },
  {
    name: 'is deterministic and does not mutate inputs',
    fn: verifies_determinism_and_input_immutability,
  },
  {
    name: 'has no production dependency on testing fixtures',
    fn: verifies_production_runtime_has_no_testing_dependency,
  },
  {
    name: 'Case 1: unactivated expansion ignores supplemental rows',
    fn: verifies_expansion_case_1_unactivated_expansion_ignores_supplemental,
  },
  {
    name: 'Case 2: activated expansion includes supplemental null pattern',
    fn: verifies_expansion_case_2_activated_expansion_includes_supplemental_null,
  },
  {
    name: 'Case 3: activated expansion initial unavailable + supp populated = PARTIAL',
    fn: verifies_expansion_case_3_activated_expansion_initial_unavailable_supp_populated,
  },
  {
    name: 'Case 4: structural purity includes secondary-rejected supplemental row',
    fn: verifies_expansion_case_4_structural_purity_includes_secondary_rejected_supplemental,
  },
  {
    name: 'Case 5: structurally invalid supplemental rows have no effect',
    fn: verifies_expansion_case_5_structurally_invalid_supplemental_has_no_effect,
  },
]

let passed = 0
let failed = 0
for (const test of tests) {
  try {
    test.fn()
    console.log(`  ✓ ${test.name}`)
    passed += 1
  } catch (error: unknown) {
    console.error(`  ✗ ${test.name}`)
    console.error(
      `    ${error instanceof Error ? error.message : String(error)}`
    )
    failed += 1
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
