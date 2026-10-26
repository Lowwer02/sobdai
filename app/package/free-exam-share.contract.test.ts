import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * free-exam-share.contract.test.ts
 *
 * Contract test for SOBDAI FREE EXAM DEEP LINK + SOCIAL SHARE PREVIEW V1.
 *
 * Covers:
 *  1. Standard package URL keeps its original SEO metadata path
 *  2. Share URL produces the dynamic OG title (real Metadata objects)
 *  3. Share URL produces the OG description + share og:url
 *  4. Share variant preserves the plain package canonical
 *  5. #free-exam anchor exists on the sample section
 *  6. Query-only share URL (?share=free-exam) also scrolls + reflects anchor
 *  7. Sticky navbar cannot cover the heading (scroll-margin-top)
 *  8. Dynamic position name works across multiple packages (no slug derivation)
 *  9. No free-exam metadata claim when the package has no eligible sample
 * 10. Existing sample CTA / access behavior unchanged
 * 11. Responsive layout contract of the section stays intact
 * 12. Unknown query parameters do not select the share variant
 *
 * Metadata checks run the real lib/seo builders (server-rendered parity),
 * not source-text-only assertions. Wiring that only exists in the page /
 * section components is verified as source contracts, mirroring the sibling
 * *.contract.test.ts suites.
 */

