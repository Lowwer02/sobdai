import { requirePermission } from '@/lib/auth/server-protect'
import AffiliateProductEditorClient from '@/components/admin/affiliate/AffiliateProductEditorClient'

/**
 * Affiliate Products — Create route. Mirrors the news create page: auth-only
 * guard, delegate to the editor with a null product. createAffiliateProduct()
 * generates the id server-side and redirects to the edit route on success.
 */
export default async function CreateAffiliateProductPage() {
  await requirePermission('content.write')
  return <AffiliateProductEditorClient product={null} isEdit={false} />
}
