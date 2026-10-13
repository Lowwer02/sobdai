export const POSITION_ENTITY_NAME = 'นักวิเคราะห์นโยบายและแผน'
export const POSITION_ENTITY_SLUG = 'policy-and-plan-analyst'
export const POSITION_ENTITY_STATUS_VALUES = ['draft', 'published', 'archived'] as const
export const MIN_POSITION_OVERVIEW_CHARS = 80

export type PositionEntityStatus = (typeof POSITION_ENTITY_STATUS_VALUES)[number]

export interface PositionSource {
  label: string
  url: string
}

export interface PositionEditorialIdentity {
  id: string
  name: string
  slug?: string | null
  overview_markdown?: string | null
}

export interface PositionEntityIndexRecord extends PositionEditorialIdentity {
  status: string
  sources: unknown
}

export interface PositionIndexSignals {
  packageCount: number
  newsCount: number
  articleCount: number
  uniqueEditorialOverview: boolean
  uniquePrimaryIntent: boolean
}

export interface PositionSeoRecord {
  name?: string | null
  slug: string
  overview_markdown?: string | null
  seo_title?: string | null
  seo_description?: string | null
}

export interface PositionSeoContract {
  title: string
  description: string
  path: string
  noindex: boolean
  follow: true
}

/** Normalize editor-entered text before comparing editorial identity fields. */
export function normalizePositionText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
    : ''
}

export function isPositionEntityStatus(value: unknown): value is PositionEntityStatus {
  return typeof value === 'string' && POSITION_ENTITY_STATUS_VALUES.includes(value as PositionEntityStatus)
}

/**
 * Canonical Position slugs are editor-owned and deliberately ASCII-only.
 * This keeps published URLs stable and avoids transliteration drift.
 */
