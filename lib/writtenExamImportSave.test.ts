import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { buildWrittenExamSaveDraftPayload, mapWrittenExamSaveError, sha256Utf8 } from './writtenExamImportSave.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { parseWrittenExamFormData } from './writtenExamImportUpload.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { getWrittenExamSaveDraftErrorMessage as getSafeSaveErrorMessage } from './writtenExamImportPreview.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { MAX_WRITTEN_EXAM_SOURCE_BYTES, parseWrittenExamMarkdown } from './writtenExamParser.ts'

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
  'อธิบายหลักการใช้อำนาจทางปกครองโดยชอบด้วยกฎหมาย',
  '',
  '### แนวคำตอบ',
  '',
  'อธิบายหลักกฎหมายและเหตุผลประกอบให้ครบถ้วน',
  '',
  '### Keywords',
  '',
  '- หลักนิติธรรม',
  '- การใช้ดุลพินิจ',
  '',
  '### โครงสร้าง/ประเด็นสำคัญในการตอบ',
  '',
  '1. หลักกฎหมาย',
  '2. การปรับใช้กับข้อเท็จจริง',
  '',
  '### เทคนิคช่วยจำ',
  '',
  'จำลำดับว่า หลักการ → ข้อเท็จจริง → เหตุผล',
  '',
].join('\n')

function formDataFor(file: File): FormData {
  const formData = new FormData()
  formData.set('file', file, file.name)
  return formData
}

test('valid Parser V1 output forms an exact trusted Save Draft payload', () => {
  const material = parseWrittenExamMarkdown(VALID_DOCUMENT)
  const payload = buildWrittenExamSaveDraftPayload(material, 'written-exam.md')

  assert.equal(material.isValid, true)
  assert.equal(payload.p_material_id, null)
  assert.equal(payload.p_package_code, 'SUPPLIED-BY-SOBDAI')
  assert.equal(payload.p_slug, 'written-exam-set-1')
  assert.equal(payload.p_title, 'ชุดข้อสอบอัตนัย')
  assert.equal(payload.p_source_md, material.sourceMarkdown)
  assert.equal(payload.p_source_checksum, sha256Utf8(payload.p_source_md))
  assert.equal(sha256Utf8('source-v1'), '88850a88f6a356b5eb4e4be1fa2ccc95de2733368c80d5756c24b2853280cdd8')
  assert.deepEqual(payload.p_questions, [
    {
      question_number: 1,
      question_markdown: 'อธิบายหลักการใช้อำนาจทางปกครองโดยชอบด้วยกฎหมาย',
      model_answer_markdown: 'อธิบายหลักกฎหมายและเหตุผลประกอบให้ครบถ้วน',
      keywords: ['หลักนิติธรรม', 'การใช้ดุลพินิจ'],
      answer_structure_markdown: '1. หลักกฎหมาย\n2. การปรับใช้กับข้อเท็จจริง',
      memory_technique_markdown: 'จำลำดับว่า หลักการ → ข้อเท็จจริง → เหตุผล',
    },
  ])
  assert.equal('order' in payload.p_questions[0]!, false)
})

test('title-only source changes hash the exact normalized persisted source', () => {
  const original = parseWrittenExamMarkdown(VALID_DOCUMENT)
  const titled = parseWrittenExamMarkdown(VALID_DOCUMENT.replace('ชุดข้อสอบอัตนัย', 'ชุดข้อสอบฉบับแก้ไข'))
  const originalPayload = buildWrittenExamSaveDraftPayload(original, 'written-exam.md')
  const titledPayload = buildWrittenExamSaveDraftPayload(titled, 'written-exam.md')

  assert.notEqual(originalPayload.p_title, titledPayload.p_title)
  assert.notEqual(originalPayload.p_source_checksum, titledPayload.p_source_checksum)
  assert.equal(originalPayload.p_source_checksum, sha256Utf8(originalPayload.p_source_md))
  assert.equal(titledPayload.p_source_checksum, sha256Utf8(titledPayload.p_source_md))
})

test('checksum follows Parser V1 BOM and line-ending normalization exactly', () => {
  const sourceWithNormalization = `\uFEFF${VALID_DOCUMENT.replace(/\n/g, '\r\n')}`
  const material = parseWrittenExamMarkdown(sourceWithNormalization)
  const payload = buildWrittenExamSaveDraftPayload(material, 'written-exam.md')

  assert.equal(material.normalization.bomRemoved, true)
  assert.equal(material.normalization.lineEndingsNormalized, true)
  assert.equal(payload.p_source_md, material.sourceMarkdown)
  assert.doesNotMatch(payload.p_source_md, /\r/)
  assert.equal(payload.p_source_checksum, sha256Utf8(material.sourceMarkdown))
})

