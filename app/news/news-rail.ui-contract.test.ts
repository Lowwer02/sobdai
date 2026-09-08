/**
 * UI contract tests for the News Desktop Related Package Right Rail V1.
 *
 * Static source-text assertions in the repo's ui-contract style (see
 * app/articles/article-rail.ui-contract.test.ts): no DOM rendering, just
 * freezing the contracts that are load-bearing for the desktop rail — rail
 * order (first-party package ABOVE affiliate), one query feeding both
 * responsive presentations, exactly one visible related-package presentation
 * per breakpoint, ONE shared sticky wrapper, empty states, the 1180px News
 * breakpoint, Affiliate prop/analytics preservation, prev/next preservation,
 * and Article Right Rail V1.1 isolation.
 *
 * Run with:
 *   node --test app/news/news-rail.ui-contract.test.ts
 *
 * NOTE: this file lives OUTSIDE the [slug] directory on purpose — node's test
 * runner glob-expands `[...]` in path arguments, which silently matches
 * nothing.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const appRoot = join(dir, '..', '..')
const page = readFileSync(join(dir, '[slug]', 'page.tsx'), 'utf8')
const railComponent = readFileSync(
  join(appRoot, 'components', 'news', 'NewsRailPackages.tsx'),
  'utf8',
)
const articlePage = readFileSync(join(appRoot, 'app', 'articles', '[slug]', 'page.tsx'), 'utf8')
const articleRailComponent = readFileSync(
  join(appRoot, 'components', 'articles', 'ArticleRailPackages.tsx'),
  'utf8',
)
const affiliateRailComponent = readFileSync(
  join(appRoot, 'components', 'affiliate', 'AffiliateRail.tsx'),
  'utf8',
)

/** The scoped <style> content of the news page, for breakpoint rules. */
function styleBlock(source: string): string {
  const start = source.indexOf('<style>{`')
  const end = source.indexOf('</style>', start)
  assert.ok(start !== -1 && end !== -1, 'news page keeps its scoped style block')
  return source.slice(start, end)
}

const NEWS_BREAKPOINT = 1180

test('the desktop rail receives the SAME related-package data as the bottom section', () => {
  // One relation query, one derived array, fed to both presentations.
  assert.match(page, /<NewsRailPackages packages=\{related\.packages\} \/>/)
  assert.match(page, /<PackageCard key=\{pkg\.id\} pkg=\{pkg\} index=\{i\} \/>/)
  // No second relation query on the page — the bottom section and the rail
  // consume the SAME resolved `related.packages` result.
  assert.equal(
    page.split('getRelatedContent(article.id)').length - 1,
    1,
    'the relation query is invoked exactly once on the page',
  )
})

