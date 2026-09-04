/**
 * AdSense Conservative (M3) — pure configuration + eligibility contract.
 *
 * M3 monetizes News/Article detail pages and the Daily practice surface with
 * ONE manual responsive display unit per eligible page. This module owns the
 * two decisions every surface needs:
 *
 *   1. PLATFORM CONFIG — publisher/client + slot ids come from environment
 *      variables (NEVER from content rows, mirroring how NEXT_PUBLIC_GTM_ID is
 *      consumed in app/layout.tsx):
 *        - NEXT_PUBLIC_ADSENSE_CLIENT      e.g. `ca-pub-1234567890123456`
 *        - NEXT_PUBLIC_ADSENSE_DETAIL_SLOT e.g. `1234567890`
 *      Both are strictly format-validated before they reach any attribute, so
 *      a misconfigured value can neither build a malformed script URL nor
 *      inject attributes into the <ins> element. The ids are public rendering
 *      identifiers (they appear in the served HTML either way), so a
 *      NEXT_PUBLIC_ prefix is informational rather than a security boundary —
 *      they are still only read server-side and passed down as props.
 *
 *   2. CONTENT OPT-IN — the per-row `adsense_enabled` boolean (migration 087)
 *      coerced STRICTLY (`=== true`), matching the affiliate flag contract in
 *      lib/affiliate.ts. Absent/legacy rows → OFF.
 *
 * Detail eligibility = opt-in AND config. Either failing → render no unit and
 * (via the AdSenseUnit island never mounting) never load the AdSense network
 * script. Daily uses the same validated platform config and its own product
 * surface gate; it has no content-row opt-in.
 *
 * Deliberately NOT here: Auto Ads / vignette / anchor / multiplex / ad-intents
 * configuration (all banned by the M3 spec), impression/click tracking, and
 * consent logic — the consent model (lib/consent.ts) has no advertising
 * category, so ads must never gate on the analytics flag (see M3 release note).
 *
 * No DB, no `next` import, no `@/` imports: node --test strip-types runs this
 * file directly (same convention as lib/affiliate.ts).
 */

/** Environment variable names (documented contract, frozen by tests). */
export const ADSENSE_CLIENT_ENV_VAR = 'NEXT_PUBLIC_ADSENSE_CLIENT'
export const ADSENSE_DETAIL_SLOT_ENV_VAR = 'NEXT_PUBLIC_ADSENSE_DETAIL_SLOT'

/** Subtle Thai ad label — the only disclosure the unit renders. */
export const ADSENSE_LABEL = 'โฆษณา'

/** AdSense client/publisher id: `ca-pub-` + 10–20 digits, nothing else. */
const ADSENSE_CLIENT_REGEX = /^ca-pub-\d{10,20}$/

/** AdSense manual display slot id: 8–15 digits (numeric string). */
const ADSENSE_SLOT_REGEX = /^\d{8,15}$/

export interface AdsenseDetailConfig {
  clientId: string
  slotId: string
}

/** Strict `ca-pub-<digits>` validation; returns the trimmed value or null. */
export function parseAdsenseClientId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return ADSENSE_CLIENT_REGEX.test(trimmed) ? trimmed : null
}

/** Strict numeric slot-id validation; returns the trimmed value or null. */
export function parseAdsenseSlotId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return ADSENSE_SLOT_REGEX.test(trimmed) ? trimmed : null
}

/**
 * Per-content opt-in coercion — STRICTLY `true`. Mirrors
 * coerceAffiliateContentFields: no truthy-string shortcuts, so a malformed
 * admin payload can never silently enable ads.
 */
export function coerceAdsenseEnabled(value: unknown): boolean {
  return value === true
}

/**
 * Resolve the detail-page AdSense config from an env-like record. Returns null
 * when EITHER variable is missing or malformed — a partial configuration is
 * treated as no configuration (fail closed).
 */
export function getAdsenseDetailConfigFrom(
  env: Record<string, string | undefined>
): AdsenseDetailConfig | null {
  const clientId = parseAdsenseClientId(env[ADSENSE_CLIENT_ENV_VAR])
  const slotId = parseAdsenseSlotId(env[ADSENSE_DETAIL_SLOT_ENV_VAR])
  if (!clientId || !slotId) return null
  return { clientId, slotId }
}

/** Process-env entry point used by the detail surfaces. */
export function getAdsenseDetailConfig(): AdsenseDetailConfig | null {
  return getAdsenseDetailConfigFrom(process.env)
}

/**
 * Platform-level config for the Daily surface. It deliberately reuses the
 * existing M3 client + slot pair; Daily's placement is controlled in code,
 * not by a new DB row or a second AdSense script/config model.
 */
export function getAdsenseDailyConfig(): AdsenseDetailConfig | null {
  return getAdsenseDetailConfigFrom(process.env)
}

/**
 * Full eligibility decision for a detail page in one call:
 * content opt-in AND platform config. Returns the validated config to render
 * with, or null (→ render no unit, load no script).
 */
export function resolveDetailAdUnit(input: {
  adsenseEnabled?: unknown
  env?: Record<string, string | undefined>
}): AdsenseDetailConfig | null {
  if (!coerceAdsenseEnabled(input.adsenseEnabled)) return null
  return getAdsenseDetailConfigFrom(input.env ?? process.env)
}
