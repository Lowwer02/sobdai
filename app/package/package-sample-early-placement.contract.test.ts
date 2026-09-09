import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * package-sample-early-placement.contract.test.ts
 *
 * Contract test for PACKAGE SAMPLE EXAM EARLY PLACEMENT V1.
 *
 * Covers:
 *  A. Package with sample: early section renders (after Hero, before #resources)
 *  B. No sample: no empty section rendered (sampleExam && guard)
 *  C. Lower list excludes promoted sample by ID (lowerExamSets = es.id !== sampleExam.id)
 *  D. Full exam sets preserved: ExamNavigation still receives lowerExamSets
 *  E. Summaries: SummaryNavigation still rendered
 *  F. Auth/access: existing exam engine auth check unchanged, new CTA uses /login?redirect=
 *  G. isAuthenticated: required boolean prop (not optional) — explicit on PackageClient
 *  H. Metadata display: no hardcoded zeros; conditional on >0
 *  I. Responsive/source contract: no desktop-only hiding; mobile-friendly min-h
 *  J. Query contract: zero new queries in page.tsx; isAuthenticated from existing user var
 *  K. Regression: purchase CTA, SupportCard, and WrittenExamNavigation paths unchanged
 *  L. Copy contract: no hardcoded quality claims; approved safe copy present
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const packagePage     = read('app/package/[slug]/page.tsx')
const packageClient   = read('app/package/[slug]/PackageClient.tsx')
const examPage        = read('app/package/[slug]/exam/[examSetId]/page.tsx')
const sampleSection   = read('components/packages/PackageSampleExamSection.tsx')
const examNavigation  = read('components/ExamNavigation.tsx')

// ── A. Early placement: PackageSampleExamSection is imported and conditionally
//      rendered in PackageClient, after the Hero grid, before #resources ───────
test('A: early sample section is imported and conditionally rendered in PackageClient', () => {
  assert.match(packageClient, /import PackageSampleExamSection from '@\/components\/packages\/PackageSampleExamSection'/)
  // Conditional render guard — only when sampleExam is truthy
  assert.match(packageClient, /\{sampleExam && \(/)
  assert.match(packageClient, /<PackageSampleExamSection/)
  assert.match(packageClient, /sampleExam=\{sampleExam\}/)
  assert.match(packageClient, /packageSlug=\{pkg\.slug\}/)
  assert.match(packageClient, /isAuthenticated=\{isAuthenticated\}/)
})

test('A: early section placement: sampleExam block appears BEFORE #resources section', () => {
  const sampleIdx = packageClient.indexOf('sampleExam && (')
  const resourcesIdx = packageClient.indexOf('id="resources"')
  assert.ok(sampleIdx < resourcesIdx, 'sampleExam section must appear before #resources in source order')
})

test('A: early section placement: sampleExam block appears AFTER the Hero lg:grid-cols-12 container', () => {
  const heroIdx = packageClient.indexOf('lg:col-span-7')
  const sampleIdx = packageClient.indexOf('sampleExam && (')
  assert.ok(heroIdx < sampleIdx, 'sampleExam section must appear after Hero grid in source order')
})

// ── B. No sample guard: empty section is not rendered when sampleExam is null ──
test('B: no empty section rendered when sampleExam is falsy (conditional guard)', () => {
  // The guard is: sampleExam && (<PackageSampleExamSection .../>)
  // When sampleExam is null/undefined, React short-circuits → no render.
  assert.match(packageClient, /const sampleExam = .*\.find\(.*is_sample.*\)/)
  // Falsy path: sampleExam ?? null ensures no truthy coercion
  assert.match(packageClient, /\?\? null/)
})

// ── C. Lower list excludes promoted sample by ID ─────────────────────────────
test('C: ExamNavigation receives lowerExamSets excluding ONLY the promoted sample by ID', () => {
  assert.match(packageClient, /const lowerExamSets = sampleExam\s*\?\s*\(?examSets[^;]*\.filter\(\(es[^)]*\) => es\.id !== sampleExam\.id\)\s*:\s*examSets/)
  assert.match(packageClient, /ExamNavigation[\s\S]*examSets=\{lowerExamSets\}/)
})

test('C: implementation does NOT use filter(es => !es.is_sample) for lower-list data', () => {
  // P2 fix requirement: do not remove every is_sample record, which would hide secondary samples
  assert.doesNotMatch(packageClient, /filter\(\(?es\)?\s*=>\s*!es\.is_sample\)/)
  assert.doesNotMatch(packageClient, /regularExamSets/)
})

test('C: lowerExamSets semantics: no-sample path preserves all examSets', () => {
  const mockExamSets = [
    { id: 'exam-1', name: 'Exam 1', is_sample: false },
    { id: 'exam-2', name: 'Exam 2', is_sample: false },
  ]
  const sampleExam = mockExamSets.find((es) => es.is_sample) ?? null
  const lowerExamSets = sampleExam
    ? mockExamSets.filter((es) => es.id !== sampleExam.id)
    : mockExamSets

  assert.equal(sampleExam, null)
  assert.equal(lowerExamSets, mockExamSets)
  assert.equal(lowerExamSets.length, 2)
})

test('C: lowerExamSets semantics: single sample promoted early and excluded from lower list by ID', () => {
  const mockExamSets = [
    { id: 'sample-1', name: 'Sample Exam', is_sample: true },
    { id: 'exam-1', name: 'Regular Exam 1', is_sample: false },
    { id: 'exam-2', name: 'Regular Exam 2', is_sample: false },
  ]
  const sampleExam = mockExamSets.find((es) => es.is_sample) ?? null
  const lowerExamSets = sampleExam
    ? mockExamSets.filter((es) => es.id !== sampleExam.id)
    : mockExamSets

  assert.equal(sampleExam?.id, 'sample-1')
  assert.equal(lowerExamSets.length, 2)
  assert.deepEqual(lowerExamSets.map((es) => es.id), ['exam-1', 'exam-2'])
  assert.ok(!lowerExamSets.some((es) => es.id === 'sample-1'))
})

test('C: lowerExamSets semantics: multiple sample anomaly preserves secondary sample records in lower list', () => {
  const mockExamSets = [
    { id: 'sample-1', name: 'Sample Exam 1', is_sample: true },
    { id: 'exam-1', name: 'Regular Exam 1', is_sample: false },
    { id: 'sample-2', name: 'Sample Exam 2', is_sample: true },
    { id: 'exam-2', name: 'Regular Exam 2', is_sample: false },
  ]
  const sampleExam = mockExamSets.find((es) => es.is_sample) ?? null
  const lowerExamSets = sampleExam
    ? mockExamSets.filter((es) => es.id !== sampleExam.id)
    : mockExamSets

  // Deterministic first resolved sample remains promoted early
  assert.equal(sampleExam?.id, 'sample-1')
  // ONLY promoted sample is excluded; secondary sample is preserved and discoverable
  assert.equal(lowerExamSets.length, 3)
  assert.deepEqual(lowerExamSets.map((es) => es.id), ['exam-1', 'sample-2', 'exam-2'])
  assert.ok(lowerExamSets.some((es) => es.id === 'sample-2' && es.is_sample))
})

// ── D. Full exam sets preserved ──────────────────────────────────────────────
test('D: ExamNavigation is still rendered with lowerExamSets', () => {
  assert.match(packageClient, /<ExamNavigation/)
  assert.match(packageClient, /examSets=\{lowerExamSets\}/)
  // Summaries section preserved
  assert.match(packageClient, /<SummaryNavigation/)
})

// ── E. Summaries preserved ────────────────────────────────────────────────────
test('E: SummaryNavigation remains present with summaries prop', () => {
  assert.match(packageClient, /SummaryNavigation summaries=\{summaries\}/)
})

// ── F. Auth/access invariants ──────────────────────────────────────────────────
test('F: existing exam engine auth check is unchanged (no user → redirect login)', () => {
  // The authoritative auth check in the exam engine page must not be modified.
  assert.match(examPage, /if \(!user\)/)
  assert.match(examPage, /redirect\(`\/login\?redirect=\/package\/\$\{slug\}\/exam\/\$\{examSetId\}`\)/)
  assert.match(examPage, /const needsAccessCheck = !examSet\.is_sample/)
})

test('F: guest CTA in PackageSampleExamSection uses /login?redirect= convention', () => {
  // The component must encode the exam URL as the redirect param.
  assert.match(sampleSection, /\/login\?redirect=/)
  assert.match(sampleSection, /encodeURIComponent\(examHref\)/)
  // Must derive examHref from packageSlug and sampleExam.id
  assert.match(sampleSection, /\/package\/\$\{packageSlug\}\/exam\/\$\{sampleExam\.id\}/)
})

test('F: authenticated CTA routes directly to exam page (no auth modal invented)', () => {
  assert.match(sampleSection, /ctaHref = isAuthenticated \? examHref : loginHref/)
})

// ── G. isAuthenticated is a required boolean (not optional) ───────────────────
test('G: isAuthenticated is required boolean in PackageSampleExamSection props', () => {
  assert.match(sampleSection, /isAuthenticated: boolean/)
  // Must not have a default value (i.e., must not be optional with = false)
  assert.doesNotMatch(sampleSection, /isAuthenticated\?: boolean/)
})

test('G: PackageClient declares isAuthenticated as required prop', () => {
  assert.match(packageClient, /isAuthenticated: boolean/)
  assert.doesNotMatch(packageClient, /isAuthenticated\?: boolean/)
})

test('G: page.tsx passes isAuthenticated={Boolean(user)} using already-resolved user', () => {
  assert.match(packagePage, /isAuthenticated=\{Boolean\(user\)\}/)
  // The user variable must already be resolved from the parallel fetch, not a new query.
  assert.match(packagePage, /const user = userResult\.data\.user/)
  // Confirm no new supabase.auth.getUser() call was added after the existing one
  const getUserMatches = packagePage.match(/supabase\.auth\.getUser\(\)/g) ?? []
  assert.equal(getUserMatches.length, 1, 'Exactly one supabase.auth.getUser() call (no new query added)')
})

// ── H. Metadata display: no misleading zero values ────────────────────────────
test('H: PackageSampleExamSection only shows duration when >0', () => {
  assert.match(sampleSection, /hasDuration = sampleExam\.duration_minutes > 0/)
  assert.match(sampleSection, /hasDuration && \(/)
})

test('H: PackageSampleExamSection only shows question count when >0', () => {
  assert.match(sampleSection, /hasQuestionCount = \(sampleExam\.qCount \?\? 0\) > 0/)
  assert.match(sampleSection, /hasQuestionCount && \(/)
})

// ── I. Responsive/source contract ─────────────────────────────────────────────
test('I: CTA button has min-h for mobile tap target', () => {
  assert.match(sampleSection, /min-h-\[48px\]/)
})

test('I: section uses responsive flex-col lg:flex-row layout (no desktop-only hiding)', () => {
  assert.match(sampleSection, /flex-col lg:flex-row/)
})

test('I: no desktop-only hidden class that would exclude mobile from seeing the section', () => {
  // The section itself must not be wrapped in a hidden sm:block or lg:block guard
  assert.doesNotMatch(sampleSection, /className="hidden [^"]*lg:block/)
})

// ── J. Zero new queries ────────────────────────────────────────────────────────
test('J: sampleExam is derived from existing examSets prop, not a new Supabase query', () => {
  // PackageClient is a client component — no supabase calls allowed in it anyway.
  // Verify the derivation pattern.
  assert.match(packageClient, /sampleExam = .*examSets.*find/)
  // No supabase import in PackageClient
  assert.doesNotMatch(packageClient, /createClient|supabase\.from/)
})

// ── K. Regression invariants ────────────────────────────────────────────────────
test('K: purchase CTA (checkout link) is unchanged', () => {
  assert.match(packageClient, /\/checkout\/\$\{pkg\.id\}/)
  assert.match(packageClient, /ซื้อแพ็กเกจนี้/)
})

test('K: isPurchased flag and purchased CTA are unchanged', () => {
  assert.match(packageClient, /isPurchased/)
  assert.match(packageClient, /เริ่มเรียน/)
})

test('K: WrittenExamNavigation is still rendered when writtenExams.length > 0', () => {
  assert.match(packageClient, /writtenExams\.length > 0/)
  assert.match(packageClient, /<WrittenExamNavigation/)
})

test('K: SupportCard is still conditionally rendered', () => {
  assert.match(packageClient, /supportConfig\.enabled && \(/)
  assert.match(packageClient, /<SupportCard/)
})

// ── L. Copy contract: safe approved copy, no hardcoded quality claims ──────────
test('L: approved headline copy is present in PackageSampleExamSection', () => {
  assert.match(sampleSection, /ลองทำข้อสอบตัวอย่างก่อนตัดสินใจ/)
  assert.match(sampleSection, /ทดลองทำข้อสอบจากแพ็กเกจนี้ฟรีก่อนตัดสินใจ/)
})

test('L: guest reassurance copy uses approved wording', () => {
  assert.match(sampleSection, /เข้าสู่ระบบเพื่อเริ่มทำ • ไม่ต้องซื้อแพ็กเกจก่อน/)
})

test('L: no hardcoded quality claims in PackageSampleExamSection', () => {
  assert.doesNotMatch(sampleSection, /เฉลยละเอียดครบทุกข้อ/)
  assert.doesNotMatch(sampleSection, /ระบบจำลองสอบและตรวจคำตอบเสมือนจริง/)
})

test('L: section has unique id on CTA for accessibility / browser testing', () => {
  assert.match(sampleSection, /id="package-sample-exam-cta"/)
})

test('L: section has aria-label for screen-reader landmark', () => {
  assert.match(sampleSection, /aria-label="ข้อสอบตัวอย่าง"/)
})
