import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Lock, Clock, FileText, ChevronRight, Activity, Zap } from 'lucide-react'
import ExamRuntime from './ExamRuntime'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'

export async function generateMetadata({ params }: { params: Promise<{ slug: string, examSetId: string }> }) {
  const { examSetId } = await params

  const supabase = await createClient()

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

export default async function ExamSetPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string, examSetId: string }>,
  searchParams: Promise<{ mode?: string }>
}) {
  const { slug, examSetId } = await params
  const { mode } = await searchParams

  const supabase = await createClient()

  // 1. Fetch package + current user in parallel (independent of each other).
  const [pkgResult, userResult] = await Promise.all([
    supabase
      .from('packages')
      .select('id, name, slug, positions(name), organizations(name)')
      .eq('slug', slug)
      .single(),
    supabase.auth.getUser(),
  ])

  const pkg = pkgResult.data
  if (!pkg) return notFound()

  // 2. Fetch exam set (depends on pkg.id).
  const { data: examSet } = await supabase
    .from('exam_sets')
    .select('*')
    .eq('id', examSetId)
    .eq('package_id', pkg.id)
    .single()

  if (!examSet) return notFound()

  // 3. Auth check
  const user = userResult.data.user
  if (!user) {
    redirect(`/login?redirect=/package/${slug}/exam/${examSetId}`)
  }

  // 4. Access control + question fetch, in parallel.
  //    - profile and order together determine access (for non-sample sets).
  //    - questions are needed regardless of mode, so start them now.
  //    Running these three at once collapses 2-3 sequential round-trips into one.
  const needsAccessCheck = !examSet.is_sample
  const [profileResult, orderResult, questionsResult] = await Promise.all([
    needsAccessCheck
      ? supabase.from('profiles').select('role').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    // order only matters when not staff; fetch anyway to keep it parallel
    needsAccessCheck
      ? supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('package_id', pkg.id)
          .in('status', ORDER_COMPLETED_STATUSES)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
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
      .order('sort_order', { ascending: true }),
  ])

  if (needsAccessCheck) {
    const profile = profileResult.data
    const staffRoles = ['admin', 'owner', 'editor', 'support']
    const isStaff = profile && staffRoles.includes(profile.role)
    const hasOrder = Boolean(orderResult.data)
    if (!isStaff && !hasOrder) {
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

  // 5. Questions (fetched in parallel above).
  const esq = questionsResult.data
  const qError = questionsResult.error

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

  // If no mode is selected, render the Landing UI
  if (!mode) {
    return (
      <div className="min-h-screen bg-[#0F0B07] pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumb / Back */}
          <Link href={`/package/${slug}`} className="inline-flex items-center text-sm font-medium text-[#A1866B] hover:text-[#D4AF37] transition-colors mb-8">
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
            กลับไปที่ {pkg.name}
          </Link>

          {/* Header */}
          <div className="mb-12">
            <h1 className="text-3xl md:text-5xl font-display font-bold text-[#F5E9D6] mb-4 leading-tight">
              {examSet.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[#A1866B]">
              <div className="flex items-center bg-[rgba(255,255,255,0.03)] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)]">
                <FileText className="w-4 h-4 mr-2 text-[#D4AF37]" />
                {questions.length} ข้อ
              </div>
              {examSet.duration_minutes && (
                <div className="flex items-center bg-[rgba(255,255,255,0.03)] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)]">
                  <Clock className="w-4 h-4 mr-2 text-[#D4AF37]" />
                  {examSet.duration_minutes} นาที
                </div>
              )}
              {examSet.difficulty && (
                <div className="flex items-center bg-[rgba(255,255,255,0.03)] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)]">
                  <Activity className="w-4 h-4 mr-2 text-[#D4AF37]" />
                  ระดับความยาก: {examSet.difficulty}
                </div>
              )}
            </div>
          </div>

          {/* Mode Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Practice Mode */}
            <Link href={`?mode=practice`} className="group relative block bg-[#1A140E] border border-[rgba(255,255,255,0.08)] hover:border-orange-500/50 rounded-3xl p-8 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(249,115,22,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl group-hover:bg-orange-500/20 transition-colors" />
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                    <Zap className="w-7 h-7" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#F5E9D6]">{questions.length} ข้อ</div>
                    <div className="text-xs text-[#A1866B]">⏱ ประมาณ {examSet.duration_minutes || questions.length} นาที</div>
                    <div className="text-xs text-orange-400 mt-1">ระดับ : {examSet.difficulty || 'ปานกลาง'}</div>
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold font-display text-[#F5E9D6] mb-4 group-hover:text-orange-400 transition-colors">
                  Practice Mode
                </h3>
                
                <ul className="space-y-3 mb-8 text-[#A1866B] text-sm">
                  <li className="flex items-start">
                    <span className="text-orange-500 mr-2">•</span>
                    เรียนทีละข้อ
                  </li>
                  <li className="flex items-start">
                    <span className="text-orange-500 mr-2">•</span>
                    เหมาะสำหรับการทบทวน
                  </li>
                  <li className="flex items-start">
                    <span className="text-orange-500 mr-2">•</span>
                    เฉลยทันทีหลังตอบ
                  </li>
                </ul>

                <button className="w-full py-3 px-6 bg-orange-500/10 text-orange-500 font-bold rounded-xl group-hover:bg-orange-500 group-hover:text-[#1A140E] transition-all">
                  เริ่มฝึกทำ
                </button>
              </div>
            </Link>

            {/* Mock Exam */}
            <Link href={`?mode=mock`} className="group relative block bg-[#1A140E] border border-[rgba(255,255,255,0.08)] hover:border-blue-500/50 rounded-3xl p-8 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(59,130,246,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors" />
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                    <Clock className="w-7 h-7" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#F5E9D6]">{questions.length} ข้อ</div>
                    <div className="text-xs text-[#A1866B]">⏱ จำกัดเวลา {examSet.duration_minutes || questions.length} นาที</div>
                    <div className="text-xs text-blue-400 mt-1">ระดับ : {examSet.difficulty || 'ปานกลาง'}</div>
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold font-display text-[#F5E9D6] mb-4 group-hover:text-blue-400 transition-colors">
                  Mock Exam
                </h3>
                
                <ul className="space-y-3 mb-8 text-[#A1866B] text-sm">
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    จำลองสนามสอบจริง
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    จับเวลา
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    เฉลยหลังส่งข้อสอบ
                  </li>
                </ul>

                <button className="w-full py-3 px-6 bg-blue-500/10 text-blue-500 font-bold rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-all">
                  เริ่มสอบ
                </button>
              </div>
            </Link>

          </div>
        </div>
      </div>
    )
  }

  // If mode is selected, render Runtime (Current logic)
  return (
    <ExamRuntime 
      pkg={pkg} 
      examSet={examSet} 
      questions={questions} 
      mode={mode}
    />
  )
}
