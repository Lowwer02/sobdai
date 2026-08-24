'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import {
  getWrittenExamLifecycleErrorMessage,
  isWrittenExamMaterialId,
  mapWrittenExamLifecycleError,
  normalizeWrittenExamLifecycleResponse,
  normalizeWrittenExamSaveDraftResponse,
  type WrittenExamLifecycleAction,
  type WrittenExamLifecycleResult,
} from '@/lib/writtenExamAdmin'
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

export async function saveWrittenExamDraftForMaterial(
  materialId: string,
  formData: FormData,
): Promise<WrittenExamSaveDraftResult> {
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

  if (!isWrittenExamMaterialId(materialId)) {
    return {
      status: 'error',
      kind: 'invalid-content',
      message: getWrittenExamSaveDraftErrorMessage('invalid-content'),
    }
  }

  const upload = await parseWrittenExamFormData(formData)
  if (upload.status !== 'success') return saveUploadFailure(upload)

  let payload: ReturnType<typeof buildWrittenExamSaveDraftPayload>
  try {
    payload = buildWrittenExamSaveDraftPayload(upload.material, upload.fileName, materialId)
  } catch {
    return {
      status: 'error',
      fileName: upload.fileName,
      kind: 'invalid-content',
      message: getWrittenExamSaveDraftErrorMessage('invalid-content'),
    }
  }

  try {
    const { data, error } = await authorization.supabase.rpc('save_written_exam_draft', payload)
    if (error) {
      const mapped = mapWrittenExamSaveError(error)
      return { status: 'error', fileName: upload.fileName, ...mapped }
    }

    const response = normalizeWrittenExamSaveDraftResponse(data)
    if (!response) {
      return {
        status: 'error',
        fileName: upload.fileName,
        kind: 'unexpected',
        message: getWrittenExamSaveDraftErrorMessage('unexpected'),
      }
    }

    return { status: 'success', fileName: upload.fileName, ...response }
  } catch (error) {
    const mapped = mapWrittenExamSaveError(error)
    return { status: 'error', fileName: upload.fileName, ...mapped }
  }
}

export async function publishWrittenExamMaterial(materialId: string): Promise<WrittenExamLifecycleResult> {
  return runWrittenExamLifecycle('publish', materialId)
}

export async function archiveWrittenExamMaterial(materialId: string): Promise<WrittenExamLifecycleResult> {
  return runWrittenExamLifecycle('archive', materialId)
}

async function runWrittenExamLifecycle(
  action: WrittenExamLifecycleAction,
  materialId: string,
): Promise<WrittenExamLifecycleResult> {
  try {
    const authorization = await requirePermission('content.publish')

    if (!isWrittenExamMaterialId(materialId)) {
      return {
        status: 'error',
        action,
        kind: 'invalid-material',
        message: getWrittenExamLifecycleErrorMessage('invalid-material'),
      }
    }

    const rpcName = action === 'publish' ? 'publish_written_exam' : 'archive_written_exam'
    const { data, error } = await authorization.supabase.rpc(rpcName, {
      p_material_id: materialId,
    })

    if (error) {
      const kind = mapWrittenExamLifecycleError(error)
      return { status: 'error', action, kind, message: getWrittenExamLifecycleErrorMessage(kind) }
    }

    const response = normalizeWrittenExamLifecycleResponse(action, data)
    if (!response) {
      return {
        status: 'error',
        action,
        kind: 'unexpected',
        message: getWrittenExamLifecycleErrorMessage('unexpected'),
      }
    }

    return response
  } catch (error) {
    const kind = mapWrittenExamLifecycleError(error)
    return { status: 'error', action, kind, message: getWrittenExamLifecycleErrorMessage(kind) }
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
