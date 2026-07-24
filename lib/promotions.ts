/**
 * Promotion Management Foundation — types + server-side validation.
 *
 * This module is the single contract for the promotion entity, shared by the
 * admin forms and the server actions. It enforces the validation rules:
 *   - required fields
 *   - start_at < end_at (when both present)
 *   - URL format for button_link when link_type = external
 *   - enum values for type / status / link_type
 *
 * Foundation only: no scheduling enforcement, no rendering. The schema stores
 * start_at/end_at but they are only validated for ordering here, never for
 * "is it live right now".
 */

export type PromotionType =
  | 'promotion'
  | 'announcement'
  | 'new_feature'
  | 'maintenance'
  | 'campaign'

export type PromotionStatus = 'draft' | 'published' | 'archived'

export type LinkType = 'internal' | 'external'

/**
 * Placement slot (where the promotion renders). Known value 'homepage' gets
 * full literal autocomplete; the intersected `string & {}` keeps the type
 * open so future placements (sidebar, hero, post-purchase, ...) are a pure
 * data concern and don't require a type edit here. (No CHECK constraint at
 * the DB level — by design.)
 */
export type Placement = 'homepage' | (string & {})

export interface Promotion {
  id: string
  internal_name: string
  type: PromotionType
  status: PromotionStatus
  title: string
  subtitle: string | null
  description: string | null
  image_url: string | null
  button_text: string | null
  button_link: string | null
  link_type: LinkType
  open_in_new_tab: boolean
  priority: number
  display_order: number
  start_at: string | null
  end_at: string | null
  active: boolean
  placement: Placement
  created_at: string
  updated_at: string
}

/** Shape accepted by create/update (no server-generated fields). */
export interface PromotionInput {
  internal_name: string
  type: PromotionType
  status: PromotionStatus
  title: string
  subtitle?: string | null
  description?: string | null
  image_url?: string | null
  button_text?: string | null
  button_link?: string | null
  link_type: LinkType
  open_in_new_tab: boolean
  priority: number
  display_order: number
  start_at?: string | null
  end_at?: string | null
  active: boolean
}

export const PROMOTION_TYPES: { value: PromotionType; label: string }[] = [
  { value: 'promotion', label: 'Promotion' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'new_feature', label: 'New Feature' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'campaign', label: 'Campaign' },
]

export const PROMOTION_STATUSES: { value: PromotionStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const VALID_TYPES = new Set<PromotionType>([
  'promotion', 'announcement', 'new_feature', 'maintenance', 'campaign',
])
const VALID_STATUSES = new Set<PromotionStatus>(['draft', 'published', 'archived'])
const VALID_LINK_TYPES = new Set<LinkType>(['internal', 'external'])

const MAX = {
  internal_name: 120,
  title: 200,
  subtitle: 300,
  description: 1000,
  image_url: 500,
  button_text: 60,
  button_link: 500,
}

export interface ValidationResult {
  ok: boolean
  errors: Record<string, string>
  /** Cleaned/coerced input safe to persist. */
  clean: PromotionInput | null
}

/**
 * Validate + coerce raw form input into a safe PromotionInput.
 * Returns { ok, errors, clean }. Callers MUST check `ok` before persisting.
 */
export function validatePromotion(raw: any): ValidationResult {
  const errors: Record<string, string> = {}

  // --- required strings
  const internal_name = str(raw.internal_name)
  if (!internal_name) errors.internal_name = 'ต้องระบุชื่อภายใน'
  else if (internal_name.length > MAX.internal_name) errors.internal_name = `ไม่เกิน ${MAX.internal_name} ตัวอักษร`

  const title = str(raw.title)
  if (!title) errors.title = 'ต้องระบุ Title'
  else if (title.length > MAX.title) errors.title = `ไม่เกิน ${MAX.title} ตัวอักษร`

  // --- enums
  const type = raw.type as PromotionType
  if (!VALID_TYPES.has(type)) errors.type = 'ประเภทไม่ถูกต้อง'

  const status = (raw.status as PromotionStatus) || 'draft'
  if (!VALID_STATUSES.has(status)) errors.status = 'สถานะไม่ถูกต้อง'

  const link_type = (raw.link_type as LinkType) || 'internal'
  if (!VALID_LINK_TYPES.has(link_type)) errors.link_type = 'ประเภทลิงก์ไม่ถูกต้อง'

  // --- optional bounded strings
  const subtitle = optStr(raw.subtitle, MAX.subtitle)
  const description = optStr(raw.description, MAX.description)
  const image_url = optStr(raw.image_url, MAX.image_url)
  const button_text = optStr(raw.button_text, MAX.button_text)

  // --- button_link: required IF button_text is set; URL check for external.
  const button_link_raw = optStr(raw.button_link, MAX.button_link)
  let button_link = button_link_raw
  if (button_text && !button_link) {
    errors.button_link = 'ต้องระบุลิงก์เมื่อมีข้อความปุ่ม'
  } else if (button_link && link_type === 'external' && !isHttpUrl(button_link)) {
    errors.button_link = 'URL ไม่ถูกต้อง (ต้องเป็น http/https)'
  }

  // --- numbers
  const priority = int(raw.priority, 0)
  const display_order = int(raw.display_order, 0)

  // --- booleans
  const open_in_new_tab = raw.open_in_new_tab === true || raw.open_in_new_tab === 'on' || raw.open_in_new_tab === 'true'
  const active = raw.active === true || raw.active === 'on' || raw.active === 'true' || raw.active === undefined

  // --- scheduling: start < end (only when both present)
  const start_at = raw.start_at ? String(raw.start_at) : null
  const end_at = raw.end_at ? String(raw.end_at) : null
  if (start_at && end_at) {
    const s = new Date(start_at).getTime()
    const e = new Date(end_at).getTime()
    if (isNaN(s) || isNaN(e)) {
      errors.start_at = 'วันที่ไม่ถูกต้อง'
    } else if (s >= e) {
      errors.end_at = 'วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น'
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, clean: null }
  }

  const clean: PromotionInput = {
    internal_name: internal_name!,
    type,
    status,
    title: title!,
    subtitle,
    description,
    image_url,
    button_text,
    button_link,
    link_type,
    open_in_new_tab: link_type === 'external' ? open_in_new_tab : false,
    priority,
    display_order,
    start_at,
    end_at,
    active,
  }

  return { ok: true, errors: {}, clean }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}
function optStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}
function int(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}
function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
