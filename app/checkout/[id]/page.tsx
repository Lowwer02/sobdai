import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import { MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import { getHomepageSettings } from '@/lib/homepageConfig'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPaymentSettings, toPaymentSettingsQrView } from '@/lib/payment/payment-settings'
import { normalizeCustomerVerificationStatus, type CustomerVerificationStatus } from '@/lib/payment/customer'
import CheckoutClient, { type ManualPaymentOrder } from './CheckoutClient'
import Link from 'next/link'
import { createPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: pkg } = await supabase
    .from('packages')
    .select('name')
    .eq('id', id)
    .single()

  if (!pkg) {
    return createPageMetadata({
      title: 'Not Found | Sobdai',
      path: `/checkout/${id}`,
      noindex: true,
    })
  }

  return createPageMetadata({
    title: `สั่งซื้อ: ${pkg.name} | Sobdai`,
    description: `ดำเนินการสั่งซื้อแพ็กเกจ ${pkg.name}`,
    path: `/checkout/${id}`,
    noindex: true,
  })
}

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-card p-8 text-center shadow-sm">
          <h2 className="mb-3 text-xl font-bold text-foreground">เข้าสู่ระบบก่อนสั่งซื้อ</h2>
          <p className="mb-6 text-sm text-muted-foreground">กรุณาเข้าสู่ระบบด้วยบัญชีของคุณเพื่อดำเนินการสั่งซื้อและรับสิทธิ์เข้าถึงเนื้อหา</p>
          <Link href={`/login?redirect=/checkout/${id}`} className="block w-full rounded-xl bg-brand-solid py-3 font-bold text-brand-foreground transition-colors hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  // Fetch package details and read-only display configuration in parallel.
  const [pkgResult, homepageSettings, manualPaymentEnabled] = await Promise.all([
    supabase
      .from('packages')
      .select(`
        id,
        name,
        slug,
        current_price,
        original_price,
        is_published,
        cover_image_url,
        logo_url,
        positions(name),
        organizations(name, logo_url)
      `)
      .eq('id', id)
      .single(),
    getHomepageSettings(),
    (async () => {
      try {
        return Boolean(toPaymentSettingsQrView(await readPaymentSettings(createAdminClient())))
      } catch (settingsError) {
        console.error('[PAYMENT] checkout payment settings lookup failed:', settingsError instanceof Error ? settingsError.message : 'unknown')
        return false
      }
    })(),
  ])

  const pkg = pkgResult.data
  const error = pkgResult.error

  if (error || !pkg) return notFound()

  if (!pkg.is_published) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-card p-8 text-center shadow-sm">
          <h2 className="mb-3 text-xl font-bold text-foreground">แพ็กเกจยังไม่เปิดขาย</h2>
          <p className="mb-6 text-sm text-muted-foreground">แพ็กเกจนี้กำลังอยู่ในระหว่างการจัดทำ หรือปิดการขายชั่วคราว กรุณากลับมาตรวจสอบอีกครั้งในภายหลัง</p>
          <Link href="/" className="block w-full rounded-xl bg-brand-solid py-3 font-bold text-brand-foreground transition-colors hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    )
  }

  // Prevent duplicate purchase
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('package_id', id)
    .in('status', ORDER_COMPLETED_STATUSES)
    .maybeSingle()

  if (existingOrder) {
    redirect(`/package/${pkg.slug}`)
  }

  let manualOrder: ManualPaymentOrder | null = null

  const { data: pendingManualOrder } = await supabase
    .from('orders')
    .select('id, amount, status, payment_provider')
    .eq('user_id', user.id)
    .eq('package_id', id)
    .eq('status', 'pending')
    .eq('payment_provider', MANUAL_PAYMENT_PROVIDER)
    .maybeSingle()

  if (pendingManualOrder) {
    const { data: latestSubmission, count: submissionCount, error: submissionError } = await supabase
      .from('payment_submissions')
      .select('id, status, created_at', { count: 'exact' })
      .eq('order_id', pendingManualOrder.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let customerVerificationStatus: CustomerVerificationStatus | null = null
    if (!submissionError && latestSubmission?.status === 'submitted' && latestSubmission.id) {
      const { data: customerStatus, error: customerStatusError } = await supabase.rpc(
        'get_payment_verification_customer_status',
        { p_submission_id: latestSubmission.id },
      )
      if (customerStatusError) {
        console.error('[PAYMENT] checkout customer verification status lookup failed:', customerStatusError.code || 'unknown')
      } else {
        const statusValue = Array.isArray(customerStatus)
          ? customerStatus[0]?.status
          : (customerStatus as any)?.status
        customerVerificationStatus = normalizeCustomerVerificationStatus(statusValue)
      }
    }

    manualOrder = {
      id: pendingManualOrder.id,
      amount: Number(pendingManualOrder.amount),
      status: 'pending',
      submissionStatus: submissionError
        ? null
        : (latestSubmission?.status as ManualPaymentOrder['submissionStatus']) || null,
      customerVerificationStatus,
      submissionCount: submissionError ? null : submissionCount || 0,
      paymentEvidenceAvailable: !submissionError,
      paymentSettingsAvailable: manualPaymentEnabled,
    }
  }

  return (
    <CheckoutClient
      pkg={pkg}
      userEmail={user.email || ''}
      supportConfig={homepageSettings.support}
      initialManualOrder={manualOrder}
      manualPaymentEnabled={manualPaymentEnabled}
    />
  )
}
