import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Theme Final Polish Wave 3 — UI contract (final footer-linked public pages).
 *
 * Converts the Positions/Agencies hubs, the shared positions/agencies detail
 * CSS module and the About/Contact/Privacy/Cookies/Terms modules onto the
 * canonical semantic variables, adds the --foreground-soft token, fixes the
 * Positions mascot blend backing, and corrects one stale exact-color pin in
 * the positions contract. Presentation-only; no behavior/SEO changes.
 *
 * Deliberately NOT a blanket "no hex anywhere" test: the fixed-Dark editorial
 * island literals, decorative gold glows/shadows, portrait overlays, the
 * white agency-logo tile and HelpScreenshot-class artwork are intentional.
 *
 * Run with: npx tsx --test theme-wave3.ui-contract.test.ts
 */

const appDir = dirname(fileURLToPath(import.meta.url))
const root = join(appDir, '.')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const positionsHub = read('app/positions/page.tsx')
const agenciesHub = read('app/agencies/page.tsx')
const sharedModule = read('app/positions/[slug]/positions.module.css')
const aboutModule = read('app/about/about.module.css')
const contactModule = read('app/contact/contact.module.css')
const privacyModule = read('app/privacy/privacy.module.css')
const cookiesModule = read('app/cookies/cookies.module.css')
const termsModule = read('app/terms/terms.module.css')
const globalsCss = read('app/globals.css')
const positionsContract = read('app/positions/positions.contract.test.ts')
const settingsClient = read('app/settings/SettingsClient.tsx')
const avatarCropper = read('components/AvatarCropper.tsx')
const faqPage = read('app/faq/page.tsx')
const catalog = read('app/packages/PackageCatalogClient.tsx')
const editorialSection = read('components/positions/PositionEditorialSection.tsx')
const agenciesSection = read('components/agencies/AgencyEditorialSection.tsx')

// ---------------------------------------------------------------------------
// J/K. foreground-soft token + Tailwind mapping
// ---------------------------------------------------------------------------

