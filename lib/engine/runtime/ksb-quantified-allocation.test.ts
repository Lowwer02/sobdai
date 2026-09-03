/**
 * lib/engine/runtime/ksb-quantified-allocation.test.ts
 * ----------------------------------------------------------------------------
 * Quantified allocation regression for the KSB Production failure
 * "6 allocated slots → 6/100 published Questions".
 *
 * RUN: npx jiti lib/engine/runtime/ksb-quantified-allocation.test.ts
 *
 * Drives the REAL production Engine Runtime (Reader → Generator → Scoring →
 * Ranking → Solver) over the REAL KSB Blueprint (bma-education-specialist@
 * 3.0.1) with a deterministic KSB-shaped synthetic Bank whose every row has
 * questionPattern = NULL (the Production Bank condition) and whose Learning
 * Objective supply is sufficient for 3 globally-unique Sets.
 *
 * CONTRACT UNDER TEST (quantified allocation):
 *  - The authored LO quantities (LO1 24 / LO2 34 / LO3 24 / LO4 18) become
 *    executable demand: a successful K-Set run allocates exactly
 *    `target.perSet` DISTINCT Question Codes per Set (100 for KSB).
 *  - The historical "Feasible 6/100" outcome is impossible: a Set is either
 *    complete (100 distinct codes) or the run fails loudly.
 *  - question_pattern universal-null behavior is preserved (no Fatal,
 *    patternAvailability = 'UNAVAILABLE').
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type {
  BankMetadataRow,
} from '../shared/question-bank'
import type {
  EngineRequest,
  EngineRuntimeDependencies,
} from './contracts'
import { runEngine } from './run-engine'

const KSB_SOURCE = readFileSync(
  new URL('../../../Blueprint/simulation_exam_blueprint.md', import.meta.url),
  'utf8'
)

// ─── KSB-shaped synthetic Bank (questionPattern NULL on EVERY row) ──────────

/**
 * Every Set-table requirement row of the real KSB source, expanded into
 * `VARIANTS` deterministically-varied Question variants so Ranking tie groups
 * stay small. LO supply per LO exceeds 3-Set global demand (72/102/72/54).
 */
const VARIANTS = 3

function buildKsbBank(source: string): BankMetadataRow[] {
  const loByType: Record<string, 'LO1' | 'LO2' | 'LO3' | 'LO4'> = {
    Memory: 'LO1',
    Concept: 'LO2',
    Procedure: 'LO3',
    Scenario: 'LO4',
  }
  const difficulties: Array<BankMetadataRow['difficulty']> = ['Easy', 'Medium', 'Hard']
  const rows: BankMetadataRow[] = []
  const pattern =
    /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*1\s*\|\s*(Easy|Medium|Hard)\s*\|\s*(Memory|Concept|Procedure|Scenario)\s*\|$/
  let seq = 0
  for (const line of source.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const [, document, topic, , blueprintType] = match
    for (let variant = 1; variant <= VARIANTS; variant++) {
      seq += 1
      rows.push({
        questionCode: `Q-KSB-${String(seq).padStart(5, '0')}`,
        subject: null,
        document: document!,
        topic: topic!,
        law: null,
        difficulty: difficulties[seq % 3]!,
        status: 'Published',
        blueprintType: blueprintType as BankMetadataRow['blueprintType'],
        learningObjective: loByType[blueprintType!]!,
        questionPattern: null,
        section: null,
      })
    }
  }
  return rows
}

class FixedBank {
  public constructor(private readonly rows: readonly BankMetadataRow[]) {}
  public readMetadata(): readonly BankMetadataRow[] {
    return this.rows
  }
}

function engineDeps(bank: readonly BankMetadataRow[]): EngineRuntimeDependencies {
  let iso = 0
  let mono = 0
  return {
    readBlueprintSource: () => KSB_SOURCE,
    questionBank: new FixedBank(bank),
    observability: { emit: () => undefined },
    createExecutionId: () => 'ksb-quantified-allocation',
    nowIso: () => `2026-01-01T00:00:00.${String(iso++).padStart(3, '0')}Z`,
    monotonicTimeMs: () => (mono += 10),
    isCancellationRequested: () => false,
  }
}

function ksbRequest(targetSetCount: 1 | 2 | 3): EngineRequest {
  return {
    blueprint: { id: 'bma-education-specialist', version: '3.0.1' },
    profile: 'simulation',
    runUnit: 'blueprint',
    runtimeCompatibility: { targetVersion: '1.0', minimumVersion: '1.0' },
    options: {
      overFetchFactor: 2,
      performanceBudgetMs: null,
      parallelismHint: null,
      auditVerbosity: 'full',
      targetSetCount,
    },
    context: {
      requestedBy: 'ksb-quantified-allocation',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'ksb-quantified-allocation',
      traceId: null,
      parentSpanId: null,
    },
  }
}

function allocatedCodesBySet(
  result: ReturnType<typeof runEngine>
): Map<number, string[]> {
  const bySet = new Map<number, string[]>()
  const allocation = result.allocatedCandidateSet
  assert.ok(allocation, 'the Solver must emit an AllocatedCandidateSet')
  for (const placement of allocation.placements) {
    if (placement.state !== 'allocated') continue
    const setNumber = placement.slot.setNumber
    const codes = bySet.get(setNumber) ?? []
    codes.push(placement.assignedCandidate.code)
    bySet.set(setNumber, codes)
  }
  return bySet
}

