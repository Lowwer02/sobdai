import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const readRoute = read('app/api/notifications/route.ts')
const markReadRoute = read('app/api/notifications/[id]/route.ts')
const bell = read('components/NotificationBell.tsx')
const navbar = read('components/Navbar.tsx')
const desktopNav = read('components/DesktopNav.tsx')
const mobileNav = read('components/MobileNav.tsx')
const paymentActions = read('app/admin/orders/actions.ts')
const packagePage = read('app/package/[slug]/page.tsx')
const myPackagesPage = read('app/my-packages/page.tsx')
const checkoutPage = read('app/checkout/[id]/page.tsx')
const checkoutClient = read('app/checkout/[id]/CheckoutClient.tsx')
const rejectedMigration = read('supabase/migrations/093_payment_rejected_notification.sql')

test('unread badge uses a small authenticated count query and latest list is capped', () => {
  assert.match(readRoute, /await supabase\.auth\.getUser\(\)/)
  assert.match(readRoute, /if \(!user\)[\s\S]*?status: 401/i)
  assert.match(readRoute, /mode === 'count'[\s\S]*?select\('id', \{ count: 'exact', head: true \}\)[\s\S]*?\.is\('read_at', null\)/i)
  assert.match(readRoute, /mode === 'list'[\s\S]*?select\('id, type, title, body, href, read_at, created_at'\)[\s\S]*?\.limit\(NOTIFICATION_LIST_LIMIT\)/i)
  assert.match(read('lib/notifications.ts'), /NOTIFICATION_LIST_LIMIT = 20/)
})

test('mark-read is authenticated, user-scoped, idempotent, and cannot update immutable fields', () => {
  assert.match(markReadRoute, /await supabase\.auth\.getUser\(\)/)
  assert.match(markReadRoute, /\.from\('notifications'\)[\s\S]*?\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)/i)
  assert.match(markReadRoute, /\.eq\('id', id\)[\s\S]*?\.eq\('user_id', user\.id\)[\s\S]*?\.is\('read_at', null\)/i)
  assert.doesNotMatch(markReadRoute, /update\(\{[^}]*\b(user_id|type|title|body|href|source_order_id)\b/i)
  assert.match(markReadRoute, /changed: Boolean\(data\)/i)
})

