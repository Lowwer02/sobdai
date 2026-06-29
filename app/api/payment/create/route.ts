import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ORDER_COMPLETED_STATUSES, ORDER_STATUS } from '@/lib/orderUtils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
    }

    const { packageId, token } = await request.json()

    if (!packageId) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน (packageId)' }, { status: 400 })
    }

    // ดึงราคา package จาก DB
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('id, name, current_price, is_published')
      .eq('id', packageId)
      .single()

    if (pkgError || !pkg || !pkg.is_published) {
      return NextResponse.json({ error: 'ไม่พบแพ็กเกจ หรือแพ็กเกจยังไม่เปิดขาย' }, { status: 404 })
    }

    // ตรวจสอบว่าซื้อไปแล้วหรือยัง
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('package_id', packageId)
      .in('status', ORDER_COMPLETED_STATUSES)
      .maybeSingle()

    if (existingOrder) {
      return NextResponse.json({ error: 'คุณมีสิทธิ์เข้าถึงแพ็กเกจนี้แล้ว' }, { status: 409 })
    }

    // จัดการแพ็กเกจฟรี
    if (pkg.current_price === 0) {
      const adminSupabase = await createAdminClient()
      const { data: order, error: orderError } = await adminSupabase
        .from('orders')
        .insert({
          user_id: user.id,
          package_id: packageId,
          amount: 0,
          payment_provider: 'free',
          status: ORDER_STATUS.FREE,
        })
        .select()
        .single()
        
      if (orderError) {
        console.error('Insert order error (free):', {
          code: orderError.code,
          message: orderError.message,
          details: orderError.details,
          hint: orderError.hint
        })
        return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการสร้างคำสั่งซื้อ: ' + orderError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'รับแพ็กเกจฟรีสำเร็จ!',
      })
    }

    if (!token) {
      return NextResponse.json({ error: 'ข้อมูลการชำระเงินไม่ครบถ้วน' }, { status: 400 })
    }

    // เรียก Omise API
    const omiseSecretKey = process.env.OMISE_SECRET_KEY!
    const amountSatang = pkg.current_price * 100 // Omise ใช้สตางค์

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
        description: `สอบได้ — ${pkg.name}`,
        metadata: {
          package_id: packageId,
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

    // บันทึก order ทันทีที่ API ชำระเงินสร้าง charge
    // ถึงแม้สถานะอาจจะเป็น pending หรือ paid ก็บันทึก
    const adminSupabase = await createAdminClient()
    const { data: order, error: orderError } = await adminSupabase
      .from('orders')
      .insert({
        user_id: user.id,
        package_id: packageId,
        amount: pkg.current_price,
        payment_provider: 'omise',
        status: charge.paid ? ORDER_STATUS.PAID : ORDER_STATUS.PENDING,
      })
      .select()
      .single()
      
    if (orderError) {
       console.error('Insert order error (paid):', {
         code: orderError.code,
         message: orderError.message,
         details: orderError.details,
         hint: orderError.hint
       })
       // ไม่ throw error ให้ชำระเงินพัง แต่บันทึก log ไว้
    }

    // ถ้าชำระสำเร็จ ก็ถือว่าจบกระบวนการ
    if (charge.paid && order) {
      return NextResponse.json({
        success: true,
        message: 'ชำระเงินสำเร็จ!',
      })
    }

    return NextResponse.json({
      success: false,
      status: charge.status,
      charge_id: charge.id,
    })
  } catch (err: any) {
    console.error('Payment error caught in catch block:', err)
    return NextResponse.json({ success: false, error: 'Backend Crash: ' + (err.message || err.toString()) }, { status: 500 })
  }
}
