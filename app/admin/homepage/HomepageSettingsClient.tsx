'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { saveHomepageSettings } from './actions'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import type { HomepageSettings, CtaButton } from '@/lib/homepageConfig'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[#A1866B] font-bold uppercase block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#A1866B]">{hint}</p>}
    </div>
  )
}

const inputClass = 'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'

/** Display labels for section keys. Unknown keys fall back to their raw value. */
const SECTION_LABELS: Record<string, string> = {
  news: 'ข่าวล่าสุด',
}

function CtaEditor({ value, onChange }: { value: CtaButton; onChange: (v: CtaButton) => void }) {
  return (
    <div className="space-y-3 p-4 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)]">
      <div className="grid grid-cols-2 gap-3">
        <Field label="ข้อความปุ่ม">
          <input className={inputClass} value={value.label} onChange={e => onChange({ ...value, label: e.target.value })} />
        </Field>
        <Field label="ประเภทลิงก์">
          <select className={inputClass} value={value.type} onChange={e => onChange({ ...value, type: e.target.value as 'internal' | 'external', open_in_new_tab: e.target.value === 'external' ? value.open_in_new_tab : false })}>
            <option value="internal">Internal (ในเว็บ)</option>
            <option value="external">External (เว็บนอก)</option>
          </select>
        </Field>
      </div>
      <Field label="ลิงก์" hint={value.type === 'internal' ? 'เช่น /packages หรือ #exams' : 'URL เต็ม เช่น https://...'}>
        <input className={inputClass} value={value.href} onChange={e => onChange({ ...value, href: e.target.value })} />
      </Field>
      {value.type === 'external' && (
        <label className="flex items-center gap-2 text-sm text-[#A1866B] cursor-pointer">
          <input type="checkbox" checked={value.open_in_new_tab} onChange={e => onChange({ ...value, open_in_new_tab: e.target.checked })} className="w-4 h-4 accent-[#D4AF37]" />
          เปิดในแท็บใหม่
        </label>
      )}
    </div>
  )
}

