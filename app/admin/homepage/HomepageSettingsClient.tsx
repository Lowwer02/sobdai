'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import { Save, Loader2, Plus, Trash2, Camera, QrCode, Eye, X as XIcon } from 'lucide-react'
import { saveHomepageSettings } from './actions'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import QRCropper from '@/components/QRCropper'
import SupportModal from '@/components/SupportModal'
import type { HomepageSettings, FeatureItem, HowToStep, CtaButton, SupportConfig } from '@/lib/homepageConfig'

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

  // QR image upload state
  const [selectedQRImage, setSelectedQRImage] = useState<string | null>(null)
  const [isQRCropperOpen, setIsQRCropperOpen] = useState(false)
  const [isQRUploading, setIsQRUploading] = useState(false)
  const fileQRInputRef = useRef<HTMLInputElement>(null)

  // Support Modal preview state (uses current unsaved form values)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

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

  /** File picker → read as data URL → open QRCropper */
  const handleQRFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    if (file.size > 4 * 1024 * 1024) {
      toastEvent('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 4 MB', 'error')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      setSelectedQRImage(reader.result as string)
      setIsQRCropperOpen(true)
    }
  }

  /**
   * Receive cropped WebP blob from QRCropper → upload to
   * package-assets/support/qr.webp → save public URL into settings.
   * Using package-assets bucket (existing, public-read + auth-write RLS).
   * Path: support/qr.webp  (global support asset, not tied to any package).
   */
  const handleQRSave = async (blob: Blob) => {
    try {
      setIsQRUploading(true)
      const supabase = createClient()
      const filePath = 'support/qr.webp'

      const { error: uploadError } = await supabase.storage
        .from('package-assets')
        .upload(filePath, blob, { contentType: 'image/webp', upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('package-assets')
        .getPublicUrl(filePath)

      // Cache-bust so the new image is visible immediately without redeployment
      const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`
      update({ support: { ...settings.support, qr_image_url: cacheBustedUrl } })
      toastEvent('อัปโหลด QR Code สำเร็จ', 'success')
    } catch (err: any) {
      toastEvent(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด QR', 'error')
    } finally {
      setIsQRUploading(false)
      setSelectedQRImage(null)
      if (fileQRInputRef.current) fileQRInputRef.current.value = ''
    }
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

      {/* ─── Support ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[#D4AF37] font-bold font-display">Support Sobdai</h2>
            <p className="text-[10px] text-[#A1866B] mt-0.5">
              แสดง Support Card ใต้ Purchase CTA บนหน้า Package Detail
            </p>
          </div>
          {/* Preview button — opens real SupportModal with current (unsaved) form values */}
          <button
            id="support-preview-button"
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-[#D4AF37] transition-all"
            style={{
              background: 'rgba(212,175,55,0.07)',
              border: '1px solid rgba(212,175,55,0.2)',
            }}
            title="ดูตัวอย่าง Support Modal"
          >
            <Eye size={13} />
            ดูตัวอย่าง
          </button>
        </div>

        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(212,175,55,0.3)] transition-colors">
          <input
            type="checkbox"
            checked={settings.support.enabled}
            onChange={e => update({ support: { ...settings.support, enabled: e.target.checked } })}
            className="w-4 h-4 accent-[#D4AF37]"
          />
          <span className="text-sm text-[#F5E9D6]">เปิดใช้งาน Support Card</span>
        </label>

        {/* Core text fields */}
        <Field label="Support Title" hint="หัวข้อการ์ด เช่น ชอบ Sobdai ไหม?">
          <input
            className={inputClass}
            value={settings.support.title}
            onChange={e => update({ support: { ...settings.support, title: e.target.value } })}
          />
        </Field>
        <Field label="Support Description">
          <textarea
            className={inputClass}
            rows={3}
            value={settings.support.description}
            onChange={e => update({ support: { ...settings.support, description: e.target.value } })}
          />
        </Field>
        <Field label="Button Label" hint="ข้อความปุ่ม เช่น สนับสนุน Sobdai">
          <input
            className={inputClass}
            value={settings.support.button_label}
            onChange={e => update({ support: { ...settings.support, button_label: e.target.value } })}
          />
        </Field>

        {/* Divider */}
        <div className="border-t border-[rgba(255,255,255,0.05)] pt-1">
          <p className="text-[11px] text-[#A1866B] font-bold uppercase tracking-wider mb-4">PromptPay &amp; ช่องทางชำระเงิน</p>
        </div>

        {/* QR Image upload */}
        <Field label="QR Code Image" hint="WebP · อัตโนมัติ resize 512×512 · เว้นว่าง = แสดง placeholder">
          <div className="flex items-start gap-4">
            {/* Current QR thumbnail */}
            <div
              className="flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: settings.support.qr_image_url ? '#FFFFFF' : '#0F0B07', border: '1px solid rgba(212,175,55,0.15)' }}
            >
              {settings.support.qr_image_url ? (
                <Image
                  src={settings.support.qr_image_url}
                  alt="QR Code"
                  width={64}
                  height={64}
                  className="w-full h-full object-contain"
                />
              ) : (
                <QrCode size={28} className="text-[#A1866B]/40" />
              )}
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {/* Upload button */}
              <label
                htmlFor="qr-upload-input"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-[#F5E9D6] cursor-pointer transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                {isQRUploading ? <Loader2 size={14} className="animate-spin text-[#D4AF37]" /> : <Camera size={14} className="text-[#D4AF37]" />}
                {isQRUploading ? 'กำลังอัปโหลด...' : 'อัปโหลด QR Code'}
              </label>
              <input
                id="qr-upload-input"
                ref={fileQRInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleQRFileChange}
              />

              {/* Clear button */}
              {settings.support.qr_image_url && (
                <button
                  type="button"
                  onClick={() => update({ support: { ...settings.support, qr_image_url: '' } })}
                  className="flex items-center gap-1.5 text-[12px] text-[#A1866B] hover:text-red-400 transition-colors"
                >
                  <XIcon size={12} /> ลบ QR Code
                </button>
              )}
            </div>
          </div>
        </Field>

        {/* PromptPay Name */}
        <Field label="PromptPay Name" hint="ชื่อที่แสดงใต้ QR เช่น นาย Sobdai Dev">
          <input
            className={inputClass}
            value={settings.support.promptpay_name}
            placeholder="เช่น Sobdai"
            onChange={e => update({ support: { ...settings.support, promptpay_name: e.target.value } })}
          />
        </Field>

        {/* Optional bank info */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank Name (ไม่บังคับ)" hint="เช่น ธนาคารกสิกรไท">
            <input
              className={inputClass}
              value={settings.support.bank_name}
              placeholder="เว้นว่าง = ไม่แสดง"
              onChange={e => update({ support: { ...settings.support, bank_name: e.target.value } })}
            />
          </Field>
          <Field label="Account Number (ไม่บังคับ)">
            <input
              className={inputClass}
              value={settings.support.account_number}
              placeholder="เว้นว่าง = ไม่แสดง"
              onChange={e => update({ support: { ...settings.support, account_number: e.target.value } })}
            />
          </Field>
        </div>

        {/* Footer message */}
        <Field label="Footer Message" hint="ข้อความด้านล่างได้เลย เช่น ขอบคุณทุกการสนับสนุน ♥">
          <input
            className={inputClass}
            value={settings.support.footer_message}
            onChange={e => update({ support: { ...settings.support, footer_message: e.target.value } })}
          />
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

      {/* QR Cropper — separate concern from AvatarCropper */}
      <QRCropper
        isOpen={isQRCropperOpen}
        imageSrc={selectedQRImage}
        onClose={() => { setIsQRCropperOpen(false); setSelectedQRImage(null); if (fileQRInputRef.current) fileQRInputRef.current.value = '' }}
        onSave={handleQRSave}
      />

      {/* Support Modal Preview — uses current unsaved form values */}
      <SupportModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={settings.support.title}
        description={settings.support.description}
        qr_image_url={settings.support.qr_image_url}
        promptpay_name={settings.support.promptpay_name}
        bank_name={settings.support.bank_name}
        account_number={settings.support.account_number}
        footer_message={settings.support.footer_message}
      />
    </div>
  )
}

