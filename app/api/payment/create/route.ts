import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
    }

    const { examId, token } = await request.json()

    if (!examId || !token) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
    }

    // ดึงราคา exam จาก DB
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('id, title, price, is_active')
      .eq('id', examId)
      .single()

    if (examError || !exam || !exam.is_active) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อสอบ' }, { status: 404 })
    }

    // ตรวจสอบว่าซื้อแล้วหรือยัง
    const now = new Date().toISOString()
    const { data: existingToken } = await supabase
      .from('access_tokens')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('exam_id', examId)
      .gt('expires_at', now)
      .single()

    if (existingToken) {
      return NextResponse.json({ error: 'คุณมีสิทธิ์เข้าถึงชุดข้อสอบนี้แล้ว' }, { status: 409 })
    }

    // เรียก Omise API
    const omiseSecretKey = process.env.OMISE_SECRET_KEY!
    const amountSatang = exam.price * 100 // Omise ใช้สตางค์

    const chargeRes = await fetch('https://api.omise.co/charges', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(omiseSecretKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountSatang,
        currency: 'thb',
        card: token,
        description: `สอบได้ — ${exam.title}`,
        metadata: {
          exam_id: examId,
          user_id: user.id,
          user_email: user.email,
        },
      }),
    })

    const charge = await chargeRes.json()

    if (!chargeRes.ok || charge.failure_code) {
      const msg = charge.failure_message || 'การชำระเงินไม่สำเร็จ'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // บันทึก order
    const { data: order } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        exam_id: examId,
        amount: exam.price,
        status: charge.paid ? 'paid' : 'pending',
        omise_charge_id: charge.id,
        paid_at: charge.paid ? new Date().toISOString() : null,
      })
      .select()
      .single()

    // ถ้าชำระสำเร็จ สร้าง access_token ทันที
    if (charge.paid && order) {
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      await supabase.from('access_tokens').insert({
        user_id: user.id,
        exam_id: examId,
        order_id: order.id,
        expires_at: expiresAt.toISOString(),
      })

      return NextResponse.json({
        success: true,
        message: 'ชำระเงินสำเร็จ!',
        redirect: `/quiz/${examId}`,
      })
    }

    return NextResponse.json({
      success: false,
      status: charge.status,
      charge_id: charge.id,
    })
  } catch (err) {
    console.error('Payment error:', err)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
