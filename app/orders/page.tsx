import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyOrdersClient from './MyOrdersClient'
import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/seo'
import type { PaymentSubmissionStatus } from '@/lib/payment/manual'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPaymentSettings, toPaymentSettingsQrView } from '@/lib/payment/payment-settings'
import { normalizeCustomerVerificationStatus, type CustomerVerificationStatus } from '@/lib/payment/customer'

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

  const { data: orders, error: ordersError } = await supabase
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

  if (ordersError) {
    console.error('[PAYMENT] customer orders query failed:', ordersError.code || 'unknown')
  }

  const orderRows = ordersError ? [] : orders || []
  const orderIds = orderRows.map((order: any) => order.id)
  let paymentRows: any[] = []
  let paymentEvidenceAvailable = true

  if (orderIds.length > 0) {
    const paymentResult = await supabase
      .from('payment_submissions')
      .select('id, order_id, status, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
    paymentRows = paymentResult.data || []
    paymentEvidenceAvailable = !paymentResult.error
  }

  const paymentStateByOrder = new Map<string, {
    count: number
    latestStatus: PaymentSubmissionStatus | null
    latestSubmissionId: string | null
    latestSubmittedAt: string | null
  }>()
  for (const payment of paymentRows || []) {
    const current = paymentStateByOrder.get(payment.order_id)
    paymentStateByOrder.set(payment.order_id, {
      count: (current?.count || 0) + 1,
      latestStatus: current?.latestStatus || (payment.status as PaymentSubmissionStatus),
      latestSubmissionId: current?.latestSubmissionId || payment.id || null,
      latestSubmittedAt: current?.latestSubmittedAt || payment.created_at || null,
    })
  }

  let paymentSettingsAvailable: boolean | null = null
  const hasPendingManualOrder = orderRows.some((order: any) => (
    order.status === 'pending' && order.payment_provider === 'promptpay_manual'
  ))
  if (hasPendingManualOrder) {
    try {
      paymentSettingsAvailable = Boolean(
        toPaymentSettingsQrView(await readPaymentSettings(createAdminClient())),
      )
    } catch (error) {
      console.error('[PAYMENT] customer order payment settings lookup failed:', error instanceof Error ? error.message : 'unknown')
      paymentSettingsAvailable = false
    }
  }

  const verificationStatusByOrder = new Map<string, CustomerVerificationStatus | null>()
  if (paymentEvidenceAvailable) {
    const verificationEntries = await Promise.all(
      Array.from(paymentStateByOrder.entries()).map(async ([orderId, paymentState]) => {
        if (paymentState.latestStatus !== 'submitted' || !paymentState.latestSubmissionId) {
          return [orderId, null] as const
        }

        const { data, error } = await supabase.rpc('get_payment_verification_customer_status', {
          p_submission_id: paymentState.latestSubmissionId,
        })
        if (error) {
          console.error('[PAYMENT] customer verification status lookup failed:', error.code || 'unknown')
          return [orderId, null] as const
        }

        const statusValue = Array.isArray(data) ? data[0]?.status : (data as any)?.status
        return [orderId, normalizeCustomerVerificationStatus(statusValue)] as const
      }),
    )

    for (const [orderId, status] of verificationEntries) {
      verificationStatusByOrder.set(orderId, status)
    }
  }

  return (
    <MyOrdersClient
      orders={orderRows.map((order: any) => {
        const paymentState = paymentStateByOrder.get(order.id)
        const isPendingManualOrder = order.status === 'pending' && order.payment_provider === 'promptpay_manual'
        return {
          id: order.id,
          package_id: order.package_id,
          amount: order.amount,
          status: order.status,
          created_at: order.created_at,
          packages: order.packages,
          is_manual_payment: order.payment_provider === 'promptpay_manual',
          payment_submission_count: paymentEvidenceAvailable ? paymentState?.count || 0 : null,
          latest_payment_submission_status: paymentEvidenceAvailable ? paymentState?.latestStatus || null : null,
          latest_payment_submission_created_at: paymentEvidenceAvailable ? paymentState?.latestSubmittedAt || null : null,
          customer_verification_status: isPendingManualOrder
            ? verificationStatusByOrder.get(order.id) || null
            : null,
          payment_settings_available: isPendingManualOrder ? paymentSettingsAvailable : null,
          payment_evidence_available: paymentEvidenceAvailable,
        }
      }) as any}
      ordersLoadError={Boolean(ordersError)}
    />
  )
}
