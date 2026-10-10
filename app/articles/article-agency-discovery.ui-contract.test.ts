/**
 * UI contract tests for Article Detail entity discovery (Entity Discovery V1).
 *
 * Static source-text assertions in the repo's ui-contract style: Agency chips
 * derive from the SAME article→article_packages→packages.organization_id
 * relation as the Position chips (no direct Article→Agency relation), are
 * deduplicated by canonical agency id in deterministic first-occurrence
 * order, capped at 3, and render BEFORE the Position group. The shipped
 * Position discovery is preserved.
 *
 * Run with:
 *   node --test app/articles/article-agency-discovery.ui-contract.test.ts
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
const detail = readFileSync(join(dir, '..', '..', 'components', 'articles', 'ArticleDetail.tsx'), 'utf8')
const publicLayer = readFileSync(join(dir, '..', '..', 'lib', 'articles-public.ts'), 'utf8')

test('the relations read exposes packages.organization_id for agency derivation', () => {
  assert.match(publicLayer, /organization_id: string \| null/)
  assert.match(
    publicLayer,
    /packages!inner\(id, name, slug, position_id, organization_id, current_price/,
  )
  assert.match(publicLayer, /organization_id: pkg\.organization_id \?\? null/)
})

test('the page derives Agency chips from the same railPackages relation, batched', () => {
  assert.match(page, /getCanonicalAgencyLinks\(railPackages\.map\(\(pkg\) => pkg\.organization_id\)\)/)
  // No per-package agency resolution, no N+1.
  assert.equal(page.split('getCanonicalAgencyLinks(').length - 1, 1)
  // Dedup by canonical organization id in deterministic package order.
  assert.match(page, /collectFirstOccurrenceIds\(\s*railPackages\.map\(\(pkg\) => pkg\.organization_id\),?\s*\)/)
})

test('both chip groups are capped at the shared discovery limit', () => {
  assert.match(page, /\.slice\(0, MAX_DISCOVERY_ENTITY_LINKS\)[\s\S]*?const relatedPositions/)
  const caps = page.match(/\.slice\(0, MAX_DISCOVERY_ENTITY_LINKS\)/g) ?? []
  assert.equal(caps.length, 2, 'exactly two caps: agencies and positions')
})

test('the Agency group renders BEFORE the Position group with the agreed labels', () => {
  const agencyLabel = detail.indexOf('หน่วยงานที่เกี่ยวข้อง:')
  const positionLabel = detail.indexOf('ตำแหน่งที่เกี่ยวข้อง:')
  assert.ok(agencyLabel !== -1, 'agency group label present')
  assert.ok(positionLabel !== -1, 'position group label present')
  assert.ok(agencyLabel < positionLabel, 'agency group precedes position group')
  assert.match(detail, /<EntityChipRow[\s\S]*?label="หน่วยงานที่เกี่ยวข้อง:"/)
  assert.match(detail, /<EntityChipRow[\s\S]*?label="ตำแหน่งที่เกี่ยวข้อง:"/)
  assert.match(detail, /href: `\/agencies\/\$\{encodeURIComponent\(agency\.slug\)\}`/)
})

test('Position chips are preserved through the shared chip row', () => {
  assert.match(detail, /relatedPositions = \[\]/)
  assert.match(detail, /href: `\/positions\/\$\{encodeURIComponent\(position\.slug\)\}`/)
  // The section still renders when only one group has content.
  assert.match(detail, /relatedAgencies\.length > 0 \|\| relatedPositions\.length > 0/)
})

test('no direct Article→Agency relation is introduced', () => {
  assert.doesNotMatch(publicLayer, /agency_profiles/)
  assert.doesNotMatch(page, /from\('agency_profiles'\)/)
  assert.match(page, /\/\/ Entity Discovery V1[\s\S]*?no direct\s*\/\/ Article→Agency relation/)
})
