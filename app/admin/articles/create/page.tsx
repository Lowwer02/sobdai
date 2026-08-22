import { requirePermission } from '@/lib/auth/server-protect'
import { listActiveArticleAuthors } from '@/app/admin/articles/actions'
import ArticleEditorClient from '@/components/admin/articles/ArticleEditorClient'

export default async function CreateArticlePage() {
  await requirePermission('content.write')

  const authorsRes = await listActiveArticleAuthors()

  return (
    <ArticleEditorClient
      article={null}
      isEdit={false}
      initialAuthors={authorsRes.data || []}
    />
  )
}
