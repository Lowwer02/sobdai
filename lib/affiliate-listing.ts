/**
 * Affiliate M2 — Listing Monetization config (pure contract, no DB).
 *
 * Mirrors the lib/affiliate.ts split: pure logic + validation here, the server
 * fetcher lives in lib/affiliate-public.ts and the 'use server' wrapper in
 * app/admin/affiliate/actions.ts. Hand-written coercion (no zod — matches the
 * rest of the codebase).
 *
 * SCOPE FREEZE (M2): the ONLY per-listing controls are `enabled` + collection.
 * Insertion position (after item #6), the ≥7-item threshold, and the max of one
 * strip per page are frozen in code as the constants below — they are product
 * decisions, not config, so no admin UI or DB column can drift them.
 *
 * Independence: `news_list` and `articles_list` slots are validated, persisted,
 * and fetched completely independently — enabling one never touches the other.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** The two public listings that can carry a strip (frozen set). */
export type AffiliateListingKey = 'news_list' | 'articles_list'

export const AFFILIATE_LISTING_KEYS: AffiliateListingKey[] = ['news_list', 'articles_list']

export function isAffiliateListingKey(v: unknown): v is AffiliateListingKey {
  return v === 'news_list' || v === 'articles_list'
}

/** One listing's strip configuration (shape of the affiliate_listing_slots row). */
export interface AffiliateListingSlotConfig {
  listing_key: AffiliateListingKey
  enabled: boolean
  collection_id: string | null
}

/** Shape accepted by the save action (no server-generated fields). */
export interface AffiliateListingSlotInput {
  enabled: boolean
  collection_id: string | null
}

// ─── Frozen rendering rules (code-owned, NOT config) ────────────────────────

/**
 * The strip renders only when the listing page renders AT LEAST this many
 * editorial items (spec: ≤6 items → no strip; ≥7 → one strip after item #6).
 */
export const AFFILIATE_LISTING_MIN_ITEMS = 7

/** 1-based position after which the single strip renders. Frozen in code. */
export const AFFILIATE_LISTING_INSERT_AFTER = 6

/**
 * Listing-gated guard for the strip. Pure so the pages and tests share one
 * definition of the threshold.
 */
export function shouldRenderListingStrip(renderedItemCount: number): boolean {
  if (!Number.isFinite(renderedItemCount) || renderedItemCount <= 0) return false
  return renderedItemCount >= AFFILIATE_LISTING_MIN_ITEMS
}

/**
 * Split the listing items around the frozen insertion point: `before` holds
 * items 1–6 (rendered in the untouched card grid), `after` holds item 7+ (the
 * strip renders between the two grids). Pure so pages stay declarative.
 */
export function splitForListingStrip<T>(items: readonly T[]): { before: T[]; after: T[] } {
  return {
    before: items.slice(0, AFFILIATE_LISTING_INSERT_AFTER),
    after: items.slice(AFFILIATE_LISTING_INSERT_AFTER),
  }
}

/**
 * Analytics context for listing-strip clicks, reusing the M1 `affiliate_click`
 * event unchanged: `content_type` keeps the M1 union ('news' | 'article') and
 * the listing surface is identified by the stable pseudo-slug below (mirrors
 * the news_list_banner social box's "news-list" content id convention).
 */
export const AFFILIATE_LISTING_CONTENT: Record<
  AffiliateListingKey,
  { contentType: 'news' | 'article'; contentSlug: string }
> = {
  news_list: { contentType: 'news', contentSlug: 'news-list' },
  articles_list: { contentType: 'article', contentSlug: 'articles-list' },
}

// ─── Defaults + normalization ───────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Both slots ship disabled with no collection — listings unchanged by default. */
export const AFFILIATE_LISTING_DEFAULTS: Record<AffiliateListingKey, AffiliateListingSlotConfig> = {
  news_list: { listing_key: 'news_list', enabled: false, collection_id: null },
  articles_list: { listing_key: 'articles_list', enabled: false, collection_id: null },
}

/**
 * Merge a raw DB row (or partial config) over the slot defaults. Any malformed
 * key falls back to the default — a broken config row can never break a listing
 * page (it just renders no strip).
 */
export function normalizeAffiliateListingSlot(raw: any, listing_key: AffiliateListingKey): AffiliateListingSlotConfig {
  const fallback = AFFILIATE_LISTING_DEFAULTS[listing_key]
  const id = typeof raw?.collection_id === 'string' ? raw.collection_id.trim() : ''
  return {
    listing_key,
    enabled: raw?.enabled === true,
    collection_id: id && UUID_REGEX.test(id) ? id : null,
  }
}

function cleanSlotInput(raw: any): AffiliateListingSlotInput {
  const id = typeof raw?.collection_id === 'string' ? raw.collection_id.trim() : ''
  return {
    enabled: raw?.enabled === true,
    collection_id: id && UUID_REGEX.test(id) ? id : null,
  }
}

export interface AffiliateListingSettingsValidationResult {
  ok: boolean
  errors: Partial<Record<AffiliateListingKey, string>>
  clean: Record<AffiliateListingKey, AffiliateListingSlotInput> | null
}

/**
 * Validate the admin save payload: BOTH slots must be present (the settings
 * page always submits the full form so a stale client can never silently
 * disable one listing while meaning to save the other). Mirrors the M1
 * permissive semantics: `enabled` without a collection is saveable — the strip
 * simply renders nothing until a collection is set (render-time guard, same
 * contract as the M1 rail).
 */
export function validateAffiliateListingSettings(raw: any): AffiliateListingSettingsValidationResult {
  const errors: Partial<Record<AffiliateListingKey, string>> = {}
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: { news_list: 'รูปแบบการตั้งค่าไม่ถูกต้อง' }, clean: null }
  }
  for (const key of AFFILIATE_LISTING_KEYS) {
    if (!raw[key] || typeof raw[key] !== 'object') {
      errors[key] = 'ต้องส่งข้อมูลครบทั้งสองรายการ (ข่าว และ บทความ)'
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, clean: null }

  return {
    ok: true,
    errors: {},
    clean: {
      news_list: cleanSlotInput(raw.news_list),
      articles_list: cleanSlotInput(raw.articles_list),
    },
  }
}
