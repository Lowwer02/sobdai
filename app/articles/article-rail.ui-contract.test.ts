/**
 * UI contract tests for the Article Desktop Related Package Right Rail V1.
 *
 * Static source-text assertions in the repo's ui-contract style (see
 * components/affiliate/affiliate-rail.ui-contract.test.ts): no DOM rendering,
 * just freezing the contracts that are load-bearing for the desktop rail —
 * rail order (first-party package ABOVE affiliate), one query feeding both
 * responsive presentations, exactly one visible related-package presentation
 * per breakpoint, empty states, sticky preservation, and News untouched.
 *
 * Run with:
 *   node --test app/articles/article-rail.ui-contract.test.ts
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
  join(appRoot, 'components', 'articles', 'ArticleRailPackages.tsx'),
  'utf8',
)
const bottomComponent = readFileSync(
  join(appRoot, 'components', 'articles', 'ArticleRelatedPackages.tsx'),
  'utf8',
)
const newsPage = readFileSync(join(appRoot, 'app', 'news', '[slug]', 'page.tsx'), 'utf8')
const publicLayer = readFileSync(join(appRoot, 'lib', 'articles-public.ts'), 'utf8')

/** The scoped <style> content of the article page, for breakpoint rules. */
function styleBlock(source: string): string {
  const start = source.indexOf('<style>{`')
  const end = source.indexOf('</style>', start)
  assert.ok(start !== -1 && end !== -1, 'article page keeps its scoped style block')
  return source.slice(start, end)
}

test('the desktop rail receives the SAME related-package data as the bottom section', () => {
  // One query, one derived array, fed to both presentations.
  assert.match(page, /const railPackages = packagesRes\.success \? packagesRes\.data : \[\]/)
  assert.match(page, /<ArticleRailPackages packages=\{railPackages\} \/>/)
  assert.match(page, /<ArticleRelatedPackages\s*\n\s*packages=\{railPackages\}/)
  // No second relation query on the page.
  assert.equal(
    page.split('getPublishedArticleRelatedPackages(').length - 1,
    1,
    'the relation query appears exactly once on the page',
  )
})

test('the related package block is composed ABOVE the affiliate rail INSIDE the shared sticky wrapper', () => {
  const railIx = page.indexOf('<ArticleRailPackages')
  const stickyIx = page.indexOf('article-rail-sticky')
  const affiliateIx = page.indexOf('<AffiliateRail')
  const asideIx = page.indexOf('article-affiliate-aside')
  const footerIx = page.indexOf('<ArticleRelatedPackages')
  assert.ok(railIx !== -1 && stickyIx !== -1 && affiliateIx !== -1)
  // V1.1: ONE sticky wrapper carries BOTH blocks; package stays ABOVE affiliate.
  assert.ok(asideIx < stickyIx, 'sticky wrapper lives inside the aside')
  assert.ok(stickyIx < railIx, 'package block is inside the sticky wrapper')
  assert.ok(railIx < affiliateIx, 'package block must come before AffiliateRail in DOM order')
  assert.ok(affiliateIx < footerIx, 'aside stays before the bottom section (M1 contract)')
  // The old affiliate-only sticky wrapper must be gone (no double-sticky).
  assert.doesNotMatch(page, /article-affiliate-sticky/)
})

