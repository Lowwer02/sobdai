'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function WrittenExamError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-[#0F0B07] px-4 py-16 text-[#F5E9D6]">
      <div className="mx-auto max-w-md rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] p-8 text-center shadow-2xl">
        <AlertTriangle className="mx-auto text-[#D4AF37]" size={34} aria-hidden="true" />
        <h1 className="mt-5 text-xl font-bold font-display">ไม่สามารถโหลด Written Exam ได้</h1>
        <p className="mt-3 text-sm leading-6 text-[#A1866B]">เกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง</p>
        <div className="mt-7 space-y-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full rounded-xl bg-[#D4AF37] py-3 font-bold text-[#1A140E] hover:bg-[#F1D17A]"
          >
            ลองใหม่อีกครั้ง
          </button>
          <Link
            href="/"
            className="block w-full rounded-xl border border-[rgba(255,255,255,0.1)] py-3 font-bold text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)]"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </div>
  )
}
