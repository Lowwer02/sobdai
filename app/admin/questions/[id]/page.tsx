import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import { notFound } from 'next/navigation'
import EditQuestionClient from './EditQuestionClient'

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requirePermission('content.read')

  const { id } = await params
  
  
  const { data: question, error } = await supabase
    .from('questions')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !question) {
    notFound()
  }

  return <EditQuestionClient question={question} />
}
