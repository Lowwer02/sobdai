export type Role = 'owner' | 'admin' | 'editor' | 'support' | 'user'

export type Permission = 
  // Content Management
  | 'content.read'
  | 'content.write'
  | 'content.publish'
  | 'content.delete'
  // User Management
  | 'users.read'
  | 'users.write'
  // Financial
  | 'orders.read'
  | 'financial.manage'
  // System
  | 'system.manage'
  // Support / Donation settings (owner + admin only; contains financial info)
  | 'support.manage'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'content.read', 'content.write', 'content.publish', 'content.delete',
    'users.read', 'users.write',
    'orders.read', 'financial.manage',
    'system.manage',
    'support.manage',
  ],
  admin: [
    'content.read', 'content.write', 'content.publish', 'content.delete',
    'users.read', 'users.write',
    'orders.read', 'financial.manage',
    'support.manage',
  ],
  editor: [
    'content.read', 'content.write'
  ],
  support: [
    'users.read', 'orders.read'
  ],
  user: []
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false
  const permissions = ROLE_PERMISSIONS[role as Role] || []
  return permissions.includes(permission)
}

export function hasRole(currentRole: string | null | undefined, targetRole: Role): boolean {
  return currentRole === targetRole
}

export function getRolePermissions(role: string | null | undefined): Permission[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role as Role] || []
}

/**
 * Role hierarchy for ordered comparisons (lower index = higher authority).
 * Useful for "at least X role" checks without enumerating permissions.
 */
const ROLE_HIERARCHY: Role[] = ['owner', 'admin', 'editor', 'support', 'user']

/**
 * Returns true if `currentRole` is at least as privileged as `minRole`.
 * Example: isAtLeastRole('admin', 'editor') → true
 *          isAtLeastRole('editor', 'admin') → false
 */
export function isAtLeastRole(currentRole: string | null | undefined, minRole: Role): boolean {
  if (!currentRole) return false
  const currentIdx = ROLE_HIERARCHY.indexOf(currentRole as Role)
  const minIdx = ROLE_HIERARCHY.indexOf(minRole)
  if (currentIdx === -1 || minIdx === -1) return false
  return currentIdx <= minIdx
}
