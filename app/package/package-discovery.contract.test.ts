/**
 * Source contract for Package Detail entity discovery (Entity Discovery V1).
 *
 * Static source-text assertions in the repo's contract-test style: the
 * package hero links its organization to the canonical Agency page when a
 * published profile with a stable slug exists, and keeps the plain-text
 * fallback otherwise. The Position discovery (link or plain-text fallback)
 * must remain exactly as shipped.
 *
 * Run with:
 *   node --test app/package/package-discovery.contract.test.ts
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
const client = readFileSync(join(dir, '[slug]', 'PackageClient.tsx'), 'utf8')
const agenciesPublic = readFileSync(join(dir, '..', '..', 'lib', 'agencies-public.ts'), 'utf8')

test('the package page resolves the canonical Agency link from the owning organization', () => {
  assert.match(page, /getCanonicalAgencyLink\(pkg\.organization_id\)/)
  // One batched call inside the existing Promise.all — no extra round-trip.
  assert.equal(page.split('getCanonicalAgencyLink(').length - 1, 1)
  assert.match(page, /canonicalAgency=\{canonicalAgency\}/)
})

test('the hero organization name links to the canonical Agency page only when resolved', () => {
  // Link branch: semantic Next.js Link around the agency text only.
  assert.match(
    client,
    /href=\{`\/agencies\/\$\{encodeURIComponent\(canonicalAgency\.slug\)\}`\}/,
  )
  // Plain-text fallback branch is retained for orgs without a public profile
  // (classes follow the latest-main mobile-redesign theme tokens).
  assert.match(
    client,
    /<span className="text-foreground text-\[12px\] lg:text-\[13px\] mr-1 lg:mr-2">\{orgName\}<\/span>/,
  )
  // The link wraps ONLY the organization text — no hero redesign.
  assert.doesNotMatch(client, /canonicalAgency\.name/)
})

test('Position discovery stays intact: canonical link or plain-text fallback, never a fabricated URL', () => {
  assert.match(
    client,
    /href=\{`\/positions\/\$\{encodeURIComponent\(canonicalPosition\.slug\)\}`\}/,
  )
  // Plain-text pill fallback (OAG PFA has no canonical Position Entity) —
  // latest-main mobile-redesign classes.
  assert.match(
    client,
    /<span className="text-muted-foreground text-\[10px\] lg:text-\[11px\] px-2 py-0\.5 rounded-full border border-border-subtle min-h-7 inline-flex items-center">\s*\{pkg\.positions\.name\}\s*<\/span>/,
  )
  // The fallback branch must not build any /positions URL.
  const fallbackStart = client.indexOf('rounded-full border border-border-subtle min-h-7')
  const fallbackEnd = client.indexOf('แพ็กเกจ', fallbackStart)
  const fallbackBlock = client.slice(fallbackStart, fallbackEnd)
  assert.ok(fallbackStart !== -1 && fallbackEnd !== -1)
  assert.doesNotMatch(fallbackBlock, /\/positions/)
})

test('the canonical Agency resolver itself enforces published + stable slug only', () => {
  // Link eligibility is deliberately narrower than index-readiness: no
  // isAgencyProfileIndexReady call in the resolver path.
  const resolverStart = agenciesPublic.indexOf('export const getCanonicalAgencyLink')
  const resolverEnd = agenciesPublic.indexOf('export function publicAgencyOrganizationLabel')
  assert.ok(resolverStart !== -1 && resolverEnd !== -1)
  const resolverBlock = agenciesPublic.slice(resolverStart, resolverEnd)
  assert.match(resolverBlock, /agency_profiles!inner\(id, slug, status\)/)
  assert.match(resolverBlock, /\.eq\('agency_profiles\.status', 'published'\)/)
  assert.match(resolverBlock, /collectCanonicalAgencyLinks/)
  assert.doesNotMatch(resolverBlock, /isAgencyProfileIndexReady/)
  // Batched: one .in() read for arrays, deduped by organization id.
  assert.match(resolverBlock, /\.in\('id', ids\)/)
  assert.match(resolverBlock, /new Set\(/)
})
