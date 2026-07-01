'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toastEvent } from '@/hooks/useToast'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) throw error

      toastEvent('อัพเดทรหัสผ่านเรียบร้อยแล้ว', 'success')
      router.push('/login')
    } catch (err: any) {
      toastEvent(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        {/* Subtle Gold Radial Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-32 bg-[#D4AF37] opacity-[0.03] blur-[50px] pointer-events-none"></div>

        <div className="text-center mb-8 relative z-10">
          <Link href="/" className="inline-flex items-center justify-center mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-xl hover:scale-105 transition-transform">
            <Image 
              src="/logo.png" 
              alt="Sobdai Logo" 
              width={56} 
              height={56} 
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-[0_4px_20px_rgba(212,175,55,0.3)]"
            />
          </Link>
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">
            ตั้งรหัสผ่านใหม่
          </h2>
          <p className="text-sm text-[#A1866B]">
            กรุณากรอกรหัสผ่านใหม่ที่คุณต้องการใช้งาน
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-5 relative z-10">
          <div>
            <label className="block text-[13px] font-medium text-[#A1866B] mb-1.5 uppercase tracking-wide">รหัสผ่านใหม่</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] rounded-xl pl-4 pr-12 py-3.5 text-[#F5E9D6] placeholder-[#A1866B]/50 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A1866B] hover:text-[#D4AF37] transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || password.length < 6}
            className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#0F0B07] font-bold py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-4"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            บันทึกรหัสผ่านใหม่
          </button>
        </form>
      </div>
    </div>
  )
}
