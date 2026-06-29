'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { ORDER_COMPLETED_STATUSES, OrderStatus, ORDER_STATUS } from '@/lib/orderUtils'
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
