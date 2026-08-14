import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { BankMetadataRow } from '../../lib/engine/shared/question-bank'
import type { PhysicalSearchResult } from '../../lib/engine/solver/physical-search-result'
import type { PhysicalPlacement } from '../../lib/engine/solver/position-assignment'
import { runEngine } from '../../lib/engine/runtime/run-engine'
import type { EngineRequest, EngineRuntimeDependencies } from '../../lib/engine/runtime/contracts'
import { ADMIN_ASSESSMENT_BLUEPRINTS } from '../../app/admin/generate/config'
import { resolveDocumentIdentity } from '../../app/admin/generate/document-identity'
import type { Difficulty, BlueprintType, LearningObjective, QuestionPattern } from '../../lib/engine/shared/assessment-vocabulary'

const QUESTION_BANK_PAGE_SIZE = 1_000

export interface PackageQaDataReport {
  readonly packageCode: string
  readonly attachedPublishedCount: number
  readonly codedCandidateCount: number
  readonly ignoredWithoutQuestionCodeCount: number
  readonly duplicateQuestionCodeCount: number
  readonly rows: readonly BankMetadataRow[]
  readonly documentCount?: number
  readonly nullBlueprintTypeCount?: number
  readonly nullLearningObjectiveCount?: number
  readonly nullQuestionPatternCount?: number
}

export const CSV_FIXTURE_PATH = path.join(
  process.cwd(),
  'scripts/qa/fixtures/ksb-edu-2026-v10-bank.csv'
)

/**
 * Loads metadata rows offline from the exported CSV snapshot.
 */
export function loadPhysicalSolverPackageQaDataOffline(): PackageQaDataReport {
  if (!existsSync(CSV_FIXTURE_PATH)) {
    throw new Error(`Offline CSV snapshot not found at: ${CSV_FIXTURE_PATH}`)
  }

  const content = readFileSync(CSV_FIXTURE_PATH, 'utf8')
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty')
  }

  // Parse headers: question_code,subject,document,topic,law,difficulty,status,blueprint_type,learning_objective,question_pattern,section
  const headers = lines[0]!.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
  const getIndex = (name: string) => {
    const idx = headers.indexOf(name)
    if (idx === -1) throw new Error(`Missing header: ${name}`)
    return idx
  }

  const codeIdx = getIndex('questionCode')
  const subjectIdx = getIndex('subject')
  const docIdx = getIndex('document')
  const topicIdx = getIndex('topic')
  const lawIdx = getIndex('law')
  const diffIdx = getIndex('difficulty')
  const statusIdx = getIndex('status')
  const bpIdx = getIndex('blueprintType')
  const loIdx = getIndex('learningObjective')
  const patIdx = getIndex('questionPattern')
  const secIdx = getIndex('section')

  const rows: BankMetadataRow[] = []
  const seenCodes = new Set<string>()
  const uniqueDocs = new Set<string>()

  let nullBlueprintTypeCount = 0
  let nullLearningObjectiveCount = 0
  let nullQuestionPatternCount = 0
  let totalRowsProcessed = 0

  // Regex helper to parse CSV line correctly handling quotes
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''))
    return result
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    const cols = parseCsvLine(line)
    if (cols.length < headers.length) continue

    totalRowsProcessed++
    const code = cols[codeIdx] ?? ''
    const status = cols[statusIdx] ?? ''

    // Invariant Check: Blank questionCode exists
    if (!code || code.trim().length === 0) {
      throw new Error(`Fatal Invariant Violation: Blank questionCode found at line ${i + 1}`)
    }

    // Invariant Check: Status is not Published
    if (status !== 'Published') {
      throw new Error(`Fatal Invariant Violation: Question ${code} has non-Published status '${status}'`)
    }

    // Invariant Check: Duplicate questionCode exists
    if (seenCodes.has(code)) {
      throw new Error(`Fatal Invariant Violation: Duplicate questionCode '${code}' found`)
    }
    seenCodes.add(code)

    const normalize = (val: string | undefined): string | null => {
      if (val === undefined || val === null || val === 'null' || val === '') {
        return null
      }
      return val
    }

    const bpVal = normalize(cols[bpIdx])
    const loVal = normalize(cols[loIdx])
    const patVal = normalize(cols[patIdx])

    if (bpVal === null) nullBlueprintTypeCount++
    if (loVal === null) nullLearningObjectiveCount++
    if (patVal === null) nullQuestionPatternCount++

    const doc = cols[docIdx] ?? ''
    if (doc) uniqueDocs.add(doc)

    rows.push({
      questionCode: code,
      subject: normalize(cols[subjectIdx]),
      document: resolveDocumentIdentity(doc),
      topic: normalize(cols[topicIdx]),
      law: normalize(cols[lawIdx]),
      difficulty: cols[diffIdx] as Difficulty,
      status: status,
      blueprintType: bpVal as BlueprintType | null,
      learningObjective: loVal as LearningObjective | null,
      questionPattern: patVal as QuestionPattern | null,
      section: normalize(cols[secIdx]),
    })
  }

  // Invariant Check: Row count !== 520 / final unique count !== 520
  if (totalRowsProcessed !== 520 || rows.length !== 520 || seenCodes.size !== 520) {
    throw new Error(`Fatal Invariant Violation: Expected exactly 520 rows, but processed ${totalRowsProcessed} rows with ${rows.length} valid entries.`)
  }

  return {
    packageCode: 'KSB-EDU-2026-V10',
    attachedPublishedCount: rows.length,
    codedCandidateCount: rows.length,
    ignoredWithoutQuestionCodeCount: 0,
    duplicateQuestionCodeCount: 0,
    rows,
    documentCount: uniqueDocs.size,
    nullBlueprintTypeCount,
    nullLearningObjectiveCount,
    nullQuestionPatternCount,
  }
}

