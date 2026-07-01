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
        const { data } = await supabase.from('profiles').select('role, deleted_at').eq('id', sessionUser.id).single()
        
        if (data?.deleted_at) {
          // Force logout for deactivated accounts
          await supabase.auth.signOut()
          setUser(null)
          setIsAdmin(false)
          window.location.reload()
          return
        }

        setIsAdmin(['admin', 'owner', 'editor', 'support'].includes(data?.role))
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

  const handleSignOutClick = () => {
    setShowLogoutConfirm(true)
  }

  const confirmSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
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
        className={`sticky top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
        scrolled 
          ? 'bg-[#0F0B07]/95 backdrop-blur-md border-[rgba(255,255,255,0.05)] shadow-lg' 
          : 'bg-[#0F0B07]/80 backdrop-blur-sm border-transparent'
      }`}
    >
      {/* Desktop view */}
      <div className="hidden lg:block w-full">
        <DesktopNav 
          user={user} 
          isAdmin={isAdmin} 
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
