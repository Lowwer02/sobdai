import type { WrittenExamSaveDraftResult } from './writtenExamImportPreview'

export type WrittenExamVersionStatus = 'draft' | 'published' | 'archived'

export const WRITTEN_EXAM_LIBRARY_PAGE_SIZE = 15
export const WRITTEN_EXAM_HISTORY_PAGE_SIZE = 10
export const WRITTEN_EXAM_CURRENT_REVISION_LIMIT = 2
export const WRITTEN_EXAM_MAX_QUESTIONS_PER_VERSION = 200
export const WRITTEN_EXAM_CURRENT_QUESTION_ROW_LIMIT =
  WRITTEN_EXAM_CURRENT_REVISION_LIMIT * WRITTEN_EXAM_MAX_QUESTIONS_PER_VERSION

export type WrittenExamAdminPackage = {
  id: string
  name: string
  packageCode: string
  slug: string
}

export type WrittenExamAdminQuestion = {
  id: string
  questionNumber: number
  questionMarkdown: string
  modelAnswerMarkdown: string
  keywords: string[]
  answerStructureMarkdown: string
  memoryTechniqueMarkdown: string
}

export type WrittenExamAdminVersion = {
  id: string
  revisionNumber: number
  formatVersion: string
  title: string
  status: WrittenExamVersionStatus
  sourceFilename: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  archivedAt: string | null
  questionCount: number | null
  questions: WrittenExamAdminQuestion[]
}

export type WrittenExamLibraryItem = {
  id: string
  package: WrittenExamAdminPackage | null
  slug: string
  title: string
  status: WrittenExamVersionStatus | 'empty'
  revisionNumber: number | null
  updatedAt: string
  publishedAt: string | null
  currentDraft: WrittenExamAdminVersion | null
  currentPublished: WrittenExamAdminVersion | null
}

export type WrittenExamMaterialDetail = WrittenExamLibraryItem & {
  createdAt: string
  versions: WrittenExamAdminVersion[]
}

export type WrittenExamLifecycleAction = 'publish' | 'archive'

export type WrittenExamLifecycleErrorKind =
  | 'authorization-denied'
  | 'invalid-material'
  | 'material-not-found'
  | 'draft-not-found'
  | 'published-not-found'
  | 'invalid-content'
  | 'database-conflict'
  | 'unexpected'

export type WrittenExamLifecycleResult =
  | {
      status: 'success'
      action: WrittenExamLifecycleAction
      materialId: string
      versionId: string
      archivedVersionId?: string | null
      questionCount?: number
    }
  | {
      status: 'error'
      action: WrittenExamLifecycleAction
      kind: WrittenExamLifecycleErrorKind
      message: string
    }

export type WrittenExamTitleErrorKind =
  | 'authorization-denied'
  | 'invalid-material'
  | 'material-not-found'
  | 'invalid-title'
  | 'database-conflict'
  | 'unexpected'

export type WrittenExamTitleResult =
  | {
      status: 'success'
      materialId: string
      title: string
    }
  | {
      status: 'error'
      kind: WrittenExamTitleErrorKind
      message: string
    }

export type WrittenExamAdminSaveResult = WrittenExamSaveDraftResult

type UnknownRecord = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isWrittenExamMaterialId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isWrittenExamTitle(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 300
}

export function parseWrittenExamPage(value: unknown): number {
  if (typeof value !== 'string') return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? Math.max(1, parsed) : 1
}

/**
 * Map the staff-only raw table projection into the stable data shape used by
 * the library page. This is intentionally pure so the UI cannot accidentally
 * infer lifecycle state from a client-supplied payload.
 */
export function mapWrittenExamLibraryRows(
  materialRows: unknown,
  versionRows: unknown,
): WrittenExamLibraryItem[] {
  const versionsByMaterial = groupVersions(versionRows)

  if (!Array.isArray(materialRows)) return []

  return materialRows
    .map((row) => {
      const material = asRecord(row)
      if (!material) return null

      const id = asString(material.id)
      const slug = asString(material.slug)
      if (!id || slug === null) return null

      const versions = versionsByMaterial.get(id) ?? []
      return mapLibraryItem(material, versions)
    })
    .filter((item): item is WrittenExamLibraryItem => item !== null)
    .sort((left, right) => {
      const timestampDifference = compareTimestamp(right.updatedAt, left.updatedAt)
      return timestampDifference !== 0
        ? timestampDifference
        : right.id.localeCompare(left.id)
    })
}

