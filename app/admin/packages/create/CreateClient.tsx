'use client'

import Link from 'next/link'
import { useState, useTransition, useMemo, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, Loader2, Camera, Image as ImageIcon } from 'lucide-react'
import { createPackageAction } from '../actions'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import AvatarCropper from '@/components/AvatarCropper'

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

  // Package Upload State
  const [packageId] = useState(() => crypto.randomUUID())
  const [logoUrl, setLogoUrl] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isCropperOpen, setIsCropperOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useUnsavedChanges(isDirty)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (file.size > 4 * 1024 * 1024) {
        toastEvent('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 4 MB', 'error')
        e.target.value = ''
        return
      }
      
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        setSelectedImage(reader.result as string)
        setIsCropperOpen(true)
      }
    }
  }

  const handleLogoSave = async (croppedBlob: Blob) => {
    try {
      setIsUploading(true)
      const supabase = createClient()
      const fileName = `packages/${packageId}/logo.webp`
      
      const { error: uploadError } = await supabase.storage
        .from('package-assets')
        .upload(fileName, croppedBlob, {
          contentType: 'image/webp',
          upsert: true
        })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('package-assets')
        .getPublicUrl(fileName)

      const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`
      setLogoUrl(cacheBustedUrl)
      setIsDirty(true)
      toastEvent('อัปโหลดโลโก้สำเร็จ', 'success')
    } catch (err: any) {
      toastEvent(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด', 'error')
    } finally {
      setIsUploading(false)
      setSelectedImage(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
    <>
    <form onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-6 max-w-5xl mx-auto pb-20">
      <input type="hidden" name="id" value={packageId} />
      <input type="hidden" name="logo_url" value={logoUrl} />
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
                <label className="text-sm text-[#F5E9D6] font-medium block">Upload Organization Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] overflow-hidden flex items-center justify-center shrink-0">
                    {logoUrl ? (
                      <Image src={logoUrl} alt="Logo" width={80} height={80} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={24} className="text-[#A1866B]" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <button type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-2 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm font-medium text-[#F5E9D6] transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                      {logoUrl ? 'เปลี่ยนรูปภาพ' : 'อัปโหลดรูปภาพ (สูงสุด 4 MB)'}
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/jpeg,image/png,image/webp,image/heic" 
                      className="hidden" 
                    />
                    <p className="text-xs text-[#A1866B]">รองรับ JPG, PNG, WEBP หรือ HEIC ขนาด 1:1</p>
                  </div>
                </div>
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
              <label className="text-sm text-[#F5E9D6] font-medium block">Publication Status</label>
              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#0F0B07] group hover:border-[rgba(212,175,55,0.3)] transition-colors">
                <input
                  type="checkbox"
                  name="is_published"
                  className="w-5 h-5 rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] text-[#22C55E] focus:ring-[#22C55E]/50"
                />
                <div>
                  <span className="text-sm text-[#F5E9D6] font-medium block">Published</span>
                  <span className="text-xs text-[#A1866B]">If checked, package is visible to users</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#0F0B07] group hover:border-[rgba(212,175,55,0.3)] transition-colors">
                <input
                  type="checkbox"
                  name="featured_homepage"
                  className="w-5 h-5 rounded border-[rgba(255,255,255,0.2)] bg-[#1A140E] text-[#D4AF37] focus:ring-[#D4AF37]/50"
                />
                <div>
                  <span className="text-sm text-[#F5E9D6] font-medium block">แสดงบนหน้าแรก</span>
                  <span className="text-xs text-[#A1866B]">Featured บนหน้าแรก (Admin เลือกเอง)</span>
                </div>
              </label>
              <div className="space-y-1.5">
                <label className="text-sm text-[#F5E9D6] font-medium block">Homepage Order</label>
                <input
                  type="number"
                  name="homepage_order"
                  defaultValue={0}
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                />
                <p className="text-[10px] text-[#A1866B]">ค่ามากกว่า แสดงก่อนบนหน้าแรก (ใช้เฉพาะเมื่อเปิด &quot;แสดงบนหน้าแรก&quot;)</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
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
    
    <AvatarCropper 
      isOpen={isCropperOpen}
      imageSrc={selectedImage}
      onClose={() => {
        setIsCropperOpen(false)
        setSelectedImage(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }}
      onSave={handleLogoSave}
    />
    </>
  )
}
