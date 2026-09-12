export const MANUAL_PAYMENT_PROVIDER = 'promptpay_manual' as const

export const PAYMENT_SLIP_MAX_BYTES = 4 * 1024 * 1024
export const PAYMENT_SUBMISSION_MAX_COUNT = 5
export const PAYMENT_SUBMISSION_LIMIT_ERROR_CODE = 'P0001'
export const PAYMENT_SUBMISSION_LIMIT_ERROR = 'ส่งหลักฐานการชำระเงินครบจำนวนที่กำหนดแล้ว กรุณาติดต่อฝ่ายสนับสนุน'

export const PAYMENT_SLIP_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type PaymentSlipMimeType = (typeof PAYMENT_SLIP_MIME_TYPES)[number]
export type PaymentSubmissionStatus = 'submitted' | 'approved' | 'rejected'

export type PaymentStatusPresentation = {
  key: 'awaiting-upload' | 'under-review' | 'rejected' | 'evidence-unavailable' | 'paid' | 'cancelled' | 'free' | 'pending' | 'failed' | 'refunded' | 'unknown'
  label: string
  description?: string
}

/**
 * Derive payment copy from the existing order authority and evidence rows.
 * This is presentation only; it does not introduce another access state.
 */
export function getPaymentStatusPresentation(input: {
  orderStatus: string | null | undefined
  paymentProvider?: string | null
  submissionCount?: number | null
  latestSubmissionStatus?: PaymentSubmissionStatus | null
  evidenceReadAvailable?: boolean
}): PaymentStatusPresentation {
  if (input.orderStatus === 'paid') {
    return { key: 'paid', label: 'ชำระเงินแล้ว' }
  }

  if (input.orderStatus === 'cancelled') {
    return { key: 'cancelled', label: 'ยกเลิกแล้ว' }
  }

  if (input.orderStatus === 'free') {
    return { key: 'free', label: 'ฟรี' }
  }

  if (input.orderStatus === 'pending' && input.paymentProvider === MANUAL_PAYMENT_PROVIDER) {
    if (input.evidenceReadAvailable === false) {
      return {
        key: 'evidence-unavailable',
        label: 'ตรวจสอบสถานะสลิปไม่ได้',
        description: 'ไม่สามารถตรวจสอบหลักฐานการชำระเงินได้ในขณะนี้ กรุณารีเฟรชแล้วลองใหม่',
      }
    }

    if (input.latestSubmissionStatus === 'submitted') {
      return { key: 'under-review', label: 'รอตรวจสอบการชำระเงิน' }
    }

    if (input.latestSubmissionStatus === 'rejected') {
      return { key: 'rejected', label: 'หลักฐานไม่ผ่าน กรุณาส่งใหม่' }
    }

    if ((input.submissionCount ?? 0) === 0) {
      return {
        key: 'awaiting-upload',
        label: 'รออัปโหลดสลิป',
        description: 'คำสั่งซื้อยังไม่สมบูรณ์ กรุณาอัปโหลดหลักฐานหลังชำระเงินเพื่อส่งให้เจ้าหน้าที่ตรวจสอบ',
      }
    }
  }

  if (input.orderStatus === 'pending') {
    return { key: 'pending', label: 'รอดำเนินการ' }
  }

  if (input.orderStatus === 'failed') {
    return { key: 'failed', label: 'ไม่สำเร็จ' }
  }

  if (input.orderStatus === 'refunded') {
    return { key: 'refunded', label: 'คืนเงินแล้ว' }
  }

  return { key: 'unknown', label: input.orderStatus || 'ไม่ทราบสถานะ' }
}

export function isPaymentSubmissionLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === PAYMENT_SUBMISSION_LIMIT_ERROR_CODE
    || candidate.message === 'Payment submission limit reached.'
}

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
