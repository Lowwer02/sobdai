import { requirePermission } from '@/lib/auth/server-protect'
import {
  getWrittenExamUploadErrorMessage,
  isSupportedWrittenExamFileName,
  type WrittenExamUploadResult,
} from '@/lib/writtenExamImportPreview'
import {
  MAX_WRITTEN_EXAM_SOURCE_BYTES,
  parseWrittenExamMarkdown,
} from '@/lib/writtenExamParser'
import ImportClient from './ImportClient'

export default async function WrittenExamImportPage() {
  await requirePermission('content.read')

  async function parseWrittenExamUpload(formData: FormData): Promise<WrittenExamUploadResult> {
    'use server'

    await requirePermission('content.read')

    const entry = formData.get('file')
    if (!entry || typeof entry !== 'object') {
      return {
        status: 'error',
        kind: 'unreadable-file',
        message: getWrittenExamUploadErrorMessage('unreadable-file'),
      }
    }

    const file = entry as {
      name?: unknown
      size?: unknown
      arrayBuffer?: () => Promise<ArrayBuffer>
    }
    const fileName = typeof file.name === 'string' ? file.name : ''

    if (!isSupportedWrittenExamFileName(fileName)) {
      return {
        status: 'error',
        fileName,
        kind: 'unsupported-file',
        message: getWrittenExamUploadErrorMessage('unsupported-file'),
      }
    }

    if (typeof file.arrayBuffer !== 'function') {
      return {
        status: 'error',
        fileName,
        kind: 'unreadable-file',
        message: getWrittenExamUploadErrorMessage('unreadable-file'),
      }
    }

    const declaredSize = typeof file.size === 'number' ? file.size : null
    if (declaredSize !== null && declaredSize > MAX_WRITTEN_EXAM_SOURCE_BYTES) {
      return {
        status: 'error',
        fileName,
        kind: 'invalid-content',
        message: `ไฟล์มีขนาดเกิน ${MAX_WRITTEN_EXAM_SOURCE_BYTES.toLocaleString()} ไบต์ ซึ่งเป็นขีดจำกัดของ Parser V1`,
      }
    }

    let bytes: ArrayBuffer
    try {
      bytes = await file.arrayBuffer()
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
        kind: 'invalid-content',
        message: `ไฟล์มีขนาดเกิน ${MAX_WRITTEN_EXAM_SOURCE_BYTES.toLocaleString()} ไบต์ ซึ่งเป็นขีดจำกัดของ Parser V1`,
      }
    }

    let source: string
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return {
        status: 'error',
        fileName,
        kind: 'invalid-content',
        message: 'ไฟล์มีการเข้ารหัส UTF-8 ไม่ถูกต้อง จึงไม่สามารถตรวจสอบเนื้อหาได้',
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

  return <ImportClient parseWrittenExamUpload={parseWrittenExamUpload} />
}
