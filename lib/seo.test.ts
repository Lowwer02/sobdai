import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { NEWS_HUB_DESCRIPTION, NEWS_HUB_H1, NEWS_HUB_SUBTITLE, NEWS_HUB_TITLE, SITE_NAME, resolveNewsCanonicalUrl, isSelfCanonicalNewsArticle } from './seo.ts'

/**
 * SEO-P2C — /news keyword-ownership contract.
 *
 * The /news hub owns the ข่าวสอบราชการ / ข่าวสอบราชการล่าสุด cluster.
 * These tests pin the keyword ownership so the page can never silently drift
 * back to generic copy or let the practice-exam intent (แนวข้อสอบราชการ)
 * become its primary keyword.
 */

test('news hub title front-loads the primary keyword ข่าวสอบราชการ and carries brand suffix exactly once', () => {
  assert.equal(NEWS_HUB_TITLE.startsWith('ข่าวสอบราชการ'), true)
  assert.ok(NEWS_HUB_TITLE.length <= 60, `title too long: ${NEWS_HUB_TITLE.length}`)
  assert.ok(NEWS_HUB_TITLE.includes(`| ${SITE_NAME}`))
  assert.equal((NEWS_HUB_TITLE.match(new RegExp(SITE_NAME, 'g')) || []).length, 1)
})

test('news hub title covers the core cluster terms', () => {
  assert.ok(NEWS_HUB_TITLE.includes('ข่าวสอบราชการ'), 'missing ข่าวสอบราชการ')
  assert.ok(NEWS_HUB_TITLE.includes('ข่าวเปิดสอบราชการล่าสุด'), 'missing ข่าวเปิดสอบราชการล่าสุด')
})

test('news hub description front-loads the cluster and stays under ~160 chars', () => {
  assert.ok(NEWS_HUB_DESCRIPTION.startsWith('อัปเดตข่าวสอบราชการ'), 'description must lead with the cluster')
  assert.ok(NEWS_HUB_DESCRIPTION.includes('ข่าวเปิดสอบราชการล่าสุด'))
  assert.ok(NEWS_HUB_DESCRIPTION.includes('ประกาศรับสมัครจากหน่วยงานราชการ'))
  assert.ok(NEWS_HUB_DESCRIPTION.length <= 160, `description too long: ${NEWS_HUB_DESCRIPTION.length}`)
})

test('news hub H1 owns the primary keyword naturally', () => {
  assert.ok(NEWS_HUB_H1.includes('ข่าวสอบราชการ'), 'H1 must own ข่าวสอบราชการ')
  assert.ok(NEWS_HUB_H1.includes('ข่าวเปิดสอบราชการล่าสุด'), 'H1 should carry the recruitment intent')
  assert.ok(NEWS_HUB_H1.length <= 60)
})

test('news hub hero subtitle reinforces the cluster without diluting the H1', () => {
  assert.ok(NEWS_HUB_SUBTITLE.includes('รวมข่าวสอบราชการและข่าวเปิดสอบราชการล่าสุด'))
  assert.ok(NEWS_HUB_SUBTITLE.includes('ประกาศรับสมัคร'))
  assert.ok(NEWS_HUB_SUBTITLE.includes('กำหนดการสำคัญ'))
  assert.ok(NEWS_HUB_SUBTITLE.length <= 200)
})

test('practice-exam intent (แนวข้อสอบราชการ) is absent from news hub copy', () => {
  assert.equal(NEWS_HUB_TITLE.includes('แนวข้อสอบราชการ'), false)
  assert.equal(NEWS_HUB_H1.includes('แนวข้อสอบราชการ'), false)
  assert.equal(NEWS_HUB_DESCRIPTION.includes('แนวข้อสอบราชการ'), false)
  assert.equal(NEWS_HUB_SUBTITLE.includes('แนวข้อสอบราชการ'), false)
})

// ─── Sitemap canonical hygiene (AdSense readiness P0) ────────────────────────
//
// sitemap.xml must only ever list self-canonical news URLs. A row whose
// editor-set canonical_url points at another slug is an alias of that target
// (e.g. /news/led-recruitment-2026-1 → /news/led-recruitment-2026) and is
// filtered out of the sitemap by isSelfCanonicalNewsArticle, which shares its
// normalization with the page canonical via resolveNewsCanonicalUrl.

test('news canonical resolver falls back to the row own /news/<slug> URL when canonical_url is blank', () => {
  assert.equal(resolveNewsCanonicalUrl('led-recruitment-2026', null), 'https://sobdai.com/news/led-recruitment-2026')
  assert.equal(resolveNewsCanonicalUrl('led-recruitment-2026', ''), 'https://sobdai.com/news/led-recruitment-2026')
  assert.equal(resolveNewsCanonicalUrl('led-recruitment-2026', '   '), 'https://sobdai.com/news/led-recruitment-2026')
  assert.equal(resolveNewsCanonicalUrl('led-recruitment-2026', undefined), 'https://sobdai.com/news/led-recruitment-2026')
})

test('news canonical resolver passes an editor-set canonical through trimmed (path or absolute)', () => {
  assert.equal(resolveNewsCanonicalUrl('a', ' /news/b '), 'https://sobdai.com/news/b')
  assert.equal(resolveNewsCanonicalUrl('a', 'https://external.example.com/story'), 'https://external.example.com/story')
})

test('a news row with blank canonical_url is self-canonical', () => {
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026', null), true)
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026', ''), true)
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026', undefined), true)
})

test('a news row canonicalizing back to its own URL is self-canonical', () => {
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026', '/news/led-recruitment-2026'), true)
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026', '  /news/led-recruitment-2026  '), true)
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026', 'https://sobdai.com/news/led-recruitment-2026'), true)
})

test('a news row canonicalizing elsewhere is NOT self-canonical (sitemap alias case)', () => {
  // The audited production case: the alias slug canonicalizes to the real slug.
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026-1', '/news/led-recruitment-2026'), false)
  assert.equal(isSelfCanonicalNewsArticle('led-recruitment-2026-1', 'https://sobdai.com/news/led-recruitment-2026'), false)
  assert.equal(isSelfCanonicalNewsArticle('a', 'https://external.example.com/source-article'), false)
})
