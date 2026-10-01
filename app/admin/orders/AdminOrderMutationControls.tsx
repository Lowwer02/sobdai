'use client'

import Link from 'next/link'
import { Ban, CheckCircle, Loader2 } from 'lucide-react'
import { ORDER_STATUS } from '@/lib/orderUtils'
import { MANUAL_PAYMENT_PROVIDER } from '@/lib/payment/manual'
import type { AdminReviewQueueOrder } from '@/lib/payment/admin-review'

export type AdminOrderMutationAction = 'revoke' | 'restore' | 'complete' | 'cancel-unpaid'

export type AdminOrderMutationControlsProps = {
  order: Pick<
    AdminReviewQueueOrder,
    | 'id'
    | 'status'
    | 'payment_provider'
    | 'manual_payment_status'
    | 'manual_payment_all_rejected'
  >
  canManageFinancial: boolean
  canCancelUnpaidManualOrder: boolean
  actingOnId: string | null
  onRequestAction: (action: AdminOrderMutationAction) => void
}

export default function AdminOrderMutationControls({
  order,
  canManageFinancial,
  canCancelUnpaidManualOrder,
  actingOnId,
  onRequestAction,
}: AdminOrderMutationControlsProps) {
  const isActing = actingOnId === order.id

  return (
    <>
      {canManageFinancial && order.status === ORDER_STATUS.PENDING && order.payment_provider !== MANUAL_PAYMENT_PROVIDER && (
        <button
          type="button"
          onClick={() => onRequestAction('complete')}
          disabled={isActing}
          className="px-3 py-1.5 bg-[#22C55E]/10 text-[#22C55E] text-xs font-bold rounded hover:bg-[#22C55E]/20 transition-colors"
        >
          Mark Paid
        </button>
      )}

      {canManageFinancial && order.payment_provider === MANUAL_PAYMENT_PROVIDER && (
        <Link
          href={`/admin/orders/${order.id}`}
          className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
            order.status === ORDER_STATUS.PENDING && order.manual_payment_status === 'submitted'
              ? 'bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20'
              : 'bg-[#0F0B07] text-[#A1866B] hover:text-[#F5E9D6]'
          }`}
        >
          {order.status === ORDER_STATUS.PENDING && order.manual_payment_status === 'submitted' ? 'Review' : 'Details'}
        </Link>
      )}

      {canCancelUnpaidManualOrder && (
        <button
          type="button"
          onClick={() => onRequestAction('cancel-unpaid')}
          disabled={isActing}
          className="px-3 py-1.5 rounded border border-red-400/30 text-xs font-bold text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {order.manual_payment_all_rejected
            ? 'ยกเลิกคำสั่งซื้อหลังหลักฐานไม่ผ่าน'
            : 'ยกเลิกคำสั่งซื้อนี้'}
        </button>
      )}

      {canManageFinancial && (order.status === ORDER_STATUS.PAID || order.status === ORDER_STATUS.FREE) ? (
        <button
          type="button"
          onClick={() => onRequestAction('revoke')}
          disabled={isActing}
          className="p-2 text-[#A1866B] hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 disabled:opacity-50"
          title="Revoke Access"
        >
          {isActing ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
        </button>
      ) : canManageFinancial && order.status === 'revoked' ? (
        <button
          type="button"
          onClick={() => onRequestAction('restore')}
          disabled={isActing}
          className="p-2 text-[#A1866B] hover:text-green-500 transition-colors rounded-lg hover:bg-green-500/10 disabled:opacity-50"
          title="Restore Access"
        >
          {isActing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        </button>
      ) : (
        <span className="text-xs text-[#A1866B]">N/A</span>
      )}
    </>
  )
}
