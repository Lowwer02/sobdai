export const MANUAL_PAYMENT_PROVIDER = 'promptpay_manual' as const

export const PAYMENT_SLIP_MAX_BYTES = 4 * 1024 * 1024

export const PAYMENT_SLIP_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type PaymentSlipMimeType = (typeof PAYMENT_SLIP_MIME_TYPES)[number]
export type PaymentSubmissionStatus = 'submitted' | 'approved' | 'rejected'

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
export function isPaymentSlipMimeType(value: string): value is PaymentSlipMimeType {
  return (PAYMENT_SLIP_MIME_TYPES as readonly string[]).includes(value)
}

export function paymentSlipExtension(mimeType: string): string | null {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
    default:
      return null
  }
}

/** Keep the original name useful to a reviewer without accepting path data. */
export function sanitizeOriginalFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() || 'payment-slip'
  const sanitized = basename
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  return (sanitized || 'payment-slip').slice(0, 255)
}
