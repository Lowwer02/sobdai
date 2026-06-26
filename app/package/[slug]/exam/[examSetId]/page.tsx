import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ExamRuntime from './ExamRuntime'

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
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-[#F5E9D6] mb-3">เข้าสู่ระบบก่อนทำข้อสอบ</h2>
          <p className="text-[#A1866B] mb-6 text-sm">กรุณาเข้าสู่ระบบเพื่อเริ่มทำข้อสอบและบันทึกผล</p>
          <Link href={`/login?redirect=/package/${slug}/exam/${examSetId}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  // 4. Access Control (Check if user bought the package, unless it's a sample)
  if (!examSet.is_sample) {
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('package_id', pkg.id)
      .eq('status', 'completed')
      .maybeSingle()

    if (!order) {
      return (
        <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-[#F5E9D6] mb-3">ยังไม่ได้ซื้อแพ็กเกจนี้</h2>
            <p className="text-[#A1866B] mb-6 text-sm">ข้อสอบชุดนี้สงวนสิทธิ์สำหรับผู้ซื้อแพ็กเกจเท่านั้น</p>
            <Link href={`/checkout/${pkg.id}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors mb-3">
              สั่งซื้อแพ็กเกจ
            </Link>
            <Link href={`/package/${slug}`} className="block w-full bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors">
              กลับไปดูรายละเอียด
            </Link>
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

  // Map to flat array
  const questions = esq.map((item: any) => item.questions)

  return (
    <ExamRuntime 
      pkg={pkg} 
      examSet={examSet} 
      questions={questions} 
    />
  )
}
