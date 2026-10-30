import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * free-exam-share-button.contract.test.ts
 *
 * Contract test for SOBDAI FREE EXAM SHARE BUTTON V1.1.
 *
 *  1. Share button rendered inside the existing sample-exam section
 *  2. Correct dynamic URL across different package slugs
 *  3. URL always includes ?share=free-exam#free-exam
 *  4. Native share path (navigator.share with url/title/text)
 *  5. Clipboard fallback path
 *  6. Native share cancellation (AbortError) is silent
 *  7. No false success feedback (clipboard failure shows failure)
 *  8. No share button when the sample section is absent
 *  9. Existing primary CTA remains unchanged
 * 10. Existing OG/canonical share-metadata behavior unchanged
 */

const dir = dirname(fileURLToPath(import.meta.url))
const root = join(dir, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { buildFreeExamShareUrl, SITE_URL } from '../../lib/seo.ts'

const sampleSection = read('components/packages/PackageSampleExamSection.tsx')
const packageClient = read('app/package/[slug]/PackageClient.tsx')
const seoSource = read('lib/seo.ts')

// ── 1. Share button rendered inside the existing sample-exam section ────────
test('1: ghost share button exists inside PackageSampleExamSection with required label, icon, and semantics', () => {
  assert.match(sampleSection, /type="button"/)
  assert.match(sampleSection, /แชร์ข้อสอบฟรีให้เพื่อน/)
  assert.match(sampleSection, /Share2/)
  // Ghost/text styling: transparent background, gold text — never a filled CTA.
  assert.match(sampleSection, /bg-transparent text-\[#D4AF37\]/)
  // Minimum 44px touch target + visible keyboard focus.
  assert.match(sampleSection, /min-h-\[44px\]/)
  assert.match(sampleSection, /focus-visible:ring-2 focus-visible:ring-\[#D4AF37\]/)
})

test('1b: share button sits below the existing helper text inside the CTA column', () => {
  const helperIdx = sampleSection.indexOf('เริ่มทำได้ทันที • ไม่มีค่าใช้จ่าย')
  const shareIdx = sampleSection.indexOf('แชร์ข้อสอบฟรีให้เพื่อน')
  const ctaIdx = sampleSection.indexOf('package-sample-exam-cta')
  assert.ok(helperIdx !== -1 && shareIdx !== -1 && ctaIdx !== -1)
  assert.ok(ctaIdx < helperIdx, 'primary CTA comes first')
  assert.ok(helperIdx < shareIdx, 'share button sits below the helper text')
  // Mobile: full width in the stretch column (centered label). Desktop:
  // auto width, centered beneath the gold CTA — lg:self-center overrides
  // the parent column's lg:items-end for this button only.
  assert.match(sampleSection, /w-full lg:w-auto lg:self-center px-4 min-h-\[44px\]/)
})

// ── 2 + 3. Dynamic URL across slugs, always ?share=free-exam#free-exam ──────
test('2: buildFreeExamShareUrl produces the exact share URL for every slug', () => {
  assert.equal(
    buildFreeExamShareUrl('taxspo2026'),
    'https://sobdai.com/package/taxspo2026?share=free-exam#free-exam'
  )
  assert.equal(
    buildFreeExamShareUrl('dmhppa2026'),
    'https://sobdai.com/package/dmhppa2026?share=free-exam#free-exam'
  )
  assert.equal(
    buildFreeExamShareUrl('otpppa2026'),
    'https://sobdai.com/package/otpppa2026?share=free-exam#free-exam'
  )
})

test('3: share URL is built from the slug dynamically with production origin', () => {
  // The section must derive the URL from packageSlug via the shared helper.
  assert.match(sampleSection, /buildFreeExamShareUrl\(packageSlug\)/)
  // Production origin only — never localhost or a preview hostname.
  assert.equal(SITE_URL, 'https://sobdai.com')
  assert.doesNotMatch(sampleSection, /localhost|vercel\.app/)
  assert.doesNotMatch(seoSource.split('buildFreeExamShareUrl')[1] ?? '', /localhost|vercel\.app/)
  // No user/session/auth tokens in the URL construction.
  const url = buildFreeExamShareUrl('taxspo2026')
  assert.ok(!/token|session|auth|user=/i.test(url))
})

// ── 4. Native share path ────────────────────────────────────────────────────
test('4: native share passes url, dynamic title, and Thai invitation text', () => {
  assert.match(sampleSection, /typeof navigator\.share === 'function'/)
  assert.match(
    sampleSection,
    /navigator\.share\(\{ url: shareUrl, title: shareTitle, text: shareText \}\)/
  )
  // Title is the dynamic free-exam heading (position-aware with fallback).
  assert.match(sampleSection, /const shareTitle = buildFreeExamHeading\(positionName\)/)
  // Short Thai invitation text present.
  assert.match(sampleSection, /ลองทำข้อสอบตัวอย่างฟรีก่อนตัดสินใจเลือกแพ็กเกจ/)
})

// ── 5. Clipboard fallback ───────────────────────────────────────────────────
test('5: clipboard fallback copies the same share URL', () => {
  assert.match(sampleSection, /navigator\.clipboard\.writeText\(shareUrl\)/)
})

// ── 6. Native share cancellation is silent ──────────────────────────────────
test('6: AbortError from the share sheet returns without error feedback', () => {
  assert.match(
    sampleSection,
    /error instanceof DOMException && error\.name === 'AbortError'\) return/
  )
})

// ── 7. No false success feedback ────────────────────────────────────────────
test('7: success feedback only after clipboard resolution; failure path shows failure', () => {
  // Success is set only inside the try, after writeText resolves.
  const clipboardBlock = sampleSection.match(
    /await navigator\.clipboard\.writeText\(shareUrl\)\s*\n\s*showShareFeedback\('copied'\)/
  )
  assert.ok(clipboardBlock, 'copied feedback follows a resolved writeText')
  // Failure feedback exists and is reachable from the catch.
  assert.match(sampleSection, /showShareFeedback\('failed'\)/)
  const failedIdx = sampleSection.indexOf("showShareFeedback('failed')")
  const catchIdx = sampleSection.lastIndexOf('catch {', failedIdx)
  assert.ok(catchIdx !== -1 && catchIdx < failedIdx, 'failure feedback comes from a catch')
  assert.match(sampleSection, /คัดลอกไม่สำเร็จ/)
  // Feedback is announced accessibly.
  assert.match(sampleSection, /aria-live="polite"/)
  assert.match(sampleSection, /คัดลอกลิงก์แล้ว/)
})

// ── 8. No share button when the sample section is absent ────────────────────
test('8: share button lives inside the section that is conditionally rendered', () => {
  // The section itself is gated on the resolved sample exam in PackageClient.
  assert.match(packageClient, /\{sampleExam && \(/)
  assert.match(packageClient, /<PackageSampleExamSection/)
  // The button markup exists only in the section component — no duplicate
  // share button anywhere else on the page.
  assert.doesNotMatch(packageClient, /แชร์ข้อสอบฟรีให้เพื่อน/)
})

// ── 9. Existing primary CTA unchanged ───────────────────────────────────────
test('9: primary CTA href, auth branches, label, and styling are untouched', () => {
  assert.match(sampleSection, /const ctaHref = isAuthenticated \? examHref : loginHref/)
  assert.match(sampleSection, /id="package-sample-exam-cta"/)
  assert.match(sampleSection, /เริ่มทำข้อสอบตัวอย่าง/)
  assert.match(
    sampleSection,
    /bg-\[#D4AF37\] hover:bg-\[#F1D17A\] text-\[#1A140E\] font-bold text-\[15px\][^"]*min-h-\[48px\]/
  )
  // Heading, helper text, and metadata chips preserved.
  assert.match(sampleSection, /\{buildFreeExamHeading\(positionName\)\}/)
  assert.match(sampleSection, /ทดลองทำข้อสอบจากแพ็กเกจนี้ฟรีก่อนตัดสินใจ/)
  assert.match(sampleSection, /เริ่มทำได้ทันที • ไม่มีค่าใช้จ่าย/)
  assert.match(sampleSection, /hasDuration && \(/)
  assert.match(sampleSection, /hasQuestionCount && \(/)
  // Section anchor + scroll offset preserved.
  assert.match(sampleSection, /id=\{FREE_EXAM_ANCHOR\}/)
  assert.match(sampleSection, /scroll-mt-\[88px\]/)
})

// ── 10. Existing OG/canonical metadata behavior unchanged ───────────────────
test('10: share metadata builders and canonical rules are untouched', () => {
  // The new URL helper composes existing pieces; metadata builders unchanged.
  assert.match(seoSource, /export function buildFreeExamShareMetadata\(/)
  assert.match(seoSource, /path: `\/package\/\$\{slug\}`,\s*\n\s*ogUrl: buildFreeExamSharePath\(slug\),/)
  // The button does not touch page metadata or add routes.
  const pageMetadata = read('app/package/[slug]/page.tsx')
  assert.match(pageMetadata, /buildFreeExamShareMetadata\(/)
  assert.doesNotMatch(sampleSection, /generateMetadata|createPageMetadata/)
  // URL helper reuses the V1 path + anchor constants — single source of truth.
  const helperBlock = seoSource.slice(
    seoSource.indexOf('export function buildFreeExamShareUrl'),
    seoSource.indexOf('export function buildFreeExamShareUrl') + 400
  )
  assert.match(helperBlock, /SITE_URL\}\$\{buildFreeExamSharePath\(slug\)\}#\$\{FREE_EXAM_ANCHOR\}/)
})
