import { requirePermission } from '@/lib/auth/server-protect'
import { listArticleAuthorsForAdmin } from '@/app/admin/articles/actions'
import AuthorManagementClient from '@/components/admin/articles/AuthorManagementClient'

export default async function AdminArticleAuthorsPage() {
  await requirePermission('content.read')

  const res = await listArticleAuthorsForAdmin()

  return <AuthorManagementClient initialAuthors={res.data || []} />
}
