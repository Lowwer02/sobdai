'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2, Plus, Trash2 } from 'lucide-react'
import { saveHomepageSettings } from './actions'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import type { HomepageSettings, FeatureItem, HowToStep, CtaButton } from '@/lib/homepageConfig'

const ICON_OPTIONS = [
  { key: 'exam', label: 'ข้อสอบ' },
  { key: 'hint', label: 'คำใบ้' },
  { key: 'explain', label: 'เฉลย' },
  { key: 'lock', label: 'ล็อก/ซื้อขาด' },
]

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


  // Feature / HowTo array editors
  const updateFeature = (i: number, patch: Partial<FeatureItem>) => {
    const features = [...settings.features]
    features[i] = { ...features[i], ...patch }
    update({ features })
  }
  const addFeature = () => update({ features: [...settings.features, { icon: 'exam', title: '', description: '' }] })
  const removeFeature = (i: number) => update({ features: settings.features.filter((_, idx) => idx !== i) })

  const updateStep = (i: number, patch: Partial<HowToStep>) => {
    const howto = [...settings.howto]
    howto[i] = { ...howto[i], ...patch }
    update({ howto })
  }
  const addStep = () => update({ howto: [...settings.howto, { num: '', title: '', desc: '' }] })
  const removeStep = (i: number) => update({ howto: settings.howto.filter((_, idx) => idx !== i) })

  const stats = settings.hero.stats
  const updateStat = (i: number, patch: Partial<typeof stats[0]>) => {
    const next = [...stats]
    next[i] = { ...next[i], ...patch }
    update({ hero: { ...settings.hero, stats: next } })
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
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#A1866B] font-bold uppercase">สถิติ (Social Proof)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.map((s, i) => (
              <div key={i} className="p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] space-y-2">
                <input className={inputClass} placeholder="value" value={s.value} onChange={e => updateStat(i, { value: e.target.value })} />
                <input className={inputClass} placeholder="label" value={s.label} onChange={e => updateStat(i, { label: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
        <h2 className="text-[#D4AF37] font-bold font-display">CTA</h2>
        <Field label="ปุ่มหลัก (Hero)">
          <CtaEditor value={settings.cta.primary} onChange={primary => update({ cta: { ...settings.cta, primary } })} />
        </Field>
        <Field label="ปุ่มรอง (Hero)">
          <CtaEditor value={settings.cta.secondary} onChange={secondary => update({ cta: { ...settings.cta, secondary } })} />
        </Field>
        <div className="pt-2 border-t border-[rgba(255,255,255,0.05)] space-y-3">
          <Field label="Final CTA — Title">
            <input className={inputClass} value={settings.cta.final_title} onChange={e => update({ cta: { ...settings.cta, final_title: e.target.value } })} />
          </Field>
          <Field label="Final CTA — Subtitle">
            <input className={inputClass} value={settings.cta.final_subtitle} onChange={e => update({ cta: { ...settings.cta, final_subtitle: e.target.value } })} />
          </Field>
          <Field label="Final CTA — ปุ่ม">
            <CtaEditor value={settings.cta.final_button} onChange={final_button => update({ cta: { ...settings.cta, final_button } })} />
          </Field>
        </div>
      </section>

      {/* ─── Sections ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6">
        <h2 className="text-[#D4AF37] font-bold font-display mb-4">Section Visibility</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(Object.keys(settings.sections) as (keyof typeof settings.sections)[]).map(key => (
            <label key={key} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(212,175,55,0.3)] transition-colors">
              <input type="checkbox" checked={settings.sections[key]} onChange={e => update({ sections: { ...settings.sections, [key]: e.target.checked } })} className="w-4 h-4 accent-[#D4AF37]" />
              <span className="text-sm text-[#F5E9D6] capitalize">{key}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[#D4AF37] font-bold font-display">Features (ทำไมต้องสอบได้)</h2>
          <button type="button" onClick={addFeature} className="text-xs bg-[#D4AF37]/10 border border-[rgba(212,175,55,0.3)] text-[#D4AF37] px-3 py-1.5 rounded-lg hover:bg-[#D4AF37]/20 flex items-center gap-1.5"><Plus size={14} /> เพิม</button>
        </div>
        {settings.features.map((f, i) => (
          <div key={i} className="p-4 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] space-y-2">
            <div className="flex justify-between items-center">
              <select className={`${inputClass} max-w-[160px]`} value={f.icon} onChange={e => updateFeature(i, { icon: e.target.value })}>
                {ICON_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button type="button" onClick={() => removeFeature(i)} className="text-[#A1866B] hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
            <input className={inputClass} placeholder="Title" value={f.title} onChange={e => updateFeature(i, { title: e.target.value })} />
            <textarea className={inputClass} rows={2} placeholder="Description" value={f.description} onChange={e => updateFeature(i, { description: e.target.value })} />
          </div>
        ))}
      </section>

      {/* ─── How To ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[#D4AF37] font-bold font-display">How To (วิธีใช้งาน)</h2>
          <button type="button" onClick={addStep} className="text-xs bg-[#D4AF37]/10 border border-[rgba(212,175,55,0.3)] text-[#D4AF37] px-3 py-1.5 rounded-lg hover:bg-[#D4AF37]/20 flex items-center gap-1.5"><Plus size={14} /> เพิ่ม</button>
        </div>
        {settings.howto.map((s, i) => (
          <div key={i} className="p-4 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] space-y-2">
            <div className="flex gap-2">
              <input className={`${inputClass} max-w-[80px]`} placeholder="01" value={s.num} onChange={e => updateStep(i, { num: e.target.value })} />
              <input className={inputClass} placeholder="Title" value={s.title} onChange={e => updateStep(i, { title: e.target.value })} />
              <button type="button" onClick={() => removeStep(i)} className="text-[#A1866B] hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
            <textarea className={inputClass} rows={2} placeholder="Description" value={s.desc} onChange={e => updateStep(i, { desc: e.target.value })} />
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
