import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * written-exam-theme.ui-contract.test.ts
 *
 * Theme P2C.3 — Written Exam on the globally semantic SummaryMarkdown renderer.
 * P2C.2's transitional .we-markdown-adaptive Light bridge is deleted: the
 * renderer is now fully semantic and the Written Exam learner inherits
 * Light/Dark through the normal theme tokens like every other theme-ready
 * consumer.
 *
 * Pins:
 *  A. Written Exam learner route files no longer carry hardcoded theme
 *     literals (with an explicit whitelist for the intentional survivors).
 *  B. WrittenExamReader renders plain SummaryMarkdown — no adaptive scope
 *     class and no theme/variant/adaptive props.
 *  C. The P2C.2 adaptive bridge is gone from globals.css AND active source.
 *  D. The global semantic renderer contract exists (prose tokens + dark
 *     parent island) so the reader's Light/Dark output needs no local bridge.
 *  E. SummaryMarkdown itself stays untouched — no adaptive/theme/variant prop,
 *     shared pipeline byte-identical.
 *  F. Critical Written Exam behavioral contracts remain present.
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const dir = 'app/package/[slug]/written-exam/[materialSlug]'
const reader = read(`${dir}/WrittenExamReader.tsx`)
const examPage = read(`${dir}/page.tsx`)
const loading = read(`${dir}/loading.tsx`)
const errorBoundary = read(`${dir}/error.tsx`)
const globals = read('app/globals.css')
const summaryMarkdown = read('components/summary/SummaryMarkdown.tsx')

// Intentional survivors: the gold hover fill on primary CTAs is the released
// P2C precedent (bg-brand-solid + literal lighter-gold hover) and works in
// both themes; it is the only hex these route files may still carry.
const CTA_HOVER_WHITELIST = /hover:bg-\[#F1D17A\]/g

function assertNoScopedDarkLiterals(name: string, source: string, whitelist: RegExp[] = []) {
  let stripped = source
  for (const pattern of whitelist) stripped = stripped.replace(pattern, '')
  const leftover = stripped.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)
  assert.equal(
    leftover,
    null,
    `${name} must not carry hardcoded theme color literals after P2C.3; found: ${leftover?.join(', ') ?? 'none'}`,
  )
}

test('A: written exam route files drop scoped dark literals (whitelist: CTA gold hover)', () => {
  assertNoScopedDarkLiterals('WrittenExamReader.tsx', reader, [CTA_HOVER_WHITELIST])
  assertNoScopedDarkLiterals('page.tsx', examPage, [CTA_HOVER_WHITELIST])
  assertNoScopedDarkLiterals('error.tsx', errorBoundary, [CTA_HOVER_WHITELIST])
  assertNoScopedDarkLiterals('loading.tsx', loading)
})

test('B: WrittenExamReader renders plain SummaryMarkdown — no adaptive scope, no theme props', () => {
  // The reader renders SummaryMarkdown directly through StudySection and the
  // answer section; Light/Dark come from the global semantic renderer, so the
  // P2C.2 wrapper class and any renderer theming prop must stay absent.
  assert.doesNotMatch(reader, /we-markdown-adaptive/)
  assert.doesNotMatch(reader, /<SummaryMarkdown[^>]*\b(?:adaptive|theme|variant|appearance|dark)=/)
  assert.match(reader, /<SummaryMarkdown content=\{question\.questionMarkdown\} \/>/)
  assert.match(reader, /<SummaryMarkdown content=\{question\.modelAnswerMarkdown\} \/>/)
  assert.doesNotMatch(reader, /<SummaryMarkdown(?![^>]*\/>)/)
  assert.match(summaryMarkdown, /className="summary-content"/)
})

test('C: the P2C.2 adaptive bridge is absent from globals.css and active source', () => {
  assert.doesNotMatch(globals, /we-markdown-adaptive/)
  assert.doesNotMatch(reader, /we-markdown-adaptive/)
  assert.doesNotMatch(summaryMarkdown, /we-markdown-adaptive/)
})

test('D: the global semantic renderer contract exists (prose tokens + dark parent island)', () => {
  // Prose roles exist in BOTH theme token blocks.
  assert.match(globals, /--prose-body: #d6cbb8;/)
  assert.match(globals, /--prose-body: #6f5d47;/)
  assert.match(globals, /--prose-surface: #1a140e;/)
  assert.match(globals, /--prose-surface: #f1e9d8;/)
  // ...and are exposed as Tailwind color aliases.
  assert.match(globals, /--color-prose-body: var\(--prose-body\);/)
  assert.match(globals, /--color-prose-surface: var\(--prose-surface\);/)
  // The intentionally-dark parent island replaces the old reader-scoped bridge.
  assert.match(globals, /\.summary-markdown-dark-scope \.summary-content \{/)
})

test('E: SummaryMarkdown stays untouched — no adaptive/theme/variant prop added', () => {
  assert.doesNotMatch(summaryMarkdown, /we-markdown-adaptive/)
  assert.doesNotMatch(summaryMarkdown, /\badaptive\??:/)
  assert.doesNotMatch(summaryMarkdown, /\btheme\??:/)
  assert.doesNotMatch(summaryMarkdown, /\bvariant\??:/)
  // Shared rendering pipeline intact: ReactMarkdown + gfm + github alerts + raw.
  assert.match(summaryMarkdown, /remarkGfm/)
  assert.match(summaryMarkdown, /remarkGithubAlerts/)
  assert.match(summaryMarkdown, /rehypeRaw/)
})

test('F: critical Written Exam behavioral contracts remain present', () => {
  // Question selection / URL sync / answer visibility.
  assert.match(reader, /window\.history\.replaceState/)
  assert.match(reader, /\?question=\$\{nextQuestion\.questionNumber\}/)
  assert.match(reader, /clampIndex\(initialQuestionIndex, material\.questions\.length\)/)
  assert.match(reader, /setShowAnswer\(\(visible\) => !visible\)/)
  assert.match(reader, /aria-current=\{index === selectedIndex \? 'true' : undefined\}/)
  assert.match(reader, /aria-label="รายการคำถาม Written Exam"/)
  assert.match(reader, /aria-expanded=\{showAnswer\}/)
  // Route gates untouched (page shell still owns auth/entitlement/state flow).
  assert.match(examPage, /getWrittenExamPackageEntitlement/)
  assert.match(examPage, /not-entitled/)
  assert.match(examPage, /selectWrittenExamQuestionIndex\(question, material\.questions\)/)
  assert.match(errorBoundary, /onClick=\{\(\) => reset\(\)\}/)
})
