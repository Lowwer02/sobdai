'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import DesktopNav from './DesktopNav'
import MobileNav from './MobileNav'
import ConfirmDialog from './admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'

const AuthModal = dynamic(() => import('./AuthModal'), {
  ssr: false,
})

function hasPossibleSession(): boolean {
  if (typeof document === 'undefined') return false
  try {
    if (document.cookie.includes('sb-') && document.cookie.includes('-auth-token')) {
      return true
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return true
      }
    }
  } catch {}
  return false
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const router = useRouter()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  
  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [hasOpenedAuth, setHasOpenedAuth] = useState(false)
  
  const authInitializedRef = useRef(false)

  const initAuth = useCallback(async () => {
    if (authInitializedRef.current) return
    authInitializedRef.current = true

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const fetchUserAndRole = async (sessionUser: User | null) => {
      setUser(sessionUser)
      if (sessionUser) {
        // Primary: explicit columns only — the Navbar needs nothing else.
        // Columns origin: role (001), status (004), avatar_url (007),
        // deleted_at (008).
        const primary = await supabase
          .from('profiles')
          .select('role, status, deleted_at, avatar_url')
          .eq('id', sessionUser.id)
          .single()

        let data = primary.data
        const primaryError = primary.error

        if (primaryError) {
          console.error(
            'Navbar: explicit profiles query failed — falling back to select(*).',
            'Offending column / reason:',
            primaryError.message
          )

          const fallback = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sessionUser.id)
            .single()

          if (fallback.error) {
            console.error('Navbar: fallback select(*) also failed:', fallback.error.message)
          }
          data = fallback.data
        }

        if (data?.deleted_at) {
          // Force logout for deactivated accounts
          await supabase.auth.signOut()
          setUser(null)
          setIsAdmin(false)
          setAvatarUrl(null)
          window.location.reload()
          return
        }

        if (data?.status === 'banned') {
          // Safety net for existing sessions: if an admin bans a user while
          // they are online, this runs on the next auth state change / mount
          // and forces them out to /login with the banned message.
          await supabase.auth.signOut()
          setUser(null)
          setIsAdmin(false)
          setAvatarUrl(null)
          window.location.href = '/login?banned=1'
          return
        }

        setIsAdmin(['admin', 'owner', 'editor', 'support'].includes(data?.role))
        setAvatarUrl(data?.avatar_url ?? null)
      } else {
        setIsAdmin(false)
        setAvatarUrl(null)
      }
    }

    // Use getSession() on mount: it reads the local session synchronously
    // (no network round-trip), unlike getUser() which always hits the network.
    supabase.auth.getSession().then(({ data }) => fetchUserAndRole(data.session?.user ?? null))
    
    supabase.auth.onAuthStateChange((_event, session) => {
      fetchUserAndRole(session?.user ?? null)
      if (session?.user) {
        setIsAuthModalOpen(false) // Close modal on successful auth
      }
    })
  }, [])

  useEffect(() => {
    if (hasPossibleSession()) {
      initAuth()
    }
  }, [initAuth])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSignOutClick = () => {
    setShowLogoutConfirm(true)
  }

  const confirmSignOut = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setAvatarUrl(null)
    setShowLogoutConfirm(false)
    router.replace('/')
    router.refresh()
    toastEvent('ออกจากระบบเรียบร้อย')
  }

  const handleLoginClick = () => {
    setAuthMode('login')
    setHasOpenedAuth(true)
    setIsAuthModalOpen(true)
    initAuth()
  }

  const handleRegisterClick = () => {
    setAuthMode('register')
    setHasOpenedAuth(true)
    setIsAuthModalOpen(true)
    initAuth()
  }

  return (
    <>
      <header
        className={`sticky top-0 left-0 right-0 z-50 transition-colors duration-200 border-b ${
        scrolled
          ? 'bg-[#0F0B07] border-[rgba(255,255,255,0.05)] shadow-lg'
          : 'bg-[#0F0B07] border-transparent'
      }`}
      >
      {/* Desktop view */}
      <div className="hidden lg:block w-full">
        <DesktopNav
          user={user}
          isAdmin={isAdmin}
          avatarUrl={avatarUrl}
          onLoginClick={handleLoginClick}
          onRegisterClick={handleRegisterClick}
          onSignOut={handleSignOutClick}
        />
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden w-full">
        <MobileNav
          user={user}
          isAdmin={isAdmin}
          avatarUrl={avatarUrl}
          onLoginClick={handleLoginClick}
          onRegisterClick={handleRegisterClick}
          onSignOut={handleSignOutClick}
        />
        </div>
      </header>

      {/* Auth Modal */}
      {hasOpenedAuth && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => setIsAuthModalOpen(false)}
          initialMode={authMode}
        />
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmSignOut}
        title="ออกจากระบบ"
        description="คุณต้องการออกจากระบบใช่หรือไม่"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        isDestructive={true}
      />
    </>
  )
}
