'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ChevronLeft,
  ExternalLink,
  Package,
  Search,
} from 'lucide-react'
import PaymentStatusIllustration from '@/components/payment/PaymentStatusIllustration'
import {
  getCustomerPaymentPresentation,
  type CustomerVerificationStatus,
} from '@/lib/payment/customer'
import {
  MANUAL_PAYMENT_PROVIDER,
  getPaymentStatusPresentation,
  type PaymentSubmissionStatus,
} from '@/lib/payment/manual'

interface Order {
  id: string
  package_id: string
  amount: number
  status: string
  is_manual_payment: boolean
  created_at: string
  packages: {
    name: string
    slug: string
    package_code: string
    logo_url: string | null
    is_published: boolean
    organizations: {
      name: string
      logo_url: string | null
    } | null
  } | null
  payment_submission_count?: number | null
  latest_payment_submission_status?: PaymentSubmissionStatus | null
  latest_payment_submission_created_at?: string | null
  customer_verification_status?: CustomerVerificationStatus | null
  payment_settings_available?: boolean | null
  payment_evidence_available?: boolean
}

interface OrdersClientProps {
  orders: Order[]
  ordersLoadError?: boolean
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'waiting', label: 'กำลังดำเนินการ' },
  { value: 'resubmit', label: 'ต้องส่งหลักฐานใหม่' },
  { value: 'paid', label: 'ใช้งานได้' },
  { value: 'cancelled', label: 'ยกเลิกแล้ว' },
]

