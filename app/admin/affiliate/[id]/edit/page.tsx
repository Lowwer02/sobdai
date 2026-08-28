import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import AffiliateProductEditorClient from '@/components/admin/affiliate/AffiliateProductEditorClient'

/**
 * Affiliate Products — Edit route. Permission + RLS-enforced fetch of the full
 * row, then notFound() if missing/hidden (the promotions/news edit convention).
 */
export default async function EditAffiliateProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase } = await requirePermission('content.write')
  const { id } = await params

  const { data: product } = await supabase
    .from('affiliate_products')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!product) notFound()

  return <AffiliateProductEditorClient product={product} isEdit />
}
