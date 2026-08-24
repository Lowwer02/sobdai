import { createHash } from 'node:crypto'
import type { ParsedWrittenExamMaterial } from './writtenExamParser'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { getWrittenExamSaveDraftErrorMessage, type WrittenExamSaveDraftErrorKind } from './writtenExamImportPreview.ts'

export type WrittenExamSaveDraftPayload = {
  p_material_id: string | null
  p_package_code: string
  p_slug: string
  p_format_version: string
  p_title: string
  p_source_md: string
  p_source_checksum: string
  p_source_filename: string
  p_questions: Array<{
    question_number: number
    question_markdown: string
    model_answer_markdown: string
    keywords: string[]
    answer_structure_markdown: string
    memory_technique_markdown: string
  }>
}

/**
 * Hash the exact UTF-8 string that will be passed as p_source_md. Parser V1
 * exposes its BOM/line-ending-normalized source as sourceMarkdown; the caller
 * must send this same value to the RPC to preserve the persistence contract.
 */
export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function buildWrittenExamSaveDraftPayload(
  material: ParsedWrittenExamMaterial,
  sourceFilename: string,
  materialId: string | null = null,
): WrittenExamSaveDraftPayload {
  if (!material.isValid || !material.metadata) {
    throw new Error('Only valid Parser V1 output can be persisted.')
  }

  const sourceMarkdown = material.sourceMarkdown

  return {
    p_material_id: materialId,
    p_package_code: material.metadata.packageCode,
    p_slug: material.metadata.slug,
    p_format_version: material.metadata.formatVersion,
    p_title: material.metadata.title,
    p_source_md: sourceMarkdown,
    p_source_checksum: sha256Utf8(sourceMarkdown),
    p_source_filename: sourceFilename,
    p_questions: material.questions.map((question) => ({
      question_number: question.questionNumber,
      question_markdown: question.questionMarkdown,
      model_answer_markdown: question.modelAnswerMarkdown,
      keywords: question.keywords,
      answer_structure_markdown: question.answerStructureMarkdown,
      memory_technique_markdown: question.memoryTechniqueMarkdown,
    })),
  }
}

export function mapWrittenExamSaveError(error: unknown): {
  kind: WrittenExamSaveDraftErrorKind
  message: string
} {
  const candidate = error as { code?: unknown; message?: unknown } | null
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const detail = typeof candidate?.message === 'string' ? candidate.message : ''
  const searchable = `${code} ${detail}`.toLowerCase()

  let kind: WrittenExamSaveDraftErrorKind = 'unexpected'

  if (
    code === '42501'
    || /permission denied|insufficient privilege|authenticated content editor|only an active owner, admin, or editor/i.test(searchable)
  ) {
    kind = 'authorization-denied'
  } else if (
    code === '23503'
    && /package[_ ]code|package.*resolve/i.test(searchable)
  ) {
    kind = 'package-not-found'
  } else if (
    code === '23514'
    && /binding|rebound|rebind|slug cannot/i.test(searchable)
  ) {
    kind = 'binding-conflict'
  } else if (
    code === '22023'
    || /invalid parameter|question|keywords|checksum|format_version|source must|title is required/i.test(searchable)
  ) {
    kind = 'invalid-content'
  } else if (
    code === '23505'
    || code === '55P03'
    || /duplicate|unique|lock timeout|could not serialize|conflict/i.test(searchable)
  ) {
    kind = 'database-conflict'
  }

  return { kind, message: getWrittenExamSaveDraftErrorMessage(kind) }
}
