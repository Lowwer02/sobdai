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
  const wasOpenRef = useRef(false)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const getFocusableElements = () => {
    if (!dialogRef.current) return []
    return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ))
  }

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      setTypedValue('')
      const focusTimer = window.setTimeout(() => {
        if (requireTyping && inputRef.current) {
          inputRef.current.focus()
          return
        }
        const [firstFocusable] = getFocusableElements()
        if (firstFocusable) firstFocusable.focus()
        else dialogRef.current?.focus()
      }, 0)
      wasOpenRef.current = true
      return () => window.clearTimeout(focusTimer)
    }

    if (!isOpen && wasOpenRef.current) {
      const previouslyFocused = previouslyFocusedRef.current
      wasOpenRef.current = false
      previouslyFocusedRef.current = null
      if (previouslyFocused && previouslyFocused.isConnected) {
        window.setTimeout(() => previouslyFocused.focus(), 0)
      }
    }
  }, [isOpen, requireTyping])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        if (!isLoading) {
          e.preventDefault()
          onClose()
        }
        return
      }
      if (e.key !== 'Tab') return

      const focusable = getFocusableElements()
      if (focusable.length === 0) {
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const firstFocusable = focusable[0]
      const lastFocusable = focusable[focusable.length - 1]
      const activeElement = document.activeElement
      if (!dialogRef.current?.contains(activeElement)) {
        e.preventDefault()
        firstFocusable.focus()
      } else if (e.shiftKey && activeElement === firstFocusable) {
        e.preventDefault()
        lastFocusable.focus()
      } else if (!e.shiftKey && activeElement === lastFocusable) {
        e.preventDefault()
        firstFocusable.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoading, isOpen, onClose])

  if (!isOpen) return null

  const canConfirm = !requireTyping || typedValue === requireTyping

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={() => { if (!isLoading) onClose() }}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        tabIndex={-1}
        className="relative w-full max-w-md bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${isDestructive ? 'bg-destructive/10 text-destructive' : 'bg-wash text-brand'}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="dialog-title" className="text-xl font-bold font-display text-foreground mb-2">
                {title}
              </h3>
              <div id="dialog-description" className="text-muted-foreground text-sm leading-relaxed mb-6 whitespace-pre-line">
                {description}
              </div>

              {requireTyping && (
                <div className="mb-6">
                  <label className="block text-xs text-muted-foreground mb-2">
                    พิมพ์ <strong className="text-foreground font-mono">{requireTyping}</strong> เพื่อยืนยัน
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    className="w-full bg-input border border-border-subtle text-foreground rounded-xl px-4 py-2 focus:outline-none focus:border-destructive/50"
                    placeholder={requireTyping}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl text-foreground hover:bg-hover transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  aria-label={confirmText}
                  disabled={!canConfirm || isLoading}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDestructive
                      ? 'bg-destructive hover:bg-destructive/90 text-white'
                      : 'bg-brand-solid hover:bg-brand-hover text-brand-foreground'
                  }`}
                >
                  {isLoading ? 'รอสักครู่...' : confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>

        <button type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  )
}
