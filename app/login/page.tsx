'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
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
        <Link href="/" className="inline-flex items-center gap-3 text-[#D4AF37] font-display font-bold text-2xl mb-8 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg p-1 transition-all hover:scale-105">
          <Image 
            src="/logo.png" 
            alt="Sobdai Logo" 
            width={48} 
            height={48} 
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl shadow-[0_2px_10px_rgba(212,175,55,0.2)] group-hover:shadow-[0_4px_15px_rgba(212,175,55,0.4)] transition-all"
          />
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
