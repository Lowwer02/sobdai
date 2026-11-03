import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Theme Final Polish Wave 2A — UI contract (Auth / Settings / Account).
 *
 * Visual-only re-theme of Login, Settings page, SettingsClient, AvatarCropper
 * modal chrome and Reset-password onto the canonical semantic tokens.
 * NO authentication / account / avatar behavior may change.
 *
 * Deliberately NOT a blanket "no hex anywhere" test: brand gold glows, the
 * fixed-Dark crop canvas, destructive red styling and CTA hover literals are
 * intentional and must survive. Assertions target the exact old problematic
 * usages, their replacement contracts, and the preserved behavior.
 *
 * Run with: npx tsx --test theme-wave2a.ui-contract.test.ts
 */

const appDir = dirname(fileURLToPath(import.meta.url))
const root = join(appDir, '.')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const login = read('app/login/page.tsx')
const settingsPage = read('app/settings/page.tsx')
const settingsClient = read('app/settings/SettingsClient.tsx')
const avatarCropper = read('components/AvatarCropper.tsx')
const resetPassword = read('app/reset-password/page.tsx')
const globalsCss = read('app/globals.css')
const authModal = read('components/AuthModal.tsx')

// ---------------------------------------------------------------------------
// A. Login — theme-aware surfaces, AuthModal untouched
// ---------------------------------------------------------------------------

