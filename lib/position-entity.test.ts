import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import {
  buildPositionSeoContract,
  derivePublishedPositionContentIds,
  derivePublishedPositionPackageIds,
  hasUniquePositionIntent,
  hasUniquePositionOverview,
  isPositionEntityIndexReady,
  isPositionPlaceholderName,
  isStablePositionSlug,
  positionIndexability,
  selectIndexablePositionPages,
  selectPositionPageBySlug,
  selectPublishedPackages,
  selectPublishedPositionContent,
} from './position-entity.ts'

const overview = 'ข้อมูลภาพรวมของตำแหน่งนี้อธิบายขอบเขตงานและบริบทการทำงานจากแหล่งข้อมูลที่ตรวจสอบได้อย่างเป็นระบบ'
const baseEntity = {
  id: 'entity-1',
  name: 'นักวิเคราะห์นโยบายและแผน',
  slug: 'policy-and-plan-analyst',
  overview_markdown: overview,
  status: 'published',
  sources: [{ label: 'Official source', url: 'https://example.go.th/position' }],
}

const readySignals = {
  packageCount: 1,
  newsCount: 1,
  articleCount: 1,
  uniqueEditorialOverview: true,
  uniquePrimaryIntent: true,
}

test('canonical slugs are stable ASCII lowercase kebab-case values', () => {
  assert.equal(isStablePositionSlug('policy-and-plan-analyst'), true)
  assert.equal(isStablePositionSlug('Policy-and-plan-analyst'), false)
  assert.equal(isStablePositionSlug('นักวิเคราะห์นโยบายและแผน'), false)
  assert.equal(isStablePositionSlug('policy--analyst'), false)
  assert.equal(isStablePositionSlug(''), false)
})

test('published entity passes the complete index-readiness gate', () => {
  assert.equal(isPositionEntityIndexReady(baseEntity, readySignals, [baseEntity]), true)
  assert.deepEqual(positionIndexability(true), { index: true, follow: true, includeInSitemap: true })
})

test('draft, archived, placeholder, and thin entities fail the gate', () => {
  assert.equal(isPositionEntityIndexReady({ ...baseEntity, status: 'draft' }, readySignals, [baseEntity]), false)
  assert.equal(isPositionEntityIndexReady({ ...baseEntity, status: 'archived' }, readySignals, [baseEntity]), false)
  assert.equal(isPositionPlaceholderName('General Position'), true)
  assert.equal(isPositionPlaceholderName('GEN'), true)
  assert.equal(isPositionEntityIndexReady({ ...baseEntity, name: 'General Position' }, readySignals, [baseEntity]), false)
  assert.equal(isPositionEntityIndexReady({ ...baseEntity, overview_markdown: 'สั้นเกินไป' }, readySignals, [baseEntity]), false)
  assert.equal(isPositionEntityIndexReady(baseEntity, { ...readySignals, packageCount: 0 }, [baseEntity]), false)
  assert.equal(isPositionEntityIndexReady(baseEntity, { ...readySignals, newsCount: 0, articleCount: 1 }, [baseEntity]), false)
  assert.equal(isPositionEntityIndexReady(baseEntity, { ...readySignals, articleCount: 0 }, [baseEntity]), false)
  assert.equal(isPositionEntityIndexReady({ ...baseEntity, sources: [] }, readySignals, [baseEntity]), false)
  assert.deepEqual(positionIndexability(false), { index: false, follow: true, includeInSitemap: false })
})

test('overview and primary intent remain unique across canonical entities', () => {
  const sameIntent = { id: 'entity-2', name: ' นักวิเคราะห์นโยบายและแผน ', overview_markdown: 'different editorial copy' }
  assert.equal(hasUniquePositionIntent(baseEntity, [baseEntity, sameIntent]), false)
  assert.equal(hasUniquePositionOverview(baseEntity, [baseEntity, { ...sameIntent, name: 'อีกตำแหน่งหนึ่ง', overview_markdown: overview }]), false)
  assert.equal(hasUniquePositionIntent(baseEntity, [baseEntity, { ...sameIntent, name: 'นักวิชาการศึกษา' }]), true)
})

test('public package/content filters and relation derivation are bounded and deduplicated', () => {
  const packages = [
    { id: 'pkg-1', position_id: 'position-1', is_published: true },
    { id: 'pkg-1', position_id: 'position-1', is_published: true },
    { id: 'pkg-2', position_id: 'position-1', is_published: false },
    { id: 'pkg-3', position_id: 'position-2', is_published: true },
  ]
  assert.deepEqual(selectPublishedPackages(packages).map((pkg) => pkg.id), ['pkg-1', 'pkg-1', 'pkg-3'])
  assert.deepEqual(derivePublishedPositionPackageIds(['position-1'], packages), ['pkg-1'])

  const newsRelations = [
    { package_id: 'pkg-1', content_id: 'news-1' },
    { package_id: 'pkg-1', content_id: 'news-1' },
    { package_id: 'pkg-2', content_id: 'news-2' },
    { package_id: 'pkg-1', content_id: null },
  ]
  assert.deepEqual(derivePublishedPositionContentIds(['pkg-1'], newsRelations), ['news-1'])

  const content = [
    { id: 'article-1', status: 'published' },
    { id: 'article-2', status: 'draft' },
    { id: 'article-3', status: 'archived' },
  ]
  assert.deepEqual(selectPublishedPositionContent(content).map((item) => item.id), ['article-1'])
})

test('SEO contract keeps canonical path and noindex behavior aligned with the gate', () => {
  const ready = buildPositionSeoContract(baseEntity, true)
  const thin = buildPositionSeoContract({ ...baseEntity, overview_markdown: null }, false)
  assert.equal(ready.path, '/positions/policy-and-plan-analyst')
  assert.equal(ready.noindex, false)
  assert.equal(ready.follow, true)
  assert.match(ready.title, /นักวิเคราะห์นโยบายและแผน/)
  assert.equal(thin.noindex, true)
  assert.equal(thin.follow, true)
  assert.equal(thin.path, ready.path)
})

test('unknown Position slugs resolve to null for the route to 404 safely', () => {
  const pages = [
    { indexReady: true, entity: { slug: 'policy-and-plan-analyst' } },
  ]
  assert.equal(selectPositionPageBySlug(pages, 'unknown-position'), null)
  assert.equal(selectPositionPageBySlug(pages, ''), null)
  assert.deepEqual(selectIndexablePositionPages([...pages, { indexReady: false, entity: { slug: 'thin' } }]).map((page) => page.entity.slug), ['policy-and-plan-analyst'])
})
