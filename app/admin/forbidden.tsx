import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

export default function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <ShieldAlert className="w-10 h-10 text-red-400" />
      </div>
      <h1 className="text-4xl font-display font-bold text-[#F5E9D6] mb-4 drop-shadow-sm">403 Forbidden</h1>
      <p className="text-[#A1866B] text-lg max-w-md mb-8">
        ขออภัย คุณไม่มีสิทธิ์เข้าถึงหน้านี้ หรือบทบาทของคุณไม่เพียงพอสำหรับการใช้งานส่วนนี้
      </p>
      <Link href="/admin">
        <button className="btn-primary flex items-center gap-2">
          กลับสู่แดชบอร์ด
        </button>
      </Link>
    </div>
  )
}
