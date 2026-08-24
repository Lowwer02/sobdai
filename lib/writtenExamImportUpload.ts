// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { getWrittenExamUploadErrorMessage, isSupportedWrittenExamFileName, type WrittenExamUploadResult } from './writtenExamImportPreview.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { MAX_WRITTEN_EXAM_SOURCE_BYTES, parseWrittenExamMarkdown } from './writtenExamParser.ts'

/**
 * Server-side FormData/file boundary for both preview and Save Draft.
 * The client-side extension check is only a UX shortcut; this function is
 * the authoritative boundary before Parser V1 or persistence is reached.
 */
export async function parseWrittenExamFormData(formData: unknown): Promise<WrittenExamUploadResult> {
  if (!isWrittenExamFormData(formData)) {
    return unreadableFileResult()
  }

  const entry = formData.get('file')
  if (!isWrittenExamFile(entry)) {
    return unreadableFileResult()
  }

  const fileName = entry.name

  if (!isSupportedWrittenExamFileName(fileName)) {
    return {
      status: 'error',
      fileName,
      kind: 'unsupported-file',
      message: getWrittenExamUploadErrorMessage('unsupported-file'),
    }
  }

  if (entry.size > MAX_WRITTEN_EXAM_SOURCE_BYTES) {
    return {
      status: 'error',
      fileName,
      kind: 'oversized-source',
      message: getWrittenExamUploadErrorMessage('oversized-source'),
    }
  }

  let bytes: ArrayBuffer
  try {
    bytes = await entry.arrayBuffer()
  } catch {
    return {
      status: 'error',
      fileName,
      kind: 'unreadable-file',
      message: getWrittenExamUploadErrorMessage('unreadable-file'),
    }
  }

  if (bytes.byteLength > MAX_WRITTEN_EXAM_SOURCE_BYTES) {
    return {
      status: 'error',
      fileName,
      kind: 'oversized-source',
      message: getWrittenExamUploadErrorMessage('oversized-source'),
    }
  }

  let source: string
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return {
      status: 'error',
      fileName,
      kind: 'invalid-utf8',
      message: getWrittenExamUploadErrorMessage('invalid-utf8'),
    }
  }

  try {
    const material = parseWrittenExamMarkdown(source)
    return material.isValid
      ? { status: 'success', fileName, material }
      : { status: 'invalid', fileName, material }
  } catch {
    return {
      status: 'error',
      fileName,
      kind: 'invalid-content',
      message: getWrittenExamUploadErrorMessage('invalid-content'),
    }
  }
}

export function isWrittenExamFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

export function isWrittenExamFile(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File
}

function unreadableFileResult(): Extract<WrittenExamUploadResult, { status: 'error' }> {
  return {
    status: 'error',
    kind: 'unreadable-file',
    message: getWrittenExamUploadErrorMessage('unreadable-file'),
  }
}
