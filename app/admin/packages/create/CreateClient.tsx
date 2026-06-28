'use client'

import Link from 'next/link'
import { useState, useTransition, useMemo } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { createPackageAction } from '../actions'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

const availableFeatures = [
  'Detailed Explanations', 
  'Mock Exam Mode', 
  'Progress Tracking', 
  'AI Analysis',
  'Unlimited Updates'
]

export default function CreateClient({ organizations, positions }: { organizations: any[], positions: any[] }) {
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(availableFeatures)
  
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedPos, setSelectedPos] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  useUnsavedChanges(isDirty)

  const filteredPositions = useMemo(() => {
    if (!selectedOrg) return []
    return positions.filter(p => p.organization_id === selectedOrg)
  }, [selectedOrg, positions])

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
      const result = await createPackageAction(formData)
      if (result?.error) {
        setErrorMsg(result.error)
      } else {
        setIsDirty(false) // clear dirty state on success
      }
    })
  }

  const handleFormChange = () => {
    setIsDirty(true)
  }

  return (
    <form onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/packages">
          <button type="button" className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Create Package</h1>
          <p className="text-[#A1866B] mt-1">Add a new exam package to the platform.</p>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <button type="button" className="px-4 py-2 rounded-xl text-[#A1866B] font-medium hover:text-[#F5E9D6] transition-colors">
            Save Draft
          </button>
          <button 
            type="submit" 
            disabled={isPending}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Publish Package
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
          
          {/* Hierarchy */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Target Organization</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Organization *</label>
                <select 
                  name="organization_id" 
                  required 
                  value={selectedOrg}
                  onChange={e => { setSelectedOrg(e.target.value); setSelectedPos(''); }}
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none"
                >
                  <option value="">Select Organization</option>
                  {organizations.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Position *</label>
                <select 
                  name="position_id" 
                  required 
                  value={selectedPos}
                  onChange={e => setSelectedPos(e.target.value)}
                  disabled={!selectedOrg}
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none disabled:opacity-50"
                >
                  <option value="">Select Position</option>
                  {filteredPositions.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Exam Year *</label>
                <input required name="exam_year" type="number" defaultValue={new Date().getFullYear()} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Version *</label>
                <input required name="version" type="text" defaultValue="1.0" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Package Details</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Package Name *</label>
              <input required name="name" type="text" placeholder="e.g. ตะลุยโจทย์นักวิเคราะห์นโยบายและแผน" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">URL Slug <span className="text-[#A1866B] text-xs font-normal">(Auto-generates if empty)</span></label>
              <input name="slug" type="text" placeholder="e.g. policy-analyst-2026" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Description</label>
              <textarea name="description" rows={5} placeholder="Write a compelling description for this package..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>
          </div>

          {/* Media */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Media Assets</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm text-[#F5E9D6] font-medium block">Organization Logo URL</label>
                <input name="logo_url" type="text" placeholder="e.g. /logo.png or https://..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-base sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 mt-2" />
              </div>

              <div>
                <label className="block text-[#A1866B] text-sm font-medium">Cover Image URL</label>
                <input name="cover_image_url" type="text" placeholder="e.g. https://..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-base sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 mt-2" />
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
              <input required name="current_price" type="number" defaultValue="99" min="0" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#D4AF37] font-bold text-lg rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Original Price (THB) *</label>
              <input required name="original_price" type="number" defaultValue="249" min="0" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Configuration</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Difficulty Level</label>
              <select name="difficulty" defaultValue="Mixed" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none">
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
              <label className="block text-[#A1866B] text-sm font-medium mb-2">SEO Title</label>
              <input name="seo_title" type="text" placeholder="Title for search engines..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-base sm:text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">SEO Description</label>
              <textarea name="seo_description" rows={3} placeholder="Meta description..." className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>
          </div>

        </div>
      </div>
    </form>
  )
}
