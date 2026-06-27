'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import AuthModal from './AuthModal'
import DesktopNav from './DesktopNav'
import MobileNav from './MobileNav'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
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
        setIsAdmin(['admin', 'owner'].includes(data?.role))
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
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
    <header
      className="navbar"
      style={{
        background: scrolled ? 'rgba(15, 11, 8, 0.97)' : 'rgba(15, 11, 8, 0.85)',
        transition: 'background 0.3s',
      }}
    >
      {/* Desktop view */}
      <div className="hidden lg:block w-full">
        <DesktopNav 
          user={user} 
          isAdmin={isAdmin} 
          onLoginClick={handleLoginClick} 
          onRegisterClick={handleRegisterClick} 
          onSignOut={handleSignOut} 
        />
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden w-full">
        <MobileNav 
          user={user} 
          isAdmin={isAdmin} 
          onLoginClick={handleLoginClick} 
          onRegisterClick={handleRegisterClick} 
          onSignOut={handleSignOut} 
        />
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
