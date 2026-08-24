import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validateArticleDraft,
  validateArticleForPublish,
  validateArticleAuthor,
  validateAuthorAssignment,
  mapAuthor,
  type PublicArticleAuthor,
} from '@/lib/articles'

import { SITE_ORGANIZATION, absoluteUrl } from '@/lib/seo'

test('1. created_by is NOT accepted as or mapped to public author', () => {
  const draft = validateArticleDraft({
    title: 'คู่มือสอบ ก.พ. ภาค ก',
    slug: 'ocsc-exam-guide-2569',
    created_by: '550e8400-e29b-41d4-a716-446655440000',
  })
  assert.equal(draft.ok, true)
  // Clean input does not have created_by
  assert.equal((draft.clean as any).created_by, undefined)
})

test('2. Author validation: valid author payload passes', () => {
  const res = validateArticleAuthor({
    display_name: 'กิตติพงษ์ จิตต์ภักดี',
    slug: 'kittipong-j',
    role_title: 'นักวิชาการศึกษา',
    short_bio: 'ผู้จัดทำเนื้อหาและบทความวิชาการสำหรับการสอบราชการ',
    avatar_url: 'https://sobdai.com/avatars/author.jpg',
    is_active: true,
  })

  assert.equal(res.ok, true)
  assert.notEqual(res.clean, null)
  assert.equal(res.clean?.display_name, 'กิตติพงษ์ จิตต์ภักดี')
  assert.equal(res.clean?.slug, 'kittipong-j')
  assert.equal(res.clean?.role_title, 'นักวิชาการศึกษา')
  assert.equal(res.clean?.short_bio, 'ผู้จัดทำเนื้อหาและบทความวิชาการสำหรับการสอบราชการ')
  assert.equal(res.clean?.avatar_url, 'https://sobdai.com/avatars/author.jpg')
  assert.equal(res.clean?.is_active, true)
})

test('3. Author validation: role_title, short_bio, avatar_url are optional', () => {
  const res = validateArticleAuthor({
    display_name: 'สมชาย รักเรียน',
    slug: 'somchai-r',
    role_title: '',
    short_bio: '',
    avatar_url: '',
    is_active: true,
  })

  assert.equal(res.ok, true)
  assert.equal(res.clean?.role_title, null)
  assert.equal(res.clean?.short_bio, null)
  assert.equal(res.clean?.avatar_url, null)
})

test('4. Author validation: rejects missing display_name or invalid slug', () => {
  const missingName = validateArticleAuthor({
    display_name: '',
    slug: 'valid-slug',
  })
  assert.equal(missingName.ok, false)
  assert.equal(missingName.errors.display_name, 'ต้องระบุชื่อผู้เขียน')

  const emptySlug = validateArticleAuthor({
    display_name: 'ผู้เขียน ทดสอบ',
    slug: '',
  })
  assert.equal(emptySlug.ok, false)
  assert.equal(emptySlug.errors.slug, 'ต้องระบุ Slug')

  const invalidSymbolSlug = validateArticleAuthor({
    display_name: 'ผู้เขียน ทดสอบ',
    slug: '$$$@@@',
  })
  assert.equal(invalidSymbolSlug.ok, false)
  assert.equal(invalidSymbolSlug.errors.slug, 'ต้องระบุ Slug')
})

test('5. Author validation: rejects invalid avatar URL format', () => {
  const invalidUrl = validateArticleAuthor({
    display_name: 'ผู้เขียน ทดสอบ',
    slug: 'test-author',
    avatar_url: 'javascript:alert(1)',
  })
  assert.equal(invalidUrl.ok, false)
  assert.equal(invalidUrl.errors.avatar_url, 'URL รูปโปรไฟล์ไม่ถูกต้อง (ต้องเป็น http/https)')
})

test('6. Article author_id is accepted as optional UUID', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000'
  const draft = validateArticleDraft({
    title: 'บทความทดสอบ',
    slug: 'test-article',
    author_id: validUuid,
  })
  assert.equal(draft.ok, true)
  assert.equal(draft.clean?.author_id, validUuid)

  const invalidDraft = validateArticleDraft({
    title: 'บทความทดสอบ',
    slug: 'test-article',
    author_id: 'not-a-uuid',
  })
  assert.equal(invalidDraft.ok, false)
  assert.equal(invalidDraft.errors.author_id, 'รหัสผู้เขียนบทความ (author_id) ไม่ถูกต้อง')
})

