import Link from 'next/link'
import { Plus, Search, Filter, Edit, Copy, Archive } from 'lucide-react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export default async function PackagesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  let packages: any[] = []
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://dummy.supabase.co') {
    const { data } = await supabase.from('packages').select('*').order('created_at', { ascending: false })
    if (data) packages = data
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Packages</h1>
          <p className="text-[#A1866B] mt-1">Manage exam packages and their configurations.</p>
        </div>
        
        <Link href="/admin/packages/create">
          <button className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Plus size={18} />
            Create Package
          </button>
        </Link>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input 
              type="text" 
              placeholder="Search packages..." 
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors placeholder:text-[#A1866B]/50"
            />
          </div>
          
          <button className="flex items-center gap-2 px-4 py-2 bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] rounded-xl text-[#A1866B] hover:text-[#F5E9D6] transition-colors">
            <Filter size={18} />
            <span className="text-sm font-medium">Filter</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0F0B07]/50 text-[#A1866B] text-xs uppercase tracking-wider border-b border-[rgba(255,255,255,0.05)]">
                <th className="p-4 font-medium">Package Info</th>
                <th className="p-4 font-medium">Stats</th>
                <th className="p-4 font-medium">Price</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Last Updated</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {packages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[#A1866B]">
                    No packages found. Click "Create Package" to begin.
                  </td>
                </tr>
              ) : packages.map((pkg) => (
                <tr key={pkg.id} className="hover:bg-[#D4AF37]/[0.02] transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#0F0B07] border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] text-xs font-bold font-display shrink-0">
                        {pkg.package_code}
                      </div>
                      <div>
                        <Link href={`/package/${pkg.slug}`} target="_blank" className="text-[#F5E9D6] font-medium mb-0.5 hover:text-[#D4AF37] transition-colors line-clamp-1">
                          {pkg.name}
                        </Link>
                        <div className="text-[#A1866B] text-xs">{pkg.org_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] text-sm whitespace-nowrap">{pkg.total_questions.toLocaleString()} Qs</div>
                    <div className="text-[#A1866B] text-xs whitespace-nowrap">{pkg.total_exam_sets} Sets</div>
                  </td>
                  <td className="p-4 text-[#F5E9D6] font-medium whitespace-nowrap">
                    ฿{pkg.current_price}
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-[#22C55E]/10 text-[#22C55E]">
                      Published
                    </span>
                  </td>
                  <td className="p-4 text-[#A1866B] text-sm whitespace-nowrap">
                    {new Date(pkg.updated_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/packages/${pkg.id}/edit`}>
                        <button className="p-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors rounded-lg hover:bg-[#D4AF37]/10" title="Edit">
                          <Edit size={16} />
                        </button>
                      </Link>
                      <button className="p-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors rounded-lg hover:bg-[#D4AF37]/10" title="Duplicate">
                        <Copy size={16} />
                      </button>
                      <button className="p-2 text-[#A1866B] hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10" title="Archive">
                        <Archive size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
