import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import ExamSetForm from '../../../../../components/admin/ExamSetForm'
import { updateExamSetAction } from '../../actions'

export default async function EditExamSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )

  const { data: examSet } = await supabase
    .from('exam_sets')
    .select('*')
    .eq('id', id)
    .single()

  if (!examSet) {
    notFound()
  }

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name')
    .order('name')

  // Fetch linked questions
  const { data: linkedQuestions } = await supabase
    .from('exam_set_questions')
    .select(`
      sort_order,
      questions (id, content, subject, topic, law, difficulty, is_common, category)
    `)
    .eq('exam_set_id', id)
    .order('sort_order', { ascending: true })

  // Format linked questions to match Question type
  const selectedQuestionsData = (linkedQuestions || []).map(lq => lq.questions).filter(Boolean)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Edit Exam Set</h1>
        <p className="text-[#A1866B] mt-1">Modify exam details and question selection.</p>
      </div>

      <ExamSetForm 
        initialData={examSet}
        packages={packages || []} 
        selectedQuestionsData={selectedQuestionsData}
        onSubmit={async (data) => updateExamSetAction(id, data)} 
        isEdit={true}
      />
    </div>
  )
}
