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
