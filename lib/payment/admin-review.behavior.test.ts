import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AdminOrderMutationControls from '../../app/admin/orders/AdminOrderMutationControls'
import { PAYMENT_SUBMISSION_MAX_COUNT } from './manual'
import {
  ADMIN_REVIEW_MAX_BATCHES_PER_REQUEST,
  ADMIN_REVIEW_MAX_ORDERS_PER_REQUEST,
  ADMIN_REVIEW_MAX_SUBMISSIONS_PER_BATCH,
  ADMIN_REVIEW_ORDER_BATCH_SIZE,
  ADMIN_REVIEW_ORDER_SELECT,
  canAccessPaymentEvidence,
  canReviewPaymentSubmission,
  chunkAdminReviewVerificationIds,
  collectBoundedAdminReviewMatches,
  createSignedPaymentEvidenceUrl,
  fetchAdminReviewVerificationRows,
  getAdminReviewCapabilities,
  getAdminReviewState,
  getPaymentReviewAuditEvent,
  getReviewActionFailureMessage,
  getAdminReviewSubmissionAnomaly,
  latestByOrder,
  matchesAdminReviewQueue,
  normalizePaymentRejectionReason,
  parseAdminReviewCursor,
  serializeAdminReviewCursor,
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

test('signed evidence helper only creates a short-lived URL for the authorized matching order', async () => {
  const orderId = '11111111-1111-4111-8111-111111111111'
  const submissionId = '22222222-2222-4222-8222-222222222222'
  const rawPath = `${orderId}/${submissionId}.png`
  const calls: Array<{ path: string; expiresIn: number }> = []
  const createSignedUrl = async (path: string, expiresIn: number) => {
    calls.push({ path, expiresIn })
    return { data: { signedUrl: 'https://signed.example/slip' }, error: null }
  }

  assert.equal(await createSignedPaymentEvidenceUrl({
    role: 'admin',
    requestedOrderId: orderId,
    submissionId,
    submissionOrderId: orderId,
    storageObjectPath: rawPath,
    createSignedUrl,
  }), 'https://signed.example/slip')
  assert.deepEqual(calls, [{ path: rawPath, expiresIn: 300 }])

  for (const denied of [
    { role: 'support', requestedOrderId: orderId, submissionId, submissionOrderId: orderId },
    { role: 'admin', requestedOrderId: orderId, submissionId, submissionOrderId: '33333333-3333-4333-8333-333333333333' },
    { role: 'admin', requestedOrderId: 'malformed', submissionId, submissionOrderId: 'malformed' },
  ]) {
    const deniedUrl = await createSignedPaymentEvidenceUrl({
      ...denied,
      storageObjectPath: rawPath,
      createSignedUrl,
    })
    assert.equal(deniedUrl, null)
    assert.notEqual(deniedUrl, rawPath)
  }

  assert.equal(calls.length, 1)
})

test('Support sees no rendered financial mutation controls across order states', () => {
  const orderId = '11111111-1111-4111-8111-111111111111'
  for (const status of ['pending', 'paid', 'free', 'revoked']) {
    const markup = renderToStaticMarkup(createElement(AdminOrderMutationControls, {
      order: {
        id: orderId,
        status,
        payment_provider: 'promptpay_manual',
        manual_payment_status: 'submitted',
        manual_payment_all_rejected: false,
      },
      canManageFinancial: false,
      canCancelUnpaidManualOrder: false,
      actingOnId: null,
      onRequestAction: () => undefined,
    }))

    assert.match(markup, />N\/A<\/span>/, status)
    assert.doesNotMatch(markup, /Mark Paid|Review|Details|Revoke Access|Restore Access|ยกเลิก/, status)
  }
})

test('authorized rendered controls retain the complete financial mutation tree', () => {
  const order = {
    id: '11111111-1111-4111-8111-111111111111',
    payment_provider: 'other',
    manual_payment_status: null,
    manual_payment_all_rejected: false,
  }
  const render = (status: string) => renderToStaticMarkup(createElement(AdminOrderMutationControls, {
    order: { ...order, status },
    canManageFinancial: true,
    canCancelUnpaidManualOrder: false,
    actingOnId: null,
    onRequestAction: () => undefined,
  }))

  assert.match(render('pending'), /Mark Paid/)
  assert.match(render('paid'), /Revoke Access/)
  assert.match(render('free'), /Revoke Access/)
  assert.match(render('revoked'), /Restore Access/)
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
        matchCursors: calls === 1 ? ['cursor-1-match'] : [],
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

test('verification IDs are deduplicated and split into five bounded chunks for 250 rows', () => {
  const ids = Array.from({ length: 250 }, (_, index) => `submission-${index}`)
  const chunks = chunkAdminReviewVerificationIds([...ids, ids[0], ids[249]])

  assert.equal(chunks.length, 5)
  assert.deepEqual(chunks.map((chunk) => chunk.length), [50, 50, 50, 50, 50])
  assert.deepEqual(chunks.flat(), ids)
})

test('keyset queue pagination advances after the last displayed match without duplicates or skips', async () => {
  const candidates = Array.from({ length: 120 }, (_, index) => `candidate-${index}`)
  const matchingIndexes = new Set([0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98, 105, 112, 119])
  const requestedCursors: Array<string | null> = []
  const fetchBatch = async (cursor: string | null) => {
    requestedCursors.push(cursor)
    const startIndex = cursor ? Number(cursor.split('-')[1]) + 1 : 0
    const batch = candidates.slice(startIndex, startIndex + 50)
    const lastIndex = startIndex + batch.length - 1
    return {
      matches: batch.filter((_, offset) => matchingIndexes.has(startIndex + offset)),
      matchCursors: batch
        .map((candidate, offset) => matchingIndexes.has(startIndex + offset) ? candidate : null)
        .filter((candidate): candidate is string => Boolean(candidate)),
      candidateCount: batch.length,
      nextCursor: batch.length > 0 ? candidates[lastIndex] : null,
      hasMore: lastIndex < candidates.length - 1,
    }
  }

  const firstPage = await collectBoundedAdminReviewMatches({ targetCount: 15, fetchBatch })
  const secondPage = await collectBoundedAdminReviewMatches({
    targetCount: 15,
    startCursor: firstPage.nextCursor,
    fetchBatch,
  })

  assert.deepEqual(requestedCursors, [null, 'candidate-49', 'candidate-98'])
  assert.deepEqual(firstPage.matches, candidates.filter((_, index) => matchingIndexes.has(index)).slice(0, 15))
  assert.deepEqual(secondPage.matches, ['candidate-105', 'candidate-112', 'candidate-119'])
  assert.equal(new Set([...firstPage.matches, ...secondPage.matches]).size, 18)
  assert.equal(secondPage.hasMore, false)
})

test('a sparse queue crosses the 400-candidate cap and reaches matches after it', async () => {
  const candidates = Array.from({ length: 600 }, (_, index) => `candidate-${index}`)
  const matchingIndexes = new Set([3, 550])
  const fetchBatch = async (cursor: string | null) => {
    const startIndex = cursor ? Number(cursor.split('-')[1]) + 1 : 0
    const batch = candidates.slice(startIndex, startIndex + 50)
    const lastIndex = startIndex + batch.length - 1
    return {
      matches: batch.filter((_, offset) => matchingIndexes.has(startIndex + offset)),
      matchCursors: batch
        .map((candidate, offset) => matchingIndexes.has(startIndex + offset) ? candidate : null)
        .filter((candidate): candidate is string => Boolean(candidate)),
      candidateCount: batch.length,
      nextCursor: batch.length > 0 ? candidates[lastIndex] : null,
      hasMore: lastIndex < candidates.length - 1,
    }
  }

  const firstScan = await collectBoundedAdminReviewMatches({ targetCount: 15, fetchBatch })
  const continuation = await collectBoundedAdminReviewMatches({
    targetCount: 15,
    startCursor: firstScan.nextCursor,
    fetchBatch,
  })

  assert.equal(firstScan.candidateOrdersProcessed, 400)
  assert.equal(firstScan.capReached, true)
  assert.equal(firstScan.nextCursor, 'candidate-399')
  assert.deepEqual(firstScan.matches, ['candidate-3'])
  assert.deepEqual(continuation.matches, ['candidate-550'])
  assert.equal(continuation.hasMore, false)
})

test('limit-plus-one semantics distinguish exactly 50 remaining candidates from 51', async () => {
  const run = (candidateCount: number) => collectBoundedAdminReviewMatches({
    targetCount: 1,
    fetchBatch: async () => ({
      matches: ['last-match'],
      matchCursors: ['candidate-49'],
      candidateCount: Math.min(candidateCount, 50),
      nextCursor: 'candidate-49',
      hasMore: candidateCount > 50,
    }),
  })

  assert.equal((await run(50)).hasMore, false)
  assert.equal((await run(51)).hasMore, true)
})

test('bounded hasMore edge matrix distinguishes exhaustion from real lookahead', async () => {
  const run = async (candidateCount: number, matchingCount: number) => collectBoundedAdminReviewMatches({
    targetCount: 15,
    fetchBatch: async (cursor) => {
      const startIndex = cursor ? Number(cursor.split('-')[1]) + 1 : 0
      const scannedCount = Math.min(candidateCount - startIndex, 50)
      const candidateIndexes = Array.from({ length: Math.max(0, scannedCount) }, (_, offset) => startIndex + offset)
      const matchingIndexes = candidateIndexes.slice(0, matchingCount)
      return {
        matches: matchingIndexes.map((index) => `candidate-${index}`),
        matchCursors: matchingIndexes.map((index) => `candidate-${index}`),
        candidateCount: scannedCount,
        nextCursor: scannedCount > 0 ? `candidate-${startIndex + scannedCount - 1}` : null,
        hasMore: startIndex + scannedCount < candidateCount,
      }
    },
  })

  const cases = [
    { candidateCount: 49, matchingCount: 14, hasMore: false },
    { candidateCount: 50, matchingCount: 15, hasMore: false },
    { candidateCount: 51, matchingCount: 15, hasMore: true },
    { candidateCount: 50, matchingCount: 16, hasMore: true },
  ]

  for (const testCase of cases) {
    const result = await run(testCase.candidateCount, testCase.matchingCount)
    assert.equal(result.hasMore, testCase.hasMore, JSON.stringify(testCase))
    if (!testCase.hasMore) assert.equal(result.nextCursor, null)
  }

  const priorCursorResult = await collectBoundedAdminReviewMatches({
    targetCount: 1,
    startCursor: 'candidate-49',
    fetchBatch: async (cursor) => {
      assert.equal(cursor, 'candidate-49')
      return {
        matches: ['candidate-50'],
        matchCursors: ['candidate-50'],
        candidateCount: 1,
        nextCursor: 'candidate-50',
        hasMore: false,
      }
    },
  })
  assert.deepEqual(priorCursorResult.matches, ['candidate-50'])
  assert.equal(priorCursorResult.hasMore, false)
})

test('tied-timestamp keyset pagination crosses the 400-row cap without skips or duplicates', async () => {
  const makeId = (rank: number) => `00000000-0000-4000-8000-${rank.toString(16).padStart(12, '0')}`
  const candidates = Array.from({ length: 520 }, (_, position) => ({
    position,
    created_at: '2026-10-01T00:00:00.000Z',
    id: makeId(520 - position),
  })).sort((a, b) => b.id.localeCompare(a.id))
  const expectedPositions = new Set([3, 49, 50, 199, 399, 400, 450, 519])
  const requestedCursors: Array<string | null> = []

  const fetchBatch = async (cursor: string | null) => {
    requestedCursors.push(cursor)
    const startIndex = cursor
      ? candidates.findIndex((candidate) => serializeAdminReviewCursor({
        createdAt: candidate.created_at,
        id: candidate.id,
      }) === cursor) + 1
      : 0
    assert.ok(startIndex >= 0)
    const batch = candidates.slice(startIndex, startIndex + 50)
    const last = batch[batch.length - 1]
    const matches = batch.filter((candidate) => expectedPositions.has(candidate.position))
    return {
      matches,
      matchCursors: matches.map((candidate) => serializeAdminReviewCursor({
        createdAt: candidate.created_at,
        id: candidate.id,
      })),
      candidateCount: batch.length,
      nextCursor: last
        ? serializeAdminReviewCursor({ createdAt: last.created_at, id: last.id })
        : null,
      hasMore: startIndex + batch.length < candidates.length,
    }
  }

  const firstScan = await collectBoundedAdminReviewMatches({ targetCount: 15, fetchBatch })
  const continuation = await collectBoundedAdminReviewMatches({
    targetCount: 15,
    startCursor: firstScan.nextCursor,
    fetchBatch,
  })
  const returnedPositions = [
    ...firstScan.matches.map((candidate) => candidate.position),
    ...continuation.matches.map((candidate) => candidate.position),
  ]
  const cursorPositions = requestedCursors
    .filter((cursor): cursor is string => Boolean(cursor))
    .map((cursor) => candidates.findIndex((candidate) => serializeAdminReviewCursor({
      createdAt: candidate.created_at,
      id: candidate.id,
    }) === cursor))

  assert.equal(firstScan.capReached, true)
  assert.equal(firstScan.candidateOrdersProcessed, 400)
  assert.equal(requestedCursors[8], firstScan.nextCursor)
  assert.deepEqual(returnedPositions.sort((a, b) => a - b), [...expectedPositions].sort((a, b) => a - b))
  assert.equal(new Set(returnedPositions).size, expectedPositions.size)
  assert.ok(cursorPositions.every((position, index) => index === 0 || position > cursorPositions[index - 1]))
  assert.ok(candidates[49].id.localeCompare(candidates[50].id) > 0)
  assert.ok(candidates[399].id.localeCompare(candidates[400].id) > 0)
  assert.equal(continuation.hasMore, false)
  assert.equal(continuation.nextCursor, null)
})

test('shared verification fetch helper covers every bounded chunk and propagates failures', async () => {
  for (const size of [0, 1, 50, 51, 75, 250, 251]) {
    const ids = Array.from({ length: size }, (_, index) => `submission-${index}`)
    const requestedChunks: string[][] = []
    const result = await fetchAdminReviewVerificationRows({
      submissionIds: [...ids, ...(size > 0 ? [ids[0]] : [])],
      fetchChunk: async (chunk) => {
        requestedChunks.push(chunk)
        return {
          data: chunk.map((submission_id) => ({ submission_id, created_at: null, updated_at: null })),
          error: null,
        }
      },
    })

    assert.ok(requestedChunks.every((chunk) => chunk.length <= 50), `${size} has an oversized chunk`)
    assert.deepEqual(new Set(result.data.map((row) => row.submission_id)), new Set(ids))
    assert.equal(result.error, null)
  }

  let calls = 0
  const failed = await fetchAdminReviewVerificationRows({
    submissionIds: Array.from({ length: 75 }, (_, index) => `submission-${index}`),
    fetchChunk: async (chunk) => {
      calls += 1
      return calls === 2
        ? { data: null, error: new Error('verification query failed') }
        : { data: chunk.map((submission_id) => ({ submission_id })), error: null }
    },
  })
  assert.equal(calls, 2)
  assert.equal(failed.failedChunkIndex, 1)
  assert.ok(failed.error instanceof Error)
  assert.deepEqual(failed.data, [])
})

test('submission history anomaly detection fails closed before no-evidence projection', () => {
  const validRows = Array.from({ length: 250 }, (_, index) => ({ order_id: `order-${Math.floor(index / 5)}` }))
  assert.equal(getAdminReviewSubmissionAnomaly(validRows, 250), null)

  const globalOverflow = [...validRows, { order_id: 'order-overflow' }]
  assert.equal(getAdminReviewSubmissionAnomaly(globalOverflow, 250), 'global_overflow')

  const perOrderOverflow = [
    ...Array.from({ length: PAYMENT_SUBMISSION_MAX_COUNT + 1 }, () => ({ order_id: 'order-anomaly' })),
    ...Array.from({ length: 244 }, (_, index) => ({ order_id: `order-${index}` })),
  ]
  assert.equal(perOrderOverflow.length, 250)
  assert.equal(getAdminReviewSubmissionAnomaly(perOrderOverflow, 250), 'per_order_overflow')

  for (let count = 0; count <= PAYMENT_SUBMISSION_MAX_COUNT; count += 1) {
    assert.equal(
      getAdminReviewSubmissionAnomaly(
        Array.from({ length: count }, () => ({ order_id: 'order-normal' })),
        250,
      ),
      null,
    )
  }

  assert.equal(getAdminReviewState({
    orderStatus: 'pending',
    paymentProvider: 'promptpay_manual',
    latestSubmissionStatus: null,
    submissionCount: 0,
    analyzerState: null,
  }), 'no_evidence')
})

test('cursor serialization preserves tied timestamps and rejects malformed cursors', () => {
  const cursor = {
    createdAt: '2026-10-01T00:00:00.000Z',
    id: '11111111-1111-4111-8111-111111111111',
  }
  assert.deepEqual(parseAdminReviewCursor(serializeAdminReviewCursor(cursor)), cursor)
  assert.equal(parseAdminReviewCursor('2026-10-01T00:00:00.000Z|not-a-uuid'), null)
  assert.equal(parseAdminReviewCursor('not-a-date|11111111-1111-4111-8111-111111111111'), null)
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