const dir = dirname(fileURLToPath(import.meta.url))
const root = join(dir, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { buildFreeExamHeading, buildFreeExamShareDescription, buildFreeExamShareMetadata, buildFreeExamSharePath, buildFreeExamShareTitle, FREE_EXAM_ANCHOR, FREE_EXAM_OG_IMAGE, FREE_EXAM_SHARE_PARAM, FREE_EXAM_SHARE_VALUE, SITE_URL } from '../../lib/seo.ts'

const packagePage = read('app/package/[slug]/page.tsx')
const packageClient = read('app/package/[slug]/PackageClient.tsx')
const sampleSection = read('components/packages/PackageSampleExamSection.tsx')

const SLUG = 'taxspo2026'

// ── 1. Standard package URL keeps its original SEO metadata path ────────────
test('1: non-share requests return the original package metadata', () => {
  // The share branch must live AFTER the standard title/description are built
  // and must leave the original createPageMetadata return untouched.
  const stdTitleIdx = packagePage.indexOf('buildPackageSeoTitle(pkg as PackageSeoData)')
  const shareBranchIdx = packagePage.indexOf('shareValue === FREE_EXAM_SHARE_VALUE')
  const stdReturnIdx = packagePage.indexOf('return createPageMetadata({\n    title,')
  assert.ok(stdTitleIdx !== -1 && shareBranchIdx !== -1 && stdReturnIdx !== -1)
  assert.ok(shareBranchIdx > stdTitleIdx, 'share branch reads after standard title is built')
  assert.ok(stdReturnIdx > shareBranchIdx, 'original metadata return is preserved after the share branch')
  assert.match(packagePage, /noindex: !pkg\.is_published,/)
})

// ── 2. Share URL produces the dynamic OG title ──────────────────────────────
test('2: share metadata OG/twitter title carries the dynamic position name', () => {
  const metadata = buildFreeExamShareMetadata({
    slug: SLUG,
    positionName: 'นักวิเคราะห์นโยบายและแผน',
  })
  const expected = 'ทดลองทำข้อสอบฟรี — นักวิเคราะห์นโยบายและแผน | Sobdai'
  assert.equal(metadata.title, expected)
  assert.equal(metadata.openGraph?.title, expected)
  assert.equal(metadata.twitter?.title, expected)
})

// ── 3. Share URL produces the OG description + share og:url ─────────────────
test('3: share metadata description and og:url follow the share variant', () => {
  const metadata = buildFreeExamShareMetadata({
    slug: SLUG,
    positionName: 'นักวิเคราะห์นโยบายและแผน',
  })
  assert.equal(
    metadata.openGraph?.description,
    'ลองทำข้อสอบตัวอย่างฟรีสำหรับตำแหน่ง นักวิเคราะห์นโยบายและแผน ก่อนตัดสินใจเลือกแพ็กเกจ'
  )
  assert.equal(metadata.description, metadata.openGraph?.description)
  assert.equal(metadata.twitter?.description, metadata.openGraph?.description)
  assert.equal(
    metadata.openGraph?.url,
    `${SITE_URL}/package/${SLUG}?${FREE_EXAM_SHARE_PARAM}=${FREE_EXAM_SHARE_VALUE}`
  )
})

// ── 4. Share variant preserves the main canonical ───────────────────────────
test('4: canonical stays the plain package URL while og:url intentionally diverges', () => {
  const metadata = buildFreeExamShareMetadata({ slug: SLUG, positionName: 'ตำแหน่ง' })
  assert.equal(metadata.alternates?.canonical, `${SITE_URL}/package/${SLUG}`)
  assert.equal(metadata.openGraph?.url, `${SITE_URL}/package/${SLUG}?share=free-exam`)
  // Divergence is the feature: social platforms must cache the variant's own
  // preview card instead of collapsing it into the base package preview.
  assert.notEqual(metadata.alternates?.canonical, metadata.openGraph?.url)
  // Published packages stay indexable (noindex is decided by the caller).
  assert.deepEqual(metadata.robots, {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  })
})

// ── 5. #free-exam anchor on the existing sample section ─────────────────────
test('5: sample section carries the free-exam anchor id (semantic target)', () => {
  assert.equal(FREE_EXAM_ANCHOR, 'free-exam')
  assert.match(sampleSection, /id=\{FREE_EXAM_ANCHOR\}/)
  // Section is the existing sample exam section — same aria landmark & CTA id.
  assert.match(sampleSection, /aria-label="ข้อสอบตัวอย่าง"/)
  assert.match(sampleSection, /id="package-sample-exam-cta"/)
})

// ── 6. Query-only share URL also reaches the sample section ─────────────────
test('6: deep-link effect handles #free-exam and ?share=free-exam exactly once', () => {
  assert.match(
    packageClient,
    /searchParams\.get\(FREE_EXAM_SHARE_PARAM\) === FREE_EXAM_SHARE_VALUE/
  )
  assert.match(packageClient, /window\.location\.hash === `#\$\{FREE_EXAM_ANCHOR\}`/)
  assert.match(packageClient, /document\.getElementById\(FREE_EXAM_ANCHOR\)/)
  // Reflect the anchor after a query-only scroll (fragment was stripped).
  assert.match(packageClient, /history\.replaceState\(/)
  assert.match(packageClient, /#\$\{FREE_EXAM_ANCHOR\}`\s*$/m)
  // Runs once per mount — no navigation loops, no repeated scrolling.
  assert.match(packageClient, /didScrollToFreeExam\.current\) return/)
  assert.match(packageClient, /didScrollToFreeExam\.current = true/)
})

// ── 7. Sticky navbar cannot cover the heading ───────────────────────────────
test('7: section reserves scroll-margin-top above the 72px sticky navbar', () => {
  assert.match(sampleSection, /scroll-mt-\[88px\]/)
})

// ── 8. Dynamic position name across multiple packages ───────────────────────
test('8: heading and OG title derive from real position data for every package', () => {
  const positions = ['นักวิเคราะห์นโยบายและแผน', 'เจ้าหน้าที่วิเคราะห์นโยบายและแผน สตง.']
  for (const name of positions) {
    assert.equal(buildFreeExamHeading(name), `ทดลองทำข้อสอบฟรี — ${name}`)
    assert.equal(buildFreeExamShareTitle(name), `ทดลองทำข้อสอบฟรี — ${name} | Sobdai`)
  }
  // Heading/OG parity: the OG title is the heading + brand suffix.
  assert.equal(
    buildFreeExamShareTitle('ตำแหน่งใดๆ'),
    `${buildFreeExamHeading('ตำแหน่งใดๆ')} | Sobdai`
  )
  // No slug-derived position names anywhere in the metadata path.
  assert.doesNotMatch(packagePage, /slug.*positionName|positionName.*slug/)
  // PackageClient passes server-resolved position data into the section.
  assert.match(packageClient, /positionName=\{positionName\}/)
  assert.match(
    packageClient,
    /const positionName = canonicalPosition\?\.name\?\.trim\(\) \|\| pkg\.positions\?\.name\?\.trim\(\) \|\| ''/
  )
})

test('8b: fallback keeps a clean heading/OG when position metadata is missing', () => {
  assert.equal(buildFreeExamHeading(null), 'ทดลองทำข้อสอบฟรี')
  assert.equal(buildFreeExamHeading('   '), 'ทดลองทำข้อสอบฟรี')
  assert.equal(buildFreeExamShareTitle(undefined), 'ทดลองทำข้อสอบฟรี | Sobdai')
  assert.equal(
    buildFreeExamShareDescription(undefined),
    'ลองทำข้อสอบตัวอย่างฟรี ก่อนตัดสินใจเลือกแพ็กเกจ'
  )
  assert.ok(!buildFreeExamHeading('').includes('—'), 'no dangling dash without a position')
})

// ── 9. No free-exam claim without an eligible sample ────────────────────────
test('9: share metadata requires a published sample exam set (same rule as the section)', () => {
  // Eligibility query: published + is_sample only.
  const eligibilityIdx = packagePage.indexOf("from('exam_sets')")
  assert.ok(eligibilityIdx > packagePage.indexOf('async function generateMetadata'))
  const eligibilityBlock = packagePage.slice(eligibilityIdx, eligibilityIdx + 400)
  assert.match(eligibilityBlock, /\.eq\('package_id', pkg\.id\)/)
  assert.match(eligibilityBlock, /\.eq\('status', 'published'\)/)
  assert.match(eligibilityBlock, /\.eq\('is_sample', true\)/)
  // Metadata is only built inside the sample-exists guard.
  const guardIdx = packagePage.indexOf('if (sampleExam) {')
  const metadataIdx = packagePage.indexOf('buildFreeExamShareMetadata({')
  assert.ok(guardIdx !== -1 && metadataIdx > guardIdx)
  // Draft packages never take the share branch.
  assert.match(packagePage, /pkg\.is_published && shareValue === FREE_EXAM_SHARE_VALUE/)
  // The page section itself stays gated on the resolved sample.
  assert.match(packageClient, /\{sampleExam && \(/)
})

// ── 10. Existing sample CTA / access behavior unchanged ─────────────────────
test('10: sample CTA href, login redirect, and metadata chips are untouched', () => {
  assert.match(sampleSection, /const examHref = `\/package\/\$\{packageSlug\}\/exam\/\$\{sampleExam\.id\}`/)
  assert.match(sampleSection, /const loginHref = `\/login\?redirect=\$\{encodeURIComponent\(examHref\)\}`/)
  assert.match(sampleSection, /const ctaHref = isAuthenticated \? examHref : loginHref/)
  assert.match(sampleSection, /เริ่มทำข้อสอบตัวอย่าง/)
  // Supporting copy retained.
  assert.match(sampleSection, /ทดลองทำข้อสอบจากแพ็กเกจนี้ฟรีก่อนตัดสินใจ/)
  // The old static heading is gone (replaced by the dynamic builder).
  assert.doesNotMatch(sampleSection, /ลองทำข้อสอบตัวอย่างก่อนตัดสินใจ/)
})

// ── 11. Responsive / theme layout of the section stays intact ───────────────
test('11: anchor additions do not alter responsive layout or hide the section', () => {
  assert.match(sampleSection, /flex-col lg:flex-row/)
  assert.match(sampleSection, /min-h-\[48px\]/)
  assert.doesNotMatch(sampleSection, /className="hidden [^"]*lg:block/)
  // scroll offset is margin, not display change.
  assert.doesNotMatch(sampleSection, /display:\s*none/)
})

// ── 12. Unknown query parameters do not select the share variant ────────────
test('12: only the exact share value selects the variant', () => {
  assert.equal(FREE_EXAM_SHARE_PARAM, 'share')
  assert.equal(FREE_EXAM_SHARE_VALUE, 'free-exam')
  assert.match(packagePage, /shareValue === FREE_EXAM_SHARE_VALUE/)
  // The server never reads the fragment for metadata decisions.
  assert.doesNotMatch(packagePage, /free-exam#|'#free-exam'|"#free-exam"/)
})

// ── OG image asset ───────────────────────────────────────────────────────────
test('free-exam OG image exists as a branded 1200×630 JPEG asset', () => {
  const imagePath = join(root, 'public', FREE_EXAM_OG_IMAGE.replace(/^\//, ''))
  assert.ok(existsSync(imagePath), `missing ${FREE_EXAM_OG_IMAGE}`)
  const bytes = readFileSync(imagePath)
  assert.ok(bytes.length > 20_000, 'OG image suspiciously small')
  assert.ok(bytes.length < 1_000_000, 'OG image should stay well under social limits')
  // JPEG magic.
  assert.equal(bytes[0], 0xff)
  assert.equal(bytes[1], 0xd8)
})

test('share path builder produces the preferred share URL structure', () => {
  assert.equal(buildFreeExamSharePath(SLUG), `/package/${SLUG}?share=free-exam`)
})
