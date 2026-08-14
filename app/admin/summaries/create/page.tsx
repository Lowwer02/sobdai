import { requirePermission } from '@/lib/auth/server-protect'
import SummaryEditor from '@/components/admin/SummaryEditor'
import { createSummary } from '../actions'

export default async function CreateSummaryPage() {
  const { supabase } = await requirePermission('content.read')

  const { data: packages, error } = await supabase
    .from('packages')
    .select('id, name')
    .order('name')

  if (error) {
    throw new Error('Available Packages could not be loaded safely.')
  }

  const handleCreate = async (data: any) => {
    'use server'
    const res = await createSummary(data)
    return res
  }

  return (
    <SummaryEditor 
      packages={packages || []}
      onSubmit={handleCreate}
      summaryKind="kp_native"
    />
  )
}
