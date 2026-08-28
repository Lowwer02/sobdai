import { requirePermission } from '@/lib/auth/server-protect'
import { listActiveArticleAuthors } from '@/app/admin/articles/actions'
import ArticleEditorClient from '@/components/admin/articles/ArticleEditorClient'

export default async function CreateArticlePage() {
  const { supabase } = await requirePermission('content.write')

  const [authorsRes, collectionsRes] = await Promise.all([
    listActiveArticleAuthors(),
    // Affiliate collections for the assignment select (all statuses — RLS
    // gives staff full visibility; non-published ones are labeled).
    supabase
      .from('affiliate_collections')
      .select('id, name, status')
      .order('name', { ascending: true }),
  ])

  return (
    <ArticleEditorClient
      article={null}
      isEdit={false}
      initialAuthors={authorsRes.data || []}
      affiliateCollections={
        (collectionsRes.data ?? []) as { id: string; name: string; status: string }[]
      }
    />
  )
}
