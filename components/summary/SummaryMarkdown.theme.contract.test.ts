import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * SummaryMarkdown.theme.contract.test.ts
 *
 * Theme P2C.3 — the global semantic SummaryMarkdown renderer contract.
 *
 * SummaryMarkdown is the canonical markdown renderer for the whole app. Its
 * styling is expressed ONLY through semantic theme tokens, so theme-ready
 * consumers (Summary learner, News, Article, Written Exam) inherit Light/Dark
 * automatically, while intentionally-dark consumers (Admin, Position/Agency
 * editorial columns) keep markdown dark via the shared
 * .summary-markdown-dark-scope parent island in globals.css.
 *
 * Pins:
 *  A. No legacy raw dark palette literals in the renderer (whitelist: the
 *     intentional image/art shadow).
 *  B. Semantic classes exist for every markdown role (body, heading, link,
 *     prose surface, border, code/table, markers, em, blockquote).
 *  C. prose-body / prose-surface exist in BOTH theme token blocks AND the
 *     @theme inline color mapping.
 *  D. The shared dark parent island pins the complete documented var set and
 *     stays a static island (no [data-theme] branching).
 *  E. Parser / plugin / security behavior remains intact.
 *  F. No appearance/theme/variant/dark prop is added to SummaryMarkdown.
 *  G. The P2C.2 .we-markdown-adaptive bridge is absent from active source.
 *  H. The dark island is applied to every intentionally-dark consumer.
 *  I. The consumer census is exactly the verified 9, with News/Article on
 *     normal global semantics (no local island of their own).
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const summaryMarkdown = read('components/summary/SummaryMarkdown.tsx')
const globals = read('app/globals.css')

/**
 * Extract the balanced {...} body of every CSS rule whose header matches.
 * Header regexes must end at the rule's opening '{'.
 */
function extractBlocks(source: string, header: RegExp): string[] {
  const blocks: string[] = []
  for (const match of source.matchAll(header)) {
    const open = (match.index ?? 0) + match[0].length - 1
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) {
          blocks.push(source.slice(open, i + 1))
          break
        }
      }
    }
  }
  return blocks
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (statSync(full).isDirectory()) {
      walkSourceFiles(full, out)
    } else if (/\.(ts|tsx|css|js|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full.replace(root + '/', ''))
    }
  }
  return out
}

test('A: SummaryMarkdown carries no legacy dark palette literals (whitelist: image shadow)', () => {
  // The black-alpha image shadow is intentional art treatment (Category A).
  const stripped = summaryMarkdown.replace(/shadow-\[0_8px_30px_rgba\(0,0,0,0\.3\)\]/g, '')
  const leftover = stripped.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)
  assert.equal(
    leftover,
    null,
    `renderer must use semantic tokens only; found: ${leftover?.join(', ') ?? 'none'}`,
  )
})

