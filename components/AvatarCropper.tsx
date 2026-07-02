'use client'

import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { motion, AnimatePresence } from 'framer-motion'
import { getCroppedImg } from '@/lib/utils/cropImage'
import { X, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'

interface AvatarCropperProps {
  isOpen: boolean
  imageSrc: string | null
  onClose: () => void
  onSave: (croppedBlob: Blob) => Promise<void>
}

export default function AvatarCropper({ isOpen, imageSrc, onClose, onSave }: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return

    try {
      setIsSaving(true)
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      await onSave(croppedImageBlob)
      onClose()
    } catch (e: any) {
      toastEvent('เกิดข้อผิดพลาดในการครอปรูปภาพ: ' + e.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && imageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#0F0B07]/80 backdrop-blur-sm"
            onClick={() => !isSaving && onClose()}
          />

          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 w-full max-w-[500px] bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)]">
              <h3 className="text-xl font-display font-bold text-[#F5E9D6]">ปรับขนาดรูปโปรไฟล์</h3>
              <button type="button" 
                onClick={() => !isSaving && onClose()}
                disabled={isSaving}
                className="text-[#A1866B] hover:text-[#F5E9D6] transition-colors p-1 rounded-full hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="relative w-full h-[300px] sm:h-[400px] bg-[#0F0B07]">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="p-6 bg-[#1A140E]">
              <div className="flex items-center gap-4 mb-6">
                <button type="button" onClick={() => setZoom(Math.max(1, zoom - 0.1))} className="text-[#A1866B] hover:text-[#D4AF37]"><ZoomOut size={20}/></button>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-label="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                />
                <button type="button" onClick={() => setZoom(Math.min(3, zoom + 0.1))} className="text-[#A1866B] hover:text-[#D4AF37]"><ZoomIn size={20}/></button>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button type="button" 
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl font-medium text-[#F5E9D6] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button type="button" 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl font-bold text-[#0F0B07] bg-[#D4AF37] hover:bg-[#F1D17A] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกรูปโปรไฟล์'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
