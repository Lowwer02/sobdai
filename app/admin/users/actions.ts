'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { revalidatePath } from 'next/cache'
import { logAuditEvent } from '@/lib/audit/logger'
import { Role } from '@/lib/auth/rbac'

export async function updateUserRole(userId: string, newRole: Role) {
  try {
    const { supabase, profile } = await requirePermission('users.write')
    
    // Check if modifying an owner
    const { data: targetUser, error: fetchError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      
    if (fetchError) throw fetchError

    // If downgrading an owner, ensure there is at least one other owner
    if (targetUser.role === 'owner' && newRole !== 'owner') {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        
      if (countError) throw countError
      if (count === null || count <= 1) {
        throw new Error('Cannot downgrade the last owner of the system.')
      }
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)
      .select('id') // Added select to force return of affected rows

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Update failed. You may not have permission to modify this profile.')

    await logAuditEvent({
      action: 'UPDATE_ROLE',
      entity: 'profiles',
      entity_id: userId,
      old_value: { role: targetUser.role },
      new_value: { role: newRole },
      user_id: profile?.id,
      role: profile?.role
    })

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateUserStatus(userId: string, newStatus: 'active' | 'banned', reason?: string) {
  try {
    const { supabase, profile } = await requirePermission('users.write')

    // Check if modifying an owner
    const { data: targetUser, error: fetchError } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', userId)
      .single()

    if (fetchError) throw fetchError

    // If deactivating an owner, ensure there is at least one other owner
    if (targetUser.role === 'owner' && newStatus !== 'active') {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        .eq('status', 'active')

      if (countError) throw countError
      if (count === null || count <= 1) {
        throw new Error('Cannot deactivate the last active owner of the system.')
      }
    }

    // Build the patch: status always flips; ban metadata is set on ban and
    // cleared on unban so stale ban info doesn't linger after reinstatement.
    const patch: Record<string, unknown> =
      newStatus === 'banned'
        ? {
            status: 'banned',
            banned_at: new Date().toISOString(),
            banned_reason: reason ?? null,
            banned_by: profile?.id ?? null,
          }
        : {
            status: 'active',
            banned_at: null,
            banned_reason: null,
            banned_by: null,
          }

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id') // Added select to force return of affected rows

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Update failed. You may not have permission to modify this profile.')

    await logAuditEvent({
      action: 'UPDATE_STATUS',
      entity: 'profiles',
      entity_id: userId,
      old_value: { status: targetUser.status },
      new_value: { status: newStatus, banned_reason: reason ?? null },
      user_id: profile?.id,
      role: profile?.role
    })

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
