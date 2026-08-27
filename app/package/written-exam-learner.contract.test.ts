import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const packagePage = readFileSync(join(process.cwd(), 'app/package/[slug]/page.tsx'), 'utf8')
const packageClient = readFileSync(join(process.cwd(), 'app/package/[slug]/PackageClient.tsx'), 'utf8')
const writtenExamNavigation = readFileSync(join(process.cwd(), 'components/WrittenExamNavigation.tsx'), 'utf8')
const learnerPage = readFileSync(join(process.cwd(), 'app/package/[slug]/written-exam/[materialSlug]/page.tsx'), 'utf8')
const learnerReader = readFileSync(join(process.cwd(), 'app/package/[slug]/written-exam/[materialSlug]/WrittenExamReader.tsx'), 'utf8')
const learnerBoundary = readFileSync(join(process.cwd(), 'lib/writtenExamLearner.ts'), 'utf8')

test('Package integrates safe Written Exam discovery without changing MCQ entry semantics', () => {
  assert.match(packagePage, /discoverPublishedWrittenExamMaterials\(supabase, pkg\.slug\)/)
  assert.match(packagePage, /writtenExams=\{writtenExams\}/)
  assert.match(packageClient, /writtenExams\.length > 0/)
  assert.match(writtenExamNavigation, /aria-label="ข้อสอบอัตนัย"/)
  assert.match(writtenExamNavigation, /ข้อสอบอัตนัย/)
  assert.doesNotMatch(packageClient, /ฝึกวิเคราะห์โจทย์ พร้อมแนวคำตอบและเทคนิคช่วยจำ/)
  assert.doesNotMatch(packageClient, /ข้อสอบอัตนัย ภาค ข/)
  assert.doesNotMatch(packageClient, /lg:grid-cols-3/)
  assert.match(writtenExamNavigation, /package\/\$\{packageSlug\}\/written-exam\/\$\{material\.materialSlug\}/)
  assert.match(packageClient, /ExamNavigation examSets=\{examSets\}/)
  assert.match(packageClient, /ExamNavigation[\s\S]*WrittenExamNavigation/)
})

test('Written Exam presentation reuses the Package content-card language', () => {
  assert.match(packageClient, /className="mt-4"/)
  assert.doesNotMatch(packageClient, /mt-6 border-t border-\[rgba\(212,175,55,0\.15\)\] pt-5/)
  assert.doesNotMatch(packageClient, /ฝึกวิเคราะห์โจทย์ พร้อมแนวคำตอบและเทคนิคช่วยจำ/)
  assert.doesNotMatch(packageClient, /<PenTool/)
  assert.match(writtenExamNavigation, /role="group"/)
  assert.match(writtenExamNavigation, /aria-label="ข้อสอบอัตนัย"/)
  assert.match(writtenExamNavigation, /border: '1px solid rgba\(212,175,55,0\.2\)'/)
  assert.match(writtenExamNavigation, /borderRadius: '16px'/)
  assert.match(writtenExamNavigation, /padding: '14px 16px'/)
  assert.match(writtenExamNavigation, /fontSize: '14px', fontWeight: '600'/)
  assert.match(writtenExamNavigation, /\{materials\.length\}/)
  assert.match(writtenExamNavigation, /import ContentCard from ['"]@\/components\/ContentCard['"]/)
  assert.match(writtenExamNavigation, /<ContentCard[\s\S]*questionCount/)
  assert.match(writtenExamNavigation, /meta=\{\[\{ text: `\$\{material\.questionCount\} ข้อ · อ่านโจทย์และท่องจำแนวคำตอบ` \}\]\}/)
  assert.match(writtenExamNavigation, /flex max-h-\[420px\] flex-col gap-2/)
  assert.doesNotMatch(writtenExamNavigation, /ArrowRight|FileText/)
})

test('learner page uses discovery and the 082 reader, never raw Written Exam table reads', () => {
  assert.match(learnerPage, /discoverPublishedWrittenExamMaterials\(supabase, slug\)/)
  assert.match(learnerPage, /readPublishedWrittenExamForLearner\(supabase, slug, materialSlug\)/)
  assert.match(learnerPage, /getWrittenExamPackageEntitlement\(supabase, user\.id, pkg\.id\)/)
  assert.match(learnerPage, /noindex:\s*true/)
  assert.doesNotMatch(learnerPage, /\.from\(['"]written_exam_/)
  assert.doesNotMatch(learnerBoundary, /\.from\(['"]written_exam_/)
  assert.doesNotMatch(learnerBoundary, /source_md|source_checksum|published_by|archived_by/)
})

test('reader renders all required study sections and navigation states', () => {
  for (const label of [
    'โจทย์',
    'แนวคำตอบ',
    'Keywords',
    'โครงสร้าง/ประเด็นสำคัญในการตอบ',
    'เทคนิคช่วยจำ',
  ]) {
    assert.match(learnerReader, new RegExp(label))
  }
  assert.match(learnerReader, /aria-label="รายการคำถาม Written Exam"/)
  assert.match(learnerReader, /ข้อสอบอัตนัย/)
  assert.match(learnerReader, /\{discoveryQuestionCount\} ข้อ/)
  assert.doesNotMatch(learnerReader, /Written Exam · ภาค ข/)
  assert.match(learnerReader, /disabled=\{!hasPrevious\}/)
  assert.match(learnerReader, /disabled=\{!hasNext\}/)
  assert.match(learnerReader, /overflow-y-auto/)
  assert.match(learnerPage, /kind="login"/)
  assert.match(learnerPage, /kind="locked"/)
  assert.match(learnerPage, /kind="no-content"/)
  assert.match(learnerPage, /kind="error"/)
})
