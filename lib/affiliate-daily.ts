/**
 * Daily completion Affiliate configuration.
 *
 * Daily has no content row to carry the M1 `affiliate_collection_id`, and the
 * M2 listing-slot table is intentionally limited to `/news` and `/articles`.
 * Keep the Daily binding optional and server-side instead of borrowing an
 * unrelated listing slot or adding a new database object. A missing or
 * malformed value disables Daily Picks safely.
 */

export const DAILY_AFFILIATE_COLLECTION_ENV_VAR = 'DAILY_AFFILIATE_COLLECTION_ID'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Strict UUID parsing prevents an environment typo from reaching PostgREST. */
export function parseDailyAffiliateCollectionId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return UUID_REGEX.test(trimmed) ? trimmed : null
}

/** Server-page entry point; the collection id is never sent as a public URL. */
export function getDailyAffiliateCollectionId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return parseDailyAffiliateCollectionId(env[DAILY_AFFILIATE_COLLECTION_ENV_VAR])
}
