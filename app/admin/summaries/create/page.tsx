import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import SummaryEditor from '@/components/admin/SummaryEditor'
import { createSummary } from '../actions'
import { redirect } from 'next/navigation'

export default async function CreateSummaryPage() {
  const { supabase, profile } = await requirePermission('content.read')

  
  const { data: packages } = await supabase.from('packages').select('id, name').order('name')

  const handleCreate = async (data: any) => {
    'use server'
    const res = await createSummary(data)
    if (res.success) {
      redirect('/admin/summaries')
    }
    return res
  }

  return (
    <SummaryEditor 
      packages={packages || []}
      onSubmit={handleCreate}
    />
  )
}
