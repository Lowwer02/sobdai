/**
 * app/contact/contact.contract.test.ts
 *
 * Focused contract test for the /contact redesign (V1).
 *
 * Tests cover:
 *   1. SEO metadata integrity — title, description, canonical
 *   2. Single H1 copy correctness
 *   3. Support email (support.sobdai@gmail.com, mailto)
 *   4. Office hours (จันทร์ – ศุกร์, 09:00 – 18:00 น., เวลาประเทศไทย)
 *   5. Response timeframe (bounded wording: โดยทั่วไปภายใน 1–3 วันทำการ, no SLA guarantee)
 *   6. Supported contact topics (5 verified items)
 *   7. Issue preparation checklist (5 items)
 *   8. Self-service shortcuts (/help, /faq, /about)
 *   9. Structured data (ContactPage JSON-LD, no Person/Course/Exam schema)
 *  10. Product truth invariants (no phone, no live chat, no 24/7, no ticket system, no fake stats)
 *  11. Technical contracts (Server Component, no 'use client', scoped CSS module, globals.css untouched)
 *
 * Static analysis tests — fast, read-only, deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8')
}

// ── Sources ────────────────────────────────────────────────────────────────
const pageSource = read('app/contact/page.tsx')
const heroVisualSource = read('components/contact/ContactHeroVisual.tsx')
const quickCardsSource = read('components/contact/ContactQuickCards.tsx')
const topicsSource = read('components/contact/ContactTopicsChecklist.tsx')
const selfServiceSource = read('components/contact/ContactSelfService.tsx')
const ctaSource = read('components/contact/ContactCta.tsx')

// Combined source for comprehensive string analysis
const allSource = [
  pageSource,
  heroVisualSource,
  quickCardsSource,
  topicsSource,
  selfServiceSource,
  ctaSource,
].join('\n')

// ── 1. SEO Metadata ────────────────────────────────────────────────────────

test('SEO title matches approved wording', () => {
  const expectedTitle = 'ติดต่อ Sobdai | ความช่วยเหลือและสอบถามการใช้งาน'
  assert.ok(
    pageSource.includes(expectedTitle),
    `page.tsx must define CONTACT_TITLE as "${expectedTitle}"`
  )
})

test('SEO description is present and describes support topics', () => {
  assert.ok(
    pageSource.includes('ติดต่อ Sobdai สำหรับคำถามเกี่ยวกับการใช้งาน'),
    'page.tsx must have a descriptive Thai meta description'
  )
})

test('Canonical path is /contact', () => {
  assert.ok(
    pageSource.includes("path: '/contact'"),
    'metadata must declare canonical path /contact'
  )
})

test('Contact is not primarily stuffed with transaction keyword: แนวข้อสอบราชการ', () => {
  assert.ok(
    !pageSource.includes("title: 'แนวข้อสอบราชการ"),
    'Contact title must not be optimized primarily for "แนวข้อสอบราชการ"'
  )
})

// ── 2. Heading Hierarchy ───────────────────────────────────────────────────

test('Exactly one H1 element is declared with approved text: ติดต่อเรา', () => {
  const h1Matches = pageSource.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) || []
  assert.equal(
    h1Matches.length,
    1,
    `page.tsx must contain exactly one <h1> element, found: ${h1Matches.length}`
  )
  assert.ok(
    h1Matches[0].includes('ติดต่อเรา'),
    'The <h1> must contain "ติดต่อเรา"'
  )
})

test('Eyebrow contains SOBDAI SUPPORT', () => {
  assert.ok(
    pageSource.includes('SOBDAI SUPPORT'),
    'Hero eyebrow must contain "SOBDAI SUPPORT"'
  )
})

test('Hero reassurance copy is present', () => {
  assert.ok(
    pageSource.includes('เราพร้อมดูแล และตอบกลับทุกข้อความของคุณ'),
    'Hero must include reassurance copy "เราพร้อมดูแล และตอบกลับทุกข้อความของคุณ"'
  )
})

// ── 3. Support Email ───────────────────────────────────────────────────────

test('Support email address is support.sobdai@gmail.com', () => {
  assert.ok(
    quickCardsSource.includes('support.sobdai@gmail.com'),
    'QuickCards must display support.sobdai@gmail.com'
  )
  assert.ok(
    quickCardsSource.includes('mailto:support.sobdai@gmail.com'),
    'QuickCards must have a mailto: link for support.sobdai@gmail.com'
  )
})

test('CTA section provides mailto: link to support.sobdai@gmail.com', () => {
  assert.ok(
    ctaSource.includes('mailto:support.sobdai@gmail.com'),
    'CTA must contain mailto:support.sobdai@gmail.com'
  )
  assert.ok(
    ctaSource.includes('ส่งอีเมลถึงเรา'),
    'CTA primary button text must be "ส่งอีเมลถึงเรา"'
  )
})

// ── 4. Office Hours ────────────────────────────────────────────────────────

test('Office hours are declared as จันทร์ – ศุกร์ 09:00 – 18:00 น.', () => {
  assert.ok(
    quickCardsSource.includes('จันทร์ – ศุกร์'),
    'QuickCards must specify "จันทร์ – ศุกร์"'
  )
  assert.ok(
    quickCardsSource.includes('09:00 – 18:00 น.'),
    'QuickCards must specify "09:00 – 18:00 น."'
  )
  assert.ok(
    quickCardsSource.includes('เวลาประเทศไทย'),
    'QuickCards must specify "เวลาประเทศไทย"'
  )
})

// ── 5. Response Timeframe ──────────────────────────────────────────────────

test('Response timeframe is bounded: โดยทั่วไปภายใน 1–3 วันทำการ', () => {
  assert.ok(
    quickCardsSource.includes('โดยทั่วไปภายใน 1–3 วันทำการ'),
    'QuickCards must state "โดยทั่วไปภายใน 1–3 วันทำการ"'
  )
  assert.ok(
    quickCardsSource.includes('ทีมงานจะพยายามตอบกลับโดยเร็วที่สุด'),
    'QuickCards must state "ทีมงานจะพยายามตอบกลับโดยเร็วที่สุด"'
  )
})

test('Response timeframe does not make an absolute guarantee', () => {
  assert.ok(
    !allSource.includes('การันตีตอบกลับ'),
    'Must not guarantee response time'
  )
  assert.ok(
    !allSource.includes('รับประกันการตอบกลับ'),
    'Must not guarantee response time'
  )
})

// ── 6. Contact Topics ──────────────────────────────────────────────────────

test('All 5 approved contact topics are present', () => {
  const expectedTopics = [
    'แจ้งปัญหาการใช้งาน',
    'สอบถามเกี่ยวกับแพ็กเกจ',
    'ปัญหาการชำระเงิน',
    'ข้อเสนอแนะ',
    'ความเป็นส่วนตัวของข้อมูล',
  ]

  for (const topic of expectedTopics) {
    assert.ok(
      topicsSource.includes(topic),
      `topics list must include "${topic}"`
    )
  }
})

// ── 7. Issue Checklist ─────────────────────────────────────────────────────

test('All 5 checklist items are present', () => {
  const expectedChecklist = [
    'อีเมลที่ใช้สมัครสมาชิก',
    'อุปกรณ์ที่ใช้งาน',
    'Browser ที่ใช้',
    'รายละเอียดปัญหา',
    'ภาพหน้าจอ (ถ้ามี)',
  ]

  for (const item of expectedChecklist) {
    assert.ok(
      topicsSource.includes(item),
      `checklist must include "${item}"`
    )
  }
})

// ── 8. Self-Service Help ───────────────────────────────────────────────────

test('Self-service section links to /help, /faq, and /about', () => {
  assert.ok(
    selfServiceSource.includes("href: '/help'"),
    'Self-service must link to /help'
  )
  assert.ok(
    selfServiceSource.includes("href: '/faq'"),
    'Self-service must link to /faq'
  )
  assert.ok(
    selfServiceSource.includes("href: '/about'"),
    'Self-service must link to /about'
  )
})

test('Self-service cards carry descriptive Thai labels', () => {
  assert.ok(
    selfServiceSource.includes('วิธีใช้งาน'),
    'Must include "วิธีใช้งาน"'
  )
  assert.ok(
    selfServiceSource.includes('คำถามที่พบบ่อย'),
    'Must include "คำถามที่พบบ่อย"'
  )
  assert.ok(
    selfServiceSource.includes('เกี่ยวกับเรา'),
    'Must include "เกี่ยวกับเรา"'
  )
})

// ── 9. Structured Data ─────────────────────────────────────────────────────

test('ContactPage JSON-LD is declared and references #website and #organization', () => {
  assert.ok(
    pageSource.includes("@type': 'ContactPage'"),
    'JSON-LD must specify @type: ContactPage'
  )
  assert.ok(
    pageSource.includes('#website'),
    'JSON-LD must reference #website'
  )
  assert.ok(
    pageSource.includes('#organization'),
    'JSON-LD must reference #organization'
  )
})

test('Person schema is absent from Contact page', () => {
  assert.ok(
    !pageSource.includes("@type': 'Person'") && !pageSource.includes('"@type": "Person"'),
    'Contact page must NOT declare Person schema'
  )
})

test('Course and Exam schemas are absent from Contact page', () => {
  assert.ok(!pageSource.includes("@type': 'Course'"), 'No Course schema')
  assert.ok(!pageSource.includes("@type': 'Exam'"), 'No Exam schema')
})

// ── 10. Product Truth Negative Invariants ──────────────────────────────────

test('No phone number is invented or displayed', () => {
  const phonePattern = /(0[2-9][0-9]{7,8}|\+66|08[0-9]-[0-9]{3})/
  assert.ok(!phonePattern.test(allSource), 'Must not contain any phone number')
})

test('No live chat or 24/7 claims are made', () => {
  assert.ok(!allSource.includes('แชทสด'), 'No live chat claim')
  assert.ok(!allSource.includes('live chat'), 'No live chat claim')
  assert.ok(!allSource.includes('24/7'), 'No 24/7 support claim')
  assert.ok(!allSource.includes('ตลอด 24 ชั่วโมง'), 'No 24/7 support claim')
})

test('No ticketing system claims are made', () => {
  assert.ok(!allSource.includes('เปิดทิกเก็ต'), 'No ticketing system claim')
  assert.ok(!allSource.includes('ticket system'), 'No ticket system claim')
})

test('No dashboard, fake pass rates, or fake statistics', () => {
  assert.ok(!allSource.includes('/dashboard'), 'No /dashboard link')
  assert.ok(!allSource.includes('การันตีสอบผ่าน'), 'No pass guarantee')
  assert.ok(!allSource.includes('รับรองผลสอบ'), 'No exam pass certification claim')
  assert.ok(!allSource.includes('AI ทำนาย'), 'No AI prediction claim')
})

// ── 11. Technical & CSS Isolation ──────────────────────────────────────────

test('No "use client" directive in any Contact component or page', () => {
  const sources = [
    { name: 'page.tsx', code: pageSource },
    { name: 'ContactHeroVisual.tsx', code: heroVisualSource },
    { name: 'ContactQuickCards.tsx', code: quickCardsSource },
    { name: 'ContactTopicsChecklist.tsx', code: topicsSource },
    { name: 'ContactSelfService.tsx', code: selfServiceSource },
    { name: 'ContactCta.tsx', code: ctaSource },
  ]

  const useClientRegex = /^\s*['"]use client['"]/m

  for (const s of sources) {
    assert.ok(
      !useClientRegex.test(s.code),
      `${s.name} must be a Server Component (no 'use client' directive)`
    )
  }
})

test('app/contact/contact.module.css exists on disk', () => {
  const cssPath = resolve(ROOT, 'app/contact/contact.module.css')
  assert.ok(existsSync(cssPath), 'app/contact/contact.module.css must exist')
})

test('app/globals.css has NO Contact-specific styles', () => {
  const globalsCss = read('app/globals.css')
  assert.ok(
    !globalsCss.includes('.contact') &&
    !globalsCss.includes('contactModule') &&
    !globalsCss.includes('quickCard') &&
    !globalsCss.includes('selfService'),
    'app/globals.css must remain free of Contact-specific styles'
  )
})
