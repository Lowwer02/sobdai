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
    questionPattern: omittedQuestionPattern,
    ...rowWithoutQuestionPattern
  } = row
  void omittedQuestionPattern

  const result = runGenerator({
    assemblyRequest: minimalRequest(),
    bank: new CountingBankAdapter([rowWithoutQuestionPattern]),
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
