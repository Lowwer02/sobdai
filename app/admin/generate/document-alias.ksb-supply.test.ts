/**
 * app/admin/generate/document-alias.ksb-supply.test.ts
 * ----------------------------------------------------------------------------
 * KSB candidate-supply regression for the Document Alias Bridge.
 *
 * RUN: npx jiti app/admin/generate/document-alias.ksb-supply.test.ts
 *
 * Drives the REAL production Engine Runtime (Reader → Generator → Scoring →
 * Ranking → Solver) over the REAL KSB Blueprint (bma-education-specialist@
 * 3.0.1) with a deterministic synthetic Bank of RAW official document names —
 * the exact Production condition from the diagnostic (11 of 12 Blueprint
 * documents mismatched, only `การประกันคุณภาพการศึกษา` exact).
 *
 * The Bank adapter projection under test is the SAME projection the generate
 * transport performs (mirrored from app/admin/generate/actions.ts):
 *
 *   raw questions.document → resolveAssessmentDocumentAlias(identity, raw)
 *                          → Engine BankRow.document
 *
 * Proven:
 *  - WITHOUT the projection the pool collapses to 1 document / 12 questions
 *    (the diagnostic's production failure, reproduced synthetically);
 *  - WITH the projection all 12 Blueprint documents are represented
 *    (12/12) and the pool holds every synthetic Question;
 *  - the quantified allocation contract is preserved: 1 Set allocates exactly
 *    100 DISTINCT Question Codes; insufficient physical supply for more Sets
 *    still fails closed;
 *  - question_pattern universal-null remains UNAVAILABLE/advisory;
 *  - the Blueprint LO quantities remain 24 / 34 / 24 / 18.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { runEngine } from '../../../lib/engine'
import type {
  BankMetadataRow,
} from '../../../lib/engine/shared/question-bank'
import type {
  EngineRequest,
  EngineRuntimeDependencies,
} from '../../../lib/engine/runtime/contracts'

import {
  KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY,
  resolveAssessmentDocumentAlias,
  type AssessmentBlueprintIdentity,
} from './document-alias'

const KSB_IDENTITY: AssessmentBlueprintIdentity = {
  id: 'bma-education-specialist',
  version: '3.0.1',
}

const KSB_SOURCE = readFileSync(
  new URL('../../../Blueprint/simulation_exam_blueprint.md', import.meta.url),
  'utf8'
)

const CANONICAL_EXACT_DOCUMENT = 'การประกันคุณภาพการศึกษา'

/** Questions per synthetic document; 12 documents × 12 = 144 ≥ one Set. */
const QUESTIONS_PER_DOCUMENT = 12

const LOS: Array<'LO1' | 'LO2' | 'LO3' | 'LO4'> = ['LO1', 'LO2', 'LO3', 'LO4']
const DIFFICULTIES: Array<BankMetadataRow['difficulty']> = [
  'Easy',
  'Medium',
  'Hard',
]

/**
 * RAW Bank rows carrying the OFFICIAL document names exactly as Production
 * stores them (11 alias sources + 1 already-canonical value). Every row has
 * questionPattern = NULL — the Production Bank condition.
 */
function buildRawBankRows(): BankMetadataRow[] {
  const rawDocuments = [
    ...Object.keys(KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY),
    CANONICAL_EXACT_DOCUMENT,
  ]
  const rows: BankMetadataRow[] = []
  let seq = 0
  for (const rawDocument of rawDocuments) {
    for (let i = 0; i < QUESTIONS_PER_DOCUMENT; i++) {
      seq += 1
      rows.push({
        questionCode: `KSB-SYN-${String(seq).padStart(4, '0')}`,
        subject: null,
        document: rawDocument,
        topic: null,
        law: null,
        difficulty: DIFFICULTIES[seq % 3]!,
        status: 'Published',
        blueprintType: null,
        learningObjective: LOS[seq % 4]!,
        questionPattern: null,
        section: null,
      })
    }
  }
  return rows
}

/**
 * Mirror of the generate transport's Bank adapter projection
 * (app/admin/generate/actions.ts readMetadata).
 */
function projectThroughAdapter(
  rows: readonly BankMetadataRow[],
  useAliasBridge: boolean
): BankMetadataRow[] {
  return rows.map((row) => ({
    ...row,
    document: useAliasBridge
      ? resolveAssessmentDocumentAlias(KSB_IDENTITY, row.document)
      : row.document,
  }))
}

function engineDeps(bank: readonly BankMetadataRow[]): EngineRuntimeDependencies {
  let iso = 0
  let mono = 0
  return {
    readBlueprintSource: () => KSB_SOURCE,
    questionBank: { readMetadata: () => bank },
    observability: { emit: () => undefined },
    createExecutionId: () => 'document-alias.ksb-supply',
    nowIso: () => `2026-01-01T00:00:00.${String(iso++).padStart(3, '0')}Z`,
    monotonicTimeMs: () => (mono += 10),
    isCancellationRequested: () => false,
  }
}

