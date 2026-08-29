/**
 * UI contract tests for the M2 listing affiliate strip (/news, /articles).
 *
 * Static source-text assertions in the repo's ui-contract style (mirrors
 * affiliate-rail.ui-contract.test.ts): no DOM rendering, just freezing the
 * contracts that are load-bearing for monetization safety — the frozen
 * position/threshold rules, one-strip-per-page, sponsored-link semantics,
 * click-only analytics with the listing context, config-gated fetching, and
 * zero leakage into unrelated routes.
 *
 * Run with:
 *   node --test components/affiliate/affiliate-listing-strip.ui-contract.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const componentDir = dirname(fileURLToPath(import.meta.url))
const card = readFileSync(join(componentDir, 'AffiliateStripProductCard.tsx'), 'utf8')
const strip = readFileSync(join(componentDir, 'AffiliateListingStrip.tsx'), 'utf8')
const stripCss = readFileSync(join(componentDir, 'affiliate-listing-strip.css'), 'utf8')
const appRoot = join(componentDir, '..', '..')
const newsPage = readFileSync(join(appRoot, 'app', 'news', 'page.tsx'), 'utf8')
const articlesPage = readFileSync(join(appRoot, 'app', 'articles', 'page.tsx'), 'utf8')
const listingLib = readFileSync(join(appRoot, 'lib', 'affiliate-listing.ts'), 'utf8')

test('strip anchors carry the full M1 sponsored-link semantics', () => {
  assert.match(card, /target="_blank"/)
  assert.match(card, /rel="nofollow sponsored noopener noreferrer"/)
  // href comes straight from the server-validated product row — never rebuilt
  // or mutated client-side.
  assert.match(card, /href=\{product\.affiliate_url\}/)
  assert.doesNotMatch(card, /href\s*=\s*[`"'].*javascript:/i)
})

test('strip analytics: click-only, never blocks navigation, stable listing_strip placement', () => {
  // Exactly one trackAffiliateClick, inside handleClick, wrapped in try/catch —
  // no render-path or effect tracking (no impression tracking in M2).
  assert.match(card, /const handleClick = \(\) => \{/)
  assert.match(card, /try\s*\{\s*[\s\S]*?trackAffiliateClick\(/)
  assert.match(card, /} catch \{[\s\S]*?analytics must not block the click/)
  assert.doesNotMatch(card, /useEffect/)
  assert.equal(card.split('trackAffiliateClick(').length - 1, 1)

  // The strip has ONE presentation at every breakpoint → placement is the
  // stable constant, with no viewport-based resolution (that is rail-only).
  assert.match(card, /placement: 'listing_strip'/)
  assert.doesNotMatch(card, /matchMedia/)
  assert.doesNotMatch(card, /'inline_mobile'/)
})

test('strip clicks identify the source listing via content_type + content_slug', () => {
  // The card takes the surface context as props; the mapping lives in the lib
  // (unit-tested) and distinguishes news listing from articles listing.
  assert.match(card, /content_type: contentType/)
  assert.match(card, /content_slug: contentSlug/)
  assert.match(strip, /const \{ contentType, contentSlug \} = AFFILIATE_LISTING_CONTENT\[listing\]/)
  assert.match(listingLib, /news_list: \{ contentType: 'news', contentSlug: 'news-list' \}/)
  assert.match(listingLib, /articles_list: \{ contentType: 'article', contentSlug: 'articles-list' \}/)
})

test('strip product images are lazy, non-priority, with reserved dimensions', () => {
  assert.match(card, /loading="lazy"/)
  assert.match(card, /decoding="async"/)
  assert.doesNotMatch(card, /from 'next\/image'/)
  assert.doesNotMatch(card, /\bpriority\b\s*[=}/]/)
  assert.match(card, /onError=\{\(\) => setImageFailed\(true\)\}/)
  // Reserved aspect-ratio box lives in affiliate-listing-strip.css so a
  // failing/slow image cannot shift layout.
  assert.match(card, /className="affiliate-strip-thumb"/)
  assert.match(stripCss, /\.affiliate-strip-thumb\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/)
})

test('desktop compaction is a mobile-first CSS-only transformation (QA refinement)', () => {
  // Mobile-first base reproduces the approved mobile layout…
  assert.match(stripCss, /\.affiliate-strip-products\s*\{[^}]*repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)/)
  assert.match(stripCss, /\.affiliate-strip-card\s*\{[^}]*flex-direction:\s*column/)
  // …and exactly ONE desktop breakpoint flips to compact horizontal cells.
  const mediaBlocks = stripCss.match(/@media[^{]+/g) ?? []
  assert.equal(mediaBlocks.length, 1)
  assert.match(mediaBlocks[0], /min-width:\s*1024px/) // the Tailwind `lg` breakpoint
  const lgBlock = stripCss.slice(stripCss.indexOf('@media'))
  assert.match(lgBlock, /flex:\s*1\s+1\s+200px/)
  assert.match(lgBlock, /flex-direction:\s*row/)
  assert.match(lgBlock, /align-items:\s*center/)
  assert.match(lgBlock, /width:\s*96px/)
  assert.match(lgBlock, /height:\s*96px/)
  assert.match(lgBlock, /flex-shrink:\s*0/)
  // The card consumes the classes; no brittle inline layout remains.
  assert.match(card, /className="affiliate-strip-product-card affiliate-strip-card /)
  assert.doesNotMatch(card, /flexDirection/)
})

test('the strip is a server component with hide-when-empty and the M1 disclosure', () => {
  assert.doesNotMatch(strip, /^'use client'/m)
  assert.doesNotMatch(strip, /useEffect|onClick|useState/)
  assert.match(strip, /if \(products\.length === 0\) return null/)
  // Reuses the M1 disclosure — no second disclosure text to keep in sync.
  assert.match(strip, /import \{ AFFILIATE_DISCLOSURE_TEXT \} from '\.\/AffiliateRail'/)
  assert.match(strip, /\{AFFILIATE_DISCLOSURE_TEXT\}/)
  // Editorial-content safety: an aside landmark labeled as partner products,
  // never a news/article card masquerade.
  assert.match(strip, /<aside/)
  assert.match(strip, /aria-label="Sobdai Picks — สินค้าแนะนำจากพันธมิตร"/)
  // No sticky/floating behavior on listing pages (no sticky/fixed CSS).
  assert.doesNotMatch(strip, /position:\s*['"](?:sticky|fixed)['"]/)
  assert.doesNotMatch(strip, /className="[^"]*sticky/)
})

test('news listing: strip renders after item #6 only when ≥7 items render', () => {
  // Frozen helpers are used (threshold + split both come from the lib).
  assert.match(newsPage, /shouldRenderListingStrip\(news\.length\)/)
  assert.match(newsPage, /splitForListingStrip\(news\)/)
  // Exactly ONE strip render in the page.
  assert.equal(newsPage.split('<AffiliateListingStrip').length - 1, 1)
  // The strip renders between the two grids, only when products resolved.
  assert.match(
    newsPage,
    /shouldRenderListingStrip\(news\.length\)\s*&&\s*\(?\s*[\s\S]{0,80}?stripProducts\.length > 0/,
  )
  // Config-gated fetch: only when the slot is enabled AND has a collection.
  assert.match(newsPage, /shouldRenderListingStrip\(news\.length\)\)/)
  assert.match(newsPage, /slot\.enabled && slot\.collection_id/)
})

test('articles listing: strip renders after item #6 only when ≥7 items render', () => {
  assert.match(articlesPage, /shouldRenderListingStrip\(res\.data\.length\)/)
  assert.match(articlesPage, /splitForListingStrip\(res\.data\)/)
  assert.equal(articlesPage.split('<AffiliateListingStrip').length - 1, 1)
  assert.match(articlesPage, /slot\.enabled && slot\.collection_id/)
})

test('the two listing configs are independent (news reads news_list only, articles reads articles_list only)', () => {
  assert.match(newsPage, /listingConfigs\.news_list/)
  assert.doesNotMatch(newsPage, /listingConfigs\.articles_list/)
  assert.match(articlesPage, /listingConfigs\.articles_list/)
  assert.doesNotMatch(articlesPage, /listingConfigs\.news_list/)
  assert.match(newsPage, /listing="news_list"/)
  assert.match(articlesPage, /listing="articles_list"/)
})

test('no affiliate leakage into unrelated routes', () => {
  // Spot-check the heaviest unrelated surfaces: the homepage and the packages
  // catalog must not import any affiliate component/lib.
  for (const rel of [join('app', 'page.tsx'), join('app', 'packages', 'page.tsx')]) {
    const src = readFileSync(join(appRoot, rel), 'utf8')
    assert.doesNotMatch(src, /affiliate/i, `${rel} must not reference affiliate`)
  }
})
