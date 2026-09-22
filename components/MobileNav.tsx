'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { usePathname } from 'next/navigation'
import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarCheck2,
  ChevronRight,
  CircleHelp,
  FileText,
  Heart,
  Home,
  Info,
  LibraryBig,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Newspaper,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { trackDailyNavClick } from '@/lib/analytics'
import type { SupportConfig } from '@/lib/homepageConfig'
import NotificationBell, { type NotificationCenterState } from './NotificationBell'
import SupportModal from './SupportModal'

const BOTTOM_NAV_LINKS = [
  { href: '/', label: 'หน้าแรก', key: 'home', icon: Home },
  { href: '/packages', label: 'คลังข้อสอบ', key: 'packages', icon: LibraryBig },
  { href: '/daily', label: 'ฝึกทุกวัน', key: 'daily', icon: CalendarCheck2 },
  { href: '/exams', label: 'ของฉัน', key: 'mine', icon: UserRound },
] as const

const DISCOVERY_LINKS = [
  { href: '/news', label: 'ข่าวสาร', icon: Newspaper },
  { href: '/articles', label: 'บทความ', icon: BookOpenText },
  { href: '/positions', label: 'ตำแหน่งงานราชการ', icon: BriefcaseBusiness },
] as const

const HELP_LINKS = [
  { href: '/help', label: 'วิธีใช้งาน', icon: BookOpenText },
  { href: '/faq', label: 'คำถามที่พบบ่อย', icon: CircleHelp },
  { href: '/contact', label: 'ติดต่อเรา', icon: Mail },
  { href: '/about', label: 'เกี่ยวกับเรา', icon: Info },
] as const

const LEGACY_NAV_LINKS = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/packages', label: 'แพ็กเกจ' },
  { href: '/news', label: 'ข่าวสาร' },
  { href: '/daily', label: 'ฝึกทุกวัน' },
  { href: '/exams', label: 'แดชบอร์ด' },
  { href: '/articles', label: 'บทความ' },
] as const

const POLICY_LINKS = [
  { href: '/terms', label: 'เงื่อนไขการให้บริการ' },
  { href: '/privacy', label: 'ความเป็นส่วนตัว' },
  { href: '/cookies', label: 'คุกกี้' },
] as const

const MORE_SECTION_PREFIXES = [
  '/news',
  '/articles',
  '/positions',
  '/help',
  '/faq',
  '/contact',
  '/about',
  '/terms',
  '/privacy',
  '/cookies',
]

const MY_AREA_PREFIXES = ['/exams', '/my-packages', '/orders', '/settings', '/notifications']

interface MobileNavProps {
  user: User | null
  isAdmin: boolean
  avatarUrl?: string | null
  onLoginClick: () => void
  onRegisterClick: () => void
  onSignOut: () => void
  notifications: NotificationCenterState
  supportConfig: SupportConfig
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') return false
    if (element.getAttribute('aria-hidden') === 'true') return false

    const styles = window.getComputedStyle(element)
    return styles.display !== 'none' && styles.visibility !== 'hidden' && element.getClientRects().length > 0
  })
}

/**
 * Keep immersive assessment surfaces free from the normal-site chrome. The
 * dashboard at /exams remains available as the mobile "ของฉัน" destination;
 * only active/review assessment surfaces are excluded.
 */
function isMobileNavExcludedPath(pathname: string) {
  const excludedPrefixes = ['/admin', '/login', '/register', '/auth', '/api', '/reset-password']
  if (excludedPrefixes.some((prefix) => matchesPrefix(pathname, prefix))) return true

  return [
    /^\/package\/[^/]+\/(?:exam|written-exam)(?:\/|$)/,
    /^\/exams\/attempts(?:\/|$)/,
    /^\/assessment(?:\/|$)/,
  ].some((pattern) => pattern.test(pathname))
}