function ksbRequest(targetSetCount: 1 | 2): EngineRequest {
  return {
    blueprint: { ...KSB_IDENTITY },
    profile: 'simulation',
    runUnit: 'blueprint',
    runtimeCompatibility: { targetVersion: '1.0', minimumVersion: '1.0' },
    options: {
      overFetchFactor: 1,
      performanceBudgetMs: null,
      parallelismHint: null,
      auditVerbosity: 'full',
      targetSetCount,
    },
    context: {
      requestedBy: 'document-alias.ksb-supply',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'document-alias.ksb-supply',
      traceId: null,
      parentSpanId: null,
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function raw_bank_collapses_to_one_document(): Promise<void> {
  const rawBank = projectThroughAdapter(buildRawBankRows(), false)
  const result = runEngine(ksbRequest(1), engineDeps(rawBank))
  const stats = result.candidateSet?.statistics
  assert.ok(stats, 'the Generator must emit a CandidateSet even on later failure')
  assert.equal(
    stats.totalCandidates,
    QUESTIONS_PER_DOCUMENT,
    'without the bridge only the single exact-match document survives'
  )
  assert.equal(
    stats.distinctDocuments,
    1,
    'without the bridge the pool collapses to 1 document (the production failure)'
  )
}

async function alias_bridge_restores_all_12_documents(): Promise<void> {
  const bridgedBank = projectThroughAdapter(buildRawBankRows(), true)
  const result = runEngine(ksbRequest(1), engineDeps(bridgedBank))
  const stats = result.candidateSet?.statistics
  assert.ok(stats, 'the Generator must emit a CandidateSet')
  assert.equal(
    stats.totalCandidates,
    12 * QUESTIONS_PER_DOCUMENT,
    'every synthetic Question must reach the CandidateSet'
  )
  assert.equal(
    stats.distinctDocuments,
    12,
    'the bridge must restore all 12 Blueprint documents'
  )
  assert.match(
    result.status,
    /^Completed/,
    `1 Set × 100 must complete with the bridge (got ${result.status})`
  )
}

async function quantified_one_set_allocates_100_distinct(): Promise<void> {
  const bridgedBank = projectThroughAdapter(buildRawBankRows(), true)
  const result = runEngine(ksbRequest(1), engineDeps(bridgedBank))
  const allocation = result.allocatedCandidateSet
  assert.ok(allocation, 'the Solver must emit an AllocatedCandidateSet')
  const codes = allocation.placements
    .filter((placement) => placement.state === 'allocated')
    .filter((placement) => placement.slot.setNumber === 1)
    .map((placement) => placement.assignedCandidate.code)
  assert.equal(codes.length, 100, 'Set 1 must allocate exactly 100 placements')
  assert.equal(
    new Set(codes).size,
    100,
    'Set 1 codes must be globally DISTINCT (no duplication faked)'
  )
}

async function insufficient_supply_still_fails_closed(): Promise<void> {
  const bridgedBank = projectThroughAdapter(buildRawBankRows(), true)
  const result = runEngine(ksbRequest(2), engineDeps(bridgedBank))
  assert.equal(
    result.status,
    'Failed',
    '144 synthetic Questions cannot supply 2 Sets × 100 DISTINCT codes — must fail closed'
  )
  const explanations = (result.errors ?? []).map((error) => error.explanation)
  assert.ok(
    explanations.some((explanation) =>
      /of exactly 100 required Question placements/.test(explanation)
    ),
    'the fail-closed per-Set quantity diagnostic must be present'
  )
}

async function pattern_unavailable_and_lo_targets_preserved(): Promise<void> {
  const bridgedBank = projectThroughAdapter(buildRawBankRows(), true)
  const result = runEngine(ksbRequest(1), engineDeps(bridgedBank))
  assert.equal(
    result.candidateSet?.patternAvailability,
    'UNAVAILABLE',
    'question_pattern universal-null must remain UNAVAILABLE (advisory, not Fatal)'
  )
  const targets = result.assemblyRequest?.loDistribution.targets
  assert.ok(targets, 'the Reader must project LO targets')
  assert.deepEqual(
    targets,
    { LO1: 24, LO2: 34, LO3: 24, LO4: 18 },
    'the Blueprint LO quantities must remain 24 / 34 / 24 / 18'
  )
}

// ─── Runner (established jiti convention) ───────────────────────────────────

const tests = [
  {
    name: 'A: raw official names collapse the pool to 1 document (production failure)',
    fn: raw_bank_collapses_to_one_document,
  },
  {
    name: 'B: alias bridge restores all 12 Blueprint documents (12/12)',
    fn: alias_bridge_restores_all_12_documents,
  },
  {
    name: 'C: quantified 1 Set allocates exactly 100 DISTINCT codes',
    fn: quantified_one_set_allocates_100_distinct,
  },
  {
    name: 'D: insufficient supply for 2 Sets still fails closed',
    fn: insufficient_supply_still_fails_closed,
  },
  {
    name: 'E: pattern UNAVAILABLE + LO 24/34/24/18 preserved',
    fn: pattern_unavailable_and_lo_targets_preserved,
  },
]

let failed = 0
for (const test of tests) {
  try {
    await test.fn()
    console.log(`  ✓ ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${test.name}`)
    console.error(error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
