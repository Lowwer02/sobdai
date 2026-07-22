'use client'

/**
 * Support Sobdai Modal — v1.1
 *
 * Replaces the v1 placeholder with a real PromptPay QR experience.
 * QR image is loaded lazily (only after the modal opens) so it doesn't
 * impact initial page load performance.
 *
 * If qr_image_url is empty, the original dashed placeholder is shown so
 * the modal never renders a broken image.
 */

import React, { useEffect, useRef } from 'react'
import Image from 'next/image'
import { X, Heart, Sparkles, QrCode, Building2 } from 'lucide-react'
import type { SupportConfig } from '@/lib/homepageConfig'

/** All fields the caller must provide, forwarded from SupportConfig. */
export interface SupportModalProps extends Omit<SupportConfig, 'enabled' | 'button_label'> {
  isOpen: boolean
  onClose: () => void
}

export default function SupportModal({
  isOpen,
  onClose,
  title,
  description,
  qr_image_url,
  promptpay_name,
  bank_name,
  account_number,
  footer_message,
}: SupportModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // ESC key + focus trap + body scroll lock + focus restore
  useEffect(() => {
    if (!isOpen) return

    // Save currently focused element to restore upon close
    previousFocusRef.current = document.activeElement as HTMLElement

    // Auto-focus modal panel or close button
    const timer = setTimeout(() => {
      const closeBtn = panelRef.current?.querySelector<HTMLButtonElement>('#support-modal-close')
      if (closeBtn) {
        closeBtn.focus()
      } else if (panelRef.current) {
        panelRef.current.focus()
      }
    }, 50)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Tab Focus Trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus()
            e.preventDefault()
          }
        } else {
          if (document.activeElement === last) {
            first.focus()
            e.preventDefault()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const hasQR = Boolean(qr_image_url)
  const hasBankInfo = Boolean(bank_name || account_number)

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="support-modal-title"
      aria-describedby="support-modal-desc"
    >
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl focus:outline-none"
        style={{
          backgroundColor: '#1A140E',
          border: '1px solid rgba(212,175,55,0.25)',
          animation: 'supportModalIn 0.22s ease-out',
          maxHeight: '92dvh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gold top-glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px z-10"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)' }}
        />

        {/* Close button */}
        <button
          id="support-modal-close"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center text-[#A1866B] hover:text-[#F5E9D6] hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          aria-label="ปิดป๊อปอัป"
        >
          <X size={18} />
        </button>

        <div className="p-6 space-y-5">
          {/* ── Header ── */}
          <div className="flex flex-col items-center text-center gap-2 pt-1">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
              style={{
                background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
                border: '1px solid rgba(212,175,55,0.2)',
              }}
            >
              <Heart size={22} className="text-[#D4AF37]" fill="rgba(212,175,55,0.3)" />
            </div>
            <h2 id="support-modal-title" className="text-[18px] font-bold font-display text-[#F5E9D6]">{title}</h2>
            <p id="support-modal-desc" className="text-[#A1866B] text-[13px] leading-relaxed max-w-xs">{description}</p>
          </div>

          {/* ── QR Section ── */}
          {hasQR ? (
            <div className="flex flex-col items-center gap-3">
              {/* QR image — lazy: only fetched when modal opens */}
              <div
                className="rounded-2xl p-3 flex items-center justify-center"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(212,175,55,0.15)',
                  width: 220,
                  height: 220,
                }}
              >
                <Image
                  src={qr_image_url}
                  alt="PromptPay QR Code"
                  width={196}
                  height={196}
                  loading="lazy"
                  className="rounded-xl"
                  style={{ objectFit: 'contain' }}
                />
              </div>

              {/* PromptPay label */}
              {promptpay_name && (
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="flex items-center gap-1.5">
                    <QrCode size={13} className="text-[#D4AF37]/70" />
                    <span className="text-[11px] text-[#A1866B] uppercase tracking-wider font-semibold">
                      PromptPay
                    </span>
                  </div>
                  <span className="text-[#F5E9D6] text-[15px] font-bold">{promptpay_name}</span>
                </div>
              )}
            </div>
          ) : (
            /* Placeholder — shown when no QR is configured */
            <div
              className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(212,175,55,0.2)',
              }}
            >
              <Sparkles size={22} className="text-[#D4AF37]/40" />
              <p className="text-[#A1866B] text-[13px] leading-snug">
                ช่องทางการสนับสนุนจะเปิดให้ใช้งานเร็วๆ นี้
              </p>
              <p className="text-[#A1866B]/50 text-[11px]">
                PromptPay · บัญชีธนาคาร · ช่องทางอื่นๆ
              </p>
            </div>
          )}

          {/* ── Optional bank info ── */}
          {hasBankInfo && (
            <div
              className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Building2 size={15} className="text-[#A1866B] mt-0.5 flex-shrink-0" />
              <div className="space-y-0.5">
                {bank_name && (
                  <p className="text-[#A1866B] text-[12px]">{bank_name}</p>
                )}
                {account_number && (
                  <p className="text-[#F5E9D6] text-[14px] font-bold tracking-widest">
                    {account_number}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Footer message ── */}
          {footer_message && (
            <p className="text-center text-[#D4AF37]/60 text-[12px] leading-relaxed">
              {footer_message}
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes supportModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  )
}
