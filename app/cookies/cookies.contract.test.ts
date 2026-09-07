import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseCookiesMarkdown,
  QUICK_NAV_SECTIONS,
} from './cookies-content'

const ROOT = resolve(import.meta.dirname, '../..')

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8')
}

// ── Sources ────────────────────────────────────────────────────────────────
const rawCookiesMd = read('content/legal/cookies.md')
const legalSource = read('lib/legal.ts')
const pageSource = read('app/cookies/page.tsx')
const heroSource = read('components/cookies/CookiesHero.tsx')
const quickNavSource = read('components/cookies/CookiesQuickNav.tsx')
const tocSource = read('components/cookies/CookiesToc.tsx')
const sectionCardSource = read('components/cookies/CookiesSectionCard.tsx')
const helpStripSource = read('components/cookies/CookiesHelpStrip.tsx')
const cookiePreferencesBtnSource = read('components/cookies/CookiePreferencesButton.tsx')
const globalsCss = read('app/globals.css')
const legalLayoutSource = read('components/legal/LegalLayout.tsx')

// ── 1. LEGAL FIDELITY & AUTHORITATIVE SOURCE TESTS ──────────────────────

test('content/legal/cookies.md contains exactly 9 markdown blocks (1 preamble + 8 sections)', () => {
  const { preamble, sections } = parseCookiesMarkdown(rawCookiesMd)

  assert.ok(preamble.title.includes('นโยบายคุกกี้'), 'Preamble title must contain นโยบายคุกกี้')
  assert.equal(sections.length, 8, 'Must have exactly 8 numbered legal sections')
})

test('all 8 section headings match exact source and sequence', () => {
  const { sections } = parseCookiesMarkdown(rawCookiesMd)
  const expectedTitles = [
    'คุกกี้คืออะไร',
    'ประเภทคุกกี้ที่ Sobdai ใช้',
    'คุกกี้และเครื่องมือที่อาจพบ',
    'การยอมรับหรือปฏิเสธคุกกี้',
    'การเปลี่ยนแปลงหรือถอนความยินยอม',
    'การตั้งค่าผ่านเบราว์เซอร์',
    'การเปลี่ยนแปลงนโยบาย',
    'ติดต่อเรา',
  ]

  assert.equal(sections.length, 8)
  sections.forEach((sec, idx) => {
    assert.equal(sec.num, idx + 1, `Section index ${idx} should have num ${idx + 1}`)
    assert.equal(sec.title, expectedTitles[idx], `Section ${idx + 1} title mismatch`)
    assert.equal(sec.fullHeading, `${idx + 1}. ${expectedTitles[idx]}`)
    assert.equal(sec.id, `section-${idx + 1}`)
  })
})

test('all substantive legal categories and tables from cookies.md are preserved', () => {
  const { sections } = parseCookiesMarkdown(rawCookiesMd)

  // Section 2: Cookie categories
  const sec2 = sections.find((s) => s.num === 2)
  assert.ok(sec2, 'Section 2 must exist')
  assert.ok(sec2.body.includes('คุกกี้ที่จำเป็น (Strictly Necessary Cookies)'))
  assert.ok(sec2.body.includes('คุกกี้วิเคราะห์ (Analytics Cookies)'))
  assert.ok(sec2.body.includes('Google Analytics 4'))
  assert.ok(sec2.body.includes('Microsoft Clarity'))
  assert.ok(sec2.body.includes('เทคโนโลยีโฆษณา (Advertising technologies)'))
  assert.ok(sec2.body.includes('ลิงก์แนะนำพันธมิตร (Affiliate links)'))

  // Section 3: Table
  const sec3 = sections.find((s) => s.num === 3)
  assert.ok(sec3, 'Section 3 must exist')
  assert.ok(sec3.body.includes('ชื่อหรือผู้ให้บริการ'))
  assert.ok(sec3.body.includes('ประเภท'))
  assert.ok(sec3.body.includes('วัตถุประสงค์'))
  assert.ok(sec3.body.includes('ระยะเวลาโดยประมาณ'))
  assert.ok(sec3.body.includes('Supabase'))
  assert.ok(sec3.body.includes('_ga'))
  assert.ok(sec3.body.includes('_clck'))
  assert.ok(sec3.body.includes('Google AdSense'))
})

// ── 2. SINGLE AUTHORIZED LEGAL SOURCE EDIT (EMAIL) ──────────────────────

test('official email support.sobdai@gmail.com is present in cookies.md', () => {
  assert.ok(
    rawCookiesMd.includes('support.sobdai@gmail.com'),
    'cookies.md must contain the official support email support.sobdai@gmail.com'
  )
})

