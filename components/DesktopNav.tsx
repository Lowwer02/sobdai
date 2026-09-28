'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { trackDailyNavClick } from '@/lib/analytics'
import NotificationBell, { type NotificationCenterState } from './NotificationBell'

const NAV_LINKS = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/packages', label: 'แพ็กเกจ' },
  { href: '/news', label: 'ข่าวสาร' },
  { href: '/daily', label: 'ฝึกทุกวัน' },
  { href: '/exams', label: 'แดชบอร์ด' },
  { href: '/articles', label: 'บทความ' },
  // '/downloads' (คลังสื่อการเรียน) is temporarily unlinked while the
  // learning-media feature is unfinished; /downloads also 307s to /articles
  // (next.config.ts). Restore this entry when the feature ships.
]

interface DesktopNavProps {
  user: User | null
  isAdmin: boolean
  avatarUrl?: string | null
  onLoginClick: () => void
  onRegisterClick: () => void
  onSignOut: () => void
  notifications: NotificationCenterState
}

export default function DesktopNav({ user, isAdmin, avatarUrl, onLoginClick, onRegisterClick, onSignOut, notifications }: DesktopNavProps) {
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
      <Link href="/" className="flex items-center gap-3 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg p-1">
        <Image 
          src="/logo.png" 
          alt="Sobdai Logo" 
          width={36} 
          height={36} 
          className="rounded-lg shadow-[0_2px_10px_rgba(212,175,55,0.2)] group-hover:shadow-[0_4px_15px_rgba(212,175,55,0.4)] transition-all"
        />
        <span className="font-display text-xl text-foreground tracking-wide group-hover:text-brand transition-colors">
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
              prefetch={link.href === '/daily' ? false : undefined}
              onClick={link.href === '/daily' ? () => {
                try {
                  trackDailyNavClick()
                } catch {}
              } : undefined}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'text-brand bg-wash'
                  : 'text-muted-foreground hover:text-foreground hover:bg-hover'
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
            <NotificationBell active={Boolean(user)} center={notifications} />
            
            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button type="button" 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-hover hover:bg-hover-strong border border-border-subtle transition-all focus:outline-none focus:ring-2 focus:ring-brand/50"
                aria-label="เปิดเมนูโปรไฟล์"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="รูปโปรไฟล์"
                    width={28}
                    height={28}
                    className="w-7 h-7 rounded-full object-cover border border-brand/30"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-card flex items-center justify-center border border-brand/30 text-brand text-xs font-bold">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              {/* Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-3 w-56 rounded-xl bg-surface-raised border border-border-subtle shadow-[var(--shadow-lg)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-border-subtle">
                    <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                  </div>
                  
                  <div className="py-2">
                    <Link href="/settings" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
                      โปรไฟล์
                    </Link>
                    <Link href="/my-packages" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
                      แพ็กเกจของฉัน
                    </Link>
                    
                    {isAdmin && (
                      <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm font-medium text-brand hover:bg-wash transition-colors">
                        Admin Panel
                      </Link>
                    )}
                  </div>
                  
                  <div className="py-2 border-t border-border-subtle">
                    <button type="button"
                      onClick={() => {
                        setIsProfileOpen(false)
                        onSignOut()
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive-bg transition-colors"
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
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              เข้าสู่ระบบ
            </button>
            <button type="button"
              onClick={onRegisterClick}
              className="px-5 py-2 text-sm font-bold text-brand-foreground bg-gradient-to-r from-brand-solid to-brand-deep rounded-lg shadow-lg shadow-brand/20 hover:shadow-brand/40 hover:-translate-y-0.5 transition-all duration-200"
            >
              สมัครฟรี
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
