import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const appDir = dirname(fileURLToPath(import.meta.url))
const root = join(appDir, '.')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const packageCard = read('components/PackageCard.tsx')
const catalogClient = read('app/packages/PackageCatalogClient.tsx')
const phakKhorPage = read('app/packages/phak-khor/page.tsx')
const homePage = read('app/page.tsx')
const homeFeaturedExams = read('components/home/HomeFeaturedExams.tsx')
const myPackagesPage = read('app/my-packages/page.tsx')
const publicData = read('lib/publicData.ts')
const freshnessLib = read('lib/package-freshness.ts')

test('freshness rule lives in one shared helper with one named window constant', () => {
  assert.match(freshnessLib, /export const PACKAGE_CONTENT_FRESH_DAYS = 30/)
  assert.match(freshnessLib, /newExamSetCount: number/)
  assert.match(freshnessLib, /newSummaryCount: number/)
  assert.match(freshnessLib, /hasFreshContent: boolean/)
  // The batched reads: one query per availability source for ALL packages — no N+1.
  assert.match(freshnessLib, /readTimestampRows\(client, 'exam_sets', 'package_id, released_at, created_at', ids, \[\s*\{ column: 'status', value: 'published' \},?\s*\]\)/)
  assert.match(freshnessLib, /readTimestampRows\(client, 'package_summaries', 'package_id, activated_at', ids, \[/)
  assert.match(freshnessLib, /readTimestampRows\(client, 'summaries', 'package_id, released_at, created_at', ids, \[/)
  // KP-native rows are counted via placements only — no double counting.
  assert.match(freshnessLib, /\{ column: 'summary_code', value: null \}/)
})

test('existing Mixed difficulty badge on PackageCard is preserved', () => {
  assert.match(packageCard, /badge badge-gold/)
  assert.match(packageCard, /\{pkg\.difficulty\}/)
})

test('existing discount badge on PackageCard is preserved', () => {
  assert.match(packageCard, /hasDiscount && \(/)
  assert.match(packageCard, /ลด \{discountPercent\}%/)
  assert.match(packageCard, /badge badge-green/)
})

test('freshness renders in the card body below the description, not in the badge row', () => {
  // Placement: after the description paragraph, before the footer divider.
  const descriptionIndex = packageCard.indexOf("pkg.description || 'คลังข้อสอบเตรียมสอบข้าราชการ")
  const freshnessIndex = packageCard.indexOf('<PackageFreshnessSignal')
  const dividerIndex = packageCard.indexOf('<div className="divider"')
  assert.ok(descriptionIndex > -1 && freshnessIndex > -1 && dividerIndex > -1)
  assert.ok(freshnessIndex > descriptionIndex && freshnessIndex < dividerIndex)

  // Top-right header badge row must stay exactly two concepts: difficulty + discount.
  const headerRow = packageCard.slice(
    packageCard.indexOf("justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'"),
    packageCard.indexOf('{/* Department Name */}'),
  )
  assert.match(headerRow, /pkg\.difficulty/)
  assert.match(headerRow, /hasDiscount && \(/)
  assert.doesNotMatch(headerRow, /Freshness/)

  // Quiet surfaces: no fresh content → render nothing (no reserved space).
  assert.match(packageCard, /if \(!freshness\?\.hasFreshContent\) return null/)
})

test('catalog surfaces (/packages, /packages/phak-khor) use the detailed two-chip variant', () => {
  assert.match(catalogClient, /freshnessVariant="detailed"/)
  // phak-khor reuses the shared catalog client — no independent card implementation.
  assert.match(phakKhorPage, /PackageCatalogClient/)
  // Detailed chips carry per-type counts and are capped at two.
  assert.match(packageCard, /freshness\.newExamSetCount > 0 && \(/)
  assert.match(packageCard, /freshness\.newSummaryCount > 0 && \(/)
  assert.match(packageCard, /formatFreshExamSetLabel/)
  assert.match(packageCard, /formatFreshSummaryLabel/)
})

test('homepage keeps the visually quiet subtle variant', () => {
  assert.match(homePage, /getPackageContentFreshness/)
  assert.match(homePage, /content_freshness: freshness\[pkg\.id\] \?\? null/)
  // HomeFeaturedExams renders PackageCard without a detailed variant override.
  assert.match(homeFeaturedExams, /<PackageCard key=\{pkg\.id\} pkg=\{pkg\} index=\{i\} \/>/)
  assert.doesNotMatch(homeFeaturedExams, /freshnessVariant/)
  // The generic chip carries an accessible clarification.
  assert.match(packageCard, /GENERIC_FRESHNESS_TOOLTIP/)
  assert.match(freshnessLib, /GENERIC_FRESHNESS_TOOLTIP = 'เพิ่มข้อสอบหรือสรุปล่าสุด'/)
})

test('/my-packages ownership cards render the prominent freshness block per content type', () => {
  assert.match(myPackagesPage, /getPackageContentFreshness/)
  assert.match(myPackagesPage, /formatFreshExamSetLabel/)
  assert.match(myPackagesPage, /formatFreshSummaryLabel/)
  // Rows only for types that changed; the block itself only when fresh.
  assert.match(myPackagesPage, /pkg\.content_freshness\?\.hasFreshContent && \(/)
  assert.match(myPackagesPage, /pkg\.content_freshness\.newExamSetCount > 0 && \(/)
  assert.match(myPackagesPage, /pkg\.content_freshness\.newSummaryCount > 0 && \(/)
  // Ownership presentation stays intact.
  assert.match(myPackagesPage, /คุณเป็นเจ้าของแพ็กเกจนี้/)
  assert.match(myPackagesPage, /เรียนต่อ/)
})

test('/my-packages does not gain sales messaging for freshness', () => {
  // No discount badges added to the ownership surface.
  assert.doesNotMatch(myPackagesPage, /ลด /)
  assert.doesNotMatch(myPackagesPage, /badge-green/)
})

test('freshness derives from availability only — never package or content edits', () => {
  // Availability mappers: exam/legacy use the release stamp (created_at as the
  // documented historical fallback); KP placements use activated_at. No
  // updated_at column is selected anywhere and no packages read happens.
  assert.match(freshnessLib, /return row\.released_at \?\? row\.created_at/)
  assert.match(freshnessLib, /return row\.activated_at/)
  assert.match(freshnessLib, /'package_id, released_at, created_at'/)
  assert.match(freshnessLib, /'package_id, activated_at'/)
  assert.doesNotMatch(freshnessLib, /released_at, created_at, updated_at/)
  assert.doesNotMatch(freshnessLib, /from\('packages'\)/)
  // The catalog data producer attaches freshness alongside counts.
  assert.match(publicData, /getPackageContentFreshness/)
  assert.match(publicData, /content_freshness: freshness\[pkg\.id\] \?\? null/)
})

test('exam publish actions stamp released_at exactly on transitions into published', () => {
  const examActions = read('app/admin/exam-sets/actions.ts')
  // Single action: fetches current status, stamps only when it differs.
  assert.match(examActions, /select\('status'\)[\s\S]*?current\.status !== 'published'[\s\S]*?releasedAt = new Date\(\)\.toISOString\(\)/)
  assert.match(examActions, /releasedAt \? \{ status, released_at: releasedAt \} : \{ status \}/)
  // Bulk action: draft → published is the only publish source; archive must not stamp.
  assert.match(examActions, /target === 'published'\s*\?\s*\{ status: target, released_at: new Date\(\)\.toISOString\(\) \}\s*:\s*\{ status: target \}/)
})