test('foreground-soft token exists with exact Dark and Light values', () => {
  assert.match(globalsCss, /--foreground-soft: #c8bba4;/)
  assert.match(globalsCss, /--foreground-soft: #6f5d47;/)
})

test('foreground-soft has the Tailwind @theme semantic mapping and is used', () => {
  assert.match(globalsCss, /--color-foreground-soft: var\(--foreground-soft\);/)
  // The utility itself is generated at build time; the consumed class lives in
  // the hub pages and is verified in the compiled CSS during the build gate.
  assert.match(positionsHub, /text-foreground-soft/)
  assert.match(agenciesHub, /text-foreground-soft/)
})

// ---------------------------------------------------------------------------
// A/B. Positions and Agencies hubs
// ---------------------------------------------------------------------------

test('Positions hub shell, text and gold accents are semantic', () => {
  assert.match(positionsHub, /bg-background px-4 py-8 text-foreground/)
  assert.match(positionsHub, /text-foreground-soft/)
  assert.match(positionsHub, /hover:text-brand/)
  assert.match(positionsHub, /focus-visible:ring-brand/)
  assert.match(positionsHub, /focus-visible:ring-offset-background/)
  assert.match(positionsHub, /border-brand\/20/)
  assert.match(positionsHub, /border-border-subtle/)
  assert.match(positionsHub, /bg-card/)
  assert.doesNotMatch(positionsHub, /#0F0A06|#F7F3EC|#C8BBA4|#D4A63A|#7D6955|border-white\/10/)
})

test('Agencies hub shell, text and gold accents are semantic', () => {
  assert.match(agenciesHub, /bg-background px-4 py-8 text-foreground/)
  assert.match(agenciesHub, /text-foreground-soft/)
  assert.match(agenciesHub, /hover:text-brand/)
  assert.match(agenciesHub, /bg-card/)
  assert.match(agenciesHub, /border-brand\/25/)
  // Intentional fixed-white agency-logo tile preserved.
  assert.match(agenciesHub, /bg-white p-1/)
  assert.doesNotMatch(agenciesHub, /#0F0A06|#F7F3EC|#C8BBA4|#D4A63A|border-white\/10/)
})

test('Hub cards keep decorative dark shadows and the approved dot/hover accents', () => {
  assert.match(positionsHub, /shadow-\[0_20px_70px_rgba\(0,0,0,0\.24\)\]/)
  assert.match(agenciesHub, /shadow-\[0_20px_70px_rgba\(0,0,0,0\.24\)\]/)
  assert.match(positionsHub, /bg-brand\/70/)
  assert.match(agenciesHub, /bg-brand\/70/)
  assert.match(positionsHub, /hover:border-brand\/70/)
})

// ---------------------------------------------------------------------------
// D. Positions mascot dark backing
// ---------------------------------------------------------------------------

test('Positions mascot keeps mix-blend-screen on an isolated fixed-Dark halo', () => {
  assert.match(positionsHub, /mix-blend-screen/)
  assert.match(positionsHub, /isolation: 'isolate'/)
  assert.match(positionsHub, /radial-gradient\(circle at center, #20150a 0%, #140d06 55%, rgba\(15, 10, 6, 0\) 78%\)/)
  assert.match(positionsHub, /pointer-events-none/)
  assert.match(positionsHub, /aria-hidden="true"/)
  // No layout/pointer changes: image stays 200px, decorative only.
  assert.match(positionsHub, /w-\[200px\] opacity-75 mix-blend-screen/)
})

// ---------------------------------------------------------------------------
// C. Shared positions/agencies detail CSS module
// ---------------------------------------------------------------------------

test('Shared detail module uses semantic variables for page-level styles', () => {
  assert.match(sharedModule, /background:\s*\n?\s*var\(--background\);/)
  assert.match(sharedModule, /color: var\(--foreground\);/)
  assert.match(sharedModule, /color: var\(--foreground-soft\);/)
  assert.match(sharedModule, /background: var\(--card\);/)
  assert.match(sharedModule, /color: var\(--muted-foreground\);/)
  assert.match(sharedModule, /background: var\(--brand-solid\);|background: var\(--brand\);/)
  // No old page-level hardcoded Dark literals remain (skip header comment,
  // the fixed-Dark editorial island range, and the Fix2 island wrapper whose
  // own canvas literal is intentional and positively pinned by the Fix2 test).
  const islandStart = sharedModule.indexOf('.editorialMarkdown :global')
  const islandEnd = sharedModule.indexOf('.relatedSectionHeading')
  const wrapperStart = sharedModule.indexOf('.editorialBody {')
  const wrapperEnd = sharedModule.indexOf('.editorialMarkdown {')
  const sharedRules =
    sharedModule.slice(sharedModule.indexOf('.page {'), wrapperStart) +
    sharedModule.slice(wrapperEnd, islandStart) +
    sharedModule.slice(islandEnd)
  assert.doesNotMatch(sharedRules, /#0F0A06|#F7F3EC|#C8BBA4|#A1866B|#1A120B|#21170E|#14100a/i)
})

test('Shared detail module uses color-mix for gold-tinted borders and fills', () => {
  assert.match(sharedModule, /color-mix\(in srgb, var\(--brand\) 22%, transparent\)/)
  assert.match(sharedModule, /color-mix\(in srgb, var\(--brand\) 16%, transparent\)/)
  assert.match(sharedModule, /outline: 2px solid var\(--brand\);/)
  // Interactive card hover keeps a themed lighten/darken of the card.
  assert.match(sharedModule, /color-mix\(in srgb, var\(--card\) 94%, var\(--foreground\) 6%\)/)
  // Fix C: BOTH card-link hover fills use the themed recipe — the old fixed
  // near-black rgba(33, 23, 14, .72/.78) fills caused Dark flashing on Light.
  const agencyHover = sharedModule.slice(
    sharedModule.indexOf('.agencyCardLink:hover {'),
    sharedModule.indexOf('.agencyCardLink:focus-visible'),
  )
  assert.match(agencyHover, /background: color-mix\(in srgb, var\(--card\) 94%, var\(--foreground\) 6%\);/)
  assert.doesNotMatch(agencyHover, /rgba\(33, 23, 14/)
  const newsHover = sharedModule.slice(
    sharedModule.indexOf('.newsCard:hover {'),
    sharedModule.indexOf('.newsCard:hover {') + 160,
  )
  assert.match(newsHover, /background: color-mix\(in srgb, var\(--card\) 94%, var\(--foreground\) 6%\);/)
  assert.doesNotMatch(newsHover, /rgba\(33, 23, 14/)
})

test('Fixed-Dark editorial island literals remain byte-stable inside the shared module', () => {
  // The .editorialMarkdown :global(.summary-content…) rules style content
  // inside the intentional Dark island; they must NOT be themed.
  const island = sharedModule.slice(
    sharedModule.indexOf('.editorialMarkdown :global(.summary-content h2)') - 60,
    sharedModule.indexOf('.editorialFallback') + 120,
  )
  assert.match(island, /color: #F7F3EC;/)
  assert.match(island, /color: #D6CBB8;/)
  assert.match(island, /color: #D4A63A;/)
  assert.match(island, /color: #C8BBA4;/)
  assert.match(island, /rgba\(212, 166, 58, 0\.16\)/)
  assert.doesNotMatch(island, /var\(--/)
})

test('Fix2 — editorial island carries its own fixed-Dark canvas (Light readability)', () => {
  // Root cause of the Human-QA defect: the island's markdown rules keep
  // fixed-Dark literals but the wrappers had NO background — they relied on
  // the legacy fixed-Dark page. After the page became theme-aware, Light mode
  // rendered #F7F3EC text on ivory (~1.06:1). The canvas is scoped to
  // .editorialBody — the shared wrapper class carried by BOTH the Position
  // and Agency island wrappers.
  const wrapper = sharedModule.slice(
    sharedModule.indexOf('.editorialBody {'),
    sharedModule.indexOf('.editorialMarkdown {'),
  )
  assert.match(wrapper, /\.editorialBody \{[^}]*background: #0f0a06;[^}]*\}/)
  // Reject the defective state (no canvas) and any themed-canvas mistake.
  assert.match(wrapper, /min-width: 0;/)
  assert.doesNotMatch(wrapper, /background: var\(--/)
  // The other island wrapper class must NOT carry its own duplicate canvas.
  const mdWrapper = sharedModule.slice(
    sharedModule.indexOf('.editorialMarkdown {'),
    sharedModule.indexOf('.editorialMarkdownSegment {'),
  )
  assert.doesNotMatch(mdWrapper, /background:/)
  // The canvas must be scoped to the island wrapper, not the whole page.
  const pageBlock = sharedModule.slice(sharedModule.indexOf('.page {'), sharedModule.indexOf('.container {'))
  assert.match(pageBlock, /var\(--background\)/)
  assert.doesNotMatch(pageBlock, /#0f0a06/i)
})

test('Editorial island wiring is unchanged', () => {
  assert.match(editorialSection, /editorialMarkdown} summary-markdown-dark-scope/)
  assert.match(agenciesSection, /summary-markdown-dark-scope/)
})

// ---------------------------------------------------------------------------
// E. About module
// ---------------------------------------------------------------------------

test('About root/personCard contract selectors survive with semantic values', () => {
  assert.match(aboutModule, /\.root \{[\s\S]*?background-color: var\(--background\);/)
  assert.match(aboutModule, /\.personCard \{[\s\S]*?background: var\(--card\);/)
  assert.match(aboutModule, /\.personOverlay/)
  // Portrait overlay gradient intentionally preserved.
  assert.match(aboutModule, /rgba\(15, 10, 6, 0\.6\) 72%/)
})

test('About primary gold CTA uses brand-solid fill with brand-foreground text', () => {
  const cta = aboutModule.slice(aboutModule.indexOf('.ctaPrimary {'), aboutModule.indexOf('.ctaSecondary {'))
  assert.match(cta, /background: var\(--brand-solid\);/)
  assert.match(cta, /color: var\(--brand-foreground\);/)
  assert.doesNotMatch(cta, /var\(--background\)/)
  // Fix D: bright-gold hover fill is an intentional brand exception
  // (var(--brand-hover) resolves dark brown in Light → ~2.4:1 on the fill).
  assert.match(cta, /background: #e8c46e;/)
  assert.doesNotMatch(cta, /background: var\(--brand-hover\);/)
  // Bright-gold hover TEXT convention preserved via the brand-hover token.
  assert.match(aboutModule, /color: var\(--brand-hover\);/)
})

test('About metadata, copy and links preserved', () => {
  assert.match(aboutModule, /\.hairline/)
  assert.match(aboutModule, /\.personName/)
  assert.match(aboutModule, /\.trustLink/)
  assert.match(aboutModule, /color: var\(--muted-foreground\);/)
})

// ---------------------------------------------------------------------------
// F. Contact module
// ---------------------------------------------------------------------------

test('Contact surfaces and text are semantic; mailto/social behavior surfaces kept', () => {
  assert.match(contactModule, /\.root \{[\s\S]*?background-color: var\(--background\);/)
  assert.match(contactModule, /color: var\(--foreground-soft\);/)
  assert.match(contactModule, /\.quickLink/)
  assert.match(contactModule, /\.socialCard/)
  assert.match(contactModule, /\.selfServiceCard/)
  // Card fills use translucent themed card mixes.
  assert.match(contactModule, /color-mix\(in srgb, var\(--card\) 60%, transparent\)/)
})

test('Contact primary button uses brand-solid/brand-foreground with bright-gold hover', () => {
  const btn = contactModule.slice(contactModule.indexOf('.btnPrimary {'), contactModule.indexOf('.btnSecondary {'))
  assert.match(btn, /background-color: var\(--brand-solid\);/)
  assert.match(btn, /color: var\(--brand-foreground\);/)
  // Fix D: bright-gold hover fill (intentional brand exception; the themed
  // token resolves dark brown in Light → ~2.4:1 against the fill).
  assert.match(btn, /background-color: #e5b94f;/)
  assert.doesNotMatch(btn, /background-color: var\(--brand-hover\);/)
  // Decorative gold glow shadow intentionally preserved.
  assert.match(contactModule, /box-shadow: 0 4px 14px rgba\(212, 168, 67, 0\.25\)/)
})

// ---------------------------------------------------------------------------
// G/H. Privacy + Cookies legal pages
// ---------------------------------------------------------------------------

test('Privacy legal cards, callout and :target styling are tokenized', () => {
  assert.match(privacyModule, /\.root \{[\s\S]*?background-color: var\(--background\);/)
  assert.match(privacyModule, /background-color: var\(--card\);/)
  assert.match(privacyModule, /background-color: var\(--surface-muted\);/)
  assert.match(privacyModule, /:target/)
  assert.match(privacyModule, /::marker/)
  assert.match(privacyModule, /border-left: 3px solid var\(--brand\);/)
  assert.match(privacyModule, /color: var\(--brand-hover\);/)
  // No old literals at rule level (skip the header palette comment).
  const privacyRules = privacyModule.slice(privacyModule.indexOf('.root {'))
  assert.doesNotMatch(privacyRules, /#16100A|#0B0805|#1E160E|#D4A63A|#F7F3EC|#C8BBA4/i)
})

test('Cookies legal table, gold gradient button and consent surfaces are tokenized', () => {
  assert.match(cookiesModule, /\.tableWrapper \{[\s\S]*?background-color: var\(--surface-muted\);/)
  assert.match(cookiesModule, /\.legalTable th \{[^}]*color: color-mix\(in srgb, var\(--brand\) 60%, var\(--foreground\)\);/)
  assert.doesNotMatch(cookiesModule, /\.legalTable th \{[^}]*color: var\(--brand\);/)
  assert.match(cookiesModule, /linear-gradient\(135deg, var\(--brand-solid\) 0%, var\(--brand-deep\) 100%\)/)
  assert.match(cookiesModule, /color: var\(--brand-foreground\);/)
  // Fix A: focus rings on the gold settings buttons use var(--foreground)
  // (var(--brand-foreground) ≈ 1.07:1 against the gold fill in Dark).
  assert.match(cookiesModule, /outline: 2px solid var\(--foreground\);/)
  assert.doesNotMatch(cookiesModule, /outline: 2px solid var\(--brand-foreground\);/)
  // Consent behavior surfaces preserved by name.
  assert.match(cookiesModule, /\.tocSettingsBtn/)
  assert.match(cookiesModule, /\.mobileSettingsBtn/)
  assert.match(cookiesModule, /\.sectionSettingsBtn/)
  // Rule-level scan (skip the header palette comment).
  const cookieRules = cookiesModule.slice(cookiesModule.indexOf('.root {'))
  assert.doesNotMatch(cookieRules, /#D4A63A|#AA7F22|#F7F3EC|#0F0A06/i)
})

// ---------------------------------------------------------------------------
// I. Terms focus/hover rings
// ---------------------------------------------------------------------------

test('Terms combined hover/focus rings use brand while keeping geometry', () => {
  assert.match(termsModule, /box-shadow: 0 0 0 2px var\(--brand\);/)
  assert.equal((termsModule.match(/box-shadow: 0 0 0 2px var\(--brand\);/g) || []).length, 3)
  assert.match(termsModule, /:hover,\n\.tocLink:focus-visible/)
  // The three ring occurrences replaced only the color component: no shadow
  // geometry changes and no leftover gold ring literals. Rule-level scan
  // skips the header palette comment.
  assert.doesNotMatch(termsModule, /box-shadow: 0 0 0 2px #D4A63A;/)
  const termsRules = termsModule.slice(termsModule.indexOf('.root {'))
  assert.doesNotMatch(termsRules, /#D4A63A|#F7F3EC|#C8BBA4|#16100A|#1C140D/i)
})

// ---------------------------------------------------------------------------
// M. Dark fixed-brand exceptions
// ---------------------------------------------------------------------------

test('Intentional fixed decorative colors survive (glows, overlays, shadows)', () => {
  assert.match(aboutModule, /rgba\(15, 10, 6, 0\.94\)/)
  assert.match(contactModule, /radial-gradient\(circle, color-mix\(in srgb, var\(--brand\) 15%, transparent\)/)
  assert.match(sharedModule, /rgba\(0, 0, 0, 0\.34\)/)
})

// ---------------------------------------------------------------------------
// O/P/Q. Metadata/SEO and listing behavior pins (TSX)
// ---------------------------------------------------------------------------

test('Hub metadata/SEO and listing contracts are untouched', () => {
  assert.match(positionsHub, /export const revalidate = 300/)
  assert.match(positionsHub, /getIndexablePositionHubEntries/)
  assert.match(positionsHub, /'@type': 'CollectionPage'/)
  assert.match(positionsHub, /noindex: pages\.length === 0/)
  assert.match(positionsHub, /buildPositionSeoDescription/)
  assert.match(agenciesHub, /getIndexableAgencyHubEntries/)
  assert.match(agenciesHub, /buildAgencySeoDescription\(\{/)
  assert.match(agenciesHub, /page\.organization\.logo_url/)
  assert.match(positionsHub, /pages\.length\} ตำแหน่งพร้อมสำรวจ/)
  assert.match(agenciesHub, /page\.operationalPositions\.length\} ตำแหน่งที่เกี่ยวข้อง/)
})

test('All seven route shells remain server-rendered pages without new client state', () => {
  assert.doesNotMatch(positionsHub, /'use client'/)
  assert.doesNotMatch(agenciesHub, /'use client'/)
  for (const [name, mod] of [
    ['about', aboutModule],
    ['contact', contactModule],
    ['privacy', privacyModule],
    ['cookies', cookiesModule],
    ['terms', termsModule],
  ] as const) {
    assert.ok(mod.length > 100, `${name} module content intact`)
  }
})

// ---------------------------------------------------------------------------
// R. Cross-wave preservation
// ---------------------------------------------------------------------------

test('Cross-wave invariants are preserved (Fix1 modal, cropper canvas, FAQ, catalog)', () => {
  assert.match(settingsClient, /bg-\[rgba\(10,7,4,0\.8\)\] backdrop-blur-sm/)
  assert.match(settingsClient, /flex items-center gap-3 text-destructive mb-4/)
  assert.match(avatarCropper, /bg-\[#0F0B07\]/)
  assert.match(faqPage, /open:bg-surface-muted/)
  assert.match(catalog, /var\(--input\)/)
  assert.doesNotMatch(catalog, /var\(--bg-secondary\)/)
})

test('globals.css cross-wave tokens remain untouched by Wave 3 additions', () => {
  // Wave 3 adds exactly three declarations; existing tokens keep values.
  assert.match(globalsCss, /--foreground: #f5e9d6;/)
  assert.match(globalsCss, /--foreground: #2b2118;/)
  assert.match(globalsCss, /--brand-solid: #d4af37;/)
  assert.match(globalsCss, /--brand-deep: #b38f24;/)
  // Island pins intact.
  assert.match(globalsCss, /\.summary-markdown-dark-scope \.summary-content \{/)
  assert.match(globalsCss, /--fresh-exam: #e29a78;/)
})
