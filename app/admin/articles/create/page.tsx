import { requirePermission } from '@/lib/auth/server-protect'
import ArticleEditorClient from '@/components/admin/articles/ArticleEditorClient'

export default async function CreateArticlePage() {
  await requirePermission('content.write')

  return <ArticleEditorClient article={null} isEdit={false} />
}
