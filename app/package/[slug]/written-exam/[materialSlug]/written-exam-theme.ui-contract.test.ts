import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * written-exam-theme.ui-contract.test.ts
 *
 * Theme P2C.2 — Written Exam Light Mode via Scoped Semantic Contract.
 *
 * Pins:
 *  A. Written Exam learner route files no longer carry the hardcoded dark
 *     theme literals P2C.2 removes (with explicit whitelists for the
 *     intentional survivors).
 *  B. The adaptive scope class wraps the SummaryMarkdown render path.
 *  C. globals.css carries a Light-only Written Exam scoped markdown contract.
 *  D. Every .we-markdown-adaptive rule in globals.css is Light-scoped
 *     (Dark receives zero new rules from the adaptive block).
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
    `${name} must not carry hardcoded theme color literals after P2C.2; found: ${leftover?.join(', ') ?? 'none'}`,
  )
}

test('A: written exam route files drop scoped dark literals (whitelist: CTA gold hover)', () => {
  assertNoScopedDarkLiterals('WrittenExamReader.tsx', reader, [CTA_HOVER_WHITELIST])
  assertNoScopedDarkLiterals('page.tsx', examPage, [CTA_HOVER_WHITELIST])
  assertNoScopedDarkLiterals('error.tsx', errorBoundary, [CTA_HOVER_WHITELIST])
  assertNoScopedDarkLiterals('loading.tsx', loading)
})

test('B: the adaptive scope class wraps the SummaryMarkdown render path', () => {
  // The reader renders SummaryMarkdown only through StudySection, whose
  // content wrapper carries the scope class — one placement covers all
  // markdown usages without touching the shared renderer.
  assert.match(reader, /we-markdown-adaptive p-5 md:p-7/)
  assert.match(reader, /<SummaryMarkdown content=\{question\.questionMarkdown\} \/>/)
  assert.match(reader, /<SummaryMarkdown content=\{question\.modelAnswerMarkdown\} \/>/)
  assert.doesNotMatch(reader, /<SummaryMarkdown(?![^>]*\/>)/)
  assert.match(summaryMarkdown, /className="summary-content"/)
})

test('C: globals.css contains the Light-only Written Exam scoped markdown contract', () => {
  assert.match(globals, /\[data-theme='light'\] \.we-markdown-adaptive \.summary-content/)
})

test('D: every we-markdown-adaptive rule in globals.css is Light-scoped (zero Dark rules)', () => {
  const lines = globals.split('\n')
  const scopedLines = lines.filter((line) => line.includes('we-markdown-adaptive'))
  assert.ok(scopedLines.length > 0, 'expected scoped markdown rules in globals.css')
  for (const line of scopedLines) {
    assert.match(
      line,
      /\[data-theme='light'\]/,
      `adaptive markdown rule must be Light-scoped: ${line.trim()}`,
    )
  }
  // The scope must also chain through .summary-content so it can never leak
  // into other SummaryMarkdown consumers.
  for (const line of scopedLines) {
    assert.match(line, /\.summary-content/, `adaptive rule must target .summary-content: ${line.trim()}`)
  }
})

test('E: SummaryMarkdown stays untouched — no adaptive/theme/variant prop added', () => {
  assert.doesNotMatch(summaryMarkdown, /we-markdown-adaptive/)
  assert.doesNotMatch(summaryMarkdown, /\badaptive\??:/)
  assert.doesNotMatch(summaryMarkdown, /theme\??:/)
  assert.doesNotMatch(summaryMarkdown, /variant\??:/)
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
