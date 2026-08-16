import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const markdownSource = readFileSync(
  join(process.cwd(), 'components/summary/SummaryMarkdown.tsx'),
  'utf8',
)
const summaryClientSource = readFileSync(
  join(process.cwd(), 'app/package/[slug]/summary/[summarySlug]/SummaryClient.tsx'),
  'utf8',
)

test('SummaryMarkdown keeps the scroll wrapper and gives tables a usable min-width', () => {
  // The wrapper must keep scrolling wide tables locally...
  assert.match(markdownSource, /overflow-x-auto/)
  // ...and the actual table must keep a min-width so multi-column tables
  // overflow horizontally inside the wrapper instead of being crushed into
  // the article column.
  assert.match(markdownSource, /min-w-\[560px\] md:min-w-\[720px\]/)
  assert.match(markdownSource, /<table className="w-full min-w-\[560px\] md:min-w-\[720px\]/)
})

test('SummaryMarkdown thead is static — no sticky overlay over the first body row', () => {
  // Regression guard for the row-104 corruption: the opaque sticky header
  // overlapped the first tbody row once the page scrolled. The thead must
  // return to normal table positioning.
  const theadBlock = markdownSource.match(/thead: \(\{ node, \.\.\.props \}\) => \([\s\S]*?\)\n/)?.[0] ?? ''
  assert.match(theadBlock, /<thead/)
  assert.doesNotMatch(theadBlock, /sticky/)
  assert.doesNotMatch(theadBlock, /top-\[3\.5rem\]/)
  assert.doesNotMatch(theadBlock, /z-10/)
})

test('SummaryMarkdown preserves the semantic header cell styling', () => {
  assert.match(markdownSource, /th: \(\{ node, \.\.\.props \}\) => \(/)
  assert.match(markdownSource, /bg-\[#1A140E\]/)
  assert.match(markdownSource, /whitespace-nowrap/)
  assert.match(markdownSource, /border-b border-\[rgba\(212,175,55,0\.15\)\]/)
})

test('SummaryMarkdown rendering stack is unchanged', () => {
  assert.match(markdownSource, /remarkPlugins=\{\[remarkGfm, remarkGithubAlerts\]\}/)
  assert.match(markdownSource, /rehypePlugins=\{\[rehypeRaw\]\}/)
})

test('Summary side TOC appears at xl, not lg, freeing article width on tablets', () => {
  // Side TOC container only from xl.
  assert.match(summaryClientSource, /hidden xl:block w-64 flex-shrink-0 sticky top-24/)
  assert.doesNotMatch(summaryClientSource, /hidden lg:block w-64 flex-shrink-0 sticky top-24/)
  // The article row layout and left-align follow the same xl boundary.
  assert.match(summaryClientSource, /flex-col xl:flex-row gap-12 items-start/)
  assert.doesNotMatch(summaryClientSource, /flex-col lg:flex-row gap-12 items-start/)
  assert.match(summaryClientSource, /max-w-\[680px\] mx-auto xl:mx-0/)
  // Mobile/tablet TOC affordance stays available below xl.
  assert.match(summaryClientSource, /xl:hidden fixed bottom-6 right-6 z-40/)
  assert.match(summaryClientSource, /fixed inset-0 z-50 flex flex-col justify-end xl:hidden/)
  assert.doesNotMatch(summaryClientSource, /lg:hidden fixed bottom-6 right-6/)
})
