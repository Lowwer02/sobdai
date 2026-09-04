/**
 * Affiliate M1 — types + server-side validation (single contract).
 *
 * Mirrors the lib/news.ts split: pure logic here, thin `'use server'` wrappers
 * in app/admin/affiliate/actions.ts. Two validation tiers follow the frozen CMS
 * IA rule that drafts are forgiving while publishing is gated:
 *
 *   - validateAffiliateProductDraft     → loose: only `name` is required
 *   - validateAffiliateProductForPublish → strict: name + https affiliate_url
 *                                           + https image_url (+ merchant)
 *
 * URL SAFETY (the load-bearing rule): every outbound affiliate URL must be
 * HTTPS. cleanAffiliateUrl() is the single coercion point — it rejects
 * non-https schemes (javascript:, data:, http:), URLs with embedded
 * credentials, hosts without a dot (localhost / intranet names), control
 * characters, and over-length inputs. It deliberately does NOT hard-lock to a
 * Shopee hostname: merchants are extensible by design.
 *
 * Content wiring: news/articles each gained `affiliate_enabled` +
 * `affiliate_collection_id` (migration 085). coerceAffiliateContentFields() is
 * the shared coercion both content validators call so a malformed collection id
 * can never reach the DB (Postgres would 22P02 on a non-uuid FK value).
 *
 * No DB, no `'use server'`, hand-written coercion (no zod — matches the rest
 * of the codebase).
 */

export type AffiliateStatus = 'draft' | 'published' | 'archived'

export const AFFILIATE_STATUSES: { value: AffiliateStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

/** Max products rendered in the public rail (spec: 3–5, hard cap 5). */
export const AFFILIATE_MAX_RAIL_PRODUCTS = 5

/** Max products a collection may hold (editorial bound for the picker). */
export const AFFILIATE_MAX_COLLECTION_ITEMS = 12

/** Default merchant (M1 is Shopee-first, but the field is extensible). */
export const DEFAULT_MERCHANT = 'shopee'

/** Public Affiliate surface context used by the shared click contract. */
export type AffiliateContentType = 'news' | 'article' | 'daily'

/** Stable placement values shared by M1, M2, and Daily completion Picks. */
export type AffiliateClickPlacement =
  | 'sidebar'
  | 'inline_mobile'
  | 'listing_strip'
  | 'daily_complete'

/** Thai display labels for known merchants; unknown slugs render capitalized. */
const MERCHANT_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
}

export function merchantLabel(merchant: string): string {
  const key = (merchant || '').trim().toLowerCase()
  if (MERCHANT_LABELS[key]) return MERCHANT_LABELS[key]
  if (!key) return 'พันธมิตร'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

const MAX = {
  name: 200,
  image_url: 1000,
  image_alt: 300,
  merchant: 40,
  affiliate_url: 2048,
  short_description: 320,
  tag: 40,
  collection_name: 120,
}

const MAX_TAGS = 8

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AffiliateProduct {
  id: string
  name: string
  image_url: string | null
  image_alt: string | null
  merchant: string
  affiliate_url: string
  short_description: string | null
  tags: string[]
  status: AffiliateStatus
  created_at: string
  updated_at: string
}

/** Shape accepted by product create/update (no server-generated fields). */
export interface AffiliateProductInput {
  name: string
  image_url: string | null
  image_alt: string | null
  merchant: string
  affiliate_url: string | null
  short_description: string | null
  tags: string[]
}

export interface AffiliateCollection {
  id: string
  name: string
  status: AffiliateStatus
  created_at: string
  updated_at: string
}

export interface AffiliateCollectionInput {
  name: string
}

/** Row the public rail renders (subset of AffiliateProduct). */
export interface AffiliateRailProduct {
  id: string
  name: string
  image_url: string
  image_alt: string | null
  merchant: string
  affiliate_url: string
  short_description: string | null
}

export interface AffiliateProductValidationResult {
  ok: boolean
  errors: Record<string, string>
  clean: AffiliateProductInput | null
}

export interface AffiliateCollectionValidationResult {
  ok: boolean
  errors: Record<string, string>
  clean: AffiliateCollectionInput | null
}

// ─── URL safety ─────────────────────────────────────────────────────────────

/**
 * Coerce an outbound/external URL into a safe HTTPS URL, or null.
 *
 * Rules (never throws):
 *   - strip control characters + trim
 *   - hard length cap (2048) BEFORE parsing (DoS-safe)
 *   - must parse, protocol must be exactly https:
 *   - reject embedded credentials (user:pass@host)
 *   - reject dotless hosts (localhost, intranet names) — public hostnames only
 *   - returns the ORIGINAL trimmed string (not URL.toString()) so affiliate
 *     tracking parameters survive byte-for-byte; the parse is validation only
 */
export function cleanAffiliateUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const trimmed = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!trimmed) return null
  if (trimmed.length > 2048) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (!parsed.hostname || !parsed.hostname.includes('.')) return null
  return trimmed
}

// ─── Field coercion ─────────────────────────────────────────────────────────

function str(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  return null
}

function optStr(val: unknown, cap: number): string | null {
  const s = str(val)
  return s ? s.slice(0, cap) : null
}

export function coerceMerchant(raw: unknown): string {
  const s = optStr(raw, MAX.merchant)
  if (!s) return DEFAULT_MERCHANT
  return s.toLowerCase().replace(/\s+/g, '-')
}

