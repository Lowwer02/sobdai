import { randomUUID } from 'node:crypto'

export const ALLOWED_ASSET_SCOPES = ['news', 'articles'] as const
export type AssetScope = (typeof ALLOWED_ASSET_SCOPES)[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Type guard for supported asset namespaces.
 */
export function isValidAssetScope(scope: unknown): scope is AssetScope {
  return typeof scope === 'string' && (ALLOWED_ASSET_SCOPES as readonly string[]).includes(scope)
}

/**
 * Validates whether a given string is a safe, canonical UUID.
 */
export function isValidEntityUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim())
}

export interface GenerateAssetKeyOptions {
  scope: unknown
  entityId?: string | null
  now?: Date
}

/**
 * Generates an immutable, collision-free, path-traversal-safe R2 object key.
 *
 * Security & Design guarantees:
 * 1. Never relies on user-supplied Thai titles or mutable slugs.
 * 2. Scopes are strictly restricted to 'news' or 'articles'.
 * 3. Entity IDs (if provided) are strictly validated as UUIDs to prevent directory traversal.
 * 4. In Create mode (where no entity ID exists yet), uses a stable UTC 'YYYY-MM' date partition.
 * 5. Asset ID is generated via cryptographically secure randomUUID().
 * 6. Always terminates in '.webp'.
 */
export function generateAssetKey(options: GenerateAssetKeyOptions): string {
  const { scope, entityId, now = new Date() } = options

  if (!isValidAssetScope(scope)) {
    throw new Error(`Invalid asset scope: "${String(scope)}". Allowed scopes: ${ALLOWED_ASSET_SCOPES.join(', ')}`)
  }

  const assetId = randomUUID().toLowerCase()

  let partition: string
  if (entityId !== undefined && entityId !== null && entityId.trim() !== '') {
    const trimmedEntityId = entityId.trim()
    if (!isValidEntityUuid(trimmedEntityId)) {
      throw new Error(`Invalid entity ID format. Must be a valid UUID: "${entityId}"`)
    }
    partition = trimmedEntityId.toLowerCase()
  } else {
    // Format YYYY-MM partition (UTC) for clean bucket organization in create flow
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    partition = `${year}-${month}`
  }

  return `${scope}/${partition}/${assetId}.webp`
}