export function mapWrittenExamMaterialDetail(
  materialRow: unknown,
  versionRows: unknown,
  questionRows: unknown,
): WrittenExamMaterialDetail | null {
  const material = asRecord(materialRow)
  if (!material) return null

  const id = asString(material.id)
  const slug = asString(material.slug)
  if (!id || slug === null) return null

  const questionsByVersion = groupQuestions(questionRows)
  const versions = normalizeVersions(mergeWrittenExamVersionRows(versionRows)).map((version) => {
    const questions = questionsByVersion.get(version.id)
    return {
      ...version,
      questions: questions ?? [],
      questionCount: questions ? questions.length : null,
    }
  })

  const item = mapLibraryItem(material, versions)
  return {
    ...item,
    createdAt: asString(material.created_at) ?? '',
    versions,
  }
}

/**
 * Detail reads combine a bounded history page with a separate bounded query
 * for the current draft/published rows. A revision can appear in both reads,
 * so merge by id before mapping to avoid duplicate history entries.
 */
export function mergeWrittenExamVersionRows(...values: unknown[]): unknown[] {
  const rowsById = new Map<string, unknown>()
  for (const value of values) {
    if (!Array.isArray(value)) continue
    for (const row of value) {
      const record = asRecord(row)
      const id = record ? asString(record.id) : null
      if (id && !rowsById.has(id)) rowsById.set(id, row)
    }
  }

  return [...rowsById.values()].sort((left, right) => {
    const leftRecord = asRecord(left)
    const rightRecord = asRecord(right)
    const revisionDifference =
      (asInteger(rightRecord?.revision_number) ?? 0) - (asInteger(leftRecord?.revision_number) ?? 0)
    if (revisionDifference !== 0) return revisionDifference
    return (asString(rightRecord?.id) ?? '').localeCompare(asString(leftRecord?.id) ?? '')
  })
}

