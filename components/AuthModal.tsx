'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'login' | 'register'
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  
  const supabase = createClient()

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      setEmail('')
      setPassword('')
      setError(null)
      setSuccessMsg(null)
      setShowPassword(false)
    }
  }, [isOpen, initialMode])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  const handleGoogleAuth = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    if (mode === 'register') {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) {
        setError(error.message)
      } else {
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError('อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ')
        } else {
          setSuccessMsg('สมัครสมาชิกสำเร็จ! กรุณาเช็คอีเมลเพื่อยืนยันตัวตน หรือทดลองล็อกอินได้เลย')
          setEmail('')
          setPassword('')
        }
      }
    } else {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      } else if (data?.user) {
        const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', data.user.id).single()
        if (profile?.deleted_at) {
          await supabase.auth.signOut()
          setError('บัญชีนี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อทีมงานหากต้องการเปิดใช้งานอีกครั้ง')
        } else {
          onClose()
        }
      }
    }
    setLoading(false)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#0F0B07]/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Card */}
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 w-full sm:max-w-[480px] bg-[#1A140E] border-t sm:border border-[rgba(212,175,55,0.15)] sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden"
          >
            {/* Subtle Gold Radial Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-32 bg-[#D4AF37] opacity-[0.03] blur-[50px] pointer-events-none"></div>

            <button 
              onClick={onClose}
              className="absolute top-5 right-5 text-[#A1866B] hover:text-[#F5E9D6] transition-colors p-1 rounded-full hover:bg-[rgba(255,255,255,0.05)]"
            >
              <X size={20} strokeWidth={2.5} />
            </button>

            <div className="p-8 sm:p-10">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#8C701F] text-[#0F0B07] mb-4 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold font-display text-[#F5E9D6] mb-2">
                  {mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิกฟรี'}
                </h2>
                <p className="text-sm text-[#A1866B]">
                  {mode === 'login' 
                    ? 'ยินดีต้อนรับกลับ! เข้าสู่ระบบเพื่อทำข้อสอบต่อ' 
                    : 'สร้างบัญชีเพื่อบันทึกผลและเข้าถึงข้อสอบทั้งหมด'}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-[#2a1711] border border-[#ff4a4a]/20 text-[#ff7070] text-[13.5px] p-3 rounded-xl mb-5 text-center overflow-hidden"
                  >
                    {error}
                  </motion.div>
                )}

                {successMsg && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-[#112a1c] border border-[#22c55e]/20 text-[#22c55e] text-[13.5px] p-3 rounded-xl mb-5 text-center overflow-hidden"
                  >
                    {successMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleEmailAuth} className="space-y-5 mb-8">
                <div>
                  <label className="block text-[13px] font-medium text-[#A1866B] mb-1.5 uppercase tracking-wide">อีเมล</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3.5 text-[#F5E9D6] placeholder-[#A1866B]/50 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#A1866B] mb-1.5 uppercase tracking-wide">รหัสผ่าน</label>
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
                  disabled={loading}
                  className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#0F0B07] font-bold py-3.5 px-4 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  {mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
                </button>
              </form>

              <div className="relative flex items-center justify-center my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[rgba(255,255,255,0.05)]"></div>
                </div>
                <div className="relative bg-[#1A140E] px-4 text-xs font-medium text-[#A1866B] uppercase tracking-wider">
                  หรือ
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl text-[#F5E9D6] text-[15px] cursor-pointer hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(212,175,55,0.3)] transition-all"
              >
                <GoogleIcon />
                {mode === 'login' ? 'เข้าสู่ระบบด้วย Google' : 'สมัครสมาชิกด้วย Google'}
              </button>
              
              <div className="mt-8 text-center text-sm text-[#A1866B]">
                {mode === 'login' ? (
                  <>
                    ยังไม่มีบัญชี?{' '}
                    <button 
                      type="button"
                      onClick={() => { setMode('register'); setError(null); }} 
                      className="text-[#D4AF37] hover:text-[#F1D17A] font-bold transition-colors"
                    >
                      สมัครสมาชิก
                    </button>
                  </>
                ) : (
                  <>
                    มีบัญชีอยู่แล้ว?{' '}
                    <button 
                      type="button"
                      onClick={() => { setMode('login'); setError(null); }} 
                      className="text-[#D4AF37] hover:text-[#F1D17A] font-bold transition-colors"
                    >
                      เข้าสู่ระบบ
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
