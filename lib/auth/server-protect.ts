import { createClient } from '@/lib/supabase/server'
import { hasPermission, Permission, Role } from './rbac'
import { forbidden, redirect } from 'next/navigation'

/**
 * Roles permitted to enter the Admin Panel at all. A normal `user` is NOT
 * staff and must be blocked at the admin staff boundary (app/admin/layout.tsx).
 * This is the Single Source of Truth for "who may be inside /admin".
 */
export const STAFF_ROLES: readonly Role[] = ['owner', 'admin', 'editor', 'support']

export type UsableAccountProfile = {
  id: string
  email?: string | null
  role: Role
  status: 'active'
  deleted_at: null
}

/**
 * Account usability is an authorization prerequisite, not a role. Keep this
 * check fail-closed when an older or incomplete profile shape is returned.
 */
export function isUsableAccountProfile(profile: unknown): profile is UsableAccountProfile {
  if (typeof profile !== 'object' || profile === null) return false

  const candidate = profile as Record<string, unknown>
  return (
    typeof candidate.id === 'string'
    && typeof candidate.role === 'string'
    && candidate.status === 'active'
    && candidate.deleted_at === null
  )
}

/**
 * Returns the current user and profile data, or redirects to /login if not
 * authenticated.
 *
 * NOTE: This performs AUTHENTICATION only — it verifies a session exists. It
 * does NOT check the profile role. Callers that need authorization must also
 * call requirePermission() (granular) or requireStaff() (staff boundary).
 * The name is historical; think of it as requireAuthenticatedSession().
 */
export async function getAdminSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return { user, profile, supabase }
}

/**
 * Staff boundary — the Single Source of Truth for entering the Admin Panel.
 *
 * Authenticates the session, loads the profile, and verifies the role is one of
 * STAFF_ROLES (owner / admin / editor / support). A normal authenticated `user`
 * is rejected with forbidden() (renders app/forbidden.tsx, HTTP 403) rather than
 * being allowed through. An unauthenticated request is redirected to /login.
 *
 * Use this in the admin layout to protect the entire /admin/* section by
 * default, independent of per-page requirePermission() checks.
 */
export async function requireStaff() {
  const { user, profile, supabase } = await getAdminSession()

  if (!isUsableAccountProfile(profile) || !STAFF_ROLES.includes(profile.role)) {
    forbidden()
  }

  return { user, profile, supabase }
}

/**
 * Ensures the current user has the required permission.
 * Throws forbidden() if not met.
 */
export async function requirePermission(permission: Permission) {
  const { user, profile, supabase } = await getAdminSession()
  
  if (!isUsableAccountProfile(profile) || !hasPermission(profile.role, permission)) {
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
    return isUsableAccountProfile(profile) && hasPermission(profile.role, permission)
  } catch {
    return false
  }
}
