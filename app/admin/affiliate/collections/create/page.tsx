import { requirePermission } from '@/lib/auth/server-protect'
import AffiliateCollectionEditorClient from '@/components/admin/affiliate/AffiliateCollectionEditorClient'

/**
 * Affiliate Collections — Create route. Mirrors the news create page: auth-only
 * guard, null collection; createAffiliateCollection() generates the id
 * server-side and redirects to the edit route on success (products attach in
 * the editor, after the parent exists).
 */
export default async function CreateAffiliateCollectionPage() {
  await requirePermission('content.write')
  return <AffiliateCollectionEditorClient collection={null} initialItems={[]} isEdit={false} />
}
