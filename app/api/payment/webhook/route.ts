import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('x-omise-webhook-signature') ?? ''

  // ตรวจสอบ webhook signature
  const webhookKey = process.env.OMISE_WEBHOOK_KEY
  if (webhookKey) {
    const hmac = crypto
      .createHmac('sha256', webhookKey)
      .update(body)
      .digest('hex')
    if (hmac !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const event = JSON.parse(body)

  // จัดการเฉพาะ charge.complete event
  if (event.key !== 'charge.complete') {
    return NextResponse.json({ received: true })
  }

  const charge = event.data
  if (!charge.paid) {
    return NextResponse.json({ received: true })
  }

  const { package_id, user_id } = charge.metadata ?? {}
  if (!package_id || !user_id) {
    console.error('Missing metadata in charge:', charge.id)
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // อัพเดต order status (กรณีที่ก่อนหน้านี้ insert เป็น pending)
  // แต่จริงๆ ใน create/route.ts เราไม่ได้เซฟ charge_id ไว้
  // ดังนั้นให้เราถือโอกาส ตรวจสอบว่ามี order อยู่แล้วหรือยัง (ถ้าไม่มีก็สร้างเลย)
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user_id)
    .eq('package_id', package_id)
    .eq('status', 'completed')
    .maybeSingle()

  if (!existingOrder) {
    // ถ้ายังไม่มี Order ที่ complete ให้ update หรือ insert ก็ได้
    // สำหรับความเรียบง่ายเนื่องจาก schema order ปัจจุบันไม่เก็บ omise_charge_id (จาก 004_admin_completion.sql)
    // เราเลยอัพเดตอันที่เป็น pending อันล่าสุดของ user นี้ + package นี้
    const { data: pendingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user_id)
      .eq('package_id', package_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendingOrder) {
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', pendingOrder.id)
    } else {
      // Fallback: create a new order just in case it wasn't saved
      // But we don't have the amount, so we just query package
      const { data: pkg } = await supabase
         .from('packages')
         .select('current_price')
         .eq('id', package_id)
         .single()

      await supabase.from('orders').insert({
        user_id,
        package_id,
        amount: pkg?.current_price || 0,
        payment_provider: 'omise',
        status: 'completed'
      })
    }

    console.log(`Access granted: user=${user_id} package=${package_id}`)
  }

  return NextResponse.json({ received: true })
}
