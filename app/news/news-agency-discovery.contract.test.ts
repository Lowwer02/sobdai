/**
 * UI contract tests for News Detail entity discovery (Entity Discovery V1).
 *
 * Static source-text assertions in the repo's ui-contract style. The agency
 * attribution priority is the contract under test:
 *   A. non-null news.organization_id is authoritative and exclusive
 *   B. NULL explicit org falls back to related packages' organizations
 *   C. neither signal renders no Agency chip
 * plus: Agency group before Position group, max 3 chips, existing Position
 * chips preserved, and no title/tag/name matching of any kind.
 *
 * Run with:
 *   node --test app/news/news-agency-discovery.contract.test.ts
 *
 * NOTE: lives outside the [slug] directory on purpose — node's test runner
 * glob-expands `[...]` in path arguments, which silently matches nothing.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(dir, '[slug]', 'page.tsx'), 'utf8')

test('the news row read carries the authoritative organization_id', () => {
  assert.match(page, /organization_id: string \| null/)
  assert.match(page, /adsense_enabled, organization_id'/)
})

test('the related-package read exposes organization_id for the fallback path', () => {
  assert.match(page, /organization_id: string \| null[\s\S]*?sort_order: number/)
  assert.match(page, /description, logo_url, position_id, organization_id, organizations \( name, logo_url \)/)
})

test('attribution priority A/B/C is wired through resolveNewsAgencyOrganizationIds', () => {
  // The resolver is invoked with (explicit org, package-derived orgs) in BOTH
  // the fetch (batch key set) and the ordered rendering pass.
  assert.equal(page.split('resolveNewsAgencyOrganizationIds(').length - 1, 2)
  assert.match(
    page,
    /resolveNewsAgencyOrganizationIds\(\s*newsOrganizationId,\s*cleanPkgRows\.map\(\(pkg\) => pkg\.organization_id\),?\s*\)/,
  )
  // Explicit org flows from the article row into getRelatedContent.
  assert.match(page, /getRelatedContent\(article\.id, article\.organization_id\)/)
})

test('the Agency group renders BEFORE the Position group, both capped at 3', () => {
  const agencyHeading = page.indexOf('หน่วยงานที่เกี่ยวข้อง')
  const positionHeading = page.indexOf('ตำแหน่งที่เกี่ยวข้อง')
  assert.ok(agencyHeading !== -1, 'agency group heading present')
  assert.ok(positionHeading !== -1, 'position group heading present')
  assert.ok(agencyHeading < positionHeading, 'agency group precedes position group')

  assert.match(page, /\.slice\(0, MAX_DISCOVERY_ENTITY_LINKS\)[\s\S]*?const agencies/)
  const caps = page.match(/\.slice\(0, MAX_DISCOVERY_ENTITY_LINKS\)/g) ?? []
  assert.equal(caps.length, 2, 'exactly two caps: agencies and positions')

  assert.match(page, /<EntityChipRow[\s\S]*?href: `\/agencies\/\$\{encodeURIComponent\(agency\.slug\)\}`/)
  assert.match(page, /<EntityChipRow[\s\S]*?href: `\/positions\/\$\{encodeURIComponent\(position\.slug\)\}`/)
})

test('the section shell accounts for chips-only news on desktop', () => {
  // The section renders when agencies exist even without packages/summaries.
  assert.match(page, /related\.positions\.length > 0 \|\| related\.agencies\.length > 0\)/)
  // Desktop keeps the section when chips remain under the heading.
  assert.match(
    page,
    /related\.summaries\.length === 0 && related\.agencies\.length === 0 && related\.positions\.length === 0/,
  )
})

test('no title, tag, or agency-name matching is used for attribution', () => {
  assert.doesNotMatch(page, /titleMatch|tagMatch|fuzzy|nameSimilarity/)
  assert.doesNotMatch(page, /toLocaleLowerCase\(\)[\s\S]{0,80}organization/)
})

test('Position chips remain position_id-derived and unchanged in source', () => {
  assert.match(page, /getCanonicalPositionLinks\(cleanPkgRows\.map\(\(pkg\) => pkg\.position_id\)\)/)
  assert.equal(page.split('getCanonicalPositionLinks(').length - 1, 1)
})
