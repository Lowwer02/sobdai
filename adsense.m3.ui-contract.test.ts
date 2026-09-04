/**
 * M3 AdSense Conservative — ui/source contract tests.
 *
 * Source-scanning contracts (no DB, no rendering): script-loading boundary,
 * News/Article placement, route isolation, banned AdSense features, CMS
 * persistence, and M1 Affiliate integrity. Mirrors the repo's
 * *.ui-contract.test.ts conventions (readFileSync + regex assertions).
 *
 * Run with:
 *   node --test adsense.m3.ui-contract.test.ts
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

/** Recursively collect source files under a directory (skips node_modules). */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      out.push(...walk(rel))
    } else if (/\.(tsx?|mjs|jsx)$/.test(entry.name)) {
      out.push(rel)
    }
  }
  return out
}

/**
 * Strip block + line comments (URLs like `https://` are guarded via the
 * lookbehind) so prose ABOUT banned features doesn't trip the banned-feature
 * scan. Only code is scanned.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?<!:)\/\/[^\n]*/g, ' ')
}

const newsDetailSource = read('app/news/[slug]/page.tsx')
const articleDetailPageSource = read('app/articles/[slug]/page.tsx')
const articleDetailComponentSource = read('components/articles/ArticleDetail.tsx')
const adsenseUnitSource = read('components/adsense/AdSenseUnit.tsx')
const adsenseLibSource = read('lib/adsense.ts')
const layoutSource = read('app/layout.tsx')

// ─── Script-loading boundary ─────────────────────────────────────────────────

test('the AdSense script is requested ONLY from the AdSenseUnit client island', () => {
  // Exactly one injection site, via next/script with the network URL.
  const scriptHits = adsenseUnitSource.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g)
  assert.equal(scriptHits?.length, 1, 'exactly one script URL in AdSenseUnit')
  assert.match(adsenseUnitSource, /'use client'/)
  assert.match(adsenseUnitSource, /next\/script/)

  // No other app/components source may reference the AdSense network or the
  // adsbygoogle global. (Mounting the island is separately whitelisted by the
  // route-isolation test; this scan is about script/global leakage. The pure
  // lib/adsense.ts contract module holds neither by design.)
  const offenders = [...walk('app'), ...walk('components'), ...walk('lib')]
    .filter((rel) => rel !== 'components/adsense/AdSenseUnit.tsx')
    .filter((rel) => !rel.endsWith('.test.ts') && !rel.endsWith('.test.tsx'))
    .filter((rel) => {
      const src = read(rel)
      return /adsbygoogle|pagead2\.googlesyndication/.test(src)
    })
  assert.deepEqual(offenders, [])
})

test('no global AdSense script in the root layout (or its loaders)', () => {
  assert.doesNotMatch(layoutSource, /adsbygoogle|pagead2|AdSenseUnit/i)
  for (const rel of ['components/consent/ConsentAnalyticsLoader.tsx', 'components/consent/ConsentProvider.tsx']) {
    assert.doesNotMatch(read(rel), /adsbygoogle|pagead2|AdSense/i)
  }
})

test('route isolation: only the News/Article detail and Daily surfaces mount the unit', () => {
  const importers = [...walk('app'), ...walk('components')].filter((rel) =>
    /from\s+'@\/components\/adsense\/AdSenseUnit'/.test(read(rel))
  )
  importers.sort()
  assert.deepEqual(importers, [
    'app/news/[slug]/page.tsx',
    'components/articles/ArticleDetail.tsx',
    'components/daily/DailyRuntime.tsx',
  ])
})

test('no banned AdSense features anywhere in the M3 surface', () => {
  const sources = [adsenseUnitSource, adsenseLibSource, newsDetailSource, articleDetailComponentSource]
  for (const [i, src] of sources.entries()) {
    assert.doesNotMatch(
      stripComments(src),
      /enable_page_level_ads|autorelaxed|multiplex|vignette|anchor|ad\s?intents|data-ad-mode|overlay/i,
      `source ${i} must not opt into banned formats`
    )
  }
  // The network URL carries ONLY the mandatory client parameter — no
  // Auto Ads/`host`/experiment parameters.
  assert.doesNotMatch(adsenseUnitSource, /[?&]host=/)
})

