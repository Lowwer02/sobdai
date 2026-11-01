import Link from 'next/link'
import { FileQuestion, Home, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 selection:bg-[#D4AF37]/30 selection:text-foreground">
      <div className="bg-card border border-border-subtle p-8 md:p-12 rounded-3xl max-w-lg w-full text-center relative overflow-hidden shadow-[var(--shadow-lg)]">

        {/* Decorative Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="w-24 h-24 rounded-full bg-background border border-border-subtle flex items-center justify-center mx-auto mb-8 shadow-inner">
            <span className="text-5xl font-display font-bold text-brand opacity-80">404</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4 tracking-tight">
            ไม่พบหน้าที่คุณต้องการ
          </h1>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            ขออภัย ลิงก์อาจถูกเปลี่ยนแปลงหรือหน้าที่คุณกำลังตามหาไม่มีอยู่ในระบบ กรุณาตรวจสอบ URL หรือกลับไปยังหน้าหลัก
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="w-full bg-brand-solid hover:bg-[#F1D17A] text-brand-foreground font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] shadow-[0_0_20px_rgba(212,175,55,0.2)] focus:outline-none focus:ring-4 focus:ring-brand/30"
            >
              <Home size={18} />
              กลับหน้าหลัก
            </Link>
            <Link
              href="/#exams"
              className="w-full bg-transparent border border-border-subtle hover:border-brand/50 hover:bg-[rgba(212,175,55,0.05)] text-foreground font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-brand/30"
            >
              <Search size={18} />
              ค้นหาชุดข้อสอบ
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
