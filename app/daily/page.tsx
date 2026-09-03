import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DailyRuntime from '@/components/daily/DailyRuntime'
import { loadDailyState } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ข้อสอบประจำวัน 5 ข้อ | Sobdai',
  description: 'ฝึกสั้น ๆ วันละ 5 ข้อ ใช้เวลาเพียงไม่กี่นาที เพื่อฝึกให้ต่อเนื่องทุกวัน',
  robots: { index: false, follow: false },
}

function MessageCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-[60vh] bg-[#0F0B07] px-4 py-16 text-[#F5E9D6]">
      <div className="mx-auto max-w-xl rounded-3xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] p-8 text-center shadow-xl">
        <h1 className="mb-3 text-3xl font-bold font-display">{title}</h1>
        <p className="text-[#A1866B]">{message}</p>
      </div>
    </div>
  )
}

export default async function DailyPage() {
  const result = await loadDailyState()

  if (result.status === 'unauthenticated') {
    redirect('/login?redirect=/daily')
  }

  if (result.status === 'error') {
    return <MessageCard title="ข้อสอบประจำวัน 5 ข้อ" message={result.message} />
  }

  if (result.status === 'unavailable') {
    return (
      <MessageCard
        title="ข้อสอบประจำวัน 5 ข้อยังไม่พร้อมสำหรับวันนี้"
        message="ขณะนี้ยังมีข้อสอบที่เผยแพร่ไม่ครบ 5 ข้อ กรุณากลับมาใหม่ภายหลัง"
      />
    )
  }

  return <DailyRuntime initialState={result.state} />
}
