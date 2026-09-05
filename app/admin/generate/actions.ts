'use server'

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { GenerateAssessmentAction } from '@/lib/application'
import { requirePermission } from '@/lib/auth/server-protect'

import {
  ADMIN_ASSESSMENT_BLUEPRINTS,
  type AdminAssessmentBlueprintKey,
} from './config'
import { resolveAssessmentDocumentAlias } from './document-alias'

const QUESTION_BANK_PAGE_SIZE = 1_000

export interface AdminGenerateAssessmentInput {
  readonly blueprintKey: AdminAssessmentBlueprintKey
  readonly targetSetCount?: 1 | 2 | 3 | 4 | 5
  readonly overFetchFactor: number
  readonly auditVerbosity: 'summary' | 'full'
}

/**
 * Admin Server Action transport for the GenerateAssessmentAction use case.
 *
 * Authentication and read-only dependency loading belong to this transport.
 * Assessment generation remains owned by the Application use case and its
 * EngineResponse is returned unchanged for the Review Workspace.
 */
export async function generateAssessmentAdminAction(
  input: AdminGenerateAssessmentInput
) {
  const { user, profile, supabase } =
    await requirePermission('content.write')

  try {
    const inputError = validateAdminGenerateInput(input)
    if (inputError) {
      return {
        success: false as const,
        error: inputError,
      }
    }

    const blueprint = ADMIN_ASSESSMENT_BLUEPRINTS.find(
      (candidate) => candidate.key === input.blueprintKey
    )
    if (!blueprint) {
      return {
        success: false as const,
        error: 'The selected Assessment Blueprint is not available.',
      }
    }

    const packageCode = 'packageCode' in blueprint ? (blueprint as { packageCode?: string }).packageCode : undefined

    const [blueprintSource, bankRows] = await Promise.all([
      readFile(path.join(process.cwd(), blueprint.sourcePath), 'utf8'),
      readQuestionBankMetadata(supabase, packageCode),
    ])

    const submittedAtIso = new Date().toISOString()
    const correlationId = randomUUID()
    const action = GenerateAssessmentAction.create({
      readBlueprintSource(reference) {
        if (
          reference.id !== blueprint.id ||
          reference.version !== blueprint.version
        ) {
          throw new Error(
            'The requested Blueprint reference does not match the loaded immutable source.'
          )
        }
        return blueprintSource
      },
      questionBank: {
        readMetadata() {
          // Document Alias Bridge: project the raw `questions.document` value
          // to the canonical Blueprint registry name for this exact Blueprint
          // identity before the Engine's Document Filter compares it. The raw
          // Bank rows above remain untouched; unknown values pass through
          // unchanged (see ./document-alias.ts).
          return bankRows.map((row) => ({
            questionCode: row.question_code,
            subject: row.subject,
            document: resolveAssessmentDocumentAlias(
              { id: blueprint.id, version: blueprint.version },
              row.document ?? ''
            ),
            topic: row.topic,
            law: row.law,
            difficulty: row.difficulty,
            status: row.status,
            blueprintType: row.blueprint_type,
            learningObjective: row.learning_objective,
            questionPattern: row.question_pattern,
            section: row.section,
          }))
        },
      },
      observability: {
        emit: () => undefined,
      },
      createExecutionId: () => randomUUID(),
      nowIso: () => new Date().toISOString(),
      monotonicTimeMs: () => performance.now(),
      isCancellationRequested: () => false,
    })

    const response = action.execute({
      blueprint: {
        id: blueprint.id,
        version: blueprint.version,
      },
      profile: 'simulation',
      runUnit: 'blueprint',
      runtimeCompatibility: {
        targetVersion: '1.0',
        minimumVersion: '1.0',
      },
      options: {
        overFetchFactor: input.overFetchFactor,
        performanceBudgetMs: null,
        parallelismHint: null,
        auditVerbosity: input.auditVerbosity,
        targetSetCount: input.targetSetCount,
      },
      context: {
        requestedBy: profile.email ?? user.id,
        submittedAtIso,
        correlationId,
        traceId: null,
        parentSpanId: null,
      },
    })

    return {
      success: true as const,
      result: response,
    }
  } catch (error: unknown) {
    return {
      success: false as const,
      error: applicationErrorMessage(error),
    }
  }
}

type AdminSupabaseClient =
  Awaited<ReturnType<typeof requirePermission>>['supabase']

async function readQuestionBankMetadata(
  supabase: AdminSupabaseClient,
  packageCode?: string
) {
  if (!packageCode || packageCode.trim().length === 0) {
    throw new Error('Assessment Blueprint has no package scope configured.')
  }

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

  const { data: examSets, error: examSetsErr } = await supabase
    .from('exam_sets')
    .select('id')
    .eq('package_id', pkg.id)

  if (examSetsErr) {
    throw new Error(`Exam sets for package '${packageCode}' could not be loaded: ${examSetsErr.message}`)
  }

  const examSetIds = (examSets ?? []).map((es) => es.id)
  if (examSetIds.length === 0) {
    return []
  }

  const allEsqRows: any[] = []

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

  const rowsMap = new Map<string, any>()
  for (const row of allEsqRows) {
    const q = (row as any).questions
    if (
      q &&
      q.status === 'Published' &&
      q.question_code &&
      !rowsMap.has(q.question_code)
    ) {
      rowsMap.set(q.question_code, q)
    }
  }

  return Array.from(rowsMap.values())
}

function applicationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Assessment generation could not be completed.'
}

function validateAdminGenerateInput(
  input: AdminGenerateAssessmentInput
): string | null {
  const value: unknown = input
  if (typeof value !== 'object' || value === null) {
    return 'Generation settings are required.'
  }

  if (
    typeof input.blueprintKey !== 'string' ||
    input.blueprintKey.trim().length === 0
  ) {
    return 'Select a supported Assessment Blueprint.'
  }

  if (
    ![1, 1.5, 2, 3].includes(input.overFetchFactor)
  ) {
    return 'Candidate headroom must be one of the supported values.'
  }

  if (
    input.targetSetCount !== undefined &&
    (!Number.isInteger(input.targetSetCount) ||
      input.targetSetCount < 1 ||
      input.targetSetCount > 5)
  ) {
    return 'Target set count must be between 1 and 5 sets.'
  }

  if (
    input.auditVerbosity !== 'summary' &&
    input.auditVerbosity !== 'full'
  ) {
    return 'Audit detail must be summary or full.'
  }

  return null
}
