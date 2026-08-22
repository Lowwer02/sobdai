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
      .select('role, status, deleted_at')
      .eq('id', userId)
      .single()
      
    if (fetchError) throw fetchError

    // The deployed profiles schema includes soft-delete state even though the
    // repository's generated client type has not yet declared that column.
    const targetDeletedAt = (targetUser as unknown as { deleted_at: string | null }).deleted_at

    // If downgrading an owner, ensure there is at least one other owner
    if (
      targetUser.role === 'owner' &&
      targetUser.status === 'active' &&
      targetDeletedAt === null &&
      newRole !== 'owner'
    ) {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        .eq('status', 'active')
        .is('deleted_at', null)
        
      if (countError) throw countError
      if (count === null || count <= 1) {
        throw new Error('Cannot downgrade the last usable owner of the system.')
      }
    }
    
    const { data, error } = await supabase.rpc('admin_update_profile_role', {
      p_target_user_id: userId,
      p_new_role: newRole,
    })

    if (error) throw error
    if (data !== true) throw new Error('Update failed. You may not have permission to modify this profile.')

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
      .select('role, status, deleted_at')
      .eq('id', userId)
      .single()

    if (fetchError) throw fetchError

    const targetDeletedAt = (targetUser as unknown as { deleted_at: string | null }).deleted_at

    // If deactivating an owner, ensure there is at least one other owner
    if (
      targetUser.role === 'owner' &&
      targetUser.status === 'active' &&
      targetDeletedAt === null &&
      newStatus === 'banned'
    ) {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        .eq('status', 'active')
        .is('deleted_at', null)

      if (countError) throw countError
      if (count === null || count <= 1) {
        throw new Error('Cannot deactivate the last usable owner of the system.')
      }
    }

    // The database validates the actor, target, status transition, ban actor,
    // and last-active-owner invariant atomically.
    const { data, error } = await supabase.rpc('admin_update_profile_status', {
      p_target_user_id: userId,
      p_new_status: newStatus,
      p_reason: reason ?? null,
    })

    if (error) throw error
    if (data !== true) throw new Error('Update failed. You may not have permission to modify this profile.')

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
