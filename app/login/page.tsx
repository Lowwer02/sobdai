'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthModal from '@/components/AuthModal'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')

  // Prevent hydration mismatch
  const [mounted, setMounted] = require('react').useState(false)
  require('react').useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-[#D4AF37] font-display font-bold text-2xl mb-8 drop-shadow-[0_0_10px_rgba(212,175,55,0.5)] hover:scale-105 transition-transform">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <circle cx="12" cy="10" r="3" fill="currentColor"/>
          </svg>
          Sobdai
        </Link>
        <h1 className="text-2xl font-bold text-[#F5E9D6] mb-2">กรุณาเข้าสู่ระบบ</h1>
        <p className="text-[#A1866B]">เพื่อเข้าใช้งานฟีเจอร์ต่างๆ ของระบบ</p>
      </div>

      <AuthModal 
        isOpen={true} 
        onClose={() => {
          // Intentional close (Guest cancelled)
          // Try to extract package slug from redirect url to return them gracefully
          if (redirect?.startsWith('/package/')) {
            const match = redirect.match(/^\/package\/([^\/]+)/)
            if (match) {
              window.location.href = `/package/${match[1]}`
              return
            }
          }
          window.location.href = '/'
        }} 
        onSuccess={() => {
          // Login successful, proceed to the requested protected page
          window.location.href = redirect || '/'
        }}
        initialMode="login" 
        redirectUrl={redirect || undefined} 
      />
    </div>
  )
}
