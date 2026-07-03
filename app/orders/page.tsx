import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyOrdersClient from './MyOrdersClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'คำสั่งซื้อของฉัน | Sobdai',
  description: 'ดูประวัติการซื้อแพ็กเกจทั้งหมดของคุณ',
}

export default async function MyOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/orders')
  }

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      package_id,
      amount,
      status,
      payment_provider,
      created_at,
      packages (
        name,
        slug,
        package_code,
        logo_url,
        is_published,
        organizations ( name, logo_url )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return <MyOrdersClient orders={(orders || []) as any} />
}
