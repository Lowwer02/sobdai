import Link from 'next/link'
import { ArrowLeft, Save, Image as ImageIcon } from 'lucide-react'

export default function CreatePackagePage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/packages">
          <button className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Create Package</h1>
          <p className="text-[#A1866B] mt-1">Add a new exam package to the platform.</p>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <button className="px-4 py-2 rounded-xl text-[#A1866B] font-medium hover:text-[#F5E9D6] transition-colors">
            Save Draft
          </button>
          <button className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Save size={18} />
            Publish Package
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Basic Info */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Basic Information</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Package Code</label>
                <input type="text" placeholder="e.g. PM01" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">URL Slug</label>
                <input type="text" placeholder="e.g. policy-analyst-aw" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Package Name</label>
              <input type="text" placeholder="e.g. นักวิเคราะห์นโยบายและแผน" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Organization Name</label>
              <input type="text" placeholder="e.g. สำนักงานปลัดกระทรวง อว." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Description (Rich Text)</label>
              <textarea rows={5} placeholder="Write a compelling description for this package..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>
          </div>

          {/* Media */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Media Assets</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm text-[#F5E9D6] font-medium block">Organization Logo</label>
                <div className="border-2 border-dashed border-[rgba(255,255,255,0.1)] hover:border-[#D4AF37]/30 rounded-xl h-32 flex flex-col items-center justify-center gap-2 cursor-pointer bg-[#0F0B07] transition-colors">
                  <ImageIcon size={24} className="text-[#A1866B]" />
                  <span className="text-xs text-[#A1866B]">Click to upload</span>
                </div>
                <input type="text" placeholder="Or paste logo URL" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 mt-2" />
              </div>

              <div className="space-y-3">
                <label className="text-sm text-[#F5E9D6] font-medium block">Cover Image</label>
                <div className="border-2 border-dashed border-[rgba(255,255,255,0.1)] hover:border-[#D4AF37]/30 rounded-xl h-32 flex flex-col items-center justify-center gap-2 cursor-pointer bg-[#0F0B07] transition-colors">
                  <ImageIcon size={24} className="text-[#A1866B]" />
                  <span className="text-xs text-[#A1866B]">Click to upload</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          
          {/* Pricing */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Pricing</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Current Price (THB)</label>
              <input type="number" placeholder="99" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#D4AF37] font-bold text-lg rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Original Price (THB)</label>
              <input type="number" placeholder="249" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors line-through" />
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Configuration</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Difficulty Level</label>
              <select className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none">
                <option value="Mixed">Mixed (All levels)</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Enabled Features</label>
              <div className="space-y-2">
                {['Detailed Explanations', 'Mock Exam Mode', 'Progress Tracking', 'AI Analysis'].map((feature) => (
                  <label key={feature} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[#0F0B07] text-[#D4AF37] focus:ring-[#D4AF37]/50" />
                    <span className="text-sm text-[#A1866B]">{feature}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">SEO</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">SEO Title</label>
              <input type="text" placeholder="Title for search engines..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">SEO Description</label>
              <textarea rows={3} placeholder="Meta description..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
