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

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'content.read', 'content.write', 'content.publish', 'content.delete',
    'users.read', 'users.write',
    'orders.read', 'financial.manage',
    'system.manage'
  ],
  admin: [
    'content.read', 'content.write', 'content.publish', 'content.delete',
    'users.read', 'users.write',
    'orders.read', 'financial.manage'
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
