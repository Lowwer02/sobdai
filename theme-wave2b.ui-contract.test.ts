import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Theme Final Polish Wave 2B — UI contract (public pages).
 *
 * Presentation-only re-theme of Help, FAQ, Author profile, package catalog,
 * phak-khor, article error states, article loading skeleton and Downloads
 * onto the canonical semantic tokens. NO application behavior may change.
 *
 * Deliberately NOT a blanket "no hex anywhere" test: gold glows, established
 * gold hover backgrounds, orange/blue exam-mode coding, green status accents
 * and gradient decorations are intentional and must survive.
 *
 * Run with: npx tsx --test theme-wave2b.ui-contract.test.ts
 */

const appDir = dirname(fileURLToPath(import.meta.url))
const root = join(appDir, '.')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const help = read('app/help/page.tsx')
const faq = read('app/faq/page.tsx')
const authors = read('app/authors/[slug]/page.tsx')
const catalog = read('app/packages/PackageCatalogClient.tsx')
const phakKhor = read('app/packages/phak-khor/page.tsx')
const articlesList = read('app/articles/page.tsx')
const articleDetail = read('app/articles/[slug]/page.tsx')
const relatedPackages = read('components/articles/ArticleRelatedPackages.tsx')
const loading = read('app/articles/[slug]/loading.tsx')
const downloads = read('app/downloads/page.tsx')
const globalsCss = read('app/globals.css')
const settingsClient = read('app/settings/SettingsClient.tsx')
const avatarCropper = read('components/AvatarCropper.tsx')

// ---------------------------------------------------------------------------
// HELP
// ---------------------------------------------------------------------------

