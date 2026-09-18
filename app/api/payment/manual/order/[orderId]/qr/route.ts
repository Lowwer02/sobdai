import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid, MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import { readPaymentSettings, toPaymentSettingsQrView } from '@/lib/payment/payment-settings'
import { renderPromptPayQr, InvalidPaymentAmountError, InvalidPromptPayRecipientError, PROMPTPAY_QR_ERROR } from '@/lib/payment/promptpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: privateHeaders })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params

  if (!isUuid(orderId)) {
    return errorResponse('คำสั่งซื้อไม่ถูกต้อง', 400)
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return errorResponse('กรุณาเข้าสู่ระบบก่อน', 401)

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, amount, status, payment_provider')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (orderError) {
      console.error('[PAYMENT] manual QR order lookup failed:', orderError.code || 'unknown')
      return errorResponse(PROMPTPAY_QR_ERROR, 503)
    }

    if (!order) return errorResponse('ไม่พบคำสั่งซื้อ', 404)
    if (order.status !== 'pending' || order.payment_provider !== MANUAL_PAYMENT_PROVIDER) {
      return errorResponse('คำสั่งซื้อนี้ไม่อยู่ระหว่างรอชำระเงิน PromptPay', 409)
    }

    let paymentSettings
    try {
      paymentSettings = toPaymentSettingsQrView(await readPaymentSettings(createAdminClient()))
    } catch (settingsError) {
      console.error('[PAYMENT] manual QR settings lookup failed:', settingsError instanceof Error ? settingsError.message : 'unknown error')
      return errorResponse('ขณะนี้การชำระเงินผ่าน PromptPay ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง', 503)
    }

    if (!paymentSettings) {
      return errorResponse('ขณะนี้การชำระเงินผ่าน PromptPay ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง', 503)
    }

    let rendered
    try {
      // The QR helper receives only the order's persisted amount. It never
      // accepts package.current_price, a query amount, or client state.
      rendered = await renderPromptPayQr(paymentSettings.recipient, order.amount)
    } catch (generationError) {
      if (!(generationError instanceof InvalidPaymentAmountError) && !(generationError instanceof InvalidPromptPayRecipientError)) {
        console.error('[PAYMENT] manual QR generation failed:', generationError instanceof Error ? generationError.message : 'unknown error')
      }
      return errorResponse(PROMPTPAY_QR_ERROR, 422)
    }

    const base64 = rendered.dataUrl.split(',')[1]
    if (!base64) return errorResponse(PROMPTPAY_QR_ERROR, 500)

    return new NextResponse(Buffer.from(base64, 'base64'), {
      status: 200,
      headers: {
        ...privateHeaders,
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline',
      },
    })
  } catch (error) {
    console.error('[PAYMENT] manual QR route failed:', error instanceof Error ? error.message : 'unknown error')
    return errorResponse(PROMPTPAY_QR_ERROR, 500)
  }
}
