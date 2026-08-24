import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { hasPermission } from './auth/rbac.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { getWrittenExamLifecycleErrorMessage, mapWrittenExamLifecycleError, mapWrittenExamLibraryRows, mapWrittenExamMaterialDetail, mergeWrittenExamVersionRows, normalizeWrittenExamLifecycleResponse, WRITTEN_EXAM_CURRENT_QUESTION_ROW_LIMIT, WRITTEN_EXAM_CURRENT_REVISION_LIMIT, WRITTEN_EXAM_HISTORY_PAGE_SIZE, WRITTEN_EXAM_LIBRARY_PAGE_SIZE } from './writtenExamAdmin.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { buildWrittenExamSaveDraftPayload } from './writtenExamImportSave.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { parseWrittenExamMarkdown } from './writtenExamParser.ts'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { createWrittenExamImportController, runGenerationGuardedOperation } from './writtenExamImportGeneration.ts'

const MATERIAL_ID = '11111111-1111-4111-8111-111111111111'
const DRAFT_ID = '22222222-2222-4222-8222-222222222222'
const PUBLISHED_ID = '33333333-3333-4333-8333-333333333333'

const VALID_DOCUMENT = [
  '---',
  'format_version: "written-exam-v1"',
  'package_code: "SUPPLIED-BY-SOBDAI"',
  'title: "ชุดข้อสอบอัตนัย"',
  'slug: "written-exam-set-1"',
  '---',
  '## ข้อที่ 1',
  '',
  '### โจทย์',
  '',
  'อธิบายหลักการใช้อำนาจทางปกครอง',
  '',
  '### แนวคำตอบ',
  '',
  'อธิบายหลักกฎหมายและเหตุผล',
  '',
  '### Keywords',
  '',
  '- หลักนิติธรรม',
  '',
  '### โครงสร้าง/ประเด็นสำคัญในการตอบ',
  '',
  '1. หลักกฎหมาย',
  '',
  '### เทคนิคช่วยจำ',
  '',
  'หลักการ → ข้อเท็จจริง → เหตุผล',
  '',
].join('\n')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

