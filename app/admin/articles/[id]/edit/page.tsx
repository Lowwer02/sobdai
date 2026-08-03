import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { getArticleById } from '@/app/admin/articles/actions'
import ArticleEditorClient from '@/components/admin/articles/ArticleEditorClient'

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('content.write')
  const { id } = await params

  const article = await getArticleById(id)
  if (!article) {
    notFound()
  }

  return <ArticleEditorClient article={article} isEdit={true} />
}
