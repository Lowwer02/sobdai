import { createClient } from '@/lib/supabase/server'
import { hasPermission, Permission, Role } from './rbac'
import { forbidden, redirect } from 'next/navigation'

/**
 * Returns the current user and profile data, or redirects if unauthorized.
 * Used for API routes and Server Actions.
 */
export async function getAdminSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/admin')

  return { user, profile, supabase }
}

/**
 * Ensures the current user has the required permission.
 * Throws forbidden() if not met.
 */
export async function requirePermission(permission: Permission) {
  const { user, profile, supabase } = await getAdminSession()
  
  if (!hasPermission(profile.role, permission)) {
    forbidden()
  }

  return { user, profile, supabase }
}

/**
 * Safely checks if the current user has a permission.
 * Does not throw, returns boolean.
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
  try {
    const { profile } = await getAdminSession()
    return hasPermission(profile.role, permission)
  } catch {
    return false
  }
}