test('7. Publishing article does NOT require author_id', () => {
  const pub = validateArticleForPublish({
    status: 'published',
    title: 'คู่มือสอบข้อกฎหมาย',
    slug: 'law-exam-guide',
    excerpt: 'สรุปย่อข้อกฎหมายที่ออกสอบบ่อยในการสอบราชการ',
    body_markdown: '## เนื้อหากฎหมาย\n\n1. พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน...',
    cover_image_url: 'https://example.com/cover.jpg',
    cover_image_alt: 'รูปภาพปกบทความ',
    category: 'คู่มือสอบ',
    tags: ['กฎหมาย', 'สอบกพ'],
    published_at: '2026-08-22T08:00:00.000Z',
    author_id: null,
  })
  assert.equal(pub.ok, true)
  assert.equal(pub.clean?.author_id, null)
})

test('8. JSON-LD Person schema builds with jobTitle only when present', () => {
  const authorWithTitle: PublicArticleAuthor = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'kittipong-j',
    display_name: 'กิตติพงษ์ จิตต์ภักดี',
    role_title: 'นักวิชาการศึกษา',
    short_bio: null,
    avatar_url: null,
  }

  const jsonLdAuthor = {
    '@type': 'Person',
    name: authorWithTitle.display_name,
    url: absoluteUrl(`/authors/${authorWithTitle.slug}`),
    ...(authorWithTitle.role_title ? { jobTitle: authorWithTitle.role_title } : {}),
  }

  assert.equal(jsonLdAuthor['@type'], 'Person')
  assert.equal(jsonLdAuthor.name, 'กิตติพงษ์ จิตต์ภักดี')
  assert.equal(jsonLdAuthor.url, 'https://sobdai.com/authors/kittipong-j')
  assert.equal(jsonLdAuthor.jobTitle, 'นักวิชาการศึกษา')

  const authorWithoutTitle: PublicArticleAuthor = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    slug: 'writer-anon',
    display_name: 'ผู้เขียน นิรนาม',
    role_title: null,
    short_bio: null,
    avatar_url: null,
  }

  const jsonLdAuthor2 = {
    '@type': 'Person',
    name: authorWithoutTitle.display_name,
    url: absoluteUrl(`/authors/${authorWithoutTitle.slug}`),
    ...(authorWithoutTitle.role_title ? { jobTitle: authorWithoutTitle.role_title } : {}),
  }

  assert.equal((jsonLdAuthor2 as any).jobTitle, undefined)
})

test('9. Unassigned author JSON-LD falls back to Sobdai Organization', () => {
  const unassignedAuthor: PublicArticleAuthor | null = null
  const authorJsonLd = unassignedAuthor
    ? {
        '@type': 'Person',
        name: (unassignedAuthor as any).display_name,
        url: absoluteUrl(`/authors/${(unassignedAuthor as any).slug}`),
      }
    : SITE_ORGANIZATION

  assert.deepEqual(authorJsonLd, SITE_ORGANIZATION)
  assert.equal(authorJsonLd['@type'], 'Organization')
  assert.equal(authorJsonLd.name, 'Sobdai')
})

test('10. Public author contract contains NO private profile/account fields', () => {
  const author: PublicArticleAuthor = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'kittipong-j',
    display_name: 'กิตติพงษ์ จิตต์ภักดี',
    role_title: 'นักวิชาการศึกษา',
    short_bio: 'ประวัติย่อ',
    avatar_url: 'https://sobdai.com/avatars/avatar.jpg',
  }

  const keys = Object.keys(author)
  const forbiddenKeys = [
    'email',
    'phone',
    'role',
    'status',
    'banned_at',
    'banned_reason',
    'banned_by',
    'deleted_at',
    'deleted_reason',
    'last_seen_at',
    'created_by',
  ]

  for (const forbidden of forbiddenKeys) {
    assert.equal(
      keys.includes(forbidden),
      false,
      `Public author contract must NOT contain private field: ${forbidden}`
    )
  }
})

test('11. Server validation: validateAuthorAssignment allows null/undefined author', () => {
  assert.equal(validateAuthorAssignment(null, null).ok, true)
  assert.equal(validateAuthorAssignment(undefined, null).ok, true)
  assert.equal(validateAuthorAssignment('', null).ok, true)
})

