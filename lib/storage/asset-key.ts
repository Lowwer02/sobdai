import { randomUUID } from 'node:crypto'

export const ALLOWED_ASSET_SCOPES = ['news', 'articles'] as const
export type AssetScope = (typeof ALLOWED_ASSET_SCOPES)[number]

export const ALLOWED_ASSET_PURPOSES = ['inline', 'cover'] as const
export type AssetPurpose = (typeof ALLOWED_ASSET_PURPOSES)[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Type guard for supported asset namespaces.
 */
export function isValidAssetScope(scope: unknown): scope is AssetScope {
  return typeof scope === 'string' && (ALLOWED_ASSET_SCOPES as readonly string[]).includes(scope)
}

/**
 * Type guard for the supported placement-specific key layouts.
 */
export function isValidAssetPurpose(purpose: unknown): purpose is AssetPurpose {
  return typeof purpose === 'string' && (ALLOWED_ASSET_PURPOSES as readonly string[]).includes(purpose)
}

/**
 * Validates whether a given string is a safe, canonical UUID.
 */
export function isValidEntityUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim())
}

export interface GenerateAssetKeyOptions {
  scope: unknown
  purpose?: unknown
  entityId?: string | null
  now?: Date
}

/**
 * Generates an immutable, collision-free, path-traversal-safe R2 object key.
 *
 * Security & Design guarantees:
 * 1. Never relies on user-supplied Thai titles or mutable slugs.
 * 2. Scopes are strictly restricted to 'news' or 'articles'.
 * 3. Purpose is restricted to 'inline' or 'cover', defaulting to the legacy inline layout.
 * 4. Entity IDs (if provided) are strictly validated as UUIDs to prevent directory traversal.
 * 5. In Create mode (where no entity ID exists yet), uses a stable UTC 'YYYY-MM' date partition.
 * 6. Asset ID is generated via cryptographically secure randomUUID().
 * 7. Always terminates in '.webp'.
 */
export function generateAssetKey(options: GenerateAssetKeyOptions): string {
  const { scope, purpose = 'inline', entityId, now = new Date() } = options

  if (!isValidAssetScope(scope)) {
    throw new Error(`Invalid asset scope: "${String(scope)}". Allowed scopes: ${ALLOWED_ASSET_SCOPES.join(', ')}`)
  }

  if (!isValidAssetPurpose(purpose)) {
    throw new Error(`Invalid asset purpose: "${String(purpose)}". Allowed purposes: ${ALLOWED_ASSET_PURPOSES.join(', ')}`)
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

  if (purpose === 'cover') {
    return `${scope}/${partition}/cover/${assetId}.webp`
  }

  return `${scope}/${partition}/${assetId}.webp`
}
