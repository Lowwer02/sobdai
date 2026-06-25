export const metadata = {
  title: 'Admin Dashboard | Sobdai',
}

import { Users, Package, FileQuestion, ShoppingCart } from 'lucide-react'

function StatCard({ title, value, icon: Icon, trend }: { title: string, value: string, icon: any, trend: string }) {
  return (
    <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 flex flex-col h-full relative overflow-hidden">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
          <Icon size={20} />
        </div>
        <div className="text-[#22C55E] text-xs font-bold px-2 py-1 bg-[#22C55E]/10 rounded-full">
          {trend}
        </div>
      </div>
      <div className="text-[#A1866B] text-sm mb-1">{title}</div>
      <div className="text-[#D4AF37] text-3xl font-display font-bold tracking-tight">{value}</div>
    </div>
  )
}

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Overview Dashboard</h1>
        <p className="text-[#A1866B] mt-1">Welcome to the Sobdai Admin Center.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Users" value="1,432" icon={Users} trend="+12%" />
        <StatCard title="Active Packages" value="8" icon={Package} trend="+2" />
        <StatCard title="Questions Bank" value="14,205" icon={FileQuestion} trend="+420" />
        <StatCard title="Total Revenue" value="฿84,500" icon={ShoppingCart} trend="+18%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 min-h-[300px]">
          <h2 className="text-lg font-bold text-[#F5E9D6] mb-4">Recent Activity</h2>
          <div className="flex items-center justify-center h-[200px] text-[#A1866B] text-sm">
            Activity chart will be rendered here
          </div>
        </div>
        
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#F5E9D6] mb-4">Pending Reviews</h2>
          <div className="space-y-4">
             <div className="p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg">
                <div className="text-[#F5E9D6] text-sm font-medium mb-1">นักวิเคราะห์นโยบาย อว.</div>
                <div className="text-[#A1866B] text-xs">25 questions pending review</div>
             </div>
             <div className="p-3 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-lg">
                <div className="text-[#F5E9D6] text-sm font-medium mb-1">นักวิชาการศึกษา ปภ.</div>
                <div className="text-[#A1866B] text-xs">10 questions pending review</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