test('the authenticated navbar fetches notification state without blocking the primary render', () => {
  assert.match(navbar, /useNotificationCenter\(user\?\.id \?\? null\)/)
  assert.match(navbar, /notifications=\{notificationCenter\}/)
  assert.match(bell, /if \(!userId\)[\s\S]*?setUnreadCount\(0\)/)
  assert.match(bell, /fetch\('\/api\/notifications\?mode=count'/)
  assert.match(bell, /fetch\('\/api\/notifications\?mode=list'/)
  assert.doesNotMatch(navbar, /await.*notification|notification.*await/i)
})

test('notification panel is present on desktop and mobile, with Thai empty state and package CTA', () => {
  assert.match(desktopNav, /<NotificationBell active=\{Boolean\(user\)\}/)
  assert.match(mobileNav, /<NotificationBell active=\{Boolean\(user\)\}/)
  assert.match(bell, /ยังไม่มีการแจ้งเตือน/)
  assert.match(bell, /เปิดแพ็กเกจ/)
  assert.match(bell, /router\.push\(isLocalNotificationHref\(notification\.href\) \? notification\.href : '\/my-packages'\)/)
})

test('package CTA lands on an existing package/access surface and access remains order-authoritative', () => {
  assert.match(packagePage, /\.from\('orders'\)[\s\S]*?\.in\('status', ORDER_COMPLETED_STATUSES\)/)
  assert.match(myPackagesPage, /\.from\('orders'\)[\s\S]*?\.in\('status', ORDER_COMPLETED_STATUSES\)/)
  assert.match(bell, /'\/my-packages'/)
  assert.match(read('supabase/migrations/092_notifications_v1.sql'), /'\/my-packages'/)
  assert.doesNotMatch(read('supabase/migrations/092_notifications_v1.sql'), /v_package_slug|\/package\/' \|\|/)
})

test('admin approval remains inside the financial.manage boundary and uses the existing approval RPC', () => {
  assert.match(paymentActions, /requirePermission\('financial\.manage'\)/)
  assert.match(paymentActions, /supabase\.rpc\('approve_payment_submission'/)
  assert.doesNotMatch(paymentActions, /notifications.*insert|insert.*notifications/i)
})

test('guests do not receive notification requests from the bell or API', () => {
  assert.match(bell, /if \(!active\) return null/)
  assert.match(bell, /if \(!userId\) return/)
  assert.match(readRoute, /if \(!user\)[\s\S]*?return NextResponse\.json\([\s\S]*?status: 401/i)
})

test('PAYMENT_REJECTED is a supported read-model type with a resubmission CTA', () => {
  assert.match(read('lib/notifications.ts'), /PAYMENT_REJECTED_NOTIFICATION_TYPE = 'PAYMENT_REJECTED'/)
  assert.match(readRoute, /PAYMENT_REJECTED_NOTIFICATION_TYPE/)
  assert.match(readRoute, /type: row\.type as NotificationType/)
  assert.match(bell, /PAYMENT_REJECTED_NOTIFICATION_TYPE/)
  assert.match(bell, /'ส่งหลักฐานใหม่'/)
  assert.match(rejectedMigration, /type in \('PACKAGE_APPROVED', 'PAYMENT_REJECTED'\)/i)
  assert.match(rejectedMigration, /source_payment_submission_id uuid[\s\S]*?references public\.payment_submissions\(id\) on delete cascade/i)
  assert.match(rejectedMigration, /notifications_type_source_payment_submission_key[\s\S]*?unique \(type, source_payment_submission_id\)/i)
  assert.match(rejectedMigration, /'\/checkout\/' \|\| v_package_id::text/i)
  assert.match(rejectedMigration, /'กรุณาตรวจสอบและส่งหลักฐานการชำระเงินใหม่'/i)
  assert.match(checkoutPage, /\.from\('payment_submissions'\)[\s\S]*?rejection_reason/i)
  assert.match(checkoutClient, /submissionStatus === 'rejected'[\s\S]*?ส่งหลักฐานอีกครั้ง/i)
})

test('rejection producer is trusted, best-effort, per-submission idempotent, and privacy-safe', () => {
  const producer = rejectedMigration.match(/create or replace function public\.try_create_payment_rejected_notification\([\s\S]*?comment on function public\.try_create_payment_rejected_notification/i)?.[0]
  assert.ok(producer)
  assert.match(producer, /security definer/i)
  assert.match(producer, /set search_path = pg_catalog, public, auth, pg_temp/i)
  assert.match(producer, /insert into public\.notifications[\s\S]*?source_payment_submission_id/i)
  assert.match(producer, /on conflict \(type, source_payment_submission_id\) do nothing/i)
  assert.match(producer, /exception[\s\S]*?when others then[\s\S]*?raise warning/i)
  assert.doesNotMatch(producer, /rejection_reason/i)
  assert.match(rejectedMigration, /revoke all on function public\.try_create_payment_rejected_notification\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/i)

  const reject = rejectedMigration.match(/create or replace function public\.reject_payment_submission\([\s\S]*?comment on function public\.reject_payment_submission/i)?.[0]
  assert.ok(reject)
  assert.match(reject, /if v_submission_status = 'rejected' then[\s\S]*?perform public\.try_create_payment_rejected_notification/i)
  assert.match(reject, /set status = 'rejected'[\s\S]*?perform public\.try_create_payment_rejected_notification/i)
  assert.match(reject, /set search_path = pg_catalog, public, auth, pg_temp/i)
  assert.match(rejectedMigration, /grant execute on function public\.reject_payment_submission\(uuid, text\)[\s\S]*?to authenticated/i)
})
