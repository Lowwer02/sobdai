import { requirePermission } from '@/lib/auth/server-protect'
import AffiliateProductsClient from '@/app/admin/affiliate/AffiliateProductsClient'
import { AFFILIATE_STATUSES } from '@/lib/affiliate'

/**
 * Affiliate Products — admin list (Server Component).
 *
 * Mirrors the news admin list convention exactly: the page fetches directly
 * with the RLS-enforced session client, filtering + pagination are URL-driven,
 * and list columns never select the heavy fields (no descriptions/URLs).
 */
export default async function AffiliateProductsPage({
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
    .from('affiliate_products')
    .select('id, name, merchant, status, created_at, updated_at', { count: 'exact' })

  if (search) {
    query = query.or(`name.ilike.%${search}%,merchant.ilike.%${search}%`)
  }
  const validStatuses = AFFILIATE_STATUSES.map((s) => s.value)
  if (statusFilter && validStatuses.includes(statusFilter as any)) {
    query = query.eq('status', statusFilter)
  }

  query = query
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const { data: products, count } = await query
  const totalPages = count ? Math.ceil(count / limit) : 0

  return (
    <AffiliateProductsClient
      products={products ?? []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
    />
  )
}
