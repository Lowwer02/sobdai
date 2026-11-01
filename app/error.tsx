'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service in production
    console.error('Application Error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 selection:bg-[#D4AF37]/30 selection:text-foreground">
      <div className="bg-card border border-border-subtle p-8 md:p-12 rounded-3xl max-w-lg w-full text-center relative overflow-hidden shadow-[var(--shadow-lg)]">

        {/* Decorative Glow */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} className="text-red-500" />
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4 tracking-tight">
            โอ๊ะ! เกิดข้อผิดพลาด
          </h1>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            ระบบไม่สามารถประมวลผลคำขอของคุณได้ในขณะนี้ อาจเกิดจากข้อผิดพลาดในการเชื่อมต่อ หรือข้อมูลไม่พร้อมใช้งาน
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button type="button"
              onClick={() => reset()}
              className="flex-1 bg-brand-solid hover:bg-[#F1D17A] text-brand-foreground font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] shadow-[0_0_20px_rgba(212,175,55,0.2)] focus:outline-none focus:ring-4 focus:ring-brand/30"
            >
              <RefreshCw size={18} />
              ลองใหม่อีกครั้ง
            </button>
            <Link
              href="/"
              className="flex-1 bg-transparent border border-border-subtle hover:border-brand/50 hover:bg-[rgba(212,175,55,0.05)] text-foreground font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-brand/30"
            >
              <Home size={18} />
              กลับหน้าหลัก
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-border-subtle text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
            Error Digest: {error.digest || 'Unknown'}
          </div>
        </div>
      </div>
    </div>
  )
}
