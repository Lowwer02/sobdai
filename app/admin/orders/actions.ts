'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getAdminSupabase() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { supabase, isAdmin: false }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
    
  return { supabase, isAdmin: profile?.role === 'admin' }
}

export async function grantPackageAccess(userId: string, packageId: string) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    // Check if user already has access
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .eq('package_id', packageId)
      .eq('status', 'completed')
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'User already has access to this package.' }
    }

    const { error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        package_id: packageId,
        amount: 0,
        status: 'completed',
        payment_provider: 'manual_grant'
      })

    if (error) throw error

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateOrderStatus(orderId: string, newStatus: 'completed' | 'revoked' | 'refunded' | 'failed') {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) throw error

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
