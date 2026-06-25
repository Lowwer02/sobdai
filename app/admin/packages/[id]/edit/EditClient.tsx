'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ArrowLeft, Save, Image as ImageIcon, Loader2 } from 'lucide-react'
import { updatePackageAction } from '../../actions'

const availableFeatures = [
  'Detailed Explanations', 
  'Mock Exam Mode', 
  'Progress Tracking', 
  'AI Analysis',
  'Unlimited Updates'
]

export default function EditClient({ pkg }: { pkg: any }) {
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(pkg.features || [])

  const toggleFeature = (feature: string) => {
    setSelectedFeatures(prev => 
      prev.includes(feature) ? prev.filter(f => f !== feature) : [...prev, feature]
    )
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMsg('')
    const formData = new FormData(e.currentTarget)
    
    // Add the features JSON string to formData
    formData.append('features', JSON.stringify(selectedFeatures))

    startTransition(async () => {
      const result = await updatePackageAction(pkg.id, formData)
      if (result?.error) {
        setErrorMsg(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/packages">
          <button type="button" className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Edit Package</h1>
          <p className="text-[#A1866B] mt-1">Update existing exam package details.</p>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <Link href={`/package/${pkg.slug}`} target="_blank">
            <button type="button" className="px-4 py-2 rounded-xl text-[#A1866B] font-medium hover:text-[#F5E9D6] transition-colors">
              View Public
            </button>
          </Link>
          <button 
            type="submit" 
            disabled={isPending}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl text-sm font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Basic Info */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Basic Information</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Package Code *</label>
                <input defaultValue={pkg.package_code} required name="package_code" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">URL Slug</label>
                <input defaultValue={pkg.slug} name="slug" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Package Name *</label>
              <input defaultValue={pkg.name} required name="name" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Organization Name *</label>
              <input defaultValue={pkg.org_name} required name="org_name" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Description</label>
              <textarea defaultValue={pkg.description} name="description" rows={5} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>
          </div>

          {/* Media */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Media Assets</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm text-[#F5E9D6] font-medium block">Organization Logo URL</label>
                <input defaultValue={pkg.logo_url} name="logo_url" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 mt-2" />
              </div>

              <div className="space-y-3">
                <label className="text-sm text-[#F5E9D6] font-medium block">Cover Image URL</label>
                <input defaultValue={pkg.cover_image_url} name="cover_image_url" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 mt-2" />
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
              <label className="text-sm text-[#F5E9D6] font-medium block">Current Price (THB) *</label>
              <input defaultValue={pkg.current_price} required name="current_price" type="number" min="0" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#D4AF37] font-bold text-lg rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Original Price (THB) *</label>
              <input defaultValue={pkg.original_price} required name="original_price" type="number" min="0" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Configuration</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Difficulty Level</label>
              <select defaultValue={pkg.difficulty} name="difficulty" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none">
                <option value="Mixed">Mixed (All levels)</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Enabled Features</label>
              <div className="space-y-2">
                {availableFeatures.map((feature) => (
                  <label key={feature} className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedFeatures.includes(feature)}
                      onChange={() => toggleFeature(feature)}
                      className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[#0F0B07] text-[#D4AF37] focus:ring-[#D4AF37]/50" 
                    />
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
              <input defaultValue={pkg.seo_title} name="seo_title" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">SEO Description</label>
              <textarea defaultValue={pkg.seo_description} name="seo_description" rows={3} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>
          </div>

        </div>
      </div>
    </form>
  )
}
