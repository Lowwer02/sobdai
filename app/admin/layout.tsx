import Link from 'next/link'
import { LayoutDashboard, Package, FileQuestion, UploadCloud, Users, ShoppingCart, BarChart, Settings, LogOut, CheckSquare, BookOpen, Building2, UserCircle2, FileText, Library, Home, Heart, Megaphone, Sparkles, Newspaper, Share2, ShoppingBag } from 'lucide-react'
import { requireStaff } from '@/lib/auth/server-protect'
import { hasPermission } from '@/lib/auth/rbac'

const learningNav = [
  { name: 'Generate Assessment', href: '/admin/generate', icon: Sparkles, permission: 'content.write' },
  { name: 'Packages', href: '/admin/packages', icon: Package, permission: 'content.read' },
  { name: 'Exam Sets', href: '/admin/exam-sets', icon: CheckSquare, permission: 'content.read' },
  { name: 'Questions', href: '/admin/questions', icon: FileQuestion, permission: 'content.read' },
  { name: 'Summary Bank', href: '/admin/summaries', icon: BookOpen, permission: 'content.read' },
  { name: 'Import Center', href: '/admin/import', icon: UploadCloud, permission: 'content.write' },
  { name: 'Written Exam', href: '/admin/written-exams', icon: FileText, permission: 'content.read' },
]

const managementNav = [
  { name: 'Organizations', href: '/admin/organizations', icon: Building2, permission: 'system.manage' },
  { name: 'Positions', href: '/admin/positions', icon: UserCircle2, permission: 'system.manage' },
  { name: 'Users', href: '/admin/users', icon: Users, permission: 'users.read' },
  { name: 'Orders', href: '/admin/orders', icon: ShoppingCart, permission: 'orders.read' },
  { name: 'Homepage', href: '/admin/homepage', icon: Home, permission: 'content.write' },
  { name: 'Social Follow', href: '/admin/social-follow', icon: Share2, permission: 'content.write' },
  { name: 'Support', href: '/admin/support', icon: Heart, permission: 'support.manage' },

  { name: 'Promotions', href: '/admin/promotions', icon: Megaphone, permission: 'content.write' },
  // Editorial publishing item: government news has a draft→publish→archive
  // lifecycle, grouping with Promotions/Homepage. permission 'content.read'
  // matches the /admin/news list-page gate (write actions gate separately on
  // content.write), mirroring how Packages sits at content.read.
  { name: 'News', href: '/admin/news', icon: Newspaper, permission: 'content.read' },
  { name: 'Articles', href: '/admin/articles', icon: FileText, permission: 'content.read' },
  // Affiliate CMS (M1): products + collections assigned to News/Articles.
  // Same content.read gate as News/Articles — write/publish/delete actions
  // gate separately on their own permissions.
  { name: 'Affiliate', href: '/admin/affiliate', icon: ShoppingBag, permission: 'content.read' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Staff boundary — the Single Source of Truth for entering /admin.
  // requireStaff() authenticates the session AND verifies the profile role is
  // staff (owner / admin / editor / support). A normal `user` is rejected with
  // forbidden() (app/forbidden.tsx, HTTP 403) before any admin page renders.
  // This protects every /admin/* route by default, so a page that forgets a
  // per-route requirePermission() still cannot leak to non-staff.
  const { profile } = await requireStaff()
  const role = profile.role

  const filteredLearningNav = learningNav.filter(item => hasPermission(role, item.permission as any))
  const filteredManagementNav = managementNav.filter(item => hasPermission(role, item.permission as any))

  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex flex-col md:flex-row font-sans">
      
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-[#1A140E] border-r border-[#D4AF37]/20 flex flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto shrink-0">
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
          
          {filteredLearningNav.length > 0 && (
            <>
              <div className="mt-6 mb-2 px-6">
                <h3 className="text-xs font-bold text-[#A1866B] uppercase tracking-wider">Learning</h3>
              </div>
              <ul className="space-y-1 px-3">
                {filteredLearningNav.map((item) => {
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
            </>
          )}

          {filteredManagementNav.length > 0 && (
            <>
              <div className="mt-6 mb-2 px-6">
                <h3 className="text-xs font-bold text-[#A1866B] uppercase tracking-wider">Management</h3>
              </div>
              <ul className="space-y-1 px-3">
                {filteredManagementNav.map((item) => {
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
            </>
          )}
        </nav>

        <div className="p-4 border-t border-[#D4AF37]/20">
          <Link href="/logout" className="flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors">
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto p-6 md:p-10">
          {children}
        </div>
      </main>
    </div>
  )
}
