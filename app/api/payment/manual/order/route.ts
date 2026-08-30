import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/payment/manual'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const packageId = body?.packageId

    if (!isUuid(packageId)) {
      return NextResponse.json({ error: 'ข้อมูลแพ็กเกจไม่ถูกต้อง' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('create_manual_payment_order', {
      p_package_id: packageId,
    })

    if (error) {
      console.error('[PAYMENT] create manual order failed:', error.message)
      const alreadyHasAccess = error.code === '23505' && error.message.includes('package access')
      return NextResponse.json(
        { error: alreadyHasAccess ? 'คุณมีสิทธิ์เข้าถึงแพ็กเกจนี้แล้ว' : 'ไม่สามารถสร้างคำสั่งซื้อ PromptPay ได้' },
        { status: alreadyHasAccess ? 409 : 400 },
      )
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row?.order_id || row.status !== 'pending') {
      return NextResponse.json({ error: 'ไม่สามารถสร้างคำสั่งซื้อ PromptPay ได้' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      orderId: row.order_id,
      amount: Number(row.amount),
      status: row.status,
    })
  } catch (error) {
    console.error('[PAYMENT] create manual order route failed:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