function assertCompleteQuantifiedSets(
  result: ReturnType<typeof runEngine>,
  targetSetCount: 1 | 2 | 3
): void {
  assert.equal(result.status, 'Completed', 'a fully supplied run must Complete without errors')
  const allocation = result.allocatedCandidateSet
  assert.ok(allocation)
  assert.equal(allocation.feasibility, 'feasible')

  const bySet = allocatedCodesBySet(result)
  const allCodes = new Set<string>()
  for (let setNumber = 1; setNumber <= targetSetCount; setNumber++) {
    const codes = bySet.get(setNumber) ?? []
    assert.equal(
      codes.length,
      100,
      `Set ${setNumber} must allocate exactly 100 Questions (the historical bug produced 6)`
    )
    assert.equal(
      new Set(codes).size,
      codes.length,
      `Set ${setNumber} must contain distinct Question Codes only`
    )
    for (const code of codes) allCodes.add(code)
  }

  // Per-Set physical evidence carried on the allocation contract.
  assert.ok(allocation.perSetPhysicalCounts)
  assert.equal(allocation.perSetPhysicalCounts!.length, targetSetCount)
  for (const entry of allocation.perSetPhysicalCounts!) {
    assert.equal(entry.expectedQuestionCount, 100)
    assert.equal(entry.allocatedQuestionCount, 100)
    assert.equal(entry.distinctQuestionCount, 100)
  }

  // The LO 3.0.1 split is executable: each Set receives its authored
  // quantities (24/34/24/18) because supply is ample.
  const loByCode = new Map<string, string>()
  for (const candidate of result.candidateSet!.candidates) {
    loByCode.set(candidate.identity.questionCode, candidate.metadata.learningObjective as string)
  }
  for (let setNumber = 1; setNumber <= targetSetCount; setNumber++) {
    const codes = bySet.get(setNumber)!
    const counts: Record<string, number> = { LO1: 0, LO2: 0, LO3: 0, LO4: 0 }
    for (const code of codes) counts[loByCode.get(code)!] += 1
    assert.deepEqual(counts, { LO1: 24, LO2: 34, LO3: 24, LO4: 18 })
  }

  // Cross-set behavior is unchanged from the pre-fix engine: the Solver draws
  // from one global Candidate pool, so sets never reuse a Question Code.
  assert.equal(allCodes.size, 100 * targetSetCount)
}

function verifies_ksb_quantified_allocation(targetSetCount: 1 | 2 | 3): void {
  const bank = buildKsbBank(KSB_SOURCE)
  assert.ok(bank.length >= 480, `the KSB-shaped bank must be realistically sized (got ${bank.length})`)
  assert.ok(bank.every((row) => row.questionPattern === null))

  const result = runEngine(ksbRequest(targetSetCount), engineDeps(bank))
  assert.ok(result.candidateSet, 'the Generator must emit a CandidateSet')
  assert.equal(
    result.candidateSet!.patternAvailability,
    'UNAVAILABLE',
    'universal-null question_pattern must remain degraded-advisory'
  )
  assertCompleteQuantifiedSets(result, targetSetCount)

  // The historical failure signature must never reappear.
  const text = JSON.stringify({ errors: result.errors, warnings: result.warnings })
  assert.equal(text.includes('absent from every Bank row'), false)
  assert.equal(text.includes('LO targets sum to'), false)
}

function verifies_insufficient_bank_fails_loud(): void {
  // A tiny bank cannot fill 100 Questions per Set: the engine must FAIL —
  // never emit a partial "Feasible k/100" allocation.
  const bank = buildKsbBank(KSB_SOURCE).slice(0, 10)
  const result = runEngine(ksbRequest(1), engineDeps(bank))
  const allocation = result.allocatedCandidateSet
  if (allocation !== null) {
    const allocated = allocation.placements.filter((p) => p.state === 'allocated')
    assert.notEqual(allocated.length, 100)
    assert.equal(
      allocation.feasibility === 'feasible' && allocated.length < 100,
      false,
      'a partial allocation must never be reported as feasible'
    )
  }
  const quantityFatal = result.errors.some((error) =>
    error.explanation.includes('required Question placements')
  )
  assert.ok(
    quantityFatal || allocation === null,
    'an undersized Bank must surface the per-Set quantity failure loudly'
  )
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: readonly {
  readonly name: string
  readonly fn: () => void
}[] = [
  {
    name: 'KSB 1-set quantified allocation: exactly 100 distinct Questions',
    fn: () => verifies_ksb_quantified_allocation(1),
  },
  {
    name: 'KSB 2-set quantified allocation: exactly 100 distinct Questions per Set',
    fn: () => verifies_ksb_quantified_allocation(2),
  },
  {
    name: 'KSB 3-set quantified allocation: exactly 100 distinct Questions per Set',
    fn: () => verifies_ksb_quantified_allocation(3),
  },
  {
    name: 'KSB insufficient Bank supply fails loudly (no partial Feasible)',
    fn: () => verifies_insufficient_bank_fails_loud(),
  },
]

let failed = 0
for (const test of tests) {
  try {
    test.fn()
    console.log(`  ✓ ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${test.name}`)
    console.error(error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