export function isStablePositionSlug(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const slug = value.trim()
  return slug.length > 0 && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

/** Exclude the legacy GEN/General Position family from canonical SEO pages. */
export function isPositionPlaceholderName(value: unknown): boolean {
  const name = normalizePositionText(value).toLowerCase()
  if (!name) return true
  return (
    name === 'gen' ||
    name === 'general' ||
    name === 'general position' ||
    name === 'ไม่ระบุ' ||
    name === 'ไม่ระบุตำแหน่ง' ||
    /^gen(?:\b|[-_\s])/.test(name) ||
    name.includes('general position')
  )
}

export interface PositionMappingCandidate {
  id: string
  code?: string | null
  name?: string | null
  organization_id?: string | null
  position_entity_id?: string | null
}

/** Keep operational placeholder rows out of canonical Position mappings. */
export function isOperationalPositionPlaceholder(
  position: Pick<PositionMappingCandidate, 'code' | 'name'>,
): boolean {
  return [position.code, position.name].some(
    (value) => typeof value === 'string' && value.trim().length > 0 && isPositionPlaceholderName(value),
  )
}

/**
 * Mirror the mapping RPC's placeholder predicate as AND-complemented PostgREST
 * filters. `imatch` is the case-insensitive form of the RPC's `^gen...` regex;
 * the exact-name and "general position" families use `ilike`. Leading/trailing
 * whitespace is not trimmed here (unlike the RPC's btrim), so the mapping
 * write path must still re-validate every selected row with
 * isOperationalPositionPlaceholder before the RPC runs.
 */
export function excludePlaceholderPositions<
  Q extends { not(column: string, operator: string, value: string): Q },
>(query: Q): Q {
  return query
    .not('code', 'imatch', '^gen([[:space:]_-]|$)')
    .not('name', 'imatch', '^gen([[:space:]_-]|$)')
    .not('code', 'ilike', '%general position%')
    .not('name', 'ilike', '%general position%')
    .not('code', 'ilike', 'gen')
    .not('name', 'ilike', 'gen')
    .not('code', 'ilike', 'general')
    .not('name', 'ilike', 'general')
    .not('code', 'ilike', 'general position')
    .not('name', 'ilike', 'general position')
    .not('code', 'ilike', 'ไม่ระบุ')
    .not('name', 'ilike', 'ไม่ระบุ')
    .not('code', 'ilike', 'ไม่ระบุตำแหน่ง')
    .not('name', 'ilike', 'ไม่ระบุตำแหน่ง')
}

/** One search-results page of the admin mapping picker (server-enforced cap). */
export const POSITION_MAPPING_SEARCH_PAGE_SIZE = 20

/**
 * Pre-RPC validation fetches selected positions in ID batches so no single
 * PostgREST GET URL grows past gateway limits, even at the 2,000-position cap.
 */
export const POSITION_MAPPING_VALIDATION_BATCH_SIZE = 100

/**
 * Split IDs into ordered batches of at most `size` entries. Order and
 * multiplicity are preserved; flattening the batches reproduces the input
 * exactly once, so callers can diff coverage against the requested set.
 */
export function chunkPositionIds(ids: readonly string[], size: number): string[][] {
  const batchSize = Number.isInteger(size) && size > 0 ? size : 1
  const batches: string[][] = []
  for (let index = 0; index < ids.length; index += batchSize) {
    batches.push(ids.slice(index, index + batchSize))
  }
  return batches
}

export interface PositionMappingDiff {
  addedIds: string[]
  removedIds: string[]
  unchanged: boolean
}

/**
 * Compare the loaded (database) mapping set against the editor's intended set.
 * The RPC is a full replacement, so the saved outcome is exactly the intended
 * set — hidden/offscreen selected rows included — and anything loaded but no
 * longer intended is removed. Diffing before save makes that replacement
 * explicit instead of accidental.
 */
export function computeMappingDiff(
  loadedIds: readonly string[],
  intendedIds: readonly string[],
): PositionMappingDiff {
  const loaded = new Set(loadedIds)
  const intended = new Set(intendedIds)
  const addedIds: string[] = []
  const removedIds: string[] = []

  for (const id of intended) {
    if (!loaded.has(id)) addedIds.push(id)
  }
  for (const id of loaded) {
    if (!intended.has(id)) removedIds.push(id)
  }

  return {
    addedIds,
    removedIds,
    unchanged: addedIds.length === 0 && removedIds.length === 0,
  }
}

export type PositionMappingValidation =
  | { valid: true; positionIds: string[] }
  | {
      valid: false
      reason: 'missing_entity' | 'duplicate_position' | 'missing_position' | 'placeholder' | 'conflict'
      positionId?: string
    }

/** Validate a requested mapping set before the database transaction runs. */
export function validatePositionMappingSelection(
  entityId: string | null | undefined,
  requestedPositionIds: readonly string[],
  positions: readonly PositionMappingCandidate[],
): PositionMappingValidation {
  if (!entityId) return { valid: false, reason: 'missing_entity' }

  const positionIds = requestedPositionIds.map((id) => id.trim())
  if (new Set(positionIds).size !== positionIds.length) {
    return { valid: false, reason: 'duplicate_position' }
  }

  const byId = new Map(positions.map((position) => [position.id, position]))
  for (const positionId of positionIds) {
    const position = byId.get(positionId)
    if (!position) return { valid: false, reason: 'missing_position', positionId }
    if (isOperationalPositionPlaceholder(position)) {
      return { valid: false, reason: 'placeholder', positionId }
    }
    if (position.position_entity_id && position.position_entity_id !== entityId) {
      return { valid: false, reason: 'conflict', positionId }
    }
  }

  return { valid: true, positionIds }
}

function readableOverview(value: unknown): string {
  return normalizePositionText(value)
    .replace(/[`*_>#\[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A conservative editorial-content threshold used by the index gate. */
export function isMeaningfulPositionOverview(value: unknown): boolean {
  return readableOverview(value).length >= MIN_POSITION_OVERVIEW_CHARS
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * Normalize the small JSONB source contract used by Position entities.
 * Unknown or unsafe entries are ignored so public rendering never emits an
 * unsafe link. Editorially selected HTTPS sources are the authority signal.
 */
export function normalizePositionSources(value: unknown): PositionSource[] {
  if (!Array.isArray(value)) return []

  const sources: PositionSource[] = []
  for (const candidate of value) {
    if (typeof candidate === 'string') {
      const url = candidate.trim()
      if (isHttpsUrl(url)) sources.push({ label: url, url })
      continue
    }

    if (!candidate || typeof candidate !== 'object') continue
    const row = candidate as Record<string, unknown>
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    if (!isHttpsUrl(url)) continue

    const label = normalizePositionText(row.label || row.title || row.name) || url
    sources.push({ label, url })
  }

  return sources
}

export function hasAuthoritativePositionSource(value: unknown): boolean {
  return normalizePositionSources(value).length > 0
}

export function parsePositionSourcesJson(raw: unknown):
  | { ok: true; sources: PositionSource[] }
  | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: true, sources: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'แหล่งอ้างอิงต้องเป็น JSON array ที่ถูกต้อง' }
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'แหล่งอ้างอิงต้องเป็น JSON array' }
  }

  if (parsed.length > 20) {
    return { ok: false, error: 'แหล่งอ้างอิงมีได้ไม่เกิน 20 รายการ' }
  }

  const sources = normalizePositionSources(parsed)
  if (sources.length !== parsed.length) {
    return { ok: false, error: 'แหล่งอ้างอิงทุกรายการต้องมีลิงก์ HTTPS ที่ถูกต้อง' }
  }

  return { ok: true, sources }
}

export function serializePositionSources(value: unknown): string {
  return JSON.stringify(normalizePositionSources(value), null, 2)
}

export function hasUniquePositionOverview(
  entity: PositionEditorialIdentity,
  peers: readonly PositionEditorialIdentity[],
): boolean {
  const overview = readableOverview(entity.overview_markdown)
  if (!overview) return false

  return peers.every((peer) => {
    if (peer.id === entity.id) return true
    const peerOverview = readableOverview(peer.overview_markdown)
    return !peerOverview || peerOverview !== overview
  })
}

/**
 * Entity names are the editorial intent key for V1. Two canonical entities
 * with the same normalized name would compete for the same search intent.
 */
export function hasUniquePositionIntent(
  entity: PositionEditorialIdentity,
  peers: readonly PositionEditorialIdentity[],
): boolean {
  const name = normalizePositionText(entity.name).toLowerCase()
  if (!name || isPositionPlaceholderName(name)) return false

  return peers.every((peer) => {
    if (peer.id === entity.id) return true
    return normalizePositionText(peer.name).toLowerCase() !== name
  })
}

/**
 * Single source of truth for the Position index-readiness gate. A published
 * row can render without being index-qualified; callers use the resulting
 * boolean for robots, hub inclusion, and sitemap inclusion.
 */
export function isPositionEntityIndexReady(
  entity: PositionEntityIndexRecord,
  signals: PositionIndexSignals,
  peers: readonly PositionEditorialIdentity[] = [],
): boolean {
  const uniqueOverview = peers.length > 0
    ? hasUniquePositionOverview(entity, peers)
    : signals.uniqueEditorialOverview
  const uniqueIntent = peers.length > 0
    ? hasUniquePositionIntent(entity, peers)
    : signals.uniquePrimaryIntent

  return (
    entity.status === 'published' &&
    isStablePositionSlug(entity.slug) &&
    !isPositionPlaceholderName(entity.name) &&
    isMeaningfulPositionOverview(entity.overview_markdown) &&
    uniqueOverview &&
    hasAuthoritativePositionSource(entity.sources) &&
    signals.packageCount >= 1 &&
    signals.newsCount + signals.articleCount >= 2 &&
    signals.articleCount >= 1 &&
    uniqueIntent
  )
}

export function positionIndexability(indexReady: boolean): {
  index: boolean
  follow: true
  includeInSitemap: boolean
} {
  return {
    index: indexReady,
    follow: true,
    includeInSitemap: indexReady,
  }
}

export function selectPositionPageBySlug<T extends { entity: { slug: string } }>(
  pages: readonly T[],
  slug: unknown,
): T | null {
  const cleanSlug = typeof slug === 'string' ? slug.trim() : ''
  return cleanSlug ? pages.find((page) => page.entity.slug === cleanSlug) ?? null : null
}

export function selectIndexablePositionPages<T extends { indexReady: boolean }>(
  pages: readonly T[],
): T[] {
  return pages.filter((page) => page.indexReady)
}

export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

/** Resolve published Package IDs from organization-scoped Position rows. */
export function derivePublishedPositionPackageIds(
  positionIds: readonly string[],
  packages: readonly {
    id: string
    position_id?: string | null
    is_published?: unknown
  }[],
): string[] {
  const allowedPositions = new Set(positionIds)
  return dedupeById(
    selectPublishedPackages(packages).filter(
      (pkg) => typeof pkg.position_id === 'string' && allowedPositions.has(pkg.position_id),
    ),
  ).map((pkg) => pkg.id)
}

/** Resolve distinct published-content relation IDs without exposing junction rows. */
export function derivePublishedPositionContentIds(
  packageIds: readonly string[],
  relations: readonly {
    package_id: string
    content_id?: string | null
  }[],
): string[] {
  const allowedPackages = new Set(packageIds)
  return dedupeById(
    relations
      .filter((relation) => allowedPackages.has(relation.package_id) && Boolean(relation.content_id))
      .map((relation) => ({ id: relation.content_id as string })),
  ).map((relation) => relation.id)
}

export function selectPublishedPackages<T extends { is_published?: unknown }>(items: readonly T[]): T[] {
  return items.filter((item) => item.is_published === true)
}

export function selectPublishedPositionContent<T extends { status?: unknown }>(items: readonly T[]): T[] {
  return items.filter((item) => item.status === 'published')
}

export function sortPositionContent<T extends {
  id: string
  published_at?: string | null
  updated_at?: string | null
}>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftPublished = left.published_at || ''
    const rightPublished = right.published_at || ''
    if (leftPublished !== rightPublished) return rightPublished.localeCompare(leftPublished)

    const leftUpdated = left.updated_at || ''
    const rightUpdated = right.updated_at || ''
    if (leftUpdated !== rightUpdated) return rightUpdated.localeCompare(leftUpdated)
    return right.id.localeCompare(left.id)
  })
}

export function buildPositionSeoTitle(
  entity: PositionSeoRecord,
  siteName = 'Sobdai',
): string {
  const explicit = normalizePositionText(entity.seo_title)
  if (explicit) return explicit
  return `${normalizePositionText(entity.name) || 'ตำแหน่งงานราชการ'} | ${siteName}`
}

export function buildPositionSeoDescription(entity: PositionSeoRecord): string {
  const explicit = normalizePositionText(entity.seo_description)
  if (explicit) return explicit

  const overview = readableOverview(entity.overview_markdown)
  if (overview) return overview.length > 158 ? `${overview.slice(0, 157).trim()}…` : overview

  return `ข้อมูลตำแหน่ง${normalizePositionText(entity.name) || 'งานราชการ'} และเนื้อหาที่เกี่ยวข้องจาก Sobdai`
}

export function buildPositionSeoContract(
  entity: PositionSeoRecord,
  indexReady: boolean,
  siteName = 'Sobdai',
): PositionSeoContract {
  const indexability = positionIndexability(indexReady)
  return {
    title: buildPositionSeoTitle(entity, siteName),
    description: buildPositionSeoDescription(entity),
    path: `/positions/${encodeURIComponent(entity.slug)}`,
    noindex: !indexability.index,
    follow: true,
  }
}
