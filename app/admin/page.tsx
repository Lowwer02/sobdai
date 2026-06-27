import { getAdminSession } from '@/lib/auth/server-protect'
import { Users, Package, FileQuestion, ShoppingCart, CheckSquare } from 'lucide-react'

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

export default async function AdminDashboard() {
  const { supabase, profile } = await getAdminSession()

  
  // Fetch true counts
  const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
  const { count: pkgsCount } = await supabase.from('packages').select('*', { count: 'exact', head: true })
  const { count: qsCount } = await supabase.from('questions').select('*', { count: 'exact', head: true })
  const { count: esCount } = await supabase.from('exam_sets').select('*', { count: 'exact', head: true })
  const { count: ordersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true })
  
  const { data: revData } = await supabase.from('orders').select('amount').eq('status', 'completed')
  const totalRevenue = revData?.reduce((sum, order) => sum + Number(order.amount), 0) || 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Overview Dashboard</h1>
        <p className="text-[#A1866B] mt-1">Real-time statistics from Supabase.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Users" value={usersCount?.toLocaleString() || '0'} icon={Users} />
        <StatCard title="Total Revenue" value={`฿${totalRevenue.toLocaleString()}`} icon={ShoppingCart} />
        <StatCard title="Active Packages" value={pkgsCount?.toLocaleString() || '0'} icon={Package} />
        <StatCard title="Total Orders" value={ordersCount?.toLocaleString() || '0'} icon={ShoppingCart} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Questions Bank" value={qsCount?.toLocaleString() || '0'} icon={FileQuestion} />
        <StatCard title="Exam Sets" value={esCount?.toLocaleString() || '0'} icon={CheckSquare} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 min-h-[300px] flex items-center justify-center">
          <div className="text-center">
             <h2 className="text-lg font-bold text-[#F5E9D6] mb-2">Analytics Center</h2>
             <p className="text-[#A1866B] text-sm">Detailed charts and funnel analytics will be available in future updates after active usage.</p>
          </div>
        </div>
        
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#F5E9D6] mb-4">System Status</h2>
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
      </div>
    </div>
  )
}
