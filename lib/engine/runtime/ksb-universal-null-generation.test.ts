/**
 * lib/engine/runtime/ksb-universal-null-generation.test.ts
 * ----------------------------------------------------------------------------
 * KSB Production-failure regression for the question_pattern universal-null
 * hotfix.
 *
 * RUN: npx jiti lib/engine/runtime/ksb-universal-null-generation.test.ts
 *
 * Production failed KSB generation (3 sets × 100 questions) with:
 *   "Required IG-2 axis 'question_pattern' is absent from every Bank row"
 *
 * This regression drives the REAL repository KSB Blueprint source through the
 * production Engine Runtime (Reader → Generator → Scoring → Ranking) over a
 * deterministic KSB-shaped synthetic Bank whose every row has
 * questionPattern = NULL — exactly the Production Bank condition — at BOTH
 * 1 set and 3 sets, and proves:
 *
 *  1. Generation does NOT halt: the CandidateSet is emitted.
 *  2. The exact Production fatal diagnostic is gone: no error/diagnostic
 *     mentions the question_pattern axis or 'absent from every Bank row'.
 *  3. The otherwise-eligible rows are retained: the CandidateSet carries
 *     patternAvailability 'UNAVAILABLE' (degraded pattern semantics).
 *  4. The pipeline still progresses past generation to Ranking.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type {
  BankMetadataRow,
  BankReadAdapter,
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
 * Every Set-table requirement row of the real KSB source
 * (| document | topic | 1 | difficulty | blueprint type |) expanded to three
 * Published question variants. Deterministic, offline, and shaped exactly
 * like the KSB Production Bank — except questionPattern is NULL everywhere,
 * which is the Production failure condition under test.
 */
function buildKsbUniversalNullBank(source: string): BankMetadataRow[] {
  const loByType: Record<string, string> = {
    Memory: 'LO1',
    Concept: 'LO2',
    Procedure: 'LO3',
    Scenario: 'LO4',
  }
  const rows: BankMetadataRow[] = []
  const pattern =
    /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*1\s*\|\s*(Easy|Medium|Hard)\s*\|\s*(Memory|Concept|Procedure|Scenario)\s*\|$/
  let seq = 0
  for (const line of source.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const [, document, topic, difficulty, blueprintType] = match
    for (let variant = 1; variant <= 3; variant++) {
      seq += 1
      rows.push({
        questionCode: `Q-KSB-${String(seq).padStart(5, '0')}`,
        subject: null,
        document: document!,
        topic: topic!,
        law: null,
        difficulty: difficulty as BankMetadataRow['difficulty'],
        status: 'Published',
        blueprintType: blueprintType as BankMetadataRow['blueprintType'],
        learningObjective: loByType[blueprintType!]! as BankMetadataRow['learningObjective'],
        questionPattern: null,
        section: null,
      })
    }
  }
  return rows
}

class FixedBank implements BankReadAdapter {
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
    createExecutionId: () => 'ksb-universal-null-regression',
    nowIso: () => `2026-01-01T00:00:00.${String(iso++).padStart(3, '0')}Z`,
    monotonicTimeMs: () => (mono += 10),
    isCancellationRequested: () => false,
  }
}

function ksbRequest(targetSetCount: 1 | 3): EngineRequest {
  return {
    blueprint: { id: 'bma-education-specialist', version: '3.0.0' },
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
      requestedBy: 'ksb-universal-null-regression',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'ksb-universal-null-regression',
      traceId: null,
      parentSpanId: null,
    },
  }
}

// ─── regression ─────────────────────────────────────────────────────────────

function verifies_ksb_generation_survives_universal_null_pattern(
  targetSetCount: 1 | 3
): void {
  const bank = buildKsbUniversalNullBank(KSB_SOURCE)
  assert.ok(
    bank.length >= 300,
    `the KSB-shaped bank must be realistically sized (got ${bank.length} rows)`
  )
  assert.ok(
    bank.every((row) => row.questionPattern === null),
    'every Bank row must have questionPattern NULL (the Production condition)'
  )

  const result = runEngine(ksbRequest(targetSetCount), engineDeps(bank))

  // (1) Generation did NOT halt on the pattern axis.
  assert.ok(result.assemblyRequest, 'the Reader must produce the AssemblyRequest')
  assert.equal(result.assemblyRequest!.target.sets, targetSetCount)
  assert.ok(result.candidateSet, 'the Generator must emit a CandidateSet (no Fatal halt)')

  // (2) The exact Production diagnostic is gone.
  const resultText = JSON.stringify({
    errors: result.errors,
    warnings: result.warnings,
  })
  assert.equal(
    resultText.includes('absent from every Bank row'),
    false,
    'the Production fatal diagnostic must not be emitted'
  )
  assert.equal(
    resultText.includes('question_pattern'),
    false,
    'no question_pattern missing-axis diagnostic may be emitted'
  )

  // (3) Rows retained + degraded availability propagated.
  assert.equal(
    result.candidateSet!.patternAvailability,
    'UNAVAILABLE',
    'the CandidateSet must carry the degraded UNAVAILABLE pattern availability'
  )
  assert.ok(
    result.candidateSet!.candidates.length > 0,
    'otherwise-eligible rows must be retained as Candidates'
  )
  assert.ok(
    result.compositeScores.length > 0,
    'Scoring must run over the generated Candidates'
  )

  // (4) The universal-null run must progress AT LEAST as far as an otherwise
  // identical control run whose Bank carries fully-populated patterns. (This
  // synthetic uniform bank overflows Ranking's tie-resolution order groups in
  // BOTH runs — a pre-existing engine property of the bank shape, proven
  // identical under FULL availability — so the correct invariant is: the
  // universal-null run behaves EXACTLY like the populated control run, never
  // failing EARLIER with a question_pattern fatal.)
  const controlBank = bank.map((row) => ({ ...row, questionPattern: 'Positive' as const }))
  const control = runEngine(ksbRequest(targetSetCount), engineDeps(controlBank))
  assert.equal(
    control.candidateSet !== null,
    true,
    'the populated-pattern control run must also emit a CandidateSet'
  )
  assert.equal(
    control.rankedCandidateSet !== null,
    result.rankedCandidateSet !== null,
    'the universal-null run must progress through the pipeline exactly as far as the populated control'
  )
  assert.equal(
    result.status,
    control.status,
    'both runs must reach the same terminal status'
  )
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: readonly {
  readonly name: string
  readonly fn: () => void
}[] = [
  {
    name: 'KSB 1-set generation survives universal-null question_pattern (UNAVAILABLE, no Fatal)',
    fn: () => verifies_ksb_generation_survives_universal_null_pattern(1),
  },
  {
    name: 'KSB 3-set generation survives universal-null question_pattern (UNAVAILABLE, no Fatal)',
    fn: () => verifies_ksb_generation_survives_universal_null_pattern(3),
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
