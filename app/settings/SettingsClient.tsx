'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, Shield, UserCircle, LogIn, AlertTriangle, Loader2, X } from 'lucide-react'
import { updateProfile, deactivateAccount } from './actions'

import { toastEvent } from '@/hooks/useToast'
import AvatarCropper from '@/components/AvatarCropper'

interface Profile {
  id: string
  email: string
  role: string
  display_name?: string
  occupation?: string
  phone?: string
  avatar_url?: string
  provider: string
}

export default function SettingsClient({ initialProfile }: { initialProfile: Profile }) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [isPending, startTransition] = useTransition()
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isCropperOpen, setIsCropperOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleAvatarSave = async (croppedBlob: Blob) => {
    try {
      setIsUploading(true)
      const supabase = createClient()
      
      const fileName = `${profile.id}/avatar.webp`
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, {
          contentType: 'image/webp',
          upsert: true
        })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      // Append timestamp to bust cache
      const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: cacheBustedUrl })
        .eq('id', profile.id)

      if (updateError) throw updateError

      setProfile(prev => ({ ...prev, avatar_url: cacheBustedUrl }))
      toastEvent('อัปเดตรูปโปรไฟล์สำเร็จ', 'success')
      router.refresh()
    } catch (err: any) {
      toastEvent(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปโปรไฟล์', 'error')
    } finally {
      setIsUploading(false)
      setSelectedImage(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await updateProfile(formData)
      if (result.success) {
        toastEvent('บันทึกข้อมูลเรียบร้อยแล้ว', 'success')
        setProfile(prev => ({
          ...prev,
          display_name: formData.get('display_name') as string,
          occupation: formData.get('occupation') as string,
          phone: formData.get('phone') as string,
        }))
      } else {
        toastEvent(result.error || 'ไม่สามารถบันทึกข้อมูลส่วนตัวได้', 'error')
      }
    })
  }

  // Get Initials for Avatar Fallback
  const getInitials = () => {
    if (profile.display_name) {
      return profile.display_name.charAt(0).toUpperCase()
    }
    return profile.email.charAt(0).toUpperCase()
  }

  const handleDeactivate = async () => {
    setIsDeactivating(true)
    const result = await deactivateAccount()
    if (result.success) {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/')
      router.refresh()
    } else {
      setIsDeactivating(false)
      setIsDeactivateModalOpen(false)
      toastEvent(result.error || 'เกิดข้อผิดพลาดในการปิดการใช้งาน', 'error')
    }
  }

  return (
    <div className="space-y-8 relative">
      
      {/* Section 1: Profile Overview */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] overflow-hidden flex items-center justify-center">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-display text-[#D4AF37] font-bold">{getInitials()}</span>
            )}
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="absolute bottom-0 right-0 p-2 bg-[#D4AF37] text-[#1A140E] rounded-full hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
            title="อัปโหลดรูปโปรไฟล์"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
        
        <div className="text-center sm:text-left flex-1 space-y-2">
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6]">
            {profile.display_name || 'ผู้ใช้งาน'}
          </h2>
          <p className="text-[#A1866B] text-sm">{profile.email}</p>
          
          <div className="pt-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
              ['owner', 'admin', 'editor', 'support'].includes(profile.role)
                ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30' 
                : 'bg-[#0F0B07] text-[#A1866B] border-[rgba(255,255,255,0.1)]'
            }`}>
              {['owner', 'admin', 'editor', 'support'].includes(profile.role) ? <Shield size={14} /> : <UserCircle size={14} />}
              {profile.role.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Section 2: Account Details Form */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 sm:p-8 border-b border-[rgba(255,255,255,0.05)]">
          <h3 className="text-xl font-display text-[#F5E9D6]">ข้อมูลบัญชี</h3>
          <p className="text-[#A1866B] text-sm mt-1">อัปเดตข้อมูลส่วนตัวของคุณ</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="display_name" className="block text-sm font-medium text-[#F5E9D6]">ชื่อที่แสดง</label>
              <input 
                id="display_name"
                name="display_name"
                type="text" 
                maxLength={80}
                defaultValue={profile.display_name || ''}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-all"
                placeholder="John Doe"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="occupation" className="block text-sm font-medium text-[#F5E9D6]">อาชีพ</label>
              <input 
                id="occupation"
                name="occupation"
                type="text" 
                maxLength={120}
                defaultValue={profile.occupation || ''}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-all"
                placeholder="Student, Developer, etc."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="phone" className="block text-sm font-medium text-[#F5E9D6]">เบอร์โทรศัพท์</label>
              <input 
                id="phone"
                name="phone"
                type="tel" 
                defaultValue={profile.phone || ''}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-all"
                placeholder="+66..."
              />
            </div>
            
            {/* Read-only fields to prevent user confusion */}
            <div className="space-y-2 opacity-60 pointer-events-none">
              <label className="block text-sm font-medium text-[#F5E9D6]">อีเมล</label>
              <input 
                type="email" 
                value={profile.email}
                readOnly
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-3"
              />
            </div>
          </div>
          
          <div className="pt-4 flex justify-end">
            <button 
              type="submit" 
              disabled={isPending}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Saving...
                </>
              ) : (
                'บันทึกข้อมูล'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Section 3: Authentication & Security */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl p-6 sm:p-8">
        <h3 className="text-xl font-display text-[#F5E9D6]">ความปลอดภัย</h3>
        <p className="text-[#A1866B] text-sm mt-1 mb-6">จัดการวิธีเข้าสู่ระบบบัญชีของคุณ</p>
        
        <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
              <LogIn size={20} />
            </div>
            <div>
              <p className="text-[#F5E9D6] font-medium text-sm">วิธีเข้าสู่ระบบ</p>
              <p className="text-[#A1866B] text-xs mt-0.5 capitalize">{profile.provider}</p>
            </div>
          </div>
          
          <div>
            {profile.provider === 'google' ? (
              <p className="text-sm text-[#A1866B] italic">บัญชีนี้เข้าสู่ระบบด้วย Google<br/>อีเมลจะถูกจัดการโดย Google</p>
            ) : (
              <button 
                type="button" 
                className="px-4 py-2 border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm font-medium rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                onClick={async () => {
                  try {
                    const supabaseClient = createClient()
                    const { error } = await supabaseClient.auth.resetPasswordForEmail(profile.email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    })
                    if (error) throw error
                    toastEvent('ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณแล้ว', 'success')
                  } catch (err: any) {
                    toastEvent(err.message, 'error')
                  }
                }}
              >
                Change Password
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section 4: Danger Zone */}
      <div className="bg-[#2A0808]/30 border border-red-900/30 rounded-2xl overflow-hidden shadow-xl p-6 sm:p-8">
        <h3 className="text-xl font-display text-red-400 flex items-center gap-2">
          <AlertTriangle size={22} />
          Danger Zone
        </h3>
        <p className="text-red-400/70 text-sm mt-1 mb-6">การตั้งค่าที่ส่งผลต่อบัญชีของคุณ</p>
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#A1866B] text-sm">การลบบัญชีเป็นสิ่งที่ไม่สามารถย้อนกลับได้ กรุณาตรวจสอบให้แน่ใจ</p>
          <button 
            type="button"
            className="px-4 py-2 bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40 rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
            onClick={() => setIsDeactivateModalOpen(true)}
          >
            ปิดการใช้งานบัญชี
          </button>
        </div>
      </div>

      {/* Deactivate Account Modal */}
      {isDeactivateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isDeactivating && setIsDeactivateModalOpen(false)} />
          <div className="relative bg-[#1A140E] border border-red-900/50 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => !isDeactivating && setIsDeactivateModalOpen(false)}
              className="absolute top-4 right-4 text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold font-display">ปิดการใช้งานบัญชี</h2>
            </div>
            
            <p className="text-[#F5E9D6] mb-4">หากดำเนินการต่อ:</p>
            <ul className="list-disc list-inside space-y-2 text-[#A1866B] text-sm mb-6">
              <li>จะออกจากระบบทันที</li>
              <li>จะไม่สามารถเข้าสู่ระบบได้</li>
              <li>ข้อมูลยังไม่ถูกลบถาวร</li>
              <li>สามารถให้ทีมงานกู้คืนได้</li>
            </ul>
            
            <div className="flex gap-3 mt-8">
              <button 
                className="flex-1 px-4 py-3 bg-transparent border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] rounded-xl font-medium transition-colors"
                onClick={() => setIsDeactivateModalOpen(false)}
                disabled={isDeactivating}
              >
                ยกเลิก
              </button>
              <button 
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDeactivate}
                disabled={isDeactivating}
              >
                {isDeactivating && <Loader2 size={18} className="animate-spin" />}
                ปิดการใช้งานบัญชี
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Cropper Modal */}
      <AvatarCropper 
        isOpen={isCropperOpen}
        imageSrc={selectedImage}
        onClose={() => {
          setIsCropperOpen(false)
          setSelectedImage(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
        onSave={handleAvatarSave}
      />
    </div>
  )
}
