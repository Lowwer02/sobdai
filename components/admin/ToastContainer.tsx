'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/hooks/useToast'
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from 'lucide-react'

interface ToastItemProps {
  toast: {
    id: string
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
    duration: number
  }
  onRemove: (id: string) => void
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false)

  const handleDismiss = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onRemove(toast.id)
    }, 200)
  }, [toast.id, onRemove])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss()
    }, toast.duration)
    return () => clearTimeout(timer)
  }, [toast.duration, handleDismiss])

  // Type color stays semantic (icon + border + a solid, card-tinted background
  // via color-mix so the toast stays readable over any content in both themes).
  let Icon = CheckCircle2
  let iconColor = 'text-success'
  let borderColor = 'border-success-border'
  let bgStyle = { backgroundColor: 'color-mix(in srgb, var(--success) 8%, var(--card))' }

  if (toast.type === 'error') {
    Icon = XCircle
    iconColor = 'text-destructive'
    borderColor = 'border-destructive-border'
    bgStyle = { backgroundColor: 'color-mix(in srgb, var(--destructive) 8%, var(--card))' }
  } else if (toast.type === 'info') {
    Icon = Info
    iconColor = 'text-info'
    borderColor = 'border-info-border'
    bgStyle = { backgroundColor: 'color-mix(in srgb, var(--info) 8%, var(--card))' }
  } else if (toast.type === 'warning') {
    Icon = AlertTriangle
    iconColor = 'text-warning'
    borderColor = 'border-warning-border'
    bgStyle = { backgroundColor: 'color-mix(in srgb, var(--warning) 8%, var(--card))' }
  }

  return (
    <div
      style={bgStyle}
      className={`pointer-events-auto flex items-start sm:items-center gap-3 p-4 rounded-xl border shadow-[var(--shadow-lg)] ${borderColor} max-w-sm w-full backdrop-blur-md transition-all duration-200 ease-out ${
        isExiting
          ? 'opacity-0 -translate-y-2.5 scale-95 pointer-events-none'
          : 'animate-toast-enter opacity-100 translate-y-0 scale-100'
      }`}
      role="alert"
    >
      <Icon className={`shrink-0 mt-0.5 sm:mt-0 ${iconColor}`} size={20} />
      <div className="flex-1 text-foreground text-[14px] font-medium pr-2 leading-snug">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-1 shrink-0 -mr-1 -mt-1 sm:mt-0 text-muted-foreground hover:text-foreground hover:bg-hover rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50"
        aria-label="ปิดการแจ้งเตือน"
      >
        <X size={16} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div
      className="fixed top-[calc(env(safe-area-inset-top,0px)+104px)] left-4 right-4 md:left-auto md:right-4 z-[9999] flex flex-col items-center md:items-end gap-3 pointer-events-none"
      aria-live="assertive"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
