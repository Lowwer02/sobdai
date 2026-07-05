'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import AuthModal from './AuthModal'
import DesktopNav from './DesktopNav'
import MobileNav from './MobileNav'
import ConfirmDialog from './admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'

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
  
  const supabase = createClient()

  useEffect(() => {
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
          // The Navbar is client-side and only a UX hint (show/hide the
          // Admin button). Authoritative access control is enforced
          // server-side in lib/auth/server-protect.ts + RBAC, so we must NOT
          // let a failed profile read hide the button.
          //
          // Most likely cause: a stale PostgREST schema cache on production
          // (migration 007 that adds avatar_url explicitly calls
          // `NOTIFY pgrst, 'reload schema'`, indicating the team has hit
          // this before). The PostgREST 400 message names the offending
          // column, so we surface it loudly here.
          console.error(
            'Navbar: explicit profiles query failed — falling back to select(*).',
            'Offending column / reason:',
            primaryError.message
          )

          // Defensive fallback: select('*') cannot 400 on a missing column,
          // so it restores the Admin button on partially-migrated or
          // schema-cache-stale databases. This is intentionally a RECOVERY
          // path, not the default — the happy path stays explicit and
          // minimal. To remove this fallback, fix the root cause surfaced
          // by the error log above (apply migration / reload schema cache).
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
    // The profiles query below is the only network call needed; authoritative
    // auth/role checks still happen server-side (proxy + server components).
    supabase.auth.getSession().then(({ data }) => fetchUserAndRole(data.session?.user ?? null))
    
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

  const handleSignOutClick = () => {
    setShowLogoutConfirm(true)
  }

  const confirmSignOut = async () => {
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
    setIsAuthModalOpen(true)
  }

  const handleRegisterClick = () => {
    setAuthMode('register')
    setIsAuthModalOpen(true)
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
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={() => setIsAuthModalOpen(false)}
        initialMode={authMode} 
      />

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