/**
 * Loads metadata rows for KSB-EDU-2026-V10 and returns the QA report.
 * Performs strictly read-only queries on the database.
 */
export async function loadPhysicalSolverPackageQaData(): Promise<PackageQaDataReport> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing required Supabase credentials in process.env (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set).'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const packageCode = 'KSB-EDU-2026-V10'

  // Step 1: Look up package
  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .select('id')
    .eq('package_code', packageCode)
    .maybeSingle()

  if (pkgErr) {
    throw new Error(`Package '${packageCode}' lookup failed: ${pkgErr.message}`)
  }
  if (!pkg) {
    throw new Error(`Package '${packageCode}' could not be found.`)
  }

  // Step 2: Look up exam sets
  const { data: examSets, error: examSetsErr } = await supabase
    .from('exam_sets')
    .select('id')
    .eq('package_id', pkg.id)

  if (examSetsErr) {
    throw new Error(`Exam sets for package '${packageCode}' could not be loaded: ${examSetsErr.message}`)
  }

  const examSetIds = (examSets ?? []).map((es) => es.id)
  if (examSetIds.length === 0) {
    return {
      packageCode,
      attachedPublishedCount: 0,
      codedCandidateCount: 0,
      ignoredWithoutQuestionCodeCount: 0,
      duplicateQuestionCodeCount: 0,
      rows: [],
    }
  }

  const allEsqRows: any[] = []

  // Step 3: Fetch all exam set questions paginated
  for (let from = 0; ; from += QUESTION_BANK_PAGE_SIZE) {
    const to = from + QUESTION_BANK_PAGE_SIZE - 1
    const { data: page, error: esqErr } = await supabase
      .from('exam_set_questions')
      .select(`
        questions (
          question_code,
          subject,
          document,
          topic,
          law,
          difficulty,
          status,
          blueprint_type,
          learning_objective,
          question_pattern,
          section
        )
      `)
      .in('exam_set_id', examSetIds)
      .range(from, to)

    if (esqErr) {
      throw new Error(`Package questions for '${packageCode}' could not be loaded: ${esqErr.message}`)
    }

    const batch = page ?? []
    allEsqRows.push(...batch)
    if (batch.length < QUESTION_BANK_PAGE_SIZE) {
      break
    }
  }

  let attachedPublishedCount = 0
  let ignoredWithoutQuestionCodeCount = 0
  let duplicateQuestionCodeCount = 0
  const rowsMap = new Map<string, BankMetadataRow>()
  const seenCodes = new Set<string>()

  // Step 4: Traversal, filtering, and deduplication
  for (const row of allEsqRows) {
    const q = (row as any).questions
    if (q && q.status === 'Published') {
      attachedPublishedCount++
      const code = q.question_code
      if (!code || code.trim().length === 0) {
        ignoredWithoutQuestionCodeCount++
      } else {
        if (seenCodes.has(code)) {
          duplicateQuestionCodeCount++
        } else {
          seenCodes.add(code)
          rowsMap.set(code, {
            questionCode: code,
            subject: q.subject,
            document: q.document ?? '',
            topic: q.topic,
            law: q.law,
            difficulty: q.difficulty,
            status: q.status,
            blueprintType: q.blueprint_type,
            learningObjective: q.learning_objective,
            questionPattern: q.question_pattern,
            section: q.section,
          })
        }
      }
    }
  }

  return {
    packageCode,
    attachedPublishedCount,
    codedCandidateCount: rowsMap.size,
    ignoredWithoutQuestionCodeCount,
    duplicateQuestionCodeCount,
    rows: Array.from(rowsMap.values()),
  }
}

