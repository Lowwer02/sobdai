import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const checkout = readFileSync(join(process.cwd(), 'app/checkout/[id]/CheckoutClient.tsx'), 'utf8')
const qrRoute = readFileSync(join(process.cwd(), 'app/api/payment/manual/order/[orderId]/qr/route.ts'), 'utf8')
const eligibility = readFileSync(join(process.cwd(), 'lib/payment/manual-qr-eligibility.ts'), 'utf8')

test('mobile save action appears only after the current authoritative QR is available', () => {
  assert.match(checkout, /manualQrState === 'ready' && currentManualQrDetails && manualQrExport\?\.orderId === manualOrder\.id/)
  assert.match(checkout, /บันทึก QR Code/)
  assert.match(checkout, /min-h-\[44px\]/)
  assert.match(checkout, /className="mx-auto mt-3 w-full max-w-sm text-center lg:hidden"/)
  assert.match(checkout, /เปิดรูป QR เพื่อบันทึก/)
  assert.match(checkout, /disabled=\{manualQrExportState === 'idle' \|\| manualQrExportState === 'preparing' \|\| qrSavePending\}/)
})

test('displayed image, saved file, and preview reuse one server-rendered PNG', () => {
  assert.match(checkout, /const manualQrUrl = manualOrder[\s\S]*?\/api\/payment\/manual\/order\/\$\{encodeURIComponent\(manualOrder\.id\)\}\/qr/)
  assert.match(checkout, /fetch\(manualQrUrl, \{ cache: 'no-store', signal: controller\.signal \}\)/)
  assert.match(checkout, /setManualQrExport\(\{ orderId, file, imageUrl \}\)/)
  assert.match(checkout, /src=\{manualQrExport\.imageUrl\}/)
  assert.match(checkout, /share\.call\(navigator, \{ files: \[file\]/)
  assert.match(qrRoute, /renderPromptPayQr\(paymentSettings\.recipient, order\.amount\)/)
  assert.match(qrRoute, /\.eq\('id', orderId\)[\s\S]*?\.eq\('user_id', user\.id\)/)
  assert.match(qrRoute, /'Cache-Control': 'private, no-store'/)
})

test('save action sits below the QR and before slip upload, without desktop visibility', () => {
  const imageIndex = checkout.indexOf('src={manualQrExport.imageUrl}')
  const saveButtonIndex = checkout.indexOf('onClick={handlePromptPayQrSave}')
  const slipFormIndex = checkout.indexOf('<form onSubmit={handleSlipSubmit}')

  assert.ok(imageIndex >= 0 && imageIndex < saveButtonIndex && saveButtonIndex < slipFormIndex)
  assert.match(checkout, /className="mx-auto mt-3 w-full max-w-sm text-center lg:hidden"/)
  assert.match(checkout, /max-w-md overflow-y-auto rounded-2xl border-0 bg-white p-4 text-center text-slate-900 shadow-xl outline-none backdrop:bg-black\/70 lg:hidden/)
  assert.match(checkout, /const handlePromptPayQrSave = \(event: ReactMouseEvent<HTMLButtonElement>\) => \{[\s\S]*?getPromptPayQrSaveMode\(navigator, file/)
  assert.match(checkout, /เริ่มดาวน์โหลด QR Code แล้ว หากไม่พบไฟล์ สามารถเปิดรูป QR เพื่อบันทึกได้/)
  assert.doesNotMatch(checkout.slice(saveButtonIndex, slipFormIndex), /บันทึกสำเร็จ/)
})

test('free checkout and unavailable QR states cannot render or prepare a QR', () => {
  const freeBranch = checkout.indexOf('{currentPrice === 0 ?')
  const paidPanel = checkout.indexOf('Paid Checkout Panel')
  const saveButton = checkout.indexOf('onClick={handlePromptPayQrSave}')

  assert.ok(freeBranch >= 0 && freeBranch < paidPanel && paidPanel < saveButton)
  assert.match(checkout, /manualQrState === 'unavailable' && <div/)
  assert.match(checkout, /if \(!orderId \|\| !manualQrUrl \|\| !manualQrNeededForPaidCheckout\)/)
  assert.match(eligibility, /currentPrice > 0/)
  assert.match(eligibility, /order\?\.status === 'pending'/)
  assert.match(eligibility, /order\.paymentSettingsAvailable/)
  assert.match(eligibility, /presentationState === 'awaiting_upload' \|\| presentationState === 'rejected'/)
  assert.match(checkout, /onError=\{\(\) => \{\s*setManualQrState\('unavailable'\)/)
})

test('share cancellation stays neutral and fallbacks provide clear customer-safe guidance', () => {
  assert.match(checkout, /if \(isPromptPayShareCancelled\(reason\)\) \{\s*setQrSaveStatus\(''\)\s*return\s*\}/)
  assert.match(checkout, /initiatePromptPayQrDownload\(file\)/)
  assert.match(checkout, /แตะค้างที่รูป QR แล้วเลือกบันทึกรูปภาพ/)
  assert.match(checkout, /เปิดรูป QR เพื่อบันทึก/)
  assert.match(checkout, /role="status" aria-live="polite"/)
  assert.match(checkout, /aria-label="บันทึก QR Code สำหรับชำระเงิน"/)
  assert.match(checkout, /focus-visible:ring-2/)
  assert.doesNotMatch(checkout, /บันทึกสำเร็จ/)
})

test('preview uses a native modal dialog and records the actual opener before opening', () => {
  assert.match(checkout, /createPortal\([\s\S]*?<dialog[\s\S]*?onCancel=/)
  assert.match(checkout, /if \(!dialog\.open\) dialog\.showModal\(\)/)
  assert.match(checkout, /qrPreviewCloseButtonRef\.current\?\.focus\(\)/)
  assert.match(checkout, /if \(!qrPreviewIsOpenRef\.current\) qrPreviewOpenerRef\.current = opener/)
  assert.match(checkout, /const opener = qrPreviewOpenerRef\.current/)
  assert.match(checkout, /qrPreviewFallbackRef/)
  assert.doesNotMatch(checkout, /autoFocus|aria-modal="true"/)
})

test('preview traps forward and reverse keyboard navigation inside the native modal', () => {
  assert.match(checkout, /const handlePreviewTab = \(event: KeyboardEvent\) => \{[\s\S]*?if \(event\.key !== 'Tab'\) return/)
  assert.match(checkout, /if \(!dialog\.contains\(activeElement\)\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?\(event\.shiftKey \? last : first\)\.focus\(\)/)
  assert.match(checkout, /event\.shiftKey && activeElement === first[\s\S]*?last\.focus\(\)/)
  assert.match(checkout, /!event\.shiftKey && activeElement === last[\s\S]*?first\.focus\(\)/)
  assert.match(checkout, /document\.addEventListener\('keydown', handlePreviewTab, true\)/)
  assert.match(checkout, /document\.removeEventListener\('keydown', handlePreviewTab, true\)/)
})

test('QR export does not change the order, amount, or payment status', () => {
  const handler = checkout.match(/const handlePromptPayQrSave = \(event: ReactMouseEvent<HTMLButtonElement>\) => \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(handler)
  assert.doesNotMatch(handler, /setManualOrder|setManualQrState|setError|approvePayment|status\s*=|amount\s*:/)
  assert.doesNotMatch(handler, /fetch\(|rpc\(|create_manual_payment_order|payment\/manual\/slip/)
  assert.doesNotMatch(checkout, /buildPromptPayPayload|@thai-qr-payment\/payload|from ['"]qrcode['"]/)
})

test('new save UI text contains no emoji', () => {
  const saveUi = checkout.slice(checkout.indexOf('onClick={handlePromptPayQrSave}'), checkout.indexOf('<form onSubmit={handleSlipSubmit}'))
  assert.doesNotMatch(saveUi, /\p{Extended_Pictographic}/u)
})
