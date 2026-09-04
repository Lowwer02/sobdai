import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { FAQ_CATEGORIES, FAQ_ITEMS, buildFaqPageJsonLd } from '../../content/faq/faq-data.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { PUBLIC_STATIC_ROUTES } from '../../lib/seo.ts'

const root = process.cwd()
const faqPageSource = readFileSync(join(root, 'app/faq/page.tsx'), 'utf8')
const faqDataSource = readFileSync(join(root, 'content/faq/faq-data.ts'), 'utf8')
const footerSource = readFileSync(join(root, 'components/Footer.tsx'), 'utf8')

test('FAQ metadata conforms to SEO specifications', () => {
  assert.match(
    faqPageSource,
    /title:\s*'คำถามที่พบบ่อยเกี่ยวกับ Sobdai \| FAQ'/,
    'Title does not match specification'
  )
  assert.match(
    faqPageSource,
    /description:\s*'รวมคำตอบเกี่ยวกับการใช้งาน Sobdai การเข้าสู่ระบบ การทำข้อสอบ ผลการทำข้อสอบ การทบทวน แพ็กเกจ และสิทธิ์การเข้าถึง'/,
    'Description does not match specification'
  )
  assert.match(
    faqPageSource,
    /path:\s*'\/faq'/,
    'Canonical path does not match /faq'
  )
})

test('FAQ data source contains exactly 14 items across 4 visual categories', () => {
  assert.strictEqual(FAQ_ITEMS.length, 14, 'Must have exactly 14 FAQ items')
  assert.strictEqual(FAQ_CATEGORIES.length, 4, 'Must have exactly 4 visual categories')

  const expectedCategoryIds = [
    'general',
    'getting-started',
    'taking-exams',
    'results-and-review',
  ]
  for (const catId of expectedCategoryIds) {
    assert.ok(
      FAQ_CATEGORIES.some((c: { id: string }) => c.id === catId),
      `Missing category id: ${catId}`
    )
    assert.ok(
      FAQ_ITEMS.some((item: { category: string }) => item.category === catId),
      `No items found under category: ${catId}`
    )
  }

  // Ensure all items have valid question, non-empty paragraphs, and category
  for (const item of FAQ_ITEMS) {
    assert.ok(item.id && item.id.length > 0, 'Item must have an id')
    assert.ok(item.question && item.question.length > 0, 'Item must have a question')
    assert.ok(Array.isArray(item.paragraphs) && item.paragraphs.length > 0, 'Item must have paragraphs')
    assert.ok(expectedCategoryIds.includes(item.category), `Invalid category for item ${item.id}`)
  }

  // Verify exactly the approved 7 FAQ items have link metadata with exact hrefs and text
  const expectedApprovedLinks: Record<string, { text: string; href: string }> = {
    'what-is-sobdai': {
      text: 'อ่านคู่มือวิธีใช้งาน Sobdai',
      href: '/help',
    },
    'where-to-start': {
      text: 'ไปยังหน้าคลังข้อสอบ',
      href: '/packages',
    },
    'practice-vs-mock': {
      text: 'ดูรายละเอียดและตัวอย่างโหมดการสอบ',
      href: '/help#exam-modes',
    },
    'where-to-view-results': {
      text: 'ไปยังหน้าข้อสอบของฉัน',
      href: '/exams',
    },
    'review-wrong-answers': {
      text: 'ดูขั้นตอนการทบทวนผลสอบ',
      href: '/help#results',
    },
    'package-validity': {
      text: 'ตรวจสอบข้อมูลในหน้าคลังแพ็กเกจ',
      href: '/packages',
    },
    'government-affiliation': {
      text: 'อ่านเกี่ยวกับ Sobdai และที่มาโครงการ',
      href: '/about',
    },
  }

  const itemsWithLink = FAQ_ITEMS.filter((item: { link?: unknown }) => item.link !== undefined)
  assert.strictEqual(
    itemsWithLink.length,
    7,
    `Expected exactly 7 FAQ items with links, found ${itemsWithLink.length}`
  )

  for (const [id, expectedLink] of Object.entries(expectedApprovedLinks)) {
    const item = FAQ_ITEMS.find((i: { id: string }) => i.id === id)
    assert.ok(item, `Item ${id} not found in FAQ_ITEMS`)
    assert.strictEqual(item.link?.href, expectedLink.href, `href mismatch for ${id}`)
    assert.strictEqual(item.link?.text, expectedLink.text, `text mismatch for ${id}`)
  }

  // Verify the other 7 FAQ items have NO link metadata
  const expectedLinkFreeIds = [
    'login-requirement',
    'exam-explanations',
    'practice-only-wrong-set',
    'bookmark-questions',
    'weak-topics-calculation',
    'resume-incomplete',
    'mobile-usage',
  ]
  for (const id of expectedLinkFreeIds) {
    const item = FAQ_ITEMS.find((i: { id: string }) => i.id === id)
    assert.ok(item, `Item ${id} not found in FAQ_ITEMS`)
    assert.strictEqual(item.link, undefined, `Item ${id} must not have link metadata`)
  }

  // Verify item 3 requires login even for trial/sample
  const item3 = FAQ_ITEMS.find((i: { id: string }) => i.id === 'login-requirement')
  assert.ok(item3, 'Item login-requirement not found')
  assert.strictEqual(item3.paragraphs.length, 2)
  assert.match(item3.paragraphs[0], /จะต้องเข้าสู่ระบบก่อนทุกครั้ง ไม่ว่าแพ็กเกจนั้นจะเป็นแบบทดลองหรือไม่ก็ตาม/)
})