export interface QaRunnerInput {
  readonly targetSetCount: 1 | 3
  readonly maxNodesVisited: number
}

/**
 * Runs the deterministic Offline Engine QA simulation.
 */
export function runOfflineEngineQa(input: QaRunnerInput): void {
  const { targetSetCount, maxNodesVisited } = input

  if (targetSetCount !== 1 && targetSetCount !== 3) {
    throw new Error('QA Error: targetSetCount must be exactly 1 or 3')
  }

  if (
    typeof maxNodesVisited !== 'number' ||
    !Number.isFinite(maxNodesVisited) ||
    !Number.isInteger(maxNodesVisited) ||
    maxNodesVisited <= 0
  ) {
    throw new Error('QA Error: maxNodesVisited must be a positive finite integer')
  }

  const blueprintConfig = ADMIN_ASSESSMENT_BLUEPRINTS.find(
    (bp) => bp.packageCode === 'KSB-EDU-2026-V10'
  )
  if (!blueprintConfig) {
    throw new Error('QA Error: KSB-EDU-2026-V10 blueprint configuration could not be found.')
  }

  const blueprintPath = path.join(process.cwd(), blueprintConfig.sourcePath)
  const blueprintSource = readFileSync(blueprintPath, 'utf8')

  const qaReport = loadPhysicalSolverPackageQaDataOffline()

  const request: EngineRequest = {
    blueprint: {
      id: blueprintConfig.id,
      version: blueprintConfig.version,
    },
    profile: 'simulation',
    runUnit: 'blueprint',
    runtimeCompatibility: {
      targetVersion: '1.0',
      minimumVersion: '1.0',
    },
    options: {
      overFetchFactor: 2,
      performanceBudgetMs: null,
      parallelismHint: null,
      auditVerbosity: 'summary',
      targetSetCount,
      physicalSolver: {
        maxNodesVisited,
      },
    },
    context: {
      requestedBy: 'physical-solver-package-qa',
      submittedAtIso: new Date().toISOString(),
      correlationId: 'qa-run-' + Date.now(),
      traceId: null,
      parentSpanId: null,
    },
  }

  const dependencies: EngineRuntimeDependencies = {
    readBlueprintSource() {
      return blueprintSource
    },
    questionBank: {
      readMetadata() {
        return qaReport.rows
      },
    },
    observability: {
      emit() {},
    },
    createExecutionId() {
      return 'qa-exec-id'
    },
    nowIso() {
      return new Date().toISOString()
    },
    monotonicTimeMs() {
      return performance.now()
    },
    isCancellationRequested() {
      return false
    },
  }

  console.log(`\nStarting Offline Engine Run...`)
  console.log(`Target Set Count: ${targetSetCount}`)
  console.log(`Max Nodes Visited: ${maxNodesVisited}`)

  const start = performance.now()
  const response = runEngine(request, dependencies)
  const elapsedMs = performance.now() - start

  const physical = response.physicalSolverResult
  if (!physical) {
    console.log('No physicalSolverResult was populated by runEngine.')
    return
  }

  console.log('\n=== Offline Physical Solver Run Report ===')
  console.log(`Total Elapsed Time: ${elapsedMs.toFixed(1)}ms`)
  console.log(`Physical Result Set Count: ${physical.results.length}`)

  let completeSetCount = 0
  let totalPlacements = 0

  for (let i = 0; i < physical.results.length; i++) {
    const res: PhysicalSearchResult = physical.results[i]!
    const setNum = i + 1
    console.log(`\n  Set Number: ${setNum}`)
    console.log(`  Status: ${res.status}`)
    console.log(`  Nodes Visited: ${res.diagnostics.nodesVisited}`)
    console.log(`  Backtracks: ${res.diagnostics.backtracks}`)

    if (res.status === 'COMPLETE') {
      completeSetCount++
      const placementCount: number = res.assignment.placements.length
      totalPlacements += placementCount

      const uniqueCodes: Set<string> = new Set(
        res.assignment.placements.map((p: PhysicalPlacement) => p.candidate.questionCode)
      )
      console.log(`  Placements Count: ${placementCount}`)
      console.log(`  Unique Question Codes: ${uniqueCodes.size}`)
      
      const firstPos: number | undefined = res.assignment.placements[0]?.position.positionNumber
      const lastPos: number | undefined = res.assignment.placements[placementCount - 1]?.position.positionNumber
      console.log(`  First Position: ${firstPos}`)
      console.log(`  Last Position: ${lastPos}`)

      // Assertions
      assert.equal(placementCount, 100, `Set ${setNum} must have exactly 100 placements`)
      assert.equal(uniqueCodes.size, 100, `Set ${setNum} must have exactly 100 unique question codes`)
      assert.equal(firstPos, 1, `Set ${setNum} first position must be 1`)
      assert.equal(lastPos, 100, `Set ${setNum} last position must be 100`)

      // Check order
      for (let j = 0; j < placementCount; j++) {
        const posNum: number = res.assignment.placements[j]!.position.positionNumber
        assert.equal(posNum, j + 1, `Set ${setNum} position numbers must be strictly sequential 1..100`)
      }
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Target Sets: ${targetSetCount}`)
  console.log(`Complete Sets: ${completeSetCount}`)
  console.log(`Total Placements: ${totalPlacements}`)
}

// Allow direct execution
if (require.main === module) {
  const args = process.argv.slice(2)
  const getArgValue = (name: string): string | undefined => {
    const prefix = `--${name}=`
    const arg = args.find((a) => a.startsWith(prefix))
    return arg ? arg.substring(prefix.length) : undefined
  }

  const setsStr = getArgValue('sets')
  const budgetStr = getArgValue('budget')

  if (!setsStr || !budgetStr) {
    console.log('Usage: npx ts-node -O \'{"module": "commonjs", "moduleResolution": "node"}\' scripts/qa/physical-solver-package-qa.ts --sets=<1|3> --budget=<positive integer>')
    console.log('\n(Note: This phase does NOT run the real solver search yet; it compiles and checks args.)')
    process.exit(1)
  }

  const targetSetCount = Number(setsStr)
  const maxNodesVisited = Number(budgetStr)

  if (targetSetCount !== 1 && targetSetCount !== 3) {
    console.error('Error: --sets must be exactly 1 or 3')
    process.exit(1)
  }

  if (!Number.isInteger(maxNodesVisited) || maxNodesVisited <= 0) {
    console.error('Error: --budget must be a positive integer')
    process.exit(1)
  }

  runOfflineEngineQa({
    targetSetCount,
    maxNodesVisited,
  })
}
