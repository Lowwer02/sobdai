import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import OrdersClient from './OrdersClient'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )

  let query = supabase
    .from('orders')
    .select('*, profiles!inner(email), packages!inner(name)', { count: 'exact' })
    
  if (search) {
    query = query.ilike('profiles.email', `%${search}%`)
  }
  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('status', statusFilter.toLowerCase())
  }

  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: rawOrders, count } = await query

  const orders = (rawOrders || []).map((o: any) => ({
    ...o,
    user_email: o.profiles?.email || 'Unknown User',
    package_name: o.packages?.name || 'Unknown Package'
  }))

  const totalPages = count ? Math.ceil(count / limit) : 0

  // Fetch lists for the Manual Grant Modal
  const { data: users } = await supabase.from('profiles').select('id, email').order('email')
  const { data: packages } = await supabase.from('packages').select('id, name').order('name')

  return (
    <OrdersClient 
      orders={orders} 
      users={users || []}
      packages={packages || []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
    />
  )
}