export function normalizeWrittenExamSaveDraftResponse(value: unknown): {
  materialId: string
  versionId: string
  revisionNumber: number
  questionCount: number
  idempotentRetry: boolean
} | null {
  const response = asRecord(value)
  if (!response) return null

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

export function normalizeWrittenExamTitleResponse(value: unknown): Exclude<WrittenExamTitleResult, { status: 'error' }> | null {
  const response = asRecord(value)
  if (typeof response?.material_id !== 'string' || typeof response.title !== 'string' || !isWrittenExamTitle(response.title)) {
    return null
  }

  return {
    status: 'success',
    materialId: response.material_id,
    title: response.title,
  }
}

export function normalizeWrittenExamLifecycleResponse(
  action: WrittenExamLifecycleAction,
  value: unknown,
): Exclude<WrittenExamLifecycleResult, { status: 'error' }> | null {
  const response = asRecord(value)
  if (!response || typeof response.material_id !== 'string' || typeof response.version_id !== 'string') {
    return null
  }

  if (action === 'publish') {
    if (!Number.isInteger(response.question_count)) return null
    return {
      status: 'success',
      action,
      materialId: response.material_id,
      versionId: response.version_id,
      archivedVersionId: typeof response.archived_version_id === 'string'
        ? response.archived_version_id
        : null,
      questionCount: response.question_count as number,
    }
  }

  if (response.status !== 'archived') return null
  return {
    status: 'success',
    action,
    materialId: response.material_id,
    versionId: response.version_id,
  }
}

export function getWrittenExamLifecycleErrorMessage(
  kind: WrittenExamLifecycleErrorKind,
): string {
  switch (kind) {
    case 'authorization-denied':
      return 'คุณไม่มีสิทธิ์ดำเนินการเปลี่ยนสถานะ Written Exam'
    case 'invalid-material':
      return 'รายการ Written Exam นี้ไม่ถูกต้อง กรุณากลับไปที่คลังแล้วลองใหม่'
    case 'material-not-found':
      return 'ไม่พบรายการ Written Exam นี้ หรือรายการอาจถูกนำออกจากระบบแล้ว'
    case 'draft-not-found':
      return 'ยังไม่มีฉบับร่างที่พร้อมเผยแพร่ กรุณาบันทึกฉบับร่างก่อน'
    case 'published-not-found':
      return 'ยังไม่มีฉบับที่เผยแพร่ให้เก็บถาวร'
    case 'invalid-content':
      return 'เนื้อหา Written Exam ยังไม่ผ่านเงื่อนไขที่จำเป็นสำหรับการเปลี่ยนสถานะ'
    case 'database-conflict':
      return 'ข้อมูลมีการเปลี่ยนแปลงหรือชนกับรายการเดิม กรุณารีเฟรชแล้วลองใหม่'
    case 'unexpected':
      return 'ไม่สามารถดำเนินการ Written Exam ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
  }
}

export function mapWrittenExamLifecycleError(error: unknown): WrittenExamLifecycleErrorKind {
  const candidate = error as { code?: unknown; message?: unknown } | null
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const detail = typeof candidate?.message === 'string' ? candidate.message : ''
  const searchable = `${code} ${detail}`.toLowerCase()

  if (
    code === '42501'
    || /permission denied|insufficient privilege|only an active owner, admin|authenticated content editor/i.test(searchable)
  ) return 'authorization-denied'

  if (code === 'P0002' || /does not exist|no published revision|no draft/i.test(searchable)) {
    if (/material does not exist/i.test(searchable)) return 'material-not-found'
    if (/no published revision|no published|archive/i.test(searchable)) return 'published-not-found'
    if (/no draft/i.test(searchable)) return 'draft-not-found'
  }

  if (code === '22023' || /invalid parameter|question|publish|archive/i.test(searchable)) {
    return 'invalid-content'
  }

  if (code === '23505' || code === '55P03' || /duplicate|unique|lock timeout|serialize|conflict/i.test(searchable)) {
    return 'database-conflict'
  }

  return 'unexpected'
}

export function getWrittenExamTitleErrorMessage(kind: WrittenExamTitleErrorKind): string {
  switch (kind) {
    case 'authorization-denied':
      return 'คุณไม่มีสิทธิ์แก้ไขชื่อ Written Exam'
    case 'invalid-material':
      return 'รายการ Written Exam นี้ไม่ถูกต้อง กรุณากลับไปที่คลังแล้วลองใหม่'
    case 'material-not-found':
      return 'ไม่พบรายการ Written Exam นี้ หรือรายการอาจถูกนำออกจากระบบแล้ว'
    case 'invalid-title':
      return 'ชื่อเรื่องต้องมีความยาว 1-300 ตัวอักษร'
    case 'database-conflict':
      return 'ข้อมูลมีการเปลี่ยนแปลงหรือชนกับรายการเดิม กรุณารีเฟรชแล้วลองใหม่'
    case 'unexpected':
      return 'ไม่สามารถแก้ไขชื่อ Written Exam ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
  }
}

export function mapWrittenExamTitleError(error: unknown): WrittenExamTitleErrorKind {
  const candidate = error as { code?: unknown; message?: unknown } | null
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const detail = typeof candidate?.message === 'string' ? candidate.message : ''
  const searchable = `${code} ${detail}`.toLowerCase()

  if (
    code === '42501'
    || /permission denied|insufficient privilege|only an active owner, admin|authenticated content editor/i.test(searchable)
  ) return 'authorization-denied'

  if (code === 'P0002' || /material does not exist/i.test(searchable)) return 'material-not-found'
  if (code === '22023' || /invalid parameter|title is required/i.test(searchable)) return 'invalid-title'
  if (code === '23505' || code === '55P03' || /duplicate|unique|lock timeout|serialize|conflict/i.test(searchable)) {
    return 'database-conflict'
  }

  return 'unexpected'
}

function mapLibraryItem(
  material: UnknownRecord,
  versions: WrittenExamAdminVersion[],
): WrittenExamLibraryItem {
  const currentDraft = versions.find((version) => version.status === 'draft') ?? null
  const currentPublished = versions.find((version) => version.status === 'published') ?? null
  const active = currentPublished ?? currentDraft ?? versions[0] ?? null

  return {
    id: asString(material.id) ?? '',
    package: normalizePackage(material.packages),
    slug: asString(material.slug) ?? '',
    title: asString(material.title)?.trim() || active?.title || asString(material.slug) || 'Written Exam',
    status: currentPublished?.status ?? currentDraft?.status ?? versions[0]?.status ?? 'empty',
    revisionNumber: active?.revisionNumber ?? null,
    updatedAt: latestTimestamp([
      asString(material.updated_at),
      ...versions.map((version) => version.updatedAt),
    ]),
    publishedAt: currentPublished?.publishedAt ?? null,
    currentDraft,
    currentPublished,
  }
}

function groupVersions(value: unknown): Map<string, WrittenExamAdminVersion[]> {
  const grouped = new Map<string, WrittenExamAdminVersion[]>()
  for (const version of normalizeVersions(value)) {
    const row = version as WrittenExamAdminVersion & { materialId?: string }
    const materialId = row.materialId
    if (!materialId) continue
    const existing = grouped.get(materialId) ?? []
    existing.push(version)
    grouped.set(materialId, existing)
  }
  return grouped
}

function normalizeVersions(value: unknown): Array<WrittenExamAdminVersion & { materialId?: string }> {
  if (!Array.isArray(value)) return []

  const versions: Array<WrittenExamAdminVersion & { materialId?: string }> = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue

    const id = asString(record.id)
    const materialId = asString(record.material_id)
    const revisionNumber = asInteger(record.revision_number)
    const status = normalizeStatus(record.status)
    if (!id || revisionNumber === null || !status) continue

    versions.push({
        id,
        materialId: materialId ?? undefined,
        revisionNumber,
        formatVersion: asString(record.format_version) ?? '',
        title: asString(record.title) ?? '',
        status,
        sourceFilename: asString(record.source_filename),
        createdAt: asString(record.created_at) ?? '',
        updatedAt: asString(record.updated_at) ?? '',
        publishedAt: asString(record.published_at),
        archivedAt: asString(record.archived_at),
        questionCount: null,
        questions: [],
      })
  }

  return versions.sort((left, right) => right.revisionNumber - left.revisionNumber)
}

