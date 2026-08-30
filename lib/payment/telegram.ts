import 'server-only'

export interface PaymentSubmissionNotification {
  orderId: string
  paymentSubmissionId: string
  packageName: string
  amount: number
  userEmail: string
}
/**
 * Telegram is operational notification only. The database commit is already
 * complete before this adapter is called, and no slip URL is sent through it.
 */
export async function notifyPaymentSubmission(input: PaymentSubmissionNotification) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!botToken || !adminChatId) {
    console.warn('[PAYMENT NOTIFICATION] Telegram is not configured.')
    return { sent: false, reason: 'not_configured' as const }
  }

  const text = [
    'มีสลิป PromptPay รอตรวจสอบ',
    `Order: ${input.orderId}`,
    `Submission: ${input.paymentSubmissionId}`,
    `แพ็กเกจ: ${input.packageName}`,
    `ยอดเงิน: ฿${input.amount.toLocaleString('th-TH')}`,
    `ผู้ซื้อ: ${input.userEmail || 'ไม่ระบุอีเมล'}`,
    'เปิดคิว Orders ใน Admin เพื่อดูสลิปและตรวจสอบรายการ',
  ].join('\n')

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    },
  )

  if (!response.ok) {
    throw new Error(`Telegram notification failed with status ${response.status}.`)
  }

  return { sent: true as const }
}
