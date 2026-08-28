import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import AffiliateCollectionEditorClient from '@/components/admin/affiliate/AffiliateCollectionEditorClient'
import type { AffiliateCollection } from '@/lib/affiliate'

/**
 * Affiliate Collections — Edit route. Loads the collection + its ordered items
 * (joined to the product label columns) so the picker opens with the live
 * selection in visitor order (the news edit page's pre-load convention).
 */
export default async function EditAffiliateCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase } = await requirePermission('content.write')
  const { id } = await params

  const [collectionRes, itemsRes] = await Promise.all([
    supabase.from('affiliate_collections').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('affiliate_collection_items')
      .select(`sort_order, product_id, affiliate_products ( name, merchant, status )`)
      .eq('collection_id', id)
      .order('sort_order', { ascending: true }),
  ])

  if (!collectionRes.data) notFound()

  const items = ((itemsRes.data ?? []) as unknown as {
    product_id: string
    affiliate_products: { name: string | null; merchant: string | null; status: string | null } | null
  }[])
    .filter((r) => r.affiliate_products)
    .map((r) => ({
      id: r.product_id,
      name: r.affiliate_products!.name || r.product_id,
      merchant: r.affiliate_products!.merchant || '',
      status: r.affiliate_products!.status || 'draft',
    }))

  return (
    <AffiliateCollectionEditorClient
      collection={collectionRes.data as AffiliateCollection}
      initialItems={items}
      isEdit
    />
  )
}
