import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { FAQ_ITEMS, HOMEPAGE_FAQ_PREVIEW_IDS, getHomepageFaqPreviewItems } from '../content/faq/faq-data.ts'

const root = process.cwd()
const homePageSource = readFileSync(join(root, 'app/page.tsx'), 'utf8')
const homeFaqSource = readFileSync(join(root, 'components/home/HomeFaqPreview.tsx'), 'utf8')

test('Homepage mounts HomeFaqPreview inside home-v2-flow-item immediately before HomeFinalCTA', () => {
  assert.match(
    homePageSource,
    /import\s+HomeFaqPreview\s+from\s+['"]@\/components\/home\/HomeFaqPreview['"]/,
    'Missing HomeFaqPreview import in app/page.tsx'
  )

  const faqPreviewIdx = homePageSource.indexOf('<HomeFaqPreview')
  const finalCtaIdx = homePageSource.indexOf('<HomeFinalCTA')
  assert.ok(faqPreviewIdx !== -1, 'HomeFaqPreview is not mounted in app/page.tsx')
  assert.ok(finalCtaIdx !== -1, 'HomeFinalCTA is not mounted in app/page.tsx')
  assert.ok(faqPreviewIdx < finalCtaIdx, 'HomeFaqPreview must appear before HomeFinalCTA')

  // Verify wrapped in home-v2-flow-item
  const chunk = homePageSource.slice(Math.max(0, faqPreviewIdx - 80), faqPreviewIdx + 80)
  assert.match(chunk, /className="home-v2-flow-item"/, 'HomeFaqPreview must be wrapped in home-v2-flow-item')
})

test('HOMEPAGE_FAQ_PREVIEW_IDS contains exactly the approved 6 IDs in approved order', () => {
  const expectedApprovedIds = [
    'what-is-sobdai',
    'login-requirement',
    'practice-vs-mock',
    'exam-explanations',
    'resume-incomplete',
    'package-validity',
  ]
  assert.strictEqual(HOMEPAGE_FAQ_PREVIEW_IDS.length, 6, 'Must contain exactly 6 approved IDs')
  assert.deepStrictEqual([...HOMEPAGE_FAQ_PREVIEW_IDS], expectedApprovedIds)
})

test('Homepage preview data derives from FAQ_ITEMS and equals source question and paragraphs', () => {
  const previewItems = getHomepageFaqPreviewItems()
  assert.strictEqual(previewItems.length, 6, 'Must return exactly 6 preview items')

  for (let i = 0; i < previewItems.length; i++) {
    const preview = previewItems[i]
    const id = HOMEPAGE_FAQ_PREVIEW_IDS[i]
    assert.strictEqual(preview.id, id, `Preview item ${i} must have id ${id}`)

    const source = FAQ_ITEMS.find((item: { id: string }) => item.id === id)
    assert.ok(source, `Source item not found for id: ${id}`)
    assert.strictEqual(preview.question, source.question, `Question mismatch for ${id}`)
    assert.deepStrictEqual(preview.paragraphs, source.paragraphs, `Paragraphs mismatch for ${id}`)
  }
})

test('Homepage FAQ preview items do not render contextual link metadata', () => {
  const previewItems = getHomepageFaqPreviewItems()
  assert.strictEqual(previewItems.length, 6, 'Must have exactly 6 preview items')

  for (const item of previewItems) {
    assert.strictEqual(
      item.link,
      undefined,
      `Preview item ${item.id} must not have contextual link metadata`
    )
  }

  // Verify source FAQ items that have links are stripped for preview
  const whatIsSobdai = previewItems.find((i: { id: string }) => i.id === 'what-is-sobdai')
  assert.ok(whatIsSobdai, 'what-is-sobdai missing from preview')
  assert.strictEqual(whatIsSobdai.link, undefined)

  const practiceVsMock = previewItems.find((i: { id: string }) => i.id === 'practice-vs-mock')
  assert.ok(practiceVsMock, 'practice-vs-mock missing from preview')
  assert.strictEqual(practiceVsMock.link, undefined)

  const packageValidity = previewItems.find((i: { id: string }) => i.id === 'package-validity')
  assert.ok(packageValidity, 'package-validity missing from preview')
  assert.strictEqual(packageValidity.link, undefined)
})

test('HomeFaqPreview CTA links to /faq with exact copy "ดูคำถามทั้งหมด"', () => {
  assert.match(
    homeFaqSource,
    /href="\/faq"/,
    'CTA must link to /faq'
  )
  assert.match(
    homeFaqSource,
    /ดูคำถามทั้งหมด/,
    'CTA must have text "ดูคำถามทั้งหมด"'
  )
})

test('HomeFaqPreview uses native details/summary and is a Server Component with no "use client"', () => {
  assert.doesNotMatch(
    homeFaqSource,
    /['"]use client['"]/,
    'HomeFaqPreview must NOT have "use client"'
  )
  assert.match(homeFaqSource, /<details\b/, 'Missing native <details>')
  assert.match(homeFaqSource, /<summary\b/, 'Missing native <summary>')
  assert.match(homeFaqSource, /\[&::-webkit-details-marker\]:hidden/, 'Missing WebKit marker reset')
})

test('Homepage does NOT add FAQPage structured data', () => {
  assert.doesNotMatch(
    homePageSource,
    /FAQPage/,
    'Homepage must not add FAQPage structured data'
  )
  assert.doesNotMatch(
    homeFaqSource,
    /FAQPage/,
    'HomeFaqPreview must not add FAQPage structured data'
  )
})

test('Forbidden routes and unverified claims are absent from Home FAQ preview', () => {
  // Forbidden: /dashboard route references (canonical is /exams)
  assert.doesNotMatch(homeFaqSource, /['"`]\/dashboard['"`]/, 'Found forbidden route /dashboard')
  assert.doesNotMatch(homeFaqSource, /href=["']\/dashboard["']/, 'Found forbidden link to /dashboard')

  // Forbidden: Emojis
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  assert.doesNotMatch(homeFaqSource, emojiRegex, 'Found forbidden emoji in HomeFaqPreview')

  // Forbidden: Universal unverified claims
  assert.doesNotMatch(homeFaqSource, /เฉลยละเอียดทุกข้อ/, 'Found forbidden universal claim')
  assert.doesNotMatch(homeFaqSource, /ทุกข้อมีคำอธิบาย/, 'Found forbidden universal claim')
  assert.doesNotMatch(homeFaqSource, /ตลอดชีพทุกแพ็กเกจ/, 'Found forbidden universal duration claim')
  assert.doesNotMatch(homeFaqSource, /1\s*ปีทุกแพ็กเกจ/, 'Found forbidden universal 1-year claim')
  assert.doesNotMatch(homeFaqSource, /การันตีผลสอบ/, 'Found forbidden guarantee claim')
  assert.doesNotMatch(homeFaqSource, /ทำนายผลสอบจริง/, 'Found forbidden predictive claim')

  // Forbidden: Daily features in Home FAQ component
  assert.doesNotMatch(homeFaqSource, /Daily 5/i, 'Found forbidden Daily 5 reference in FAQ')
  assert.doesNotMatch(homeFaqSource, /streak/i, 'Found forbidden streak reference in FAQ')
  assert.doesNotMatch(homeFaqSource, /\bexp\b/i, 'Found forbidden EXP reference in FAQ')
  assert.doesNotMatch(homeFaqSource, /\bquest\b/i, 'Found forbidden quest reference in FAQ')
})