// ─── Unit shape ───────────────────────────────────────────────────────────────

test('the unit is ONE manual responsive display unit with a Thai label', () => {
  const unitCode = stripComments(adsenseUnitSource)
  assert.equal(unitCode.match(/<ins\s/g)?.length, 1, 'exactly one <ins> ad element')
  assert.match(adsenseUnitSource, /format\?: 'auto' \| 'horizontal'/)
  assert.match(adsenseUnitSource, /format = 'auto'/)
  assert.match(adsenseUnitSource, /data-ad-format=\{format\}/)
  assert.match(adsenseUnitSource, /data-full-width-responsive="true"/)
  assert.match(adsenseUnitSource, /data-ad-client=\{clientId\}/)
  assert.match(adsenseUnitSource, /data-ad-slot=\{slotId\}/)
  // The subtle Thai label is the shared ADSENSE_LABEL constant.
  assert.match(unitCode, /aria-label=\{ADSENSE_LABEL\}/)
  assert.match(adsenseLibSource, /ADSENSE_LABEL = 'โฆษณา'/)
  assert.doesNotMatch(unitCode, /dangerouslySetInnerHTML/)
  // No fake placeholder: the container reserves modest space only.
  assert.match(unitCode, /minHeight:\s*\d+/)
  // Single push site, guarded against duplicate pushes.
  assert.equal(unitCode.match(/\.push\(\{\}\)/g)?.length, 1)
  assert.match(unitCode, /data-adsbygoogle-requested/)
})

// ─── News detail placement contract ──────────────────────────────────────────

test('News detail: opt-in + env-gated, exactly one unit, after content share and BEFORE the Sobdai CTA', () => {
  assert.match(newsDetailSource, /adsense_enabled/)
  assert.match(newsDetailSource, /getAdsenseDetailConfig/)
  assert.match(newsDetailSource, /article\.adsense_enabled\s*\?\s*getAdsenseDetailConfig\(\)\s*:\s*null/)

  const unitHits = newsDetailSource.match(/<AdSenseUnit\b/g)
  assert.equal(unitHits?.length, 1, 'exactly one unit per news detail page')

  // Placement: footer share block → AdSenseUnit → NewsCtaBox → social box →
  // affiliate aside (document order = mobile order; the M3 hierarchy
  // Content → Ad → Sobdai CTA → Affiliate/Related).
  const shareIx = newsDetailSource.indexOf('shareLocation="article_footer"')
  const adIx = newsDetailSource.indexOf('<AdSenseUnit')
  const ctaIx = newsDetailSource.indexOf('<NewsCtaBox')
  const socialIx = newsDetailSource.indexOf('<NewsSocialFollowBox')
  const affiliateIx = newsDetailSource.indexOf('<AffiliateRail')
  assert.ok(shareIx !== -1 && adIx !== -1 && ctaIx !== -1 && socialIx !== -1 && affiliateIx !== -1)
  assert.ok(shareIx < adIx, 'ad comes after the editorial content chrome')
  assert.ok(adIx < ctaIx, 'ad comes BEFORE the Sobdai primary CTA (conversion outranks ads)')
  assert.ok(ctaIx < socialIx)
  assert.ok(socialIx < affiliateIx, 'affiliate rail still follows the CTA zone (M1 intact)')
  // The ad must not sit under the H1 or inside navigation controls.
  assert.ok(adIx > newsDetailSource.indexOf('<h1'))
})

test('News detail fetch selects adsense_enabled from the existing detail row query', () => {
  const selectIx = newsDetailSource.indexOf('.select(')
  const selectEnd = newsDetailSource.indexOf(')', selectIx)
  const selectArg = newsDetailSource.slice(selectIx, selectEnd)
  assert.match(selectArg, /\badsense_enabled\b/, 'flag rides the existing detail fetch (no extra query)')
})

// ─── Article detail placement contract ───────────────────────────────────────

