'use client'

import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

function BookOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
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

interface DesktopNavProps {
  user: User | null
  isAdmin: boolean
  onLoginClick: () => void
  onRegisterClick: () => void
  onSignOut: () => void
}

export default function DesktopNav({ user, isAdmin, onLoginClick, onRegisterClick, onSignOut }: DesktopNavProps) {
  return (
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

      {/* Center Nav */}
      <div
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <Link href="/exams" style={{ textDecoration: 'none' }}>
          <span
            className="btn-primary"
            style={{ padding: '7px 16px', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ShoppingBagIcon />
            ซื้อข้อสอบ
          </span>
        </Link>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '4px' }}>
            {isAdmin && (
              <Link href="/admin" style={{ textDecoration: 'none' }}>
                <span className="text-[#D4AF37] hover:text-[#F1D17A] text-sm font-bold transition-colors">
                  Admin Panel
                </span>
              </Link>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link
                href="/settings"
                className="text-[13px] text-[#A1866B] hover:text-[#D4AF37] max-w-[120px] truncate transition-colors"
                title="Account Settings"
              >
                {user.email?.split('@')[0]}
              </Link>
              <button
                onClick={onSignOut}
                className="btn-ghost"
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}
                title="ออกจากระบบ"
              >
                <LogOutIcon />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '4px' }}>
            <button
              onClick={onLoginClick}
              className="font-display"
              style={{ color: 'var(--text-secondary)', fontSize: '15px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              เข้าสู่ระบบ
            </button>
            <button
              onClick={onRegisterClick}
              className="font-display"
              style={{ background: '#f59e0b', color: '#1a1208', padding: '7px 20px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'filter 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
            >
              สมัครฟรี
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
