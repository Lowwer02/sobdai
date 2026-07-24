import { ORDER_STATUS } from '@/lib/orderUtils'
import { getBangkokDateKey, getBangkokRangeStart } from '@/lib/activity/date'

type SupabaseClient = {
  from: (table: string) => any
}

const INTERNAL_ROLES = [
  'owner',
  'admin',
  'editor',
  'support',
] as const

export type AdminDashboardMetrics = {
  businessHealth: {
    label: 'Healthy' | 'Low Activity'
    tone: 'healthy' | 'warning'
  }
  activeToday: number
  monthlyActive: number
  returningUsers: number
  newUsersToday: number
  lastActivity: string
  totalUsers: number
  revenue: number
  orders: number
  activePackages: number
  questions: number
  examSets: number
  summaries: number
}

const HEALTHY_ACTIVE_TODAY_THRESHOLD = 20
const INTERNAL_ROLE_FILTER = `(${INTERNAL_ROLES.join(',')})`

function externalProfiles(supabase: SupabaseClient) {
  return supabase.from('profiles').not('role', 'in', INTERNAL_ROLE_FILTER)
}

function getBusinessHealth(activeToday: number): AdminDashboardMetrics['businessHealth'] {
  return activeToday > HEALTHY_ACTIVE_TODAY_THRESHOLD
    ? { label: 'Healthy', tone: 'healthy' }
    : { label: 'Low Activity', tone: 'warning' }
}

function formatLastActivity(value?: string | null, now = new Date()) {
  if (!value) return 'No activity'

  const activityAt = new Date(value)
  const diffMs = now.getTime() - activityAt.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(activityAt)

  if (getBangkokDateKey(activityAt) === getBangkokDateKey(now)) {
    return `Today ${time}`
  }

  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
  }).format(activityAt)

  return `${date} ${time}`
}

export async function getAdminDashboardMetrics(supabase: SupabaseClient): Promise<AdminDashboardMetrics> {
  const todayStart = getBangkokRangeStart('day')
  const monthStart = getBangkokRangeStart('month')

  const [
    activeTodayResult,
    monthlyActiveResult,
    returningUsersResult,
    newUsersTodayResult,
    lastActivityResult,
    usersResult,
    packagesResult,
    questionsResult,
    examSetsResult,
    summariesResult,
    ordersResult,
    revenueResult,
  ] = await Promise.all([
    externalProfiles(supabase).select('id', { count: 'exact', head: true }).gte('last_seen_at', todayStart),
    externalProfiles(supabase).select('id', { count: 'exact', head: true }).gte('last_seen_at', monthStart),
    externalProfiles(supabase).select('id', { count: 'exact', head: true }).gte('last_seen_at', todayStart).lt('created_at', todayStart),
    externalProfiles(supabase).select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    externalProfiles(supabase).select('last_seen_at').not('last_seen_at', 'is', null).order('last_seen_at', { ascending: false }).limit(1).maybeSingle(),
    externalProfiles(supabase).select('id', { count: 'exact', head: true }),
    supabase.from('packages').select('id', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('questions').select('id', { count: 'exact', head: true }),
    supabase.from('exam_sets').select('id', { count: 'exact', head: true }),
    supabase.from('summaries').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('amount').eq('status', ORDER_STATUS.PAID),
  ])
  const activeToday = activeTodayResult.count ?? 0

  return {
    businessHealth: getBusinessHealth(activeToday),
    activeToday,
    monthlyActive: monthlyActiveResult.count ?? 0,
    returningUsers: returningUsersResult.count ?? 0,
    newUsersToday: newUsersTodayResult.count ?? 0,
    lastActivity: formatLastActivity(lastActivityResult.data?.last_seen_at),
    totalUsers: usersResult.count ?? 0,
    revenue: revenueResult.data?.reduce((sum: number, order: { amount: unknown }) => sum + Number(order.amount), 0) ?? 0,
    orders: ordersResult.count ?? 0,
    activePackages: packagesResult.count ?? 0,
    questions: questionsResult.count ?? 0,
    examSets: examSetsResult.count ?? 0,
    summaries: summariesResult.count ?? 0,
  }
}
