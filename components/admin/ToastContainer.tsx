'use client'

import { useEffect } from 'react'
import { useToast } from '@/hooks/useToast'
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div 
      className="fixed top-[env(safe-area-inset-top,0px)] mt-[88px] left-4 right-4 md:left-auto md:right-4 z-[9999] flex flex-col items-center md:items-end gap-3 pointer-events-none"
      aria-live="assertive"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map(toast => {
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
            <motion.div 
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start sm:items-center gap-3 p-4 rounded-xl border shadow-[0_10px_40px_rgba(0,0,0,0.5)] ${bgColor} ${borderColor} max-w-sm w-full backdrop-blur-md`}
              role="alert"
            >
              <Icon className={`shrink-0 mt-0.5 sm:mt-0 ${iconColor}`} size={20} />
              <div className="flex-1 text-[#F5E9D6] text-[14px] font-medium pr-2 leading-snug">
                {toast.message}
              </div>
              <button 
                onClick={() => removeToast(toast.id)}
                className="p-1 shrink-0 -mr-1 -mt-1 sm:mt-0 text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                aria-label="ปิดการแจ้งเตือน"
              >
                <X size={16} />
              </button>
              <AutoDismiss id={toast.id} duration={toast.duration} onDismiss={removeToast} />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function AutoDismiss({ id, duration, onDismiss }: { id: string, duration: number, onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id)
    }, duration)
    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])
  return null
}