test('Section 8 of cookies.md contains support.sobdai@gmail.com exactly once', () => {
  const { sections } = parseCookiesMarkdown(rawCookiesMd)
  const sec8 = sections.find((s) => s.num === 8)
  assert.ok(sec8, 'Section 8 must exist')

  const occurrences = (sec8.body.match(/support\.sobdai@gmail\.com/g) || []).length
  assert.equal(
    occurrences,
    1,
    `Expected support.sobdai@gmail.com to appear exactly once in Section 8 text, found ${occurrences}`
  )
})

test('old email bridgex.info1@gmail.com is completely absent in cookies.md and all cookies code', () => {
  assert.ok(!rawCookiesMd.includes('bridgex.info1@gmail.com'), 'bridgex email must not exist in cookies.md')

  const sourcesToCheck = [
    { name: 'page.tsx', code: pageSource },
    { name: 'CookiesHero.tsx', code: heroSource },
    { name: 'CookiesQuickNav.tsx', code: quickNavSource },
    { name: 'CookiesToc.tsx', code: tocSource },
    { name: 'CookiesSectionCard.tsx', code: sectionCardSource },
    { name: 'CookiesHelpStrip.tsx', code: helpStripSource },
    { name: 'CookiePreferencesButton.tsx', code: cookiePreferencesBtnSource },
  ]

  for (const { name, code } of sourcesToCheck) {
    assert.ok(
      !code.includes('bridgex.info1@gmail.com'),
      `bridgex email must not exist in ${name}`
    )
  }
})

test('actionable mailto:support.sobdai@gmail.com link is handled in CookiesSectionCard', () => {
  assert.ok(sectionCardSource.includes('mailto:support.sobdai@gmail.com'))
  assert.ok(sectionCardSource.includes('emailInlineIcon'))
})

test('visible render architecture does NOT create a second duplicate email CTA card', () => {
  assert.ok(
    !sectionCardSource.includes('contactEmailCard'),
    'CookiesSectionCard must not contain duplicate contactEmailCard'
  )
})

// ── 3. DATE & VERSION PROVENANCE ────────────────────────────────────────

test('date 4 กันยายน 2569 is derived dynamically from cookies.md source parsing', () => {
  const { lastUpdated } = parseCookiesMarkdown(rawCookiesMd)
  assert.equal(lastUpdated, '4 กันยายน 2569')
})

test('CookiesHero does NOT hardcode "4 กันยายน 2569" string separately', () => {
  assert.ok(
    !heroSource.includes("'4 กันยายน 2569'"),
    'CookiesHero must not hardcode date literal'
  )
  assert.ok(
    !heroSource.includes('"4 กันยายน 2569"'),
    'CookiesHero must not hardcode date literal'
  )
  assert.ok(heroSource.includes('{lastUpdated}'), 'CookiesHero must render lastUpdated prop')
})

test('page.tsx passes parsed lastUpdated to CookiesHero', () => {
  assert.ok(pageSource.includes('<CookiesHero lastUpdated={lastUpdated} />'))
})

test('version is derived from legalConfig.cookiesVersion without mutating lib/legal.ts', () => {
  assert.ok(legalSource.includes("cookiesVersion: '1.0'"))
  assert.ok(heroSource.includes('legalConfig.cookiesVersion'))
})

// ── 4. PREAMBLE DUPLICATION GUARD ───────────────────────────────────────

test('PREAMBLE DUPLICATION GUARD: exactly ONE visible H1 exists declaring "นโยบายคุกกี้"', () => {
  // Hero has the sole H1
  assert.ok(heroSource.includes('<h1 id="cookies-h1" className={styles.heroH1}>'))
  assert.ok(heroSource.includes('นโยบายคุกกี้'))

  // Page and other components must not introduce other <h1> tags
  const pageH1Count = (pageSource.match(/<h1/g) || []).length
  const cardH1Count = (sectionCardSource.match(/<h1/g) || []).length
  assert.equal(pageH1Count, 0, 'page.tsx must not declare additional h1 tags')
  assert.equal(cardH1Count, 0, 'CookiesSectionCard must not declare h1 tags')
})

test('PREAMBLE DUPLICATION GUARD: preamble card renders introductory prose without duplicate title or date', () => {
  // Preamble card must NOT render preamble.lastUpdated or preamble.title
  assert.ok(!sectionCardSource.includes('{preamble.lastUpdated}'))
  assert.ok(!sectionCardSource.includes('{preamble.title}'))
  assert.ok(sectionCardSource.includes('{preamble.body}'))
})

// ── 5. INFORMATION ARCHITECTURE: QUICK NAV, TOC, SETTINGS CTA ───────────

test('Quick Navigation cards link to 5 high-value legal sections (#section-2, 3, 4, 5, 8)', () => {
  assert.equal(QUICK_NAV_SECTIONS.length, 5)
  const targets = QUICK_NAV_SECTIONS.map((item) => item.id)
  assert.deepEqual(targets, ['section-2', 'section-3', 'section-4', 'section-5', 'section-8'])
})