test('Help root, hero and card surfaces use semantic tokens', () => {
  assert.match(help, /min-h-screen bg-background text-foreground/)
  assert.match(help, /border-b border-border-subtle bg-surface-raised py-14 md:py-20/)
  assert.match(help, /rounded-2xl bg-card border border-border-subtle/)
  assert.match(help, /rounded-3xl bg-surface-raised border border-border-subtle/)
  assert.doesNotMatch(help, /bg-\[#0F0B07\]|bg-\[#140E0A\]|bg-\[#1A140E\]/)
  assert.doesNotMatch(help, /text-\[#F5E9D6\]|text-\[#A1866B\]|text-\[#D4AF37\]/)
  assert.doesNotMatch(help, /border-\[rgba\(255,255,255,0\.0[56]\)\]|border-\[rgba\(212,175,55,0\.1[258]\)\]/)
})

test('Help nested insets use bg-surface-muted, not bg-background', () => {
  // The three audited near-black inset surfaces (authority callout, result
  // selection note, /exams code chip) plus the screenshot wrapper panel.
  assert.match(help, /rounded-2xl bg-surface-muted border border-brand\/30 flex items-start/)
  assert.match(help, /rounded-xl bg-surface-muted border border-border-subtle/)
  assert.match(help, /text-brand bg-surface-muted px-2 py-0\.5 rounded border border-brand\/20/)
  assert.match(help, /rounded-2xl bg-surface-muted border border-border-subtle space-y-4 shadow-lg/)
  // Light-mode separation: insets must NOT fall back to the page canvas.
  assert.doesNotMatch(help, /bg-background px-2/)
})

test('Help anchors, sections, screenshots and badges are preserved', () => {
  for (const id of ['getting-started', 'exam-modes', 'during-exam', 'results', 'review', 'my-exams']) {
    assert.match(help, new RegExp(`id="${id}"`))
  }
  assert.match(help, /HelpScreenshot/)
  assert.match(help, /help-packages\.webp/)
  assert.match(help, /help-simulation\.webp/)
  assert.match(help, /href="\/faq#results-and-review"/)
  assert.match(help, /buildBreadcrumbJsonLd/)
  // Badges/chips on the wash/brand vocabulary.
  assert.match(help, /rounded-full bg-wash border border-brand\/30 text-brand/)
  // Intentional decorative gold glow preserved.
  assert.match(help, /bg-\[#D4AF37\]\/5 rounded-full blur-3xl/)
})

test('Help keeps functional orange/blue exam-mode coding and established gold hovers', () => {
  assert.match(help, /border-orange-500\/30/)
  assert.match(help, /bg-orange-500\/10 text-orange-400 border-orange-500\/30/)
  assert.match(help, /bg-blue-500\/10 text-blue-400 border-blue-500\/30/)
  // Established gold hover backgrounds kept as intentional literals.
  assert.match(help, /hover:bg-\[rgba\(212,175,55,0\.05\)\]/)
  assert.match(help, /hover:bg-\[rgba\(212,175,55,0\.06\)\]/)
})

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

test('FAQ root, hero and category chips use semantic tokens', () => {
  assert.match(faq, /min-h-screen bg-background text-foreground/)
  assert.match(faq, /border-b border-border-subtle bg-surface-raised py-14 md:py-20/)
  assert.match(faq, /border border-border-subtle bg-surface-raised text-muted-foreground hover:text-brand hover:border-brand\/40 hover:bg-card/)
  assert.match(faq, /focus-visible:ring-brand\/50/)
  assert.doesNotMatch(faq, /bg-\[#0F0B07\]|bg-\[#140E0A\]|bg-\[#1A140E\]|text-\[#C4A482\]|text-\[#F5E9D6\]|text-\[#A1866B\]|text-\[#D4AF37\]/)
})

test('FAQ accordion open state uses surface-muted (Light-mode trap fixed)', () => {
  // The mandatory replacement: opened accordion must be a theme-aware muted
  // surface — never a near-black card behind dark-on-light summary text.
  assert.match(faq, /bg-surface-raised hover:border-brand\/40 transition-colors open:border-brand\/40 open:bg-surface-muted/)
  assert.doesNotMatch(faq, /open:bg-\[#16100B\]/)
  assert.doesNotMatch(faq, /open:bg-\[#/)
})

test('FAQ native accordion behavior classes are preserved exactly', () => {
  assert.match(faq, /<details\b/)
  assert.match(faq, /<summary\b/)
  assert.match(faq, /cursor-pointer list-none select-none text-left/)
  assert.match(faq, /\[&::-webkit-details-marker\]:hidden/)
  assert.match(faq, /group-open:rotate-180 group-open:text-brand/)
  // All structure: categories, per-item ids, deep links, JSON-LD.
  assert.match(faq, /FAQ_CATEGORIES\.map/)
  assert.match(faq, /FAQ_ITEMS\.filter/)
  assert.match(faq, /buildFaqPageJsonLd/)
  assert.match(faq, /id=\{item\.id\}/)
  assert.match(faq, /scroll-mt-20/)
})

test('FAQ answers, links and CTA use semantic roles', () => {
  assert.match(faq, /pb-5 pt-1 text-muted-foreground/)
  assert.match(faq, /text-brand hover:text-brand-hover underline underline-offset-4 decoration-brand\/30 hover:decoration-brand/)
  assert.match(faq, /rounded-2xl bg-surface-raised border border-border-subtle text-center/)
})

// ---------------------------------------------------------------------------
// AUTHORS
// ---------------------------------------------------------------------------

test('Author profile shell, bio card and badges are theme-aware', () => {
  assert.match(authors, /min-h-screen bg-background text-foreground py-8/)
  assert.match(authors, /bg-card border border-brand\/20 rounded-2xl p-6 sm:p-8 shadow-xl/)
  assert.match(authors, /rounded-full bg-wash border-2 border-brand\/40/)
  assert.match(authors, /bg-wash border border-brand\/30 text-brand rounded-full/)
  assert.match(authors, /bg-card\/50 border border-border-subtle rounded-xl p-12/)
  assert.doesNotMatch(authors, /bg-\[#0F0B07\]|bg-\[#1A140E\]|text-\[#F5E9D6\]|text-\[#A1866B\]|text-\[#D4AF37\]/)
})

test('Author metadata, JSON-LD and data contracts are retained', () => {
  assert.match(authors, /export const revalidate = 300/)
  assert.match(authors, /getActiveAuthorBySlug/)
  assert.match(authors, /getPublishedArticlesByAuthorSlug/)
  assert.match(authors, /notFound\(\)/)
  assert.match(authors, /'@type': 'ProfilePage'/)
  assert.match(authors, /noindex: !hasPublishedArticles/)
  assert.match(authors, /<ArticleCard key=\{item\.id\} article=\{item\} \/>/)
})

// ---------------------------------------------------------------------------
// PACKAGE CATALOG
// ---------------------------------------------------------------------------

test('Catalog search input uses var(--input) — undefined --bg-secondary removed', () => {
  assert.match(catalog, /backgroundColor: 'var\(--input\)'/)
  assert.doesNotMatch(catalog, /--bg-secondary/)
})

test('Catalog low-contrast label and interactive surfaces use theme tokens', () => {
  assert.doesNotMatch(catalog, /#C5B097/)
  assert.match(catalog, /color: 'var\(--muted-foreground\)'/)
  assert.match(catalog, /backgroundColor: 'var\(--wash\)'/)
  assert.match(catalog, /background: 'var\(--hover\)'/)
  assert.match(catalog, /focus-visible:ring-brand/)
  assert.doesNotMatch(catalog, /rgba\(255,255,255,0\.0[34]\)/)
})

test('Catalog behavior invariants are untouched', () => {
  assert.match(catalog, /freshnessVariant="detailed"/)
  assert.match(catalog, /router\.replace\(basePath\)/)
  assert.match(catalog, /event\.key === 'Escape' && isSearchActive/)
  assert.match(catalog, /role="radiogroup"/)
  assert.match(catalog, /getMatchScore\(pkg, q\)/)
  assert.match(catalog, /aria-live="polite"/)
})

// ---------------------------------------------------------------------------
// PHAK KHOR
// ---------------------------------------------------------------------------

test('Phak-khor discovery links are tokenized', () => {
  assert.equal((phakKhor.match(/text-muted-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/g) || []).length, 2)
  assert.doesNotMatch(phakKhor, /text-\[#A1866B\]|hover:text-\[#D4AF37\]|ring-\[#D4AF37\]/)
  assert.match(phakKhor, /basePath="\/packages\/phak-khor"/)
  assert.match(phakKhor, /<Suspense fallback=\{null\}>/)
})

// ---------------------------------------------------------------------------
// ARTICLES
// ---------------------------------------------------------------------------

test('Article listing error state uses destructive tokens', () => {
  const errorBlock = articlesList.slice(
    articlesList.indexOf('{/* Error State */}'),
    articlesList.indexOf('{/* Success States */}'),
  )
  assert.match(errorBlock, /bg-destructive-bg border border-destructive-border/)
  assert.match(errorBlock, /text-destructive/)
  assert.match(errorBlock, /text-muted-foreground/)
  assert.doesNotMatch(errorBlock, /red-500|red-400|red-300|red-200/)
  // No global red sweep: the rest of the listing keeps its own styling.
  assert.match(articlesList, /bg-card border border-brand\/15 rounded-2xl p-8 sm:p-12/)
})

test('Article detail error state uses destructive tokens on a themed card', () => {
  const errorBlock = articleDetail.slice(
    articleDetail.indexOf('// Query error / unexpected failure'),
    articleDetail.indexOf('// Not found or not published'),
  )
  assert.match(errorBlock, /bg-card border border-destructive-border/)
  assert.match(errorBlock, /text-destructive/)
  assert.match(errorBlock, /text-muted-foreground/)
  assert.doesNotMatch(errorBlock, /red-500|red-400|red-300|red-200/)
})

test('Related packages error state tokenized and gold divider mapped', () => {
  const errorBlock = relatedPackages.slice(0, relatedPackages.indexOf('// Omit entire section'))
  assert.match(errorBlock, /bg-destructive-bg border border-destructive-border/)
  assert.match(errorBlock, /text-destructive/)
  assert.doesNotMatch(errorBlock, /red-500|red-300/)
  assert.match(relatedPackages, /border-t border-brand\/15 space-y-6/)
  assert.doesNotMatch(relatedPackages, /border-\[#D4AF37\]\/15/)
  assert.match(relatedPackages, /export function formatPrice/)
})

test('Article SEO and data contracts retained', () => {
  assert.match(articleDetail, /export const revalidate = 300/)
  assert.match(articleDetail, /'@type': 'Article'/)
  assert.match(articleDetail, /buildBreadcrumbJsonLd/)
  assert.match(articleDetail, /notFound\(\)/)
  assert.match(articlesList, /getPublishedArticlesList/)
  assert.match(articlesList, /ArticlePagination/)
  assert.match(articlesList, /AffiliateListingStrip/)
})

// ---------------------------------------------------------------------------
// LOADING SKELETON
// ---------------------------------------------------------------------------

test('Article loading skeleton is theme-aware with no Dark forcing', () => {
  assert.match(loading, /min-h-screen bg-background text-foreground/)
  assert.match(loading, /bg-card\/60 border border-border-subtle/)
  assert.match(loading, /bg-surface-muted rounded/)
  assert.match(loading, /animate-pulse/)
  assert.equal((loading.match(/bg-card rounded/g) || []).length, 7)
  assert.doesNotMatch(loading, /bg-\[#0F0B07\]|bg-\[#1A140E\]|bg-\[#15100B\]|text-\[#F5E9D6\]/)
  assert.doesNotMatch(loading, /'use client'|useEffect|useState|matchMedia/)
  assert.match(loading, /export default function ArticleDetailLoading/)
})

// ---------------------------------------------------------------------------
// DOWNLOADS
// ---------------------------------------------------------------------------

test('Downloads success icon uses theme tokens; gold gradients preserved', () => {
  assert.match(downloads, /background: 'var\(--success-bg\)'/)
  assert.match(downloads, /color: 'var\(--success\)'/)
  assert.match(downloads, /background: 'var\(--success-bg\)', color: 'var\(--success\)'/)
  assert.doesNotMatch(downloads, /#22c55e|rgba\(34, 197, 94/)
  // Intentional gold decorations preserved.
  assert.match(downloads, /radial-gradient\(ellipse at center, rgba\(212, 168, 67, 0\.08\)/)
  assert.match(downloads, /linear-gradient\(180deg, transparent 0%, rgba\(212, 168, 67, 0\.03\)/)
  assert.match(downloads, /className="card-gold"/)
  assert.match(downloads, /className="badge badge-green"/)
  assert.match(downloads, /createPageMetadata/)
})

// ---------------------------------------------------------------------------
// TOKENS — dark/light values and Tailwind mappings used by Wave 2B
// ---------------------------------------------------------------------------

test('Wave 2B tokens keep verified dark values with light overrides and mappings', () => {
  // surface-muted
  assert.match(globalsCss, /--surface-muted: #120d08;/)
  assert.match(globalsCss, /--surface-muted: #f1e9d8;/)
  assert.match(globalsCss, /--color-surface-muted: var\(--surface-muted\);/)
  // brand-hover
  assert.match(globalsCss, /--brand-hover: #e8c46e;/)
  assert.match(globalsCss, /--brand-hover: #6f5310;/)
  assert.match(globalsCss, /--color-brand-hover: var\(--brand-hover\);/)
  // success + destructive
  assert.match(globalsCss, /--success: #22c55e;/)
  assert.match(globalsCss, /--success: #1a7f37;/)
  assert.match(globalsCss, /--destructive: #ef4444;/)
  assert.match(globalsCss, /--destructive: #b3261e;/)
  assert.match(globalsCss, /--color-success: var\(--success\);/)
  assert.match(globalsCss, /--color-destructive: var\(--destructive\);/)
  // destructive surface vocabulary
  assert.match(globalsCss, /--color-destructive-bg: var\(--destructive-bg\);/)
  assert.match(globalsCss, /--color-destructive-border: var\(--destructive-border\);/)
  // input + legacy border-hover (catalog selected pill)
  assert.match(globalsCss, /--input: #0f0b07;/)
  assert.match(globalsCss, /--input: #fffdf8;/)
  assert.match(globalsCss, /--border-hover: rgba\(212, 168, 67, 0\.35\);/)
})

// ---------------------------------------------------------------------------
// CROSS-WAVE — read-only invariants from accepted releases
// ---------------------------------------------------------------------------

test('Wave 2A Fix1 anchors unchanged: modal backdrop, warning token, cropper canvas', () => {
  assert.match(settingsClient, /bg-\[rgba\(10,7,4,0\.8\)\] backdrop-blur-sm/)
  assert.match(settingsClient, /flex items-center gap-3 text-destructive mb-4/)
  assert.match(avatarCropper, /relative w-full h-\[300px\] sm:h-\[400px\] bg-\[#0F0B07\]/)
  assert.match(avatarCropper, /bg-overlay backdrop-blur-sm/)
})
