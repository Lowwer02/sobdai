'use client'

import { useToast } from '@/hooks/useToast'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map(toast => {
        let Icon = CheckCircle2
        let iconColor = 'text-green-500'
        let bgColor = 'bg-[#1A140E]'
        let borderColor = 'border-green-500/20'

        if (toast.type === 'error') {
          Icon = XCircle
          iconColor = 'text-red-500'
          borderColor = 'border-red-500/20'
        } else if (toast.type === 'info') {
          Icon = Info
          iconColor = 'text-blue-500'
          borderColor = 'border-blue-500/20'
        }

        return (
          <div 
            key={toast.id}
            className={`flex items-center gap-3 p-4 rounded-xl border shadow-xl animate-in slide-in-from-right-4 fade-in duration-300 ${bgColor} ${borderColor}`}
            role="alert"
          >
            <Icon className={`shrink-0 ${iconColor}`} size={20} />
            <span className="text-[#F5E9D6] text-sm font-medium pr-4">{toast.message}</span>
            <button 
              onClick={() => removeToast(toast.id)}
              className="p-1 ml-auto text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
              aria-label="Close toast"
            >
              <X size={16} />
            </button>
            {/* Auto dismiss after 4s */}
            <AutoDismiss id={toast.id} onDismiss={removeToast} />
          </div>
        )
      })}
    </div>
  )
}

function AutoDismiss({ id, onDismiss }: { id: string, onDismiss: (id: string) => void }) {
  import('react').then(({ useEffect }) => {
    useEffect(() => {
      const timer = setTimeout(() => {
        onDismiss(id)
      }, 4000)
      return () => clearTimeout(timer)
    }, [id, onDismiss])
  })
  return null
}
