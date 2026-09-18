import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const checkout = read('app/checkout/[id]/CheckoutClient.tsx')
const orderRoute = read('app/api/payment/manual/order/route.ts')
const qrRoute = read('app/api/payment/manual/order/[orderId]/qr/route.ts')
const detailsRoute = read('app/api/payment/manual/order/[orderId]/details/route.ts')
const adminPage = read('app/admin/payment/page.tsx')
const adminClient = read('app/admin/payment/PaymentSettingsClient.tsx')
const adminActions = read('app/admin/payment/actions.ts')

test('paid checkout is independent from Donate/Support QR config', () => {
  const paidBlock = checkout.slice(checkout.indexOf('Paid Checkout Panel'))
  assert.doesNotMatch(paidBlock, /supportConfig\?\.qr_image_url|<SupportDetails/)
  assert.match(paidBlock, /\/api\/payment\/manual\/order\/\$\{manualOrder\.id\}\/qr/)
  assert.match(paidBlock, /displayName/)
})

test('order creation has no client amount authority and fails closed before the RPC', () => {
  assert.match(orderRoute, /readPaymentSettings\(createAdminClient\(\)\)/)
  assert.match(orderRoute, /PAYMENT_SETTINGS_UNAVAILABLE_ERROR/)
  assert.match(orderRoute, /rpc\('create_manual_payment_order'/)
  assert.doesNotMatch(orderRoute, /body\?\.amount|JSON\.parse\([\s\S]*amount/)
  assert.doesNotMatch(orderRoute, /homepage_settings|supportConfig|qr_image_url/)
})

test('private QR route authenticates ownership and returns no-store PNG bytes', () => {
  assert.match(qrRoute, /\.eq\('id', orderId\)[\s\S]*\.eq\('user_id', user\.id\)/)
  assert.match(qrRoute, /order\.status !== 'pending'/)
  assert.match(qrRoute, /order\.payment_provider !== MANUAL_PAYMENT_PROVIDER/)
  assert.match(qrRoute, /renderPromptPayQr\(paymentSettings\.recipient, order\.amount\)/)
  assert.doesNotMatch(qrRoute, /\.from\(['"]packages['"]\)|package_id/)
  assert.match(qrRoute, /'Cache-Control': 'private, no-store'/)
  assert.match(qrRoute, /'Content-Type': 'image\/png'/)
  assert.doesNotMatch(qrRoute, /displayName|instructionText|recipient_identifier/)
})

test('safe order details never return the configured recipient identifier', () => {
  assert.match(detailsRoute, /\.eq\('id', orderId\)[\s\S]*\.eq\('user_id', user\.id\)/)
  assert.match(detailsRoute, /normalizeOrderAmount\(order\.amount\)/)
  assert.match(detailsRoute, /displayName: paymentSettings\.displayName/)
  assert.match(detailsRoute, /instructionText: paymentSettings\.instructionText/)
  assert.doesNotMatch(detailsRoute, /recipient_identifier|recipient:/)
})

test('admin settings require financial.manage, mask replacement UX, and preview ฿1.00', () => {
  assert.match(adminPage, /requirePermission\('financial\.manage'\)/)
  assert.match(adminActions, /requirePermission\('financial\.manage'\)/)
  assert.match(adminActions, /renderPromptPayQr\(recipient, '1\.00'\)/)
  assert.match(adminClient, /maskedRecipient/)
  assert.match(adminClient, /value=\{recipientIdentifier\}/)
  assert.match(adminClient, /QR ทดสอบ ฿1\.00/)
  assert.match(adminClient, /ไม่จำเป็นต้องโอนเงินจริง/)
  assert.doesNotMatch(adminClient, /value=\{settings\.recipientIdentifier\}/)
})
