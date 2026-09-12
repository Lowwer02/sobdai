import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyOrdersClient from './MyOrdersClient'
import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/seo'
import type { PaymentSubmissionStatus } from '@/lib/payment/manual'

export const metadata: Metadata = createPageMetadata({
  title: 'ประวัติการสั่งซื้อ | Sobdai',
  description: 'ดูประวัติการซื้อแพ็กเกจทั้งหมดของคุณ',
  path: '/orders',
  noindex: true,
})

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

  const orderRows = orders || []
  const orderIds = orderRows.map((order: any) => order.id)
  let paymentRows: any[] = []
  let paymentEvidenceAvailable = true

  if (orderIds.length > 0) {
    const paymentResult = await supabase
      .from('payment_submissions')
      .select('order_id, status, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
    paymentRows = paymentResult.data || []
    paymentEvidenceAvailable = !paymentResult.error
  }

  const paymentStateByOrder = new Map<string, { count: number; latestStatus: PaymentSubmissionStatus | null }>()
  for (const payment of paymentRows || []) {
    const current = paymentStateByOrder.get(payment.order_id)
    paymentStateByOrder.set(payment.order_id, {
      count: (current?.count || 0) + 1,
      latestStatus: current?.latestStatus || (payment.status as PaymentSubmissionStatus),
    })
  }

  return (
    <MyOrdersClient
      orders={orderRows.map((order: any) => {
        const paymentState = paymentStateByOrder.get(order.id)
        return {
          ...order,
          payment_submission_count: paymentEvidenceAvailable ? paymentState?.count || 0 : null,
          latest_payment_submission_status: paymentEvidenceAvailable ? paymentState?.latestStatus || null : null,
          payment_evidence_available: paymentEvidenceAvailable,
        }
      }) as any}
    />
  )
}
