import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import { notFound } from 'next/navigation'
import ExamSetForm from '../../../../../components/admin/ExamSetForm'
import { updateExamSetAction } from '../../actions'

export default async function EditExamSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requirePermission('content.read')

  const { id } = await params
  
  
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
      questions (id, content, subject, topic, law, difficulty, is_common, category, status, question_code)
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
        onSubmit={updateExamSetAction.bind(null, id)} 
        isEdit={true}
      />
    </div>
  )
}
