'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ShieldCheck, CreditCard, QrCode } from 'lucide-react'

interface CheckoutClientProps {
  pkg: any
  userEmail: string
}

declare global {
  interface Window { OmiseCard: any }
}

export default function CheckoutClient({ pkg, userEmail }: CheckoutClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [omiseLoaded, setOmiseLoaded] = useState(false)
  const [payMethod, setPayMethod] = useState<'card' | 'promptpay'>('card')

  const discount = pkg.original_price > pkg.current_price 
    ? Math.round(((pkg.original_price - pkg.current_price) / pkg.original_price) * 100) 
    : 0

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.omise.co/omise.js'
    script.onload = () => setOmiseLoaded(true)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handleCardPayment = () => {
    if (!omiseLoaded || !window.OmiseCard) {
      setError('กำลังโหลดระบบชำระเงิน กรุณารอสักครู่')
      return
    }

    setError('')
    window.OmiseCard.configure({
      publicKey: process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
    })

    window.OmiseCard.open({
      frameLabel: 'Sobdai - สอบได้',
      amount: pkg.current_price * 100, // Satang
      currency: 'THB',
      defaultPaymentMethod: 'credit_card',
      submitLabel: `ชำระ ฿${pkg.current_price.toLocaleString()}`,
      onCreateTokenSuccess: async (token: string) => {
        setLoading(true)
        try {
          const res = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: pkg.id, token }),
          })
          const data = await res.json()
          if (data.success) {
            router.push(`/package/${pkg.slug}?success=1`)
          } else {
            setError(data.error || 'การชำระเงินไม่สำเร็จ')
          }
        } catch {
          setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
          setLoading(false)
        }
      },
      onFormClosed: () => setLoading(false),
    })
  }

  const handlePromptPay = () => {
    setError('ระบบ PromptPay อยู่ระหว่างการพัฒนา กรุณาใช้บัตรเครดิต/เดบิต')
  }

  const handleFreeCheckout = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, token: 'free_token' }), // Token can be anything for free
      })
      const data = await res.json()
      if (data.success) {
        router.push(`/package/${pkg.slug}?success=1`)
      } else {
        setError(data.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0B07] font-sans pb-20">
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0F0B07] border-b border-[rgba(212,175,55,0.1)] h-16 flex items-center px-4">
        <div className="max-w-2xl mx-auto w-full flex items-center gap-4">
          <Link href={`/package/${pkg.slug}`} className="text-[#A1866B] hover:text-[#D4AF37] transition-colors p-2 -ml-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)]">
            <ChevronLeft size={20} />
          </Link>
          <div className="font-bold text-[#F5E9D6]">ยืนยันคำสั่งซื้อ</div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-8 space-y-6">
        
        {/* Order Summary Card */}
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-2xl p-6">
          <h2 className="text-[#A1866B] text-sm font-bold uppercase tracking-wider mb-4">สรุปแพ็กเกจ</h2>
          
          <div className="flex gap-4 items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] flex items-center justify-center p-2 flex-shrink-0">
              {pkg.organizations?.logo_url ? (
                <Image src={pkg.organizations.logo_url} alt="logo" width={48} height={48} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xl font-display font-bold text-[#D4AF37]">{pkg.organizations?.name?.charAt(0) || 'O'}</span>
              )}
            </div>
            <div>
              <div className="text-xs text-[#A1866B] mb-1">{pkg.organizations?.name}</div>
              <div className="font-bold text-[#F5E9D6] mb-1 leading-snug">{pkg.positions?.name}</div>
              <div className="text-sm text-[#A1866B]">{pkg.name}</div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-[rgba(212,175,55,0.2)] to-transparent my-6" />

          <div className="flex justify-between items-end">
            <div className="text-[#A1866B] font-medium">ยอดชำระสุทธิ</div>
            <div className="text-right">
              {pkg.original_price > pkg.current_price && (
                <div className="text-sm text-[#A1866B] line-through mb-1">฿{pkg.original_price.toLocaleString()}</div>
              )}
              <div className="text-3xl font-display font-bold text-[#D4AF37]">
                ฿{pkg.current_price.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3 text-sm text-green-400">
            <ShieldCheck size={18} className="flex-shrink-0" />
            <div>
              <span className="font-bold">ซื้อครั้งเดียวใช้งานได้ตลอดชีพ</span>
              <div className="text-xs opacity-80">ปลดล็อคเนื้อหาทั้งหมดในแพ็กเกจนี้ทันที</div>
            </div>
          </div>
        </div>

        {/* Free or Paid Condition */}
        {pkg.current_price === 0 ? (
          <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6 text-center">
            <h2 className="text-[#A1866B] text-sm font-bold uppercase tracking-wider mb-4">รับสิทธิ์ใช้งาน</h2>
            <p className="text-[#F5E9D6] mb-6">แพ็กเกจนี้เปิดให้ใช้งานฟรี กดปุ่มด้านล่างเพื่อรับสิทธิ์ใช้งานทันที</p>
            
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="mb-6 text-[12px] text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] p-3.5 rounded-xl flex gap-2.5 text-left leading-relaxed">
              <ShieldCheck size={16} className="text-[#A1866B] flex-shrink-0 mt-0.5" />
              <span>ฉันเข้าใจและยอมรับว่า <strong className="text-[#F5E9D6] font-medium">สินค้าดิจิทัลไม่สามารถขอคืนเงินได้</strong> หลังจากที่ได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว</span>
            </div>

            <button type="button"
              onClick={handleFreeCheckout}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-[#1A140E] transition-all flex justify-center items-center gap-2 ${
                loading
                  ? 'bg-[#A1866B] cursor-not-allowed opacity-70' 
                  : 'bg-[#D4AF37] hover:bg-[#F1D17A] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-[#1A140E]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังดำเนินการ...
                </>
              ) : (
                'รับแพ็กเกจฟรี'
              )}
            </button>
          </div>
        ) : (
          <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
            <h2 className="text-[#A1866B] text-sm font-bold uppercase tracking-wider mb-4">ช่องทางชำระเงิน</h2>
            
            <div className="flex gap-3 mb-6">
              <button type="button"
                onClick={() => setPayMethod('card')}
                className={`flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                  payMethod === 'card' 
                    ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]' 
                    : 'bg-[#0F0B07] border-[rgba(255,255,255,0.05)] text-[#A1866B] hover:border-[#D4AF37]/50'
                }`}
              >
                <CreditCard size={24} />
                <span className="text-sm font-bold">บัตรเครดิต/เดบิต</span>
              </button>
              <button type="button"
                onClick={() => setPayMethod('promptpay')}
                className={`flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                  payMethod === 'promptpay' 
                    ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]' 
                    : 'bg-[#0F0B07] border-[rgba(255,255,255,0.05)] text-[#A1866B] hover:border-[#D4AF37]/50'
                }`}
              >
                <QrCode size={24} />
                <span className="text-sm font-bold">พร้อมเพย์</span>
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="mb-6 text-[12px] text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] p-3.5 rounded-xl flex gap-2.5 text-left leading-relaxed">
              <ShieldCheck size={16} className="text-[#A1866B] flex-shrink-0 mt-0.5" />
              <span>ฉันเข้าใจและยอมรับว่า <strong className="text-[#F5E9D6] font-medium">สินค้าดิจิทัลไม่สามารถขอคืนเงินได้</strong> หลังจากที่ได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว</span>
            </div>

            <button type="button"
              onClick={payMethod === 'card' ? handleCardPayment : handlePromptPay}
              disabled={loading || !omiseLoaded}
              className={`w-full py-4 rounded-xl font-bold text-[#1A140E] transition-all flex justify-center items-center gap-2 ${
                loading || !omiseLoaded 
                  ? 'bg-[#A1866B] cursor-not-allowed opacity-70' 
                  : 'bg-[#D4AF37] hover:bg-[#F1D17A] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-[#1A140E]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังดำเนินการ...
                </>
              ) : (
                `ชำระเงิน ฿${pkg.current_price.toLocaleString()}`
              )}
            </button>

            <p className="text-center text-xs text-[#A1866B] mt-6 leading-relaxed">
              ระบบชำระเงินมีความปลอดภัยระดับโลกด้วยมาตรฐาน PCI DSS Level 1 <br/>
              ข้อมูลบัตรของคุณจะไม่ถูกจัดเก็บไว้บนเซิร์ฟเวอร์ของเรา
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
