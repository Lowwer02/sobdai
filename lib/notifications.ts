export const PACKAGE_APPROVED_NOTIFICATION_TYPE = 'PACKAGE_APPROVED' as const
export const NOTIFICATION_LIST_LIMIT = 20

export type NotificationType = typeof PACKAGE_APPROVED_NOTIFICATION_TYPE

export interface NotificationRecord {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string
  readAt: string | null
  createdAt: string
}

export function isLocalNotificationHref(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}
