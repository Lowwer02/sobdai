import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { collectCanonicalAgencyLinks, collectFirstOccurrenceIds, mapCanonicalAgencyLink, resolveNewsAgencyOrganizationIds, type CanonicalAgencyLinkRow } from './agency-profile.ts'

const ORG_A = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const ORG_C = '33333333-3333-3333-3333-333333333333'

function row(
  overrides: Partial<CanonicalAgencyLinkRow> & { id: string },
): CanonicalAgencyLinkRow {
  return {
    name: 'สำนักงานการตรวจเงินแผ่นดิน',
    short_name: 'สตง.',
    logo_url: null,
    agency_profiles: { id: 'profile-1', slug: 'state-audit-office', status: 'published' },
    ...overrides,
  }
}

test('a published profile with a stable slug resolves a canonical Agency link', () => {
  const link = mapCanonicalAgencyLink(row({ id: ORG_A }))
  assert.ok(link)
  assert.equal(link.organizationId, ORG_A)
  assert.equal(link.agencyProfileId, 'profile-1')
  assert.equal(link.slug, 'state-audit-office')
  assert.equal(link.name, 'สำนักงานการตรวจเงินแผ่นดิน')
  assert.equal(link.shortName, 'สตง.')
  assert.equal(link.logoUrl, null)
})

test('draft and archived profiles never link', () => {
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: { id: 'p', slug: 'draft-agency', status: 'draft' } })), null)
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: { id: 'p', slug: 'archived-agency', status: 'archived' } })), null)
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: null })), null)
})

test('unstable slugs never link', () => {
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: { id: 'p', slug: 'State-Audit-Office', status: 'published' } })), null)
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: { id: 'p', slug: 'state audit office', status: 'published' } })), null)
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: { id: 'p', slug: '', status: 'published' } })), null)
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, agency_profiles: { id: 'p', slug: 'ok-slug', status: 'published', extra: true } }))?.slug, 'ok-slug')
})

test('rows without a usable organization identity never link', () => {
  assert.equal(mapCanonicalAgencyLink(row({ id: '', name: 'x' })), null)
  assert.equal(mapCanonicalAgencyLink(row({ id: ORG_A, name: '   ' })), null)
})

test('the embedded profile may arrive as an object or a one-element array', () => {
  const fromObject = mapCanonicalAgencyLink(row({ id: ORG_A }))
  const fromArray = mapCanonicalAgencyLink(
    row({ id: ORG_A, agency_profiles: [{ id: 'profile-1', slug: 'state-audit-office', status: 'published' }] }),
  )
  assert.deepEqual(fromArray, fromObject)
})

test('batch collection dedupes by canonical organization id and preserves first occurrence', () => {
  const links = collectCanonicalAgencyLinks([
    row({ id: ORG_A, agency_profiles: { id: 'p-a1', slug: 'first-a', status: 'published' } }),
    row({ id: ORG_B, agency_profiles: { id: 'p-b', slug: 'agency-b', status: 'published' } }),
    row({ id: ORG_A, agency_profiles: { id: 'p-a2', slug: 'second-a', status: 'published' } }),
    row({ id: ORG_C, agency_profiles: { id: 'p-c', slug: 'draft-c', status: 'draft' } }),
  ])
  assert.deepEqual([...links.keys()], [ORG_A, ORG_B])
  assert.equal(links.get(ORG_A)?.agencyProfileId, 'p-a1')
  assert.equal(links.get(ORG_B)?.slug, 'agency-b')
  assert.equal(links.has(ORG_C), false)
})

test('the news resolver treats an explicit organization as authoritative and exclusive', () => {
  const resolved = resolveNewsAgencyOrganizationIds(ORG_A, [ORG_B, ORG_C, ORG_A])
  assert.deepEqual(resolved, [ORG_A])
})

test('a NULL explicit organization falls back to deduplicated package organizations in order', () => {
  const resolved = resolveNewsAgencyOrganizationIds(null, [ORG_B, null, ORG_A, ORG_B, undefined, ORG_C])
  assert.deepEqual(resolved, [ORG_B, ORG_A, ORG_C])
})

test('no explicit organization and no package relation resolves no agency', () => {
  assert.deepEqual(resolveNewsAgencyOrganizationIds(null, []), [])
  assert.deepEqual(resolveNewsAgencyOrganizationIds(null, [null, undefined]), [])
})

test('first-occurrence collection drops blanks and keeps input order', () => {
  assert.deepEqual(collectFirstOccurrenceIds([ORG_B, ORG_A, ORG_B, '', null, undefined, ORG_C]), [ORG_B, ORG_A, ORG_C])
})