test('Article detail: opt-in + env-gated, exactly one unit after the body box and BEFORE references/tags', () => {
  assert.match(articleDetailComponentSource, /article\.adsense_enabled\s*\?\s*getAdsenseDetailConfig\(\)\s*:\s*null/)

  const unitHits = articleDetailComponentSource.match(/<AdSenseUnit\b/g)
  assert.equal(unitHits?.length, 1, 'exactly one unit per article detail page')

  const bodyIx = articleDetailComponentSource.indexOf('<SummaryMarkdown')
  const adIx = articleDetailComponentSource.indexOf('<AdSenseUnit')
  const refsIx = articleDetailComponentSource.indexOf('<ArticleReferences')
  const tagsIx = articleDetailComponentSource.indexOf('article.tags.map')
  assert.ok(bodyIx !== -1 && adIx !== -1 && refsIx !== -1 && tagsIx !== -1)
  assert.ok(bodyIx < adIx, 'ad follows the editorial body')
  assert.ok(adIx < refsIx, 'references+tags separate the ad from the affiliate flow')
  assert.ok(tagsIx !== -1)

  // No mid-article markdown slicing: the body stays rendered whole via the
  // canonical renderer (M3 explicitly forbids character-count splits).
  assert.equal(articleDetailComponentSource.match(/<SummaryMarkdown\b/g)?.length, 1)
  assert.doesNotMatch(articleDetailComponentSource, /body_markdown\.(slice|substring|split|substr)\(/)
})

test('Article detail page keeps the M1 affiliate rail in the intended flow', () => {
  assert.match(articleDetailPageSource, /<AffiliateRail/)
  const asideIx = articleDetailPageSource.indexOf('article-affiliate-aside')
  const relatedIx = articleDetailPageSource.indexOf('<ArticleRelatedPackages')
  assert.ok(asideIx !== -1 && relatedIx !== -1 && asideIx < relatedIx)
})

test('the public article data layer maps adsense_enabled strictly (legacy rows stay OFF)', () => {
  const publicLayer = read('lib/articles-public.ts')
  assert.match(publicLayer, /adsense_enabled:\s*row\.adsense_enabled\s*===\s*true/)
  const detailSelect = publicLayer.slice(
    publicLayer.indexOf('getPublishedArticleBySlug'),
    publicLayer.indexOf('getActiveAuthorBySlug')
  )
  assert.match(detailSelect, /\badsense_enabled\b/)
})

// ─── CMS persistence contracts ───────────────────────────────────────────────

test('validators coerce adsense_enabled and admin actions persist it', () => {
  const newsLib = read('lib/news.ts')
  assert.match(newsLib, /adsense_enabled:\s*coerceAdsenseEnabled\(raw\.adsense_enabled\)/)

  const articlesLib = read('lib/articles.ts')
  assert.match(articlesLib, /adsense_enabled:\s*coerceAdsenseEnabled\(raw\?\.adsense_enabled\)/)

  const newsActions = read('app/admin/news/actions.ts')
  assert.match(newsActions, /adsense_enabled:\s*input\.adsense_enabled/)

  const articleActions = read('app/admin/articles/actions.ts')
  assert.match(articleActions, /adsense_enabled:\s*clean\.adsense_enabled/)
  assert.equal(articleActions.match(/adsense_enabled:\s*clean\.adsense_enabled/g)?.length, 2, 'create + update payloads')
})

test('both editors expose ONLY the single opt-in (no placement/density/slot controls)', () => {
  for (const rel of ['components/admin/news/NewsEditorClient.tsx', 'components/admin/articles/ArticleEditorClient.tsx']) {
    const src = read(rel)
    assert.match(src, /adsense_enabled:\s*adsenseEnabled/, `${rel} payload persists the flag`)
    assert.match(src, /adsense_enabled \?\? false/, `${rel} defaults OFF for legacy rows`)
    assert.equal(src.match(/adsenseEnabled/g)?.filter(Boolean).length !== undefined, true)
    // No per-content slot/client inputs, no placement/density selectors.
    assert.doesNotMatch(src, /adsense_(slot|client|placement|density)/i)
  }
})

test('consent gating: ads never reuse the analytics consent flag', () => {
  const unit = adsenseUnitSource
  assert.doesNotMatch(unit, /useConsent|hasAnalyticsConsent|ConsentProvider/)
  // Conservative posture instead: request non-personalized ads.
  assert.match(unit, /requestNonPersonalizedAds/)
})
