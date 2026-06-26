import Link from 'next/link'
import { LayoutDashboard, Package, FileQuestion, UploadCloud, Users, ShoppingCart, BarChart, Settings, LogOut, CheckSquare, BookOpen } from 'lucide-react'

const learningNav = [
  { name: 'Packages', href: '/admin/packages', icon: Package },
  { name: 'Exam Sets', href: '/admin/exam-sets', icon: CheckSquare },
  { name: 'Questions', href: '/admin/questions', icon: FileQuestion },
  { name: 'Summary Bank', href: '/admin/summaries', icon: BookOpen },
  { name: 'Import Center', href: '/admin/import', icon: UploadCloud },
]

const managementNav = [
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex flex-col md:flex-row font-sans">
      
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-[#1A140E] border-r border-[#D4AF37]/20 flex flex-col md:min-h-screen">
        <div className="p-6 border-b border-[#D4AF37]/20">
          <Link href="/" className="flex items-center gap-2 text-[#D4AF37] font-display font-bold text-xl drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <circle cx="12" cy="10" r="3" fill="currentColor"/>
            </svg>
            Sobdai Admin
          </Link>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="px-3 mb-2">
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
            >
              <LayoutDashboard size={18} />
              <span className="text-sm font-medium">Dashboard</span>
            </Link>
          </div>
          
          <div className="mt-6 mb-2 px-6">
            <h3 className="text-xs font-bold text-[#A1866B] uppercase tracking-wider">Learning</h3>
          </div>
          <ul className="space-y-1 px-3">
            {learningNav.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
                  >
                    <Icon size={18} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 mb-2 px-6">
            <h3 className="text-xs font-bold text-[#A1866B] uppercase tracking-wider">Management</h3>
          </div>
          <ul className="space-y-1 px-3">
            {managementNav.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
                  >
                    <Icon size={18} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-[#D4AF37]/20">
          <Link href="/logout" className="flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors">
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-10">
          {children}
        </div>
      </main>
    </div>
  )
}
