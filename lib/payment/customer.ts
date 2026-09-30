import {
  MANUAL_PAYMENT_PROVIDER,
  PAYMENT_SUBMISSION_MAX_COUNT,
  type PaymentSubmissionStatus,
} from './manual'

export type CustomerVerificationStatus = 'checking' | 'under_review' | 'paid'

export type CustomerPaymentState =
  | 'auto_checking'
  | 'awaiting_upload'
  | 'under_review'
  | 'paid'
  | 'free'
  | 'rejected'
  | 'cancelled'
  | 'payment_disabled'
  | 'failed'
  | 'refunded'
  | 'pending'
  | 'empty_orders'

export type CustomerPaymentAction = 'detail' | 'resubmit' | 'access' | 'new_order' | 'browse'

export type CustomerPaymentStateConfig = {
  asset: string
  alt: string
  title: string
  description: string
  compactLabel: string
  action: CustomerPaymentAction | null
}

const PAYMENT_ASSET_BASE = '/images/payment'

export const CUSTOMER_PAYMENT_STALE_STATE_MESSAGE = 'สถานะคำสั่งซื้ออาจมีการเปลี่ยนแปลง กรุณารีเฟรชเพื่อตรวจสอบสถานะล่าสุด'

const REJECTED_PAYMENT_DISABLED_DESCRIPTION = 'หลักฐานก่อนหน้านี้ไม่ผ่านการตรวจสอบ ขณะนี้ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณากลับมาลองใหม่ภายหลัง'

/**
 * Single customer-safe mapping for state copy, action intent, and mascot art.
 * Internal analyzer states intentionally do not appear in this model.
 */