test('TOC lists all 8 section anchors (#section-1 to #section-8)', () => {
  const { sections } = parseCookiesMarkdown(rawCookiesMd)
  assert.equal(sections.length, 8)
  const ids = sections.map((s) => s.id)
  for (let i = 1; i <= 8; i++) {
    assert.ok(ids.includes(`section-${i}`))
  }
})

test('TOC includes "ต้องการจัดการคุกกี้?" card with "จัดการความเป็นส่วนตัว" CTA button', () => {
  assert.ok(tocSource.includes('ต้องการจัดการคุกกี้?'))
  assert.ok(tocSource.includes('CookiePreferencesButton'))
  assert.ok(tocSource.includes('จัดการความเป็นส่วนตัว'))
})

test('Section 5 includes embedded "เปิดการตั้งค่าความเป็นส่วนตัว" button', () => {
  assert.ok(sectionCardSource.includes('เปิดการตั้งค่าความเป็นส่วนตัว'))
  assert.ok(sectionCardSource.includes('CookiePreferencesButton'))
})

test('CookiePreferencesButton is the ONLY client component in cookies architecture', () => {
  // CookiePreferencesButton MUST have 'use client'
  assert.ok(cookiePreferencesBtnSource.startsWith("'use client'"), 'CookiePreferencesButton must be a client component')
  assert.ok(cookiePreferencesBtnSource.includes('useConsent'), 'Must use useConsent')
  assert.ok(cookiePreferencesBtnSource.includes('openPreferences'), 'Must call openPreferences')

  // All other cookies components MUST NOT have 'use client'
  const serverSources = [
    { name: 'page.tsx', code: pageSource },
    { name: 'CookiesHero.tsx', code: heroSource },
    { name: 'CookiesQuickNav.tsx', code: quickNavSource },
    { name: 'CookiesToc.tsx', code: tocSource },
    { name: 'CookiesSectionCard.tsx', code: sectionCardSource },
    { name: 'CookiesHelpStrip.tsx', code: helpStripSource },
  ]

  for (const { name, code } of serverSources) {
    assert.ok(
      !code.includes("'use client'") && !code.includes('"use client"'),
      `${name} must remain a Server Component`
    )
  }
})

// ── 6. SECTION 3 RESPONSIVE TABLE & SECTION CARDS ───────────────────────

test('Section 3 table is wrapped in accessible tableWrapper container', () => {
  assert.ok(sectionCardSource.includes('tableWrapper'))
  assert.ok(sectionCardSource.includes('legalTable'))
  assert.ok(sectionCardSource.includes('role="region"'))
  assert.ok(sectionCardSource.includes('tabIndex={0}'))
})

test('no legal content is hidden behind accordion or details tags', () => {
  const sources = [pageSource, sectionCardSource]
  for (const code of sources) {
    assert.ok(!code.includes('<details'), 'must not use <details>')
    assert.ok(!code.includes('<summary'), 'must not use <summary>')
  }
})

// ── 7. SEO & STRUCTURED DATA ────────────────────────────────────────────

test('SEO title matches approved format: นโยบายคุกกี้ | Sobdai', () => {
  assert.ok(pageSource.includes("COOKIES_TITLE = `นโยบายคุกกี้ | ${LEGAL.companyName}`"))
})

test('canonical path is /cookies and WebPage schema references #website and #organization', () => {
  assert.ok(pageSource.includes("path: '/cookies'"))
  assert.ok(pageSource.includes("@type': 'WebPage'") || pageSource.includes('"@type": "WebPage"'))
  assert.ok(pageSource.includes('#website'))
  assert.ok(pageSource.includes('#organization'))

  // Must not include prohibited schema
  assert.ok(!pageSource.includes('LegalService'))
  assert.ok(!pageSource.includes('GovernmentService'))
  assert.ok(!pageSource.includes('Product'))
})

// ── 8. END-OF-PAGE SUPPORT STRIP ────────────────────────────────────────

test('end-of-page help strip links to /privacy, /terms, and /contact', () => {
  assert.ok(helpStripSource.includes("href: '/privacy'"))
  assert.ok(helpStripSource.includes("href: '/terms'"))
  assert.ok(helpStripSource.includes("href: '/contact'"))
})

// ── 9. ZERO-DIFF PROTECTED FILES INTEGRITY ──────────────────────────────

test('app/cookies/cookies.module.css exists and app/globals.css has NO cookies-specific styles', () => {
  assert.ok(existsSync(resolve(ROOT, 'app/cookies/cookies.module.css')), 'cookies.module.css must exist')
  assert.ok(!globalsCss.includes('cookiesHero'), 'globals.css must not contain cookies styles')
  assert.ok(!globalsCss.includes('cookiesSection'), 'globals.css must not contain cookies styles')
})

test('components/legal/LegalLayout.tsx and lib/legal.ts remain untouched', () => {
  assert.ok(legalLayoutSource.includes('LegalLayout'), 'LegalLayout must be intact')
  assert.ok(legalSource.includes("cookiesVersion: '1.0'"))
})