function groupQuestions(value: unknown): Map<string, WrittenExamAdminQuestion[]> {
  const grouped = new Map<string, WrittenExamAdminQuestion[]>()
  if (!Array.isArray(value)) return grouped

  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const versionId = asString(record.material_version_id)
    const id = asString(record.id)
    const questionNumber = asInteger(record.question_number)
    if (!versionId || !id || !questionNumber) continue

    const questions = grouped.get(versionId) ?? []
    questions.push({
      id,
      questionNumber,
      questionMarkdown: asString(record.question_markdown) ?? '',
      modelAnswerMarkdown: asString(record.model_answer_markdown) ?? '',
      keywords: Array.isArray(record.keywords)
        ? record.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
        : [],
      answerStructureMarkdown: asString(record.answer_structure_markdown) ?? '',
      memoryTechniqueMarkdown: asString(record.memory_technique_markdown) ?? '',
    })
    grouped.set(versionId, questions)
  }

  for (const questions of grouped.values()) {
    questions.sort((left, right) => left.questionNumber - right.questionNumber)
  }
  return grouped
}

function normalizePackage(value: unknown): WrittenExamAdminPackage | null {
  const record = asRecord(value)
  if (!record) return null

  const id = asString(record.id)
  if (!id) return null
  return {
    id,
    name: asString(record.name) ?? 'ไม่ระบุ package',
    packageCode: asString(record.package_code) ?? '',
    slug: asString(record.slug) ?? '',
  }
}

function normalizeStatus(value: unknown): WrittenExamVersionStatus | null {
  return value === 'draft' || value === 'published' || value === 'archived' ? value : null
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asInteger(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null
}

function latestTimestamp(values: Array<string | null>): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => compareTimestamp(right, left))[0] ?? ''
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return left.localeCompare(right)
  return leftTime - rightTime
}
