export type ContentStatus = 'draft' | 'published' | 'archived'

/**
 * Maps the boolean `is_published` database flag to a logical ContentStatus.
 */
export function getStatusFromBoolean(isPublished: boolean): ContentStatus {
  return isPublished ? 'published' : 'draft'
}

/**
 * Converts a ContentStatus back to a boolean for database persistence.
 * Note: 'archived' currently maps to false (unpublished) until the DB schema evolves.
 */
export function getBooleanFromStatus(status: ContentStatus): boolean {
  return status === 'published'
}

/**
 * Helper to determine if a status transition is allowed by a specific role.
 * This can be expanded later.
 */
export function canPublishContent(role: string | null | undefined): boolean {
  // Only admin and owner can publish. Editor cannot.
  return role === 'admin' || role === 'owner'
}
