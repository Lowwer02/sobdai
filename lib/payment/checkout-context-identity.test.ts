import assert from 'node:assert/strict'
import test from 'node:test'
import { createCheckoutContextIdentity, type CheckoutContextOrder } from './checkout-context-identity'

const orderA: CheckoutContextOrder = {
  id: 'synthetic-order-a',
  status: 'pending',
  submissionStatus: null,
  customerVerificationStatus: null,
  submissionCount: 0,
  paymentEvidenceAvailable: true,
  paymentSettingsAvailable: true,
}

function identity({
  packageId = 'synthetic-package-a',
  isFreeCheckout = false,
  paymentEnabled = true,
  initialManualOrder = orderA,
}: Partial<Parameters<typeof createCheckoutContextIdentity>[0]> = {}) {
  return createCheckoutContextIdentity({ packageId, isFreeCheckout, paymentEnabled, initialManualOrder })
}

test('checkout identity distinguishes packages, orders, paid/free, and manual payment eligibility context', () => {
  const baseline = identity()

  assert.notEqual(identity({ packageId: 'synthetic-package-b' }), baseline)
  assert.notEqual(identity({ initialManualOrder: { ...orderA, id: 'synthetic-order-b' } }), baseline)
  assert.notEqual(identity({ isFreeCheckout: true }), baseline)
  assert.notEqual(identity({ paymentEnabled: false }), baseline)
  assert.notEqual(identity({ initialManualOrder: { ...orderA, paymentSettingsAvailable: false } }), baseline)
  assert.notEqual(identity({ initialManualOrder: { ...orderA, submissionStatus: 'submitted' } }), baseline)
})

test('checkout identity is stable across equivalent new prop objects and ignores manual order amount', () => {
  const first = identity()
  const equivalentProps = identity({ initialManualOrder: { ...orderA } })
  const orderWithAmount = { ...orderA, amount: 123 }
  const differentAmount = identity({ initialManualOrder: orderWithAmount })

  assert.equal(equivalentProps, first)
  assert.equal(differentAmount, first)
})
