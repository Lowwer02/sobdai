import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const appDir = dirname(fileURLToPath(import.meta.url))
const root = join(appDir, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const desktopNav = read('components/DesktopNav.tsx')
const mobileNav = read('components/MobileNav.tsx')
const myPackagesPage = read('app/my-packages/page.tsx')
const myPackagesState = read('lib/my-packages-state.ts')
const ordersPage = read('app/orders/page.tsx')
const ordersClient = read('app/orders/MyOrdersClient.tsx')

test('avatar account menus keep profile and packages without a direct orders destination', () => {
  for (const source of [desktopNav, mobileNav]) {
    assert.match(source, /href="\/settings"[\s\S]*?โปรไฟล์/)
    assert.match(source, /href="\/my-packages"[\s\S]*?แพ็กเกจของฉัน/)
    assert.match(source, /ออกจากระบบ/)
    assert.doesNotMatch(source, /href="\/orders"/)
    assert.doesNotMatch(source, />\s*คำสั่งซื้อ\s*</)
  }
})

test('my packages exposes purchase history as a secondary route', () => {
  assert.match(myPackagesState, /MY_PACKAGES_ORDER_HISTORY_HREF\s*=\s*'\/orders'/)
  assert.match(myPackagesPage, /href=\{MY_PACKAGES_ORDER_HISTORY_HREF\}/)
  assert.match(myPackagesPage, /ดูประวัติการสั่งซื้อ/)
  assert.match(myPackagesPage, /ORDER_COMPLETED_STATUSES/)
  assert.match(myPackagesPage, /deriveMyPackagesViewState/)
  assert.match(myPackagesPage, /ไม่สามารถโหลดแพ็กเกจของคุณได้/)
  assert.equal((myPackagesPage.match(/<OrderHistoryLink\b/g) || []).length, 3)
  assert.match(
    myPackagesPage,
    /from\('summaries'\)[\s\S]*?select\('package_id'\)[\s\S]*?eq\('is_published', true\)/,
  )
})

test('orders keeps its route but uses purchase-history naming in page context', () => {
  assert.match(ordersPage, /title:\s*'ประวัติการสั่งซื้อ\s*\|\s*Sobdai'/)
  assert.match(ordersClient, />\s*ประวัติการสั่งซื้อ\s*</)
  assert.doesNotMatch(ordersClient, />\s*คำสั่งซื้อของฉัน\s*</)
})
