'use client'

import { useState, useTransition } from 'react'
import { Camera, Shield, UserCircle, LogIn, AlertTriangle, Loader2 } from 'lucide-react'
import { updateProfile } from './actions'

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
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [isPending, startTransition] = useTransition()
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text })
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await updateProfile(formData)
      if (result.success) {
        showToast('success', 'Saved successfully')
        setProfile(prev => ({
          ...prev,
          display_name: formData.get('display_name') as string,
          occupation: formData.get('occupation') as string,
          phone: formData.get('phone') as string,
        }))
      } else {
        showToast('error', result.error || 'Failed to save profile')
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

  return (
    <div className="space-y-8 relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5 ${
          toastMessage.type === 'success' ? 'bg-[#1A140E] border-[#D4AF37]/30 text-[#D4AF37]' : 'bg-[#2A0808] border-red-900/50 text-red-400'
        }`}>
          {toastMessage.type === 'success' ? <Shield size={18} /> : <AlertTriangle size={18} />}
          <p className="text-sm font-medium">{toastMessage.text}</p>
        </div>
      )}

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
          <button className="absolute bottom-0 right-0 p-2 bg-[#D4AF37] text-[#1A140E] rounded-full hover:brightness-110 transition-all cursor-not-allowed opacity-50" title="Avatar upload coming soon">
            <Camera size={14} />
          </button>
        </div>
        
        <div className="text-center sm:text-left flex-1 space-y-2">
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6]">
            {profile.display_name || 'Anonymous User'}
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
          <h3 className="text-xl font-display text-[#F5E9D6]">Account Details</h3>
          <p className="text-[#A1866B] text-sm mt-1">Update your personal information.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="display_name" className="block text-sm font-medium text-[#F5E9D6]">Display Name</label>
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
              <label htmlFor="occupation" className="block text-sm font-medium text-[#F5E9D6]">Occupation</label>
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
              <label htmlFor="phone" className="block text-sm font-medium text-[#F5E9D6]">Phone Number</label>
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
              <label className="block text-sm font-medium text-[#F5E9D6]">Email Address</label>
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
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Section 3: Authentication & Security */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl p-6 sm:p-8">
        <h3 className="text-xl font-display text-[#F5E9D6]">Security</h3>
        <p className="text-[#A1866B] text-sm mt-1 mb-6">Manage how you log into Sobdai.</p>
        
        <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
              <LogIn size={20} />
            </div>
            <div>
              <p className="text-[#F5E9D6] font-medium text-sm">Login Method</p>
              <p className="text-[#A1866B] text-xs mt-0.5 capitalize">{profile.provider}</p>
            </div>
          </div>
          
          <div>
            {profile.provider === 'google' ? (
              <p className="text-sm text-[#A1866B] italic">This account is managed by Google.</p>
            ) : (
              <button 
                type="button" 
                className="px-4 py-2 border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm font-medium rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                onClick={() => alert('Change password functionality coming soon.')}
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
        <p className="text-red-400/70 text-sm mt-1 mb-6">Irreversible and destructive actions.</p>
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#A1866B] text-sm">Once you delete your account, there is no going back. Please be certain.</p>
          <button 
            type="button"
            className="px-4 py-2 bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40 rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
            onClick={() => {
              if (window.confirm('Are you absolutely sure you want to delete your account? This action cannot be undone.')) {
                alert('Account deletion is currently disabled. Coming soon in Session 8.')
              }
            }}
          >
            Delete My Account
          </button>
        </div>
      </div>

    </div>
  )
}
