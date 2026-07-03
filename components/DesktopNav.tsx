'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

const NAV_LINKS = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/packages', label: 'แพ็กเกจ' },
  { href: '/exams', label: 'ข้อสอบ' },
  { href: '/summaries', label: 'สรุปเนื้อหา' },
  { href: '/downloads', label: 'ดาวน์โหลด' },
]

interface DesktopNavProps {
  user: User | null
  isAdmin: boolean
  onLoginClick: () => void
  onRegisterClick: () => void
  onSignOut: () => void
}

export default function DesktopNav({ user, isAdmin, onLoginClick, onRegisterClick, onSignOut }: DesktopNavProps) {
  const pathname = usePathname()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <nav className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between gap-8">
      
      {/* Left: Logo */}
      <Link href="/" className="flex items-center gap-3 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg p-1">
        <Image 
          src="/logo.png" 
          alt="Sobdai Logo" 
          width={36} 
          height={36} 
          className="rounded-lg shadow-[0_2px_10px_rgba(212,175,55,0.2)] group-hover:shadow-[0_4px_15px_rgba(212,175,55,0.4)] transition-all"
        />
        <span className="font-display text-xl text-[#F5E9D6] tracking-wide group-hover:text-[#D4AF37] transition-colors">
          Sobdai
        </span>
      </Link>

      {/* Center: Main Links */}
      <div className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'text-[#D4AF37] bg-[rgba(212,175,55,0.08)]' 
                  : 'text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>

      {/* Right: Auth / Profile */}
      <div className="flex items-center gap-4 shrink-0">
        {user ? (
          <div className="flex items-center gap-4">
            <Link href="/orders" className="text-sm font-medium text-[#A1866B] hover:text-[#D4AF37] transition-colors hidden lg:block">
              คำสั่งซื้อ
            </Link>
            
            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button type="button" 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.05)] transition-all focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
              >
                <div className="w-7 h-7 rounded-full bg-[#1A140E] flex items-center justify-center border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
              </button>

              {/* Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-3 w-56 rounded-xl bg-[#140F0A] border border-[rgba(255,255,255,0.08)] shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)]">
                    <p className="text-sm font-medium text-[#F5E9D6] truncate">{user.email}</p>
                  </div>
                  
                  <div className="py-2">
                    <Link href="/settings" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                      โปรไฟล์
                    </Link>
                    <Link href="/orders" onClick={() => setIsProfileOpen(false)} className="block lg:hidden px-4 py-2 text-sm text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                      คำสั่งซื้อ
                    </Link>
                    
                    {isAdmin && (
                      <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm font-medium text-[#D4AF37] hover:bg-[rgba(212,175,55,0.08)] transition-colors">
                        Admin Panel
                      </Link>
                    )}
                  </div>
                  
                  <div className="py-2 border-t border-[rgba(255,255,255,0.05)]">
                    <button type="button"
                      onClick={() => {
                        setIsProfileOpen(false)
                        onSignOut()
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="submit"
              onClick={onLoginClick}
              className="px-4 py-2 text-sm font-medium text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
            >
              เข้าสู่ระบบ
            </button>
            <button type="button"
              onClick={onRegisterClick}
              className="px-5 py-2 text-sm font-bold text-[#0F0B07] bg-gradient-to-r from-[#D4AF37] to-[#B38F24] rounded-lg shadow-lg shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/40 hover:-translate-y-0.5 transition-all duration-200"
            >
              สมัครฟรี
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