/** Parse tags from an array or comma-separated string; trim, dedupe, cap. */
export function cleanAffiliateTags(raw: unknown): string[] {
  let list: string[] = []
  if (Array.isArray(raw)) {
    list = raw.map((item) => String(item ?? ''))
  } else if (typeof raw === 'string') {
    list = raw.split(/[,,\n]/)
  }
  const cleaned = list.map((t) => t.trim()).filter((t) => t.length > 0)
  return Array.from(new Set(cleaned)).slice(0, MAX_TAGS).map((t) => t.slice(0, MAX.tag))
}

/**
 * Shared coercion for the news/articles wiring columns. Invalid/absent ids
 * coerce to null; enabled coerces to a strict boolean. Used by both content
 * validators so the affiliate fields can never corrupt a content save.
 */
export function coerceAffiliateContentFields(raw: any): {
  affiliate_enabled: boolean
  affiliate_collection_id: string | null
} {
  const id = str(raw?.affiliate_collection_id)
  return {
    affiliate_enabled: raw?.affiliate_enabled === true,
    affiliate_collection_id: id && UUID_REGEX.test(id) ? id : null,
  }
}

// ─── Product validation ─────────────────────────────────────────────────────

function coerceProduct(raw: any): AffiliateProductInput {
  return {
    name: optStr(raw?.name, MAX.name) ?? '',
    image_url: optStr(raw?.image_url, MAX.image_url),
    image_alt: optStr(raw?.image_alt, MAX.image_alt),
    merchant: coerceMerchant(raw?.merchant),
    affiliate_url: optStr(raw?.affiliate_url, MAX.affiliate_url),
    short_description: optStr(raw?.short_description, MAX.short_description),
    tags: cleanAffiliateTags(raw?.tags),
  }
}

/**
 * DRAFT save (loose): only `name` is required so an editor can capture a
 * product lead without friction. URLs are validated only when present.
 */
export function validateAffiliateProductDraft(raw: any): AffiliateProductValidationResult {
  const errors: Record<string, string> = {}
  const input = coerceProduct(raw)

  if (!input.name) errors.name = 'ต้องระบุชื่อสินค้า'
  if (input.affiliate_url && !cleanAffiliateUrl(input.affiliate_url)) {
    errors.affiliate_url = 'ลิงก์พันธมิตรต้องเป็น https:// ที่ถูกต้อง'
  }
  if (input.image_url && !cleanAffiliateUrl(input.image_url)) {
    errors.image_url = 'รูปสินค้าต้องเป็น https:// ที่ถูกต้อง'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, clean: null }
  return { ok: true, errors: {}, clean: input }
}

/**
 * PUBLISH gate (strict): a published product is publicly clickable, so it must
 * have a safe HTTPS affiliate URL AND an HTTPS image (the rail renders a
 * thumbnail; a product without an image would break the compact card contract).
 */
export function validateAffiliateProductForPublish(raw: any): AffiliateProductValidationResult {
  const errors: Record<string, string> = {}
  const input = coerceProduct(raw)

  if (!input.name) errors.name = 'ต้องระบุชื่อสินค้า'
  if (!input.affiliate_url) {
    errors.affiliate_url = 'ต้องระบุลิงก์พันธมิตรก่อนเผยแพร่'
  } else if (!cleanAffiliateUrl(input.affiliate_url)) {
    errors.affiliate_url = 'ลิงก์พันธมิตรต้องเป็น https:// ที่ถูกต้อง'
  }
  if (!input.image_url) {
    errors.image_url = 'ต้องระบุรูปสินค้าก่อนเผยแพร่'
  } else if (!cleanAffiliateUrl(input.image_url)) {
    errors.image_url = 'รูปสินค้าต้องเป็น https:// ที่ถูกต้อง'
  }
  if (!input.merchant) errors.merchant = 'ต้องระบุร้านค้า/แพลตฟอร์ม'

  if (Object.keys(errors).length > 0) return { ok: false, errors, clean: null }
  return { ok: true, errors: {}, clean: input }
}

// ─── Collection validation ──────────────────────────────────────────────────

/** DRAFT save: a collection only needs a name; items attach in the editor. */
export function validateAffiliateCollectionDraft(raw: any): AffiliateCollectionValidationResult {
  const errors: Record<string, string> = {}
  const name = optStr(raw?.name, MAX.collection_name) ?? ''
  if (!name) errors.name = 'ต้องระบุชื่อคอลเลกชัน'
  if (Object.keys(errors).length > 0) return { ok: false, errors, clean: null }
  return { ok: true, errors: {}, clean: { name } }
}

/**
 * PUBLISH gate inputs for a collection: name plus the ordered product ids.
 * The action feeds the stored row + live junction; an empty collection cannot
 * publish (the rail contract is "render nothing when no valid products", and a
 * published-but-empty collection would only confuse editors).
 */
export function validateAffiliateCollectionForPublish(
  raw: any,
  productIds: string[]
): AffiliateCollectionValidationResult {
  const base = validateAffiliateCollectionDraft(raw)
  if (!base.ok) return base
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { ok: false, errors: { items: 'ต้องเลือกอย่างน้อย 1 สินค้าก่อนเผยแพร่' }, clean: null }
  }
  return base
}

// ─── Misc shared helpers ────────────────────────────────────────────────────

export function isAffiliateStatus(v: unknown): v is AffiliateStatus {
  return v === 'draft' || v === 'published' || v === 'archived'
}
