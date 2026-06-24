import { createClient } from '@/lib/supabase/server'
import QuizClient from '@/components/QuizClient'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Question } from '@/lib/types'
import { DEMO_QUESTIONS } from '@/lib/demo_questions'
import { DEMO_QUESTIONS_2 } from '@/lib/demo_questions_2'

interface PageProps {
  params: Promise<{ examId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { examId } = await params
  return {
    title: `ทำข้อสอบ — สอบได้`,
    description: 'ฝึกทำข้อสอบราชการทีละข้อ มีคำใบ้และเฉลยละเอียด',
  }
}

export default async function QuizPage({ params }: PageProps) {
  const { examId } = await params

  // Demo mode
  if (examId === 'demo' || examId === 'demo-1') {
    return (
      <QuizClient
        questions={DEMO_QUESTIONS as Question[]}
        examTitle="สป. อว. — พ.ร.บ. แผนด้านการอุดมศึกษาฯ"
        examId={examId}
        packageId="demo-1"
      />
    )
  }

  if (examId === 'demo-2') {
    return (
      <QuizClient
        questions={DEMO_QUESTIONS_2 as Question[]}
        examTitle="สป. อว. — กรอบนโยบายและยุทธศาสตร์ อววน."
        examId={examId}
        packageId="demo-1"
      />
    )
  }

  const supabase = await createClient()

  // ตรวจสอบ auth
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '40px 32px' }}>
          <h2 className="font-display" style={{ fontSize: '22px', marginBottom: '12px' }}>
            เข้าสู่ระบบก่อนทำข้อสอบ
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            กรุณาเข้าสู่ระบบเพื่อเริ่มทำข้อสอบและบันทึกผล
          </p>
          <Link href={`/login?redirect=/quiz/${examId}`}>
            <button className="btn-primary" style={{ width: '100%', padding: '13px' }}>
              เข้าสู่ระบบ
            </button>
          </Link>
        </div>
      </div>
    )
  }

  // ตรวจสอบ access token
  const now = new Date().toISOString()
  const { data: token } = await supabase
    .from('access_tokens')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('exam_id', examId)
    .gt('expires_at', now)
    .single()

  if (!token) {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '40px 32px' }}>
          <h2 className="font-display" style={{ fontSize: '22px', marginBottom: '12px' }}>
            ยังไม่ได้ซื้อชุดข้อสอบนี้
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            ซื้อชุดข้อสอบเพื่อเข้าทำข้อสอบได้ 1 ปี
          </p>
          <Link href={`/checkout/${examId}`}>
            <button className="btn-primary" style={{ width: '100%', padding: '13px' }}>
              ซื้อชุดข้อสอบ
            </button>
          </Link>
        </div>
      </div>
    )
  }

  // ดึงข้อสอบ
  const { data: questions, error } = await supabase
    .from('questions')
    .select('*')
    .eq('exam_id', examId)
    .order('question_number', { ascending: true })

  if (error || !questions?.length) {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '40px 32px' }}>
          <h2 className="font-display" style={{ fontSize: '22px', marginBottom: '12px' }}>
            ยังไม่มีข้อสอบในชุดนี้
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>กรุณาติดต่อผู้ดูแลระบบ</p>
        </div>
      </div>
    )
  }

  // ดึงชื่อ exam
  const { data: exam } = await supabase
    .from('exams')
    .select('title, department, position')
    .eq('id', examId)
    .single()

  return (
    <QuizClient
      questions={questions as Question[]}
      examTitle={exam ? `${exam.department} — ${exam.position}` : 'ข้อสอบ'}
      examId={examId}
    />
  )
}
