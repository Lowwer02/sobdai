import { requirePermission } from '@/lib/auth/server-protect'
import AffiliateCollectionsClient from '@/app/admin/affiliate/collections/AffiliateCollectionsClient'
import { AFFILIATE_STATUSES } from '@/lib/affiliate'

/**
 * Affiliate Collections — admin list (Server Component).
 *
 * News-list convention: direct RLS session fetch, URL-driven filters. Item
 * counts come from ONE extra junction query (collection_id only), grouped in
 * JS — no per-row N+1.
 */
export default async function AffiliateCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase } = await requirePermission('content.read')

  const params = await searchParams
  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page) || 1) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query: any = supabase
    .from('affiliate_collections')
    .select('id, name, status, created_at, updated_at', { count: 'exact' })

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }
  const validStatuses = AFFILIATE_STATUSES.map((s) => s.value)
  if (statusFilter && validStatuses.includes(statusFilter as any)) {
    query = query.eq('status', statusFilter)
  }

  query = query
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const [{ data: collections, count }, itemsRes] = await Promise.all([
    query,
    supabase.from('affiliate_collection_items').select('collection_id'),
  ])

  const itemCounts = new Map<string, number>()
  for (const row of (itemsRes.data ?? []) as { collection_id: string }[]) {
    itemCounts.set(row.collection_id, (itemCounts.get(row.collection_id) ?? 0) + 1)
  }

  const totalPages = count ? Math.ceil(count / limit) : 0

  return (
    <AffiliateCollectionsClient
      collections={(collections ?? []).map((c: any) => ({ ...c, product_count: itemCounts.get(c.id) ?? 0 }))}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
    />
  )
}
