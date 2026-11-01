import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Theme Final Polish Wave 1 — UI contract.
 *
 * Scope: 7 UI files converted from hardcoded Dark literals onto the canonical
 * semantic tokens (Theme System V1) so Light/System render correctly while
 * Dark stays visually equivalent. The token dark values were verified against
 * app/globals.css: --brand #d4af37, --muted-foreground #a1866b,
 * --foreground #f5e9d6, --background #0f0b07, --card #1a140e,
 * --surface-raised #140f0a, --fresh-exam #e29a78, --fresh-summary #e3b04b —
 * each exactly matches the literal it replaces.
 *
 * Deliberately NOT a blanket "no hex anywhere" test: brand decoration (gold
 * glows, selection tint, badge fill, chip tints) may legitimately retain raw
 * literals. Assertions target the exact old problematic usages and their
 * replacement contracts, plus the preserved behavior and the untouched
 * intentional-Dark scopes (Admin shell, editorial markdown).
 *
 * Run with: npx tsx --test theme-wave1.ui-contract.test.ts
 */

const appDir = dirname(fileURLToPath(import.meta.url))
const root = join(appDir, '.')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const footer = read('components/Footer.tsx')
const bell = read('components/NotificationBell.tsx')
const packageCard = read('components/PackageCard.tsx')
const forbiddenPage = read('app/forbidden.tsx')
const notFoundPage = read('app/not-found.tsx')
const globalError = read('app/error.tsx')
const newsError = read('app/news/error.tsx')
const globalsCss = read('app/globals.css')
const adminLayout = read('app/admin/layout.tsx')
const positionEditorial = read('components/positions/PositionEditorialSection.tsx')
const agencyEditorial = read('components/agencies/AgencyEditorialSection.tsx')
const confirmDialog = read('components/admin/ConfirmDialog.tsx')
const supportModal = read('components/SupportModal.tsx')
const toastContainer = read('components/admin/ToastContainer.tsx')

// ---------------------------------------------------------------------------
// A. Footer — EXPLORE column matches the adjacent themed columns
// ---------------------------------------------------------------------------

test('Footer EXPLORE column uses semantic text/hover tokens like the adjacent columns', () => {
  // Heading: brand accent (dark #d4af37 == old #D4AF37; light deep gold).
  assert.match(footer, /สำรวจ[\s\S]*?text-xs font-semibold uppercase tracking-wider text-brand mb-3/)
  // Nav body + link hovers: muted/foreground pair, matching HELP/LEGAL columns.
  assert.match(footer, /aria-label="สำรวจหน้างานราชการ" className="flex flex-col space-y-2\.5 text-sm text-muted-foreground"/)
  assert.match(footer, /href="\/positions" className="hover:text-foreground transition-colors"/)
  assert.match(footer, /href="\/agencies" className="hover:text-foreground transition-colors"/)
})