function isSectionActive(pathname: string, href: (typeof BOTTOM_NAV_LINKS)[number]['href']) {
  if (href === '/') return pathname === '/'
  if (href === '/packages') {
    return matchesPrefix(pathname, '/packages') || matchesPrefix(pathname, '/package')
  }
  if (href === '/daily') return matchesPrefix(pathname, '/daily')
  return MY_AREA_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

function isMoreSectionActive(pathname: string) {
  return MORE_SECTION_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

export default function MobileNav({
  user,
  isAdmin,
  avatarUrl,
  onLoginClick,
  onRegisterClick,
  onSignOut,
  notifications,
  supportConfig,
}: MobileNavProps) {
  const pathname = usePathname() || '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const [legacyMenuOpen, setLegacyMenuOpen] = useState(false)
  const [supportModalOpen, setSupportModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreCloseButtonRef = useRef<HTMLButtonElement>(null)
  const moreSheetRef = useRef<HTMLElement>(null)
  const legacyMenuButtonRef = useRef<HTMLButtonElement>(null)
  const moreFocusRestoreFrameRef = useRef<number | null>(null)
  const supportHandoffFrameRef = useRef<number | null>(null)
  const isExcluded = isMobileNavExcludedPath(pathname)

  const restoreMoreTriggerFocus = () => {
    if (moreFocusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(moreFocusRestoreFrameRef.current)
    }

    moreFocusRestoreFrameRef.current = window.requestAnimationFrame(() => {
      moreFocusRestoreFrameRef.current = null
      moreButtonRef.current?.focus()
    })
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const bodyClass = 'has-mobile-bottom-nav'
    if (isExcluded) {
      document.body.classList.remove(bodyClass)
    } else {
      document.body.classList.add(bodyClass)
    }

    return () => document.body.classList.remove(bodyClass)
  }, [isExcluded])

  useEffect(() => {
    setMenuOpen(false)
    setLegacyMenuOpen(false)
    if (moreFocusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(moreFocusRestoreFrameRef.current)
      moreFocusRestoreFrameRef.current = null
    }
    if (supportHandoffFrameRef.current !== null) {
      window.cancelAnimationFrame(supportHandoffFrameRef.current)
      supportHandoffFrameRef.current = null
    }
  }, [pathname])

  useEffect(() => {
    const anyMenuOpen = menuOpen || legacyMenuOpen
    if (!anyMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [legacyMenuOpen, menuOpen])

  useEffect(() => {
    if (!menuOpen && !legacyMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (menuOpen) {
          closeMenu()
        } else if (legacyMenuOpen) {
          setLegacyMenuOpen(false)
          legacyMenuButtonRef.current?.focus()
        }
        event.preventDefault()
        return
      }

      if (!menuOpen || supportModalOpen || event.key !== 'Tab') return

      const sheet = moreSheetRef.current
      if (!sheet) return

      const focusableElements = getFocusableElements(sheet)
      if (focusableElements.length === 0) {
        event.preventDefault()
        sheet.focus()
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!sheet.contains(activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? lastFocusable : firstFocusable
        target.focus()
        return
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [legacyMenuOpen, menuOpen, supportModalOpen])

  useEffect(() => {
    if (!menuOpen || !mounted || supportModalOpen) return

    const frame = window.requestAnimationFrame(() => {
      moreCloseButtonRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [menuOpen, mounted, supportModalOpen])

  useEffect(() => {
    if (!menuOpen || !mounted || supportModalOpen) return

    const sheet = moreSheetRef.current
    if (!sheet) return

    const backdrop = document.querySelector<HTMLElement>('.mobile-more-backdrop')
    const ownedInertElements = new Map<HTMLElement, string | null>()

    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child === sheet || child === backdrop) continue
      if (child.matches('script, style')) continue

      const containsActiveDialog = child.matches('[role="dialog"][aria-modal="true"]')
        || Boolean(child.querySelector('[role="dialog"][aria-modal="true"]'))
      if (containsActiveDialog || child.hasAttribute('inert')) continue

      ownedInertElements.set(child, child.getAttribute('inert'))
      child.setAttribute('inert', '')
    }

    return () => {
      for (const [element, previousValue] of ownedInertElements) {
        if (!element.isConnected || element.getAttribute('inert') !== '') continue
        if (previousValue === null) {
          element.removeAttribute('inert')
        } else {
          element.setAttribute('inert', previousValue)
        }
      }
    }
  }, [menuOpen, mounted, supportModalOpen])

  useEffect(() => {
    if (!menuOpen || !mounted || supportModalOpen) return

    const handleFocusIn = (event: FocusEvent) => {
      const sheet = moreSheetRef.current
      if (!sheet) return

      const target = event.target
      if (target instanceof Node && sheet.contains(target)) return

      const focusTarget = moreCloseButtonRef.current || getFocusableElements(sheet)[0]
      focusTarget?.focus()
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [menuOpen, mounted, supportModalOpen])

  useEffect(() => {
    return () => {
      if (moreFocusRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(moreFocusRestoreFrameRef.current)
      }
      if (supportHandoffFrameRef.current !== null) {
        window.cancelAnimationFrame(supportHandoffFrameRef.current)
      }
    }
  }, [])

  const closeMenu = () => {
    setMenuOpen(false)
    restoreMoreTriggerFocus()
  }

  const closeLegacyMenu = () => {
    setLegacyMenuOpen(false)
    legacyMenuButtonRef.current?.focus()
  }

  const openSupportModal = () => {
    setMenuOpen(false)
    supportHandoffFrameRef.current = window.requestAnimationFrame(() => {
      supportHandoffFrameRef.current = null
      moreButtonRef.current?.focus()
      setSupportModalOpen(true)
    })
  }

  const handleNavClick = (href: string) => {
    if (href === '/daily') {
      try {
        trackDailyNavClick()
      } catch {}
    }
    setMenuOpen(false)
  }

  const handleSignOutClick = () => {
    setMenuOpen(false)
    onSignOut()
  }

  const moreIsActive = isMoreSectionActive(pathname) || menuOpen

  return (
    <>
      <nav aria-label="ส่วนหัว Sobdai" className="w-full px-5 h-[72px] flex items-center justify-between">
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-3 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg p-1 -ml-1"
        >
          <Image
            src="/logo.png"
            alt="Sobdai Logo"
            width={32}
            height={32}
            className="rounded-lg shadow-sm group-hover:shadow-[0_2px_8px_rgba(212,175,55,0.3)] transition-all"
          />
          <span className="font-display text-xl text-[#F5E9D6] tracking-wide">Sobdai</span>
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell active={Boolean(user)} center={notifications} />
          {isExcluded && (
            <button
              ref={legacyMenuButtonRef}
              type="button"
              onClick={() => setLegacyMenuOpen(true)}
              aria-label={legacyMenuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
              aria-expanded={legacyMenuOpen}
              className="relative z-[60] flex h-10 w-10 items-center justify-center rounded-full text-[#F5E9D6] transition-colors hover:text-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            >
              <Menu size={22} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </nav>

      {!isExcluded && (
        <nav aria-label="เมนูหลักสำหรับมือถือ" className="mobile-bottom-nav lg:hidden">
          {BOTTOM_NAV_LINKS.map((item) => {
            const Icon = item.icon
            const active = isSectionActive(pathname, item.href)
            const isDaily = item.key === 'daily'

            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch={item.href === '/daily' ? false : undefined}
                onClick={() => handleNavClick(item.href)}
                aria-current={active ? 'page' : undefined}
                className={`mobile-bottom-nav__item ${active ? 'mobile-bottom-nav__item--active' : ''} ${isDaily ? 'mobile-bottom-nav__item--daily' : ''}`}
              >
                <span className="mobile-bottom-nav__icon" aria-hidden="true">
                  <Icon size={isDaily ? 21 : 20} strokeWidth={active || isDaily ? 2.1 : 1.8} />
                </span>
                <span className="mobile-bottom-nav__label">{item.label}</span>
              </Link>
            )
          })}

          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={`mobile-bottom-nav__item ${moreIsActive ? 'mobile-bottom-nav__item--active' : ''}`}
          >
            <span className="mobile-bottom-nav__icon" aria-hidden="true">
              <Menu size={20} strokeWidth={moreIsActive ? 2.1 : 1.8} />
            </span>
            <span className="mobile-bottom-nav__label">เพิ่มเติม</span>
          </button>
        </nav>
      )}

      {mounted && !isExcluded && menuOpen && createPortal(
        <>
          <div
            className="mobile-more-backdrop"
            onClick={closeMenu}
            aria-hidden="true"
          />

          <section
            ref={moreSheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            className="mobile-more-sheet"
          >
            <div className="mobile-more-sheet__handle" aria-hidden="true" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A1866B]">เมนูรอง</p>
                <h2 id="mobile-more-title" className="mt-1 font-display text-2xl font-semibold text-[#F5E9D6]">
                  เพิ่มเติม
                </h2>
              </div>
              <button
                ref={moreCloseButtonRef}
                id="mobile-more-close"
                type="button"
                onClick={closeMenu}
                aria-label="ปิดเมนูเพิ่มเติม"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#A1866B] transition-colors hover:text-[#F5E9D6] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                <X size={19} strokeWidth={1.8} />
              </button>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold tracking-wide text-[#A1866B]">สำรวจ</p>
              <div className="grid grid-cols-2 gap-2">
                {DISCOVERY_LINKS.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMenu}
                      className="group flex min-h-12 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5 text-sm font-medium text-[#F5E9D6] transition-colors hover:border-[rgba(212,175,55,0.32)] hover:bg-[rgba(212,175,55,0.07)] hover:text-[#F1D17A] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                    >
                      <Icon size={16} strokeWidth={1.8} className="shrink-0 text-[#D4AF37]" aria-hidden="true" />
                      <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
                      <ChevronRight size={14} className="shrink-0 text-[#6D5943] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 border-t border-[rgba(255,255,255,0.07)] pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wide text-[#A1866B]">ช่วยเหลือ</p>
              <div className="grid grid-cols-2 gap-2">
                {HELP_LINKS.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMenu}
                      className="group flex min-h-12 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5 text-sm font-medium text-[#F5E9D6] transition-colors hover:border-[rgba(212,175,55,0.32)] hover:bg-[rgba(212,175,55,0.07)] hover:text-[#F1D17A] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                    >
                      <Icon size={16} strokeWidth={1.8} className="shrink-0 text-[#D4AF37]" aria-hidden="true" />
                      <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
                      <ChevronRight size={14} className="shrink-0 text-[#6D5943] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 border-t border-[rgba(255,255,255,0.07)] pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wide text-[#A1866B]">บัญชี / การใช้งาน</p>
              {supportConfig.enabled && (
                <button
                  type="button"
                  onClick={openSupportModal}
                  className="group mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[rgba(212,175,55,0.14)] bg-[rgba(212,175,55,0.035)] px-3 py-2 text-left text-sm text-[#A1866B] transition-colors hover:border-[rgba(212,175,55,0.3)] hover:bg-[rgba(212,175,55,0.07)] hover:text-[#F5E9D6] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                >
                  <Heart size={16} strokeWidth={1.8} className="shrink-0 text-[#D4AF37]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">สนับสนุน Sobdai</span>
                  <ChevronRight size={14} className="shrink-0 text-[#6D5943] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              )}
              <div className="mt-3">
              {user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="รูปโปรไฟล์"
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-full border border-[#D4AF37]/30 object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#1A140E] text-sm font-bold text-[#D4AF37]">
                        {user.email?.charAt(0).toUpperCase() || 'S'}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm text-[#F5E9D6]">{user.email || 'บัญชีของฉัน'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/settings"
                      onClick={closeMenu}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.07)] px-3 py-2 text-sm text-[#F5E9D6] transition-colors hover:border-[rgba(212,175,55,0.3)] hover:text-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                    >
                      <Settings2 size={16} aria-hidden="true" />
                      <span>โปรไฟล์</span>
                    </Link>
                    <Link
                      href="/orders"
                      onClick={closeMenu}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.07)] px-3 py-2 text-sm text-[#F5E9D6] transition-colors hover:border-[rgba(212,175,55,0.3)] hover:text-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                    >
                      <FileText size={16} aria-hidden="true" />
                      <span>ประวัติการสั่งซื้อ</span>
                    </Link>
                  </div>

                  <Link
                    href="/my-packages"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.07)] px-3 py-2 text-sm text-[#F5E9D6] transition-colors hover:border-[rgba(212,175,55,0.3)] hover:text-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  >
                    <LibraryBig size={16} aria-hidden="true" />
                    <span>แพ็กเกจของฉัน</span>
                  </Link>

                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={closeMenu}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] px-3 py-2 text-sm font-medium text-[#D4AF37] transition-colors hover:bg-[rgba(212,175,55,0.1)] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      <span>จัดการระบบ</span>
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={handleSignOutClick}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-[rgba(239,68,68,0.16)] px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-400/10 focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    <LogOut size={16} aria-hidden="true" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { closeMenu(); onLoginClick() }}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(255,255,255,0.1)] px-3 py-2 text-sm font-medium text-[#F5E9D6] transition-colors hover:border-[rgba(212,175,55,0.32)] hover:text-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  >
                    <LogIn size={16} aria-hidden="true" />
                    <span>เข้าสู่ระบบ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { closeMenu(); onRegisterClick() }}
                    className="flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B38F24] px-3 py-2 text-sm font-bold text-[#0F0B07] shadow-lg shadow-[#D4AF37]/15 transition-all hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#140F0A]"
                  >
                    สมัครสมาชิกฟรี
                  </button>
                </div>
              )}
              </div>
            </div>

            <div className="mt-5 border-t border-[rgba(255,255,255,0.07)] pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wide text-[#A1866B]">กฎหมายและความเป็นส่วนตัว</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {POLICY_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className="text-xs text-[#A1866B] underline decoration-[rgba(212,175,55,0.25)] underline-offset-4 transition-colors hover:text-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>,
        document.body,
      )}

      <SupportModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        title={supportConfig.title}
        description={supportConfig.description}
        qr_image_url={supportConfig.qr_image_url}
        promptpay_name={supportConfig.promptpay_name}
        bank_name={supportConfig.bank_name}
        account_number={supportConfig.account_number}
        footer_message={supportConfig.footer_message}
      />

      {mounted && isExcluded && legacyMenuOpen && createPortal(
        <>
          <div
            className="fixed inset-0 z-[55] bg-[#0F0B07]/80 backdrop-blur-md"
            onClick={closeLegacyMenu}
            aria-hidden="true"
          />

          <aside
            className="fixed inset-y-0 right-0 z-[56] flex w-[85vw] max-w-sm flex-col border-l border-[rgba(255,255,255,0.05)] bg-[#140F0A] p-6 shadow-2xl"
            aria-label="เมนูนำทาง"
          >
            <div className="flex-1 overflow-y-auto pb-6 pt-16">
              {user && (
                <div className="mb-6 flex items-center gap-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-4">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="รูปโปรไฟล์"
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-full border border-[#D4AF37]/30 object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#1A140E] text-lg font-bold text-[#D4AF37]">
                      {user.email?.charAt(0).toUpperCase() || 'S'}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm text-[#A1866B]">ยินดีต้อนรับ</span>
                    <span className="truncate text-base font-medium text-[#F5E9D6]">{user.email}</span>
                  </div>
                </div>
              )}

              <nav aria-label="เมนูหลัก" className="flex flex-col gap-1">
                <span className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-[#A1866B]">เมนูหลัก</span>
                {LEGACY_NAV_LINKS.map((link) => {
                  const active = link.href === '/' ? pathname === '/' : matchesPrefix(pathname, link.href)
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={link.href === '/daily' ? false : undefined}
                      onClick={() => {
                        if (link.href === '/daily') {
                          try {
                            trackDailyNavClick()
                          } catch {}
                        }
                        closeLegacyMenu()
                      }}
                      className={`rounded-lg px-4 py-3 text-base font-medium transition-colors ${active ? 'bg-[rgba(212,175,55,0.08)] text-[#D4AF37]' : 'text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)]'}`}
                    >
                      {link.label}
                    </Link>
                  )
                })}
              </nav>

              {user && (
                <div className="mt-6 flex flex-col gap-1 border-t border-[rgba(255,255,255,0.05)] pt-6">
                  <span className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-[#A1866B]">บัญชีของฉัน</span>
                  <Link href="/settings" onClick={closeLegacyMenu} className="rounded-lg px-4 py-3 text-base font-medium text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)]">
                    โปรไฟล์
                  </Link>
                  <Link href="/my-packages" onClick={closeLegacyMenu} className="rounded-lg px-4 py-3 text-base font-medium text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)]">
                    แพ็กเกจของฉัน
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={closeLegacyMenu} className="mt-2 rounded-lg border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.05)] px-4 py-3 text-base font-medium text-[#D4AF37] hover:bg-[rgba(212,175,55,0.1)]">
                      จัดการระบบ
                    </Link>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-[rgba(255,255,255,0.05)] pb-safe pt-6">
              {user ? (
                <button
                  type="button"
                  onClick={() => { closeLegacyMenu(); onSignOut() }}
                  className="w-full rounded-lg px-4 py-3 text-left text-base font-medium text-red-400 transition-colors hover:bg-red-400/10"
                >
                  ออกจากระบบ
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => { closeLegacyMenu(); onLoginClick() }}
                    className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-base font-medium text-[#F5E9D6]"
                  >
                    เข้าสู่ระบบ
                  </button>
                  <button
                    type="button"
                    onClick={() => { closeLegacyMenu(); onRegisterClick() }}
                    className="w-full rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#B38F24] px-4 py-3 text-base font-bold text-[#0F0B07] shadow-lg shadow-[#D4AF37]/20"
                  >
                    สมัครสมาชิกฟรี
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  )
}
