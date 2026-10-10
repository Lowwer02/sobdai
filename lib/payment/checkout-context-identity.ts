export interface CheckoutContextOrder {
  id: string
  status: string
  submissionStatus: string | null
  customerVerificationStatus: string | null
  submissionCount: number | null
  paymentEvidenceAvailable: boolean
  paymentSettingsAvailable: boolean
}

export interface CheckoutContextIdentityInput {
  packageId: string | number | null | undefined
  isFreeCheckout: boolean
  paymentEnabled: boolean
  initialManualOrder: CheckoutContextOrder | null | undefined
}

/**
 * Identify the incoming checkout context without using payment amounts or
 * other client-controlled payment data as identity.
 */
export function createCheckoutContextIdentity({
  packageId,
  isFreeCheckout,
  paymentEnabled,
  initialManualOrder,
}: CheckoutContextIdentityInput): string {
  return JSON.stringify({
    packageId: String(packageId ?? ''),
    isFreeCheckout,
    paymentEnabled,
    manualOrder: initialManualOrder ? {
      id: initialManualOrder.id,
      status: initialManualOrder.status,
      submissionStatus: initialManualOrder.submissionStatus,
      customerVerificationStatus: initialManualOrder.customerVerificationStatus,
      submissionCount: initialManualOrder.submissionCount,
      paymentEvidenceAvailable: initialManualOrder.paymentEvidenceAvailable,
      paymentSettingsAvailable: initialManualOrder.paymentSettingsAvailable,
    } : null,
  })
}
