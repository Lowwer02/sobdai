import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const detailRoute = readFileSync(fileURLToPath(new URL('./[slug]/page.tsx', import.meta.url)), 'utf8')
const hubRoute = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
const sitemapRoute = readFileSync(fileURLToPath(new URL('../sitemap.ts', import.meta.url)), 'utf8')
const positionRouteStart = sitemapRoute.indexOf('async function getPositionRoutes')
const positionRouteEnd = sitemapRoute.indexOf('/**', positionRouteStart)
const positionRoute = sitemapRoute.slice(positionRouteStart, positionRouteEnd)

test('unknown Position detail slugs use notFound and published rows receive explicit metadata', () => {
  assert.match(detailRoute, /if \(!page\) notFound\(\)/)
  assert.match(detailRoute, /export async function generateMetadata/)
  assert.match(detailRoute, /buildPositionSeoContract/)
  assert.match(detailRoute, /createPageMetadata/)
  assert.match(detailRoute, /noindex: seo\.noindex/)
})

test('Position hub renders only the shared index-qualified dataset', () => {
  assert.doesNotMatch(hubRoute, /^['"]use client['"]/m)
  assert.match(hubRoute, /getIndexablePositionHubEntries/)
  assert.match(hubRoute, /href=\{`\/positions\/\$\{encodeURIComponent\(page\.entity\.slug\)/)
  assert.match(hubRoute, /<h1[^>]*>\s*ตำแหน่งงานราชการ/)
})

test('Position sitemap uses the same qualification gate and omits synthetic freshness', () => {
  assert.match(sitemapRoute, /getIndexablePositionHubEntries/)
  assert.match(sitemapRoute, /getPositionSitemapSlugs/)
  assert.match(sitemapRoute, /absoluteUrl\('\/positions'\)/)
  assert.match(sitemapRoute, /absoluteUrl\(`\/positions\/\$\{encodeURIComponent\(slug\)\}`\)/)
  assert.doesNotMatch(positionRoute, /lastModified/)
})
