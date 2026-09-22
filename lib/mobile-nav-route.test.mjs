import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  getActiveMobilePrimaryHref,
  normalizeMobilePathname,
  shouldShowMobileBottomNav,
} from './mobile-nav-route.ts'

const mobileNavSource = readFileSync(fileURLToPath(new URL('../components/MobileNav.tsx', import.meta.url)), 'utf8')

test('direct initial path selects exactly one primary destination, independent of navigation history', () => {
  const primaryHrefs = ['/', '/packages', '/daily', '/exams']
  const cases = [
    ['/', '/'],
    ['///', '/'],
    ['/packages', '/packages'],
    ['/packages/sample', '/packages'],
    ['/daily', '/daily'],
    ['/exams', '/exams'],
    ['/news', null],
  ]

  for (const [pathname, expected] of cases) {
    assert.equal(getActiveMobilePrimaryHref(pathname), expected, pathname)
    assert.equal(primaryHrefs.filter((href) => getActiveMobilePrimaryHref(pathname) === href).length, expected ? 1 : 0)
  }
  assert.equal(normalizeMobilePathname('/'), '/')
  assert.equal(normalizeMobilePathname('/packages/'), '/packages')
})

test('consent and preferences take precedence only on eligible bottom-nav routes', () => {
  assert.equal(shouldShowMobileBottomNav(false, 'loading', false), false)
  assert.equal(shouldShowMobileBottomNav(false, 'undecided', false), false)
  assert.equal(shouldShowMobileBottomNav(false, 'accepted', true), false)
  assert.equal(shouldShowMobileBottomNav(false, 'rejected', true), false)
  assert.equal(shouldShowMobileBottomNav(false, 'accepted', false), true)
  assert.equal(shouldShowMobileBottomNav(false, 'rejected', false), true)
  assert.equal(shouldShowMobileBottomNav(true, 'accepted', false), false)
  assert.match(mobileNavSource, /useConsent\(\)/)
  assert.match(mobileNavSource, /\{showBottomNav && \(\s*<nav aria-label="เมนูหลักสำหรับมือถือ"/)
})

test('guest header CTA uses existing auth flow while authenticated bell and excluded hamburger remain', () => {
  assert.match(mobileNavSource, /<NotificationBell active=\{Boolean\(user\)\} center=\{notifications\} \/>/)
  assert.match(mobileNavSource, /\{!user && !isExcluded && \([\s\S]*?onClick=\{onLoginClick\}[\s\S]*?เข้าสู่ระบบ \/ สมัคร/)
  assert.match(mobileNavSource, /\{isExcluded && \([\s\S]*?ref=\{legacyMenuButtonRef\}[\s\S]*?<Menu size=\{22\}/)
  assert.match(mobileNavSource, /\{mounted && isExcluded && legacyMenuOpen && createPortal\(/)
  assert.match(mobileNavSource, /if \(event\.key === 'Escape'\)/)
})

test('More omits guest auth pair but retains support, account, logout and secondary sections', () => {
  const moreStart = mobileNavSource.indexOf('{mounted && showBottomNav && menuOpen && createPortal(')
  const moreEnd = mobileNavSource.indexOf('<SupportModal', moreStart)
  assert.ok(moreStart >= 0 && moreEnd > moreStart)
  const more = mobileNavSource.slice(moreStart, moreEnd)
  assert.doesNotMatch(more, /onLoginClick|onRegisterClick|สมัครสมาชิกฟรี/)
  for (const text of ['สำรวจ', 'ช่วยเหลือ', 'สนับสนุน Sobdai', 'กฎหมายและความเป็นส่วนตัว', 'ออกจากระบบ']) {
    assert.ok(more.includes(text), text)
  }
  assert.match(more, /\{user && \([\s\S]*?href="\/settings"[\s\S]*?handleSignOutClick/)
})
