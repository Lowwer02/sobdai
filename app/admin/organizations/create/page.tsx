import { createOrganizationAction } from '../actions'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'

export default function CreateOrganizationPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/admin/organizations" 
          className="p-2 bg-[#1A140E] text-[#A1866B] hover:text-[#F5E9D6] rounded-xl border border-[rgba(255,255,255,0.05)] transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Create Organization</h1>
          <p className="text-[#A1866B] mt-1">Add a new institution, ministry, or department.</p>
        </div>
      </div>

      <form action={createOrganizationAction} className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[#A1866B]">Organization Code *</label>
            <input 
              type="text" 
              name="code" 
              required
              placeholder="e.g. MOI, OPS"
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors uppercase"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[#A1866B]">Full Name *</label>
            <input 
              type="text" 
              name="name" 
              required
              placeholder="e.g. กระทรวงมหาดไทย"
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-bold text-[#A1866B]">Short Name</label>
          <input 
            type="text" 
            name="short_name" 
            placeholder="e.g. มท."
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-bold text-[#A1866B]">Logo URL</label>
          <input 
            type="url" 
            name="logo_url" 
            placeholder="https://example.com/logo.png"
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] px-4 py-3 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors font-mono text-sm"
          />
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
            href="/admin/organizations"
            className="px-6 py-3 text-[#A1866B] hover:text-[#F5E9D6] transition-colors font-medium"
          >
            Cancel
          </Link>
          <button 
            type="submit"
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Save size={18} />
            Create Organization
          </button>
        </div>
      </form>
    </div>
  )
}
