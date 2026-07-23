import { ORDER_STATUS } from '@/lib/orderUtils'
import { getBangkokRangeStart } from '@/lib/activity/date'

type SupabaseClient = {
  from: (table: string) => any
}

export type AdminDashboardMetrics = {
  activeToday: number
  monthlyActive: number
  newUsersToday: number
  totalUsers: number
  revenue: number
  orders: number
  activePackages: number
  questions: number
  examSets: number
  summaries: number
}

export async function getAdminDashboardMetrics(supabase: SupabaseClient): Promise<AdminDashboardMetrics> {
  const todayStart = getBangkokRangeStart('day')
  const monthStart = getBangkokRangeStart('month')

  const [
    activeTodayResult,
    monthlyActiveResult,
    newUsersTodayResult,
    usersResult,
    packagesResult,
    questionsResult,
    examSetsResult,
    summariesResult,
    ordersResult,
    revenueResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen_at', todayStart),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen_at', monthStart),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('packages').select('id', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('questions').select('id', { count: 'exact', head: true }),
    supabase.from('exam_sets').select('id', { count: 'exact', head: true }),
    supabase.from('summaries').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('amount').eq('status', ORDER_STATUS.PAID),
  ])

  return {
    activeToday: activeTodayResult.count ?? 0,
    monthlyActive: monthlyActiveResult.count ?? 0,
    newUsersToday: newUsersTodayResult.count ?? 0,
    totalUsers: usersResult.count ?? 0,
    revenue: revenueResult.data?.reduce((sum: number, order: { amount: unknown }) => sum + Number(order.amount), 0) ?? 0,
    orders: ordersResult.count ?? 0,
    activePackages: packagesResult.count ?? 0,
    questions: questionsResult.count ?? 0,
    examSets: examSetsResult.count ?? 0,
    summaries: summariesResult.count ?? 0,
  }
}
