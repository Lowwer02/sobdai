import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { buildPositionSeoContract, chunkPositionIds, computeMappingDiff, derivePublishedPositionContentIds, derivePublishedPositionPackageIds, excludePlaceholderPositions, hasUniquePositionIntent, hasUniquePositionOverview, isPositionEntityIndexReady, isOperationalPositionPlaceholder, isPositionPlaceholderName, isStablePositionSlug, positionIndexability, POSITION_MAPPING_SEARCH_PAGE_SIZE, POSITION_MAPPING_VALIDATION_BATCH_SIZE, selectIndexablePositionPages, selectPositionPageBySlug, selectPublishedPackages, selectPublishedPositionContent, validatePositionMappingSelection } from './position-entity.ts'

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

test('operational placeholder positions are rejected before mapping', () => {
  assert.equal(isOperationalPositionPlaceholder({ code: 'GEN', name: 'นักวิเคราะห์นโยบายและแผน' }), true)
  assert.equal(isOperationalPositionPlaceholder({ code: 'P-001', name: 'General Position' }), true)
  assert.equal(isOperationalPositionPlaceholder({ code: 'P-001', name: 'นักวิเคราะห์นโยบายและแผน' }), false)

  const result = validatePositionMappingSelection('entity-1', ['position-gen'], [
    {
      id: 'position-gen',
      code: 'GEN',
      name: 'นักวิเคราะห์นโยบายและแผน',
      organization_id: 'org-1',
      position_entity_id: null,
    },
  ])
  assert.deepEqual(result, { valid: false, reason: 'placeholder', positionId: 'position-gen' })
})

test('mapping validator rejects conflicts while accepting exact owned selections', () => {
  const positions = [
    { id: 'position-1', code: 'P-001', name: 'นักวิเคราะห์นโยบายและแผน', organization_id: 'org-1', position_entity_id: 'entity-1' },
    { id: 'position-2', code: 'P-002', name: 'นักวิชาการศึกษา', organization_id: 'org-2', position_entity_id: null },
  ]
  assert.deepEqual(validatePositionMappingSelection('entity-1', ['position-1', 'position-2'], positions), {
    valid: true,
    positionIds: ['position-1', 'position-2'],
  })
  assert.deepEqual(validatePositionMappingSelection('entity-1', ['position-2', 'position-2'], positions), {
    valid: false,
    reason: 'duplicate_position',
  })
  assert.deepEqual(validatePositionMappingSelection('entity-1', ['position-1'], [
    { ...positions[0], position_entity_id: 'entity-2' },
  ]), { valid: false, reason: 'conflict', positionId: 'position-1' })
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

test('mapping diff separates additions from removals and detects unchanged sets', () => {
  // Identical sets (any order) are unchanged — saving is a no-op, not a rewrite.
  assert.deepEqual(computeMappingDiff(['b', 'a'], ['a', 'b']), { addedIds: [], removedIds: [], unchanged: true })
  assert.deepEqual(computeMappingDiff([], []), { addedIds: [], removedIds: [], unchanged: true })

  // Hidden/offscreen selected rows participate: diff runs over full sets, never visible pages.
  assert.deepEqual(computeMappingDiff(['a', 'b'], ['b', 'c', 'd']), {
    addedIds: ['c', 'd'],
    removedIds: ['a'],
    unchanged: false,
  })
  assert.deepEqual(computeMappingDiff(['a', 'b'], []), { addedIds: [], removedIds: ['a', 'b'], unchanged: false })
  assert.deepEqual(computeMappingDiff([], ['a']), { addedIds: ['a'], removedIds: [], unchanged: false })

  // Duplicate intended ids collapse via set semantics without phantom removals.
  assert.deepEqual(computeMappingDiff(['a'], ['a', 'a']), { addedIds: [], removedIds: [], unchanged: true })
})

test('placeholder exclusion mirrors the RPC predicate and preserves chainability', () => {
  assert.equal(POSITION_MAPPING_SEARCH_PAGE_SIZE, 20)

  const conditions: Array<[string, string, string]> = []
  const fakeQuery = {
    not(column: string, operator: string, value: string) {
      conditions.push([column, operator, value])
      return this
    },
  }
  excludePlaceholderPositions(fakeQuery)

  // Every RPC exclusion family appears, AND-complemented (chained .not calls).
  assert.ok(conditions.length >= 14)
  for (const [column, operator] of conditions) {
    assert.ok(column === 'code' || column === 'name')
    assert.ok(operator === 'imatch' || operator === 'ilike')
  }
  assert.ok(conditions.some(([, op, value]) => op === 'imatch' && value === '^gen([[:space:]_-]|$)'))
  assert.ok(conditions.some(([, op, value]) => op === 'ilike' && value === '%general position%'))
  assert.ok(conditions.some(([, op, value]) => op === 'ilike' && value === 'ไม่ระบุตำแหน่ง'))

  // The canonical TS predicate still rejects rows the SQL could miss (trim family).
  assert.equal(isOperationalPositionPlaceholder({ code: ' GEN ', name: 'นักวิเคราะห์' }), true)
})

test('validation batching covers the 0/1/100/101/200/2000/2001 ID boundaries exactly once', () => {
  assert.equal(POSITION_MAPPING_VALIDATION_BATCH_SIZE, 100)

  const makeIds = (count: number) => Array.from({ length: count }, (_, index) => `id-${index}`)
  const boundaries: Array<[number, number, number | null]> = [
    [0, 0, null], // empty selection -> no batches, no fetch
    [1, 1, 1], // single ID -> one small batch
    [100, 1, 100], // exact batch size -> one full batch
    [101, 2, 1], // one over -> second batch carries the remainder
    [200, 2, 100], // exactly two full batches
    [2000, 20, 100], // RPC cap -> 20 full batches, still allowed
    [2001, 21, 1], // over the cap -> chunking itself is fine; the cap check rejects it earlier
  ]

  for (const [count, expectedBatchCount, expectedLastSize] of boundaries) {
    const ids = makeIds(count)
    const batches = chunkPositionIds(ids, POSITION_MAPPING_VALIDATION_BATCH_SIZE)
    assert.equal(batches.length, expectedBatchCount, `batch count for ${count} ids`)
    // Flattened batches reproduce the requested set exactly once, in order —
    // no silent drops, no duplicates across batch seams.
    assert.deepEqual(batches.flat(), ids, `coverage for ${count} ids`)
    if (expectedLastSize !== null) {
      assert.equal(batches[batches.length - 1].length, expectedLastSize, `last batch size for ${count} ids`)
    }
    for (const batch of batches) {
      assert.ok(batch.length > 0 && batch.length <= POSITION_MAPPING_VALIDATION_BATCH_SIZE)
    }
  }
})