test('the same relation result feeds both layouts, unchanged selection logic', () => {
  // The relation query/selection logic is untouched: junction read ordered by
  // the editorial sort_order, then one batched counts call.
  assert.match(page, /\.from\('news_packages'\)/)
  assert.match(page, /\.order\('sort_order', \{ ascending: true \}\)/)
  assert.match(page, /getPackagePublicCounts\(/)
  // The desktop rail derives from the page's existing related content —
  // no extra query, no client-side fetch, no RPC in the presentation.
  assert.match(railComponent, /import type \{ PackageCardData \} from '@\/components\/PackageCard'/)
  assert.doesNotMatch(railComponent, /supabase|createAnonServerClient|fetch\(|\.from\(/)
})

test('the related package block is composed ABOVE the affiliate rail INSIDE one shared sticky wrapper', () => {
  const asideIx = page.indexOf('news-detail-aside')
  const stickyIx = page.indexOf('news-rail-sticky')
  const railIx = page.indexOf('<NewsRailPackages')
  const affiliateIx = page.indexOf('<AffiliateRail')
  const bottomIx = page.indexOf('news-related-packages-block')
  assert.ok(asideIx !== -1 && stickyIx !== -1 && railIx !== -1 && affiliateIx !== -1)
  // ONE sticky wrapper inside the aside carries BOTH blocks; package ABOVE affiliate.
  assert.ok(asideIx < stickyIx, 'the sticky wrapper lives inside the aside')
  assert.ok(stickyIx < railIx, 'the package block is inside the sticky wrapper')
  assert.ok(railIx < affiliateIx, 'package block must come before AffiliateRail in DOM order')
  assert.ok(affiliateIx < bottomIx, 'the aside stays before the bottom section (M1 contract)')
})

test('exactly ONE sticky element carries the whole news rail', () => {
  const style = styleBlock(page)
  // No legacy affiliate-only sticky, no duplicated wrappers.
  assert.doesNotMatch(page, /news-affiliate-sticky/)
  assert.equal(
    (style.match(/position: sticky/g) || []).length,
    1,
    'exactly one sticky element in the news rail',
  )
  assert.doesNotMatch(style, /position: fixed/)
  assert.doesNotMatch(page, /IntersectionObserver|addEventListener\('scroll'|onscroll/i)
  // The sticky rule is the SHARED wrapper (package + affiliate travel together).
  assert.match(style, /\.news-rail-sticky \{[\s\S]*?position: sticky;/)
})

test('the shared sticky wrapper keeps the viewport-bounded scroll constraints', () => {
  const style = styleBlock(page)
  const stickyRule = style.match(/\.news-rail-sticky \{[\s\S]*?\}/)
  assert.ok(stickyRule, 'the shared sticky rule exists')
  assert.match(stickyRule[0], /top: 24px;/)
  assert.match(stickyRule[0], /max-height: calc\(100vh - 48px\);/)
  assert.match(stickyRule[0], /overflow-y: auto;/)
})

test('exactly one related-package presentation is visible per breakpoint (News keeps 1180px)', () => {
  const style = styleBlock(page)
  // Mobile: rail block hidden, bottom section untouched.
  assert.match(style, /\.news-package-rail \{ display: none; \}/)
  // Desktop (the news sidebar breakpoint): rail visible, bottom packages hidden.
  const desktop = style.slice(style.indexOf(`@media (min-width: ${NEWS_BREAKPOINT}px)`))
  assert.ok(desktop.length > 0, 'desktop media query exists')
  assert.match(desktop, /\.news-package-rail \{[\s\S]*?display: block;/)
  assert.match(desktop, /\.news-related-packages-block \{ display: none; \}/)
  // The breakpoint stays in sync with the placement analytics constant.
  assert.match(page, new RegExp(`const AFFILIATE_SIDEBAR_MIN_WIDTH_PX = ${NEWS_BREAKPOINT}`))
  assert.match(style, new RegExp(`@media \\(min-width: ${NEWS_BREAKPOINT}px\\)`))
})

test('below the breakpoint the bottom package presentation remains (mobile unchanged)', () => {
  // The bottom section still renders PackageCard from the same data, outside
  // the grid, and only its packages part hides on Desktop.
  assert.match(page, /news-related-packages-block/)
  assert.match(page, /aria-label="เนื้อหาที่เกี่ยวข้อง"/)
  assert.match(page, /แพ็กเกจข้อสอบที่เกี่ยวข้อง/)
  assert.match(page, /สรุปที่เกี่ยวข้อง/)
  // Non-package content (summaries) is never hidden on Desktop: the base
  // `.news-related-packages` grid rule itself carries no display:none (only
  // the dedicated `-block` wrapper class does).
  const style = styleBlock(page)
  const gridRule = style.match(/\.news-related-packages \{[\s\S]*?\}/)
  assert.ok(gridRule, 'the mobile packages grid rule exists')
  assert.doesNotMatch(gridRule[0], /display: none/)
  // The packages block keeps its mobile margin contract with the summaries.
  assert.match(page, /marginBottom: related\.summaries\.length > 0 \? 32 : 0/)
})

test('empty states: package-only, affiliate-only, neither, and multiple packages', () => {
  // Component hide-when-empty (never an empty box).
  assert.match(railComponent, /if \(packages\.length === 0\) return null/)
  assert.match(affiliateRailComponent, /if \(products\.length === 0\) return null/)
  // The aside renders when EITHER block has content — not affiliate-only.
  assert.match(
    page,
    /const hasRailContent = related\.packages\.length > 0 \|\| affiliateProducts\.length > 0/,
  )
  assert.match(page, /\{hasRailContent && \(\s*\n\s*<aside/)
  // The shared sticky wrapper always exists inside the aside; the affiliate
  // rail renders inside it only with products.
  assert.match(
    page,
    /className=\{\s*\n\s*affiliateProducts\.length > 0\s*\n\s*\? 'news-detail-aside'\s*\n\s*: 'news-detail-aside news-detail-aside-solo'\s*\n\s*\}/,
  )
  assert.match(page, /\{affiliateProducts\.length > 0 && \(\s*\n\s*<AffiliateRail/)
  // No grid (and no blank sidebar shell) when the rail has no content at all.
  assert.match(page, /className=\{hasRailContent \? 'news-detail-layout' : undefined\}/)
  // Packages-without-affiliate: the solo variant cancels the mobile inline gap.
  const style = styleBlock(page)
  assert.match(style, /\.news-detail-aside\.news-detail-aside-solo \{ margin-top: 0; \}/)
  // Packages-only news: the whole bottom section hides on Desktop (no empty
  // heading shell) — the hide class is applied exactly when summaries are absent.
  assert.match(
    page,
    /related\.summaries\.length === 0 \? 'news-related-desktop-hidden' : undefined/,
  )
  assert.match(style, /\.news-related-desktop-hidden \{ display: none; \}/)
  // Multiple packages: the rail stacks compact cards in one column inside the
  // shared wrapper, with clamped (bounded) card text.
  assert.match(railComponent, /packages\.map\(/)
  assert.match(railComponent, /flexDirection: 'column'/)
  assert.match(railComponent, /line-clamp-2/)
})

test('the rail card matches the shipped article rail presentation contract', () => {
  // First-party eyebrow ABOVE the affiliate picks, compact CTA.
  assert.match(railComponent, /จาก Sobdai/)
  assert.match(railComponent, /แพ็กเกจข้อสอบที่เกี่ยวข้อง/)
  assert.match(railComponent, /ดูแพ็กเกจ/)
  assert.match(railComponent, /href=\{`\/package\/\$\{pkg\.slug\}`\}/)
  // Compact for the ~300px rail: clamped title/description.
  assert.match(railComponent, /line-clamp-2/)
  // Prices: current + original (strike-through when discounted).
  assert.match(railComponent, /pkg\.current_price/)
  assert.match(railComponent, /pkg\.original_price > pkg\.current_price/)
})

test('Article Right Rail V1.1 stays isolated and unchanged', () => {
  // News composes its OWN news-specific classes/components — no article markup
  // leaks into the news page.
  assert.doesNotMatch(page, /ArticleRailPackages/)
  assert.doesNotMatch(page, /article-package-rail/)
  assert.doesNotMatch(page, /article-packages-footer/)
  assert.doesNotMatch(page, /article-rail-sticky/)
  assert.doesNotMatch(page, /article-affiliate/)
  // The article implementation keeps its V1.1 contracts untouched.
  assert.match(articlePage, /const AFFILIATE_SIDEBAR_MIN_WIDTH_PX = 1300/)
  assert.match(articlePage, /const hasRailContent = railPackages\.length > 0 \|\| affiliateProducts\.length > 0/)
  assert.match(articlePage, /article-rail-sticky/)
  assert.match(articlePage, /<ArticleRailPackages packages=\{railPackages\} \/>/)
  assert.match(articleRailComponent, /if \(packages\.length === 0\) return null/)
})

test('Affiliate logic, props, and analytics are preserved verbatim', () => {
  // The affiliate query still only runs on opt-in (unchanged fetch semantics).
  assert.match(
    page,
    /article\.affiliate_enabled\s*\n\s*\? getAffiliateRailProducts\(article\.affiliate_collection_id\)\s*\n\s*: Promise\.resolve\(\[\] as AffiliateRailProduct\[\]\),/,
  )
  // News placement analytics values are passed through unchanged.
  assert.match(page, /contentType="news"/)
  assert.match(page, /contentSlug=\{slug\}/)
  assert.match(page, /sidebarMinWidthPx=\{AFFILIATE_SIDEBAR_MIN_WIDTH_PX\}/)
  assert.match(page, /collectionId=\{article\.affiliate_collection_id\}/)
  // The shared AffiliateRail component itself is not modified by this task.
  assert.match(affiliateRailComponent, /AFFILIATE_DISCLOSURE_TEXT/)
  assert.match(affiliateRailComponent, /aria-label="สินค้าแนะนำจากพันธมิตร"/)
})

test('previous/next news navigation is unchanged', () => {
  assert.match(page, /aria-label="การนำทางข่าวก่อนหน้า\/ถัดไป"/)
  assert.match(page, /news-prevnext-grid/)
  assert.match(page, /ข่าวก่อนหน้า/)
  assert.match(page, /ข่าวถัดไป/)
  // The trailing block stays OUTSIDE the layout grid so the sticky rail
  // naturally stops before it.
  const layoutEnd = page.indexOf('</div>', page.indexOf('news-rail-sticky'))
  const trailingIx = page.indexOf('Trailing editorial block')
  assert.ok(trailingIx > layoutEnd, 'prev/next live outside the grid')
})
