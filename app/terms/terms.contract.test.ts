/**
 * app/terms/terms.contract.test.ts
 *
 * Focused contract tests for Sobdai Terms of Service Redesign (V1).
 *
 * Test Suites:
 *   1. Legal Content Fidelity Hard Gate (all 12 sections, text, bullets, order)
 *   2. Single H1 & Hero Copy Structure
 *   3. Preserved Version & Last Updated Metadata
 *   4. SEO & Canonical Metadata
 *   5. Anchor Navigation & TOC Targets
 *   6. External & Internal Links (/contact, /privacy, /faq)
 *   7. Accessibility & No Hidden/Accordion Legal Content
 *   8. Architecture, Server Component, CSS Isolation & Zero Globals Diff
 *   9. Shared Legal Layout Safety (LegalLayout.tsx untouched)
 *  10. Product & Legal Truth Invariants (no fake claims, no guarantees, no seals)
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
const rawTermsMd = read('content/legal/terms.md')
const legalSource = read('lib/legal.ts')
const pageSource = read('app/terms/page.tsx')
const heroSource = read('components/terms/TermsHero.tsx')
const quickNavSource = read('components/terms/TermsQuickNav.tsx')
const tocSource = read('components/terms/TermsToc.tsx')
const sectionCardSource = read('components/terms/TermsSectionCard.tsx')
const helpStripSource = read('components/terms/TermsHelpStrip.tsx')
const termsContentSource = read('app/terms/terms-content.ts')
const termsCssSource = read('app/terms/terms.module.css')
const globalsCss = read('app/globals.css')
const legalLayoutSource = read('components/legal/LegalLayout.tsx')

const allTermsSource = [
  pageSource,
  heroSource,
  quickNavSource,
  tocSource,
  sectionCardSource,
  helpStripSource,
  termsContentSource,
].join('\n')

// ── Expected 12 Legal Headings in Exact Order ─────────────────────────────
const EXPECTED_HEADINGS = [
  '1. การยอมรับข้อกำหนด',
  '2. บริการของ Sobdai',
  '3. บัญชีผู้ใช้งาน',
  '4. สิทธิ์การใช้งาน',
  '5. การซื้อแพ็กเกจ',
  '6. นโยบายการคืนเงิน',
  '7. พฤติกรรมต้องห้าม',
  '8. การระงับบัญชี',
  '9. ทรัพย์สินทางปัญญา',
  '10. การยกเว้นความรับผิด',
  '11. การเปลี่ยนแปลงข้อกำหนด',
  '12. กฎหมายที่ใช้บังคับ',
]

// ── 1. Legal Content Fidelity Hard Gate ────────────────────────────────────

test('content/legal/terms.md contains exactly 12 sections separated by horizontal rules', () => {
  const chunks = rawTermsMd.split(/\n---\n/).map((c) => c.trim()).filter(Boolean)
  assert.equal(chunks.length, 12, 'Must have exactly 12 legal sections in terms.md')
})

test('all 12 section headings match exact source and sequence', () => {
  const chunks = rawTermsMd.split(/\n---\n/).map((c) => c.trim()).filter(Boolean)
  chunks.forEach((chunk, idx) => {
    const headingLine = chunk.split('\n')[0]
    const match = headingLine.match(/^##\s+(\d+)\.\s*(.+)$/)
    assert.ok(match, `Heading in section ${idx + 1} must match pattern ## N. Title`)
    const num = parseInt(match[1], 10)
    const title = match[2].trim()
    const fullHeading = `${num}. ${title}`

    assert.equal(
      fullHeading,
      EXPECTED_HEADINGS[idx],
      `Section at index ${idx} must match "${EXPECTED_HEADINGS[idx]}"`
    )
    assert.equal(num, idx + 1, `Section number must be ${idx + 1}`)
  })
})

test('all substantive legal keywords and bullets from terms.md are preserved', () => {
  const requiredSubstantiveTerms = [
    'Digital Content',
    'Personal',
    'Non-transferable',
    'Non-exclusive',
    'Reverse Engineering',
    'ตัดเงินซ้ำ',
    'ชำระเงินสำเร็จแต่ไม่ได้รับสิทธิ์',
    'ระบบผิดพลาด',
    'Scraping',
    'Bot',
    'As Is',
    'กฎหมายไทย',
    'เขตอำนาจศาลไทย',
    'โดยไม่จำเป็นต้องแจ้งให้ทราบล่วงหน้า',
    'ผู้ใช้ยอมรับความเสี่ยงจากการใช้งาน',
    'สิทธิ์การใช้งานผูกกับบัญชีผู้ใช้',
    'ไม่สามารถโอนสิทธิ์ให้ผู้อื่นได้',
  ]

  for (const term of requiredSubstantiveTerms) {
    assert.ok(
      rawTermsMd.includes(term),
      `Substantive legal term "${term}" must be present in terms.md`
    )
  }
})

// ── 2. Single H1 & Hero Copy Structure ────────────────────────────────────

test('exactly one H1 exists on page with approved copy: เงื่อนไขการให้บริการ', () => {
  const h1Matches = heroSource.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g)
  assert.ok(h1Matches, 'Must have at least one H1 in TermsHero')
  assert.equal(h1Matches.length, 1, 'Hero must contain exactly one H1')
  assert.ok(
    heroSource.includes('เงื่อนไขการให้บริการ'),
    'H1 must declare "เงื่อนไขการให้บริการ"'
  )

  // Verify no other component has an <h1> tag
  const otherSources = [pageSource, quickNavSource, tocSource, sectionCardSource, helpStripSource]
  for (const src of otherSources) {
    assert.equal(
      /<h1[^>]*>/i.test(src),
      false,
      'No component other than TermsHero may declare an <h1>'
    )
  }
})

test('hero eyebrow contains TERMS OF SERVICE', () => {
  assert.ok(
    heroSource.includes('TERMS OF SERVICE'),
    'TermsHero must declare eyebrow "TERMS OF SERVICE"'
  )
})

test('hero contains restrained supporting copy', () => {
  assert.ok(
    heroSource.includes('โปรดอ่านเงื่อนไขการให้บริการฉบับนี้อย่างละเอียดก่อนใช้งาน Sobdai'),
    'Hero must contain restrained, accurate supporting copy'
  )
})

// ── 3. Preserved Version & Last Updated Metadata ──────────────────────────

test('hero displays actual legalConfig.lastUpdated value without alteration', () => {
  assert.ok(
    heroSource.includes('{legalConfig.lastUpdated}'),
    'TermsHero must reference legalConfig.lastUpdated directly'
  )
  assert.ok(
    legalSource.includes("lastUpdated: '30 มิถุนายน 2026'"),
    'legalConfig must contain expected lastUpdated date'
  )
})

test('hero displays actual legalConfig.termsVersion value without alteration', () => {
  assert.ok(
    heroSource.includes('{legalConfig.termsVersion}'),
    'TermsHero must reference legalConfig.termsVersion directly'
  )
  assert.ok(
    legalSource.includes("termsVersion: '1.0'"),
    'legalConfig must contain expected termsVersion'
  )
})

// ── 4. SEO & Canonical Metadata ───────────────────────────────────────────

test('SEO title matches approved format: เงื่อนไขการให้บริการ | Sobdai', () => {
  assert.ok(
    pageSource.includes('TERMS_TITLE'),
    'page.tsx must define TERMS_TITLE'
  )
  assert.ok(
    pageSource.includes('`เงื่อนไขการให้บริการ | ${LEGAL.companyName}`'),
    'page.tsx must format title as เงื่อนไขการให้บริการ | ${LEGAL.companyName}'
  )
})

test('canonical path is /terms', () => {
  assert.ok(
    pageSource.includes("path: '/terms'"),
    "createPageMetadata must specify path: '/terms'"
  )
})

test('structured data WebPage JSON-LD is declared', () => {
  assert.ok(
    pageSource.includes("'@type': 'WebPage'"),
    'TermsPage must declare schema.org WebPage'
  )
  assert.ok(
    pageSource.includes('/terms#webpage'),
    'JSON-LD must specify @id pointing to /terms#webpage'
  )
})

// ── 5. Anchor Navigation & TOC Targets ────────────────────────────────────

test('TOC lists all 12 section anchors (#section-1 to #section-12)', () => {
  assert.ok(
    tocSource.includes('href={`#${sec.id}`}'),
    'TermsToc must bind anchor href to sec.id'
  )
})

test('quick navigation cards link to high-value legal sections', () => {
  const quickAnchors = ['section-1', 'section-4', 'section-5', 'section-6', 'section-8']
  for (const anchor of quickAnchors) {
    assert.ok(
      termsContentSource.includes(anchor),
      `Quick navigation must target ${anchor}`
    )
  }
})

test('every legal section card declares matching id for native anchor jump', () => {
  assert.ok(
    sectionCardSource.includes('id={section.id}'),
    'TermsSectionCard must declare id={section.id}'
  )
})

// ── 6. External & Internal Links (/contact, /privacy, /faq) ───────────────

test('TOC includes support card linking to /contact', () => {
  assert.ok(
    tocSource.includes('href="/contact"'),
    'TermsToc must include a support card linking to /contact'
  )
})

test('end-of-page help strip links to /contact, /privacy, and /faq', () => {
  assert.ok(helpStripSource.includes('href="/contact"'), 'Help strip must link to /contact')
  assert.ok(helpStripSource.includes('href="/privacy"'), 'Help strip must link to /privacy')
  assert.ok(helpStripSource.includes('href="/faq"'), 'Help strip must link to /faq')
})

// ── 7. Accessibility & No Hidden/Accordion Legal Content ──────────────────

test('no legal content is hidden behind accordion or details tags', () => {
  assert.equal(
    allTermsSource.includes('<details'),
    false,
    'Terms page must not hide legal text behind <details>'
  )
  assert.equal(
    allTermsSource.includes('<summary'),
    false,
    'Terms page must not use <summary>'
  )
})

test('all 12 legal sections declare H2 headings', () => {
  assert.ok(
    sectionCardSource.includes('<h2'),
    'TermsSectionCard must render section heading as <h2>'
  )
})

// ── 8. Architecture, Server Component, CSS Isolation ──────────────────────

test('no "use client" directive in any Terms component or page', () => {
  const files = [
    ['app/terms/page.tsx', pageSource],
    ['components/terms/TermsHero.tsx', heroSource],
    ['components/terms/TermsQuickNav.tsx', quickNavSource],
    ['components/terms/TermsToc.tsx', tocSource],
    ['components/terms/TermsSectionCard.tsx', sectionCardSource],
    ['components/terms/TermsHelpStrip.tsx', helpStripSource],
    ['app/terms/terms-content.ts', termsContentSource],
  ] as const

  for (const [name, code] of files) {
    assert.equal(
      code.includes("'use client'"),
      false,
      `${name} must be a Server Component (no 'use client')`
    )
  }
})

test('app/terms/terms.module.css exists on disk', () => {
  assert.ok(
    existsSync(resolve(ROOT, 'app/terms/terms.module.css')),
    'terms.module.css must exist'
  )
})

test('app/globals.css has NO Terms-specific styles', () => {
  assert.equal(
    globalsCss.includes('termsSection'),
    false,
    'globals.css must not contain termsSection'
  )
  assert.equal(
    globalsCss.includes('legalCard'),
    false,
    'globals.css must not contain legalCard'
  )
  assert.equal(
    globalsCss.includes('tocRail'),
    false,
    'globals.css must not contain tocRail'
  )
})

// ── 9. Shared Legal Layout Safety ─────────────────────────────────────────

test('components/legal/LegalLayout.tsx remains intact for /privacy and /cookies', () => {
  assert.ok(
    legalLayoutSource.includes('export default function LegalLayout'),
    'LegalLayout must retain its export'
  )
  assert.ok(
    legalLayoutSource.includes('MarkdownRenderer'),
    'LegalLayout must continue using MarkdownRenderer for shared legal routes'
  )
})

// ── 10. Product & Legal Truth Invariants ──────────────────────────────────

test('no unsupported marketing guarantees, pass rates, or fake certifications', () => {
  const forbiddenMarketingTerms = [
    'การันตี',
    'รับรองผลสอบ',
    'AI ทำนาย',
    'pass rate',
    'pass guarantee',
    'Government certified',
    'กระทรวง',
    'ราชการรับรอง',
  ]

  for (const term of forbiddenMarketingTerms) {
    assert.equal(
      allTermsSource.includes(term),
      false,
      `Forbidden marketing claim "${term}" must not be present in Terms code`
    )
  }
})
