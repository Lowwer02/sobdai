import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import PaymentStatusIllustration from '@/components/payment/PaymentStatusIllustration'
import {
  getCustomerPaymentPresentation,
  normalizeCustomerVerificationStatus,
  type CustomerVerificationStatus,
} from '@/lib/payment/customer'
import {
  isUuid,
  MANUAL_PAYMENT_PROVIDER,
  type PaymentSubmissionStatus,
} from '@/lib/payment/manual'
import { createPageMetadata } from '@/lib/seo'
import { readPaymentSettings, toPaymentSettingsQrView } from '@/lib/payment/payment-settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = createPageMetadata({
  title: 'รายละเอียดคำสั่งซื้อ | Sobdai',
  description: 'ดูสถานะการชำระเงินและการเข้าใช้งานแพ็กเกจของคุณ',
  path: '/orders',
  noindex: true,
})

function relationObject<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatAmount(value: number) {
  return value === 0 ? 'ฟรี' : `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function paymentMethodLabel(provider: string | null) {
  if (provider === MANUAL_PAYMENT_PROVIDER) return 'PromptPay'
  if (provider === 'free') return 'แพ็กเกจฟรี'
  return 'ชำระเงินออนไลน์'
}

function getBadgeClasses(state: ReturnType<typeof getCustomerPaymentPresentation>['state']) {
  if (state === 'paid' || state === 'free') return 'border-success-border bg-success-bg text-success'
  if (state === 'rejected' || state === 'failed' || state === 'payment_disabled') {
    return 'border-destructive-border bg-destructive-bg text-destructive'
  }
  if (state === 'cancelled' || state === 'refunded') return 'border-border-subtle bg-muted text-muted-foreground'
  return 'border-warning-border bg-warning-bg text-warning'
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/orders/${id}`)}`)
  }

  const { data: rawOrder, error: orderError } = await supabase
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
        is_published,
        organizations ( name )
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (orderError || !rawOrder) notFound()

  const order = rawOrder as any
  const pkg = relationObject(order.packages)
  const organization = relationObject(pkg?.organizations)

  const { data: rawSubmissions, error: submissionsError } = await supabase
    .from('payment_submissions')
    .select('id, status, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })

  const submissions = rawSubmissions || []
  const latestSubmission = submissions[0] as {
    id?: string
    status?: PaymentSubmissionStatus
    created_at?: string
  } | undefined

  let customerVerificationStatus: CustomerVerificationStatus | null = null
  if (!submissionsError && latestSubmission?.status === 'submitted' && latestSubmission.id) {
    const { data, error } = await supabase.rpc('get_payment_verification_customer_status', {
      p_submission_id: latestSubmission.id,
    })

    if (!error) {
      const statusValue = Array.isArray(data) ? data[0]?.status : (data as any)?.status
      customerVerificationStatus = normalizeCustomerVerificationStatus(statusValue)
    } else {
      console.error('[PAYMENT] customer order detail verification lookup failed:', error.code || 'unknown')
    }
  }

  let paymentSettingsAvailable: boolean | null = null
  if (order.status === 'pending' && order.payment_provider === MANUAL_PAYMENT_PROVIDER) {
    try {
      paymentSettingsAvailable = Boolean(
        toPaymentSettingsQrView(await readPaymentSettings(createAdminClient())),
      )
    } catch (error) {
      console.error('[PAYMENT] customer order detail payment settings lookup failed:', error instanceof Error ? error.message : 'unknown')
      paymentSettingsAvailable = false
    }
  }

  const presentation = getCustomerPaymentPresentation({
    orderStatus: order.status,
    paymentProvider: order.payment_provider,
    submissionCount: submissionsError ? null : submissions.length,
    latestSubmissionStatus: submissionsError ? null : latestSubmission?.status || null,
    verificationStatus: customerVerificationStatus,
    paymentSettingsAvailable,
    evidenceReadAvailable: !submissionsError,
  })

  const packageAvailable = Boolean(pkg?.is_published && pkg?.slug)
  const packageName = pkg?.name || 'แพ็กเกจที่ถูกลบ'
  const packageHref = packageAvailable ? `/package/${pkg.slug}` : null
  const checkoutHref = pkg?.is_published ? `/checkout/${order.package_id}` : null
  const actionHref = presentation.action === 'access'
    ? packageHref
    : presentation.action === 'resubmit' && presentation.canResubmit
      ? checkoutHref
      : presentation.action === 'new_order'
        ? checkoutHref
        : null
  const actionLabel = presentation.action === 'access'
    ? 'เข้าใช้งานแพ็กเกจ'
    : presentation.action === 'new_order'
      ? 'สั่งซื้อแพ็กเกจอีกครั้ง'
      : presentation.state === 'rejected'
        ? 'ส่งหลักฐานใหม่'
        : 'ไปอัปโหลดหลักฐาน'

  return (
    <main className="min-h-screen bg-background pb-20 font-sans text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <Link
          href="/orders"
          className="mb-8 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"
        >
          ← ประวัติการสั่งซื้อ
        </Link>

        <header className="mb-6 rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">รายละเอียดคำสั่งซื้อ</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{packageName}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                หมายเลขอ้างอิง #{order.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <span
              className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${getBadgeClasses(presentation.state)}`}
              aria-label={`สถานะ ${presentation.compactLabel}`}
            >
              {presentation.compactLabel}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-border-subtle pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">วันที่สั่งซื้อ</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">{formatDate(order.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">ยอดคำสั่งซื้อ</dt>
              <dd className="mt-1 text-sm font-semibold text-brand">{formatAmount(Number(order.amount))}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">ช่องทางชำระเงิน</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">{paymentMethodLabel(order.payment_provider)}</dd>
            </div>
          </dl>
        </header>

        <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-8">
          <PaymentStatusIllustration
            state={presentation.state}
            title={presentation.title}
            description={presentation.description}
          />

          {latestSubmission?.created_at && presentation.state !== 'awaiting_upload' && presentation.state !== 'payment_disabled' && (
            <p className="mt-5 text-center text-xs text-muted-foreground">
              ส่งหลักฐานล่าสุดเมื่อ {formatDate(latestSubmission.created_at)}
            </p>
          )}

          <div className="mt-7 flex flex-col items-center gap-3">
            {actionHref && (
              <Link
                href={actionHref}
                className="inline-flex w-full max-w-sm items-center justify-center rounded-xl bg-brand-solid px-5 py-3.5 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30"
              >
                {actionLabel}
              </Link>
            )}

            {presentation.state === 'rejected' && !presentation.canResubmit && (
              <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                {paymentSettingsAvailable === false
                  ? 'ขณะนี้ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณากลับมาลองใหม่ภายหลัง'
                  : 'ส่งหลักฐานถึงจำนวนสูงสุดแล้ว กรุณาติดต่อฝ่ายสนับสนุนเพื่อขอความช่วยเหลือ'}
              </p>
            )}

            {presentation.state === 'cancelled' && (
              <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                คำสั่งซื้อที่ยกเลิกแล้วจะไม่เปิดสิทธิ์แพ็กเกจและไม่สามารถส่งหลักฐานเพิ่มได้
              </p>
            )}

            {presentation.state === 'payment_disabled' && (
              <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                ระบบปิดรับชำระเงินชั่วคราว จึงยังไม่สามารถแสดงขั้นตอนการอัปโหลดหลักฐานได้
              </p>
            )}

            {!pkg?.is_published && presentation.action !== 'access' && presentation.state !== 'cancelled' && (
              <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                แพ็กเกจนี้ไม่พร้อมให้สั่งซื้อหรือเข้าใช้งานในขณะนี้
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-7">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">ข้อมูลแพ็กเกจ</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{packageName}</p>
              {organization?.name && <p className="mt-1 text-sm text-muted-foreground">{organization.name}</p>}
              {pkg?.package_code && <p className="mt-1 text-xs text-muted-foreground">รหัสแพ็กเกจ {pkg.package_code}</p>}
            </div>
            {packageHref && (
              <Link
                href={packageHref}
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-bold text-foreground transition-colors hover:border-brand/40 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                ดูแพ็กเกจ
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