export const CUSTOMER_PAYMENT_STATE_CONFIG: Record<CustomerPaymentState, CustomerPaymentStateConfig> = {
  auto_checking: {
    asset: `${PAYMENT_ASSET_BASE}/payment-auto-checking.png`,
    alt: 'มาสคอต Sobdai กำลังตรวจสอบหลักฐานการชำระเงิน',
    title: 'กำลังตรวจสอบหลักฐานการชำระเงิน',
    description: 'ระบบได้รับหลักฐานของคุณแล้ว และกำลังตรวจสอบข้อมูลให้เรียบร้อย',
    compactLabel: 'กำลังตรวจสอบ',
    action: 'detail',
  },
  awaiting_upload: {
    asset: `${PAYMENT_ASSET_BASE}/payment-auto-checking.png`,
    alt: 'มาสคอต Sobdai พร้อมรับหลักฐานการชำระเงิน',
    title: 'รออัปโหลดหลักฐาน',
    description: 'ชำระเงินแล้วหรือยัง? อัปโหลดหลักฐานเพื่อส่งให้เจ้าหน้าที่ตรวจสอบ',
    compactLabel: 'รอส่งหลักฐาน',
    action: 'resubmit',
  },
  under_review: {
    asset: `${PAYMENT_ASSET_BASE}/payment-manual-review.png`,
    alt: 'มาสคอต Sobdai กำลังรอการตรวจสอบจากเจ้าหน้าที่',
    title: 'อยู่ระหว่างตรวจสอบ',
    description: 'หลักฐานของคุณอยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่',
    compactLabel: 'อยู่ระหว่างตรวจสอบ',
    action: 'detail',
  },
  paid: {
    asset: `${PAYMENT_ASSET_BASE}/payment-approved.png`,
    alt: 'มาสคอต Sobdai ยืนยันการชำระเงินสำเร็จ',
    title: 'ชำระเงินสำเร็จ',
    description: 'คุณได้รับสิทธิ์เข้าถึงแพ็กเกจแล้ว',
    compactLabel: 'ชำระเงินแล้ว',
    action: 'access',
  },
  free: {
    asset: `${PAYMENT_ASSET_BASE}/payment-approved.png`,
    alt: 'มาสคอต Sobdai ยืนยันการเปิดใช้งานแพ็กเกจฟรี',
    title: 'เปิดใช้งานแพ็กเกจฟรีแล้ว',
    description: 'คุณได้รับสิทธิ์เข้าถึงแพ็กเกจนี้แล้ว',
    compactLabel: 'แพ็กเกจฟรี',
    action: 'access',
  },
  rejected: {
    asset: `${PAYMENT_ASSET_BASE}/payment-rejected.png`,
    alt: 'มาสคอต Sobdai แจ้งให้ส่งหลักฐานการชำระเงินใหม่',
    title: 'ต้องส่งหลักฐานใหม่',
    description: 'หลักฐานล่าสุดยังไม่ผ่านการตรวจสอบ กรุณาตรวจสอบข้อมูลแล้วส่งหลักฐานใหม่',
    compactLabel: 'ส่งหลักฐานใหม่',
    action: 'resubmit',
  },
  cancelled: {
    asset: `${PAYMENT_ASSET_BASE}/payment-cancelled.png`,
    alt: 'มาสคอต Sobdai แสดงคำสั่งซื้อที่ถูกยกเลิก',
    title: 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว',
    description: 'คำสั่งซื้อที่ยกเลิกแล้วจะไม่เปิดสิทธิ์แพ็กเกจให้โดยอัตโนมัติ',
    compactLabel: 'ยกเลิกแล้ว',
    action: 'new_order',
  },
  payment_disabled: {
    asset: `${PAYMENT_ASSET_BASE}/payment-disabled.png`,
    alt: 'มาสคอต Sobdai แจ้งว่าการชำระเงินไม่พร้อมใช้งาน',
    title: 'ขณะนี้ยังไม่สามารถรับชำระเงินได้',
    description: 'กรุณาลองใหม่ภายหลัง หรือติดต่อฝ่ายสนับสนุนหากต้องการความช่วยเหลือ',
    compactLabel: 'ชำระเงินไม่พร้อมใช้งาน',
    action: null,
  },
  failed: {
    asset: `${PAYMENT_ASSET_BASE}/payment-rejected.png`,
    alt: 'มาสคอต Sobdai แจ้งว่าการชำระเงินไม่สำเร็จ',
    title: 'การชำระเงินไม่สำเร็จ',
    description: 'ไม่สามารถยืนยันการชำระเงินของคำสั่งซื้อนี้ได้',
    compactLabel: 'ไม่สำเร็จ',
    action: 'detail',
  },
  refunded: {
    asset: `${PAYMENT_ASSET_BASE}/payment-cancelled.png`,
    alt: 'มาสคอต Sobdai แสดงรายการที่คืนเงินแล้ว',
    title: 'คืนเงินแล้ว',
    description: 'คำสั่งซื้อนี้ได้รับการคืนเงินแล้ว',
    compactLabel: 'คืนเงินแล้ว',
    action: 'detail',
  },
  pending: {
    asset: `${PAYMENT_ASSET_BASE}/payment-manual-review.png`,
    alt: 'มาสคอต Sobdai แสดงคำสั่งซื้อที่รอดำเนินการ',
    title: 'รอดำเนินการ',
    description: 'คำสั่งซื้อนี้ยังอยู่ระหว่างดำเนินการ',
    compactLabel: 'รอดำเนินการ',
    action: 'detail',
  },
  empty_orders: {
    asset: `${PAYMENT_ASSET_BASE}/orders-empty.png`,
    alt: 'มาสคอต Sobdai พร้อมช่วยค้นหาแพ็กเกจแรกของคุณ',
    title: 'ยังไม่มีประวัติการสั่งซื้อ',
    description: 'เริ่มต้นเรียนรู้ด้วยการเลือกแพ็กเกจที่เหมาะกับคุณ',
    compactLabel: 'ยังไม่มีรายการ',
    action: 'browse',
  },
}

export function getCustomerPaymentStateConfig(state: CustomerPaymentState) {
  return CUSTOMER_PAYMENT_STATE_CONFIG[state]
}

export function normalizeCustomerVerificationStatus(value: unknown): CustomerVerificationStatus | null {
  if (value === 'checking' || value === 'under_review' || value === 'paid') return value
  return null
}