test('server-side boundary rejects unsupported, oversized, invalid UTF-8, and non-File input', async () => {
  const unsupported = await parseWrittenExamFormData(
    formDataFor(new File(['content'], 'written-exam.txt', { type: 'text/plain' })),
  )
  assert.equal(unsupported.status, 'error')
  if (unsupported.status === 'error') assert.equal(unsupported.kind, 'unsupported-file')

  const oversized = await parseWrittenExamFormData(
    formDataFor(new File([new Uint8Array(MAX_WRITTEN_EXAM_SOURCE_BYTES + 1)], 'written-exam.md')),
  )
  assert.equal(oversized.status, 'error')
  if (oversized.status === 'error') assert.equal(oversized.kind, 'oversized-source')

  const invalidUtf8 = await parseWrittenExamFormData(
    formDataFor(new File([new Uint8Array([0xff, 0xfe, 0xfd])], 'written-exam.md')),
  )
  assert.equal(invalidUtf8.status, 'error')
  if (invalidUtf8.status === 'error') assert.equal(invalidUtf8.kind, 'invalid-utf8')

  const nonFileFormData = new FormData()
  nonFileFormData.set('file', 'not-a-file')
  const nonFile = await parseWrittenExamFormData(nonFileFormData)
  assert.equal(nonFile.status, 'error')
  if (nonFile.status === 'error') assert.equal(nonFile.kind, 'unreadable-file')

  const invalidFormData = await parseWrittenExamFormData({ get: () => new File(['content'], 'written-exam.md') })
  assert.equal(invalidFormData.status, 'error')
  if (invalidFormData.status === 'error') assert.equal(invalidFormData.kind, 'unreadable-file')

  const unreadableFile = new File(['content'], 'written-exam.md')
  Object.defineProperty(unreadableFile, 'arrayBuffer', {
    configurable: true,
    value: async () => {
      throw new Error('read failure')
    },
  })
  const unreadableFormData = new FormData()
  Object.defineProperty(unreadableFormData, 'get', {
    configurable: true,
    value: () => unreadableFile,
  })
  const unreadable = await parseWrittenExamFormData(unreadableFormData)
  assert.equal(unreadable.status, 'error')
  if (unreadable.status === 'error') assert.equal(unreadable.kind, 'unreadable-file')
})

test('Save Draft action requires content.write and uses only the intended RPC', () => {
  const actionsSource = readFileSync(
    join(process.cwd(), 'app/admin/written-exams/import/actions.ts'),
    'utf8',
  )

  assert.match(actionsSource, /requirePermission\('content\.write'\)/)
  assert.match(actionsSource, /parseWrittenExamFormData\(formData\)/)
  assert.match(actionsSource, /buildWrittenExamSaveDraftPayload\(upload\.material/)
  assert.match(actionsSource, /rpc\(\s*['"]save_written_exam_draft['"]/i)
  assert.doesNotMatch(actionsSource, /p_actor|p_role|actorId|created_by/i)
  assert.doesNotMatch(actionsSource, /\.from\(\s*['"]written_exam_(?:materials|material_versions|questions)['"]/i)
  assert.doesNotMatch(actionsSource, /\.\s*(?:insert|update|delete)\s*\(/i)
})

test('expected Save Draft failures map to safe Thai messages', () => {
  const packageError = mapWrittenExamSaveError({
    code: '23503',
    message: 'Written Exam package_code does not resolve to a package.',
  })
  assert.equal(packageError.kind, 'package-not-found')
  assert.match(packageError.message, /ไม่พบ package_code/)
  assert.doesNotMatch(packageError.message, /23503|foreign_key|stack|at Object/i)

  const bindingError = mapWrittenExamSaveError({
    code: '23514',
    message: 'Written Exam package binding or slug cannot be rebound.',
  })
  assert.equal(bindingError.kind, 'binding-conflict')

  const authorizationError = mapWrittenExamSaveError({
    code: '42501',
    message: 'permission denied for function save_written_exam_draft',
  })
  assert.equal(authorizationError.kind, 'authorization-denied')

  const databaseError = mapWrittenExamSaveError({ code: '23505', message: 'duplicate key value violates unique constraint' })
  assert.equal(databaseError.kind, 'database-conflict')
  assert.equal(getSafeSaveErrorMessage('unexpected').includes('ลองใหม่'), true)
})
