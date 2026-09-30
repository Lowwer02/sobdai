import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CUSTOMER_PAYMENT_STALE_STATE_MESSAGE,
  customerPaymentErrorMessage,
  deriveCustomerPaymentState,
  getCustomerPaymentPresentation,
  isCustomerPaymentStaleStateError,
  normalizeCustomerVerificationStatus,
} from './customer'
import { MANUAL_PAYMENT_PROVIDER, PAYMENT_SUBMISSION_MAX_COUNT } from './manual'

test('customer state maps checking to the neutral checking experience', () => {
  assert.equal(
    deriveCustomerPaymentState({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 1,
      latestSubmissionStatus: 'submitted',
      verificationStatus: 'checking',
    }),
    'auto_checking',
  )
})

test('customer state maps under_review without exposing analyzer states', () => {
  assert.equal(
    deriveCustomerPaymentState({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 1,
      latestSubmissionStatus: 'submitted',
      verificationStatus: 'under_review',
    }),
    'under_review',
  )
  assert.equal(normalizeCustomerVerificationStatus('STRONG_MATCH'), null)
  assert.equal(normalizeCustomerVerificationStatus('SUSPICIOUS'), null)
  assert.equal(normalizeCustomerVerificationStatus('ANALYZER_ERROR'), null)
})

test('paid is derived only from canonical order status', () => {
  assert.equal(
    deriveCustomerPaymentState({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 1,
      latestSubmissionStatus: 'submitted',
      verificationStatus: 'paid',
    }),
    'under_review',
  )
  assert.equal(deriveCustomerPaymentState({ orderStatus: 'paid' }), 'paid')
})

test('rejected, cancelled, disabled, and empty states have safe actions', () => {
  assert.equal(
    getCustomerPaymentPresentation({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 1,
      latestSubmissionStatus: 'rejected',
    }).action,
    'resubmit',
  )
  assert.equal(
    getCustomerPaymentPresentation({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: PAYMENT_SUBMISSION_MAX_COUNT,
      latestSubmissionStatus: 'rejected',
    }).action,
    null,
  )
  assert.equal(deriveCustomerPaymentState({ orderStatus: 'cancelled' }), 'cancelled')
  assert.equal(
    deriveCustomerPaymentState({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 0,
      paymentSettingsAvailable: false,
    }),
    'payment_disabled',
  )
  assert.equal(deriveCustomerPaymentState({ orderStatus: 'pending' }), 'pending')
})

test('rejected orders stay rejected but lose resubmit when payment is disabled', () => {
  const presentation = getCustomerPaymentPresentation({
    orderStatus: 'pending',
    paymentProvider: MANUAL_PAYMENT_PROVIDER,
    submissionCount: 1,
    latestSubmissionStatus: 'rejected',
    paymentSettingsAvailable: false,
  })

  assert.equal(presentation.state, 'rejected')
  assert.equal(presentation.action, null)
  assert.equal(presentation.canResubmit, false)
  assert.equal(presentation.compactLabel, 'ตรวจสอบไม่ผ่าน')
  assert.match(presentation.description, /หลักฐานก่อนหน้านี้ไม่ผ่านการตรวจสอบ/)
  assert.match(presentation.description, /ระบบชำระเงินยังไม่พร้อมใช้งาน/)
})

test('stale payment errors stay neutral and request canonical refresh', () => {
  for (const error of [
    { error: 'already paid' },
    { error: 'package access already granted' },
    new Error('มีสิทธิ์เข้าถึงแพ็กเกจนี้แล้ว'),
  ]) {
    assert.equal(isCustomerPaymentStaleStateError(error), true)
    assert.equal(customerPaymentErrorMessage(error, 'fallback'), CUSTOMER_PAYMENT_STALE_STATE_MESSAGE)
  }

  assert.doesNotMatch(
    customerPaymentErrorMessage({ error: 'already paid' }, 'fallback'),
    /ชำระเงินเรียบร้อยแล้ว|มีสิทธิ์เข้าถึงแพ็กเกจนี้แล้ว/,
  )
  assert.equal(isCustomerPaymentStaleStateError({ error: 'submission limit' }), false)
})
