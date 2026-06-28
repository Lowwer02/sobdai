'use client'

import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastMessage {
  id: string
  message: string
  type: ToastType
}

// Global event bus for toasts to avoid context boilerplate everywhere
export const toastEvent = (message: string, type: ToastType = 'success') => {
  const event = new CustomEvent('sobdai-toast', { detail: { message, type } })
  window.dispatchEvent(event)
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handleToast = (e: CustomEvent<{ message: string; type: ToastType }>) => {
      const { message, type } = e.detail
      
      setToasts(prev => {
        // Prevent exact duplicates currently showing
        if (prev.some(t => t.message === message)) return prev
        
        const id = Math.random().toString(36).substring(2, 9)
        return [...prev, { id, message, type }]
      })
    }

    window.addEventListener('sobdai-toast', handleToast as EventListener)
    return () => window.removeEventListener('sobdai-toast', handleToast as EventListener)
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return { toasts, removeToast }
}