function getBadgeClasses(state: ReturnType<typeof getCustomerPaymentPresentation>['state']) {
  if (state === 'paid' || state === 'free') return 'border-success-border bg-success-bg text-success'
  if (state === 'rejected' || state === 'failed') return 'border-destructive-border bg-destructive-bg text-destructive'
  if (state === 'cancelled' || state === 'refunded') return 'border-border-subtle bg-muted text-muted-foreground'
  if (state === 'payment_disabled') return 'border-destructive-border bg-destructive-bg text-destructive'
  return 'border-warning-border bg-warning-bg text-warning'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function MyOrdersClient({ orders, ordersLoadError = false }: OrdersClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const orderPresentations = useMemo(() => new Map(
    orders.map((order) => [
      order.id,
      (() => {
        const evidenceReadAvailable = order.payment_evidence_available === true
        const legacyEvidencePresentation = getPaymentStatusPresentation({
          orderStatus: order.status,
          paymentProvider: order.is_manual_payment ? MANUAL_PAYMENT_PROVIDER : null,
          submissionCount: order.payment_submission_count,
          latestSubmissionStatus: order.latest_payment_submission_status,
          evidenceReadAvailable,
        })

        // Keep the M1.3A fail-closed evidence contract as an input guard. The
        // customer-safe state and all visible copy come from the centralized
        // M1.3B mapping; legacy internal labels never reach this UI.
        return getCustomerPaymentPresentation({
          orderStatus: order.status,
          paymentProvider: order.is_manual_payment ? MANUAL_PAYMENT_PROVIDER : null,
          submissionCount: order.payment_submission_count,
          latestSubmissionStatus: order.latest_payment_submission_status,
          verificationStatus: order.customer_verification_status,
          paymentSettingsAvailable: order.payment_settings_available,
          evidenceReadAvailable: evidenceReadAvailable && legacyEvidencePresentation.key !== 'evidence-unavailable',
        })
      })(),
    ]),
  ), [orders])

  const filteredOrders = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    return orders.filter((order) => {
      const packageName = order.packages?.name?.toLowerCase() || ''
      const packageCode = order.packages?.package_code?.toLowerCase() || ''
      if (query && !packageName.includes(query) && !packageCode.includes(query)) return false

      const presentation = orderPresentations.get(order.id)
      if (!presentation || activeFilter === 'all') return true
      if (activeFilter === 'waiting') {
        return ['awaiting_upload', 'auto_checking', 'under_review', 'pending', 'payment_disabled'].includes(presentation.state)
      }
      if (activeFilter === 'resubmit') return presentation.state === 'rejected'
      if (activeFilter === 'paid') return presentation.state === 'paid' || presentation.state === 'free'
      if (activeFilter === 'cancelled') return presentation.state === 'cancelled'
      return true
    })
  }, [activeFilter, orderPresentations, orders, searchQuery])

  const getLogoUrl = (order: Order) => order.packages?.logo_url || order.packages?.organizations?.logo_url || null
  const isFiltering = Boolean(searchQuery.trim()) || activeFilter !== 'all'

  return (
    <div className="min-h-screen bg-background pb-20 font-sans text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <ChevronLeft size={16} />
          หน้าแรก
        </Link>

        <header className="mb-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-brand">Sobdai payment</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">ประวัติการสั่งซื้อ</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            ติดตามสถานะการชำระเงินและการเข้าใช้งานแพ็กเกจของคุณ
          </p>
        </header>

        {ordersLoadError ? (
          <div
            className="rounded-2xl border border-destructive-border bg-destructive-bg p-8 text-center shadow-sm"
            role="alert"
          >
            <h2 className="text-lg font-bold text-foreground">โหลดรายการคำสั่งซื้อไม่สำเร็จ</h2>
            <p className="mt-2 text-sm text-muted-foreground">กรุณาลองใหม่อีกครั้ง</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-solid px-5 py-3 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30"
            >
              ลองใหม่
            </button>
          </div>
        ) : (
          <>
        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="ค้นหาชื่อแพ็กเกจ หรือรหัสแพ็กเกจ..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-border-subtle bg-input py-3 pl-12 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
              aria-label="ค้นหาประวัติการสั่งซื้อ"
            />
          </div>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="กรองตามสถานะการสั่งซื้อ">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={activeFilter === option.value}
                onClick={() => setActiveFilter(option.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                  activeFilter === option.value
                    ? 'border-brand/40 bg-wash text-brand'
                    : 'border-border-subtle bg-card text-muted-foreground hover:border-brand/30 hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 text-xs font-medium text-muted-foreground">
          แสดง {filteredOrders.length} จาก {orders.length} รายการ
        </div>

        {filteredOrders.length > 0 ? (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const presentation = orderPresentations.get(order.id)!
              const logoUrl = getLogoUrl(order)
              const packageAvailable = order.packages?.is_published !== false && Boolean(order.packages?.slug)
              const isManualPending = order.status === 'pending' && order.is_manual_payment
              const showResubmit = presentation.action === 'resubmit' && presentation.canResubmit && packageAvailable
              const showAccess = presentation.action === 'access' && packageAvailable
              const showNewOrder = presentation.action === 'new_order' && packageAvailable

              return (
                <article
                  key={order.id}
                  className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm transition-colors hover:border-brand/30 md:p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface p-2 md:h-16 md:w-16">
                      {logoUrl ? (
                        <Image
                          src={logoUrl}
                          alt={order.packages?.name ? `โลโก้ ${order.packages.name}` : 'โลโก้แพ็กเกจ'}
                          width={64}
                          height={64}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Package size={24} className="text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-bold leading-snug text-foreground">
                            {order.packages?.name || 'แพ็กเกจที่ถูกลบ'}
                          </h2>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.packages?.organizations?.name || ''}
                            {order.packages?.package_code ? ` · ${order.packages.package_code}` : ''}
                          </p>
                        </div>
                        <span
                          className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${getBadgeClasses(presentation.state)}`}
                          aria-label={`สถานะ ${presentation.compactLabel}`}
                        >
                          {presentation.compactLabel}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>สั่งซื้อ {formatDate(order.created_at)}</span>
                        <span aria-hidden="true" className="hidden h-3 w-px bg-border-subtle sm:block" />
                        <span className="font-bold text-brand">
                          {order.status === 'free' || Number(order.amount) === 0
                            ? 'ฟรี'
                            : `฿${Number(order.amount).toLocaleString('th-TH')}`}
                        </span>
                        {isManualPending && order.latest_payment_submission_created_at && (
                          <>
                            <span aria-hidden="true" className="hidden h-3 w-px bg-border-subtle sm:block" />
                            <span>อัปเดตหลักฐาน {formatDate(order.latest_payment_submission_created_at)}</span>
                          </>
                        )}
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {presentation.description}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm font-bold text-foreground transition-colors hover:border-brand/40 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
                        >
                          ดูรายละเอียด
                          <ExternalLink size={14} aria-hidden="true" />
                        </Link>

                        {showResubmit && (
                          <Link
                            href={`/checkout/${order.package_id}`}
                            className="inline-flex items-center rounded-lg bg-brand-solid px-3 py-2 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/50"
                          >
                            {presentation.state === 'rejected' ? 'ส่งหลักฐานใหม่' : 'ส่งหลักฐาน'}
                          </Link>
                        )}

                        {showAccess && (
                          <Link
                            href={`/package/${order.packages!.slug}`}
                            className="inline-flex items-center rounded-lg bg-success px-3 py-2 text-sm font-bold text-success-foreground transition-colors hover:bg-success-hover focus:outline-none focus:ring-2 focus:ring-success/50"
                          >
                            ใช้งานแพ็กเกจ
                          </Link>
                        )}

                        {showNewOrder && (
                          <Link
                            href={`/checkout/${order.package_id}`}
                            className="inline-flex items-center rounded-lg border border-brand/40 px-3 py-2 text-sm font-bold text-brand transition-colors hover:bg-wash focus:outline-none focus:ring-2 focus:ring-brand/50"
                          >
                            สั่งซื้อใหม่
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : isFiltering ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-10 text-center">
            <h2 className="text-lg font-bold text-foreground">ไม่พบรายการที่ตรงกับเงื่อนไข</h2>
            <p className="mt-2 text-sm text-muted-foreground">ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm md:p-10">
            <PaymentStatusIllustration state="empty_orders" className="mx-auto" />
            <div className="mt-6 text-center">
              <Link
                href="/#exams"
                className="inline-flex items-center justify-center rounded-xl bg-brand-solid px-6 py-3 font-bold text-brand-foreground transition-colors hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30"
              >
                เลือกแพ็กเกจ
              </Link>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}
