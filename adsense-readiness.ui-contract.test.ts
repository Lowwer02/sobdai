/**
 * AdSense readiness P0 — ui/source contract tests.
 *
 * The unfinished /downloads surface ("กำลังพัฒนา / เร็ว ๆ นี้") must not be a
 * publicly crawlable placeholder: it is unlinked from global navigation,
 * dropped from the sitemap's static routes, and temporarily redirected to the
 * public /articles hub. Also pins sitemap canonical hygiene (only
 * self-canonical news URLs) and the cleanup's reversibility guard (no other
 * nav/sitemap surface may silently disappear with it). Mirrors the repo's
 * *.ui-contract.test.ts conventions (readFileSync + regex assertions).
 *
 * Run with:
 *   node --test adsense-readiness.ui-contract.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { PUBLIC_STATIC_ROUTES } from './lib/seo.ts'

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const desktopNavSource = read('components/DesktopNav.tsx')
const mobileNavSource = read('components/MobileNav.tsx')
const nextConfigSource = read('next.config.ts')
const sitemapSource = read('app/sitemap.ts')

/**
 * Strip block + line comments so prose ABOUT /downloads (the temporary
 * restoration notes in the navs) can't trip code-content scans. Mirrors the
 * adsense.m3.ui-contract.test.ts helper.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?<!:)\/\/[^\n]*/g, ' ')
}

const desktopNavCode = stripComments(desktopNavSource)
const mobileNavCode = stripComments(mobileNavSource)

// ─── /downloads de-listing ───────────────────────────────────────────────────

test('/downloads is absent from the sitemap static routes', () => {
  assert.equal(
    PUBLIC_STATIC_ROUTES.some((route) => route.path === '/downloads'),
    false,
    'PUBLIC_STATIC_ROUTES must not list /downloads'
  )
  // Surgical removal: the remaining core public routes are intact.
  for (const core of ['/', '/packages', '/news', '/about', '/contact', '/privacy', '/terms', '/cookies']) {
    assert.ok(
      PUBLIC_STATIC_ROUTES.some((route) => route.path === core),
      `core public route missing: ${core}`
    )
  }
})

test('/downloads is unlinked from desktop and mobile global navigation', () => {
  for (const [name, code] of [
    ['DesktopNav', desktopNavCode],
    ['MobileNav', mobileNavCode],
  ] as const) {
    assert.equal(code.includes('/downloads'), false, `${name} must not link /downloads`)
  }
})

test('the temporary nav cleanup removed ONLY /downloads — all other links stay', () => {
  for (const [name, code] of [
    ['DesktopNav', desktopNavCode],
    ['MobileNav', mobileNavCode],
  ] as const) {
    for (const kept of ['/', '/packages', '/news', '/exams', '/articles']) {
      assert.match(
        code,
        new RegExp(`href:\\s*'${kept.replace('/', '\\/')}'`),
        `${name} must keep its ${kept} link`
      )
    }
  }
})

test('/downloads route source is preserved for future restoration', () => {
  // The temporary redirect hides the placeholder from crawling; deleting the
  // page would make restoration harder than flipping one config entry.
  const source = read('app/downloads/page.tsx')
  assert.ok(source.includes('DownloadsPage'), 'app/downloads/page.tsx must keep its page component')
})

// ─── Temporary /downloads → /articles redirect ───────────────────────────────

test('next.config redirects /downloads to /articles as a temporary redirect', () => {
  assert.match(nextConfigSource, /async redirects\(\)/, 'redirects() must be configured')
  const redirectsBlock = nextConfigSource.slice(
    nextConfigSource.indexOf('async redirects()'),
    nextConfigSource.indexOf('images:')
  )
  assert.match(redirectsBlock, /source:\s*['"]\/downloads['"]/)
  assert.match(redirectsBlock, /destination:\s*['"]\/articles['"]/)
  // TEMPORARY on purpose (307): the learning-media feature will return, so the
  // redirect must not tell crawlers to forget /downloads forever.
  assert.match(redirectsBlock, /permanent:\s*false/)
  assert.doesNotMatch(redirectsBlock, /permanent:\s*true/)
})

// ─── Sitemap canonical hygiene ───────────────────────────────────────────────

test('sitemap news section filters cross-canonical aliases via the self-canonical rule', () => {
  // The filter must be generic — driven by the row's canonical_url field, not
  // a hardcoded slug list.
  assert.match(
    sitemapSource,
    /select\('slug, canonical_url, updated_at, published_at, created_at'\)/,
    'news sitemap query must load canonical_url'
  )
  assert.match(
    sitemapSource,
    /\.filter\(\(row\)\s*=>\s*isSelfCanonicalNewsArticle\(row\.slug, row\.canonical_url\)\)/,
    'news sitemap rows must pass the self-canonical filter'
  )
})
