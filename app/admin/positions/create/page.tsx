import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import { createPositionAction } from '../actions'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function CreatePositionPage() {
  const { supabase, profile } = await requirePermission('system.manage')

  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin')

  // Fetch organizations for the dropdown
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, code')
    .order('name', { ascending: true })

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/admin/positions" 
          className="p-2 bg-[#1A140E] text-[#A1866B] hover:text-[#F5E9D6] rounded-xl border border-[rgba(255,255,255,0.05)] transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Create Position</h1>
          <p className="text-[#A1866B] mt-1">Add a new job role or position.</p>
        </div>
      </div>

      <form action={createPositionAction} className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-6">
        
        <div className="space-y-2">
          <label className="block text-sm font-bold text-[#A1866B]">Organization *</label>
          <select 
            name="organization_id" 
            required
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors appearance-none"
          >
            <option value="">Select Organization</option>
            {orgs?.map(org => (
              <option key={org.id} value={org.id}>{org.name} ({org.code})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[#A1866B]">Position Code *</label>
            <input 
              type="text" 
              name="code" 
              required
              placeholder="e.g. POLICY, ADMIN"
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors uppercase"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[#A1866B]">Position Name *</label>
            <input 
              type="text" 
              name="name" 
              required
              placeholder="e.g. นักวิเคราะห์นโยบายและแผน"
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-bold text-[#A1866B]">Description</label>
          <textarea 
            name="description" 
            rows={4}
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors resize-y"
          ></textarea>
        </div>

        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)] flex justify-end gap-3">
          <Link 
            href="/admin/positions"
            className="px-6 py-3 text-[#A1866B] hover:text-[#F5E9D6] transition-colors font-medium"
          >
            Cancel
          </Link>
          <button 
            type="submit"
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Save size={18} />
            Create Position
          </button>
        </div>
      </form>
    </div>
  )
}