test('exactly one related-package presentation is visible per breakpoint', () => {
  const style = styleBlock(page)
  // Mobile: rail block hidden, bottom section untouched.
  assert.match(style, /\.article-package-rail \{ display: none; \}/)
  // Desktop (the shared sidebar breakpoint): rail visible, bottom section hidden.
  const desktop = style.slice(style.indexOf('@media (min-width: 1300px)'))
  assert.ok(desktop.length > 0, 'desktop media query exists')
  assert.match(desktop, /\.article-package-rail \{[\s\S]*?display: block;/)
  assert.match(desktop, /\.article-packages-footer \{ display: none; \}/)
  // The breakpoint stays in sync with the analytics constant.
  assert.match(page, /const AFFILIATE_SIDEBAR_MIN_WIDTH_PX = 1300/)
  assert.match(style, /@media \(min-width: 1300px\)/)
})

test('the SHARED sticky wrapper keeps the viewport-bounded scroll constraints', () => {
  const desktop = styleBlock(page).slice(styleBlock(page).indexOf('@media (min-width: 1300px)'))
  assert.match(desktop, /\.article-rail-sticky \{[\s\S]*?position: sticky;/)
  assert.match(desktop, /\.article-rail-sticky \{[\s\S]*?top: 24px;/)
  assert.match(desktop, /\.article-rail-sticky \{[\s\S]*?max-height: calc\(100vh - 48px\);/)
  assert.match(desktop, /\.article-rail-sticky \{[\s\S]*?overflow-y: auto;/)
  // No fixed positioning, no duplicated/overlapping sticky elements.
  assert.doesNotMatch(styleBlock(page), /position: fixed/)
  const stickyRules = styleBlock(page).match(/position: sticky/g) || []
  assert.equal(stickyRules.length, 1, 'exactly one sticky element in the rail')
  // The sticky rule is the SHARED wrapper class, not an affiliate-only one.
  const stickyRule = desktop.match(/\.article-rail-sticky \{[\s\S]*?\}/)
  assert.ok(stickyRule, 'shared sticky rule exists')
})

test('empty states: no empty rail block, affiliate-independent rendering', () => {
  // Rail renders nothing without packages.
  assert.match(railComponent, /if \(packages\.length === 0\) return null/)
  // The aside renders when EITHER block has content — not affiliate-only.
  assert.match(
    page,
    /const hasRailContent = railPackages\.length > 0 \|\| affiliateProducts\.length > 0/,
  )
  assert.match(page, /\{hasRailContent && \(\s*\n\s*<aside className="article-affiliate-aside">/)
  // The shared sticky wrapper always exists inside the aside; the affiliate
  // rail renders inside it only with products.
  assert.match(page, /className=\{\s*\n\s*affiliateProducts\.length > 0\s*\n\s*\? 'article-rail-sticky'\s*\n\s*: 'article-rail-sticky article-rail-solo'\s*\n\s*\}/)
  // No grid (and no blank sidebar shell) when the rail has no content at all.
  assert.match(page, /className=\{hasRailContent \? 'article-affiliate-layout' : undefined\}/)
})

test('mobile spacing contract: shared wrapper margin, solo variant cancels it', () => {
  const style = styleBlock(page)
  // Inline (mobile) gap between article and affiliate — same 48px as before.
  assert.match(style, /\.article-rail-sticky \{ margin-top: 48px; \}/)
  // Packages-without-affiliate articles: the wrapper's only mobile content is
  // the hidden rail block, so the gap must cancel (no empty 48px gap).
  assert.match(style, /\.article-rail-solo \{ margin-top: 0; \}/)
})

test('the mobile bottom section keeps its existing markup', () => {
  assert.match(
    bottomComponent,
    /className="max-w-4xl mx-auto mt-12 pt-8 border-t border-\[#D4AF37\]\/15 space-y-6"/,
  )
  assert.match(bottomComponent, /แพ็กเกจเตรียมสอบที่เกี่ยวข้อง/)
  assert.match(bottomComponent, /ดูแพ็กเกจ/)
})

test('the rail card reuses the same data model, formatting, and relation logic', () => {
  // Same data model, no fetching in the presentation component.
  assert.match(railComponent, /import type \{ PublicRelatedPackage \} from '@\/lib\/articles-public'/)
  assert.doesNotMatch(railComponent, /supabase|createAnonServerClient|fetch\(|\.from\(/)
  // Price formatting is shared, not duplicated.
  assert.match(railComponent, /import \{ formatPrice \} from '\.\/ArticleRelatedPackages'/)
  // Same package links and heading as the bottom section.
  assert.match(railComponent, /href=\{`\/package\/\$\{pkg\.slug\}`\}/)
  assert.match(railComponent, /แพ็กเกจเตรียมสอบที่เกี่ยวข้อง/)
  assert.match(railComponent, /ดูแพ็กเกจ/)
  // Relation/selection logic untouched in the data layer.
  assert.match(publicLayer, /export const getPublishedArticleRelatedPackages = cache\(/)
  assert.match(publicLayer, /\.from\('article_packages'\)/)
  assert.match(publicLayer, /\.order\('sort_order', \{ ascending: true \}\)/)
})

test('News detail behavior is unchanged by the article rail', () => {
  assert.doesNotMatch(newsPage, /ArticleRailPackages/)
  assert.doesNotMatch(newsPage, /article-package-rail/)
  assert.doesNotMatch(newsPage, /article-packages-footer/)
  // News keeps its own rail layout and its own related-content section.
  assert.match(newsPage, /news-detail-aside/)
  assert.match(newsPage, /AffiliateRail/)
})

test('the rail card keeps the article design language and stays compact', () => {
  // Sobdai dark + gold palette, matching the affiliate rail shell.
  assert.match(railComponent, /var\(--border\)/)
  assert.match(railComponent, /var\(--bg-card\)/)
  assert.match(railComponent, /border-\[#D4AF37\]\/20/)
  assert.match(railComponent, /group-hover:border-\[#D4AF37\]\/60/)
  // Compact: clamped title/description, no unbounded growth.
  assert.match(railComponent, /line-clamp-2/)
})
