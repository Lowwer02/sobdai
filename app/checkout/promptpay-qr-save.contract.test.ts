import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const checkout = readFileSync(join(process.cwd(), 'app/checkout/[id]/CheckoutClient.tsx'), 'utf8')
const qrRoute = readFileSync(join(process.cwd(), 'app/api/payment/manual/order/[orderId]/qr/route.ts'), 'utf8')

test('mobile save action appears only after the current authoritative QR is available', () => {
  assert.match(checkout, /manualQrState === 'ready' && currentManualQrDetails && manualQrExport\?\.orderId === manualOrder\.id/)
  assert.match(checkout, /บันทึก QR Code/)
  assert.match(checkout, /min-h-\[44px\]/)
  assert.match(checkout, /className="mx-auto mt-3 w-full max-w-sm text-center md:hidden"/)
  assert.match(checkout, /disabled=\{manualQrExportState === 'idle' \|\| manualQrExportState === 'preparing' \|\| qrSavePending\}/)
})

test('displayed image, saved file, and preview reuse one server-rendered PNG', () => {
  assert.match(checkout, /const manualQrUrl = manualOrder[\s\S]*?\/api\/payment\/manual\/order\/\$\{encodeURIComponent\(manualOrder\.id\)\}\/qr/)
  assert.match(checkout, /fetch\(manualQrUrl, \{ cache: 'no-store', signal: controller\.signal \}\)/)
  assert.match(checkout, /setManualQrExport\(\{ orderId, file, imageUrl \}\)/)
  assert.match(checkout, /src=\{manualQrExport\.imageUrl\}/)
  assert.match(checkout, /navigator\.share\(\{ files: \[file\]/)
  assert.match(qrRoute, /renderPromptPayQr\(paymentSettings\.recipient, order\.amount\)/)
  assert.match(qrRoute, /\.eq\('id', orderId\)[\s\S]*?\.eq\('user_id', user\.id\)/)
  assert.match(qrRoute, /'Cache-Control': 'private, no-store'/)
})

test('save action sits below the QR and before slip upload, without desktop visibility', () => {
  const imageIndex = checkout.indexOf('src={manualQrExport.imageUrl}')
  const saveButtonIndex = checkout.indexOf('onClick={handlePromptPayQrSave}')
  const slipFormIndex = checkout.indexOf('<form onSubmit={handleSlipSubmit}')

  assert.ok(imageIndex >= 0 && imageIndex < saveButtonIndex && saveButtonIndex < slipFormIndex)
  assert.match(checkout.slice(saveButtonIndex, slipFormIndex), /md:hidden/)
  assert.match(checkout, /const handlePromptPayQrSave = \(\) => \{[\s\S]*?getPromptPayQrSaveMode\(navigator, file/)
  assert.doesNotMatch(checkout.slice(saveButtonIndex, slipFormIndex), /บันทึกสำเร็จ/)
})

test('free checkout and unavailable QR states cannot render an actionable save control', () => {
  const freeBranch = checkout.indexOf('{currentPrice === 0 ?')
  const paidPanel = checkout.indexOf('Paid Checkout Panel')
  const saveButton = checkout.indexOf('onClick={handlePromptPayQrSave}')

  assert.ok(freeBranch >= 0 && freeBranch < paidPanel && paidPanel < saveButton)
  assert.match(checkout, /manualQrState === 'unavailable' && <div/)
  assert.match(checkout, /if \(!orderId \|\| !manualQrUrl \|\| !manualPaymentEnabled \|\| manualQrDetails\?\.orderId !== orderId\)/)
  assert.match(checkout, /onError=\{\(\) => \{\s*setManualQrState\('unavailable'\)/)
})

test('share cancellation stays neutral and fallbacks provide clear customer-safe guidance', () => {
  assert.match(checkout, /if \(isPromptPayShareCancelled\(reason\)\) return/)
  assert.match(checkout, /เริ่มดาวน์โหลด QR Code แล้ว/)
  assert.match(checkout, /แตะค้างที่รูป QR แล้วเลือกบันทึกรูปภาพ/)
  assert.match(checkout, /role="status" aria-live="polite"/)
  assert.match(checkout, /aria-label="บันทึก QR Code สำหรับชำระเงิน"/)
  assert.match(checkout, /focus-visible:ring-2/)
  assert.doesNotMatch(checkout, /บันทึกสำเร็จ/)
})

test('QR export does not change the order, amount, or payment status', () => {
  const handler = checkout.match(/const handlePromptPayQrSave = \(\) => \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(handler)
  assert.doesNotMatch(handler, /setManualOrder|setManualQrState|setError|approvePayment|status\s*=|amount\s*:/)
  assert.doesNotMatch(handler, /fetch\(|rpc\(|create_manual_payment_order|payment\/manual\/slip/)
  assert.doesNotMatch(checkout, /buildPromptPayPayload|@thai-qr-payment\/payload|from ['"]qrcode['"]/)
})

test('new save UI text contains no emoji', () => {
  const saveUi = checkout.slice(checkout.indexOf('onClick={handlePromptPayQrSave}'), checkout.indexOf('<form onSubmit={handleSlipSubmit}'))
  assert.doesNotMatch(saveUi, /\p{Extended_Pictographic}/u)
})
