import assert from 'node:assert/strict'
import test from 'node:test'
import { getPaymentStatusPresentation, MANUAL_PAYMENT_PROVIDER } from './manual.ts'

test('manual payment presentation distinguishes every M1.1 state', () => {
  assert.deepEqual(
    getPaymentStatusPresentation({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 0,
      latestSubmissionStatus: null,
    }),
    {
      key: 'awaiting-upload',
      label: 'รออัปโหลดสลิป',
      description: 'คำสั่งซื้อยังไม่สมบูรณ์ กรุณาอัปโหลดหลักฐานหลังชำระเงินเพื่อส่งให้เจ้าหน้าที่ตรวจสอบ',
    },
  )
  assert.equal(
    getPaymentStatusPresentation({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 1,
      latestSubmissionStatus: 'submitted',
    }).label,
    'รอตรวจสอบการชำระเงิน',
  )
  assert.equal(
    getPaymentStatusPresentation({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      submissionCount: 2,
      latestSubmissionStatus: 'rejected',
    }).label,
    'หลักฐานไม่ผ่าน กรุณาส่งใหม่',
  )
  assert.equal(
    getPaymentStatusPresentation({
      orderStatus: 'pending',
      paymentProvider: MANUAL_PAYMENT_PROVIDER,
      evidenceReadAvailable: false,
    }).label,
    'ตรวจสอบสถานะสลิปไม่ได้',
  )
  assert.equal(getPaymentStatusPresentation({ orderStatus: 'paid' }).label, 'ชำระเงินแล้ว')
  assert.equal(getPaymentStatusPresentation({ orderStatus: 'cancelled' }).label, 'ยกเลิกแล้ว')
})
