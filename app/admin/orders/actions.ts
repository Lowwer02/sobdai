'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { ORDER_COMPLETED_STATUSES, OrderStatus, ORDER_STATUS } from '@/lib/orderUtils'
import { isUuid } from '@/lib/payment/manual'
import { logAuditEvent } from '@/lib/audit/logger'
import { revalidatePath } from 'next/cache'


export async function grantPackageAccess(userId: string, packageId: string) {
  try {
    const { supabase } = await requirePermission('financial.manage')
    
    // Check if user already has access
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .eq('package_id', packageId)
      .in('status', ORDER_COMPLETED_STATUSES)
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'User already has access to this package.' }
    }

    const { error, data } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        package_id: packageId,
        amount: 0,
        status: ORDER_STATUS.FREE,
        payment_provider: 'manual_grant'
      })
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Grant access failed. You may not have permission.')

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  try {
    const { supabase } = await requirePermission('financial.manage')

    // Manual PromptPay orders may only become paid through the locked payment
    // review RPC. Keep the existing generic order control for Omise/legacy
    // orders, but do not let it bypass slip review for M1.
    if (newStatus === ORDER_STATUS.PAID) {
      const { data: order } = await supabase
        .from('orders')
        .select('payment_provider')
        .eq('id', orderId)
        .maybeSingle()

      if (order?.payment_provider === 'promptpay_manual') {
        return {
          success: false,
          error: 'PromptPay orders must be approved from the payment review page.',
        }
      }
    }
    
    const { error, data } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Update failed. You may not have permission.')

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function approvePayment(paymentSubmissionId: string) {
  try {
    const { supabase, profile } = await requirePermission('financial.manage')

    if (!isUuid(paymentSubmissionId)) {
      return { success: false, error: 'Invalid payment submission.' }
    }

    const { data, error } = await supabase.rpc('approve_payment_submission', {
      p_submission_id: paymentSubmissionId,
    })

    if (error) {
      console.error('[PAYMENT] approve payment failed:', error.message)
      return { success: false, error: 'Payment submission could not be approved.' }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row?.order_id || row.status !== 'approved') {
      return { success: false, error: 'Payment submission could not be approved.' }
    }

    try {
      await logAuditEvent({
        action: 'APPROVE_PAYMENT_SUBMISSION',
        entity: 'payment_submissions',
        entity_id: paymentSubmissionId,
        new_value: { order_id: row.order_id, status: 'approved' },
        user_id: profile.id,
        role: profile.role,
      })
    } catch (auditError) {
      console.error('[PAYMENT] approval audit log failed:', auditError)
    }

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${row.order_id}`)
    return { success: true, orderId: row.order_id }
  } catch (error) {
    console.error('[PAYMENT] approve payment action failed:', error)
    return { success: false, error: 'Payment submission could not be approved.' }
  }
}

export async function rejectPayment(paymentSubmissionId: string, rejectionReason: string) {
  try {
    const { supabase, profile } = await requirePermission('financial.manage')

    if (!isUuid(paymentSubmissionId)) {
      return { success: false, error: 'Invalid payment submission.' }
    }

    const reason = rejectionReason.trim().slice(0, 1000)
    if (!reason) {
      return { success: false, error: 'A rejection reason is required.' }
    }

    const { data, error } = await supabase.rpc('reject_payment_submission', {
      p_submission_id: paymentSubmissionId,
      p_rejection_reason: reason,
    })

    if (error) {
      console.error('[PAYMENT] reject payment failed:', error.message)
      return { success: false, error: 'Payment submission could not be rejected.' }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row?.order_id || row.status !== 'rejected') {
      return { success: false, error: 'Payment submission could not be rejected.' }
    }

    try {
      await logAuditEvent({
        action: 'REJECT_PAYMENT_SUBMISSION',
        entity: 'payment_submissions',
        entity_id: paymentSubmissionId,
        new_value: { order_id: row.order_id, status: 'rejected', reason },
        user_id: profile.id,
        role: profile.role,
      })
    } catch (auditError) {
      console.error('[PAYMENT] rejection audit log failed:', auditError)
    }

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${row.order_id}`)
    return { success: true, orderId: row.order_id }
  } catch (error) {
    console.error('[PAYMENT] reject payment action failed:', error)
    return { success: false, error: 'Payment submission could not be rejected.' }
  }
}
