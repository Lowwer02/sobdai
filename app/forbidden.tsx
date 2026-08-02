import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

// Root-level forbidden boundary. Next.js renders this (with a 403 status) when
// `forbidden()` is thrown anywhere in a Server Component / Server Function /
// Route Handler. This is the UI for the admin staff boundary in
// app/admin/layout.tsx. (The previous app/admin/forbidden.tsx was never
// consulted by Next.js — only the root app/forbidden.tsx is.)
export default function Forbidden() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <ShieldAlert className="w-10 h-10 text-red-400" />
      </div>
      <h1 className="text-4xl font-display font-bold text-[#F5E9D6] mb-4 drop-shadow-sm">
        403 Forbidden
      </h1>
      <p className="text-[#A1866B] text-lg max-w-md mb-8">
        ขออภัย คุณไม่มีสิทธิ์เข้าถึงหน้านี้ หรือบทบาทของคุณไม่เพียงพอสำหรับการใช้งานส่วนนี้
      </p>
      <Link href="/">
        <button type="button" className="btn-primary flex items-center gap-2">
          กลับสู่หน้าแรก
        </button>
      </Link>
    </div>
  )
}
