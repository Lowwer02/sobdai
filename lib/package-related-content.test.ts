import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RelatedNewsItem, RelatedArticleItem, PackageRelatedContent } from './package-related-content'

test('PackageRelatedContent contracts and empty-guard guarantees', () => {
  const emptyContent: PackageRelatedContent = { news: [], articles: [] }
  assert.equal(emptyContent.news.length, 0)
  assert.equal(emptyContent.articles.length, 0)

  const newsItem: RelatedNewsItem = {
    id: 'news-1',
    slug: 'opsmoac-recruitment-2026',
    title: 'สำนักงานปลัดกระทรวงเกษตรฯ เปิดรับสมัครสอบ',
    published_at: '2026-03-01T00:00:00Z',
    category: 'ข่าวเปิดสอบ',
  }

  const articleItem: RelatedArticleItem = {
    id: 'art-1',
    slug: 'stong-policy-and-plan-analyst-exam-guide',
    title: 'เตรียมสอบนักวิเคราะห์นโยบายและแผน สตง. อ่านอะไรบ้าง',
    excerpt: 'แนวทางเตรียมตัวสอบ สตง.',
    published_at: '2026-03-01T00:00:00Z',
    category: 'คู่มือเตรียมสอบ',
  }

  const populated: PackageRelatedContent = {
    news: [newsItem],
    articles: [articleItem],
  }

  assert.equal(populated.news.length, 1)
  assert.equal(populated.articles.length, 1)
  assert.equal(populated.news[0].slug, 'opsmoac-recruitment-2026')
  assert.equal(populated.articles[0].slug, 'stong-policy-and-plan-analyst-exam-guide')
})
