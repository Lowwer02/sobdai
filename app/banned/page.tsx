import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export const metadata = {
  title: 'บัญชีถูกระงับ | Sobdai',
}

export default function BannedPage() {
  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-[#1A140E] border border-red-900/30 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-red-500/10 blur-[50px] rounded-full pointer-events-none" />
        
        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10">
          <AlertCircle size={32} />
        </div>
        
        <h1 className="text-2xl font-display font-bold text-red-400 mb-3 relative z-10">
          บัญชีถูกระงับการใช้งาน
        </h1>
        
        <p className="text-[#A1866B] mb-8 leading-relaxed relative z-10">
          บัญชีของคุณถูกระงับการใช้งานเนื่องจากพบพฤติกรรมที่ขัดต่อข้อตกลงการให้บริการ หรือมีความผิดปกติ หากคุณเชื่อว่านี่เป็นข้อผิดพลาด กรุณาติดต่อทีมงาน
        </p>

        <div className="space-y-3 relative z-10">
          <Link href="mailto:support@sobdai.com">
            <button className="w-full py-3 px-4 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold rounded-xl transition-colors">
              ติดต่อทีมงาน
            </button>
          </Link>
          <Link href="/logout" className="block text-sm text-[#A1866B] hover:text-[#F5E9D6] transition-colors py-2">
            ออกจากระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}
