export const AGENCY_PROFILE_STATUS_VALUES = ['draft', 'published', 'archived'] as const
export const MIN_AGENCY_OVERVIEW_CHARS = 80

export type AgencyProfileStatus = (typeof AGENCY_PROFILE_STATUS_VALUES)[number]

export interface AgencySource {
  label: string
  url: string
}

export interface AgencyEditorialIdentity {
  id: string
  name: string
  slug?: string | null
  overview_markdown?: string | null
}

export interface AgencyProfileIndexRecord extends AgencyEditorialIdentity {
  organization_id: string | null
  status: string
  sources: unknown
}

export interface AgencyIndexSignals {
  /** Meaningful (non-placeholder) operational positions under the agency. */
  positionCount: number
  packageCount: number
  newsCount: number
  articleCount: number
  uniqueEditorialOverview: boolean
  uniquePrimaryIntent: boolean
}

export interface AgencySeoRecord {
  name?: string | null
  slug: string
  overview_markdown?: string | null
  seo_title?: string | null
  seo_description?: string | null
}

export interface AgencySeoContract {
  title: string
  description: string
  path: string
  noindex: boolean
  follow: true
}

/** Normalize editor-entered text before comparing editorial identity fields. */
export function normalizeAgencyText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
    : ''
}

export function isAgencyProfileStatus(value: unknown): value is AgencyProfileStatus {
  return typeof value === 'string' && AGENCY_PROFILE_STATUS_VALUES.includes(value as AgencyProfileStatus)
}

/**
 * Canonical Agency slugs are editor-owned and deliberately ASCII-only,
 * matching the Position Entity convention. This keeps published URLs stable
 * and avoids transliteration drift.
 */
