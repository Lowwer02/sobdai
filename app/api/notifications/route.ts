import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  NOTIFICATION_LIST_LIMIT,
  PACKAGE_APPROVED_NOTIFICATION_TYPE,
  PAYMENT_REJECTED_NOTIFICATION_TYPE,
  type NotificationRecord,
  type NotificationType,
} from '@/lib/notifications'

export const runtime = 'nodejs'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
}

function toNotificationRecord(row: {
  id: string
  type: string
  title: string
  body: string
  href: string
  read_at: string | null
  created_at: string
}): NotificationRecord | null {
  if (
    row.type !== PACKAGE_APPROVED_NOTIFICATION_TYPE
    && row.type !== PAYMENT_REJECTED_NOTIFICATION_TYPE
  ) return null

  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อน' },
        { status: 401, headers: PRIVATE_HEADERS },
      )
    }

    const mode = new URL(request.url).searchParams.get('mode') || 'count'

    if (mode === 'count') {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)

      if (error) {
        console.error('[NOTIFICATIONS] unread count query failed:', error.message)
        return NextResponse.json(
          { error: 'ไม่สามารถโหลดการแจ้งเตือนได้' },
          { status: 500, headers: PRIVATE_HEADERS },
        )
      }

      return NextResponse.json(
        { unreadCount: count ?? 0 },
        { headers: PRIVATE_HEADERS },
      )
    }

    if (mode === 'list') {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, href, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIST_LIMIT)

      if (error) {
        console.error('[NOTIFICATIONS] latest notification query failed:', error.message)
        return NextResponse.json(
          { error: 'ไม่สามารถโหลดการแจ้งเตือนได้' },
          { status: 500, headers: PRIVATE_HEADERS },
        )
      }

      const notifications = (data ?? [])
        .map((row) => toNotificationRecord(row))
        .filter((row): row is NotificationRecord => row !== null)

      return NextResponse.json(
        { notifications },
        { headers: PRIVATE_HEADERS },
      )
    }

    return NextResponse.json(
      { error: 'โหมดการแจ้งเตือนไม่ถูกต้อง' },
      { status: 400, headers: PRIVATE_HEADERS },
    )
  } catch (error) {
    console.error('[NOTIFICATIONS] read route failed:', error)
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดการแจ้งเตือนได้' },
      { status: 500, headers: PRIVATE_HEADERS },
    )
  }
}
