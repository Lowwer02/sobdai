import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validateArticleDraft,
  validateArticleForPublish,
  validateArticleSources,
  coerceSources,
  parseSourceDate,
  type ArticleSource,
} from '@/lib/articles'

import { formatThaiSourceDate } from '@/components/articles/ArticleReferences'

test('1. no sources -> normalized []', () => {
  const res1 = validateArticleSources(undefined)
  assert.equal(res1.ok, true)
  assert.deepEqual(res1.clean, [])

  const res2 = validateArticleSources(null)
  assert.equal(res2.ok, true)
  assert.deepEqual(res2.clean, [])

  const res3 = validateArticleSources([])
  assert.equal(res3.ok, true)
  assert.deepEqual(res3.clean, [])

  const draft = validateArticleDraft({
    title: 'บทความทดสอบ',
    slug: 'test-article-no-sources',
  })
  assert.equal(draft.ok, true)
  assert.deepEqual(draft.clean?.sources, [])
})

test('2. Draft with zero sources -> allowed', () => {
  const draft = validateArticleDraft({
    title: 'ร่างบทความไม่มีแหล่งอ้างอิง',
    slug: 'draft-zero-sources',
    sources: [],
  })
  assert.equal(draft.ok, true)
  assert.deepEqual(draft.clean?.sources, [])
})

test('3. Publish with zero sources -> allowed', () => {
  const publish = validateArticleForPublish({
    status: 'published',
    title: 'บทความเผยแพร่ไม่มีแหล่งอ้างอิง',
    slug: 'publish-zero-sources',
    excerpt: 'บทสรุปย่อบทความ',
    body_markdown: '# หัวข้อ\nเนื้อหาบทความ',
    cover_image_url: 'https://sobdai.com/cover.jpg',
    cover_image_alt: 'ภาพปกบทความ',
    category: 'คู่มือสอบ',
    tags: ['กพ'],
    published_at: '2026-08-22T00:00:00Z',
    sources: [],
  })
  assert.equal(publish.ok, true)
  assert.deepEqual(publish.clean?.sources, [])
})

test('4. valid source title + HTTP URL -> allowed', () => {
  const res = validateArticleSources([
    {
      title: 'ประกาศรับสมัครสอบ ก.พ. ภาค ก',
      url: 'http://job.ocsc.go.th/announcement.pdf',
    },
  ])
  assert.equal(res.ok, true)
  assert.equal(res.clean.length, 1)
  assert.equal(res.clean[0].title, 'ประกาศรับสมัครสอบ ก.พ. ภาค ก')
  assert.equal(res.clean[0].url, 'http://job.ocsc.go.th/announcement.pdf')
  assert.equal(res.clean[0].source_date, null)
})

test('5. valid source title + HTTPS URL -> allowed', () => {
  const res = validateArticleSources([
    {
      title: 'มติคณะรัฐมนตรี เรื่อง อัตรากำลังคน',
      url: 'https://www.thaigov.go.th/news/contents/details/12345',
      source_date: '2026-08-11',
    },
  ])
  assert.equal(res.ok, true)
  assert.equal(res.clean.length, 1)
  assert.equal(res.clean[0].title, 'มติคณะรัฐมนตรี เรื่อง อัตรากำลังคน')
  assert.equal(res.clean[0].url, 'https://www.thaigov.go.th/news/contents/details/12345')
  assert.equal(res.clean[0].source_date, '2026-08-11')
})

test('6. blank optional source_date -> allowed', () => {
  const res = validateArticleSources([
    {
      title: 'ระเบียบสำนักนายกรัฐมนตรี',
      url: 'https://www.soc.go.th/rules',
      source_date: '',
    },
  ])
  assert.equal(res.ok, true)
  assert.equal(res.clean[0].source_date, null)
})

test('7. valid CE source_date -> allowed', () => {
  const parsed = parseSourceDate('2026-08-11')
  assert.equal(parsed, '2026-08-11')

  const res = validateArticleSources([
    {
      title: 'เอกสารอ้างอิง',
      url: 'https://example.com/doc',
      source_date: '2026-08-11',
    },
  ])
  assert.equal(res.ok, true)
  assert.equal(res.clean[0].source_date, '2026-08-11')
})

test('8. BE-as-CE source_date -> rejected', () => {
  const res = validateArticleSources([
    {
      title: 'เอกสารปี พ.ศ.',
      url: 'https://example.com/doc',
      source_date: '2569-08-11',
    },
  ])
  assert.equal(res.ok, false)
  assert.equal(res.errors['sources[0].source_date'], 'กรุณากรอกปี ค.ศ. เช่น 2026')
})

test('9. blank title -> rejected', () => {
  const res = validateArticleSources([
    {
      title: '',
      url: 'https://example.com/doc',
    },
  ])
  assert.equal(res.ok, false)
  assert.equal(res.errors['sources[0].title'], 'กรุณาระบุชื่อเอกสารหรือแหล่งข้อมูลอ้างอิง')
})

test('10. blank URL -> rejected', () => {
  const res = validateArticleSources([
    {
      title: 'มีชื่อแต่ไม่มี URL',
      url: '',
    },
  ])
  assert.equal(res.ok, false)
  assert.equal(res.errors['sources[0].url'], 'กรุณาระบุ URL แหล่งข้อมูลอ้างอิง')
})