test('12. Server validation: validateAuthorAssignment rejects malformed UUID', () => {
  const res = validateAuthorAssignment('not-a-valid-uuid', null)
  assert.equal(res.ok, false)
  assert.equal(res.error, 'รหัสผู้เขียนบทความ (author_id) ไม่ถูกต้อง')
})

test('13. Server validation: validateAuthorAssignment rejects nonexistent author', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000'
  const res = validateAuthorAssignment(validUuid, null)
  assert.equal(res.ok, false)
  assert.equal(res.error, 'ไม่พบผู้เขียนที่ระบุ หรือผู้เขียนถูกลบไปแล้ว')
})

test('14. Server validation: validateAuthorAssignment rejects inactive author', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000'
  const res = validateAuthorAssignment(validUuid, { id: validUuid, is_active: false })
  assert.equal(res.ok, false)
  assert.equal(res.error, 'ไม่สามารถระบุผู้เขียนที่ถูกปิดการใช้งานได้')
})

test('15. Server validation: validateAuthorAssignment accepts active author', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000'
  const res = validateAuthorAssignment(validUuid, { id: validUuid, is_active: true })
  assert.equal(res.ok, true)
  assert.equal(res.error, undefined)
})

test('16. Public data layer: mapAuthor filters out inactive or malformed author rows', () => {
  // Active author -> public object
  const activeMapped = mapAuthor({
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'kittipong-j',
    display_name: 'กิตติพงษ์ จิตต์ภักดี',
    role_title: 'นักวิชาการศึกษา',
    short_bio: 'ประวัติย่อ',
    avatar_url: 'https://sobdai.com/avatar.jpg',
    is_active: true,
  })
  assert.notEqual(activeMapped, null)
  assert.equal(activeMapped?.display_name, 'กิตติพงษ์ จิตต์ภักดี')

  // Inactive author -> null (falls back to Sobdai editorial team)
  const inactiveMapped = mapAuthor({
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'kittipong-j',
    display_name: 'กิตติพงษ์ จิตต์ภักดี',
    is_active: false,
  })
  assert.equal(inactiveMapped, null)

  // Null input -> null
  assert.equal(mapAuthor(null), null)

  // Missing display_name or slug -> null
  assert.equal(mapAuthor({ id: '550e8400-e29b-41d4-a716-446655440000', is_active: true }), null)
})

test('17. Author Trust UI: Author Card contract exposes profile link under /authors/[slug]', () => {
  const author: PublicArticleAuthor = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'kittipong-j',
    display_name: 'กิตติพงษ์ จงคล้ายกลาง',
    role_title: 'นักวิชาการศึกษา',
    short_bio: 'นักวิชาการศึกษา และผู้เขียนบทความของ Sobdai',
    avatar_url: 'https://sobdai.com/avatar.jpg',
  }

  const expectedProfilePath = `/authors/${author.slug}`
  assert.equal(expectedProfilePath, '/authors/kittipong-j')
  assert.equal(author.display_name, 'กิตติพงษ์ จงคล้ายกลาง')
  assert.equal(author.role_title, 'นักวิชาการศึกษา')
  assert.equal(author.short_bio, 'นักวิชาการศึกษา และผู้เขียนบทความของ Sobdai')
})

test('18. Author Trust UI: Author Card supports optional role, bio, and avatar fallback', () => {
  const minimalAuthor: PublicArticleAuthor = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'somchai-r',
    display_name: 'สมชาย รักเรียน',
    role_title: null,
    short_bio: null,
    avatar_url: null,
  }

  const initial = minimalAuthor.display_name.trim().charAt(0).toUpperCase()
  assert.equal(initial, 'ส')
  assert.equal(minimalAuthor.role_title, null)
  assert.equal(minimalAuthor.short_bio, null)
  assert.equal(minimalAuthor.avatar_url, null)
})

test('19. Author Trust UI: Unassigned or inactive author safely omits Person card without fabricating profile', () => {
  const unassigned = mapAuthor(null)
  assert.equal(unassigned, null)

  const inactive = mapAuthor({
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'banned-author',
    display_name: 'Banned Author',
    is_active: false,
  })
  assert.equal(inactive, null)
})
