import { requirePermission } from '@/lib/auth/server-protect'
import NewsEditorClient from '@/components/admin/news/NewsEditorClient'

/**
 * Government News — Create route (Server Component).
 *
 * Mirrors the promotions create page: auth-only guard (no SELECT needed), then
 * delegate to the editor with a null article. createNews() generates the id
 * server-side and redirects to the edit route on success, so this page never
 * needs to know the id ahead of time.
 */
export default async function CreateNewsPage() {
  await requirePermission('content.write')
  return <NewsEditorClient article={null} isEdit={false} />
}
