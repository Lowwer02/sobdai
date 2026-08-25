import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's native TypeScript strip-types test runner requires the explicit .ts extension.
import { createPageMetadata, PUBLIC_STATIC_ROUTES, PACKAGES_HUB_TITLE, PACKAGES_HUB_DESCRIPTION, PACKAGES_HUB_H1, PHAK_K_TITLE, PHAK_K_DESCRIPTION, PHAK_K_H1, PHAK_KHOR_TITLE, PHAK_KHOR_DESCRIPTION, PHAK_KHOR_H1, SITE_NAME } from '../../lib/seo.ts'

test('packages hub SEO metadata owns the general practice-exam cluster', () => {
  assert.ok(PACKAGES_HUB_TITLE.includes('แนวข้อสอบราชการ'), 'hub title must include แนวข้อสอบราชการ')
  assert.ok(PACKAGES_HUB_TITLE.includes(`| ${SITE_NAME}`))
  assert.ok(PACKAGES_HUB_DESCRIPTION.includes('ภาค ก'))
  assert.ok(PACKAGES_HUB_DESCRIPTION.includes('ภาค ข'))
  assert.equal(PACKAGES_HUB_H1, 'แพ็กเกจข้อสอบราชการทั้งหมด')
})

test('phak-k SEO metadata owns the ภาค ก ก.พ. cluster', () => {
  assert.ok(PHAK_K_TITLE.includes('แนวข้อสอบภาค ก ก.พ.'), 'phak-k title must own ภาค ก ก.พ.')
  assert.ok(PHAK_K_TITLE.includes(`| ${SITE_NAME}`))
  assert.ok(PHAK_K_DESCRIPTION.includes('เตรียมสอบภาค ก ก.พ.'))
  assert.equal(PHAK_K_H1, 'แนวข้อสอบภาค ก ก.พ.')
})

test('phak-khor SEO metadata owns the ภาค ข specific position cluster', () => {
  assert.ok(PHAK_KHOR_TITLE.includes('แนวข้อสอบภาค ข ราชการ ตามตำแหน่งและหน่วยงาน'), 'phak-khor title must own ภาค ข position cluster')
  assert.ok(PHAK_KHOR_TITLE.includes(`| ${SITE_NAME}`))
  assert.ok(PHAK_KHOR_DESCRIPTION.includes('แนวข้อสอบภาค ข ราชการ'))
  assert.equal(PHAK_KHOR_H1, 'แนวข้อสอบภาค ข ราชการ')
})

test('all three package routes have distinct non-overlapping titles', () => {
  const titles = new Set([PACKAGES_HUB_TITLE, PHAK_K_TITLE, PHAK_KHOR_TITLE])
  assert.equal(titles.size, 3, 'All 3 package routes must have distinct titles')
})

test('PUBLIC_STATIC_ROUTES includes /packages and /packages/phak-khor, but excludes /packages/phak-k', () => {
  const paths = PUBLIC_STATIC_ROUTES.map((r) => r.path)
  assert.ok(paths.includes('/packages'), 'sitemap must include /packages')
  assert.ok(paths.includes('/packages/phak-khor'), 'sitemap must include /packages/phak-khor')
  assert.equal(paths.includes('/packages/phak-k'), false, 'sitemap must NOT include /packages/phak-k while noindex')
})

test('createPageMetadata generates correct canonical URLs for each route', () => {
  const metaHub = createPageMetadata({
    title: PACKAGES_HUB_TITLE,
    description: PACKAGES_HUB_DESCRIPTION,
    path: '/packages',
  })
  assert.equal(metaHub.alternates?.canonical, 'https://sobdai.com/packages')

  const metaPhakK = createPageMetadata({
    title: PHAK_K_TITLE,
    description: PHAK_K_DESCRIPTION,
    path: '/packages/phak-k',
    noindex: true,
    follow: true,
  })
  assert.equal(metaPhakK.alternates?.canonical, 'https://sobdai.com/packages/phak-k')

  const metaPhakKhor = createPageMetadata({
    title: PHAK_KHOR_TITLE,
    description: PHAK_KHOR_DESCRIPTION,
    path: '/packages/phak-khor',
  })
  assert.equal(metaPhakKhor.alternates?.canonical, 'https://sobdai.com/packages/phak-khor')
})

test('createPageMetadata handles noindex: true with follow: true properly', () => {
  const meta = createPageMetadata({
    title: PHAK_K_TITLE,
    description: PHAK_K_DESCRIPTION,
    path: '/packages/phak-k',
    noindex: true,
    follow: true,
  })

  assert.deepEqual(meta.robots, {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  })
})

test('createPageMetadata handles standard indexed routes properly', () => {
  const meta = createPageMetadata({
    title: PHAK_KHOR_TITLE,
    description: PHAK_KHOR_DESCRIPTION,
    path: '/packages/phak-khor',
  })

  assert.deepEqual(meta.robots, {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  })
})