export default function HomepageSettingsClient({ initial }: { initial: HomepageSettings }) {
  const [settings, setSettings] = useState<HomepageSettings>(initial)
  const [isPending, startTransition] = useTransition()
  const [isDirty, setIsDirty] = useState(false)

  useUnsavedChanges(isDirty)

  const update = (patch: Partial<HomepageSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
    setIsDirty(true)
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveHomepageSettings(settings)
      if (res.success) {
        toastEvent('บันทึกการตั้งค่าหน้าแรกเรียบร้อย', 'success')
        setIsDirty(false)
      } else {
        toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
      }
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ─── General / Featured ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6">
        <h2 className="text-[#D4AF37] font-bold font-display mb-4">General & Featured</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="จำนวน Featured Package" hint="แพ็กเกจแนะนำบนหน้าแรก">
            <select className={inputClass} value={settings.general.featured_count} onChange={e => update({ general: { ...settings.general, featured_count: Number(e.target.value) as 2 | 4 | 6 } })}>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
            </select>
          </Field>
        </div>
        <p className="text-[11px] text-[#A1866B] mt-3">เลือกแพ็กเกจ Featured ได้ที่หน้า edit ของแต่ละแพ็กเกจ (ช่อง &quot;แสดงบนหน้าแรก&quot;)</p>
      </section>

      {/* ─── Hero ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
        <h2 className="text-[#D4AF37] font-bold font-display">Hero</h2>
        <Field label="Badge">
          <input className={inputClass} value={settings.hero.badge} onChange={e => update({ hero: { ...settings.hero, badge: e.target.value } })} />
        </Field>
        <Field label="Title (รองรับบรรทัดใหม่ด้วย \n)">
          <textarea className={inputClass} rows={2} value={settings.hero.title} onChange={e => update({ hero: { ...settings.hero, title: e.target.value } })} />
        </Field>
        <Field label="Subtitle">
          <textarea className={inputClass} rows={2} value={settings.hero.subtitle} onChange={e => update({ hero: { ...settings.hero, subtitle: e.target.value } })} />
        </Field>
        <Field label="Search Placeholder">
          <input className={inputClass} value={settings.hero.search_placeholder} onChange={e => update({ hero: { ...settings.hero, search_placeholder: e.target.value } })} />
        </Field>
        <Field label="Search Chip Label">
          <input className={inputClass} value={settings.hero.search_chip_label} onChange={e => update({ hero: { ...settings.hero, search_chip_label: e.target.value } })} />
        </Field>
        <Field label="Browse CTA Label">
          <input className={inputClass} value={settings.hero.browse_cta_label} onChange={e => update({ hero: { ...settings.hero, browse_cta_label: e.target.value } })} />
        </Field>
      </section>

      {/* ─── CTA ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
        <h2 className="text-[#D4AF37] font-bold font-display">CTA</h2>
        <Field label="Final CTA — Title">
          <input className={inputClass} value={settings.cta.final_title} onChange={e => update({ cta: { ...settings.cta, final_title: e.target.value } })} />
        </Field>
        <Field label="Final CTA — Subtitle">
          <input className={inputClass} value={settings.cta.final_subtitle} onChange={e => update({ cta: { ...settings.cta, final_subtitle: e.target.value } })} />
        </Field>
        <Field label="Final CTA — ปุ่ม">
          <CtaEditor value={settings.cta.final_button} onChange={final_button => update({ cta: { ...settings.cta, final_button } })} />
        </Field>
      </section>

      {/* ─── Sections ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6">
        <h2 className="text-[#D4AF37] font-bold font-display mb-4">Section Visibility</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(Object.keys(settings.sections) as (keyof typeof settings.sections)[]).map(key => (
            <label key={key} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(212,175,55,0.3)] transition-colors">
              <input type="checkbox" checked={settings.sections[key]} onChange={e => update({ sections: { ...settings.sections, [key]: e.target.checked } })} className="w-4 h-4 accent-[#D4AF37]" />
              <span className="text-sm text-[#F5E9D6] capitalize">{SECTION_LABELS[key] ?? key}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ─── Package Explorer ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <h2 className="text-[#D4AF37] font-bold font-display">Package Explorer</h2>
        <Field label="Title">
          <input className={inputClass} value={settings.package_explorer.title} onChange={e => update({ package_explorer: { ...settings.package_explorer, title: e.target.value } })} />
        </Field>
        <Field label="Subtitle">
          <textarea className={inputClass} rows={2} value={settings.package_explorer.subtitle} onChange={e => update({ package_explorer: { ...settings.package_explorer, subtitle: e.target.value } })} />
        </Field>
        <Field label="CTA Label">
          <input className={inputClass} value={settings.package_explorer.cta_label} onChange={e => update({ package_explorer: { ...settings.package_explorer, cta_label: e.target.value } })} />
        </Field>
        <Field label="Empty State Title">
          <input className={inputClass} value={settings.package_explorer.empty_title} onChange={e => update({ package_explorer: { ...settings.package_explorer, empty_title: e.target.value } })} />
        </Field>
        <Field label="Empty State Description">
          <textarea className={inputClass} rows={2} value={settings.package_explorer.empty_description} onChange={e => update({ package_explorer: { ...settings.package_explorer, empty_description: e.target.value } })} />
        </Field>
      </section>

      {/* ─── Latest News ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <h2 className="text-[#D4AF37] font-bold font-display">Latest News</h2>
        <p className="text-[11px] text-[#A1866B]">
          แสดงข่าวราชการล่าสุดบนหน้าแรก (ระหว่าง Package Explorer และ How It Works) — เปิด/ปิดการแสดงผลได้ที่การ์ด Section Visibility
        </p>
        <Field label="หัวข้อ">
          <input className={inputClass} value={settings.latest_news.title} onChange={e => update({ latest_news: { ...settings.latest_news, title: e.target.value } })} />
        </Field>
        <Field label="คำอธิบาย" hint="เว้นว่างได้">
          <textarea className={inputClass} rows={2} value={settings.latest_news.subtitle} onChange={e => update({ latest_news: { ...settings.latest_news, subtitle: e.target.value } })} />
        </Field>
        <Field label="ข้อความปุ่ม">
          <input className={inputClass} value={settings.latest_news.cta_label} onChange={e => update({ latest_news: { ...settings.latest_news, cta_label: e.target.value } })} />
        </Field>
        <Field label="จำนวนข่าวที่แสดง" hint="ตัวเลข 1–6">
          <select className={inputClass} value={settings.latest_news.limit} onChange={e => update({ latest_news: { ...settings.latest_news, limit: Number(e.target.value) } })}>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
      </section>

      {/* ─── Support ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <h2 className="text-[#D4AF37] font-bold font-display">Support</h2>
        <p className="text-[11px] text-[#A1866B]">
          หน้าแรกควบคุมเฉพาะการแสดงผล Support เท่านั้น แก้ไขข้อความ QR และข้อมูลบัญชีได้ที่หน้า Support
        </p>
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(212,175,55,0.3)] transition-colors">
          <input type="checkbox" checked={settings.support.enabled} onChange={e => update({ support: { ...settings.support, enabled: e.target.checked } })} className="w-4 h-4 accent-[#D4AF37]" />
          <span className="text-sm text-[#F5E9D6]">แสดง Support บนหน้าแรกและส่วนกลางของเว็บ</span>
        </label>
      </section>

      {/* ─── Footer ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <div>
          <h2 className="text-[#D4AF37] font-bold font-display">Social Channels</h2>
          <p className="text-xs text-[#A1866B] mt-0.5">
            ช่องทางโซเชียลหลักที่ใช้ทั่วทั้งเว็บไซต์ รวมถึง Footer และ Social Follow CTA
          </p>
        </div>
        {settings.footer.social_links.map((social, index) => (
          <div key={social.key} className="p-4 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={social.active}
                onChange={e => {
                  const social_links = [...settings.footer.social_links]
                  social_links[index] = { ...social, active: e.target.checked }
                  update({ footer: { ...settings.footer, social_links } })
                }}
                className="w-4 h-4 accent-[#D4AF37]"
              />
              <span className="text-sm text-[#F5E9D6]">{social.label}</span>
            </label>
            <Field label={`${social.label} URL`}>
              <input
                className={inputClass}
                value={social.url}
                onChange={e => {
                  const social_links = [...settings.footer.social_links]
                  social_links[index] = { ...social, url: e.target.value }
                  update({ footer: { ...settings.footer, social_links } })
                }}
              />
            </Field>
          </div>
        ))}
      </section>

      {/* ─── SEO ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
        <h2 className="text-[#D4AF37] font-bold font-display">SEO</h2>
        <Field label="Title">
          <input className={inputClass} value={settings.seo.title} onChange={e => update({ seo: { ...settings.seo, title: e.target.value } })} />
        </Field>
        <Field label="Description">
          <textarea className={inputClass} rows={2} value={settings.seo.description} onChange={e => update({ seo: { ...settings.seo, description: e.target.value } })} />
        </Field>
        <Field label="OG Image URL (ไม่บังคับ)" hint="เว้นว่าง = ใช้ค่าเริ่มต้น">
          <input className={inputClass} value={settings.seo.og_image_url} onChange={e => update({ seo: { ...settings.seo, og_image_url: e.target.value } })} />
        </Field>
      </section>

      {/* ─── Save bar ─── */}
      <div className="sticky bottom-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !isDirty}
          className="bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          บันทึก
        </button>
      </div>
    </div>
  )
}
