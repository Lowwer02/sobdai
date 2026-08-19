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

  let Icon = CheckCircle2
  let iconColor = 'text-[#22C55E]'
  let bgColor = 'bg-[#112A1C]'
  let borderColor = 'border-[#22C55E]/30'

  if (toast.type === 'error') {
    Icon = XCircle
    iconColor = 'text-[#FF4A4A]'
    bgColor = 'bg-[#2A1111]'
    borderColor = 'border-[#FF4A4A]/30'
  } else if (toast.type === 'info') {
    Icon = Info
    iconColor = 'text-[#3B82F6]'
    bgColor = 'bg-[#0F172A]'
    borderColor = 'border-[#3B82F6]/30'
  } else if (toast.type === 'warning') {
    Icon = AlertTriangle
    iconColor = 'text-[#F59E0B]'
    bgColor = 'bg-[#2A1F0D]'
    borderColor = 'border-[#F59E0B]/30'
  }

  return (
    <div
      className={`pointer-events-auto flex items-start sm:items-center gap-3 p-4 rounded-xl border shadow-[0_10px_40px_rgba(0,0,0,0.5)] ${bgColor} ${borderColor} max-w-sm w-full backdrop-blur-md transition-all duration-200 ease-out ${
        isExiting
          ? 'opacity-0 -translate-y-2.5 scale-95 pointer-events-none'
          : 'animate-toast-enter opacity-100 translate-y-0 scale-100'
      }`}
      role="alert"
    >
      <Icon className={`shrink-0 mt-0.5 sm:mt-0 ${iconColor}`} size={20} />
      <div className="flex-1 text-[#F5E9D6] text-[14px] font-medium pr-2 leading-snug">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-1 shrink-0 -mr-1 -mt-1 sm:mt-0 text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
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
