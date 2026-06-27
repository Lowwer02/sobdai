'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'

function BookOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

const NAV_LINKS = [
  { href: '/quiz', label: 'ทำข้อสอบ' },
  { href: '/exams', label: 'ชุดข้อสอบ' },
  { href: '/about', label: 'เกี่ยวกับ' },
]

interface MobileNavProps {
  user: User | null
  isAdmin: boolean
  onLoginClick: () => void
  onRegisterClick: () => void
  onSignOut: () => void
}

export default function MobileNav({ user, isAdmin, onLoginClick, onRegisterClick, onSignOut }: MobileNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Mobile Menu Accessiblity
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSignOutClick = () => {
    onSignOut()
    setMenuOpen(false)
  }

  return (
    <>
      <nav
        style={{
          width: '100%',
          padding: '0 20px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-muted) 100%)',
              color: '#1a1208',
            }}
          >
            <BookOpenIcon />
          </span>
          <span
            className="font-display"
            style={{
              fontSize: '20px',
              color: 'var(--text-primary)',
              fontWeight: 'normal',
              letterSpacing: '0.04em',
            }}
          >
            สอบได้
          </span>
        </Link>

        {/* Hamburger */}
        <button
          className="btn-ghost relative z-[60]"
          style={{ padding: '6px' }}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <XIcon /> : <MenuIcon />}
        </button>
      </nav>

      {/* Render Backdrop and Bottom Sheet at body level to escape navbar's backdrop-filter containing block */}
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className={`fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Bottom Sheet */}
          <div 
            className={`fixed bottom-0 left-0 w-full z-[55] bg-[#1A140E] border-t border-[rgba(212,175,55,0.15)] rounded-t-[32px] p-6 pb-12 transition-transform duration-300 ease-in-out flex flex-col gap-2 ${menuOpen ? 'translate-y-0 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] pointer-events-auto' : 'translate-y-full pointer-events-none'}`}
            role="dialog"
            aria-label="เมนูนำทาง"
          >
            <div className="w-12 h-1.5 bg-[#F5E9D6]/10 rounded-full mx-auto mb-6" />

            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="p-3 text-[16px] text-[#F5E9D6] font-medium font-display rounded-xl hover:bg-[rgba(212,175,55,0.1)] transition-colors"
            >
              หน้าแรก
            </Link>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="p-3 text-[16px] text-[#F5E9D6] font-medium font-display rounded-xl hover:bg-[rgba(212,175,55,0.1)] transition-colors"
              >
                {link.label}
              </Link>
            ))}
            
            <div className="divider my-2 opacity-50" />

            {user ? (
              <div className="flex flex-col gap-2 mt-2">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 pb-2 text-[13px] text-[#A1866B] hover:text-[#D4AF37] font-medium transition-colors block"
                >
                  ลงชื่อเข้าใช้ในชื่อ: {user.email}
                </Link>
                {isAdmin && (
                  <Link 
                    href="/admin" 
                    onClick={() => setMenuOpen(false)}
                    className="p-3 text-[16px] text-[#D4AF37] font-medium font-display rounded-xl bg-[rgba(212,175,55,0.05)] border border-[rgba(212,175,55,0.2)] hover:bg-[rgba(212,175,55,0.1)] transition-colors"
                  >
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={handleSignOutClick}
                  className="p-3 text-[16px] text-[#e8786a] font-medium font-display rounded-xl text-left hover:bg-[rgba(192,57,43,0.1)] transition-colors flex items-center gap-2"
                >
                  <LogOutIcon /> ออกจากระบบ
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-2 pb-safe">
                <button
                  onClick={() => { setMenuOpen(false); onLoginClick(); }}
                  className="w-full btn-outline py-3 text-[16px] flex justify-center"
                >
                  เข้าสู่ระบบ
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onRegisterClick(); }}
                  className="w-full btn-primary py-3 text-[16px] flex justify-center text-[#1A140E]"
                >
                  สมัครสมาชิกฟรี
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
