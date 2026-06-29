import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import ExamRuntime from './ExamRuntime'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'

export async function generateMetadata({ params }: { params: Promise<{ slug: string, examSetId: string }> }) {
  const { slug, examSetId } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: examSet } = await supabase
    .from('exam_sets')
    .select('title')
    .eq('id', examSetId)
    .single()

  if (!examSet) return { title: 'Exam Not Found | Sobdai' }

  return {
    title: `${examSet.title} | Sobdai`,
    description: `ทำชุดข้อสอบ: ${examSet.title}`
  }
}

export default async function ExamSetPage({ params }: { params: Promise<{ slug: string, examSetId: string }> }) {
  const { slug, examSetId } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  // 1. Fetch Package
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, slug, positions(name), organizations(name)')
    .eq('slug', slug)
    .single()

  if (!pkg) return notFound()

  // 2. Fetch Exam Set
  const { data: examSet } = await supabase
    .from('exam_sets')
    .select('*')
    .eq('id', examSetId)
    .eq('package_id', pkg.id)
    .single()

  if (!examSet) return notFound()

  // 3. Auth Check
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/package/${slug}/exam/${examSetId}`)
  }

  // 4. Access Control (Check if user bought the package, unless it's a sample)
  if (!examSet.is_sample) {
    let hasAccess = false
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile && ['admin', 'owner', 'editor', 'support'].includes(profile.role)) {
      hasAccess = true
    } else {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', user.id)
        .eq('package_id', pkg.id)
        .in('status', ORDER_COMPLETED_STATUSES)
        .maybeSingle()
      if (order) hasAccess = true
    }

    if (!hasAccess) {
      return (
        <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-[#D4AF37]/10 text-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock size={32} />
            </div>
            <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-3">เนื้อหาสงวนสิทธิ์เฉพาะผู้ซื้อ</h2>
            <p className="text-[#A1866B] mb-8 text-sm">แพ็กเกจ {pkg.name}</p>
            <div className="space-y-3">
              <Link href={`/checkout/${pkg.id}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
                สั่งซื้อแพ็กเกจ
              </Link>
              <Link href={`/package/${slug}`} className="block w-full bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors">
                กลับไปดูรายละเอียด
              </Link>
            </div>
          </div>
        </div>
      )
    }
  }

  // 5. Fetch Questions
  // using inner join on exam_set_questions
  const { data: esq, error: qError } = await supabase
    .from('exam_set_questions')
    .select(`
      sort_order,
      questions (
        id,
        content,
        choice_a,
        choice_b,
        choice_c,
        choice_d,
        correct_answer,
        hint,
        full_explanation,
        why_a_wrong,
        why_b_wrong,
        why_c_wrong,
        why_d_wrong,
        reference,
        subject,
        law,
        topic
      )
    `)
    .eq('exam_set_id', examSetId)
    .order('sort_order', { ascending: true })

  if (qError || !esq || esq.length === 0) {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-[#F5E9D6] mb-3">ยังไม่มีข้อสอบในชุดนี้</h2>
          <p className="text-[#A1866B] mb-6 text-sm">กรุณาติดต่อผู้ดูแลระบบ</p>
          <Link href={`/package/${slug}`} className="block w-full bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors">
            กลับไปแพ็กเกจ
          </Link>
        </div>
      </div>
    )
  }

  // Map to flat array and filter out nulls (hidden by RLS)
  const questions = esq.map((item: any) => item.questions).filter(Boolean)

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-[#F5E9D6] mb-3">ไม่มีข้อสอบที่เปิดให้ทำในขณะนี้</h2>
          <p className="text-[#A1866B] mb-6 text-sm">ยังไม่มีข้อสอบที่ถูกเผยแพร่ในชุดข้อสอบนี้ หรือข้อสอบทั้งหมดอาจอยู่ระหว่างการปรับปรุง</p>
          <Link href={`/package/${slug}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
            กลับไปหน้ารายละเอียด
          </Link>
        </div>
      </div>
    )
  }

  return (
    <ExamRuntime 
      pkg={pkg} 
      examSet={examSet} 
      questions={questions} 
    />
  )
}
