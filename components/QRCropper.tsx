'use client'

/**
 * QRCropper — dedicated QR code image cropper.
 *
 * Mirrors AvatarCropper's UX (zoom slider, save/cancel) but uses cropShape="rect"
 * and a square aspect ratio (1:1) appropriate for QR codes. Separation of concerns:
 * Avatar and QR/Support concerns remain independent components.
 *
 * Internally uses the same libraries (react-easy-crop, getCroppedImg) as AvatarCropper
 * to ensure a consistent WebP → Supabase Storage pipeline.
 */

import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '@/lib/utils/cropImage'
import { X, ZoomIn, ZoomOut, Loader2, QrCode } from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'

interface QRCropperProps {
  isOpen: boolean
  imageSrc: string | null
  onClose: () => void
  /** Called with a WebP Blob; caller uploads to Storage and saves the URL. */
  onSave: (croppedBlob: Blob) => Promise<void>
}

export default function QRCropper({ isOpen, imageSrc, onClose, onSave }: QRCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    x: number; y: number; width: number; height: number
  } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const onCropComplete = useCallback((_croppedArea: any, pixels: any) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    try {
      setIsSaving(true)
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
      await onSave(blob)
      onClose()
    } catch (e: any) {
      toastEvent('เกิดข้อผิดพลาดในการครอปรูปภาพ: ' + e.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen || !imageSrc) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15,11,7,0.85)', backdropFilter: 'blur(4px)' }}
        onClick={() => !isSaving && onClose()}
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-[480px] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
        style={{ backgroundColor: '#1A140E', border: '1px solid rgba(212,175,55,0.15)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2.5">
            <QrCode size={18} className="text-[#D4AF37]" />
            <h3 className="text-lg font-display font-bold text-[#F5E9D6]">
              ปรับขนาด QR Code
            </h3>
          </div>
          <button
            type="button"
            onClick={() => !isSaving && onClose()}
            disabled={isSaving}
            className="text-[#A1866B] hover:text-[#F5E9D6] transition-colors p-1 rounded-full hover:bg-white/5 disabled:opacity-50"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Crop area — rect shape, 1:1 */}
        <div className="relative w-full h-[280px] sm:h-[360px]" style={{ backgroundColor: '#0F0B07' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={true}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        {/* Controls */}
        <div className="p-6" style={{ backgroundColor: '#1A140E' }}>
          {/* Zoom slider */}
          <div className="flex items-center gap-4 mb-5">
            <button
              type="button"
              onClick={() => setZoom(Math.max(1, zoom - 0.1))}
              className="text-[#A1866B] hover:text-[#D4AF37] transition-colors"
            >
              <ZoomOut size={20} />
            </button>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.05}
              aria-label="Zoom"
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
            />
            <button
              type="button"
              onClick={() => setZoom(Math.min(3, zoom + 0.1))}
              className="text-[#A1866B] hover:text-[#D4AF37] transition-colors"
            >
              <ZoomIn size={20} />
            </button>
          </div>

          <p className="text-[10px] text-[#A1866B] text-center mb-4">
            จัดวาง QR Code ให้อยู่ตรงกลางกรอบ เพื่อให้สแกนได้ง่าย
          </p>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl font-medium text-[#F5E9D6] transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl font-bold text-[#0F0B07] bg-[#D4AF37] hover:bg-[#F1D17A] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก QR Code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
