import { requirePermission } from '@/lib/auth/server-protect'
import { hasPermission } from '@/lib/auth/rbac'
import OrdersClient from './OrdersClient'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('orders.read')

  const params = await searchParams
  
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const normalizedStatusFilter = statusFilter.toLowerCase()
  const canReviewPayments = hasPermission(profile.role, 'financial.manage')

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let paymentReviewOrderIds: string[] | null = null

  if (normalizedStatusFilter === 'payment_submitted') {
    if (!canReviewPayments) {
      paymentReviewOrderIds = []
    } else {
      const { data: submittedPayments } = await supabase
        .from('payment_submissions')
        .select('order_id')
        .eq('status', 'submitted')

      paymentReviewOrderIds = Array.from(
        new Set((submittedPayments || []).map((payment: any) => payment.order_id)),
      )
    }
  }

  let query = supabase
    .from('orders')
    .select('*, profiles!inner(email), packages!inner(name)', { count: 'exact' })
    
  if (search) {
    query = query.ilike('profiles.email', `%${search}%`)
  }
  if (paymentReviewOrderIds) {
    // A value that cannot be a real UUID keeps the queue empty without
    // widening the query when there are no submissions.
    query = paymentReviewOrderIds.length > 0
      ? query.in('id', paymentReviewOrderIds)
      : query.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (normalizedStatusFilter && normalizedStatusFilter !== 'all') {
    query = query.eq('status', normalizedStatusFilter)
  }

  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: rawOrders, count } = await query

  const orderIds = (rawOrders || []).map((order: any) => order.id)
  const { data: paymentRows } = canReviewPayments && orderIds.length > 0
    ? await supabase
      .from('payment_submissions')
      .select('order_id, status, submitted_at, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
    : { data: [] as any[] }

  const latestPaymentByOrder = new Map<string, any>()
  for (const payment of paymentRows || []) {
    if (!latestPaymentByOrder.has(payment.order_id)) {
      latestPaymentByOrder.set(payment.order_id, payment)
    }
  }

  const orders = (rawOrders || []).map((o: any) => ({
    ...o,
    user_email: o.profiles?.email || 'Unknown User',
    package_name: o.packages?.name || 'Unknown Package',
    manual_payment_status: latestPaymentByOrder.get(o.id)?.status || null,
    manual_payment_submitted_at: latestPaymentByOrder.get(o.id)?.submitted_at || null,
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
      statusFilter={statusFilter || 'all'}
    />
  )
}
