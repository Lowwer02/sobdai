import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST,
  ADMIN_REVIEW_MAX_ORDERS_PER_REQUEST,
  ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH,
  ADMIN_REVIEW_ORDER_BATCH_SIZE,
  ADMIN_REVIEW_ORDER_SELECT,
  canAccessPaymentEvidence,
  canReviewPaymentSubmission,
  collectBoundedAdminReviewMatches,
  getAdminReviewCapabilities,
  getAdminReviewState,
  getPaymentReviewAuditEvent,
  getReviewActionFailureMessage,
  latestByOrder,
  matchesAdminReviewQueue,
  normalizePaymentRejectionReason,
} from './admin-review'

test('Support receives read capability but no financial mutation capability', () => {
  assert.deepEqual(getAdminReviewCapabilities('support'), {
    canViewOrders: true,
    canManageFinancial: false,
  })
  assert.deepEqual(getAdminReviewCapabilities('admin'), {
    canViewOrders: true,
    canManageFinancial: true,
  })
  assert.deepEqual(getAdminReviewCapabilities('user'), {
    canViewOrders: false,
    canManageFinancial: false,
  })
})

test('Needs review excludes active AUTO_CHECKING while Checking includes it', () => {
  const base = {
    orderStatus: 'pending',
    paymentProvider: 'promptpay_manual',
    latestSubmissionStatus: 'submitted',
    submissionCount: 1,
  }

  assert.equal(matchesAdminReviewQueue({
    ...base,
    analyzerState: 'AUTO_CHECKING',
    reviewFilter: 'needs_review',
    analyzerFilter: 'all',
  }), false)
  assert.equal(matchesAdminReviewQueue({
    ...base,
    analyzerState: 'AUTO_CHECKING',
    reviewFilter: 'checking',
    analyzerFilter: 'all',
  }), true)
  assert.equal(matchesAdminReviewQueue({
    ...base,
    analyzerState: 'ANALYZER_ERROR',
    reviewFilter: 'needs_review',
    analyzerFilter: 'ANALYZER_ERROR',
  }), true)
})

test('latest submission ordering uses id as a deterministic tie-breaker', () => {
  const latest = latestByOrder([
    { id: '00000000-0000-0000-0000-000000000001', order_id: 'order-1', created_at: '2026-10-01T00:00:00.000Z' },
    { id: '00000000-0000-0000-0000-000000000002', order_id: 'order-1', created_at: '2026-10-01T00:00:00.000Z' },
  ])

  assert.equal(latest.get('order-1')?.id, '00000000-0000-0000-0000-000000000002')
})

test('terminal order states cannot be reviewed as a new payment decision', () => {
  for (const status of ['paid', 'free', 'cancelled', 'refunded', 'revoked']) {
    assert.equal(canReviewPaymentSubmission({
      orderStatus: status,
      paymentProvider: 'promptpay_manual',
      submissionStatus: 'submitted',
      isLatestSubmission: true,
    }), false, `${status} must not be actionable`)
  }

  assert.equal(getAdminReviewState({
    orderStatus: 'refunded',
    paymentProvider: 'promptpay_manual',
    latestSubmissionStatus: 'submitted',
    submissionCount: 1,
    analyzerState: 'STRONG_MATCH',
  }), 'refunded')
  assert.equal(getAdminReviewState({
    orderStatus: 'revoked',
    paymentProvider: 'promptpay_manual',
    latestSubmissionStatus: 'submitted',
    submissionCount: 1,
    analyzerState: 'STRONG_MATCH',
  }), 'revoked')
})

