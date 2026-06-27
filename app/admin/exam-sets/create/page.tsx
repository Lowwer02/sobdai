import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import ExamSetForm from '../../../../components/admin/ExamSetForm'
import { createExamSetAction } from '../actions'

export default async function CreateExamSetPage() {
  const { supabase, profile } = await requirePermission('content.read')

  
  const { data: packages } = await supabase
    .from('packages')
    .select('id, name')
    .order('name')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Create Exam Set</h1>
        <p className="text-[#A1866B] mt-1">Assemble questions into a new exam bundle.</p>
      </div>

      <ExamSetForm 
        packages={packages || []} 
        onSubmit={createExamSetAction} 
      />
    </div>
  )
}
