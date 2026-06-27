'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import AuthModal from './AuthModal'

// SVG Icons (ไม่มี emoji)
function BookOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
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

function ShoppingBagIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
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

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  
  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  
  const supabase = createClient()

  useEffect(() => {
    const fetchUserAndRole = async (sessionUser: User | null) => {
      setUser(sessionUser)
      if (sessionUser) {
        const { data } = await supabase.from('profiles').select('role').eq('id', sessionUser.id).single()
        setIsAdmin(data?.role === 'admin')
      } else {
        setIsAdmin(false)
      }
    }

    supabase.auth.getUser().then(({ data }) => fetchUserAndRole(data.user))
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchUserAndRole(session?.user ?? null)
      if (session?.user) {
        setIsAuthModalOpen(false) // Close modal on successful auth
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
  }

  return (
    <header
      className="navbar"
      style={{
        background: scrolled ? 'rgba(15, 11, 8, 0.97)' : 'rgba(15, 11, 8, 0.85)',
        transition: 'background 0.3s',
      }}
    >
      <nav
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '0 20px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
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

        {/* Desktop Nav */}
        <div
          className="hidden md:flex"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: '14px',
                textDecoration: 'none',
                transition: 'color 0.2s, background 0.2s',
                fontFamily: "'Sarabun', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.background = 'var(--gold-tint)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Buy Exams CTA */}
          <Link
            href="/exams"
            style={{
              display: 'none',
            }}
            className="md:flex"
          >
            <span
              className="btn-primary"
              style={{ padding: '7px 16px', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ShoppingBagIcon />
              ซื้อข้อสอบ
            </span>
          </Link>

          {/* Auth (Desktop Only) */}
          {user ? (
            <div className="hidden md:flex" style={{ alignItems: 'center', gap: '12px' }}>
              {isAdmin && (
                <Link href="/admin">
                  <span className="text-[#D4AF37] hover:text-[#F1D17A] text-sm font-bold transition-colors">
                    Admin Panel
                  </span>
                </Link>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.email?.split('@')[0]}
                </span>
                <button
                  onClick={handleSignOut}
                  className="btn-ghost"
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}
                  title="ออกจากระบบ"
                >
                  <LogOutIcon />
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex" style={{ alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                className="font-display"
                style={{ color: 'var(--text-secondary)', fontSize: '15px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                เข้าสู่ระบบ
              </button>
              <button
                onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); }}
                className="font-display"
                style={{ background: '#f59e0b', color: '#1a1208', padding: '7px 20px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'filter 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
              >
                สมัครฟรี
              </button>
            </div>
          )}

          {/* Mobile Menu Toggle */}
          <button
            className="btn-ghost md:hidden relative z-[60]"
            style={{ padding: '6px' }}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Sheet Backdrop */}
      <div 
        className={`fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Bottom Sheet Drawer */}
      <div 
        className={`fixed bottom-0 left-0 w-full z-[55] bg-[#1A140E] border-t border-[rgba(212,175,55,0.15)] rounded-t-[32px] p-6 pb-12 transition-transform duration-300 ease-in-out md:hidden flex flex-col gap-2 ${menuOpen ? 'translate-y-0 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]' : 'translate-y-full'}`}
        role="dialog"
        aria-label="เมนูนำทาง"
      >
        {/* Drag Handle indicator */}
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
            <div className="px-3 pb-2 text-[13px] text-[#A1866B] font-medium">
              ลงชื่อเข้าใช้ในชื่อ: {user.email}
            </div>
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
              onClick={handleSignOut}
              className="p-3 text-[16px] text-[#e8786a] font-medium font-display rounded-xl text-left hover:bg-[rgba(192,57,43,0.1)] transition-colors flex items-center gap-2"
            >
              <LogOutIcon /> ออกจากระบบ
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-2 pb-safe">
            <button
              onClick={() => { setMenuOpen(false); setAuthMode('login'); setIsAuthModalOpen(true); }}
              className="w-full btn-outline py-3 text-[16px] flex justify-center"
            >
              เข้าสู่ระบบ
            </button>
            <button
              onClick={() => { setMenuOpen(false); setAuthMode('register'); setIsAuthModalOpen(true); }}
              className="w-full btn-primary py-3 text-[16px] flex justify-center text-[#1A140E]"
            >
              สมัครสมาชิกฟรี
            </button>
          </div>
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        initialMode={authMode} 
      />
    </header>
  )
}
