'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, CheckCircle2, XCircle, Save, Loader2 } from 'lucide-react'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import { saveSocialFollowSettings } from './actions'
import type { SocialFollowConfig, SocialPlatformKey } from '@/lib/socialFollowConfig'
import type { FooterSocialLink } from '@/lib/homepageConfig'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[#A1866B] font-bold uppercase block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#A1866B]">{hint}</p>}
    </div>
  )
}

const inputClass =
  'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'

export default function SocialFollowSettingsClient({
  initialSocialFollow,
  globalSocialLinks,
}: {
  initialSocialFollow: SocialFollowConfig
  globalSocialLinks: FooterSocialLink[]
}) {
  const [config, setConfig] = useState<SocialFollowConfig>(initialSocialFollow)
  const [isPending, startTransition] = useTransition()
  const [isDirty, setIsDirty] = useState(false)

  useUnsavedChanges(isDirty)

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveSocialFollowSettings(config)
      if (res.success) {
        toastEvent('บันทึกการตั้งค่า Social Follow เรียบร้อย', 'success')
        setIsDirty(false)
      } else {
        toastEvent(res.error || 'บันทึกการตั้งค่าไม่สำเร็จ', 'error')
      }
    })
  }

  const updateGlobalEnabled = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, enabled }))
    setIsDirty(true)
  }

  const newsDetailConfig = config.placements.news_detail_end

  const updateNewsDetail = (patch: Partial<typeof newsDetailConfig>) => {
    setConfig(prev => ({
      ...prev,
      placements: {
        ...prev.placements,
        news_detail_end: {
          ...prev.placements.news_detail_end,
          ...patch,
        },
      },
    }))
    setIsDirty(true)
  }

  const togglePlatform = (platform: SocialPlatformKey) => {
    const currentPlatforms = newsDetailConfig.platforms || ['facebook', 'line', 'tiktok']
    const hasPlatform = currentPlatforms.includes(platform)

    const updatedPlatforms = hasPlatform
      ? currentPlatforms.filter(p => p !== platform)
      : [...currentPlatforms, platform]

    updateNewsDetail({ platforms: updatedPlatforms })
  }

  const updateButtonLabel = (platform: SocialPlatformKey, label: string) => {
    updateNewsDetail({
      button_labels: {
        ...newsDetailConfig.button_labels,
        [platform]: label,
      },
    })
  }

  const platformInfo: Record<SocialPlatformKey, { title: string; globalLink?: FooterSocialLink }> = {
    facebook: {
      title: 'Facebook',
      globalLink: globalSocialLinks.find(l => l.key === 'facebook'),
    },
    line: {
      title: 'LINE OA',
      globalLink: globalSocialLinks.find(l => l.key === 'line'),
    },
    tiktok: {
      title: 'TikTok',
      globalLink: globalSocialLinks.find(l => l.key === 'tiktok'),
    },
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ─── Global Channel Status (Read-Only) ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4">
          <div>
            <h2 className="text-[#D4AF37] font-bold font-display text-lg">
              ช่องทางโซเชียลหลัก (Global Master Links)
            </h2>
            <p className="text-xs text-[#A1866B] mt-0.5">
              URL และสถานะหลักของช่องทางโซเชียลจัดการจากหน้า Homepage Settings
            </p>
          </div>
          <Link
            href="/admin/homepage"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F1D17A] bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-3 py-1.5 rounded-xl transition-colors shrink-0"
          >
            <span>จัดการใน Homepage Settings</span>
            <ExternalLink size={13} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['facebook', 'line', 'tiktok'] as SocialPlatformKey[]).map(platformKey => {
            const info = platformInfo[platformKey]
            const link = info.globalLink
            const isActive = link?.active ?? false
            const hasUrl = typeof link?.url === 'string' && link.url.trim().length > 0
            const isReady = isActive && hasUrl

            return (
              <div
                key={platformKey}
                className="p-3.5 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#F5E9D6]">{info.title}</span>
                  {isReady ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md font-medium">
                      <CheckCircle2 size={12} />
                      Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md font-medium">
                      <XCircle size={12} />
                      Not Ready
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1 text-[#A1866B]">
                  <div>
                    สถานะหลัก:{' '}
                    <span className={isActive ? 'text-emerald-400 font-semibold' : 'text-stone-400'}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="truncate">
                    URL:{' '}
                    {hasUrl ? (
                      <span className="text-[#F5E9D6] font-mono text-[11px] truncate">{link.url}</span>
                    ) : (
                      <span className="text-amber-400 italic">ยังไม่มี URL</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── Global Toggle ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(212,175,55,0.3)] transition-colors">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => updateGlobalEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#D4AF37]"
          />
          <span className="text-sm font-bold text-[#F5E9D6]">เปิดใช้งาน Social Follow</span>
        </label>
      </section>

      {/* ─── Placement: news_detail_end ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-[#D4AF37] font-bold font-display text-lg">
            ท้ายบทความข่าว (news_detail_end)
          </h2>
          <p className="text-xs text-[#A1866B] mt-0.5">
            กำหนดการแสดงผลกล่องติดตามหลังอ่านบทความข่าวเสร็จสิ้น
          </p>
        </div>

        {/* Placement Enabled Toggle */}
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(212,175,55,0.3)] transition-colors">
          <input
            type="checkbox"
            checked={newsDetailConfig.enabled}
            onChange={e => updateNewsDetail({ enabled: e.target.checked })}
            className="w-4 h-4 accent-[#D4AF37]"
          />
          <span className="text-sm text-[#F5E9D6]">เปิดใช้งานกล่องติดตามส่วนท้ายบทความข่าว</span>
        </label>

        {/* Heading & Description Fields */}
        <div className="space-y-4 pt-2">
          <Field label="ข้อความหัวเรื่อง (Heading)" hint="สูงสุด 120 ตัวอักษร">
            <input
              type="text"
              maxLength={120}
              className={inputClass}
              value={newsDetailConfig.heading}
              onChange={e => updateNewsDetail({ heading: e.target.value })}
            />
          </Field>

          <Field label="คำอธิบาย (Description)" hint="สูงสุด 500 ตัวอักษร">
            <textarea
              rows={3}
              maxLength={500}
              className={inputClass}
              value={newsDetailConfig.description}
              onChange={e => updateNewsDetail({ description: e.target.value })}
            />
          </Field>
        </div>

        {/* Platforms & Button Labels */}
        <div className="space-y-4 pt-2 border-t border-[rgba(255,255,255,0.08)]">
          <h3 className="text-sm font-bold text-[#F5E9D6]">เลือกช่องทางและกำหนดข้อความปุ่ม</h3>

          <div className="space-y-4">
            {(['facebook', 'line', 'tiktok'] as SocialPlatformKey[]).map(platformKey => {
              const info = platformInfo[platformKey]
              const link = info.globalLink
              const isSelected = (newsDetailConfig.platforms || ['facebook', 'line', 'tiktok']).includes(platformKey)
              const isGlobalReady = (link?.active ?? false) && Boolean(link?.url && link.url.trim().length > 0)
              const labelValue = newsDetailConfig.button_labels?.[platformKey] ?? ''

              return (
                <div
                  key={platformKey}
                  className="p-4 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlatform(platformKey)}
                        className="w-4 h-4 accent-[#D4AF37]"
                      />
                      <span className="text-sm font-bold text-[#F5E9D6]">{info.title}</span>
                    </label>

                    {/* Inline Warning for Selected but Globally Inactive / Missing URL */}
                    {isSelected && !isGlobalReady && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 px-3 py-1 rounded-lg">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>ช่องทางนี้ยังไม่ได้เปิดใช้งาน หรือยังไม่มี URL ใน Homepage Settings</span>
                      </div>
                    )}
                  </div>

                  <Field label={`ข้อความปุ่ม (${info.title})`} hint="สูงสุด 80 ตัวอักษร">
                    <input
                      type="text"
                      maxLength={80}
                      className={inputClass}
                      value={labelValue}
                      onChange={e => updateButtonLabel(platformKey, e.target.value)}
                    />
                  </Field>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Save Action Bar ─── */}
      <div className="flex justify-end pt-4 pb-12">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#D4AF37] to-[#F1D17A] text-[#0F0B07] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(212,175,55,0.2)]"
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>กำลังบันทึก...</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span>บันทึกการตั้งค่า</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
