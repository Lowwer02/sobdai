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
const adminOrdersPage = read('app/admin/orders/page.tsx')
const orderUtils = read('lib/orderUtils.ts')
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

test('paid manual orders retain the generic revoke path and lose access by status', () => {
  const updateBlock = orderActions.match(
    /export async function updateOrderStatus[\s\S]*?export async function approvePayment/,
  )?.[0]
  assert.ok(updateBlock)
  assert.match(updateBlock, /newStatus === ORDER_STATUS\.CANCELLED[\s\S]*?order\?\.payment_provider === 'promptpay_manual'[\s\S]*?order\.status === ORDER_STATUS\.PENDING/)
  assert.match(updateBlock, /\.update\(\{ status: newStatus \}\)/)
  assert.match(orderUtils, /ORDER_COMPLETED_STATUSES = \[ORDER_STATUS\.PAID, ORDER_STATUS\.FREE\]/)
})

test('revoke UI reports Server Action failure and refreshes only after success', () => {
  const revokeBlock = adminList.match(
    /const handleRevoke = async \(\) => \{[\s\S]*?\n  \}\n\n  const handleRestore/,
  )?.[0]
  assert.ok(revokeBlock)
  assert.match(revokeBlock, /const result = await updateOrderStatus\(confirmModal\.orderId, ORDER_STATUS\.CANCELLED\)/)
  assert.match(revokeBlock, /if \(result\.success\)[\s\S]*?toastEvent\('ยกเลิกสิทธิ์เข้าถึงสำเร็จ'\)[\s\S]*?router\.refresh\(\)/)
  assert.match(revokeBlock, /else[\s\S]*?toastEvent\(result\.error \|\| 'ยกเลิกสิทธิ์เข้าถึงไม่สำเร็จ', 'error'\)/)
})

test('generic paid, free, and non-manual revoke behavior remains scoped', () => {
  assert.match(adminList, /order\.status === ORDER_STATUS\.PAID \|\| order\.status === ORDER_STATUS\.FREE/)
  assert.match(orderActions, /order\?\.payment_provider === 'promptpay_manual'/)
  assert.match(orderActions, /order\.status === ORDER_STATUS\.PENDING/)
  assert.match(adminList, /payment_provider !== 'promptpay_manual'/)
})

test('payment review success distinguishes empty and populated queues', () => {
  assert.match(adminOrdersPage, /const \{ data: submittedPayments, error: paymentReviewError \} = await supabase[\s\S]*?\.eq\('status', 'submitted'\)/)
  assert.match(adminOrdersPage, /paymentReviewOrderIds = Array\.from\([\s\S]*?submittedPayments \|\| \[\][\s\S]*?\.map/)
  assert.match(adminOrdersPage, /let paymentReviewUnavailable = false/)
})

test('payment review query errors render an explicit unavailable state', () => {
  assert.match(adminOrdersPage, /if \(paymentReviewError\)[\s\S]*?paymentReviewUnavailable = true/)
  assert.match(adminOrdersPage, /paymentReviewUnavailable=\{paymentReviewUnavailable\}/)
  assert.match(adminList, /paymentReviewUnavailable: boolean/)
  assert.match(adminList, /ไม่สามารถโหลดคิวตรวจสอบการชำระเงินได้ กรุณารีเฟรชแล้วลองใหม่/)
})

test('payment review errors cannot masquerade as an empty queue or alter other filters', () => {
  assert.match(adminOrdersPage, /if \(paymentReviewUnavailable\)[\s\S]*?00000000-0000-0000-0000-000000000000/)
  assert.match(adminOrdersPage, /else if \(paymentReviewOrderIds\)/)
  assert.match(adminOrdersPage, /else if \(normalizedStatusFilter && normalizedStatusFilter !== 'all'\)/)
  const unavailableIndex = adminList.indexOf('paymentReviewUnavailable ? (')
  const emptyIndex = adminList.indexOf('orders.length === 0 ? (')
  assert.ok(unavailableIndex >= 0 && unavailableIndex < emptyIndex)
})
