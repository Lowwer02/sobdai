import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import SummaryEditor from '@/components/admin/SummaryEditor'
import { updateSummary } from '../../actions'
import { redirect, notFound } from 'next/navigation'

export default async function EditSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requirePermission('content.read')

  const { id } = await params
  
  
  const { data: summary } = await supabase
    .from('summaries')
    .select('*')
    .eq('id', id)
    .single()

  if (!summary) return notFound()

  const { data: packages } = await supabase.from('packages').select('id, name').order('name')

  const handleUpdate = async (data: any) => {
    'use server'
    const res = await updateSummary(id, data)
    if (res.success) {
      redirect('/admin/summaries')
    }
    return res
  }

  return (
    <SummaryEditor 
      initialData={summary}
      packages={packages || []}
      onSubmit={handleUpdate}
      isEditing={true}
    />
  )
}
