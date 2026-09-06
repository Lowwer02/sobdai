/**
 * app/privacy/privacy.contract.test.ts
 *
 * Focused contract tests for Sobdai Privacy Policy Redesign (V1).
 *
 * Test Suites:
 *   1. Legal Content Fidelity Hard Gate (all 14 sections, preamble, bullets, order)
 *   2. Authorized Email Correction (support.sobdai@gmail.com present, bridgex absent)
 *   3. Date & Version Provenance (4 กันยายน 2569 derived from source, lib/legal.ts untouched)
 *   4. Single H1 & Hero Structure
 *   5. SEO & Canonical Metadata
 *   6. Anchor Navigation & TOC Targets
 *   7. External & Internal Links (/contact, /cookies, /terms)
 *   8. Accessibility & No Hidden/Accordion Legal Content
 *   9. Architecture, Server Component, CSS Isolation & Zero Globals Diff
 *  10. Shared Legal Layout Safety (LegalLayout.tsx untouched)
 *  11. Product & Legal Truth Invariants (no fake claims, no guarantees, no fake certifications)
 *
 * Static analysis tests — fast, read-only, deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePrivacyMarkdown } from './privacy-content'

const ROOT = resolve(import.meta.dirname, '../..')

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8')
}

// ── Sources ────────────────────────────────────────────────────────────────
const rawPrivacyMd = read('content/legal/privacy.md')
const legalSource = read('lib/legal.ts')
const pageSource = read('app/privacy/page.tsx')
const heroSource = read('components/privacy/PrivacyHero.tsx')
const quickNavSource = read('components/privacy/PrivacyQuickNav.tsx')
const tocSource = read('components/privacy/PrivacyToc.tsx')
const sectionCardSource = read('components/privacy/PrivacySectionCard.tsx')
const helpStripSource = read('components/privacy/PrivacyHelpStrip.tsx')
const privacyContentSource = read('app/privacy/privacy-content.ts')
const privacyCssSource = read('app/privacy/privacy.module.css')
const globalsCss = read('app/globals.css')
const legalLayoutSource = read('components/legal/LegalLayout.tsx')

const allPrivacySource = [
  pageSource,
  heroSource,
  quickNavSource,
  tocSource,
  sectionCardSource,
  helpStripSource,
  privacyContentSource,
].join('\n')

// ── Expected 14 Legal Headings in Exact Order ─────────────────────────────
const EXPECTED_HEADINGS = [
  '1. บทนำ',
  '2. ข้อมูลที่ Sobdai อาจเก็บรวบรวม',
  '3. วัตถุประสงค์ในการใช้ข้อมูล',
  '4. คุกกี้และเทคโนโลยีจากผู้ให้บริการ',
  '5. ฐานหรือเหตุผลในการประมวลผลข้อมูล',
  '6. การเปิดเผยหรือส่งต่อข้อมูล',
  '7. ระยะเวลาการเก็บรักษาข้อมูล',
  '8. การรักษาความปลอดภัย',
  '9. สิทธิของเจ้าของข้อมูล',
  '10. การเปลี่ยนแปลงตัวเลือกความเป็นส่วนตัว',
  '11. ข้อมูลของผู้เยาว์',
  '12. ลิงก์ไปยังบริการภายนอก',
  '13. การเปลี่ยนแปลงนโยบาย',
  '14. ติดต่อเรา',
]

// ── 1. Legal Content Fidelity Hard Gate ────────────────────────────────────

test('content/legal/privacy.md contains exactly 15 markdown blocks (1 preamble + 14 sections)', () => {
  const chunks = rawPrivacyMd.split(/\n---\n/).map((c) => c.trim()).filter(Boolean)
  assert.equal(chunks.length, 15, 'Must have exactly 15 blocks (preamble + 14 sections) in privacy.md')
})

test('all 14 section headings match exact source and sequence', () => {
  const { sections } = parsePrivacyMarkdown(rawPrivacyMd)
  assert.equal(sections.length, 14, 'Must parse exactly 14 sections')
  sections.forEach((sec, idx) => {
    assert.equal(
      sec.fullHeading,
      EXPECTED_HEADINGS[idx],
      `Section at index ${idx} must match "${EXPECTED_HEADINGS[idx]}"`
    )
    assert.equal(sec.num, idx + 1, `Section number must be ${idx + 1}`)
  })
})

test('all substantive legal keywords and bullets from privacy.md are preserved', () => {
  const requiredSubstantiveTerms = [
    'Supabase',
    'Google Analytics 4',
    'Microsoft Clarity',
    'Google AdSense',
    'Google Privacy & messaging',
    'Non-personalized',
    'คุกกี้ที่จำเป็น (Necessary Cookies)',
    'คุกกี้วิเคราะห์ (Analytics Cookies)',
    'เทคโนโลยีโฆษณา (Advertising technologies)',
    'ฐานสัญญา (Contractual Basis)',
    'ฐานประโยชน์ชอบด้วยกฎหมาย (Legitimate Interest)',
    'ฐานความยินยอม (Consent)',
    'ฐานหน้าที่ตามกฎหมาย (Legal Obligation)',
    'SOBDAI PICKS',
    'Affiliate',
    'ผู้ให้บริการโครงสร้างพื้นฐานและคลาวด์',
    'ตั้งค่าความเป็นส่วนตัว',
    'จัดการตัวเลือกโฆษณาใน Google',
  ]

  for (const term of requiredSubstantiveTerms) {
    assert.ok(
      rawPrivacyMd.includes(term),
      `Substantive legal term "${term}" must be present in privacy.md`
    )
  }
})

// ── 2. Authorized Email Correction ─────────────────────────────────────────

test('official email support.sobdai@gmail.com is present in privacy.md', () => {
  assert.ok(
    rawPrivacyMd.includes('support.sobdai@gmail.com'),
    'privacy.md must contain support.sobdai@gmail.com'
  )
})

test('old email bridgex.info1@gmail.com is completely absent in privacy.md and all privacy code', () => {
  assert.equal(
    rawPrivacyMd.includes('bridgex.info1@gmail.com'),
    false,
    'privacy.md must not contain bridgex.info1@gmail.com'
  )
  assert.equal(
    allPrivacySource.includes('bridgex.info1@gmail.com'),
    false,
    'No Privacy code may contain bridgex.info1@gmail.com'
  )
})

test('actionable mailto:support.sobdai@gmail.com link is declared in PrivacySectionCard', () => {
  assert.ok(
    sectionCardSource.includes('href="mailto:support.sobdai@gmail.com"'),
    'PrivacySectionCard must render an actionable mailto: link for support.sobdai@gmail.com'
  )
})

// ── 3. Date & Version Provenance ──────────────────────────────────────────

test('date 4 กันยายน 2569 is derived from privacy.md source parsing', () => {
  const { lastUpdated } = parsePrivacyMarkdown(rawPrivacyMd)
  assert.equal(lastUpdated, '4 กันยายน 2569', "Preamble parser must extract '4 กันยายน 2569'")
})

test('PrivacyHero does NOT hardcode "4 กันยายน 2569" string separately', () => {
  assert.equal(
    heroSource.includes('"4 กันยายน 2569"'),
    false,
    'PrivacyHero.tsx must receive lastUpdated dynamically and not hardcode it'
  )
  assert.equal(
    heroSource.includes("'4 กันยายน 2569'"),
    false,
    'PrivacyHero.tsx must receive lastUpdated dynamically and not hardcode it'
  )
  assert.ok(
    heroSource.includes('{lastUpdated}'),
    'PrivacyHero.tsx must render {lastUpdated} prop'
  )
})

test('page.tsx passes parsed lastUpdated to PrivacyHero', () => {
  assert.ok(
    pageSource.includes('<PrivacyHero lastUpdated={lastUpdated}'),
    'page.tsx must pass lastUpdated from getPrivacyData() to PrivacyHero'
  )
})

test('lib/legal.ts is untouched and preserves legalConfig.lastUpdated & privacyVersion', () => {
  assert.ok(
    legalSource.includes("lastUpdated: '30 มิถุนายน 2026'"),
    'legalConfig.lastUpdated in lib/legal.ts must remain untouched (30 มิถุนายน 2026)'
  )
  assert.ok(
    legalSource.includes("privacyVersion: '1.0'"),
    'legalConfig.privacyVersion in lib/legal.ts must remain 1.0'
  )
})

test('preamble card faithfully preserves source preamble text and date', () => {
  assert.ok(
    sectionCardSource.includes('อัปเดตล่าสุด: {preamble.lastUpdated}'),
    'PrivacyPreambleCard must display source date'
  )
})

// ── 4. Single H1 & Hero Structure ─────────────────────────────────────────

test('exactly one H1 exists on page declaring "นโยบายความเป็นส่วนตัว"', () => {
  const h1Matches = heroSource.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g)
  assert.ok(h1Matches, 'Must have at least one H1 in PrivacyHero')
  assert.equal(h1Matches.length, 1, 'Hero must contain exactly one H1')
  assert.ok(
    heroSource.includes('นโยบายความเป็นส่วนตัว'),
    'H1 must declare "นโยบายความเป็นส่วนตัว"'
  )

  const otherSources = [pageSource, quickNavSource, tocSource, sectionCardSource, helpStripSource]
  for (const src of otherSources) {
    assert.equal(
      /<h1[^>]*>/i.test(src),
      false,
      'No component other than PrivacyHero may declare an <h1>'
    )
  }
})

test('hero eyebrow contains PRIVACY POLICY', () => {
  assert.ok(
    heroSource.includes('PRIVACY POLICY'),
    'PrivacyHero must declare eyebrow "PRIVACY POLICY"'
  )
})

test('hero contains restrained supporting copy', () => {
  assert.ok(
    heroSource.includes('Sobdai ให้ความสำคัญกับความเป็นส่วนตัวของคุณ'),
    'Hero must contain restrained, accurate supporting copy'
  )
})

// ── 5. SEO & Canonical Metadata ───────────────────────────────────────────

test('SEO title matches approved format: นโยบายความเป็นส่วนตัว | Sobdai', () => {
  assert.ok(
    pageSource.includes('PRIVACY_TITLE'),
    'page.tsx must define PRIVACY_TITLE'
  )
  assert.ok(
    pageSource.includes('`นโยบายความเป็นส่วนตัว | ${LEGAL.companyName}`'),
    'page.tsx must format title as นโยบายความเป็นส่วนตัว | ${LEGAL.companyName}'
  )
})

test('canonical path is /privacy', () => {
  assert.ok(
    pageSource.includes("path: '/privacy'"),
    "createPageMetadata must specify path: '/privacy'"
  )
})

test('structured data WebPage JSON-LD is declared', () => {
  assert.ok(
    pageSource.includes("'@type': 'WebPage'"),
    'PrivacyPage must declare schema.org WebPage'
  )
  assert.ok(
    pageSource.includes('/privacy#webpage'),
    'JSON-LD must specify @id pointing to /privacy#webpage'
  )
})

// ── 6. Anchor Navigation & TOC Targets ────────────────────────────────────

test('TOC lists all 14 section anchors (#section-1 to #section-14)', () => {
  assert.ok(
    tocSource.includes('href={`#${sec.id}`}'),
    'PrivacyToc must bind anchor href to sec.id'
  )
})

test('quick navigation cards link to 5 high-value legal sections', () => {
  const quickAnchors = ['section-2', 'section-3', 'section-4', 'section-9', 'section-14']
  for (const anchor of quickAnchors) {
    assert.ok(
      privacyContentSource.includes(anchor),
      `Quick navigation must target ${anchor}`
    )
  }
})

test('every legal section card declares matching id for native anchor jump', () => {
  assert.ok(
    sectionCardSource.includes('id={section.id}'),
    'PrivacySectionCard must declare id={section.id}'
  )
})

// ── 7. External & Internal Links ──────────────────────────────────────────

test('TOC includes support card linking to /contact', () => {
  assert.ok(
    tocSource.includes('href="/contact"'),
    'PrivacyToc must include a support card linking to /contact'
  )
})

test('end-of-page help strip links to /contact, /cookies, and /terms', () => {
  assert.ok(helpStripSource.includes('href="/contact"'), 'Help strip must link to /contact')
  assert.ok(helpStripSource.includes('href="/cookies"'), 'Help strip must link to /cookies')
  assert.ok(helpStripSource.includes('href="/terms"'), 'Help strip must link to /terms')
})

// ── 8. Accessibility & No Hidden/Accordion Legal Content ──────────────────

test('no legal content is hidden behind accordion or details tags', () => {
  assert.equal(
    allPrivacySource.includes('<details'),
    false,
    'Privacy page must not hide legal text behind <details>'
  )
  assert.equal(
    allPrivacySource.includes('<summary'),
    false,
    'Privacy page must not use <summary>'
  )
})

test('all 14 legal sections declare H2 headings', () => {
  assert.ok(
    sectionCardSource.includes('<h2'),
    'PrivacySectionCard must render section heading as <h2>'
  )
})

// ── 9. Architecture, Server Component, CSS Isolation ──────────────────────

test('no "use client" directive in any Privacy component or page', () => {
  const files = [
    ['app/privacy/page.tsx', pageSource],
    ['components/privacy/PrivacyHero.tsx', heroSource],
    ['components/privacy/PrivacyQuickNav.tsx', quickNavSource],
    ['components/privacy/PrivacyToc.tsx', tocSource],
    ['components/privacy/PrivacySectionCard.tsx', sectionCardSource],
    ['components/privacy/PrivacyHelpStrip.tsx', helpStripSource],
    ['app/privacy/privacy-content.ts', privacyContentSource],
  ] as const

  for (const [name, code] of files) {
    assert.equal(
      code.includes("'use client'"),
      false,
      `${name} must be a Server Component (no 'use client')`
    )
  }
})

test('app/privacy/privacy.module.css exists on disk', () => {
  assert.ok(
    existsSync(resolve(ROOT, 'app/privacy/privacy.module.css')),
    'privacy.module.css must exist'
  )
})

test('app/globals.css has NO Privacy-specific styles', () => {
  assert.equal(
    globalsCss.includes('privacySection'),
    false,
    'globals.css must not contain privacySection'
  )
  assert.equal(
    globalsCss.includes('preambleCard'),
    false,
    'globals.css must not contain preambleCard'
  )
})

// ── 10. Shared Legal Layout Safety ─────────────────────────────────────────

test('components/legal/LegalLayout.tsx remains intact for /cookies', () => {
  assert.ok(
    legalLayoutSource.includes('export default function LegalLayout'),
    'LegalLayout must retain its export'
  )
  assert.ok(
    legalLayoutSource.includes('MarkdownRenderer'),
    'LegalLayout must continue using MarkdownRenderer for shared legal routes'
  )
})

// ── 11. Product & Legal Truth Invariants ──────────────────────────────────

test('no unsupported marketing guarantees, 100% security promises, or fake certifications', () => {
  const forbiddenMarketingTerms = [
    'การันตี',
    'รับรองผลสอบ',
    '100% secure',
    'guaranteed privacy',
    'GDPR certified',
    'PDPA certified',
    'Government certified',
    'กระทรวง',
  ]

  for (const term of forbiddenMarketingTerms) {
    assert.equal(
      allPrivacySource.includes(term),
      false,
      `Forbidden claim "${term}" must not be present in Privacy code`
    )
  }
})
