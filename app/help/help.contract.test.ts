import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { HELP_SECTIONS } from '../../content/help/help-data.ts'

const root = process.cwd()
const helpPageSource = readFileSync(join(root, 'app/help/page.tsx'), 'utf8')
const helpDataSource = readFileSync(join(root, 'content/help/help-data.ts'), 'utf8')

test('Help metadata conforms to SEO specifications', () => {
  assert.match(
    helpPageSource,
    /title:\s*'วิธีใช้งาน Sobdai \| คู่มือฝึกทำแนวข้อสอบราชการออนไลน์'/,
    'Title does not match specification'
  )
  assert.match(
    helpPageSource,
    /description:\s*'เรียนรู้วิธีใช้ Sobdai ตั้งแต่เลือกชุดข้อสอบ ฝึกทำและจำลองสอบ ดูผล ทบทวนข้อที่ตอบผิด บันทึกข้อที่สนใจ และดูหัวข้อที่ควรฝึกเพิ่มเติม'/,
    'Description does not match specification'
  )
  assert.match(
    helpPageSource,
    /path:\s*'\/help'/,
    'Canonical path does not match /help'
  )
})

test('Help page defines all six required anchor sections', () => {
  const expectedSections = [
    'getting-started',
    'exam-modes',
    'during-exam',
    'results',
    'review',
    'my-exams',
  ]

  assert.strictEqual(HELP_SECTIONS.length, 6)
  for (const id of expectedSections) {
    assert.ok(
      HELP_SECTIONS.some((s: { id: string }) => s.id === id),
      `Missing section in HELP_SECTIONS data: ${id}`
    )
    assert.match(
      helpPageSource,
      new RegExp(`id="${id}"`),
      `Missing HTML section id in page.tsx: ${id}`
    )
  }
  assert.match(
    helpPageSource,
    /href=\{`#\$\{sec\.id\}`\}/,
    'Missing dynamic jump link mapping in page.tsx'
  )
})

test('Help content strictly avoids forbidden patterns, claims, and routes', () => {
  const combined = `${helpPageSource}\n${helpDataSource}`

  // Forbidden: /dashboard route references (must be /exams)
  assert.doesNotMatch(combined, /['"`]\/dashboard['"`]/, 'Found forbidden route /dashboard')
  assert.doesNotMatch(combined, /href=["']\/dashboard["']/, 'Found forbidden link to /dashboard')

  // Canonical learner route is /exams
  assert.match(combined, /\/exams/, 'Expected reference to /exams')
  assert.match(combined, /ข้อสอบของฉัน/, 'Expected Thai label "ข้อสอบของฉัน"')

  // Forbidden: Emojis
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  assert.doesNotMatch(combined, emojiRegex, 'Found forbidden emoji in Help content')

  // Forbidden: Universal unverified claims
  assert.doesNotMatch(combined, /ทุกข้อมีเฉลยละเอียดทุกข้อ/, 'Found unsupported universal claim')
  assert.doesNotMatch(combined, /ทุกข้อมีหลักกฎหมาย/, 'Found unsupported legal claim')
  assert.doesNotMatch(combined, /เหมือนสนามสอบจริง 100%/, 'Found unsupported realism claim')
  assert.doesNotMatch(combined, /การันตีผลสอบ/, 'Found unsupported guarantee claim')
  assert.doesNotMatch(combined, /ทำนายผลสอบจริง/, 'Found unsupported predictive claim')

  // Forbidden: Daily features
  assert.doesNotMatch(combined, /Daily 5/i, 'Found forbidden Daily 5 reference')
  assert.doesNotMatch(combined, /streak/i, 'Found forbidden streak reference')
  assert.doesNotMatch(combined, /\bexp\b/i, 'Found forbidden EXP reference')

  // Step 2C Micro-fixes: avoid "ทั้งหมด" for history and "ถาวร" for saved questions
  assert.doesNotMatch(combined, /ประวัติการทำข้อสอบ.*ทั้งหมด/, 'Found forbidden history claims implying all attempts')
  assert.match(combined, /ประวัติการทำข้อสอบที่ผ่านมา/, 'Expected safe history wording')
  assert.doesNotMatch(combined, /เก็บไว้ในบัญชีอย่างถาวร/, 'Found forbidden permanence wording')
  assert.doesNotMatch(combined, /บันทึกข้อสอบถาวร/, 'Found forbidden permanence wording in flag')
  assert.match(combined, /บันทึกไว้ในบัญชีเพื่อกลับมาทบทวนภายหลัง/, 'Expected safe saved question wording')
})

test('Help page includes structured breadcrumb JSON-LD for Search crawlers', () => {
  assert.match(
    helpPageSource,
    /buildBreadcrumbJsonLd\([\s\S]*name:\s*['"]หน้าแรก['"][\s\S]*name:\s*['"]วิธีใช้งาน['"][\s\S]*path:\s*['"]\/help['"]/
  )
  assert.match(
    helpPageSource,
    /<StructuredData\s+data=\{breadcrumbJsonLd\}\s*\/>/
  )
})

test('Help page provides valid outbound navigation CTAs', () => {
  // /packages CTA
  assert.match(helpPageSource, /href="\/packages"/)
  // /faq CTA
  assert.match(helpPageSource, /href="\/faq"/)
  // /exams CTA
  assert.match(helpPageSource, /href="\/exams"/)
})

test('Help page integrates the six required WebP screenshot assets with alt text', () => {
  const expectedImages = [
    'help-packages.webp',
    'help-package-detail.webp',
    'help-practice.webp',
    'help-simulation.webp',
    'help-result.webp',
    'help-my-exams.webp',
  ]

  for (const imgName of expectedImages) {
    // 1. File exists in public/images/help/
    const filePath = join(root, 'public/images/help', imgName)
    assert.ok(existsSync(filePath), `Missing screenshot asset: ${imgName}`)

    // 2. File size is valid (> 5KB and < 200KB)
    const stats = statSync(filePath)
    assert.ok(stats.size > 5000, `Asset ${imgName} is suspiciously small: ${stats.size} bytes`)
    assert.ok(stats.size < 200000, `Asset ${imgName} is too large for Help V1: ${stats.size} bytes`)

    // 3. Referenced in page.tsx
    assert.match(
      helpPageSource,
      new RegExp(`/images/help/${imgName}`),
      `Missing reference to ${imgName} in app/help/page.tsx`
    )
  }
})