test('11. invalid URL -> rejected', () => {
  const res = validateArticleSources([
    {
      title: 'URL ไม่ถูกต้อง',
      url: 'not-a-valid-url',
    },
  ])
  assert.equal(res.ok, false)
  assert.equal(res.errors['sources[0].url'], 'URL แหล่งข้อมูลต้องเป็น http:// หรือ https:// ที่ถูกต้อง')
})

test('12. non-http(s) protocol -> rejected', () => {
  const res = validateArticleSources([
    {
      title: 'Javascript protocol',
      url: 'javascript:alert(1)',
    },
  ])
  assert.equal(res.ok, false)
  assert.equal(res.errors['sources[0].url'], 'URL แหล่งข้อมูลต้องเป็น http:// หรือ https:// ที่ถูกต้อง')
})

test('13. partially-filled source row -> rejected', () => {
  const draft = validateArticleDraft({
    title: 'ร่างบทความ',
    slug: 'draft-partial-source',
    sources: [
      {
        title: 'มีแต่ชื่อเอกสาร',
        url: '',
      },
    ],
  })
  assert.equal(draft.ok, false)
  assert.equal(draft.errors['sources[0].url'], 'กรุณาระบุ URL แหล่งข้อมูลอ้างอิง')

  const publish = validateArticleForPublish({
    status: 'published',
    title: 'บทความเผยแพร่',
    slug: 'publish-partial-source',
    excerpt: 'บทสรุปย่อบทความ',
    body_markdown: '# หัวข้อ\nเนื้อหาบทความ',
    cover_image_url: 'https://sobdai.com/cover.jpg',
    cover_image_alt: 'ภาพปกบทความ',
    category: 'คู่มือสอบ',
    tags: ['กพ'],
    published_at: '2026-08-22T00:00:00Z',
    sources: [
      {
        title: '',
        url: 'https://example.com/doc',
      },
    ],
  })
  assert.equal(publish.ok, false)
  assert.equal(publish.errors['sources[0].title'], 'กรุณาระบุชื่อเอกสารหรือแหล่งข้อมูลอ้างอิง')
})

test('14. source array order preserved', () => {
  const inputSources: ArticleSource[] = [
    { title: 'แหล่งที่ 1', url: 'https://example.com/1', source_date: '2026-01-01' },
    { title: 'แหล่งที่ 2', url: 'https://example.com/2', source_date: '2026-02-02' },
    { title: 'แหล่งที่ 3', url: 'https://example.com/3', source_date: '2026-03-03' },
  ]

  const coerced = coerceSources(inputSources)
  assert.equal(coerced.length, 3)
  assert.equal(coerced[0].title, 'แหล่งที่ 1')
  assert.equal(coerced[1].title, 'แหล่งที่ 2')
  assert.equal(coerced[2].title, 'แหล่งที่ 3')

  const res = validateArticleSources(inputSources)
  assert.equal(res.ok, true)
  assert.equal(res.clean[0].title, 'แหล่งที่ 1')
  assert.equal(res.clean[1].title, 'แหล่งที่ 2')
  assert.equal(res.clean[2].title, 'แหล่งที่ 3')
})

test('15. public Article with [] -> References component absent', () => {
  // coerceSources filters out completely empty rows
  assert.deepEqual(coerceSources([]), [])
  assert.deepEqual(coerceSources([{ title: '', url: '', source_date: '' }]), [])
})

test('16. public Article with sources -> References block present', () => {
  const sources: ArticleSource[] = [
    { title: 'ประกาศ ก.พ.', url: 'https://www.ocsc.go.th/announcement' },
  ]
  const coerced = coerceSources(sources)
  assert.equal(coerced.length, 1)
  assert.equal(coerced[0].title, 'ประกาศ ก.พ.')
  assert.equal(coerced[0].url, 'https://www.ocsc.go.th/announcement')
})

test('17. source date renders Thai BE correctly', () => {
  assert.equal(formatThaiSourceDate('2026-08-11'), '11 สิงหาคม 2569')
  assert.equal(formatThaiSourceDate('2025-01-01'), '1 มกราคม 2568')
  assert.equal(formatThaiSourceDate(''), '')
  assert.equal(formatThaiSourceDate(null), '')
  assert.equal(formatThaiSourceDate(undefined), '')
  assert.equal(formatThaiSourceDate('invalid-date'), '')
})

test('18. Article Author contract still passes', () => {
  const draft = validateArticleDraft({
    title: 'บทความทดสอบผู้เขียนและแหล่งอ้างอิง',
    slug: 'article-author-and-sources',
    author_id: '550e8400-e29b-41d4-a716-446655440000',
    sources: [
      {
        title: 'แหล่งข้อมูลราชการ',
        url: 'https://www.ocsc.go.th',
        source_date: '2026-08-11',
      },
    ],
  })

  assert.equal(draft.ok, true)
  assert.equal(draft.clean?.author_id, '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(draft.clean?.sources.length, 1)
  assert.equal(draft.clean?.sources[0].title, 'แหล่งข้อมูลราชการ')
})
