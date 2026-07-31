'use server'

import {
  createExamSetAction,
  setExamSetStatusAction,
} from '@/app/admin/exam-sets/actions'
import { requirePermission } from '@/lib/auth/server-protect'

import type {
  PublishApprovedAssessmentInput,
  PublishedExamSet,
} from './publish-contracts'
import { validatePublishInput } from './publish-validation'

/**
 * Product transport for publishing one approved multi-set assessment.
 *
 * Question Codes are resolved against the current Question Bank, then each
 * numbered Engine set is handed to the existing Exam Set create and lifecycle
 * actions. This function never imports or executes the Engine.
 */
export async function publishApprovedAssessmentAction(
  input: PublishApprovedAssessmentInput
) {
  try {
    // Authenticate before parsing caller-controlled collections so an
    // unauthorized request cannot trigger validation or database work.
    const { supabase } = await requirePermission('content.publish')

    const validationError = validatePublishInput(input)
    if (validationError) {
      return {
        success: false as const,
        error: validationError,
        examSets: [] as readonly PublishedExamSet[],
      }
    }

    const { data: destinationPackage, error: packageError } =
      await supabase
        .from('packages')
        .select('id')
        .eq('id', input.packageId)
        .maybeSingle()

    if (packageError) {
      console.error(
        'Assessment publish Package lookup failed:',
        packageError.message
      )
      return {
        success: false as const,
        error: 'The destination Package could not be verified.',
        examSets: [] as readonly PublishedExamSet[],
      }
    }
    if (!destinationPackage) {
      return {
        success: false as const,
        error: 'The selected destination Package no longer exists.',
        examSets: [] as readonly PublishedExamSet[],
      }
    }

    const allQuestionCodes = Array.from(
      new Set(input.sets.flatMap((set) => set.questionCodes))
    )

    const { data: questionRows, error: questionError } = await supabase
      .from('questions')
      .select('id, question_code, status')
      .in('question_code', allQuestionCodes)

    if (questionError) {
      console.error(
        'Assessment publish Question lookup failed:',
        questionError.message
      )
      return {
        success: false as const,
        error:
          'Approved questions could not be resolved from the Question Bank.',
        examSets: [] as readonly PublishedExamSet[],
      }
    }

    const questionByCode = new Map(
      (questionRows ?? []).map((question) => [
        question.question_code,
        question,
      ])
    )
    const missingCodes = allQuestionCodes.filter(
      (code) => !questionByCode.has(code)
    )
    if (missingCodes.length > 0) {
      return {
        success: false as const,
        error: `Publish readiness failed: ${missingCodes.length} approved Question Code${missingCodes.length === 1 ? '' : 's'} no longer exist in the Question Bank.`,
        examSets: [] as readonly PublishedExamSet[],
      }
    }

    const unpublishedCodes = allQuestionCodes.filter(
      (code) => questionByCode.get(code)?.status !== 'Published'
    )
    if (unpublishedCodes.length > 0) {
      return {
        success: false as const,
        error: `Publish readiness failed: ${unpublishedCodes.length} approved Question${unpublishedCodes.length === 1 ? ' is' : 's are'} no longer Published in the Question Bank.`,
        examSets: [] as readonly PublishedExamSet[],
      }
    }

    const createdExamSets: PublishedExamSet[] = []

    for (const set of input.sets) {
      const name =
        input.sets.length === 1
          ? input.baseName.trim()
          : `${input.baseName.trim()} · Set ${set.setNumber}`
      const questionIds = set.questionCodes.map((code) => {
        const question = questionByCode.get(code)
        if (!question) {
          throw new Error(`Question Code ${code} could not be resolved.`)
        }
        return question.id
      })

      const created = await createExamSetAction({
        package_id: input.packageId,
        name,
        description: input.description.trim() || undefined,
        duration_minutes: input.durationMinutes,
        is_sample: input.isSample,
        sort_order: input.sortOrder + set.setNumber - 1,
        display_order: input.displayOrder + set.setNumber - 1,
        question_ids: questionIds,
        exam_type: 'simulation',
        subject: null,
        document: null,
      })

      if (!created.success) {
        if ('id' in created && created.id) {
          createdExamSets.push({
            id: created.id,
            name,
            setNumber: set.setNumber,
            questionCount: questionIds.length,
            status: 'draft',
          })
        }
        return {
          success: false as const,
          error:
            created.error ??
            `Exam Set ${set.setNumber} could not be created.`,
          examSets: createdExamSets,
        }
      }
      if (!('id' in created) || !created.id) {
        return {
          success: false as const,
          error: `Exam Set ${set.setNumber} was created without an identifier.`,
          examSets: createdExamSets,
        }
      }

      createdExamSets.push({
        id: created.id,
        name,
        setNumber: set.setNumber,
        questionCount: questionIds.length,
        status: 'draft',
      })
    }

    for (let index = 0; index < createdExamSets.length; index += 1) {
      const examSet = createdExamSets[index]
      const published = await setExamSetStatusAction(
        examSet.id,
        'published'
      )
      if (!published.success) {
        return {
          success: false as const,
          error:
            published.error ??
            `${examSet.name} could not be published.`,
          examSets: createdExamSets,
        }
      }
      createdExamSets[index] = {
        ...examSet,
        status: 'published',
      }
    }

    return {
      success: true as const,
      examSets: createdExamSets,
    }
  } catch (error: unknown) {
    return {
      success: false as const,
      error:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'The approved assessment could not be published.',
      examSets: [] as readonly PublishedExamSet[],
    }
  }
}
