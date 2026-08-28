/**
 * UI contract tests for the public affiliate rail (M1).
 *
 * Static source-text assertions in the repo's ui-contract style (see
 * app/admin/summaries/SummaryLibrary.ui-contract.test.ts): no DOM rendering,
 * just freezing the contracts that are load-bearing for monetization safety —
 * sponsored-link semantics, click-only analytics, lazy non-LCP images, and the
 * analytics helper payload shape.
 *
 * Run with:
 *   node --test components/affiliate/affiliate-rail.ui-contract.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const componentDir = dirname(fileURLToPath(import.meta.url))
const card = readFileSync(join(componentDir, 'AffiliateProductCard.tsx'), 'utf8')
const rail = readFileSync(join(componentDir, 'AffiliateRail.tsx'), 'utf8')
const appRoot = join(componentDir, '..', '..')
const analytics = readFileSync(join(appRoot, 'lib', 'analytics.ts'), 'utf8')

test('outbound affiliate anchors carry full sponsored-link semantics', () => {
  assert.match(card, /target="_blank"/)
  assert.match(card, /rel="nofollow sponsored noopener noreferrer"/)
  // The href comes straight from the server-validated product row — the card
  // must never build or mutate the URL client-side.
  assert.match(card, /href=\{product\.affiliate_url\}/)
  assert.doesNotMatch(card, /href\s*=\s*[`"'].*javascript:/i)
})

test('analytics fires only inside the click handler and never blocks navigation', () => {
  // trackAffiliateClick appears exactly once, inside handleClick, wrapped in
  // try/catch — no useEffect / render-path tracking, so no duplicate events.
  assert.match(card, /const handleClick = \(\) => \{/)
  assert.match(card, /try\s*\{\s*[\s\S]*?trackAffiliateClick\(/)
  assert.match(card, /} catch \{[\s\S]*?analytics must not block the click/)
  assert.doesNotMatch(card, /useEffect/)
  assert.equal(card.split('trackAffiliateClick(').length - 1, 1)

  // placement resolved at click time from the live viewport (sidebar vs
  // inline_mobile), matching the CSS breakpoint passed by the surface.
  assert.match(card, /window\.matchMedia\(`\(min-width: \$\{sidebarMinWidthPx\}px\)`\)/)
  assert.match(card, /'sidebar'/)
  assert.match(card, /'inline_mobile'/)
})

test('product images are lazy, non-priority, with a broken-image fallback', () => {
  assert.match(card, /loading="lazy"/)
  assert.match(card, /decoding="async"/)
  // Plain <img> only — no next/Image and no priority prop anywhere (the rail
  // must never compete with the article cover for LCP).
  assert.doesNotMatch(card, /from 'next\/image'/)
  assert.doesNotMatch(card, /\bpriority\b\s*[=}/]/)
  assert.match(card, /onError=\{\(\) => setImageFailed\(true\)\}/)
  // Fixed reserved dimensions so a failing/slow image cannot shift layout.
  assert.match(card, /width: 72/)
  assert.match(card, /height: 72/)
})

test('the rail is a server component with the hide-when-empty contract and disclosure', () => {
  assert.doesNotMatch(rail, /^'use client'/m)
  assert.doesNotMatch(rail, /useEffect|onClick|useState/)
  assert.match(rail, /if \(products\.length === 0\) return null/)
  assert.match(rail, /AFFILIATE_DISCLOSURE_TEXT/)

  // Disclosure communicates: affiliate links + commission + unchanged price.
  const disclosure = rail.match(/AFFILIATE_DISCLOSURE_TEXT =\s*\n?\s*'([^']+)'/)
  assert.ok(disclosure, 'disclosure constant exists')
  assert.match(disclosure![1], /ลิงก์พันธมิตร/)
  assert.match(disclosure![1], /ค่าคอมมิชชัน/)
  assert.match(disclosure![1], /ราคาสินค้าที่คุณจ่ายไม่เปลี่ยนแปลง/)
})

test('affiliate_click analytics payload carries the full M1 context', () => {
  const fn = analytics.match(
    /export function trackAffiliateClick\(params: \{[\s\S]*?\}\): void \{[\s\S]*?\n\}/,
  )
  assert.ok(fn, 'trackAffiliateClick exists in lib/analytics.ts')
  const body = fn![0]
  assert.match(body, /event: 'affiliate_click'/)
  for (const field of [
    'merchant',
    'product_id',
    'collection_id',
    'content_type',
    'content_slug',
    'placement',
  ]) {
    assert.match(body, new RegExp(`\\b${field}:`), `payload includes ${field}`)
  }
  // Reuses the consent-gated dataLayer push — no second analytics architecture.
  assert.match(body, /pushToDataLayer\(/)
})