test('FAQ page uses accessible native details and summary elements', () => {
  assert.match(faqPageSource, /<details\b/, 'Missing native <details> element')
  assert.match(faqPageSource, /<summary\b/, 'Missing native <summary> element')
  assert.match(faqPageSource, /\[&::-webkit-details-marker\]:hidden/, 'Missing WebKit marker reset')
  assert.match(faqPageSource, /cursor-pointer/, 'Missing pointer cursor on summary')
})

test('FAQ content strictly avoids forbidden patterns, claims, and routes', () => {
  const combined = `${faqPageSource}\n${faqDataSource}`

  // Forbidden: /dashboard route references (canonical is /exams)
  assert.doesNotMatch(combined, /['"`]\/dashboard['"`]/, 'Found forbidden route /dashboard')
  assert.doesNotMatch(combined, /href=["']\/dashboard["']/, 'Found forbidden link to /dashboard')

  // Canonical learner route is /exams
  assert.match(combined, /\/exams/, 'Expected reference to /exams')
  assert.match(combined, /ข้อสอบของฉัน/, 'Expected Thai label "ข้อสอบของฉัน"')

  // Forbidden: Emojis
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  assert.doesNotMatch(combined, emojiRegex, 'Found forbidden emoji in FAQ content')

  // Forbidden: Universal unverified claims
  assert.doesNotMatch(combined, /ทุกข้อมีเฉลยละเอียดทุกข้อ/, 'Found unsupported universal claim')
  assert.doesNotMatch(combined, /ทุกข้อมีหลักกฎหมาย/, 'Found unsupported legal claim')
  assert.doesNotMatch(combined, /ตลอดชีพทุกแพ็กเกจ/, 'Found unsupported universal duration claim')
  assert.doesNotMatch(combined, /1 ปีทุกแพ็กเกจ/, 'Found unsupported universal 1-year claim')
  assert.doesNotMatch(combined, /การันตีผลสอบ/, 'Found unsupported guarantee claim')
  assert.doesNotMatch(combined, /ทำนายผลสอบจริง/, 'Found unsupported predictive claim')

  // Forbidden: Anonymous trial access
  assert.doesNotMatch(combined, /ทดลองทำได้โดยไม่ต้องเข้าสู่ระบบ/, 'Found forbidden anonymous trial access claim')

  // Forbidden: Daily features
  assert.doesNotMatch(combined, /Daily 5/i, 'Found forbidden Daily 5 reference')
  assert.doesNotMatch(combined, /streak/i, 'Found forbidden streak reference')
  assert.doesNotMatch(combined, /\bexp\b/i, 'Found forbidden EXP reference')
})

test('FAQ page includes structured breadcrumb and FAQPage JSON-LD', () => {
  assert.match(
    faqPageSource,
    /buildBreadcrumbJsonLd\([\s\S]*name:\s*['"]หน้าแรก['"][\s\S]*name:\s*['"]คำถามที่พบบ่อย['"][\s\S]*path:\s*['"]\/faq['"]/
  )
  assert.match(
    faqPageSource,
    /buildFaqPageJsonLd\(FAQ_ITEMS\)/
  )
  assert.match(
    faqPageSource,
    /<StructuredData\s+data=\{breadcrumbJsonLd\}\s*\/>/
  )
  assert.match(
    faqPageSource,
    /<StructuredData\s+data=\{faqPageJsonLd\}\s*\/>/
  )

  // Verify FAQPage JSON-LD schema generation directly from FAQ_ITEMS
  const schema = buildFaqPageJsonLd(FAQ_ITEMS) as {
    '@type': string
    mainEntity: Array<{ '@type': string; name: string; acceptedAnswer: { text: string } }>
  }
  assert.strictEqual(schema['@type'], 'FAQPage')
  assert.strictEqual(schema.mainEntity.length, 14)
  assert.strictEqual(schema.mainEntity[0].name, 'Sobdai คืออะไร?')
  assert.match(schema.mainEntity[0].acceptedAnswer.text, /เว็บแอปสำหรับฝึกทำแนวข้อสอบราชการ/)

  // Verify that link metadata (labels, URLs) does not contaminate schema answer text
  for (const entity of schema.mainEntity) {
    assert.doesNotMatch(entity.acceptedAnswer.text, /อ่านคู่มือวิธีใช้งาน Sobdai/)
    assert.doesNotMatch(entity.acceptedAnswer.text, /ดูรายละเอียดและตัวอย่างโหมดการสอบ/)
    assert.doesNotMatch(entity.acceptedAnswer.text, /ดูขั้นตอนการทบทวนผลสอบ/)
    assert.doesNotMatch(entity.acceptedAnswer.text, /ตรวจสอบข้อมูลในหน้าคลังแพ็กเกจ/)
    assert.doesNotMatch(entity.acceptedAnswer.text, /อ่านเกี่ยวกับ Sobdai และที่มาโครงการ/)
    assert.doesNotMatch(entity.acceptedAnswer.text, /href=/)
  }
})

test('Footer contains links to /help and /faq near about and contact', () => {
  assert.match(
    footerSource,
    /<Link\s+href="\/help"[^>]*>\s*วิธีใช้งาน\s*<\/Link>/,
    'Footer missing /help link'
  )
  assert.match(
    footerSource,
    /<Link\s+href="\/faq"[^>]*>\s*คำถามที่พบบ่อย\s*<\/Link>/,
    'Footer missing /faq link'
  )

  // Verify relative order in HELP / PRODUCT group
  const helpIndex = footerSource.indexOf('href="/help"')
  const faqIndex = footerSource.indexOf('href="/faq"')
  const contactIndex = footerSource.indexOf('href="/contact"')
  const aboutIndex = footerSource.indexOf('href="/about"')

  assert.ok(helpIndex !== -1 && faqIndex !== -1 && contactIndex !== -1 && aboutIndex !== -1)
  assert.ok(helpIndex < faqIndex, '/help should appear before /faq')
  assert.ok(faqIndex < contactIndex, '/faq should appear before /contact')
  assert.ok(contactIndex < aboutIndex, '/contact should appear before /about')
})

test('PUBLIC_STATIC_ROUTES includes /help and /faq with monthly changeFrequency and 0.6 priority', () => {
  const helpRoute = PUBLIC_STATIC_ROUTES.find((r: { path: string }) => r.path === '/help')
  const faqRoute = PUBLIC_STATIC_ROUTES.find((r: { path: string }) => r.path === '/faq')

  assert.ok(helpRoute, 'Missing /help in PUBLIC_STATIC_ROUTES')
  assert.strictEqual(helpRoute.changeFrequency, 'monthly')
  assert.strictEqual(helpRoute.priority, 0.6)

  assert.ok(faqRoute, 'Missing /faq in PUBLIC_STATIC_ROUTES')
  assert.strictEqual(faqRoute.changeFrequency, 'monthly')
  assert.strictEqual(faqRoute.priority, 0.6)
})
