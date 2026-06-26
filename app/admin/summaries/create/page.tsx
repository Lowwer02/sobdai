import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SummaryEditor from '@/components/admin/SummaryEditor'
import { createSummary } from '../actions'
import { redirect } from 'next/navigation'

export default async function CreateSummaryPage() {
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