test('B: semantic classes exist for every markdown role', () => {
  // Body ink (p / ul / ol / td / em) + heading ink (h1..h5, strong, th, pre).
  assert.match(summaryMarkdown, /<p className="text-prose-body /)
  assert.match(summaryMarkdown, /list-disc pl-6 mb-5 mt-2 space-y-2 text-prose-body marker:text-brand\/60/)
  assert.match(summaryMarkdown, /list-decimal pl-6 mb-5 mt-2 space-y-2 text-prose-body marker:text-brand\/60/)
  assert.match(summaryMarkdown, /bg-background text-prose-body align-top/)
  assert.match(summaryMarkdown, /<em className="italic text-prose-body"/)
  assert.match(summaryMarkdown, /text-foreground leading-\[1\.25\] tracking-tight/)
  assert.match(summaryMarkdown, /text-foreground border-b border-border-subtle pb-3/)
  assert.match(summaryMarkdown, /<strong className="font-bold text-foreground"/)
  // Links + markers.
  assert.match(summaryMarkdown, /text-brand underline decoration-brand\/40 underline-offset-2 hover:decoration-brand/)
  assert.match(summaryMarkdown, /marker:text-brand\/60/)
  // Prose surfaces (th / inline code / pre) and inset fills (td / pre label).
  assert.match(summaryMarkdown, /bg-prose-surface p-3 md:p-4 text-foreground font-bold/)
  assert.match(summaryMarkdown, /bg-prose-surface text-brand px-1\.5 py-0\.5/)
  assert.match(summaryMarkdown, /bg-prose-surface p-4 pt-5 rounded-xl border border-border-subtle/)
  assert.match(summaryMarkdown, /bg-background text-muted-foreground text-\[10px\]/)
  // Borders, blockquote, hr.
  assert.match(summaryMarkdown, /border-l-4 border-muted-foreground\/50 bg-hover pl-5 pr-4 py-3 my-6 rounded-r-lg text-muted-foreground/)
  assert.match(summaryMarkdown, /border-0 h-px bg-border-subtle/)
})

test('C: prose tokens exist in both theme token blocks and the @theme inline mapping', () => {
  // The canonical Dark token block is the :root that carries color-scheme: dark.
  const darkBlock = extractBlocks(globals, /:root\s*\{/g).find((b) => b.includes('color-scheme: dark;'))
  assert.ok(darkBlock, 'canonical dark token block not found')
  assert.match(darkBlock!, /--prose-body: #d6cbb8;/)
  assert.match(darkBlock!, /--prose-surface: #1a140e;/)

  // The Light token block is the [data-theme='light'] block that re-maps --background.
  const lightBlock = extractBlocks(globals, /\[data-theme='light'\]\s*\{/g).find((b) => b.includes('--background:'))
  assert.ok(lightBlock, 'light token block not found')
  assert.match(lightBlock!, /--prose-body: #6f5d47;/)
  assert.match(lightBlock!, /--prose-surface: #f1e9d8;/)

  // @theme inline exposes the Tailwind color aliases.
  const themeBlock = extractBlocks(globals, /@theme inline\s*\{/g)[0]
  assert.ok(themeBlock, '@theme inline block not found')
  assert.match(themeBlock!, /--color-prose-body: var\(--prose-body\);/)
  assert.match(themeBlock!, /--color-prose-surface: var\(--prose-surface\);/)
})

test('D: the shared dark parent island pins the complete documented var set', () => {
  const island = extractBlocks(globals, /\.summary-markdown-dark-scope \.summary-content\s*\{/g)[0]
  assert.ok(island, 'dark parent island block not found in globals.css')
  const required = [
    '--background: #0f0b07;',
    '--foreground: #f5e9d6;',
    '--muted-foreground: #a1866b;',
    '--brand: #d4af37;',
    '--border-subtle: rgba(255, 255, 255, 0.08);',
    '--hover: rgba(255, 255, 255, 0.04);',
    '--prose-body: #d6cbb8;',
    '--prose-surface: #1a140e;',
    '--gold: #d4a843;',
    '--text-secondary: #c4a882;',
    '--destructive: #ef4444;',
  ]
  for (const pin of required) {
    assert.match(island!, new RegExp(pin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  // Static local palette island: no theme branching inside the pin block.
  assert.doesNotMatch(island!, /\[data-theme/)
})

test('E: parser, plugin, and security behavior remains intact', () => {
  assert.match(summaryMarkdown, /remarkPlugins=\{\[remarkGfm, remarkGithubAlerts\]\}/)
  assert.match(summaryMarkdown, /rehypePlugins=\{\[rehypeRaw\]\}/)
  assert.match(summaryMarkdown, /target="_blank"/)
  assert.match(summaryMarkdown, /rel="noopener noreferrer"/)
  assert.match(summaryMarkdown, /loading="lazy"/)
  assert.match(summaryMarkdown, /decoding="async"/)
  assert.match(summaryMarkdown, /language-\(\\w\+\)/)
  assert.match(summaryMarkdown, /React\.memo\(SummaryMarkdownImpl\)/)
  // Table behavior guards.
  assert.match(summaryMarkdown, /min-w-\[560px\] md:min-w-\[720px\]/)
  const theadBlock = summaryMarkdown.match(/thead: \(\{ node, \.\.\.props \}\) => \(([\s\S]*?)\)\n/)?.[1] ?? ''
  assert.match(theadBlock, /<thead/)
  assert.doesNotMatch(theadBlock, /sticky|z-10/)
})

test('F: no appearance/theme/dark variant prop exists', () => {
  const propsBlock = summaryMarkdown.match(/interface SummaryMarkdownProps \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(propsBlock, /content: string/)
  for (const banned of ['adaptive', 'theme', 'variant', 'appearance', 'dark']) {
    assert.doesNotMatch(propsBlock, new RegExp(`\\b${banned}\\s*\\??:`))
  }
  assert.doesNotMatch(summaryMarkdown, /we-markdown-adaptive/)
})

test('G: the P2C.2 adaptive bridge is absent repo-wide from active source', () => {
  const offenders = walkSourceFiles(root).filter((file) => {
    try {
      return read(file).includes('we-markdown-adaptive')
    } catch {
      return false
    }
  })
  assert.deepEqual(offenders, [])
})

test('H: the dark island is applied to every intentionally-dark consumer', () => {
  assert.match(read('app/admin/layout.tsx'), /summary-markdown-dark-scope/)
  assert.match(read('components/positions/PositionEditorialSection.tsx'), /summary-markdown-dark-scope/)
  assert.match(read('components/agencies/AgencyEditorialSection.tsx'), /summary-markdown-dark-scope/)
})

test('I: the consumer census is exactly the verified nine; News/Article stay on global semantics', () => {
  const expected = [
    'app/package/[slug]/written-exam/[materialSlug]/WrittenExamReader.tsx',
    'app/news/[slug]/page.tsx',
    'components/articles/ArticleDetail.tsx',
    'app/package/[slug]/summary/[summarySlug]/SummaryClient.tsx',
    'components/positions/PositionEditorialSection.tsx',
    'components/agencies/AgencyEditorialSection.tsx',
    'app/admin/written-exams/WrittenExamQuestionPreview.tsx',
    'components/admin/articles/ArticleMarkdownEditor.tsx',
    'components/admin/news/MarkdownEditor.tsx',
  ].sort()

  const consumers = walkSourceFiles(root).filter((file) => {
    if (!file.endsWith('.tsx')) return false
    try {
      return read(file).includes('@/components/summary/SummaryMarkdown')
    } catch {
      return false
    }
  })
  assert.deepEqual(consumers.sort(), expected)

  // Theme-ready consumers inherit the active theme — no local dark island.
  for (const themeReady of [
    'app/news/[slug]/page.tsx',
    'components/articles/ArticleDetail.tsx',
    'app/package/[slug]/summary/[summarySlug]/SummaryClient.tsx',
    'app/package/[slug]/written-exam/[materialSlug]/WrittenExamReader.tsx',
    'components/admin/articles/ArticleMarkdownEditor.tsx',
    'components/admin/news/MarkdownEditor.tsx',
    'app/admin/written-exams/WrittenExamQuestionPreview.tsx',
  ]) {
    assert.doesNotMatch(
      read(themeReady),
      /summary-markdown-dark-scope/,
      `${themeReady} must use normal global semantics (the admin editors are covered by the layout island)`,
    )
  }
})
