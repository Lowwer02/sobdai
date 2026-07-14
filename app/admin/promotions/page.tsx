import { requirePermission } from '@/lib/auth/server-protect'
import PromotionsClient from './PromotionsClient'
import { applyContentOrdering } from '@/lib/contentOrdering'

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase } = await requirePermission('content.read')

  const params = await searchParams
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const typeFilter = typeof params.type === 'string' ? params.type : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query: any = supabase
    .from('promotions')
    .select('*', { count: 'exact' })

  if (search) {
    query = query.or(`internal_name.ilike.%${search}%,title.ilike.%${search}%`)
  }
  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('status', statusFilter)
  }
  if (typeFilter && typeFilter !== 'All') {
    query = query.eq('type', typeFilter)
  }

  // Newest first by default; priority tiebreak via the shared ordering helper.
  query = applyContentOrdering(query).range(from, to)

  const { data: promotions, count } = await query
  const totalPages = count ? Math.ceil(count / limit) : 0

  return (
    <PromotionsClient
      promotions={promotions || []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      typeFilter={typeFilter}
    />
  )
}
