import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid, MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import { readPaymentSettings, toPaymentSettingsQrView, PAYMENT_SETTINGS_UNAVAILABLE_ERROR } from '@/lib/payment/payment-settings'
import { normalizeOrderAmount, InvalidPaymentAmountError } from '@/lib/payment/promptpay'

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

  if (!isUuid(orderId)) return errorResponse('คำสั่งซื้อไม่ถูกต้อง', 400)

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
      console.error('[PAYMENT] manual payment details lookup failed:', orderError.code || 'unknown')
      return errorResponse('ไม่สามารถโหลดข้อมูลการชำระเงินได้ กรุณาลองใหม่ภายหลัง', 503)
    }

    if (!order) return errorResponse('ไม่พบคำสั่งซื้อ', 404)
    if (order.status !== 'pending' || order.payment_provider !== MANUAL_PAYMENT_PROVIDER) {
      return errorResponse('คำสั่งซื้อนี้ไม่อยู่ระหว่างรอชำระเงิน PromptPay', 409)
    }

    let amount
    try {
      amount = normalizeOrderAmount(order.amount)
    } catch (error) {
      if (!(error instanceof InvalidPaymentAmountError)) {
        console.error('[PAYMENT] manual payment amount validation failed:', error instanceof Error ? error.message : 'unknown error')
      }
      return errorResponse('ไม่สามารถโหลดข้อมูลการชำระเงินได้ กรุณาติดต่อผู้ดูแลระบบ', 422)
    }

    let paymentSettings
    try {
      paymentSettings = toPaymentSettingsQrView(await readPaymentSettings(createAdminClient()))
    } catch (settingsError) {
      console.error('[PAYMENT] manual payment details settings lookup failed:', settingsError instanceof Error ? settingsError.message : 'unknown error')
      return errorResponse(PAYMENT_SETTINGS_UNAVAILABLE_ERROR, 503)
    }

    if (!paymentSettings) return errorResponse(PAYMENT_SETTINGS_UNAVAILABLE_ERROR, 503)

    // This response intentionally contains only safe display fields. The
    // recipient identifier remains server-only and is used by the PNG route.
    return NextResponse.json({
      success: true,
      amount,
      displayName: paymentSettings.displayName,
      instructionText: paymentSettings.instructionText,
    }, { headers: privateHeaders })
  } catch (error) {
    console.error('[PAYMENT] manual payment details route failed:', error instanceof Error ? error.message : 'unknown error')
    return errorResponse('ไม่สามารถโหลดข้อมูลการชำระเงินได้ กรุณาลองใหม่ภายหลัง', 500)
  }
}
