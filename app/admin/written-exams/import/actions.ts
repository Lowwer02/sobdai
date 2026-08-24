'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import {
  buildWrittenExamSaveDraftPayload,
  mapWrittenExamSaveError,
} from '@/lib/writtenExamImportSave'
import { parseWrittenExamFormData } from '@/lib/writtenExamImportUpload'
import {
  getWrittenExamSaveDraftErrorMessage,
  type WrittenExamSaveDraftResult,
  type WrittenExamUploadResult,
} from '@/lib/writtenExamImportPreview'

export async function parseWrittenExamUpload(formData: FormData): Promise<WrittenExamUploadResult> {
  await requirePermission('content.read')
  return parseWrittenExamFormData(formData)
}

export async function saveWrittenExamDraft(formData: FormData): Promise<WrittenExamSaveDraftResult> {
  let authorization: Awaited<ReturnType<typeof requirePermission>> | null = null

  try {
    authorization = await requirePermission('content.write')
  } catch {
    return {
      status: 'error',
      kind: 'authorization-denied',
      message: getWrittenExamSaveDraftErrorMessage('authorization-denied'),
    }
  }

  const upload = await parseWrittenExamFormData(formData)
  if (upload.status !== 'success') {
    return saveUploadFailure(upload)
  }

  let payload: ReturnType<typeof buildWrittenExamSaveDraftPayload>
  try {
    payload = buildWrittenExamSaveDraftPayload(upload.material, upload.fileName)
  } catch {
    return {
      status: 'error',
      fileName: upload.fileName,
      kind: 'invalid-content',
      message: getWrittenExamSaveDraftErrorMessage('invalid-content'),
    }
  }

  try {
    const { data, error } = await authorization.supabase.rpc(
      'save_written_exam_draft',
      payload,
    )

    if (error) {
      const mapped = mapWrittenExamSaveError(error)
      return {
        status: 'error',
        fileName: upload.fileName,
        ...mapped,
      }
    }

    const response = normalizeSaveDraftResponse(data)
    if (!response) {
      return {
        status: 'error',
        fileName: upload.fileName,
        kind: 'unexpected',
        message: getWrittenExamSaveDraftErrorMessage('unexpected'),
      }
    }

    return {
      status: 'success',
      fileName: upload.fileName,
      ...response,
    }
  } catch (error) {
    const mapped = mapWrittenExamSaveError(error)
    return {
      status: 'error',
      fileName: upload.fileName,
      ...mapped,
    }
  }
}

function saveUploadFailure(
  upload: Exclude<WrittenExamUploadResult, { status: 'success' }>,
): WrittenExamSaveDraftResult {
  if (upload.status === 'invalid') {
    return {
      status: 'error',
      fileName: upload.fileName,
      kind: 'invalid-content',
      message: getWrittenExamSaveDraftErrorMessage('invalid-content'),
    }
  }

  return {
    status: 'error',
    fileName: upload.fileName,
    kind: upload.kind,
    message: upload.message,
  }
}

function normalizeSaveDraftResponse(value: unknown): {
  materialId: string
  versionId: string
  revisionNumber: number
  questionCount: number
  idempotentRetry: boolean
} | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const response = value as Record<string, unknown>
  if (
    typeof response.material_id !== 'string'
    || typeof response.version_id !== 'string'
    || !Number.isInteger(response.revision_number)
    || !Number.isInteger(response.question_count)
    || typeof response.idempotent_retry !== 'boolean'
  ) {
    return null
  }

  return {
    materialId: response.material_id,
    versionId: response.version_id,
    revisionNumber: response.revision_number as number,
    questionCount: response.question_count as number,
    idempotentRetry: response.idempotent_retry,
  }
}
