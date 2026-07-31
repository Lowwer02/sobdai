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

const QUESTION_BANK_PAGE_SIZE = 1_000

export interface AdminGenerateAssessmentInput {
  readonly blueprintKey: AdminAssessmentBlueprintKey
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

    const [blueprintSource, bankRows] = await Promise.all([
      readFile(
        path.join(
          process.cwd(),
          'Blueprint',
          'simulation_exam_blueprint.md'
        ),
        'utf8'
      ),
      readQuestionBankMetadata(supabase),
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
          return bankRows.map((row) => ({
            questionCode: row.question_code,
            subject: row.subject,
            document: row.document ?? '',
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
  supabase: AdminSupabaseClient
) {
  const rows = []

  for (let from = 0; ; from += QUESTION_BANK_PAGE_SIZE) {
    const to = from + QUESTION_BANK_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('questions')
      .select(
        'question_code, subject, document, topic, law, difficulty, status, blueprint_type, learning_objective, question_pattern, section'
      )
      .not('question_code', 'is', null)
      .order('question_code', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(
        `Question Bank metadata could not be loaded: ${error.message}`
      )
    }

    const page = data ?? []
    rows.push(...page)
    if (page.length < QUESTION_BANK_PAGE_SIZE) {
      return rows
    }
  }
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
    input.auditVerbosity !== 'summary' &&
    input.auditVerbosity !== 'full'
  ) {
    return 'Audit detail must be summary or full.'
  }

  return null
}
