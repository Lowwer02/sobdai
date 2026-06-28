'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string | React.ReactNode
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  requireTyping?: string
  isLoading?: boolean
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  requireTyping,
  isLoading = false
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTypedValue('')
      setTimeout(() => {
        if (requireTyping && inputRef.current) {
          inputRef.current.focus()
        } else if (dialogRef.current) {
          const focusable = dialogRef.current.querySelectorAll('button:not([disabled])')
          if (focusable.length > 0) {
            (focusable[focusable.length - 1] as HTMLElement).focus()
          }
        }
      }, 50)
    }
  }, [isOpen, requireTyping])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const canConfirm = !requireTyping || typedValue === requireTyping

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#0F0B07]/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="relative w-full max-w-md bg-[#1A140E] border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${isDestructive ? 'bg-red-500/10 text-red-500' : 'bg-[#D4AF37]/10 text-[#D4AF37]'}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="dialog-title" className="text-xl font-bold font-display text-[#F5E9D6] mb-2">
                {title}
              </h3>
              <div className="text-[#A1866B] text-sm leading-relaxed mb-6">
                {description}
              </div>

              {requireTyping && (
                <div className="mb-6">
                  <label className="block text-xs text-[#A1866B] mb-2">
                    พิมพ์ <strong className="text-[#F5E9D6] font-mono">{requireTyping}</strong> เพื่อยืนยัน
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-red-500/50"
                    placeholder={requireTyping}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!canConfirm || isLoading}
                  className={`px-4 py-2 rounded-xl text-[#0F0B07] font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDestructive 
                      ? 'bg-red-500 hover:bg-red-400' 
                      : 'bg-[#D4AF37] hover:bg-[#F2D06B]'
                  }`}
                >
                  {isLoading ? 'รอสักครู่...' : confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  )
}
