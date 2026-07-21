'use client'

import React, { useEffect } from 'react'
import { X, Heart, Sparkles } from 'lucide-react'

interface SupportModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description: string
}

/**
 * Support Sobdai Modal — v1 Placeholder.
 *
 * Displays a thank-you message and a reserved area for future payment methods
 * (PromptPay QR, bank account, etc.). No payment logic is implemented here.
 *
 * Future versions: add qr_image_url, bank_account, thank_you_message props.
 */
export default function SupportModal({ isOpen, onClose, title, description }: SupportModalProps) {
  // Trap focus / close on ESC
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        className="relative w-full max-w-md rounded-[24px] overflow-hidden shadow-2xl"
        style={{
          backgroundColor: '#1A140E',
          border: '1px solid rgba(212,175,55,0.25)',
          animation: 'supportModalIn 0.22s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gold top-glow accent */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)' }}
        />

        {/* Close button */}
        <button
          id="support-modal-close"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center text-[#A1866B] hover:text-[#F5E9D6] hover:bg-white/5 transition-colors"
          aria-label="ปิด"
        >
          <X size={18} />
        </button>

        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
                border: '1px solid rgba(212,175,55,0.2)',
              }}
            >
              <Heart size={26} className="text-[#D4AF37]" fill="rgba(212,175,55,0.3)" />
            </div>
            <h2 className="text-xl font-bold font-display text-[#F5E9D6]">{title}</h2>
            <p className="text-[#A1866B] text-[14px] leading-relaxed max-w-sm">{description}</p>
          </div>

          {/* Placeholder area — reserved for PromptPay QR / bank account */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(212,175,55,0.2)',
            }}
          >
            <Sparkles size={24} className="text-[#D4AF37]/40" />
            <p className="text-[#A1866B] text-[13px] leading-snug">
              ช่องทางการสนับสนุนจะเปิดให้ใช้งานเร็วๆ นี้
            </p>
            <p className="text-[#A1866B]/50 text-[11px]">
              PromptPay · บัญชีธนาคาร · ช่องทางอื่นๆ
            </p>
          </div>

          {/* Thank-you note */}
          <p className="text-center text-[#D4AF37]/60 text-[12px] leading-relaxed">
            ขอบคุณทุกการสนับสนุนที่ช่วยให้ Sobdai พัฒนาต่อไปได้ ♥
          </p>
        </div>
      </div>

      <style>{`
        @keyframes supportModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
