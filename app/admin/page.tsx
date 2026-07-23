import { getAdminSession } from '@/lib/auth/server-protect'
import { getAdminDashboardMetrics } from '@/lib/admin/dashboardMetrics'
import {
  Activity,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileQuestion,
  Package,
  ShoppingCart,
  UserPlus,
  Users,
} from 'lucide-react'

export const metadata = {
  title: 'Admin Dashboard | Sobdai',
}

function StatCard({ title, value, icon: Icon, trend }: { title: string, value: string | number, icon: any, trend?: string }) {
  return (
    <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 flex flex-col h-full relative overflow-hidden group hover:border-[#D4AF37]/30 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37]/20 transition-colors">
          <Icon size={20} />
        </div>
        {trend && (
          <div className="text-[#22C55E] text-xs font-bold px-2 py-1 bg-[#22C55E]/10 rounded-full">
            {trend}
          </div>
        )}
      </div>
      <div className="text-[#A1866B] text-sm mb-1">{title}</div>
      <div className="text-[#D4AF37] text-3xl font-display font-bold tracking-tight">{value}</div>
    </div>
  )
}

function MetricSection({
  title,
  children,
  columns = 'lg:grid-cols-4',
}: {
  title: string
  children: React.ReactNode
  columns?: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[#A1866B]">{title}</h2>
      <div className={`grid grid-cols-1 md:grid-cols-2 ${columns} gap-6`}>
        {children}
      </div>
    </section>
  )
}

export default async function AdminDashboard() {
  const { supabase } = await getAdminSession()
  const metrics = await getAdminDashboardMetrics(supabase)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Business Health Dashboard</h1>
        <p className="text-[#A1866B] mt-1">Real-time business and usage statistics from Supabase.</p>
      </div>

      <MetricSection title="Usage" columns="lg:grid-cols-3">
        <StatCard title="Active Today" value={metrics.activeToday.toLocaleString()} icon={Activity} />
        <StatCard title="Monthly Active" value={metrics.monthlyActive.toLocaleString()} icon={CalendarDays} />
        <StatCard title="New Users Today" value={metrics.newUsersToday.toLocaleString()} icon={UserPlus} />
      </MetricSection>

      <MetricSection title="Business">
        <StatCard title="Total Users" value={metrics.totalUsers.toLocaleString()} icon={Users} />
        <StatCard title="Revenue" value={`฿${metrics.revenue.toLocaleString()}`} icon={ShoppingCart} />
        <StatCard title="Orders" value={metrics.orders.toLocaleString()} icon={ShoppingCart} />
        <StatCard title="Active Packages" value={metrics.activePackages.toLocaleString()} icon={Package} />
      </MetricSection>

      <MetricSection title="Content" columns="lg:grid-cols-3">
        <StatCard title="Questions" value={metrics.questions.toLocaleString()} icon={FileQuestion} />
        <StatCard title="Exam Sets" value={metrics.examSets.toLocaleString()} icon={CheckSquare} />
        <StatCard title="Summary Bank" value={metrics.summaries.toLocaleString()} icon={BookOpen} />
      </MetricSection>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#A1866B]">System</h2>
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 max-w-xl">
          <h3 className="text-lg font-bold text-[#F5E9D6] mb-4">System Status</h3>
          <div className="space-y-4">
            <div className="p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg flex items-center justify-between">
              <div className="text-[#F5E9D6] text-sm font-medium">Database</div>
              <div className="flex items-center gap-1.5 text-xs text-[#22C55E] font-bold">
                <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></div>
                Connected
              </div>
            </div>
            <div className="p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg flex items-center justify-between">
              <div className="text-[#F5E9D6] text-sm font-medium">Authentication</div>
              <div className="flex items-center gap-1.5 text-xs text-[#22C55E] font-bold">
                <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></div>
                Connected
              </div>
            </div>
            <div className="p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg flex items-center justify-between">
              <div className="text-[#F5E9D6] text-sm font-medium">Mock Data</div>
              <div className="text-xs text-[#D4AF37] font-bold">0%</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
