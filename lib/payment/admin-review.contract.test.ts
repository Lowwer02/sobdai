import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const queuePage = read('app/admin/orders/page.tsx')
const queueClient = read('app/admin/orders/OrdersClient.tsx')
const mutationControls = read('app/admin/orders/AdminOrderMutationControls.tsx')
const detailPage = read('app/admin/orders/[id]/page.tsx')
const detailClient = read('app/admin/orders/[id]/OrderPaymentDetailClient.tsx')
const actions = read('app/admin/orders/actions.ts')
const rbac = read('lib/auth/rbac.ts')
const reviewHelper = read('lib/payment/admin-review.ts')
const confirmDialog = read('components/admin/ConfirmDialog.tsx')

test('Support receives a read-only queue and no unnecessary mutation datasets', () => {
  assert.match(queuePage, /getAdminReviewCapabilities\(profile\.role\)/)
  assert.match(queuePage, /const users: AdminReviewQueueUser\[\] = canManageFinancial\s*\n\s*\?/)
  assert.match(queuePage, /const packages: AdminReviewQueuePackage\[\] = canManageFinancial\s*\n\s*\?/)
  assert.match(queueClient, /canManageFinancial && isModalOpen/)
  assert.match(mutationControls, /canManageFinancial && order\.status === ORDER_STATUS\.PENDING/)
  assert.match(mutationControls, /canManageFinancial && order\.status === 'revoked'/)
  assert.match(detailPage, /createSignedPaymentEvidenceUrl\(/)
})

test('mutation confirmation traps focus and restores the opener', () => {
  assert.match(confirmDialog, /aria-modal="true"/)
  assert.match(confirmDialog, /previouslyFocusedRef/)
  assert.match(confirmDialog, /isConnected[\s\S]*?previouslyFocused\.focus\(\)/)
  assert.match(confirmDialog, /e\.key !== 'Tab'/)
  assert.match(confirmDialog, /e\.shiftKey && activeElement === firstFocusable/)
})

test('review queue is server-filtered with stable review and analyzer query params', () => {
  assert.match(queuePage, /params\.review/)
  assert.match(queuePage, /params\.triage/)
  assert.match(queuePage, /payment_submissions/)
  assert.match(queuePage, /payment_verifications/)
  assert.match(queuePage, /collectBoundedAdminReviewMatches/)
  assert.match(queuePage, /\.in\('order_id', orderIds\)/)
  assert.match(queuePage, /\.limit\(ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH \+ 1\)/)
  assert.match(queuePage, /\.limit\(ADMIN_REVIEW_ORDER_BATCH_SIZE \+ 1\)/)
  assert.match(queuePage, /fetchAdminReviewVerificationRows\(/)
  assert.match(queuePage, /matchCursors/)
  assert.match(queuePage, /parseAdminReviewCursor\(params\.cursor\)/)
  assert.match(queuePage, /paymentReviewIntegrityAnomaly/)
  assert.match(queuePage, /\.order\('id', \{ ascending: false \}\)/)
  assert.match(queueClient, /updateParams\(\{ review: e\.target\.value \}\)/)
  assert.match(queueClient, /updateParams\(\{ triage: e\.target\.value \}\)/)
  assert.match(queueClient, /params\.delete\('cursor'\)/)
  assert.match(queueClient, /queueNextCursor/)
})

test('all admin verification read paths use bounded shared chunking and fail closed', () => {
  assert.match(reviewHelper, /export async function fetchAdminReviewVerificationRows/)
  assert.match(reviewHelper, /chunkAdminReviewVerificationIds\(submissionIds\)/)
  assert.match(reviewHelper, /for \(let chunkIndex = 0/)
  assert.match(queuePage, /fetchAdminReviewVerificationRows\(/)
  assert.match(queuePage, /\.in\('submission_id', verificationIds\)/)
  assert.match(queuePage, /paymentReviewUnavailable = true/)
  assert.match(detailPage, /fetchAdminReviewVerificationRows\(/)
  assert.match(detailPage, /\.in\('submission_id', verificationIds\)/)
  assert.match(detailPage, /verificationHistoryLoaded = false/)
  assert.doesNotMatch(queuePage, /\.in\('submission_id', visibleSubmissionIds\)/)
  assert.doesNotMatch(detailPage, /\.in\('submission_id', submissionIds\)/)
})

test('submission history overflow renders a safe integrity error instead of no evidence', () => {
  assert.match(reviewHelper, /getAdminReviewSubmissionAnomaly/)
  assert.match(queuePage, /\.limit\(ADMIN_REVIEW_PAGE_SIZE \* PAYMENT_SUBMISSION_MAX_COUNT \+ 1\)/)
  assert.match(queuePage, /getAdminReviewSubmissionAnomaly\(/)
  assert.match(queuePage, /orders = \[\]/)
  assert.match(queueClient, /ADMIN_REVIEW_SUBMISSION_INTEGRITY_MESSAGE/)
  assert.match(reviewHelper, /พบข้อมูลหลักฐานที่ต้องตรวจสอบเพิ่มเติม/)
})

test('default queue prioritizes pending manual evidence that needs human review', () => {
  assert.match(queuePage, /normalizeAdminReviewFilter\(/)
  assert.match(queuePage, /reviewFilter !== 'all'/)
  assert.match(queuePage, /\.eq\('status', ORDER_STATUS\.PENDING\)/)
  assert.match(queuePage, /\.eq\('payment_provider', MANUAL_PAYMENT_PROVIDER\)/)
  assert.match(queuePage, /matchesAdminReviewQueue\(/)
  assert.match(reviewHelper, /input\.reviewFilter !== 'all'/)
  assert.match(reviewHelper, /input\.analyzerFilter !== 'all'/)
  assert.match(reviewHelper, /input\.analyzerState === input\.analyzerFilter/)
})

test('list shows safe review scan fields without raw analyzer internals', () => {
  assert.match(queueClient, /Order status/)
  assert.match(queueClient, /Evidence \/ triage/)
  assert.match(queueClient, /manual_payment_submission_count/)
  assert.match(queueClient, /manual_payment_submitted_at/)
  assert.match(queueClient, /Analyzer is advisory only/)
  assert.doesNotMatch(queueClient, /rawImageHash|referenceFingerprint|HMAC|OCR transcript|provider_raw_response/i)
})

test('strong match, suspicious, and analyzer error copy remains non-authoritative', () => {
  assert.match(queueClient, /STRONG_MATCH — Offline match/)
  assert.match(queueClient, /SUSPICIOUS — ควรตรวจละเอียด/)
  assert.match(detailClient, /Offline evidence match — not bank\/provider confirmed/)
  assert.match(detailClient, /ข้อมูลในหลักฐานสอดคล้องกันจากการตรวจแบบออฟไลน์/)
  assert.match(detailClient, /ควรตรวจสอบเพิ่มเติม ผลอัตโนมัติไม่ปฏิเสธ/)
  assert.match(detailClient, /วิเคราะห์อัตโนมัติไม่สำเร็จ — กรุณาตรวจหลักฐานด้วยตนเอง/)
  assert.doesNotMatch(detailClient, /STRONG_MATCH[\s\S]*Verified|Verified[\s\S]*STRONG_MATCH/i)
})

test('manual actions require a submitted pending evidence row and use confirmation UX', () => {
  assert.match(detailClient, /isLatestSubmission = submissionIndex === 0/)
  assert.match(detailClient, /isReviewable = canReviewPaymentSubmission\(/)
  assert.match(detailClient, /requestApprove\(submission\.id\)/)
  assert.match(detailClient, /ยืนยันการอนุมัติการชำระเงิน\?/)
  assert.match(detailClient, /requestReject\(submission\.id\)/)
  assert.match(detailClient, /ยืนยันการปฏิเสธหลักฐาน\?/)
  assert.match(detailClient, /isLoading=\{isPending\}/)
})

test('approve and reject remain on existing authorized RPC paths', () => {
  assert.match(actions, /requirePermission\('financial\.manage'\)/)
  assert.match(actions, /rpc\('approve_payment_submission'/)
  assert.match(actions, /rpc\('reject_payment_submission'/)
  assert.match(actions, /getPaymentReviewAuditEvent\('approve'/)
  assert.match(actions, /getPaymentReviewAuditEvent\('reject'/)
  assert.match(reviewHelper, /APPROVE_PAYMENT_SUBMISSION_ATTEMPT/)
  assert.match(reviewHelper, /REJECT_PAYMENT_SUBMISSION_ATTEMPT/)
  assert.match(reviewHelper, /action_attempt_not_state_transition/)
  assert.doesNotMatch(detailClient, /updateOrderStatus\([^)]*,\s*['"]paid['"]\)/)
})

test('paid and cancelled orders keep canonical restrictions in the detail UI', () => {
  assert.match(detailClient, /order\.status === 'pending'/)
  assert.match(detailClient, /getAdminReviewState\(/)
  assert.match(detailClient, /currentReviewState === 'paid'/)
  assert.match(detailClient, /currentReviewState === 'cancelled'/)
  assert.match(detailClient, /order\.status === 'pending'[\s\S]*?submissions\.length === 0 \|\| hasOnlyRejectedEvidence/)
  assert.match(rbac, /support:[\s\S]*?'users\.read', 'orders\.read'/)
  assert.doesNotMatch(rbac, /support:[\s\S]*financial\.manage/)
})

test('secure evidence access remains financial-only with bounded signed URLs', () => {
  assert.match(detailPage, /requirePermission\('financial\.manage'\)/)
  assert.match(reviewHelper, /PAYMENT_EVIDENCE_SIGNED_URL_TTL_SECONDS = 300/)
  assert.match(reviewHelper, /canAccessPaymentEvidence\(input\)/)
  assert.doesNotMatch(detailPage, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(detailClient, /storage_object_path|rawImageHash|referenceFingerprint|provider_transaction_identity/)
})

test('structured analyzer signals omit secrets and raw OCR/payload data', () => {
  assert.match(detailClient, /จำนวนเงิน:/)
  assert.match(detailClient, /ผู้รับเงิน:/)
  assert.match(detailClient, /ปลายทาง:/)
  assert.match(detailClient, /Duplicate:/)
  assert.match(detailClient, /Time signal:/)
  assert.doesNotMatch(detailPage, /raw_image_hash|normalized_image_hash|perceptual_hash|reference_fingerprint|provider_transaction_identity/)
  assert.doesNotMatch(detailClient, /PAYMENT_VERIFICATION_HMAC_SECRET|HMAC_SECRET|OCR transcript|full QR payload/i)
})
