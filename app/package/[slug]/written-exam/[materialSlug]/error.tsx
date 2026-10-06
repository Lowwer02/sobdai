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
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md rounded-2xl border border-brand-solid/20 bg-card p-8 text-center shadow-2xl">
        <AlertTriangle className="mx-auto text-brand" size={34} aria-hidden="true" />
        <h1 className="mt-5 text-xl font-bold font-display">ไม่สามารถโหลด Written Exam ได้</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">เกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง</p>
        <div className="mt-7 space-y-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full rounded-xl bg-brand-solid py-3 font-bold text-brand-foreground hover:bg-[#F1D17A]"
          >
            ลองใหม่อีกครั้ง
          </button>
          <Link
            href="/"
            className="block w-full rounded-xl border border-border-subtle py-3 font-bold text-foreground hover:bg-hover"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </div>
  )
}
