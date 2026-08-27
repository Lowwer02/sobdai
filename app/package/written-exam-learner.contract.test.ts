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
  assert.match(packageClient, /aria-label="ข้อสอบอัตนัย"/)
  assert.match(packageClient, /ข้อสอบอัตนัย/)
  assert.match(packageClient, /ฝึกวิเคราะห์โจทย์ พร้อมแนวคำตอบและเทคนิคช่วยจำ/)
  assert.doesNotMatch(packageClient, /ข้อสอบอัตนัย ภาค ข/)
  assert.doesNotMatch(packageClient, /lg:grid-cols-3/)
  assert.match(writtenExamNavigation, /package\/\$\{packageSlug\}\/written-exam\/\$\{material\.materialSlug\}/)
  assert.match(packageClient, /ExamNavigation examSets=\{examSets\}/)
  assert.match(packageClient, /ExamNavigation[\s\S]*WrittenExamNavigation/)
})

test('Written Exam presentation reuses the Package content-card language', () => {
  assert.match(packageClient, /section aria-label="ข้อสอบอัตนัย" className="mt-6 border-t/)
  assert.match(packageClient, /text-\[14px\] font-semibold leading-5 text-\[#F5E9D6\]/)
  assert.doesNotMatch(packageClient, /<PenTool/)
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
