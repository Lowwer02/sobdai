import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { getArticleById, getArticlePackageRelations } from '@/app/admin/articles/actions'
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

  const relRes = await getArticlePackageRelations(id)
  if (!relRes.success) {
    throw new Error(relRes.error || 'ไม่สามารถโหลดข้อมูลแพ็กเกจที่เกี่ยวข้องได้')
  }

  return (
    <ArticleEditorClient
      article={article}
      isEdit={true}
      initialPackageRelations={relRes.data}
    />
  )
}
