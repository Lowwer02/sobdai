import type { CustomerPaymentState } from './customer'

export interface ManualPaymentQrEligibilityInput {
  currentPrice: number
  order: { status: string; paymentSettingsAvailable: boolean } | null
  paymentEnabled: boolean
  presentationState: CustomerPaymentState | null
}

/** True only while the paid checkout currently renders a manual transfer QR. */
export function shouldPrepareManualPaymentQr({
  currentPrice,
  order,
  paymentEnabled,
  presentationState,
}: ManualPaymentQrEligibilityInput): boolean {
  return currentPrice > 0
    && paymentEnabled
    && order?.status === 'pending'
    && order.paymentSettingsAvailable
    && (presentationState === 'awaiting_upload' || presentationState === 'rejected')
}
