import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/payment/manual'

export const runtime = 'nodejs'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'การแจ้งเตือนไม่ถูกต้อง' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
    }

    // RLS is the authoritative ownership boundary; the explicit user_id
    // predicate is defense-in-depth and keeps this mutation self-documenting.
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('read_at', null)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[NOTIFICATIONS] mark-read mutation failed:', error.message)
      return NextResponse.json({ error: 'ไม่สามารถอัปเดตการแจ้งเตือนได้' }, { status: 500 })
    }

    // Treat an already-read row, a missing row, and another user's row as an
    // idempotent no-op. This avoids leaking notification ownership through the
    // response while preserving a simple client mutation contract.
    return NextResponse.json({ success: true, changed: Boolean(data) })
  } catch (error) {
    console.error('[NOTIFICATIONS] mark-read route failed:', error)
    return NextResponse.json({ error: 'ไม่สามารถอัปเดตการแจ้งเตือนได้' }, { status: 500 })
  }
}
