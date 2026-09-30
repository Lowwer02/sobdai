import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const customerModel = read('lib/payment/customer.ts')
const detailPage = read('app/orders/[id]/page.tsx')
const ordersPage = read('app/orders/page.tsx')
const ordersClient = read('app/orders/MyOrdersClient.tsx')
const checkoutClient = read('app/checkout/[id]/CheckoutClient.tsx')
const illustration = read('components/payment/PaymentStatusIllustration.tsx')
const globals = read('app/globals.css')

test('customer order detail is UUID-validated, authenticated, and ownership-scoped', () => {
  assert.match(detailPage, /isUuid\(id\)/)
  assert.match(detailPage, /\.eq\('id', id\)[\s\S]*?\.eq\('user_id', user\.id\)/)
  assert.match(detailPage, /if \(orderError \|\| !rawOrder\) notFound\(\)/)
  assert.match(detailPage, /get_payment_verification_customer_status/)
})

test('customer surfaces keep verification internals and raw provider values server-side', () => {
  assert.match(ordersPage, /is_manual_payment: order\.payment_provider === 'promptpay_manual'/)
  assert.doesNotMatch(ordersClient, /payment_provider/)
  for (const source of [detailPage, ordersClient, checkoutClient]) {
    assert.doesNotMatch(source, /rejection_reason|reason_codes|analyzer_version|qr_kind|storage_object_path|payment_verifications|provider_attestation/)
  }
  assert.doesNotMatch(customerModel, /STRONG_MATCH|SUSPICIOUS|ANALYZER_ERROR/)
})

test('mascot state rendering uses stable local images and theme-aware UI tokens', () => {
  for (const asset of [
    'payment-auto-checking.png',
    'payment-manual-review.png',
    'payment-approved.png',
    'payment-rejected.png',
    'payment-cancelled.png',
    'payment-disabled.png',
    'orders-empty.png',
  ]) {
    assert.match(customerModel, new RegExp(asset.replace('.', '\\.') ))
  }
  assert.match(illustration, /from 'next\/image'/)
  assert.match(illustration, /width=\{1254\}/)
  assert.match(ordersClient, /bg-background[\s\S]*text-foreground/)
  assert.match(checkoutClient, /bg-background[\s\S]*text-foreground/)
})

test('customer audit remediation keeps rejected state visible without a disabled resubmit CTA', () => {
  assert.match(customerModel, /rejectedPaymentUnavailable/)
  assert.match(customerModel, /หลักฐานก่อนหน้านี้ไม่ผ่านการตรวจสอบ/)
  assert.match(customerModel, /ระบบชำระเงินยังไม่พร้อมใช้งาน/)
  assert.match(ordersClient, /ordersLoadError/)
  assert.match(checkoutClient, /manualOrder\.paymentSettingsAvailable === false/)
  assert.match(illustration, /description\?: string/)
})

test('customer payment success CTAs use semantic foreground and QR is viewport-safe', () => {
  assert.match(globals, /--success-foreground/)
  assert.match(globals, /--color-success-foreground: var\(--success-foreground\)/)
  assert.doesNotMatch(ordersClient, /bg-success[^\n]*text-white/)
  assert.doesNotMatch(checkoutClient, /bg-success[^\n]*text-white/)
  assert.match(checkoutClient, /h-auto w-\[280px\] max-w-full/)
})

test('orders query failures have a neutral retry state instead of empty-history art', () => {
  assert.match(ordersPage, /error: ordersError/)
  assert.match(ordersPage, /ordersLoadError=\{Boolean\(ordersError\)\}/)
  assert.match(ordersClient, /โหลดรายการคำสั่งซื้อไม่สำเร็จ/)
  assert.match(ordersClient, /window\.location\.reload\(\)/)
  assert.match(ordersClient, /state="empty_orders"/)
})
