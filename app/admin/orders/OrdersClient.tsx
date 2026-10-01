'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, CheckCircle, Plus, X } from 'lucide-react'
import { ORDER_STATUS } from '@/lib/orderUtils'
import {
  ADMIN_REVIEW_QUEUE_CAP_MESSAGE,
  ADMIN_REVIEW_SUBMISSION_INTEGRITY_MESSAGE,
  getAnalyzerTriagePresentation,
  type AdminReviewQueueOrder,
  type AdminReviewQueuePackage,
  type AdminReviewQueueUser,
  type AdminReviewFilter,
  type AnalyzerTriageFilter,
} from '@/lib/payment/admin-review'
import {
  cancelManualPaymentOrder,
  grantPackageAccess,
  updateOrderStatus,
} from './actions'
import { getPaymentStatusPresentation, MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import AdminOrderMutationControls, { type AdminOrderMutationAction } from './AdminOrderMutationControls'

interface OrdersClientProps {
  orders: AdminReviewQueueOrder[]
  users: AdminReviewQueueUser[]
  packages: AdminReviewQueuePackage[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
  reviewFilter: AdminReviewFilter
  analyzerFilter: AnalyzerTriageFilter
  canManageFinancial: boolean
  paymentEvidenceLoaded: boolean
  analyzerDataLoaded: boolean
  paymentReviewUnavailable: boolean
  paymentReviewIntegrityAnomaly: boolean
  queueHasMore: boolean
  queueResultCapped: boolean
  queueNextCursor: string | null
  isBoundedQueue: boolean
}

export default function OrdersClient({
  orders,
  users,
  packages,
  totalPages,
  currentPage,
  search,
  statusFilter,
  reviewFilter,
  analyzerFilter,
  canManageFinancial,
  paymentEvidenceLoaded,
  analyzerDataLoaded,
  paymentReviewUnavailable,
  paymentReviewIntegrityAnomaly,
  queueHasMore,
  queueResultCapped,
  queueNextCursor,
  isBoundedQueue,
}: OrdersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [granting, setGranting] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedPackage, setSelectedPackage] = useState('')
  const [error, setError] = useState('')
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, orderId: string | null, action: AdminOrderMutationAction | null }>({ isOpen: false, orderId: null, action: null })

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    const resetsQueueCursor = ['q', 'status', 'review', 'triage'].some((key) => key in updates)
    if (resetsQueueCursor) params.delete('cursor')
    if (!updates.page || resetsQueueCursor) params.set('page', '1')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [pathname, router])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  const handleRevoke = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    try {
      const result = await updateOrderStatus(confirmModal.orderId, ORDER_STATUS.CANCELLED)
      if (result.success) {
        toastEvent('ยกเลิกสิทธิ์เข้าถึงสำเร็จ')
        router.refresh()
      } else {
        toastEvent(result.error || 'ยกเลิกสิทธิ์เข้าถึงไม่สำเร็จ', 'error')
      }
    } finally {
      setActingOnId(null)
    }
  }

  const handleRestore = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    try {
      const result = await updateOrderStatus(confirmModal.orderId, ORDER_STATUS.PAID)
      if (result.success) {
        toastEvent('คืนสิทธิ์เข้าถึงสำเร็จ')
        router.refresh()
      } else {
        toastEvent(result.error || 'คืนสิทธิ์เข้าถึงไม่สำเร็จ', 'error')
      }
    } finally {
      setActingOnId(null)
    }
  }

  const handleComplete = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    try {
      const result = await updateOrderStatus(confirmModal.orderId, ORDER_STATUS.PAID)
      if (result.success) {
        toastEvent('เปลี่ยนสถานะเป็นชำระเงินแล้วสำเร็จ')
        router.refresh()
      } else {
        toastEvent(result.error || 'เปลี่ยนสถานะไม่สำเร็จ', 'error')
      }
    } finally {
      setActingOnId(null)
    }
  }

  const handleCancelUnpaid = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    const result = await cancelManualPaymentOrder(confirmModal.orderId)
    if (result.success) {
      toastEvent('ยกเลิกคำสั่งซื้อแล้ว')
      router.refresh()
    } else {
      toastEvent(result.error || 'ไม่สามารถยกเลิกคำสั่งซื้อได้', 'error')
    }
    setActingOnId(null)
  }

  const confirmAction = () => {
    if (confirmModal.action === 'revoke') handleRevoke()
    else if (confirmModal.action === 'restore') handleRestore()
    else if (confirmModal.action === 'complete') handleComplete()
    else if (confirmModal.action === 'cancel-unpaid') handleCancelUnpaid()
  }

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || !selectedPackage) {
      setError('Please select both user and package.')
      return
    }
    setError('')
    setGranting(true)
    const res = await grantPackageAccess(selectedUser, selectedPackage)
    setGranting(false)
    if (res?.success) {
      setIsModalOpen(false)
      setSelectedUser('')
      setSelectedPackage('')
    } else {
      setError(res?.error || 'Failed to grant access.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Orders</h1>
          <p className="text-[#A1866B] mt-1">Manage purchases and package access.</p>
        </div>
        {canManageFinancial && (
          <button type="button"
            onClick={() => setIsModalOpen(true)}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} />
            Grant Access
          </button>
        )}
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        <div className="border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07]/30 px-4 py-3 text-sm text-[#A1866B]">
          {canManageFinancial && reviewFilter === 'needs_review'
            ? 'คิวเริ่มต้นแสดงคำสั่งซื้อ PromptPay ที่ยัง pending และมีหลักฐานล่าสุดรอเจ้าหน้าที่ตรวจสอบ'
            : 'ผลวิเคราะห์เป็นข้อมูลประกอบเท่านั้น การเปลี่ยนสิทธิ์ยังต้องผ่านการอนุมัติของเจ้าหน้าที่'}
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] space-y-3">
          <div className="flex flex-wrap gap-4 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by user email..." 
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <select 
              value={statusFilter} 
              onChange={(e) => updateParams({ status: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="all">ทุกสถานะ</option>
              <option value={ORDER_STATUS.PAID}>Paid</option>
              <option value={ORDER_STATUS.FREE}>Free</option>
              <option value={ORDER_STATUS.PENDING}>Pending</option>
              <option value={ORDER_STATUS.CANCELLED}>Cancelled</option>
              <option value="refunded">Refunded</option>
              <option value="revoked">Revoked</option>
            </select>
            {canManageFinancial && (
              <>
                <select
                  value={reviewFilter}
                  onChange={(e) => updateParams({ review: e.target.value })}
                  aria-label="Payment review state"
                  className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="needs_review">Needs review</option>
                  <option value="checking">กำลังตรวจสอบ</option>
                  <option value="rejected">Rejected / resubmitted</option>
                  <option value="no_evidence">No evidence</option>
                  <option value="all">All payment states</option>
                </select>
                <select
                  value={analyzerFilter}
                  onChange={(e) => updateParams({ triage: e.target.value })}
                  aria-label="Analyzer triage"
                  className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="all">All analyzer signals</option>
                  <option value="STRONG_MATCH">STRONG_MATCH — Offline match</option>
                  <option value="MANUAL_REVIEW">MANUAL_REVIEW — ตรวจสอบด้วยเจ้าหน้าที่</option>
                  <option value="SUSPICIOUS">SUSPICIOUS — ควรตรวจละเอียด</option>
                  <option value="ANALYZER_ERROR">ANALYZER_ERROR — วิเคราะห์อัตโนมัติไม่สำเร็จ</option>
                  <option value="not_analyzed">Not analyzed</option>
                </select>
              </>
            )}
          </div>
          </div>
          {canManageFinancial && !analyzerDataLoaded && reviewFilter !== 'no_evidence' && (
            <p className="text-xs text-[#A1866B]">Analyzer triage is temporarily unavailable; review actions remain manual and authoritative.</p>
          )}
          {queueResultCapped && (
            <p className="text-xs text-[#F1D17A]">{ADMIN_REVIEW_QUEUE_CAP_MESSAGE}</p>
          )}
        </div>

        {/* Loading Overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-[#1A140E]/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto min-h-[400px] relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0F0B07]/50 text-[#A1866B] text-xs uppercase tracking-wider border-b border-[rgba(255,255,255,0.05)]">
                <th className="p-4 font-medium">Order</th>
                <th className="p-4 font-medium">Buyer</th>
                <th className="p-4 font-medium">Package</th>
                <th className="p-4 font-medium text-right">Amount</th>
                <th className="p-4 font-medium">Evidence / triage</th>
                <th className="p-4 font-medium">Order status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {paymentReviewUnavailable ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-[#A1866B]">
                    {paymentReviewIntegrityAnomaly
                      ? ADMIN_REVIEW_SUBMISSION_INTEGRITY_MESSAGE
                      : 'ไม่สามารถโหลดคิวตรวจสอบการชำระเงินได้ กรุณารีเฟรชแล้วลองใหม่'}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-[#A1866B]">
                    {isBoundedQueue && queueHasMore
                      ? 'ยังค้นหาต่อได้ในช่วงข้อมูลถัดไป กรุณาไปหน้าถัดไป'
                      : 'No orders found.'}
                  </td>
                </tr>
              ) : orders.map((order) => {
                const paymentStatus = !canManageFinancial && order.payment_provider === MANUAL_PAYMENT_PROVIDER
                  ? { key: 'unknown' as const, label: 'Payment review restricted' }
                  : getPaymentStatusPresentation({
                    orderStatus: order.status,
                    paymentProvider: order.payment_provider,
                    submissionCount: order.manual_payment_submission_count,
                    latestSubmissionStatus: order.manual_payment_status,
                    evidenceReadAvailable: order.payment_provider !== MANUAL_PAYMENT_PROVIDER || paymentEvidenceLoaded,
                  })
                const analyzerTriage = getAnalyzerTriagePresentation(order.manual_payment_analyzer_state)
                const reviewStateLabel = order.manual_payment_review_state === 'needs_review'
                  ? 'Needs review'
                  : order.manual_payment_review_state === 'checking'
                    ? 'กำลังตรวจสอบ'
                    : order.manual_payment_review_state === 'rejected'
                      ? 'Rejected / resubmitted'
                      : order.manual_payment_review_state === 'no_evidence'
                        ? 'No evidence'
                        : order.manual_payment_review_state === 'paid'
                          ? 'Already paid'
                        : order.manual_payment_review_state === 'cancelled'
                          ? 'Cancelled'
                          : order.manual_payment_review_state === 'refunded'
                            ? 'Refunded — terminal'
                            : order.manual_payment_review_state === 'revoked'
                              ? 'Revoked — terminal'
                            : null
                const canCancelUnpaidManualOrder =
                  canManageFinancial
                  && paymentEvidenceLoaded
                  &&
                  order.payment_provider === MANUAL_PAYMENT_PROVIDER
                  && order.status === ORDER_STATUS.PENDING
                  && (
                    order.manual_payment_submission_count === 0
                    || order.manual_payment_all_rejected === true
                  )
                const statusClass = paymentStatus.key === 'paid' || paymentStatus.key === 'free'
                  ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20'
                  : paymentStatus.key === 'cancelled'
                    ? 'text-[#A1866B] bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.05)]'
                    : paymentStatus.key === 'failed' || paymentStatus.key === 'rejected'
                      ? 'text-red-400 bg-red-400/10 border-red-400/20'
                      : paymentStatus.key === 'refunded'
                        ? 'text-purple-400 bg-purple-400/10 border-purple-400/20'
                        : 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20'

                return (
                <tr key={order.id} className="hover:bg-[#D4AF37]/[0.02] transition-colors">
                  <td className="p-4 text-[#A1866B] text-sm whitespace-nowrap">
                    <div className="font-mono text-xs text-[#F5E9D6]">{order.id.slice(0, 8)}…</div>
                    <div className="mt-1">{new Date(order.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium text-sm">{order.user_email}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium text-sm truncate max-w-[200px]">{order.package_name}</div>
                    <div className="text-[#A1866B] text-xs mt-0.5">{order.payment_provider === MANUAL_PAYMENT_PROVIDER ? 'PromptPay manual' : order.payment_provider || 'Unknown'}</div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-[#D4AF37] font-bold">฿{Number(order.amount).toLocaleString()}</span>
                  </td>
                  <td className="p-4 min-w-[210px]">
                    {order.payment_provider === MANUAL_PAYMENT_PROVIDER && canManageFinancial ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${analyzerTriage.tone}`}>
                            {analyzerTriage.label}
                          </span>
                          {reviewStateLabel && <span className="text-[11px] font-semibold text-[#A1866B]">{reviewStateLabel}</span>}
                        </div>
                        <div className="mt-2 text-[11px] text-[#A1866B]">
                          {order.manual_payment_status ? `Evidence: ${order.manual_payment_status}` : 'No evidence'}
                          {' · '}{order.manual_payment_submission_count || 0} attempt{order.manual_payment_submission_count === 1 ? '' : 's'}
                        </div>
                        {order.manual_payment_submitted_at && (
                          <div className="mt-1 text-[11px] text-[#A1866B]">
                            latest {new Date(order.manual_payment_submitted_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-sky-200/80">Analyzer is advisory only</div>
                      </>
                    ) : (
                      <span className="text-xs text-[#A1866B]">
                        {order.payment_provider === MANUAL_PAYMENT_PROVIDER ? 'Payment review restricted' : '—'}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusClass}`}>
                      {paymentStatus.label}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <AdminOrderMutationControls
                        order={order}
                        canManageFinancial={canManageFinancial}
                        canCancelUnpaidManualOrder={canCancelUnpaidManualOrder}
                        actingOnId={actingOnId}
                        onRequestAction={(action) => setConfirmModal({
                          isOpen: true,
                          orderId: order.id,
                          action,
                        })}
                      />
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(isBoundedQueue ? currentPage > 1 || queueHasMore : totalPages > 1) && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between">
            <div className="text-sm text-[#A1866B]">
              Page <span className="text-[#F5E9D6] font-medium">{currentPage}</span> of <span className="text-[#F5E9D6] font-medium">{totalPages}{queueHasMore ? '+' : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" 
                onClick={() => {
                  if (isBoundedQueue) router.back()
                  else updateParams({ page: String(currentPage - 1) })
                }}
                disabled={currentPage <= 1 || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <ChevronLeft size={16} />
              </button>
              <button type="button" 
                onClick={() => updateParams(isBoundedQueue && queueNextCursor
                  ? { page: String(currentPage + 1), cursor: queueNextCursor }
                  : { page: String(currentPage + 1) })}
                disabled={(isBoundedQueue
                  ? !queueHasMore || !queueNextCursor
                  : (!queueHasMore && currentPage >= totalPages)) || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grant Access Modal */}
      {canManageFinancial && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center">
              <h3 className="text-lg font-bold font-display text-[#F5E9D6]">Grant Package Access</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#A1866B] hover:text-[#F5E9D6] transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleGrant} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-500/10 text-red-500 text-sm rounded-lg">{error}</div>}
              <div>
                <label className="text-sm text-[#F5E9D6] font-medium block mb-2">Select User</label>
                <select 
                  required
                  value={selectedUser} 
                  onChange={e => setSelectedUser(e.target.value)} 
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="">-- Choose User --</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-[#F5E9D6] font-medium block mb-2">Select Package</label>
                <select 
                  required
                  value={selectedPackage} 
                  onChange={e => setSelectedPackage(e.target.value)} 
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="">-- Choose Package --</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={granting}
                  className="px-4 py-2 rounded-xl text-[#F5E9D6] hover:bg-[#0F0B07] transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={granting}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] transition-colors text-sm font-bold flex items-center gap-2"
                >
                  {granting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Grant Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, orderId: null, action: null })}
        onConfirm={confirmAction}
        title={confirmModal.action === 'cancel-unpaid' ? 'ยกเลิกคำสั่งซื้อที่ยังไม่ชำระ' : confirmModal.action === 'revoke' ? 'ยกเลิกสิทธิ์เข้าถึง' : 'คืนสิทธิ์เข้าถึง'}
        description={
          confirmModal.action === 'cancel-unpaid'
            ? 'คำสั่งซื้อที่ยังไม่มีหลักฐานการชำระเงินจะถูกเปลี่ยนเป็นยกเลิก และจะไม่เปิดสิทธิ์แพ็กเกจให้ผู้ซื้อ'
            : confirmModal.action === 'revoke'
            ? 'คุณต้องการยกเลิกสิทธิ์เข้าถึงแพ็กเกจของผู้ใช้งานนี้ใช่หรือไม่?' 
            : 'คุณต้องการคืนสิทธิ์เข้าถึงแพ็กเกจให้ผู้ใช้งานนี้ใช่หรือไม่?'
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isDestructive={confirmModal.action === 'revoke' || confirmModal.action === 'cancel-unpaid'}
      />
    </div>
  )
}
