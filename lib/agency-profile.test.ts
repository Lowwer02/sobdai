import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { agencyIndexability, buildAgencySeoContract, buildAgencySeoDescription, buildAgencySeoTitle, dedupeById, hasUniqueAgencyIntent, hasUniqueAgencyOverview, isAgencyNewsItem, isAgencyPlaceholderName, isAgencyProfileIndexReady, isAgencyProfileStatus, isMeaningfulAgencyOverview, isStableAgencySlug, normalizeAgencySources, parseAgencySourcesJson, selectAgencyPageBySlug, selectIndexableAgencyPages, selectPublishedPackages, serializeAgencySources, sortAgencyContent, } from './agency-profile.ts'

const overview =
  'สำนักงานการตรวจเงินแผ่นดินเป็นหน่วยงานตรวจสอบภาครัฐที่จัดตั้งตามพระราชบัญญัติประกอบรัฐธรรมนูญว่าด้วยการตรวจเงินแผ่นดิน ดูแลการตรวจสอบการรับ จ่าย เก็บ ใช้เงินและทรัพยากรของรัฐ พร้อมเปิดรับสมัครบุคลากรเป็นระยะ'

const baseProfile = {
  id: 'profile-1',
  organization_id: '938b56af-d344-4670-a8e9-eba2d8c5bc78',
  name: 'สำนักงานการตรวจเงินแผ่นดิน',
  slug: 'state-audit-office',
  overview_markdown: overview,
  status: 'published',
  sources: [{ label: 'สตง.', url: 'https://www.audit.go.th/' }],
}

/** OAG-shaped live signals: 2 meaningful positions, 2 packages, 0 news, 10 articles. */
const oagSignals = {
  positionCount: 2,
  packageCount: 2,
  newsCount: 0,
  articleCount: 10,
  uniqueEditorialOverview: true,
  uniquePrimaryIntent: true,
}

const thinSignals = {
  positionCount: 2,
  packageCount: 0,
  newsCount: 0,
  articleCount: 0,
  uniqueEditorialOverview: true,
  uniquePrimaryIntent: true,
}

test('status values, slugs, and placeholder guards mirror the Position contract', () => {
  assert.ok(isAgencyProfileStatus('draft'))
  assert.ok(isAgencyProfileStatus('published'))
  assert.ok(isAgencyProfileStatus('archived'))
  assert.ok(!isAgencyProfileStatus('live'))

  assert.ok(isStableAgencySlug('state-audit-office'))
  assert.ok(!isStableAgencySlug('State_Audit'))
  assert.ok(!isStableAgencySlug(''))
  assert.ok(!isStableAgencySlug('-leading'))
  assert.ok(!isStableAgencySlug('a'.repeat(121)))

  assert.ok(isAgencyPlaceholderName(''))
  assert.ok(isAgencyPlaceholderName('ไม่ระบุ'))
  assert.ok(!isAgencyPlaceholderName('สำนักงานการตรวจเงินแผ่นดิน'))

  assert.ok(isMeaningfulAgencyOverview(overview))
  assert.ok(!isMeaningfulAgencyOverview('สั้นเกินไป'))
  assert.ok(!isMeaningfulAgencyOverview(null))
})

test('the index gate passes the OAG reference shape without requiring news or a specific type', () => {
  assert.ok(isAgencyProfileIndexReady(baseProfile, oagSignals))
  assert.ok(isAgencyProfileIndexReady(baseProfile, {
    ...oagSignals,
    positionCount: 0,
    packageCount: 1,
    newsCount: 0,
    articleCount: 1,
  }))
})

test('the index gate fails on every locked baseline condition', () => {
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, status: 'draft' }, oagSignals))
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, slug: 'OAG!' }, oagSignals))
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, organization_id: null }, oagSignals))
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, name: ' ' }, oagSignals))
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, overview_markdown: 'สั้น' }, oagSignals))
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, sources: [] }, oagSignals))
  assert.ok(!isAgencyProfileIndexReady({ ...baseProfile, sources: [{ url: 'http://audit.go.th/' }] }, oagSignals))
})

test('supporting total requires 2 items AND at least one Package/News/Article', () => {
  // Positions only: total 2 but nothing from Package/News/Article.
  assert.ok(!isAgencyProfileIndexReady(baseProfile, thinSignals))

  // One meaningful position + one article reaches the bar.
  assert.ok(isAgencyProfileIndexReady(baseProfile, {
    ...thinSignals,
    positionCount: 1,
    articleCount: 1,
  }))

  // Total below 2 with a package present still fails.
  assert.ok(!isAgencyProfileIndexReady(baseProfile, {
    ...thinSignals,
    positionCount: 0,
    packageCount: 1,
  }))
})

test('unique overview and unique intent use normalized peer comparison', () => {
  const peers = [
    { id: 'profile-1', name: 'สำนักงานการตรวจเงินแผ่นดิน', slug: 'state-audit-office', overview_markdown: overview },
    { id: 'profile-2', name: 'กรมการแพทย์', slug: 'department-of-medical-services', overview_markdown: 'ภาพรวมอื่นที่ไม่ซ้ำกัน' },
  ]
  assert.ok(hasUniqueAgencyOverview(peers[0], peers))
  assert.ok(hasUniqueAgencyIntent(peers[0], peers))

  const duplicateOverviewPeers = [
    peers[0],
    { id: 'profile-2', name: 'อื่น', slug: 'other', overview_markdown: `  ${overview}  ` },
  ]
  assert.ok(!hasUniqueAgencyOverview(duplicateOverviewPeers[0], duplicateOverviewPeers))
  assert.ok(!isAgencyProfileIndexReady(baseProfile, oagSignals, duplicateOverviewPeers))

  const duplicateIntentPeers = [
    peers[0],
    { id: 'profile-2', name: 'สำนักงานการตรวจเงินแผ่นดิน', slug: 'state-audit-office-2', overview_markdown: 'อื่น' },
  ]
  assert.ok(!hasUniqueAgencyIntent(duplicateIntentPeers[0], duplicateIntentPeers))
})

