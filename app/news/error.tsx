'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

/**
 * /news route error boundary (Client Component — required by Next.js).
 *
 * Mirrors the global app/error.tsx: logs the error, offers retry (reset) + a
 * way home. Scoped to /news so a failure on this route doesn't blank the whole
 * app. The inline error state in page.tsx handles the "DB query returned
 * nothing" soft failure; this boundary catches true render/runtime errors.
 */
export default function NewsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Public news list error:', error)
  }, [error])

  return (
    <div className="min-h-[70vh] bg-[#0F0B07] flex items-center justify-center p-4">
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 md:p-12 rounded-3xl max-w-lg w-full text-center relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} className="text-red-500" />
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-bold text-[#F5E9D6] mb-4 tracking-tight">
            ไม่สามารถโหลดข่าวได้
          </h1>

          <p className="text-[#A1866B] mb-8 leading-relaxed">
            เกิดข้อผิดพลาดในการโหลดรายการข่าว กรุณาลองใหม่อีกครั้ง
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] shadow-[0_0_20px_rgba(212,175,55,0.2)] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/30"
            >
              <RefreshCw size={18} />
              ลองใหม่อีกครั้ง
            </button>
            <Link
              href="/"
              className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:border-[#D4AF37]/50 hover:bg-[rgba(212,175,55,0.05)] text-[#F5E9D6] font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[rgba(255,255,255,0.1)]"
            >
              <Home size={18} />
              กลับหน้าหลัก
            </Link>
          </div>

          {error.digest && (
            <div className="mt-8 pt-6 border-t border-[rgba(255,255,255,0.05)] text-[11px] text-[#A1866B] font-mono uppercase tracking-wider">
              Error Digest: {error.digest}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
