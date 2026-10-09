import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldPrepareManualPaymentQr } from './manual-qr-eligibility'

const eligibleOrder = { status: 'pending', paymentSettingsAvailable: true }

test('paid checkout prepares a QR only for an eligible pending manual order that currently renders the transfer step', () => {
  assert.equal(shouldPrepareManualPaymentQr({
    currentPrice: 99,
    order: eligibleOrder,
    paymentEnabled: true,
    presentationState: 'awaiting_upload',
  }), true)

  for (const input of [
    { currentPrice: 0, order: eligibleOrder, paymentEnabled: true, presentationState: 'awaiting_upload' as const },
    { currentPrice: 99, order: null, paymentEnabled: true, presentationState: 'awaiting_upload' as const },
    { currentPrice: 99, order: { ...eligibleOrder, status: 'complete' }, paymentEnabled: true, presentationState: 'awaiting_upload' as const },
    { currentPrice: 99, order: { ...eligibleOrder, paymentSettingsAvailable: false }, paymentEnabled: true, presentationState: 'rejected' as const },
    { currentPrice: 99, order: eligibleOrder, paymentEnabled: false, presentationState: 'awaiting_upload' as const },
    { currentPrice: 99, order: eligibleOrder, paymentEnabled: true, presentationState: 'under_review' as const },
  ]) {
    assert.equal(shouldPrepareManualPaymentQr(input), false)
  }
})
