'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/packages', label: 'แพ็กเกจ' },
  { href: '/exams', label: 'ข้อสอบ' },
  { href: '/summaries', label: 'สรุปเนื้อหา' },
  { href: '/downloads', label: 'ดาวน์โหลด' },
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
  const pathname = usePathname()

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
      <nav className="w-full px-5 h-[72px] flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-3 shrink-0 group"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#B38F24] text-[#0F0B07] font-bold text-base shadow-sm">
            S
          </div>
          <span className="font-display text-xl text-[#F5E9D6] tracking-wide">
            Sobdai
          </span>
        </Link>

        {/* Hamburger */}
        <button
          className="relative z-[60] p-2 text-[#F5E9D6] hover:text-[#D4AF37] transition-colors focus:outline-none"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={menuOpen}
        >
          <div className="w-6 h-5 flex flex-col justify-between items-end">
            <span className={`h-0.5 bg-current rounded-full transition-all duration-300 ${menuOpen ? 'w-6 rotate-45 translate-y-2.5' : 'w-6'}`} />
            <span className={`h-0.5 bg-current rounded-full transition-all duration-300 ${menuOpen ? 'w-0 opacity-0' : 'w-4'}`} />
            <span className={`h-0.5 bg-current rounded-full transition-all duration-300 ${menuOpen ? 'w-6 -rotate-45 -translate-y-2' : 'w-5'}`} />
          </div>
        </button>
      </nav>

      {/* Render Backdrop and Menu at body level */}
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className={`fixed inset-0 z-[55] bg-[#0F0B07]/80 backdrop-blur-md transition-opacity duration-300 ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Full Screen Menu */}
          <div 
            className={`fixed inset-y-0 right-0 w-[85vw] max-w-sm z-[55] bg-[#140F0A] border-l border-[rgba(255,255,255,0.05)] shadow-2xl p-6 transition-transform duration-300 ease-in-out flex flex-col ${menuOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}
            role="dialog"
            aria-label="เมนูนำทาง"
          >
            <div className="flex-1 overflow-y-auto pt-16 pb-6 flex flex-col gap-6">
              
              {/* User Profile Summary */}
              {user && (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                  <div className="w-12 h-12 rounded-full bg-[#1A140E] flex items-center justify-center border border-[#D4AF37]/30 text-[#D4AF37] text-lg font-bold shrink-0">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm text-[#A1866B]">ยินดีต้อนรับ</span>
                    <span className="text-base font-medium text-[#F5E9D6] truncate">{user.email}</span>
                  </div>
                </div>
              )}

              {/* Main Links */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold tracking-wider text-[#A1866B] uppercase mb-2 px-2">เมนูหลัก</span>
                {NAV_LINKS.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className={`px-4 py-3 text-base font-medium rounded-lg transition-colors ${
                        isActive 
                          ? 'text-[#D4AF37] bg-[rgba(212,175,55,0.08)]' 
                          : 'text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)]'
                      }`}
                    >
                      {link.label}
                    </Link>
                  )
                })}
              </div>

              {/* Account Links */}
              {user && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold tracking-wider text-[#A1866B] uppercase mb-2 px-2">บัญชีของฉัน</span>
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium text-[#F5E9D6] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                  >
                    โปรไฟล์
                  </Link>
                  <Link
                    href="/orders"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium text-[#F5E9D6] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                  >
                    คำสั่งซื้อ
                  </Link>
                  <Link
                    href="/history"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium text-[#F5E9D6] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                  >
                    ประวัติ
                  </Link>
                  
                  {isAdmin && (
                    <Link 
                      href="/admin" 
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-3 mt-2 text-base font-medium text-[#D4AF37] rounded-lg bg-[rgba(212,175,55,0.05)] border border-[rgba(212,175,55,0.2)] hover:bg-[rgba(212,175,55,0.1)] transition-colors"
                    >
                      Admin Panel
                    </Link>
                  )}
                </div>
              )}
            </div>
            
            {/* Bottom Actions */}
            <div className="pt-6 border-t border-[rgba(255,255,255,0.05)] pb-safe">
              {user ? (
                <button
                  onClick={handleSignOutClick}
                  className="w-full py-3 px-4 text-left text-base font-medium text-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
                >
                  ออกจากระบบ
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => { setMenuOpen(false); onLoginClick(); }}
                    className="w-full py-3 px-4 text-base font-medium text-[#F5E9D6] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-all"
                  >
                    เข้าสู่ระบบ
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onRegisterClick(); }}
                    className="w-full py-3 px-4 text-base font-bold text-[#0F0B07] bg-gradient-to-r from-[#D4AF37] to-[#B38F24] rounded-lg shadow-lg shadow-[#D4AF37]/20 transition-all"
                  >
                    สมัครสมาชิกฟรี
                  </button>
                </div>
              )}
            </div>

          </div>
        </>,
        document.body
      )}
    </>
  )
}
