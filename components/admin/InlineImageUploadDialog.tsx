'use client'

import { useState, useRef, useEffect } from 'react'
import { Image as ImageIcon, Upload, X, Loader2, AlertCircle } from 'lucide-react'

export interface InlineImageUploadDialogProps {
  isOpen: boolean
  onClose: () => void
  scope: 'news' | 'articles'
  entityId?: string | null
  onSuccess: (result: { url: string; alt: string; key: string }) => void
}

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 // 4 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function InlineImageUploadDialog({
  isOpen,
  onClose,
  scope,
  entityId,
  onSuccess,
}: InlineImageUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state whenever modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setFile(null)
      setAltText('')
      setErrorMsg(null)
      setIsUploading(false)
    }
  }, [isOpen])

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || isUploading) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isUploading, onClose])

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null)
    const selected = e.target.files?.[0]
    if (!selected) return

    // Pre-validate file type
    if (!ALLOWED_TYPES.includes(selected.type) && !/\.(jpe?g|png|webp)$/i.test(selected.name)) {
      setErrorMsg('รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG และ WebP เท่านั้น')
      setFile(null)
      return
    }

    // Pre-validate file size (4 MB limit)
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setErrorMsg(`ขนาดไฟล์เกินกำหนด (สูงสุด 4 MB) ไฟล์ที่เลือกมีขนาด ${(selected.size / (1024 * 1024)).toFixed(2)} MB`)
      setFile(null)
      return
    }

    setFile(selected)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isUploading) return

    setErrorMsg(null)

    if (!file) {
      setErrorMsg('กรุณาเลือกไฟล์รูปภาพที่ต้องการอัปโหลด')
      return
    }

    const trimmedAlt = altText.trim()
    if (!trimmedAlt) {
      setErrorMsg('กรุณาระบุคำอธิบายรูปภาพ (Alt Text)')
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('scope', scope)
      if (entityId && entityId.trim()) {
        formData.append('entityId', entityId.trim())
      }

      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json || !json.success || !json.asset?.url) {
        const message = json?.error || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ กรุณาลองใหม่อีกครั้ง'
        setErrorMsg(message)
        setIsUploading(false)
        return
      }

      // Success
      onSuccess({
        url: json.asset.url,
        alt: trimmedAlt,
        key: json.asset.key,
      })
      onClose()
    } catch {
      setErrorMsg('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#0F0B07]/80 backdrop-blur-sm"
        onClick={() => {
          if (!isUploading) onClose()
        }}
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-upload-dialog-title"
        className="relative w-full max-w-md bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-2xl shadow-2xl overflow-hidden z-10"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#D4AF37]/15">
            <div className="flex items-center gap-2 text-[#D4AF37]">
              <ImageIcon size={20} />
              <h3 id="image-upload-dialog-title" className="text-lg font-bold font-display text-[#F5E9D6]">
                แทรกรูปภาพ (Upload Image)
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="text-[#A1866B] hover:text-[#F5E9D6] transition-colors disabled:opacity-30"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error banner */}
            {errorMsg && (
              <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* File selection box */}
            <div>
              <label className="block text-xs font-semibold text-[#F5E9D6] mb-1.5">
                ไฟล์รูปภาพ <span className="text-[#D4AF37]">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={isUploading}
                className="hidden"
                id="inline-image-file-input"
              />
              <div
                onClick={() => {
                  if (!isUploading) fileInputRef.current?.click()
                }}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  file
                    ? 'border-[#D4AF37]/60 bg-[#D4AF37]/5'
                    : 'border-[#D4AF37]/20 hover:border-[#D4AF37]/40 bg-[#0F0B07]'
                } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#F5E9D6] truncate">{file.name}</p>
                    <p className="text-xs text-[#A1866B]">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • คลิกเพื่อเปลี่ยนไฟล์
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 py-1">
                    <Upload size={24} className="mx-auto text-[#A1866B]" />
                    <p className="text-xs font-medium text-[#F5E9D6]">คลิกเพื่อเลือกไฟล์รูปภาพ</p>
                    <p className="text-[11px] text-[#A1866B]">รองรับ JPEG, PNG, WebP (สูงสุด 4 MB)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Alt text field */}
            <div>
              <label htmlFor="inline-image-alt" className="block text-xs font-semibold text-[#F5E9D6] mb-1.5">
                คำอธิบายภาพ (Alt Text) <span className="text-[#D4AF37]">(จำเป็น)</span>
              </label>
              <input
                id="inline-image-alt"
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="ระบุข้อความอธิบายภาพสั้นๆ สำหรับผู้พิการและ SEO..."
                disabled={isUploading}
                className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-xl px-3.5 py-2 text-sm text-[#F5E9D6] placeholder-[#A1866B]/50 focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#A1866B] mt-1">
                ระบบจะแปลงรูปภาพเป็น WebP คุณภาพสูง (ความกว้างสูงสุด 1200px) โดยอัตโนมัติ
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#F5E9D6] hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={!file || !altText.trim() || isUploading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#F2D06B] text-[#0F0B07] text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังอัปโหลด...</span>
                  </>
                ) : (
                  <span>อัปโหลดและแทรก</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