test('Footer no longer carries the old hardcoded Dark literals', () => {
  assert.doesNotMatch(footer, /text-\[#D4AF37\]/)
  assert.doesNotMatch(footer, /text-\[#A1866B\]/)
  assert.doesNotMatch(footer, /hover:text-\[#F5E9D6\]/)
})

test('Footer structure, navigation and responsive layout are preserved', () => {
  assert.match(footer, /data-site-footer="true"/)
  assert.match(footer, /grid grid-cols-2 gap-8 md:gap-10 lg:grid-cols-5/)
  assert.match(footer, /legalConfig\.companyName/)
  assert.match(footer, /CookieSettingsButton/)
  assert.match(footer, /SupportModal/)
  // All five link groups still present (brand, explore, help, legal, connect).
  assert.match(footer, /สำรวจ/)
  assert.match(footer, /ช่วยเหลือ/)
  assert.match(footer, /ข้อกำหนดและนโยบาย/)
  assert.match(footer, /ติดตามเรา/)
})

// ---------------------------------------------------------------------------
// B. NotificationBell — trigger, badge ring and dropdown on semantic tokens
// ---------------------------------------------------------------------------

test('NotificationBell trigger uses semantic surface, border and text tokens', () => {
  assert.match(bell, /border border-border-subtle bg-hover text-muted-foreground/)
  assert.match(bell, /hover:bg-hover-strong hover:text-foreground/)
  assert.match(bell, /focus:ring-2 focus:ring-brand\/50/)
  // Old fixed-palette trigger is gone.
  assert.doesNotMatch(bell, /border-\[rgba\(255,255,255,0\.05\)\]/)
  assert.doesNotMatch(bell, /bg-\[rgba\(255,255,255,0\.03\)\]/)
  assert.doesNotMatch(bell, /hover:bg-\[rgba\(255,255,255,0\.06\)\]/)
  assert.doesNotMatch(bell, /text-\[#A1866B\]/)
  assert.doesNotMatch(bell, /hover:text-\[#F5E9D6\]/)
  assert.doesNotMatch(bell, /ring-\[#D4AF37\]\/50/)
})

test('NotificationBell unread badge ring follows the canvas, fill stays gold', () => {
  // Ring was #0F0B07 (dark canvas literal); --background is #0f0b07 in dark and
  // ivory in light, so the ring always melts into the surrounding navbar.
  assert.match(bell, /border-2 border-background/)
  assert.doesNotMatch(bell, /border-\[#0F0B07\]/)
  // Gold fill + dark count text are brand decoration — unchanged on purpose.
  assert.match(bell, /bg-\[#D4AF37\] px-1 text-\[9px\] font-bold leading-none text-\[#0F0B07\]/)
})

test('NotificationBell dropdown is a themed raised surface', () => {
  assert.match(bell, /rounded-2xl border border-border-subtle bg-surface-raised shadow-\[var\(--shadow-lg\)\]/)
  assert.match(bell, /border-b border-border-subtle/)
  assert.doesNotMatch(bell, /bg-\[#140F0A\]/)
  assert.doesNotMatch(bell, /rgba\(212,175,55,0\.18\)/)
  assert.doesNotMatch(bell, /shadow-\[0_16px_50px_rgba\(0,0,0,0\.55\)\]/)
})

test('NotificationBell dropdown text uses semantic roles', () => {
  // Header: title foreground, subtitle muted, unread pill brand-on-wash.
  assert.match(bell, /text-sm font-bold text-foreground/)
  assert.match(bell, /text-\[11px\] text-muted-foreground/)
  assert.match(bell, /rounded-full bg-wash px-2 py-1 text-\[10px\] font-semibold text-brand/)
  // Rows: title foreground, body muted, CTA brand.
  assert.match(bell, /text-sm font-semibold leading-snug text-foreground/)
  assert.match(bell, /text-xs text-muted-foreground/)
  assert.match(bell, /text-\[11px\] font-semibold text-brand/)
  // Loading + empty states.
  assert.match(bell, /text-sm text-muted-foreground/)
  assert.doesNotMatch(bell, /text-\[#F5E9D6\]/)
  assert.doesNotMatch(bell, /text-\[#D4AF37\]/)
})

test('NotificationBell notification behavior is untouched by the re-theme', () => {
  // Hook + fetch logic (mirrors app/notifications/notifications.contract.test.ts).
  assert.match(bell, /export function useNotificationCenter\(userId: string \| null\)/)
  assert.match(bell, /fetch\('\/api\/notifications\?mode=count'/)
  assert.match(bell, /fetch\('\/api\/notifications\?mode=list'/)
  assert.match(bell, /method: 'PATCH'/)
  assert.match(bell, /if \(!active\) return null/)
  assert.match(bell, /router\.push\(isLocalNotificationHref\(notification\.href\) \? notification\.href : '\/my-packages'\)/)
  // Loading, empty and CTA copy.
  assert.match(bell, /กำลังโหลด…/)
  assert.match(bell, /ยังไม่มีการแจ้งเตือน/)
  assert.match(bell, /'ส่งหลักฐานใหม่'/)
  assert.match(bell, /'ทำข้อสอบชุดใหม่'/)
  assert.match(bell, /'เปิดแพ็กเกจ'/)
})

// ---------------------------------------------------------------------------
// C. PackageCard — freshness chips read the theme CSS variables
// ---------------------------------------------------------------------------

test('PackageCard freshness chip text uses the approved freshness CSS variables', () => {
  assert.match(packageCard, /exam: \{[\s\S]*?color: 'var\(--fresh-exam\)',/)
  assert.match(packageCard, /summary: \{[\s\S]*?color: 'var\(--fresh-summary\)',/)
  assert.doesNotMatch(packageCard, /#E29A78|#E3B04B/)
})

test('freshness CSS variables exist with dark values equal to the old literals and light equivalents', () => {
  // Dark (canonical :root block) — byte-equal to the replaced literals.
  assert.match(globalsCss, /--fresh-exam: #e29a78;/)
  assert.match(globalsCss, /--fresh-summary: #e3b04b;/)
  // Light overrides for ivory contrast.
  assert.match(globalsCss, /--fresh-exam: #a55531;/)
  assert.match(globalsCss, /--fresh-summary: #8a6914;/)
})

test('PackageCard chip structure, tints and classification are preserved', () => {
  // Background/border tints untouched (only the text color was re-tokened).
  assert.match(packageCard, /background: 'rgba\(226, 138, 100, 0\.08\)'/)
  assert.match(packageCard, /borderColor: 'rgba\(226, 138, 100, 0\.25\)'/)
  assert.match(packageCard, /background: 'rgba\(212, 168, 67, 0\.08\)'/)
  assert.match(packageCard, /borderColor: 'rgba\(212, 168, 67, 0\.22\)'/)
  // Classification + copy flow unchanged.
  assert.match(packageCard, /formatFreshExamSetLabel/)
  assert.match(packageCard, /formatFreshSummaryLabel/)
  assert.match(packageCard, /if \(!freshness\?\.hasFreshContent\) return null/)
  assert.match(packageCard, /GENERIC_FRESHNESS_LABEL/)
})

// ---------------------------------------------------------------------------
// D. Forbidden — theme-aware text
// ---------------------------------------------------------------------------

test('Forbidden heading and body are theme-aware', () => {
  assert.match(forbiddenPage, /text-4xl font-display font-bold text-foreground mb-4/)
  assert.match(forbiddenPage, /text-muted-foreground text-lg max-w-md mb-8/)
  assert.doesNotMatch(forbiddenPage, /text-\[#F5E9D6\]/)
  assert.doesNotMatch(forbiddenPage, /text-\[#A1866B\]/)
})

test('Forbidden HTTP semantics, copy and CTA are preserved', () => {
  assert.match(forbiddenPage, /403 Forbidden/)
  assert.match(forbiddenPage, /ขออภัย คุณไม่มีสิทธิ์เข้าถึงหน้านี้/)
  assert.match(forbiddenPage, /href="\/"/)
  assert.match(forbiddenPage, /btn-primary/)
  assert.match(forbiddenPage, /กลับสู่หน้าแรก/)
  // Status decoration (red shield) stays as-is.
  assert.match(forbiddenPage, /ShieldAlert/)
  assert.match(forbiddenPage, /text-red-400/)
})

// ---------------------------------------------------------------------------
// E. Global error states — themed surfaces, same behavior
// ---------------------------------------------------------------------------

test('not-found renders on themed canvas/card surfaces', () => {
  assert.match(notFoundPage, /min-h-screen bg-background/)
  assert.match(notFoundPage, /bg-card border border-border-subtle/)
  assert.match(notFoundPage, /shadow-\[var\(--shadow-lg\)\]/)
  assert.match(notFoundPage, /rounded-full bg-background border border-border-subtle/)
  assert.match(notFoundPage, /text-brand opacity-80">404</)
  assert.match(notFoundPage, /font-display font-bold text-foreground/)
  assert.match(notFoundPage, /text-muted-foreground mb-8 leading-relaxed/)
  assert.doesNotMatch(notFoundPage, /bg-\[#0F0B07\]|bg-\[#1A140E\]|text-\[#F5E9D6\]|text-\[#A1866B\]/)
})

test('not-found CTAs use brand-solid semantics and keep their destinations', () => {
  assert.match(notFoundPage, /bg-brand-solid hover:bg-\[#F1D17A\] text-brand-foreground/)
  assert.match(notFoundPage, /href="\/"/)
  assert.match(notFoundPage, /href="\/#exams"/)
  assert.match(notFoundPage, /border border-border-subtle hover:border-brand\/50/)
  assert.match(notFoundPage, /text-foreground font-bold py-3\.5 px-6/)
  assert.match(notFoundPage, /กลับหน้าหลัก/)
  assert.match(notFoundPage, /ค้นหาชุดข้อสอบ/)
})

test('global error boundary stays a client component with themed surfaces', () => {
  assert.match(globalError, /'use client'/)
  assert.match(globalError, /bg-background/)
  assert.match(globalError, /bg-card border border-border-subtle/)
  assert.match(globalError, /shadow-\[var\(--shadow-lg\)\]/)
  assert.match(globalError, /font-display font-bold text-foreground/)
  assert.match(globalError, /text-muted-foreground/)
  assert.match(globalError, /border-t border-border-subtle text-\[11px\] text-muted-foreground/)
  assert.doesNotMatch(globalError, /bg-\[#0F0B07\]|bg-\[#1A140E\]|text-\[#F5E9D6\]|text-\[#A1866B\]/)
})

test('global error retry and digest behavior are preserved', () => {
  assert.match(globalError, /onClick=\{\(\) => reset\(\)\}/)
  assert.match(globalError, /console\.error\('Application Error:', error\)/)
  assert.match(globalError, /Error Digest: \{error\.digest \|\| 'Unknown'\}/)
  assert.match(globalError, /ลองใหม่อีกครั้ง/)
  assert.match(globalError, /กลับหน้าหลัก/)
})

test('news error boundary stays a client component with themed surfaces', () => {
  assert.match(newsError, /'use client'/)
  assert.match(newsError, /min-h-\[70vh\] bg-background/)
  assert.match(newsError, /bg-card border border-border-subtle/)
  assert.match(newsError, /shadow-\[var\(--shadow-lg\)\]/)
  assert.match(newsError, /font-display font-bold text-foreground/)
  assert.match(newsError, /text-muted-foreground/)
  assert.match(newsError, /border-t border-border-subtle text-\[11px\] text-muted-foreground/)
  assert.doesNotMatch(newsError, /bg-\[#0F0B07\]|bg-\[#1A140E\]|text-\[#F5E9D6\]|text-\[#A1866B\]/)
})

test('news error retry, copy and digest behavior are preserved', () => {
  assert.match(newsError, /onClick=\{\(\) => reset\(\)\}/)
  assert.match(newsError, /console\.error\('Public news list error:', error\)/)
  assert.match(newsError, /error\.digest && \(/)
  assert.match(newsError, /ไม่สามารถโหลดข่าวได้/)
  assert.match(newsError, /ลองใหม่อีกครั้ง/)
  assert.match(newsError, /กลับหน้าหลัก/)
})

// ---------------------------------------------------------------------------
// Token pins — the dark zero-change and light readability contract
// ---------------------------------------------------------------------------

test('canonical tokens keep their verified dark values with light overrides', () => {
  // Dark values (must stay byte-equal to the literals Wave 1 replaced).
  assert.match(globalsCss, /--background: #0f0b07;/)
  assert.match(globalsCss, /--foreground: #f5e9d6;/)
  assert.match(globalsCss, /--card: #1a140e;/)
  assert.match(globalsCss, /--muted-foreground: #a1866b;/)
  assert.match(globalsCss, /--surface-raised: #140f0a;/)
  assert.match(globalsCss, /--brand: #d4af37;/)
  // Light overrides (Warm Ivory + Espresso + Sobdai Gold).
  assert.match(globalsCss, /\[data-theme='light'\] \{[\s\S]*?--background: #faf5ec;[\s\S]*?--foreground: #2b2118;/)
  assert.match(globalsCss, /--card: #fffdf8;/)
  assert.match(globalsCss, /--muted-foreground: #6f5d47;/)
  assert.match(globalsCss, /--surface-raised: #fffdf8;/)
  assert.match(globalsCss, /--brand: #8a6914;/)
  // Shadow token used by the bell dropdown and error-page cards.
  assert.match(globalsCss, /--shadow-lg: 0 8px 40px rgba\(0, 0, 0, 0\.6\);/)
  assert.match(globalsCss, /--shadow-lg: 0 8px 40px rgba\(86, 62, 28, 0\.16\);/)
})

// ---------------------------------------------------------------------------
// F. Intentional Dark scopes remain untouched (P2C.3 contract)
// ---------------------------------------------------------------------------

test('Admin shell keeps its intentional Dark island and dark-scope class', () => {
  assert.match(adminLayout, /bg-\[#0F0B07\] text-\[#F5E9D6\]/)
  assert.match(adminLayout, /summary-markdown-dark-scope/)
})

test('editorial markdown keeps the intentional Dark scope wiring', () => {
  assert.match(positionEditorial, /summary-markdown-dark-scope/)
  assert.match(agencyEditorial, /summary-markdown-dark-scope/)
  // The island pin in globals.css is intact (re-pins only .summary-content).
  assert.match(globalsCss, /\.summary-markdown-dark-scope \.summary-content \{/)
  assert.match(globalsCss, /\.summary-markdown-dark-scope[\s\S]*?--foreground: #f5e9d6;/)
})

test('ConfirmDialog, SupportModal and ToastContainer are untouched by Wave 1', () => {
  // These stay on their accepted P2C.3 contract (no dark-canvas literals were
  // present before Wave 1 and none may be introduced).
  assert.doesNotMatch(confirmDialog, /bg-\[#0F0B07\]|bg-\[#1A140E\]/)
  assert.doesNotMatch(supportModal, /bg-\[#0F0B07\]|bg-\[#1A140E\]/)
  assert.doesNotMatch(toastContainer, /bg-\[#0F0B07\]|bg-\[#1A140E\]/)
})