test('Login root canvas, wordmark and text surfaces use semantic tokens', () => {
  assert.match(login, /min-h-screen bg-background text-foreground flex flex-col items-center justify-center/)
  assert.match(login, /text-brand font-display font-bold text-2xl mb-8 group/)
  assert.match(login, /focus-visible:ring-2 focus-visible:ring-brand rounded-lg/)
  assert.match(login, /text-2xl font-bold text-foreground mb-2/)
  assert.match(login, /text-muted-foreground">เพื่อเข้าใช้งานฟีเจอร์ต่างๆ/)
  assert.doesNotMatch(login, /bg-\[#0F0B07\]|text-\[#F5E9D6\]|text-\[#A1866B\]|text-\[#D4AF37\]|ring-\[#D4AF37\]/)
})

test('Login keeps the branded gold glow, banned warning styling and AuthModal wiring', () => {
  // Brand decoration (intentional).
  assert.match(login, /shadow-\[0_2px_10px_rgba\(212,175,55,0\.2\)\]/)
  // Intentional banned-account warning colors.
  assert.match(login, /border-red-500\/30 bg-red-500\/10/)
  assert.match(login, /text-red-300/)
  // AuthModal contract untouched: always-open modal with return-path close/success handling.
  assert.match(login, /<AuthModal\s+isOpen=\{true\}/)
  assert.match(login, /normalizeInternalReturnPath\(searchParams\.get\('redirect'\)\)/)
  assert.match(login, /window\.location\.href = returnPath/)
  assert.match(login, /searchParams\.get\('mode'\) === 'register' \? 'register' : 'login'/)
  assert.match(login, /initialMode=\{initialMode\}/)
  assert.match(login, /redirectUrl=\{returnPath\}/)
})

// ---------------------------------------------------------------------------
// B. Settings page root — semantic canvas with the approved Dark delta
// ---------------------------------------------------------------------------

test('Settings page root and heading use semantic tokens', () => {
  assert.match(settingsPage, /min-h-screen bg-background pt-24 pb-12/)
  assert.match(settingsPage, /font-display text-foreground tracking-tight mb-8/)
  assert.doesNotMatch(settingsPage, /bg-\[#0A0705\]|text-\[#F5E9D6\]/)
  // Server-side user scoping and redirect behavior remain intact.
  assert.match(settingsPage, /await supabase\.auth\.getUser\(\)/)
  assert.match(settingsPage, /redirect\('\/login'\)/)
  assert.match(settingsPage, /\.from\('profiles'\)/)
  assert.match(settingsPage, /<SettingsClient initialProfile=\{enhancedProfile\} \/>/)
})

// ---------------------------------------------------------------------------
// C. SettingsClient — cards, inputs, badges, ghost controls, modal
// ---------------------------------------------------------------------------

test('SettingsClient profile and section cards use card/brand-border tokens', () => {
  assert.match(settingsClient, /bg-card border border-brand\/15 rounded-2xl/)
  // Three themed section cards (profile, account details, security).
  assert.equal((settingsClient.match(/bg-card border border-brand\/15 rounded-2xl/g) || []).length, 3)
  assert.match(settingsClient, /border-b border-border-subtle/)
  assert.doesNotMatch(settingsClient, /bg-\[#1A140E\]|rgba\(212,175,55,0\.15\)/)
})

test('SettingsClient avatar area keeps its gold accent on semantic surfaces', () => {
  assert.match(settingsClient, /rounded-full bg-background border border-border-subtle/)
  assert.match(settingsClient, /font-display text-brand font-bold/)
  assert.match(settingsClient, /p-2 bg-brand-solid text-brand-foreground rounded-full hover:brightness-110/)
})

test('SettingsClient form inputs follow the approved input surface contract', () => {
  const inputs = settingsClient.match(/className="w-full bg-input[^"]*"/g) || []
  assert.ok(inputs.length >= 4, 'expected at least 4 tokenized inputs')
  // Three editable inputs carry the full approved contract (placeholder +
  // focus ring at the old literal intensity /50); the read-only email is muted.
  const editable = inputs.filter(cls => cls.includes('placeholder:text-muted-foreground/50'))
  assert.ok(editable.length >= 3, 'expected at least 3 fully tokenized editable inputs')
  for (const cls of editable) {
    assert.match(cls, /bg-input border border-border-subtle text-foreground/)
    assert.match(cls, /focus:border-brand focus:ring-1 focus:ring-brand\/50/)
  }
  // Read-only email stays muted and non-editable.
  assert.match(settingsClient, /readOnly[\s\S]*?className="w-full bg-input border border-border-subtle text-muted-foreground rounded-xl px-4 py-3"/)
  assert.match(settingsClient, /opacity-60 pointer-events-none/)
  assert.doesNotMatch(settingsClient, /bg-\[#0F0B07\] border|text-\[#F5E9D6\]|text-\[#A1866B\]|border-\[rgba\(255,255,255,0\.1\)\]/)
})

test('SettingsClient labels and headings use foreground/muted roles', () => {
  assert.match(settingsClient, /block text-sm font-medium text-foreground/)
  assert.match(settingsClient, /text-xl font-display text-foreground/)
  assert.match(settingsClient, /text-muted-foreground text-sm mt-1/)
})

test('SettingsClient role badge uses wash/brand tokens; status badge keeps semantic red/green', () => {
  assert.match(settingsClient, /'bg-wash text-brand border-brand\/30'/)
  assert.match(settingsClient, /'bg-background text-muted-foreground border-border-subtle'/)
  // Intentional account-status colors unchanged.
  assert.match(settingsClient, /profile\.status === 'banned'/)
  assert.match(settingsClient, /bg-red-500\/10 text-red-300 border-red-500\/30/)
  assert.match(settingsClient, /bg-green-500\/10 text-green-400 border-green-500\/30/)
})

test('SettingsClient ghost controls use subtle border/hover tokens', () => {
  // Change Password button.
  assert.match(settingsClient, /border border-border-subtle text-foreground text-sm font-medium rounded-lg hover:bg-hover/)
  // Deactivate modal cancel button.
  assert.match(settingsClient, /bg-transparent border border-border-subtle text-foreground hover:bg-hover rounded-xl/)
  // Security provider row + icon tile.
  assert.match(settingsClient, /bg-background border border-border-subtle rounded-xl p-5/)
  assert.match(settingsClient, /rounded-lg bg-wash flex items-center justify-center text-brand/)
})

test('SettingsClient deactivate modal follows theme while keeping destructive intent', () => {
  // Scope assertions to the Deactivate Account Modal section only.
  const modal = settingsClient.slice(
    settingsClient.indexOf('{/* Deactivate Account Modal */}'),
    settingsClient.indexOf('{/* Avatar Cropper Modal */}'),
  )
  // Overlay (Human QA Fix1): fixed 80% warm near-black backdrop — NOT the
  // global bg-overlay token, whose Light alpha (0.45) read as too faded.
  assert.match(modal, /absolute inset-0 bg-\[rgba\(10,7,4,0\.8\)\] backdrop-blur-sm/)
  assert.doesNotMatch(modal, /bg-overlay/)
  // Warning heading (Human QA Fix1): semantic destructive token for readable
  // Light-mode red (Light #b3261e ≈ 5.9:1 on the white panel; Dark #ef4444).
  assert.match(modal, /flex items-center gap-3 text-destructive mb-4/)
  assert.doesNotMatch(modal, /text-red-400/)
  // Panel: semantic card surface, destructive red border preserved.
  assert.match(modal, /relative bg-card border border-red-900\/50 rounded-2xl/)
  assert.match(modal, /text-muted-foreground hover:text-foreground transition-colors/)
  assert.match(modal, /text-foreground mb-4/)
  assert.match(modal, /list-disc list-inside space-y-2 text-muted-foreground/)
  // Destructive confirm button unchanged.
  assert.match(modal, /bg-red-500 hover:bg-red-600 text-white rounded-xl/)
  // Interaction wiring untouched.
  assert.match(modal, /onClick=\{\(\) => !isDeactivating && setIsDeactivateModalOpen\(false\)\}/)
  assert.match(modal, /disabled=\{isDeactivating\}/)
  // Danger zone keeps its intentional red styling (separate section).
  const dangerZone = settingsClient.slice(
    settingsClient.indexOf('{/* Section 4: Danger Zone */}'),
    settingsClient.indexOf('{/* Deactivate Account Modal */}'),
  )
  assert.match(dangerZone, /bg-\[#2A0808\]\/30 border border-red-900\/30/)
  assert.match(dangerZone, /text-red-400 flex items-center gap-2/)
})

test('SettingsClient preserves the submit button contract (.btn-primary) and all behavior', () => {
  assert.match(settingsClient, /className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"/)
  // Behavior: form submit → server action, avatar flow, deactivation flow.
  assert.match(settingsClient, /const result = await updateProfile\(formData\)/)
  assert.match(settingsClient, /await deactivateAccount\(\)/)
  assert.match(settingsClient, /await supabase\.auth\.signOut\(\)/)
  assert.match(settingsClient, /router\.push\('\/'\)/)
  // 4 MB avatar limit and FileReader pipeline untouched.
  assert.match(settingsClient, /file\.size > 4 \* 1024 \* 1024/)
  assert.match(settingsClient, /ไฟล์รูปภาพต้องมีขนาดไม่เกิน 4 MB/)
  assert.match(settingsClient, /new FileReader\(\)/)
  assert.match(settingsClient, /reader\.readAsDataURL\(file\)/)
  // Avatar upload: webp to avatars bucket with cache-busting profile update.
  assert.match(settingsClient, /\.from\('avatars'\)/)
  assert.match(settingsClient, /contentType: 'image\/webp'/)
  assert.match(settingsClient, /upsert: true/)
  assert.match(settingsClient, /const cacheBustedUrl = `\$\{publicUrl\}\?v=\$\{Date\.now\(\)\}`/)
  assert.match(settingsClient, /\.update\(\{ avatar_url: cacheBustedUrl \}\)/)
  // Password-reset email action unchanged.
  assert.match(settingsClient, /resetPasswordForEmail\(profile\.email, \{/)
  assert.match(settingsClient, /redirectTo: `\$\{window\.location\.origin\}\/reset-password`,/)
})

// ---------------------------------------------------------------------------
// D. AvatarCropper — themed chrome, fixed-Dark canvas
// ---------------------------------------------------------------------------

test('AvatarCropper modal chrome is themed', () => {
  assert.match(avatarCropper, /absolute inset-0 bg-overlay backdrop-blur-sm/)
  assert.match(avatarCropper, /bg-card border border-brand\/15 rounded-3xl/)
  assert.match(avatarCropper, /border-b border-border-subtle/)
  assert.match(avatarCropper, /font-bold text-foreground">ปรับขนาดรูปโปรไฟล์/)
  assert.match(avatarCropper, /text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-hover/)
  assert.match(avatarCropper, /p-6 bg-card/)
  assert.match(avatarCropper, /text-muted-foreground hover:text-brand/)
  // Zoom slider: semantic track + accent, dark values exact-equivalent.
  assert.match(avatarCropper, /bg-border-subtle rounded-lg appearance-none cursor-pointer accent-brand/)
  // Cancel: ghost mapping; Save: brand fill with text-on-brand token.
  assert.match(avatarCropper, /rounded-xl font-medium text-foreground bg-hover hover:bg-hover-strong/)
  assert.match(avatarCropper, /font-bold text-brand-foreground bg-brand-solid hover:bg-\[#F1D17A\]/)
  assert.doesNotMatch(avatarCropper, /bg-\[#1A140E\]|text-\[#F5E9D6\]|text-\[#A1866B\]|text-\[#D4AF37\]|rgba\(255,255,255,0\.1\)/)
})

test('AvatarCropper crop canvas remains intentionally fixed Dark and crop behavior is untouched', () => {
  // The canvas MUST keep its literal Dark surface (line ~73) — never themed.
  assert.match(avatarCropper, /relative w-full h-\[300px\] sm:h-\[400px\] bg-\[#0F0B07\]/)
  // react-easy-crop geometry and processing untouched.
  assert.match(avatarCropper, /cropShape="round"/)
  assert.match(avatarCropper, /aspect=\{1\}/)
  assert.match(avatarCropper, /showGrid=\{false\}/)
  assert.match(avatarCropper, /await getCroppedImg\(imageSrc, croppedAreaPixels\)/)
  assert.match(avatarCropper, /onSave\(croppedImageBlob\)/)
  // Zoom bounds unchanged.
  assert.match(avatarCropper, /Math\.max\(1, zoom - 0\.1\)/)
  assert.match(avatarCropper, /Math\.min\(3, zoom \+ 0\.1\)/)
  assert.match(avatarCropper, /min=\{1\}[\s\S]*?max=\{3\}[\s\S]*?step=\{0\.1\}/)
})

// ---------------------------------------------------------------------------
// E. Reset password — theme-aware form
// ---------------------------------------------------------------------------

test('Reset password page shell, card and form use semantic tokens', () => {
  assert.match(resetPassword, /min-h-screen bg-background text-foreground/)
  assert.match(resetPassword, /bg-card border border-brand\/15 rounded-3xl/)
  assert.match(resetPassword, /font-display text-foreground mb-2/)
  assert.match(resetPassword, /text-sm text-muted-foreground/)
  assert.match(resetPassword, /font-medium text-muted-foreground mb-1\.5 uppercase/)
  assert.match(resetPassword, /w-full bg-input border border-border-subtle rounded-xl pl-4 pr-12 py-3\.5 text-foreground placeholder:text-muted-foreground\/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/)
  // Old input ring was full-opacity gold — preserved exactly via focus:ring-brand.
  assert.match(resetPassword, /text-muted-foreground hover:text-brand transition-colors/)
  assert.match(resetPassword, /focus-visible:ring-2 focus-visible:ring-brand rounded-xl/)
  assert.match(resetPassword, /bg-brand-solid hover:bg-\[#F1D17A\] text-brand-foreground font-bold/)
  assert.doesNotMatch(resetPassword, /bg-\[#0F0B07\]|bg-\[#1A140E\]|text-\[#F5E9D6\]|text-\[#A1866B\]|placeholder-\[#A1866B\]/)
})

test('Reset password recovery flow and constraints are untouched', () => {
  assert.match(resetPassword, /await supabase\.auth\.updateUser\(\{[\s\S]*?password: password[\s\S]*?\}\)/)
  assert.match(resetPassword, /router\.push\('\/login'\)/)
  assert.match(resetPassword, /required/)
  assert.match(resetPassword, /minLength=\{6\}/)
  assert.match(resetPassword, /disabled=\{loading \|\| password\.length < 6\}/)
  assert.match(resetPassword, /showPassword \? 'text' : 'password'/)
  // Intentional brand glow decoration preserved.
  assert.match(resetPassword, /bg-\[#D4AF37\] opacity-\[0\.03\] blur-\[50px\]/)
})

// ---------------------------------------------------------------------------
// Token pins for the values newly consumed by Wave 2A
// ---------------------------------------------------------------------------

test('tokens consumed by Wave 2A keep verified dark values with light overrides', () => {
  // Input surface + overlay (new in this wave).
  assert.match(globalsCss, /--input: #0f0b07;/)
  assert.match(globalsCss, /--input: #fffdf8;/)
  assert.match(globalsCss, /--overlay: rgba\(10, 7, 4, 0\.78\);/)
  assert.match(globalsCss, /--overlay: rgba\(43, 30, 18, 0\.45\);/)
  // Core roles (same pins as Wave 1 — still true).
  assert.match(globalsCss, /--background: #0f0b07;/)
  assert.match(globalsCss, /--foreground: #f5e9d6;/)
  assert.match(globalsCss, /--card: #1a140e;/)
  assert.match(globalsCss, /--muted-foreground: #a1866b;/)
  assert.match(globalsCss, /--brand: #d4af37;/)
  assert.match(globalsCss, /--brand-foreground: #1a140e;/)
  // Destructive token consumed by the Deactivate Modal warning heading (Fix1).
  assert.match(globalsCss, /--destructive: #ef4444;/)
  assert.match(globalsCss, /--destructive: #b3261e;/)
  assert.match(globalsCss, /--color-destructive: var\(--destructive\);/)
})

// ---------------------------------------------------------------------------
// F/G/H. Scope safety — AuthModal untouched, no dangerous changes
// ---------------------------------------------------------------------------

test('AuthModal keeps its own themed implementation (not part of Wave 2A)', () => {
  // The modal already followed tokens before this wave; it must remain so and
  // must not have gained Wave 2A churn markers (e.g. un-themed old literals
  // would indicate it was edited the wrong way).
  assert.doesNotMatch(authModal, /bg-\[#1A140E\]|text-\[#A1866B\]/)
  assert.match(authModal, /export default function AuthModal|function AuthModal/)
})