test('signed evidence access is role, order, and UUID bound', () => {
  const orderId = '11111111-1111-4111-8111-111111111111'
  const submissionId = '22222222-2222-4222-8222-222222222222'

  assert.equal(canAccessPaymentEvidence({
    role: 'admin',
    requestedOrderId: orderId,
    submissionId,
    submissionOrderId: orderId,
  }), true)
  assert.equal(canAccessPaymentEvidence({
    role: 'admin',
    requestedOrderId: orderId,
    submissionId,
    submissionOrderId: '33333333-3333-4333-8333-333333333333',
  }), false)
  assert.equal(canAccessPaymentEvidence({
    role: 'support',
    requestedOrderId: orderId,
    submissionId,
    submissionOrderId: orderId,
  }), false)
  assert.equal(canAccessPaymentEvidence({
    role: 'admin',
    requestedOrderId: 'malformed',
    submissionId,
    submissionOrderId: 'malformed',
  }), false)
})

test('rejection reasons are bounded, required, and preserved as text', () => {
  assert.deepEqual(normalizePaymentRejectionReason('   '), { valid: false, value: '' })
  assert.equal(normalizePaymentRejectionReason('x'.repeat(1001)).value.length, 1000)
  assert.deepEqual(normalizePaymentRejectionReason('  <script>alert(1)</script>  '), {
    valid: true,
    value: '<script>alert(1)</script>',
  })
})

test('idempotent approve/reject audit records are explicitly attempts, not transitions', () => {
  const first = getPaymentReviewAuditEvent('approve', {
    submissionId: '22222222-2222-4222-8222-222222222222',
    orderId: '11111111-1111-4111-8111-111111111111',
    status: 'approved',
  })
  const repeated = getPaymentReviewAuditEvent('approve', {
    submissionId: '22222222-2222-4222-8222-222222222222',
    orderId: '11111111-1111-4111-8111-111111111111',
    status: 'approved',
  })
  const rejected = getPaymentReviewAuditEvent('reject', {
    submissionId: '22222222-2222-4222-8222-222222222222',
    orderId: '11111111-1111-4111-8111-111111111111',
    status: 'rejected',
    reason: 'amount mismatch',
  })

  assert.deepEqual(first, repeated)
  assert.equal(first.action, 'APPROVE_PAYMENT_SUBMISSION_ATTEMPT')
  assert.equal(rejected.action, 'REJECT_PAYMENT_SUBMISSION_ATTEMPT')
  assert.equal(first.new_value.audit_semantics, 'action_attempt_not_state_transition')
  assert.equal(rejected.new_value.canonical_rpc, 'reject_payment_submission')
})

test('bounded queue collector stops at the safety cap and reports partial UX', async () => {
  let calls = 0
  const result = await collectBoundedAdminReviewMatches({
    targetCount: ADMIN_REVIEW_MAX_ORDERS_PER_REQUEST + 1,
    fetchBatch: async (cursor) => {
      calls += 1
      return {
        matches: calls === 1 ? ['first-match'] : [],
        candidateCount: ADMIN_REVIEW_ORDER_BATCH_SIZE,
        nextCursor: `cursor-${calls}`,
        hasMore: true,
      }
    },
  })

  assert.equal(calls, ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST)
  assert.equal(result.candidateOrdersProcessed, ADMIN_REVIEW_MAX_ORDERS_PER_REQUEST)
  assert.equal(result.capReached, true)
  assert.equal(result.hasMore, true)
  assert.equal(ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH, 250)
})

test('bounded queue projection is explicit and excludes mutation-only fields', () => {
  assert.doesNotMatch(ADMIN_REVIEW_ORDER_SELECT, /\*/)
  assert.match(ADMIN_REVIEW_ORDER_SELECT, /profiles!inner\(email\)/)
  assert.match(ADMIN_REVIEW_ORDER_SELECT, /packages!inner\(name\)/)
  assert.doesNotMatch(ADMIN_REVIEW_ORDER_SELECT, /deleted_at|role|service_role|secret/i)
})

test('stale action outcomes request a neutral canonical refresh', () => {
  assert.match(
    getReviewActionFailureMessage('Payment submission changed', 'fallback'),
    /รีเฟรชเพื่อดูสถานะล่าสุด/,
  )
})
