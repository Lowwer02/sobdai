import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const manual = read('lib/payment/manual.ts')
const slipRoute = read('app/api/payment/manual/slip/route.ts')
const orderActions = read('app/admin/orders/actions.ts')
const adminList = read('app/admin/orders/OrdersClient.tsx')
const adminDetail = read('app/admin/orders/[id]/OrderPaymentDetailClient.tsx')
const checkout = read('app/checkout/[id]/CheckoutClient.tsx')
const checkoutPage = read('app/checkout/[id]/page.tsx')
const orders = read('app/orders/MyOrdersClient.tsx')
const ordersPage = read('app/orders/page.tsx')

test('payment status UX is derived from order and evidence state', () => {
  assert.match(manual, /รออัปโหลดสลิป/)
  assert.match(manual, /คำสั่งซื้อยังไม่สมบูรณ์ กรุณาอัปโหลดหลักฐานหลังชำระเงินเพื่อส่งให้เจ้าหน้าที่ตรวจสอบ/)
  assert.match(manual, /รอตรวจสอบการชำระเงิน/)
  assert.match(manual, /หลักฐานไม่ผ่าน กรุณาส่งใหม่/)
  assert.match(manual, /ชำระเงินแล้ว/)
  assert.match(manual, /ยกเลิกแล้ว/)
  assert.match(checkout, /submissionCount/)
  assert.match(orders, /getPaymentStatusPresentation/)
  assert.match(adminDetail, /getPaymentStatusPresentation/)
})

test('sixth evidence attempt is surfaced and cannot notify', () => {
  assert.match(manual, /PAYMENT_SUBMISSION_MAX_COUNT = 5/)
  assert.match(manual, /ส่งหลักฐานการชำระเงินครบจำนวนที่กำหนดแล้ว กรุณาติดต่อฝ่ายสนับสนุน/)
  assert.match(slipRoute, /isPaymentSubmissionLimitError\(submissionError\)/)
  assert.match(slipRoute, /PAYMENT_SUBMISSION_LIMIT_ERROR/)
  assert.match(slipRoute, /removeUploadedObject\(adminSupabase, objectPath\)/)
  assert.ok(
    slipRoute.indexOf('PAYMENT_SUBMISSION_LIMIT_ERROR') < slipRoute.lastIndexOf('notifyPaymentSubmission'),
  )
})

test('admin cancellation uses financial permission and canonical RPC', () => {
  assert.match(orderActions, /export async function cancelManualPaymentOrder/)
  assert.match(orderActions, /requirePermission\('financial\.manage'\)/)
  assert.match(orderActions, /rpc\('cancel_manual_payment_order'/)
  assert.match(adminList, /ยกเลิกคำสั่งซื้อนี้/)
  assert.match(adminList, /manual_payment_submission_count === 0/)
  assert.match(adminDetail, /submissions\.length === 0/)
  assert.match(adminDetail, /cancelManualPaymentOrder\(order\.id\)/)
})

test('evidence reads fail closed and cancellation audit stays inside the RPC', () => {
  assert.match(checkoutPage, /paymentEvidenceAvailable: !submissionError/)
  assert.match(checkout, /if \(!manualOrder\.paymentEvidenceAvailable\)/)
  assert.match(checkout, /evidenceReadAvailable: manualOrder\.paymentEvidenceAvailable/)
  assert.match(ordersPage, /paymentEvidenceAvailable = !paymentResult\.error/)
  assert.match(ordersPage, /payment_evidence_available: paymentEvidenceAvailable/)
  assert.match(orders, /payment_evidence_available === true/)
  const cancelBlock = read('app/admin/orders/actions.ts').match(
    /export async function cancelManualPaymentOrder[\s\S]*$/,
  )?.[0]
  assert.ok(cancelBlock)
  assert.doesNotMatch(cancelBlock, /logAuditEvent/)
})

test('reject controls remain scoped to an existing submitted evidence row', () => {
  assert.match(adminDetail, /submissions\.length === 0[\s\S]*?ยังไม่มีสลิปที่ส่งเข้ามา/)
  assert.match(adminDetail, /submission\.status === 'submitted' && order\.status === 'pending'/)
  assert.match(adminDetail, /ปฏิเสธสลิป/)
})