export function isStableAgencySlug(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const slug = value.trim()
  return slug.length > 0 && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

/**
 * Placeholder guard for canonical agency identity. Organizations carry no
 * GEN legacy (unlike operational positions), so this stays minimal: blank or
 * explicit "unspecified agency" labels only.
 */
export function isAgencyPlaceholderName(value: unknown): boolean {
  const name = normalizeAgencyText(value).toLowerCase()
  if (!name) return true
  return (
    name === 'organization' ||
    name === 'agency' ||
    name === 'test' ||
    name === 'ไม่ระบุ' ||
    name === 'ไม่ระบุหน่วยงาน'
  )
}

function readableOverview(value: unknown): string {
  return normalizeAgencyText(value)
    .replace(/[`*_>#\[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A conservative editorial-content threshold used by the index gate. */
export function isMeaningfulAgencyOverview(value: unknown): boolean {
  return readableOverview(value).length >= MIN_AGENCY_OVERVIEW_CHARS
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
 * Normalize the small JSONB source contract used by Agency profiles.
 * Unknown or unsafe entries are ignored so public rendering never emits an
 * unsafe link. Editorially selected HTTPS sources are the authority signal.
 */
export function normalizeAgencySources(value: unknown): AgencySource[] {
  if (!Array.isArray(value)) return []

  const sources: AgencySource[] = []
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

    const label = normalizeAgencyText(row.label || row.title || row.name) || url
    sources.push({ label, url })
  }

  return sources
}

export function hasAuthoritativeAgencySource(value: unknown): boolean {
  return normalizeAgencySources(value).length > 0
}

export function parseAgencySourcesJson(raw: unknown):
  | { ok: true; sources: AgencySource[] }
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

  const sources = normalizeAgencySources(parsed)
  if (sources.length !== parsed.length) {
    return { ok: false, error: 'แหล่งอ้างอิงทุกรายการต้องมีลิงก์ HTTPS ที่ถูกต้อง' }
  }

  return { ok: true, sources }
}

export function serializeAgencySources(value: unknown): string {
  return JSON.stringify(normalizeAgencySources(value), null, 2)
}

export function hasUniqueAgencyOverview(
  profile: AgencyEditorialIdentity,
  peers: readonly AgencyEditorialIdentity[],
): boolean {
  const overview = readableOverview(profile.overview_markdown)
  if (!overview) return false

  return peers.every((peer) => {
    if (peer.id === profile.id) return true
    const peerOverview = readableOverview(peer.overview_markdown)
    return !peerOverview || peerOverview !== overview
  })
}

/**
 * Organization names are the editorial intent key for V1. Two canonical
 * agencies with the same normalized name would compete for the same search
 * intent.
 */
export function hasUniqueAgencyIntent(
  profile: AgencyEditorialIdentity,
  peers: readonly AgencyEditorialIdentity[],
): boolean {
  const name = normalizeAgencyText(profile.name).toLowerCase()
  if (!name || isAgencyPlaceholderName(name)) return false

  return peers.every((peer) => {
    if (peer.id === profile.id) return true
    return normalizeAgencyText(peer.name).toLowerCase() !== name
  })
}

/**
 * Single source of truth for the Agency index-readiness gate. A published row
 * can render without being index-qualified; callers use the resulting boolean
 * for robots, hub inclusion, and sitemap inclusion.
 *
 * Gate baseline (locked):
 *   - status published, stable slug, valid non-placeholder organization
 *   - meaningful unique editorial overview
 *   - >= 1 authoritative HTTPS source
 *   - supporting total (meaningful positions + published packages +
 *     published news + published articles) >= 2
 *   - at least one supporting item must be a Package OR News OR Article
 *     (a Package is NOT specifically required)
 */
export function isAgencyProfileIndexReady(
  profile: AgencyProfileIndexRecord,
  signals: AgencyIndexSignals,
  peers: readonly AgencyEditorialIdentity[] = [],
): boolean {
  const uniqueOverview = peers.length > 0
    ? hasUniqueAgencyOverview(profile, peers)
    : signals.uniqueEditorialOverview
  const uniqueIntent = peers.length > 0
    ? hasUniqueAgencyIntent(profile, peers)
    : signals.uniquePrimaryIntent

  const supportingTotal =
    signals.positionCount + signals.packageCount + signals.newsCount + signals.articleCount
  const conversionSupportingTotal = signals.packageCount + signals.newsCount + signals.articleCount

  return (
    profile.status === 'published' &&
    isStableAgencySlug(profile.slug) &&
    typeof profile.organization_id === 'string' &&
    profile.organization_id.length > 0 &&
    !isAgencyPlaceholderName(profile.name) &&
    isMeaningfulAgencyOverview(profile.overview_markdown) &&
    uniqueOverview &&
    hasAuthoritativeAgencySource(profile.sources) &&
    supportingTotal >= 2 &&
    conversionSupportingTotal >= 1 &&
    uniqueIntent
  )
}

export function agencyIndexability(indexReady: boolean): {
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

export interface AgencyNewsResolutionInput {
  id: string
  /** Authoritative editorial attribution on the news row itself. */
  organization_id: string | null
  /** Distinct organizations of the news row's related packages. */
  relatedOrganizationIds: readonly string[]
}

/**
 * Deterministic News -> Agency membership for public derivation:
 * the explicit news.organization_id is authoritative; the package-derived
 * fallback applies ONLY while the explicit value is NULL. A row explicitly
 * attributed to another agency is never included, even when junction-linked.
 */
export function isAgencyNewsItem(
  item: AgencyNewsResolutionInput,
  organizationId: string,
): boolean {
  if (item.organization_id) return item.organization_id === organizationId
  return item.relatedOrganizationIds.includes(organizationId)
}

export function selectAgencyPageBySlug<T extends { profile: { slug: string } }>(
  pages: readonly T[],
  slug: unknown,
): T | null {
  const cleanSlug = typeof slug === 'string' ? slug.trim() : ''
  return cleanSlug ? pages.find((page) => page.profile.slug === cleanSlug) ?? null : null
}

export function selectIndexableAgencyPages<T extends { indexReady: boolean }>(
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

export function selectPublishedPackages<T extends { is_published?: unknown }>(items: readonly T[]): T[] {
  return items.filter((item) => item.is_published === true)
}

export function selectPublishedAgencyContent<T extends { status?: unknown }>(items: readonly T[]): T[] {
  return items.filter((item) => item.status === 'published')
}

export function sortAgencyContent<T extends {
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

/** Display label for an organization: short name (สตง.) wins, else full name. */
export function agencyOrganizationLabel(organization: {
  name?: string | null
  short_name?: string | null
}): string {
  return normalizeAgencyText(organization.short_name) || normalizeAgencyText(organization.name)
}

export const AGENCY_POSITION_CTA_VIEW_POSITION = 'ดูข้อมูลตำแหน่ง'
export const AGENCY_POSITION_CTA_VIEW_PACKAGE = 'ดูแพ็กเกจเตรียมสอบ'

export interface AgencyPositionCardInput {
  id: string
  name: string
  /** Optional canonical Position Entity link for this operational position. */
  canonical?: { id: string; slug: string; name: string } | null
  /** Optional first related published package (newest first) for the position. */
  package?: { slug: string; name: string } | null
}

export interface AgencyPositionCard extends AgencyPositionCardInput {
  /**
   * Null on an informational-only card (no canonical entity and no related
   * package) — the position must still render, without a fake CTA.
   */
  cta: { label: string; href: string } | null
}

/**
 * Derive the renderable position-card list from the SAME meaningful
 * operational-position dataset that feeds the position count, so cards and
 * stats can never drift. The optional Position Entity enhances the CTA; the
 * related package is the fallback CTA; otherwise the card stays informational.
 */
export function resolveAgencyPositionCards(
  positions: readonly AgencyPositionCardInput[],
): AgencyPositionCard[] {
  return positions.map((position) => {
    if (position.canonical && isStableAgencySlug(position.canonical.slug)) {
      return {
        ...position,
        cta: {
          label: AGENCY_POSITION_CTA_VIEW_POSITION,
          href: `/positions/${encodeURIComponent(position.canonical.slug)}`,
        },
      }
    }

    if (position.package && position.package.slug) {
      return {
        ...position,
        cta: {
          label: AGENCY_POSITION_CTA_VIEW_PACKAGE,
          href: `/package/${encodeURIComponent(position.package.slug)}`,
        },
      }
    }

    return { ...position, cta: null }
  })
}

export function buildAgencySeoTitle(
  profile: AgencySeoRecord,
  siteName = 'Sobdai',
): string {
  const explicit = normalizeAgencyText(profile.seo_title)
  if (explicit) return explicit
  return `${normalizeAgencyText(profile.name) || 'หน่วยงานราชการ'} | ${siteName}`
}

export function buildAgencySeoDescription(profile: AgencySeoRecord): string {
  const explicit = normalizeAgencyText(profile.seo_description)
  if (explicit) return explicit

  const overview = readableOverview(profile.overview_markdown)
  if (overview) return overview.length > 158 ? `${overview.slice(0, 157).trim()}…` : overview

  return `ข้อมูลหน่วยงาน${normalizeAgencyText(profile.name) || 'ราชการ'} สอบเข้าทำงาน และเนื้อหาที่เกี่ยวข้องจาก Sobdai`
}

export function buildAgencySeoContract(
  profile: AgencySeoRecord,
  indexReady: boolean,
  siteName = 'Sobdai',
): AgencySeoContract {
  const indexability = agencyIndexability(indexReady)
  return {
    title: buildAgencySeoTitle(profile, siteName),
    description: buildAgencySeoDescription(profile),
    path: `/agencies/${encodeURIComponent(profile.slug)}`,
    noindex: !indexability.index,
    follow: true,
  }
}
