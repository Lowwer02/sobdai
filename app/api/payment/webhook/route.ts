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

  const { exam_id, user_id } = charge.metadata ?? {}
  if (!exam_id || !user_id) {
    console.error('Missing metadata in charge:', charge.id)
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // อัพเดต order status
  await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('omise_charge_id', charge.id)

  // ตรวจสอบว่ามี access_token แล้วหรือยัง
  const { data: existing } = await supabase
    .from('access_tokens')
    .select('id')
    .eq('user_id', user_id)
    .eq('exam_id', exam_id)
    .single()

  if (!existing) {
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('omise_charge_id', charge.id)
      .single()

    await supabase.from('access_tokens').insert({
      user_id,
      exam_id,
      order_id: order?.id,
      expires_at: expiresAt.toISOString(),
    })

    console.log(`Access granted: user=${user_id} exam=${exam_id} expires=${expiresAt.toISOString()}`)
  }

  return NextResponse.json({ received: true })
}
