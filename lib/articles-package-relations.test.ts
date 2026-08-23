import assert from 'node:assert/strict'
import test from 'node:test'

import { validateArticleDraft, validateArticleForPublish } from '@/lib/articles'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validatePackageIds(packageIds: unknown): { ok: boolean; error?: string; clean?: string[] } {
  if (!Array.isArray(packageIds)) {
    return { ok: false, error: 'รูปแบบข้อมูลแพ็กเกจไม่ถูกต้อง' }
  }

  for (const pkgId of packageIds) {
    if (typeof pkgId !== 'string' || !UUID_REGEX.test(pkgId)) {
      return { ok: false, error: 'พบรหัสแพ็กเกจที่มีรูปแบบไม่ถูกต้อง' }
    }
  }

  const unique = Array.from(new Set(packageIds))
  return { ok: true, clean: unique }
}

function reconcileRelations(currentPackageIds: string[], nextPackageIds: string[]) {
  const uniquePkgIds = Array.from(new Set(nextPackageIds))
  const removedIds = currentPackageIds.filter((id) => !uniquePkgIds.includes(id))
  const desiredRows = uniquePkgIds.map((pkgId, index) => ({
    package_id: pkgId,
    sort_order: index,
  }))
  return { desiredRows, removedIds }
}

function mapPublicRelatedPackages(rows: any[]) {
  return (rows || [])
    .map((row: any) => {
      const pkg = row.packages
      if (!pkg || !pkg.is_published) return null
      return {
        id: pkg.id,
        name: pkg.name,
        slug: pkg.slug,
        current_price: pkg.current_price,
        original_price: pkg.original_price,
        description: pkg.description,
        cover_image_url: pkg.cover_image_url,
        logo_url: pkg.logo_url,
        is_published: pkg.is_published,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

test('1. Package IDs validation: accepts valid UUID array', () => {
  const res = validatePackageIds([
    '4282929e-e993-4901-9e76-b283b9d765e2',
    'c898c88f-ffce-4e85-ba3b-7f5122d38564',
  ])
  assert.equal(res.ok, true)
  assert.equal(res.clean?.length, 2)
})

test('2. Package IDs validation: deduplicates redundant package IDs', () => {
  const res = validatePackageIds([
    '4282929e-e993-4901-9e76-b283b9d765e2',
    '4282929e-e993-4901-9e76-b283b9d765e2',
  ])
  assert.equal(res.ok, true)
  assert.equal(res.clean?.length, 1)
})

test('3. Package IDs validation: rejects non-array input', () => {
  const res = validatePackageIds('not-an-array')
  assert.equal(res.ok, false)
  assert.equal(res.error, 'รูปแบบข้อมูลแพ็กเกจไม่ถูกต้อง')
})

test('4. Package IDs validation: rejects invalid UUID strings', () => {
  const res = validatePackageIds(['invalid-uuid-123'])
  assert.equal(res.ok, false)
  assert.equal(res.error, 'พบรหัสแพ็กเกจที่มีรูปแบบไม่ถูกต้อง')
})

test('5. Reconciliation: computes desired rows with sort_order and identifies removed package IDs', () => {
  const current = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
  const next = ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']

  const { desiredRows, removedIds } = reconcileRelations(current, next)
  assert.deepEqual(removedIds, ['11111111-1111-1111-1111-111111111111'])
  assert.equal(desiredRows.length, 2)
  assert.equal(desiredRows[0].package_id, '22222222-2222-2222-2222-222222222222')
  assert.equal(desiredRows[0].sort_order, 0)
  assert.equal(desiredRows[1].package_id, '33333333-3333-3333-3333-333333333333')
  assert.equal(desiredRows[1].sort_order, 1)
})

test('6. Reconciliation: removing all packages produces empty desiredRows and full removedIds', () => {
  const current = ['11111111-1111-1111-1111-111111111111']
  const next: string[] = []

  const { desiredRows, removedIds } = reconcileRelations(current, next)
  assert.deepEqual(removedIds, ['11111111-1111-1111-1111-111111111111'])
  assert.equal(desiredRows.length, 0)
})

test('7. Public Related Packages: filters out unpublished packages', () => {
  const rawRows = [
    {
      sort_order: 0,
      packages: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'แพ็กเกจ ก.พ. ภาค ก',
        slug: 'ocsc-part-a',
        current_price: 390,
        original_price: 590,
        description: 'เตรียมสอบภาค ก ครบทุกวิชา',
        cover_image_url: 'https://example.com/cover.jpg',
        logo_url: null,
        is_published: true,
      },
    },
    {
      sort_order: 1,
      packages: {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'แพ็กเกจ ก.พ. ภาค ข (ร่าง)',
        slug: 'ocsc-part-b-draft',
        current_price: 490,
        original_price: null,
        description: 'ยังไม่เผยแพร่',
        cover_image_url: null,
        logo_url: null,
        is_published: false,
      },
    },
  ]

  const mapped = mapPublicRelatedPackages(rawRows)
  assert.equal(mapped.length, 1)
  assert.equal(mapped[0].name, 'แพ็กเกจ ก.พ. ภาค ก')
  assert.equal(mapped[0].is_published, true)
})

test('8. Article validation: draft with author and sources passes validation independently of package relations', () => {
  const draft = validateArticleDraft({
    title: 'สอบราชการ ภาค ก ภาค ข ภาค ค ต่างกันอย่างไร',
    slug: 'civil-service-exam-structure-guide',
    author_id: '550e8400-e29b-41d4-a716-446655440000',
    sources: [
      { title: 'สำนักงาน ก.พ.', url: 'https://www.ocsc.go.th', source_date: '2026-08-20' },
    ],
  })
  assert.equal(draft.ok, true)
  assert.equal(draft.clean?.author_id, '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(draft.clean?.sources?.length, 1)
})

test('9. Article validation: publish readiness gate passes with full content and author/sources', () => {
  const candidate = {
    title: 'สอบราชการ ภาค ก ภาค ข ภาค ค ต่างกันอย่างไร',
    slug: 'civil-service-exam-structure-guide',
    category: 'exam-guide',
    excerpt: 'สรุปครบทุกขั้นตอนการสอบราชการ',
    body_markdown: '# คู่มือสอบราชการ\n\nเนื้อหาบทความละเอียด...',
    cover_image_url: 'https://example.com/cover.jpg',
    cover_image_alt: 'ภาพปกบทความสอบราชการ',
    status: 'published',
    published_at: '2026-08-20T00:00:00Z',
    author_id: '550e8400-e29b-41d4-a716-446655440000',
    sources: [
      { title: 'สำนักงาน ก.พ.', url: 'https://www.ocsc.go.th', source_date: '2026-08-20' },
    ],
  }
  const res = validateArticleForPublish(candidate)
  assert.equal(res.ok, true)
  assert.equal(res.clean?.status, 'published')
})
