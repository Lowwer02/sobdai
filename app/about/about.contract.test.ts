/**
 * app/about/about.contract.test.ts
 *
 * Focused contract test for the /about redesign (V2) — Step 2A.
 *
 * Tests fall into eight groups:
 *   1. SEO metadata integrity — title, description, canonical
 *   2. H1 copy correctness
 *   3. Founder/person identity — approved facts, forbidden labels, real portrait
 *   4. Content integrity — keywords, independence statement, CTAs
 *   5. Structured data — AboutPage JSON-LD present, Person schema absent
 *   6. Technical contracts — no 'use client', no forbidden copy strings
 *   7. CSS scope contracts — globals.css clean, about.module.css present
 *   8. Sitemap — PUBLIC_STATIC_ROUTES still contains /about (read-only)
 *
 * All tests are read-only static analysis.
 * No rendering, no DOM, no browser required.
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
const pageSource = read('app/about/page.tsx')
const personSource = read('components/about/AboutPerson.tsx')
const principlesSource = read('components/about/AboutPrinciples.tsx')
const trustSource = read('components/about/AboutTrust.tsx')

// All source files combined for global content checks.
// NOTE: the test file itself is intentionally excluded from 'allSource'
// to prevent test assertions from falsely matching their own string literals.
const allSource = [pageSource, personSource, principlesSource, trustSource].join('\n')

// ── 1. SEO Metadata ────────────────────────────────────────────────────────

test('SEO title contains primary keyword: แนวข้อสอบราชการ', () => {
  assert.ok(
    pageSource.includes('แนวข้อสอบราชการ'),
    'page.tsx must contain "แนวข้อสอบราชการ" in the title/metadata section'
  )
})

test('SEO title contains primary keyword: เตรียมสอบราชการ', () => {
  assert.ok(
    pageSource.includes('เตรียมสอบราชการ'),
    'page.tsx must contain "เตรียมสอบราชการ" in the title/metadata section'
  )
})

test('SEO title is the approved string', () => {
  const expectedTitle = 'เกี่ยวกับ Sobdai | แนวข้อสอบราชการและการเตรียมสอบราชการ'
  assert.ok(
    pageSource.includes(expectedTitle),
    `ABOUT_TITLE must equal: "${expectedTitle}"`
  )
})

test('SEO description is present and non-trivial', () => {
  const expectedFragment = 'รู้จัก Sobdai แนวคิดและคนเบื้องหลัง'
  assert.ok(
    pageSource.includes(expectedFragment),
    'ABOUT_DESCRIPTION must begin with the approved text'
  )
})

test('Canonical path is /about', () => {
  assert.ok(
    pageSource.includes("path: '/about'"),
    "createPageMetadata must be called with path: '/about'"
  )
})

// ── 2. H1 Copy ────────────────────────────────────────────────────────────

test('H1 contains approved Thai copy: เราอยากให้การเตรียมสอบราชการ', () => {
  assert.ok(
    pageSource.includes('เราอยากให้การเตรียมสอบราชการ'),
    'H1 must contain "เราอยากให้การเตรียมสอบราชการ"'
  )
})

test('H1 contains approved Thai copy: เป็นเรื่องของความเข้าใจ ไม่ใช่แค่การจำ', () => {
  assert.ok(
    pageSource.includes('เป็นเรื่องของความเข้าใจ ไม่ใช่แค่การจำ'),
    'H1 must contain "เป็นเรื่องของความเข้าใจ ไม่ใช่แค่การจำ"'
  )
})

// ── 3. Founder / Person Identity & Real Portrait ──────────────────────────

test('Approved person name is present: กิตติพงษ์ จงคล้ายกลาง', () => {
  assert.ok(
    allSource.includes('กิตติพงษ์ จงคล้ายกลาง'),
    '"กิตติพงษ์ จงคล้ายกลาง" must appear in component source'
  )
})

test('Approved professional title is present: นักวิชาการศึกษา', () => {
  assert.ok(
    allSource.includes('นักวิชาการศึกษา'),
    '"นักวิชาการศึกษา" must appear in component source'
  )
})

test('Real portrait path is referenced in AboutPerson: /images/about/kittipong-portrait.webp', () => {
  assert.ok(
    personSource.includes('/images/about/kittipong-portrait.webp'),
    'AboutPerson.tsx must reference "/images/about/kittipong-portrait.webp"'
  )
})

test('Portrait alt text is exact: กิตติพงษ์ จงคล้ายกลาง นักวิชาการศึกษา', () => {
  assert.ok(
    personSource.includes('alt="กิตติพงษ์ จงคล้ายกลาง นักวิชาการศึกษา"'),
    'Portrait alt attribute must be "กิตติพงษ์ จงคล้ายกลาง นักวิชาการศึกษา"'
  )
})

test('Portrait production asset file exists on disk', () => {
  const assetPath = resolve(ROOT, 'public/images/about/kittipong-portrait.webp')
  assert.ok(
    existsSync(assetPath),
    'public/images/about/kittipong-portrait.webp must exist on disk'
  )
})

test('Next.js Image component is imported in AboutPerson.tsx', () => {
  assert.ok(
    personSource.includes("import Image from 'next/image'"),
    'AboutPerson.tsx must import Image from next/image'
  )
})

// Forbidden role labels
const FORBIDDEN_ROLE_LABELS = [
  'ผู้ก่อตั้ง',
  'ผู้พัฒนา',
  'ผู้จัดทำระบบ',
  'ผู้พัฒนาเนื้อหา',
  'ผู้จัดทำระบบและพัฒนาเนื้อหา',
  'Founder',
] as const

for (const label of FORBIDDEN_ROLE_LABELS) {
  test(`Forbidden role label is absent: "${label}"`, () => {
    assert.ok(
      !allSource.includes(label),
      `"${label}" must NOT appear in any About component source`
    )
  })
}

// Forbidden invented biography fragments
const FORBIDDEN_BIOGRAPHY = [
  'ได้เห็นผู้คนจำนวนมาก',
  'จากการทำงาน...ได้เห็น',
  'ภาพถ่ายกำลังอยู่ระหว่างการจัดเตรียม',
] as const

for (const fragment of FORBIDDEN_BIOGRAPHY) {
  test(`Forbidden biography fragment is absent: "${fragment}"`, () => {
    assert.ok(
      !allSource.includes(fragment),
      `"${fragment}" must NOT appear in any About component`
    )
  })
}

// ── 4. Content Integrity ──────────────────────────────────────────────────

test('Independence statement is present', () => {
  const statement = 'แพลตฟอร์มอิสระ'
  assert.ok(
    allSource.includes(statement),
    `Independence statement ("${statement}") must be present`
  )
})

test('Non-government disclaimer is present', () => {
  const disclaimer = 'ไม่ได้เป็นเว็บไซต์หรือหน่วยงานของรัฐ'
  assert.ok(
    allSource.includes(disclaimer),
    `"${disclaimer}" must appear in About components`
  )
})

test('/packages CTA is present', () => {
  assert.ok(
    trustSource.includes('href="/packages"') || allSource.includes("href='/packages'"),
    '/packages link must be present in the CTA'
  )
})

test('/help CTA is present', () => {
  assert.ok(
    trustSource.includes('href="/help"') || allSource.includes("href='/help'"),
    '/help link must be present in the CTA'
  )
})

test('/faq micro-link is present', () => {
  assert.ok(
    trustSource.includes('href="/faq"') || allSource.includes("href='/faq'"),
    '/faq link must be present'
  )
})

test('/privacy link is present in trust section', () => {
  assert.ok(
    trustSource.includes('href="/privacy"'),
    '/privacy link must appear in AboutTrust'
  )
})

test('/cookies link is present in trust section', () => {
  assert.ok(
    trustSource.includes('href="/cookies"'),
    '/cookies link must appear in AboutTrust'
  )
})

test('/terms link is present in trust section', () => {
  assert.ok(
    trustSource.includes('href="/terms"'),
    '/terms link must appear in AboutTrust'
  )
})

// Verify keyword appears in hero supporting copy
test('Hero supporting copy contains แนวข้อสอบราชการ', () => {
  assert.ok(
    pageSource.includes('ฝึกแนวข้อสอบราชการอย่างมีทิศทาง'),
    'Hero supporting copy must naturally contain แนวข้อสอบราชการ'
  )
})

// ── 5. Structured Data ────────────────────────────────────────────────────

test('AboutPage JSON-LD type is declared', () => {
  assert.ok(
    pageSource.includes('"AboutPage"') || pageSource.includes("'AboutPage'"),
    'AboutPage @type must be declared in page.tsx'
  )
})

test('AboutPage JSON-LD references #website', () => {
  assert.ok(
    pageSource.includes('#website'),
    'AboutPage JSON-LD must reference the site-level WebSite @id'
  )
})

test('AboutPage JSON-LD references #organization', () => {
  assert.ok(
    pageSource.includes('#organization'),
    'AboutPage JSON-LD must reference the canonical Organization @id'
  )
})

test('StructuredData component is used in page.tsx', () => {
  assert.ok(
    pageSource.includes('StructuredData'),
    'page.tsx must import and use the StructuredData component'
  )
})

test('Person schema is absent (deferred to V2)', () => {
  const personSchemaPattern = /"@type"\s*:\s*"Person"/
  assert.ok(
    !personSchemaPattern.test(allSource),
    'Person schema must NOT be present in V1/V2 Step 2A'
  )
})

test('Organization schema is not redefined in About (uses @id reference only)', () => {
  const redefinitionPattern = /'@type':\s*'Organization'|"@type":\s*"Organization"/
  assert.ok(
    !redefinitionPattern.test(allSource),
    'Organization must not be redefined in About — use @id reference from lib/seo.ts'
  )
})

// ── 6. Technical Contracts ────────────────────────────────────────────────

test("No 'use client' directive in any About source", () => {
  const sources = [
    { name: 'page.tsx', src: pageSource },
    { name: 'AboutPerson.tsx', src: personSource },
    { name: 'AboutPrinciples.tsx', src: principlesSource },
    { name: 'AboutTrust.tsx', src: trustSource },
  ]
  for (const { name, src } of sources) {
    const hasClientDirective = /^\s*['"]use client['"]/.test(src)
    assert.ok(!hasClientDirective, `'use client' must not appear in ${name}`)
  }
})

// Forbidden copy strings (product truth rules).
const FORBIDDEN_COPY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: '/dashboard', pattern: /href=["']\/dashboard["']|=\s*["']\/dashboard/ },
  { label: 'การันตี', pattern: /การันตี/ },
  { label: 'รับรองผลสอบ', pattern: /รับรองผลสอบ/ },
  { label: 'AI ทำนาย', pattern: /AI ทำนาย/ },
  { label: 'เฉลยละเอียดทุกข้อ', pattern: /เฉลยละเอียดทุกข้อ/ },
  { label: 'ตลอดชีพ', pattern: /ตลอดชีพ/ },
  { label: 'lifetime access', pattern: /lifetime access/ },
  { label: 'pass rate', pattern: /pass rate/ },
  { label: 'pass guarantee', pattern: /pass guarantee/ },
  { label: 'จำนวนผู้ใช้', pattern: /จำนวนผู้ใช้/ },
  { label: 'testimonial', pattern: /testimonial/ },
  { label: 'ทุกข่าว (in copy)', pattern: /[>"'`]\s*ทุกข่าว/ },
  { label: 'ทุกข้อสอบ (in copy)', pattern: /[>"'`]\s*ทุกข้อสอบ/ },
  { label: 'ทุกเนื้อหา (in copy)', pattern: /[>"'`]\s*ทุกเนื้อหา/ },
  { label: 'ความถูกต้องก่อนความเร็ว', pattern: /ความถูกต้องก่อนความเร็ว/ },
  { label: 'formal editorial review', pattern: /formal editorial review/ },
]

for (const { label, pattern } of FORBIDDEN_COPY_PATTERNS) {
  test(`Forbidden product copy is absent: "${label}"`, () => {
    for (const [name, src] of [
      ['page.tsx', pageSource],
      ['AboutPerson.tsx', personSource],
      ['AboutPrinciples.tsx', principlesSource],
      ['AboutTrust.tsx', trustSource],
    ] as const) {
      assert.ok(
        !pattern.test(src),
        `"${label}" must NOT appear in ${name}`
      )
    }
  })
}

// ── 7. CSS Scope Contracts ────────────────────────────────────────────────

test('app/globals.css has NO About-specific styles (scope isolation)', () => {
  const globalsSource = read('app/globals.css')
  assert.ok(
    !globalsSource.includes('.about-'),
    'app/globals.css must NOT contain .about- selectors'
  )
  assert.ok(
    !globalsSource.includes('kittipong'),
    'app/globals.css must NOT reference kittipong portrait'
  )
})

test('app/about/about.module.css exists and contains About styles', () => {
  const moduleCssPath = resolve(ROOT, 'app/about/about.module.css')
  assert.ok(
    existsSync(moduleCssPath),
    'app/about/about.module.css must exist on disk'
  )
  const moduleSource = read('app/about/about.module.css')
  assert.ok(
    moduleSource.includes('.root') && moduleSource.includes('.personCard'),
    'about.module.css must contain About styling definitions'
  )
})

// ── 8. Sitemap / Route Integrity ──────────────────────────────────────────

test('PUBLIC_STATIC_ROUTES still contains /about (lib/seo.ts unchanged)', () => {
  const seoSource = read('lib/seo.ts')
  assert.ok(
    seoSource.includes("path: '/about'"),
    "lib/seo.ts PUBLIC_STATIC_ROUTES must still contain { path: '/about' }"
  )
})

test('AboutPage does not import LegalLayout (decoupled from legal template)', () => {
  assert.ok(
    !pageSource.includes('LegalLayout'),
    'page.tsx must NOT import LegalLayout — About V2 uses its own layout'
  )
})

test('AboutPage does not read about.md (decoupled from markdown file)', () => {
  assert.ok(
    !pageSource.includes('about.md'),
    'page.tsx must NOT read content/legal/about.md'
  )
})

test('AboutFounder.tsx does NOT exist (naming rule: use AboutPerson)', () => {
  let notFound = false
  try {
    read('components/about/AboutFounder.tsx')
  } catch {
    notFound = true
  }
  assert.ok(notFound, 'AboutFounder.tsx must NOT exist — the correct name is AboutPerson.tsx')
})
