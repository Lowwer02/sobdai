'use client'

/**
 * Support Settings Admin Client — dedicated page for managing Support configuration.
 *
 * Extracted from HomepageSettingsClient to give Support its own admin surface.
 * Reuses: SupportConfig, QRCropper, SupportModal, package-assets storage.
 * Data flow: extended_config.support → saveSupportSettings() → same DB path.
 */

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import { Save, Loader2, Camera, QrCode, Eye, X as XIcon, Heart } from 'lucide-react'
import { saveSupportSettings } from './actions'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import QRCropper from '@/components/QRCropper'
import SupportModal from '@/components/SupportModal'
import type { SupportConfig } from '@/lib/homepageConfig'

// ── Shared UI primitives (same style as other admin pages) ──

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

export default function SupportSettingsClient({ initial }: { initial: SupportConfig }) {
  const [config, setConfig] = useState<SupportConfig>(initial)
  const [isPending, startTransition] = useTransition()
  const [isDirty, setIsDirty] = useState(false)

  // QR image upload state
  const [selectedQRImage, setSelectedQRImage] = useState<string | null>(null)
  const [isQRCropperOpen, setIsQRCropperOpen] = useState(false)
  const [isQRUploading, setIsQRUploading] = useState(false)
  const fileQRInputRef = useRef<HTMLInputElement>(null)

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  useUnsavedChanges(isDirty)

  const update = (patch: Partial<SupportConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }))
    setIsDirty(true)
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveSupportSettings(config)
      if (res.success) {
        toastEvent('บันทึกการตั้งค่า Support เรียบร้อย', 'success')
        setIsDirty(false)
      } else {
        toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
      }
    })
  }

  // ── QR Upload Flow (same pipeline as before) ──

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

      const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`
      update({ qr_image_url: cacheBustedUrl })
      toastEvent('อัปโหลด QR Code สำเร็จ', 'success')
    } catch (err: any) {
      toastEvent(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด QR', 'error')
    } finally {
      setIsQRUploading(false)
      setSelectedQRImage(null)
      if (fileQRInputRef.current) fileQRInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ─── General ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[#D4AF37] font-bold font-display">General</h2>
          {/* Preview button */}
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
            checked={config.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            className="w-4 h-4 accent-[#D4AF37]"
          />
          <span className="text-sm text-[#F5E9D6]">เปิดใช้งาน Support Card</span>
        </label>

        <Field label="Title" hint="หัวข้อการ์ด เช่น ชอบ Sobdai ไหม?">
          <input
            className={inputClass}
            value={config.title}
            onChange={e => update({ title: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={inputClass}
            rows={3}
            value={config.description}
            onChange={e => update({ description: e.target.value })}
          />
        </Field>
        <Field label="Button Label" hint="ข้อความปุ่ม เช่น สนับสนุน Sobdai">
          <input
            className={inputClass}
            value={config.button_label}
            onChange={e => update({ button_label: e.target.value })}
          />
        </Field>
      </section>

      {/* ─── Payment ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        <h2 className="text-[#D4AF37] font-bold font-display">Payment</h2>

        {/* QR Image upload */}
        <Field label="QR Code Image" hint="WebP · อัตโนมัติ resize 512×512 · เว้นว่าง = แสดง placeholder">
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: config.qr_image_url ? '#FFFFFF' : '#0F0B07', border: '1px solid rgba(212,175,55,0.15)' }}
            >
              {config.qr_image_url ? (
                <Image
                  src={config.qr_image_url}
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

              {config.qr_image_url && (
                <button
                  type="button"
                  onClick={() => update({ qr_image_url: '' })}
                  className="flex items-center gap-1.5 text-[12px] text-[#A1866B] hover:text-red-400 transition-colors"
                >
                  <XIcon size={12} /> ลบ QR Code
                </button>
              )}
            </div>
          </div>
        </Field>

        <Field label="PromptPay Name" hint="ชื่อที่แสดงใต้ QR เช่น นาย Sobdai Dev">
          <input
            className={inputClass}
            value={config.promptpay_name}
            placeholder="เช่น Sobdai"
            onChange={e => update({ promptpay_name: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank Name (ไม่บังคับ)" hint="เช่น ธนาคารกสิกรไทย">
            <input
              className={inputClass}
              value={config.bank_name}
              placeholder="เว้นว่าง = ไม่แสดง"
              onChange={e => update({ bank_name: e.target.value })}
            />
          </Field>
          <Field label="Account Number (ไม่บังคับ)">
            <input
              className={inputClass}
              value={config.account_number}
              placeholder="เว้นว่าง = ไม่แสดง"
              onChange={e => update({ account_number: e.target.value })}
            />
          </Field>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        <h2 className="text-[#D4AF37] font-bold font-display">Footer</h2>
        <Field label="Footer Message" hint="ข้อความด้านล่างได้เลย เช่น ขอบคุณทุกการสนับสนุน ♥">
          <input
            className={inputClass}
            value={config.footer_message}
            onChange={e => update({ footer_message: e.target.value })}
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

      {/* QR Cropper */}
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
        title={config.title}
        description={config.description}
        qr_image_url={config.qr_image_url}
        promptpay_name={config.promptpay_name}
        bank_name={config.bank_name}
        account_number={config.account_number}
        footer_message={config.footer_message}
      />
    </div>
  )
}