export function deriveCustomerPaymentState(input: {
  orderStatus: string | null | undefined
  paymentProvider?: string | null
  submissionCount?: number | null
  latestSubmissionStatus?: PaymentSubmissionStatus | null
  verificationStatus?: CustomerVerificationStatus | null
  paymentSettingsAvailable?: boolean | null
  evidenceReadAvailable?: boolean
}): CustomerPaymentState {
  if (input.orderStatus === 'paid') return 'paid'
  if (input.orderStatus === 'free') return 'free'
  if (input.orderStatus === 'cancelled') return 'cancelled'
  if (input.orderStatus === 'failed') return 'failed'
  if (input.orderStatus === 'refunded') return 'refunded'

  if (input.orderStatus === 'pending' && input.paymentProvider === MANUAL_PAYMENT_PROVIDER) {
    if (input.evidenceReadAvailable === false) return 'under_review'
    if (input.latestSubmissionStatus === 'rejected') return 'rejected'

    if (input.latestSubmissionStatus === 'submitted') {
      return input.verificationStatus === 'checking' ? 'auto_checking' : 'under_review'
    }

    if ((input.submissionCount ?? 0) === 0) {
      return input.paymentSettingsAvailable === false ? 'payment_disabled' : 'awaiting_upload'
    }

    return 'under_review'
  }

  if (input.orderStatus === 'pending') return 'pending'
  return 'pending'
}

export function getCustomerPaymentPresentation(input: Parameters<typeof deriveCustomerPaymentState>[0]) {
  const state = deriveCustomerPaymentState(input)
  const config = getCustomerPaymentStateConfig(state)
  const rejectedPaymentUnavailable = state === 'rejected' && input.paymentSettingsAvailable === false
  const canResubmit = config.action === 'resubmit'
    && !rejectedPaymentUnavailable
    && (input.submissionCount === null || input.submissionCount === undefined || input.submissionCount < PAYMENT_SUBMISSION_MAX_COUNT)

  return {
    state,
    ...config,
    title: rejectedPaymentUnavailable ? 'หลักฐานก่อนหน้านี้ไม่ผ่านการตรวจสอบ' : config.title,
    description: rejectedPaymentUnavailable ? REJECTED_PAYMENT_DISABLED_DESCRIPTION : config.description,
    compactLabel: rejectedPaymentUnavailable ? 'ตรวจสอบไม่ผ่าน' : config.compactLabel,
    action: canResubmit ? config.action : config.action === 'resubmit' ? null : config.action,
    canResubmit,
  }
}

function getCustomerPaymentErrorText(error: unknown) {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (record.error) return String(record.error)
    if (record.message) return String(record.message)
  }
  return ''
}

export function isCustomerPaymentStaleStateError(error: unknown) {
  const normalized = getCustomerPaymentErrorText(error).toLowerCase()
  return [
    'already paid',
    'already_paid',
    'payment already completed',
    'ชำระเงินเรียบร้อย',
    'package access',
    'access already granted',
    'already has access',
    'มีสิทธิ์เข้าถึง',
    'มีสิทธิ์แล้ว',
  ].some((fragment) => normalized.includes(fragment))
}

export function customerPaymentErrorMessage(error: unknown, fallback: string) {
  const raw = getCustomerPaymentErrorText(error)
  const normalized = raw.toLowerCase()

  if (normalized.includes('4 mb') || normalized.includes('4mb') || normalized.includes('ใหญ่เกิน') || normalized.includes('ขนาดสลิป')) {
    return 'ไฟล์มีขนาดใหญ่เกินไป กรุณาเลือกไฟล์ไม่เกิน 4 MB'
  }
  if (normalized.includes('ชนิดไฟล์') || normalized.includes('รองรับเฉพาะ') || normalized.includes('mime') || normalized.includes('file type')) {
    return 'รองรับไฟล์ JPG, PNG, WebP หรือ PDF ตามที่ระบบกำหนด'
  }
  if (normalized.includes('submission limit') || normalized.includes('ครบจำนวน') || normalized.includes('p0001')) {
    return 'ส่งหลักฐานการชำระเงินครบจำนวนที่กำหนดแล้ว กรุณาติดต่อฝ่ายสนับสนุน'
  }
  if (isCustomerPaymentStaleStateError(error)) {
    return CUSTOMER_PAYMENT_STALE_STATE_MESSAGE
  }
  if (normalized.includes('settings') || normalized.includes('promptpay') && normalized.includes('ไม่พร้อม') || normalized.includes('payment details unavailable')) {
    return 'ขณะนี้ยังไม่สามารถรับชำระเงินได้ กรุณาลองใหม่ภายหลัง'
  }
  if (normalized.includes('เข้าสู่ระบบ') || normalized.includes('unauthorized')) {
    return 'กรุณาเข้าสู่ระบบก่อนดำเนินการ'
  }

  return fallback
}
