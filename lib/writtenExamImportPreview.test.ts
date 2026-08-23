import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { getWrittenExamUploadErrorMessage, isSupportedWrittenExamFileName, presentWrittenExamIssue } from './writtenExamImportPreview.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { parseWrittenExamMarkdown } from './writtenExamParser.ts'

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

test('accepts .md and .markdown file names only', () => {
  assert.equal(isSupportedWrittenExamFileName('written-exam.md'), true)
  assert.equal(isSupportedWrittenExamFileName('written-exam.MARKDOWN'), true)
  assert.equal(isSupportedWrittenExamFileName('written-exam.txt'), false)
  assert.equal(isSupportedWrittenExamFileName('written-exam.markdown.bak'), false)
})

test('valid Parser V1 content produces preview data', () => {
  const material = parseWrittenExamMarkdown(VALID_DOCUMENT)

  assert.equal(material.isValid, true)
  assert.deepEqual(material.metadata, {
    formatVersion: 'written-exam-v1',
    packageCode: 'SUPPLIED-BY-SOBDAI',
    title: 'ชุดข้อสอบอัตนัย',
    slug: 'written-exam-set-1',
  })
  assert.equal(material.derived.questionCount, 1)
  assert.equal(material.questions[0]?.questionNumber, 1)
  assert.equal(material.questions[0]?.questionMarkdown, 'อธิบายหลักการใช้อำนาจทางปกครองโดยชอบด้วยกฎหมาย')
  assert.equal(material.questions[0]?.modelAnswerMarkdown, 'อธิบายหลักกฎหมายและเหตุผลประกอบให้ครบถ้วน')
  assert.deepEqual(material.questions[0]?.keywords, ['หลักนิติธรรม', 'การใช้ดุลพินิจ'])
  assert.equal(material.questions[0]?.answerStructureMarkdown, '1. หลักกฎหมาย\n2. การปรับใช้กับข้อเท็จจริง')
  assert.equal(material.questions[0]?.memoryTechniqueMarkdown, 'จำลำดับว่า หลักการ → ข้อเท็จจริง → เหตุผล')
})

test('invalid Parser V1 content produces safe Thai diagnostics', () => {
  const invalid = VALID_DOCUMENT.replace('### แนวคำตอบ', '### คำตอบ')
  const material = parseWrittenExamMarkdown(invalid)
  const issue = material.issues[0]

  assert.equal(material.isValid, false)
  assert.ok(issue)
  const presentation = presentWrittenExamIssue(issue)
  assert.match(presentation.label, /หัวข้อ|ส่วน|รูปแบบ|ไม่ถูกต้อง|ไม่รองรับ/)
  assert.match(presentation.location, /บรรทัด|ข้อ|ส่วน/)
  assert.equal(typeof presentation.detail, 'string')
  assert.doesNotMatch(presentation.detail, /stack trace|at Object\./i)
})

test('upload error messages are safe and Thai-facing', () => {
  assert.match(getWrittenExamUploadErrorMessage('unsupported-file'), /\.md.*\.markdown/)
  assert.match(getWrittenExamUploadErrorMessage('unreadable-file'), /ไม่สามารถอ่านไฟล์/)
  assert.match(getWrittenExamUploadErrorMessage('invalid-content'), /Parser V1/)
})

test('WE-1 has no database or save path', () => {
  const pageSource = readFileSync(
    join(process.cwd(), 'app/admin/written-exams/import/page.tsx'),
    'utf8',
  )
  const clientSource = readFileSync(
    join(process.cwd(), 'app/admin/written-exams/import/ImportClient.tsx'),
    'utf8',
  )

  assert.match(pageSource, /requirePermission\('content\.read'\)/)
  assert.match(pageSource, /parseWrittenExamMarkdown/)
  assert.doesNotMatch(pageSource, /supabase|revalidatePath|\.insert\(|\.update\(|\.delete\(/i)
  assert.doesNotMatch(clientSource, /supabase|revalidatePath|\.insert\(|\.update\(|\.delete\(/i)
  assert.doesNotMatch(clientSource, />\s*(?:Save|Import|Commit)(?:\s|<)/i)
})
