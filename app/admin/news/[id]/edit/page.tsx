import { requirePermission } from '@/lib/auth/server-protect'
import { notFound } from 'next/navigation'
import NewsEditorClient from '@/components/admin/news/NewsEditorClient'
import type { News } from '@/lib/news'

/**
 * Government News — Edit route (Server Component).
 *
 * Mirrors the promotions edit page: permission + RLS-enforced fetch of the full
 * row (select('*') so the editor can pass through fields it doesn't own — see
 * NewsEditorClient), then notFound() if the row is missing or RLS-hidden.
 */
export default async function EditNewsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase } = await requirePermission('content.write')
  const { id } = await params

  const { data: article } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!article) notFound()

  return <NewsEditorClient article={article as News} isEdit />
}
