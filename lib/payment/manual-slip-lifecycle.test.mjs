import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attemptPaymentSubmissionNotification,
  shouldDeleteAfterSubmissionError,
  shouldDeleteUploadedPaymentSlip,
} from './manual-slip-lifecycle.ts'

test('retains an uploaded slip when post-commit verification fails', () => {
  assert.equal(
    shouldDeleteUploadedPaymentSlip({
      submissionCommitted: true,
      orderId: 'order-1',
      objectPath: 'buyer/order-1/current.png',
      persistedSubmissionError: new Error('read timeout'),
    }),
    false,
  )
  assert.equal(
    shouldDeleteUploadedPaymentSlip({
      submissionCommitted: true,
      orderId: 'order-1',
      objectPath: 'buyer/order-1/current.png',
      persistedSubmission: null,
    }),
    false,
  )
})

test('deletes only a proven race-loser object', () => {
  assert.equal(
    shouldDeleteUploadedPaymentSlip({
      submissionCommitted: true,
      orderId: 'order-1',
      objectPath: 'buyer/order-1/loser.png',
      persistedSubmission: {
        order_id: 'order-1',
        storage_object_path: 'buyer/order-1/winner.png',
      },
    }),
    true,
  )
  assert.equal(
    shouldDeleteUploadedPaymentSlip({
      submissionCommitted: true,
      orderId: 'order-1',
      objectPath: 'buyer/order-1/winner.png',
      persistedSubmission: {
        order_id: 'order-1',
        storage_object_path: 'buyer/order-1/winner.png',
      },
    }),
    false,
  )
})

test('failed submission deletes only after reconciliation proves no row exists', () => {
  assert.equal(shouldDeleteAfterSubmissionError({ recoveredSubmission: null }), true)
  assert.equal(
    shouldDeleteAfterSubmissionError({ recoveredSubmission: { id: 'submission-1' } }),
    false,
  )
  assert.equal(
    shouldDeleteAfterSubmissionError({ recoveryError: new Error('read timeout') }),
    false,
  )
})

test('Telegram failure is operational-only after the payment commit', async () => {
  const committedState = { status: 'submitted', orderStatus: 'pending' }
  const result = await attemptPaymentSubmissionNotification(async () => {
    throw new Error('Telegram unavailable')
  })

  assert.equal(result.sent, false)
  assert.match(String(result.error), /Telegram unavailable/)
  assert.deepEqual(committedState, { status: 'submitted', orderStatus: 'pending' })
})

test('successful Telegram notification reports sent without changing payment state', async () => {
  let calls = 0
  const result = await attemptPaymentSubmissionNotification(async () => {
    calls += 1
  })

  assert.equal(calls, 1)
  assert.deepEqual(result, { sent: true, error: null })
})