test('library mapping exposes current published and draft state plus package identity', () => {
  const materials = mapWrittenExamLibraryRows(
    [{
      id: MATERIAL_ID,
      slug: 'written-exam-set-1',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
      packages: { id: 'pkg-1', name: 'แพ็กเกจกฎหมาย', package_code: 'SUPPLIED-BY-SOBDAI', slug: 'law' },
    }],
    [
      {
        id: DRAFT_ID,
        material_id: MATERIAL_ID,
        revision_number: 2,
        format_version: 'written-exam-v1',
        title: 'ชุดข้อสอบอัตนัยฉบับแก้ไข',
        status: 'draft',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
      {
        id: PUBLISHED_ID,
        material_id: MATERIAL_ID,
        revision_number: 1,
        format_version: 'written-exam-v1',
        title: 'ชุดข้อสอบอัตนัย',
        status: 'published',
        updated_at: '2026-08-01T00:00:00.000Z',
        published_at: '2026-08-01T01:00:00.000Z',
      },
    ],
  )

  assert.equal(materials.length, 1)
  assert.equal(materials[0]?.status, 'published')
  assert.equal(materials[0]?.currentDraft?.revisionNumber, 2)
  assert.equal(materials[0]?.currentPublished?.revisionNumber, 1)
  assert.equal(materials[0]?.package?.packageCode, 'SUPPLIED-BY-SOBDAI')
})

test('detail mapping preserves revision ordering and normalized question projection', () => {
  const detail = mapWrittenExamMaterialDetail(
    {
      id: MATERIAL_ID,
      slug: 'written-exam-set-1',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
      packages: { id: 'pkg-1', name: 'แพ็กเกจกฎหมาย', package_code: 'SUPPLIED-BY-SOBDAI', slug: 'law' },
    },
    [{
      id: DRAFT_ID,
      material_id: MATERIAL_ID,
      revision_number: 2,
      format_version: 'written-exam-v1',
      title: 'ชุดข้อสอบอัตนัยฉบับแก้ไข',
      status: 'draft',
      updated_at: '2026-08-02T00:00:00.000Z',
    }],
    [{
      id: 'q-1',
      material_version_id: DRAFT_ID,
      question_number: 1,
      question_markdown: 'โจทย์',
      model_answer_markdown: 'แนวคำตอบ',
      keywords: ['หลักนิติธรรม'],
      answer_structure_markdown: 'โครงสร้าง',
      memory_technique_markdown: 'เทคนิค',
    }],
  )

  assert.ok(detail)
  assert.equal(detail.versions[0]?.questionCount, 1)
  assert.equal(detail.currentDraft?.questions[0]?.answerStructureMarkdown, 'โครงสร้าง')
})

test('metadata-only history rows stay bounded while current content maps full questions', () => {
  const historyVersion = {
    id: 'history-v1',
    material_id: MATERIAL_ID,
    revision_number: 1,
    format_version: 'written-exam-v1',
    title: 'ฉบับเก่า',
    status: 'archived',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
  const currentVersion = {
    id: DRAFT_ID,
    material_id: MATERIAL_ID,
    revision_number: 2,
    format_version: 'written-exam-v1',
    title: 'ฉบับปัจจุบัน',
    status: 'draft',
    updated_at: '2026-08-02T00:00:00.000Z',
  }
  const detail = mapWrittenExamMaterialDetail(
    {
      id: MATERIAL_ID,
      slug: 'written-exam-set-1',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
    },
    mergeWrittenExamVersionRows([historyVersion], [currentVersion]),
    [{
      id: 'q-current',
      material_version_id: DRAFT_ID,
      question_number: 1,
      question_markdown: 'โจทย์ปัจจุบัน',
      model_answer_markdown: 'แนวคำตอบปัจจุบัน',
      keywords: ['keyword'],
      answer_structure_markdown: 'โครงสร้างปัจจุบัน',
      memory_technique_markdown: 'เทคนิคปัจจุบัน',
    }],
  )

  assert.ok(detail)
  assert.equal(detail.currentDraft?.questions.length, 1)
  assert.equal(detail.currentDraft?.questionCount, 1)
  assert.equal(detail.versions.find((version) => version.id === 'history-v1')?.questions.length, 0)
  assert.equal(detail.versions.find((version) => version.id === 'history-v1')?.questionCount, null)
})

test('bounded Admin read contracts use exact counts, deterministic ordering, and explicit windows', () => {
  const libraryPageSource = readFileSync(join(process.cwd(), 'app/admin/written-exams/page.tsx'), 'utf8')
  const detailPageSource = readFileSync(join(process.cwd(), 'app/admin/written-exams/[materialId]/page.tsx'), 'utf8')

  assert.equal(WRITTEN_EXAM_LIBRARY_PAGE_SIZE, 15)
  assert.equal(WRITTEN_EXAM_HISTORY_PAGE_SIZE, 10)
  assert.equal(WRITTEN_EXAM_CURRENT_REVISION_LIMIT, 2)
  assert.equal(WRITTEN_EXAM_CURRENT_QUESTION_ROW_LIMIT, 400)

  assert.match(libraryPageSource, /count: 'exact'/)
  assert.match(libraryPageSource, /\.order\('updated_at', \{ ascending: false \}\)/)
  assert.match(libraryPageSource, /\.order\('id', \{ ascending: false \}\)/)
  assert.match(libraryPageSource, /\.range\(from, to\)/)
  assert.match(libraryPageSource, /written_exam_material_versions\(/)
  assert.match(libraryPageSource, /referencedTable: 'written_exam_material_versions'/)
  assert.match(libraryPageSource, /\.limit\(WRITTEN_EXAM_CURRENT_REVISION_LIMIT, \{/)
  assert.doesNotMatch(libraryPageSource, /Promise\.all\(materialIds\.map/)
  assert.doesNotMatch(libraryPageSource, /\.in\('material_id', materialIds\)/)

  assert.match(detailPageSource, /count: 'exact'/)
  assert.match(detailPageSource, /\.range\(historyFrom, historyTo\)/)
  assert.match(detailPageSource, /\.limit\(WRITTEN_EXAM_CURRENT_REVISION_LIMIT\)/)
  assert.match(detailPageSource, /const currentRevisionIds/)
  assert.match(detailPageSource, /\.in\('material_version_id', currentRevisionIds\)/)
  assert.match(detailPageSource, /\.range\(0, WRITTEN_EXAM_CURRENT_QUESTION_ROW_LIMIT - 1\)/)
  assert.match(detailPageSource, /historyResult\.count === null/)
  assert.match(detailPageSource, /question_markdown, model_answer_markdown, keywords, answer_structure_markdown, memory_technique_markdown/)
  const historyReadStart = detailPageSource.lastIndexOf(".from('written_exam_material_versions')")
  const historyReadEnd = detailPageSource.indexOf('  ])', historyReadStart)
  const historyRead = detailPageSource.slice(historyReadStart, historyReadEnd)
  assert.doesNotMatch(historyRead, /question_markdown|model_answer_markdown|answer_structure_markdown|memory_technique_markdown/)
  assert.doesNotMatch(detailPageSource, /const versionIds/)
})

test('bounded detail merge deduplicates current rows that also appear on history page', () => {
  const older = { id: 'history-v1', revision_number: 1, status: 'archived' }
  const current = { id: DRAFT_ID, revision_number: 2, status: 'draft' }
  const merged = mergeWrittenExamVersionRows([older, current], [current]) as Array<{ id: string }>

  assert.deepEqual(merged.map((row) => row.id), [DRAFT_ID, 'history-v1'])
})

test('existing-material save payload carries the material id and exact Parser V1 source', () => {
  const material = parseWrittenExamMarkdown(VALID_DOCUMENT)
  const payload = buildWrittenExamSaveDraftPayload(material, 'replacement.md', MATERIAL_ID)

  assert.equal(payload.p_material_id, MATERIAL_ID)
  assert.equal(payload.p_source_md, material.sourceMarkdown)
  assert.equal(payload.p_questions.length, 1)
})

test('lifecycle response and errors are normalized to safe Admin messages', () => {
  const published = normalizeWrittenExamLifecycleResponse('publish', {
    material_id: MATERIAL_ID,
    version_id: DRAFT_ID,
    archived_version_id: PUBLISHED_ID,
    question_count: 4,
  })
  assert.equal(published?.status, 'success')
  assert.equal(published?.action, 'publish')

  const archived = normalizeWrittenExamLifecycleResponse('archive', {
    material_id: MATERIAL_ID,
    version_id: PUBLISHED_ID,
    status: 'archived',
  })
  assert.equal(archived?.status, 'success')

  assert.equal(mapWrittenExamLifecycleError({ code: '42501', message: 'permission denied' }), 'authorization-denied')
  assert.equal(mapWrittenExamLifecycleError({ code: 'P0002', message: 'Written Exam has no draft.' }), 'draft-not-found')
  assert.equal(mapWrittenExamLifecycleError({ code: 'P0002', message: 'Written Exam has no published revision to archive.' }), 'published-not-found')
  const safeMessage = getWrittenExamLifecycleErrorMessage('database-conflict')
  assert.match(safeMessage, /ลองใหม่/)
  assert.doesNotMatch(safeMessage, /P0002|42501|stack|at Object/i)
})

test('Admin actions keep read/write authorization and Written Exam mutations RPC-only', () => {
  const actionsSource = readFileSync(join(process.cwd(), 'app/admin/written-exams/actions.ts'), 'utf8')
  const libraryPageSource = readFileSync(join(process.cwd(), 'app/admin/written-exams/page.tsx'), 'utf8')
  const detailPageSource = readFileSync(join(process.cwd(), 'app/admin/written-exams/[materialId]/page.tsx'), 'utf8')

  assert.match(actionsSource, /requirePermission\('content\.write'\)/)
  assert.match(actionsSource, /requirePermission\('content\.publish'\)/)
  assert.match(actionsSource, /p_material_id: materialId/)
  assert.match(actionsSource, /save_written_exam_draft/)
  assert.match(actionsSource, /publish_written_exam/)
  assert.match(actionsSource, /archive_written_exam/)
  assert.doesNotMatch(actionsSource, /\.from\(\s*['"]written_exam_(?:materials|material_versions|questions)['"]/i)
  assert.doesNotMatch(actionsSource, /\.\s*(?:insert|update|delete)\s*\(/i)
  assert.match(detailPageSource, /requirePermission\('content\.read'\)/)
  assert.match(detailPageSource, /written_exam_materials/)
  assert.match(detailPageSource, /written_exam_material_versions/)
  assert.match(detailPageSource, /written_exam_questions/)
  assert.match(libraryPageSource, /requirePermission\('content\.read'\)/)
  assert.equal(hasPermission('editor', 'content.publish'), false)
  assert.equal(hasPermission('admin', 'content.publish'), true)
})

test('stale publish success cannot update a newer preview operation', async () => {
  const controller = createWrittenExamImportController()
  const requestGeneration = controller.beginPublish()
  const pending = deferred<string>()
  let shown: string | null = null

  const running = runGenerationGuardedOperation(controller, requestGeneration, () => pending.promise, {
    onSuccess: (result) => { shown = result },
    onError: () => { shown = 'error' },
    onFinish: () => undefined,
  })

  controller.reset()
  controller.beginParse()
  pending.resolve('published-A')
  await running

  assert.equal(shown, null)
  assert.equal(controller.snapshot().operation, 'parse')
})

test('stale archive rejection cannot update or clean up a newer preview operation', async () => {
  const controller = createWrittenExamImportController()
  const requestGeneration = controller.beginArchive()
  const pending = deferred<never>()
  let errorShown = false

  const running = runGenerationGuardedOperation(controller, requestGeneration, () => pending.promise, {
    onSuccess: () => { errorShown = true },
    onError: () => { errorShown = true },
    onFinish: () => undefined,
  })

  controller.reset()
  controller.beginParse()
  pending.reject(new Error('archive-A failed'))
  await running

  assert.equal(errorShown, false)
  assert.equal(controller.snapshot().operation, 'parse')
})

test('current lifecycle request applies normally and cleans up normally', async () => {
  const controller = createWrittenExamImportController()
  const requestGeneration = controller.beginPublish()
  const pending = deferred<string>()
  let shown: string | null = null
  let finished = false

  const running = runGenerationGuardedOperation(controller, requestGeneration, () => pending.promise, {
    onSuccess: (result) => { shown = result },
    onError: () => undefined,
    onFinish: () => { finished = true },
  })
  pending.resolve('published-current')
  await running

  assert.equal(shown, 'published-current')
  assert.equal(finished, true)
  assert.equal(controller.snapshot().operation, null)
})

test('manage client uses the shared guarded orchestration for parse/save/publish/archive', () => {
  const clientSource = readFileSync(join(process.cwd(), 'app/admin/written-exams/[materialId]/WrittenExamManageClient.tsx'), 'utf8')
  assert.equal((clientSource.match(/runGenerationGuardedOperation\(/g) ?? []).length, 3)
  assert.match(clientSource, /beginSave\(\)/)
  assert.match(clientSource, /beginPublish\(\)/)
  assert.match(clientSource, /beginArchive\(\)/)
})
