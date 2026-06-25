'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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

function XIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    }
  }, [isOpen, initialMode])

  if (!isOpen) return null

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
          setSuccessMsg('สมัครสมาชิกสำเร็จ! กรุณาเช็คอีเมลเพื่อยืนยันตัวตน หรือถ้าไม่ต้องยืนยันให้ลองล็อกอินได้เลย')
          setEmail('')
          setPassword('')
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      } else {
        onClose()
      }
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="card-glass w-full max-w-md relative z-10 overflow-hidden shadow-2xl animate-fadeInUp">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
        >
          <XIcon />
        </button>

        <div className="p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold font-display text-[var(--gold-light)] mb-1">
              {mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิกฟรี'}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {mode === 'login' 
                ? 'ยินดีต้อนรับกลับ! เข้าสู่ระบบเพื่อทำข้อสอบต่อ' 
                : 'สร้างบัญชีเพื่อบันทึกผลและเข้าถึงข้อสอบทั้งหมด'}
            </p>
          </div>

          {error && (
            <div className="bg-[var(--wrong-bg)] border border-[rgba(224,92,92,0.25)] text-[var(--wrong)] text-[13.5px] p-3 rounded-xl mb-5 text-center">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="bg-[var(--correct-bg)] border border-[rgba(76,175,125,0.25)] text-[var(--correct)] text-[13.5px] p-3 rounded-xl mb-5 text-center">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="input-field"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">รหัสผ่าน</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="input-field"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="btn-primary w-full mt-2 flex justify-center"
            >
              {loading ? 'กำลังดำเนินการ...' : (mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี')}
            </button>
          </form>

          <div className="relative flex items-center justify-center my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-card)]"></div>
            </div>
            <div className="relative bg-[#1a1208] px-4 text-xs text-[var(--text-muted)] uppercase tracking-wider">
              หรือ
            </div>
          </div>

          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[var(--bg-input)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-[15px] cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--gold-tint)] transition-all font-sans"
          >
            <GoogleIcon />
            {mode === 'login' ? 'เข้าสู่ระบบด้วย Google' : 'สมัครสมาชิกด้วย Google'}
          </button>
          
          <div className="mt-8 text-center text-sm text-[var(--text-muted)]">
            {mode === 'login' ? (
              <>
                ยังไม่มีบัญชี?{' '}
                <button 
                  type="button"
                  onClick={() => setMode('register')} 
                  className="text-[var(--gold-light)] hover:underline font-medium"
                >
                  สมัครสมาชิก
                </button>
              </>
            ) : (
              <>
                มีบัญชีอยู่แล้ว?{' '}
                <button 
                  type="button"
                  onClick={() => setMode('login')} 
                  className="text-[var(--gold-light)] hover:underline font-medium"
                >
                  เข้าสู่ระบบ
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