test('sources normalize to HTTPS-only entries with bounded parsing', () => {
  const sources = normalizeAgencySources([
    'https://www.audit.go.th/',
    { label: '  ', url: 'https://example.go.th/x' },
    { url: 'http://insecure.go.th/' },
    { url: 'not-a-url' },
    null,
    42,
  ])
  assert.deepEqual(sources, [
    { label: 'https://www.audit.go.th/', url: 'https://www.audit.go.th/' },
    { label: 'https://example.go.th/x', url: 'https://example.go.th/x' },
  ])

  assert.ok(parseAgencySourcesJson('').ok)
  assert.ok(!parseAgencySourcesJson('{').ok)
  assert.ok(!parseAgencySourcesJson('{"a":1}').ok)
  assert.ok(!parseAgencySourcesJson(JSON.stringify(Array.from({ length: 21 }, () => 'https://x.go.th/'))).ok)
  assert.ok(!parseAgencySourcesJson('["http://x.go.th/"]').ok)
  const parsedSources = parseAgencySourcesJson('[{"label":"สตง.","url":"https://www.audit.go.th/"}]')
  assert.ok(parsedSources.ok)
  assert.deepEqual(parsedSources.sources, [
    { label: 'สตง.', url: 'https://www.audit.go.th/' },
  ])
  assert.ok(serializeAgencySources([{ label: 'a', url: 'https://a.go.th/' }]).includes('https://a.go.th/'))
})

test('News agency membership is explicit-first with a NULL-only package fallback', () => {
  const orgId = baseProfile.organization_id

  // Explicit attribution is authoritative — matching and contradicting.
  assert.ok(isAgencyNewsItem({ id: 'n1', organization_id: orgId, relatedOrganizationIds: [] }, orgId))
  assert.ok(!isAgencyNewsItem(
    { id: 'n2', organization_id: 'other-org', relatedOrganizationIds: [orgId] },
    orgId,
  ), 'an explicit other-org attribution must exclude the row even when junction-linked')

  // Fallback only while the explicit value is NULL.
  assert.ok(isAgencyNewsItem({ id: 'n3', organization_id: null, relatedOrganizationIds: [orgId] }, orgId))
  assert.ok(!isAgencyNewsItem({ id: 'n4', organization_id: null, relatedOrganizationIds: ['other-org'] }, orgId))
  assert.ok(!isAgencyNewsItem({ id: 'n5', organization_id: null, relatedOrganizationIds: [] }, orgId))
})

test('page selection, indexability, dedupe, sorting, and package filters', () => {
  const pages = [
    { profile: { slug: 'state-audit-office' }, indexReady: true, id: 'p1' },
    { profile: { slug: 'draft-agency' }, indexReady: false, id: 'p2' },
  ]
  assert.equal(selectAgencyPageBySlug(pages, ' state-audit-office ')?.id, 'p1')
  assert.equal(selectAgencyPageBySlug(pages, 'missing'), null)
  assert.equal(selectAgencyPageBySlug(pages, ''), null)
  assert.deepEqual(selectIndexableAgencyPages(pages).map((page) => page.id), ['p1'])

  assert.deepEqual(agencyIndexability(true), { index: true, follow: true, includeInSitemap: true })
  assert.deepEqual(agencyIndexability(false), { index: false, follow: true, includeInSitemap: false })

  assert.deepEqual(
    dedupeById([{ id: 'a' }, { id: 'a' }, { id: 'b' }]).map((row) => row.id),
    ['a', 'b'],
  )

  assert.deepEqual(
    selectPublishedPackages([{ is_published: true }, { is_published: false }, {}]).length,
    1,
  )

  const sorted = sortAgencyContent([
    { id: 'old', published_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'new', published_at: '2026-03-01', updated_at: '2026-03-01' },
    { id: 'updated', published_at: '2026-03-01', updated_at: '2026-05-01' },
  ])
  assert.deepEqual(sorted.map((row) => row.id), ['updated', 'new', 'old'])
})

test('SEO contract falls back through explicit fields to the overview', () => {
  assert.equal(buildAgencySeoTitle(baseProfile), 'สำนักงานการตรวจเงินแผ่นดิน | Sobdai')
  assert.equal(buildAgencySeoTitle({ ...baseProfile, seo_title: 'สอบ สตง. 2569' }), 'สอบ สตง. 2569')

  const description = buildAgencySeoDescription(baseProfile)
  assert.ok(description.length <= 159)
  assert.ok(description.endsWith('…'))

  const contract = buildAgencySeoContract(baseProfile, true)
  assert.equal(contract.path, '/agencies/state-audit-office')
  assert.equal(contract.noindex, false)
  assert.equal(contract.follow, true)

  const noindexContract = buildAgencySeoContract(baseProfile, false)
  assert.equal(noindexContract.noindex, true)
  assert.equal(noindexContract.follow, true)
})
