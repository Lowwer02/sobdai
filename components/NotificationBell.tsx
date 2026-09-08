'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  isLocalNotificationHref,
  PAYMENT_REJECTED_NOTIFICATION_TYPE,
  type NotificationRecord,
} from '@/lib/notifications'

export interface NotificationCenterState {
  unreadCount: number | null
  notifications: NotificationRecord[]
  isLoadingLatest: boolean
  loadLatest: () => Promise<void>
  markRead: (notificationId: string) => Promise<boolean>
}

async function readJson(response: Response) {
  if (!response.ok) throw new Error(`Notification request failed with ${response.status}`)
  return response.json() as Promise<Record<string, unknown>>
}

export function useNotificationCenter(userId: string | null): NotificationCenterState {
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [isLoadingLatest, setIsLoadingLatest] = useState(false)
  const requestGenerationRef = useRef(0)

  const refreshCount = useCallback(async () => {
    const requestGeneration = requestGenerationRef.current

    if (!userId) {
      setUnreadCount(0)
      return
    }

    try {
      const payload = await readJson(
        await fetch('/api/notifications?mode=count', { cache: 'no-store' }),
      )
      if (requestGeneration === requestGenerationRef.current && typeof payload.unreadCount === 'number') {
        setUnreadCount(Math.max(0, payload.unreadCount))
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] unread count request failed:', error)
    }
  }, [userId])

  useEffect(() => {
    requestGenerationRef.current += 1
    setNotifications([])
    setIsLoadingLatest(false)
    setUnreadCount(userId ? null : 0)

    if (!userId) return

    void refreshCount()
  }, [refreshCount, userId])

  const loadLatest = useCallback(async () => {
    if (!userId) return

    const requestGeneration = requestGenerationRef.current
    setIsLoadingLatest(true)
    try {
      const payload = await readJson(
        await fetch('/api/notifications?mode=list', { cache: 'no-store' }),
      )
      if (requestGeneration === requestGenerationRef.current && Array.isArray(payload.notifications)) {
        setNotifications(payload.notifications as NotificationRecord[])
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] latest notification request failed:', error)
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        setIsLoadingLatest(false)
      }
    }
  }, [userId])

  const markRead = useCallback(async (notificationId: string) => {
    if (!userId) return false

    const target = notifications.find((notification) => notification.id === notificationId)
    if (!target) return false

    if (!target.readAt) {
      setNotifications((current) => current.map((notification) => (
        notification.id === notificationId
          ? { ...notification, readAt: new Date().toISOString() }
          : notification
      )))
      setUnreadCount((current) => current === null ? current : Math.max(0, current - 1))
    }

    try {
      await readJson(await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
        method: 'PATCH',
      }))
      return true
    } catch (error) {
      console.error('[NOTIFICATIONS] mark-read request failed:', error)
      void refreshCount()
      void loadLatest()
      return false
    }
  }, [loadLatest, notifications, refreshCount, userId])

  return { unreadCount, notifications, isLoadingLatest, loadLatest, markRead }
}

function formatNotificationDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export default function NotificationBell({
  active,
  center,
}: {
  active: boolean
  center: NotificationCenterState
}) {
  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!active) setIsOpen(false)
  }, [active])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!active) return null

  const handleToggle = () => {
    if (!isOpen) void center.loadLatest()
    setIsOpen((current) => !current)
  }

  const handleNotificationClick = async (notification: NotificationRecord) => {
    setIsOpen(false)
    await center.markRead(notification.id)
    router.push(isLocalNotificationHref(notification.href) ? notification.href : '/my-packages')
  }

  return (
    <div className="relative shrink-0" ref={wrapperRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={center.unreadCount ? `การแจ้งเตือน ${center.unreadCount} รายการที่ยังไม่ได้อ่าน` : 'การแจ้งเตือน'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] text-[#A1866B] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5E9D6] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
      >
        <Bell size={18} strokeWidth={1.8} />
        {center.unreadCount !== null && center.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#0F0B07] bg-[#D4AF37] px-1 text-[9px] font-bold leading-none text-[#0F0B07]">
            {center.unreadCount > 99 ? '99+' : center.unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="การแจ้งเตือน"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-[80] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[#140F0A] shadow-[0_16px_50px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-[#F5E9D6]">การแจ้งเตือน</h2>
              <p className="mt-0.5 text-[11px] text-[#A1866B]">อัปเดตสำคัญเกี่ยวกับแพ็กเกจของคุณ</p>
            </div>
            {center.unreadCount !== null && center.unreadCount > 0 && (
              <span className="rounded-full bg-[#D4AF37]/10 px-2 py-1 text-[10px] font-semibold text-[#D4AF37]">
                {center.unreadCount} ใหม่
              </span>
            )}
          </div>

          {center.isLoadingLatest ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[#A1866B]">
              <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
            </div>
          ) : center.notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#A1866B]">
              ยังไม่มีการแจ้งเตือน
            </div>
          ) : (
            <div className="max-h-[min(24rem,calc(100vh-9rem))] overflow-y-auto p-2">
              {center.notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => void handleNotificationClick(notification)}
                  className={`group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)] ${
                    notification.readAt ? '' : 'bg-[rgba(212,175,55,0.06)]'
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-[#5C4A37]' : 'bg-[#D4AF37]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-[#F5E9D6]">
                      {notification.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#A1866B]">
                      {notification.body}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#D4AF37]">
                      {notification.type === PAYMENT_REJECTED_NOTIFICATION_TYPE ? 'ส่งหลักฐานใหม่' : 'เปิดแพ็กเกจ'}
                      <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                      <span className="ml-1 font-normal text-[#6D5943]">{formatNotificationDate(notification.createdAt)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
