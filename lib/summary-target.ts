/**
 * Shared, read-only resolver for downstream/public Summary targets.
 *
 * The resolver is intentionally separate from the public Summary page reader:
 * the page reader owns full list/detail payloads, while downstream consumers
 * only need a verified identity, current public metadata, and the final href.
 * Both branches remain discriminator-first:
 *
 *   Legacy  => summaries' grandfathered fields + summaries.package_id
 *   KP      => active package_summaries membership + current revision metadata
 *              + a separately verified public Summary root
 *
 * KP never falls back to root title/slug/content. In particular, a pinned
 * stale revision is discarded rather than exposed as a routable target.
 */

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { hasSharedCurrentRevision, normalizeKpRootPublicationState, type KpRootPublicationState, type PublicSummaryRawRow } from './public-summary.ts'

export interface SummaryTargetReadClient {
  from(relation: string): any
}

export type PublicSummaryTargetKind = 'legacy' | 'kp_native'

export interface PublicSummaryTarget {
  readonly summaryId: string
  readonly kind: PublicSummaryTargetKind
  readonly title: string
  readonly subject: string | null
  readonly topic: string | null
  readonly readTimeMinutes: number | null
  readonly packageId: string
  readonly packageSlug: string
  readonly summarySlug: string
  /** Final verified public URL. Consumers must use this value as-is. */
  readonly href: string
}

export interface SummaryTargetSearch {
  readonly subjects?: readonly string[]
  readonly topics?: readonly string[]
  readonly limit?: number
}

const LEGACY_TARGET_COLUMNS = [
  'id',
  'summary_code',
  'package_id',
  'title',
  'slug',
  'subject',
  'topic',
  'read_time_minutes',
  'is_published',
].join(', ')

// This projection contains no compatibility-marker predicate. Marker=false
// memberships are valid product memberships and must remain eligible.
const KP_TARGET_COLUMNS = [
  'package_id',
  'package_slug',
  'package_is_published',
  'summary_id',
  'placement_status',
  'version_policy',
  'pinned_summary_version_id',
  'summary_code',
  'subject',
  'topic',
  'visibility',
  'lifecycle_status',
  'summary_version_id',
  'version_status',
  'content_checksum',
  'title_snapshot',
  'subject_snapshot',
  'topic_snapshot',
  'read_time_minutes',
  'version_published_at',
  'legacy_slug',
].join(', ')

const KP_ROOT_COLUMNS = [
  'id',
  'summary_code',
  'is_published',
  'lifecycle_status',
  'current_published_version_id',
].join(', ')

const LEGACY_DISCOVERY_COLUMNS = 'id'
const KP_DISCOVERY_COLUMNS = 'summary_id'

type RawRow = PublicSummaryRawRow

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isKnownVisibility(value: string | null): boolean {
  return value === 'public_indexable' || value === 'authenticated' || value === 'product_entitled'
}

function distinctIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => text(value)).filter((value): value is string => value !== null))]
}

function readSearchValues(values: readonly string[] | undefined): string[] {
  if (!values) return []
  return distinctIds(values)
}

function buildSearchFilter(search: SummaryTargetSearch): string {
  const clauses: string[] = []
  for (const subject of readSearchValues(search.subjects)) {
    clauses.push(`subject_snapshot.eq.${subject}`)
  }
  for (const topic of readSearchValues(search.topics)) {
    clauses.push(`topic_snapshot.eq.${topic}`)
  }
  return clauses.slice(0, 20).join(',')
}

function buildLegacySearchFilter(search: SummaryTargetSearch): string {
  const clauses: string[] = []
  for (const subject of readSearchValues(search.subjects)) {
    clauses.push(`subject.eq.${subject}`)
  }
  for (const topic of readSearchValues(search.topics)) {
    clauses.push(`topic.eq.${topic}`)
  }
  return clauses.slice(0, 20).join(',')
}

async function readRows(query: unknown): Promise<readonly RawRow[]> {
  try {
    const result = await query as { data?: unknown; error?: unknown }
    if (result.error || !Array.isArray(result.data)) return []
    return result.data as RawRow[]
  } catch {
    return []
  }
}

async function readLegacyTargetRows(
  client: SummaryTargetReadClient,
  summaryIds?: readonly string[],
  search?: SummaryTargetSearch,
  limit?: number,
): Promise<readonly RawRow[]> {
  try {
    let query = client
      .from('summaries')
      .select(LEGACY_TARGET_COLUMNS)
      .is('summary_code', null)
      .eq('is_published', true)

    if (summaryIds) query = query.in('id', summaryIds)
    if (search) {
      const filter = buildLegacySearchFilter(search)
      if (filter) query = query.or(filter)
    }
    if (limit !== undefined) query = query.limit(limit)
    return readRows(query)
  } catch {
    return []
  }
}

async function readKpTargetRows(
  client: SummaryTargetReadClient,
  summaryIds?: readonly string[],
  search?: SummaryTargetSearch,
  limit?: number,
): Promise<readonly RawRow[]> {
  try {
    let query = client
      .from('kp_read_package_summaries')
      .select(KP_TARGET_COLUMNS)
      .eq('placement_status', 'active')

    if (summaryIds) query = query.in('summary_id', summaryIds)
    if (search) {
      const filter = buildSearchFilter(search)
      if (filter) query = query.or(filter)
    }
    if (limit !== undefined) query = query.limit(limit)
    return readRows(query)
  } catch {
    return []
  }
}

async function readLegacyCandidateSummaryIds(
  client: SummaryTargetReadClient,
  search: SummaryTargetSearch,
): Promise<readonly string[]> {
  try {
    let query = client
      .from('summaries')
      .select(LEGACY_DISCOVERY_COLUMNS)
      .is('summary_code', null)
      .eq('is_published', true)
    const filter = buildLegacySearchFilter(search)
    if (filter) query = query.or(filter)
    const rows = await readRows(query)
    return distinctIds(rows.map((row) => text(row.id) ?? ''))
  } catch {
    return []
  }
}

async function readKpCandidateSummaryIds(
  client: SummaryTargetReadClient,
  search: SummaryTargetSearch,
): Promise<readonly string[]> {
  try {
    let query = client
      .from('kp_read_package_summaries')
      .select(KP_DISCOVERY_COLUMNS)
      .eq('placement_status', 'active')
    const filter = buildSearchFilter(search)
    if (filter) query = query.or(filter)

    // Do not limit membership rows here. Discovery is reduced to distinct
    // Summary roots first; the complete batched resolver below then reads all
    // valid memberships for those roots before selecting a Package.
    const rows = await readRows(query)
    return distinctIds(rows.map((row) => text(row.summary_id) ?? ''))
  } catch {
    return []
  }
}

async function readKpRoots(
  client: SummaryTargetReadClient,
  summaryIds: readonly string[],
): Promise<readonly RawRow[]> {
  if (summaryIds.length === 0) return []
  try {
    const query = client
      .from('summaries')
      .select(KP_ROOT_COLUMNS)
      .in('id', summaryIds)
    return readRows(query)
  } catch {
    return []
  }
}

async function readLegacyPackages(
  client: SummaryTargetReadClient,
  packageIds: readonly string[],
): Promise<readonly RawRow[]> {
  if (packageIds.length === 0) return []
  try {
    const query = client
      .from('packages')
      .select('id, slug, is_published')
      .in('id', packageIds)
    return readRows(query)
  } catch {
    return []
  }
}

function summaryHref(packageSlug: string, summarySlug: string): string {
  return `/package/${packageSlug}/summary/${summarySlug}`
}

function normalizeLegacyTarget(
  row: RawRow,
  packages: ReadonlyMap<string, RawRow>,
): PublicSummaryTarget | null {
  const summaryId = text(row.id)
  const packageId = text(row.package_id)
  const title = text(row.title)
  const summarySlug = text(row.slug)
  const packageRow = packageId ? packages.get(packageId) : undefined
  const packageSlug = text(packageRow?.slug)

  if (
    !summaryId ||
    row.summary_code !== null ||
    !packageId ||
    !title ||
    !summarySlug ||
    row.is_published !== true ||
    !packageRow ||
    packageRow.is_published !== true ||
    !packageSlug
  ) {
    return null
  }

  return {
    summaryId,
    kind: 'legacy',
    title,
    subject: text(row.subject),
    topic: text(row.topic),
    readTimeMinutes: number(row.read_time_minutes),
    packageId,
    packageSlug,
    summarySlug,
    href: summaryHref(packageSlug, summarySlug),
  }
}

function normalizeKpTarget(
  row: RawRow,
  roots: ReadonlyMap<string, KpRootPublicationState>,
): PublicSummaryTarget | null {
  const summaryId = text(row.summary_id)
  const packageId = text(row.package_id)
  const packageSlug = text(row.package_slug)
  const summarySlug = text(row.legacy_slug)
  const summaryCode = text(row.summary_code)
  const lifecycleStatus = text(row.lifecycle_status)
  const summaryVersionId = text(row.summary_version_id)
  const title = text(row.title_snapshot)
  const versionStatus = text(row.version_status)
  const contentChecksum = text(row.content_checksum)
  const publishedAt = text(row.version_published_at)
  const readTimeMinutes = number(row.read_time_minutes)
  const packageIsPublished = row.package_is_published === undefined
    ? true
    : row.package_is_published === true
  const root = summaryId ? roots.get(summaryId) : undefined

  // The route is valid only when the projection's selected revision is the
  // separately verified root pointer. This rejects stale pinned V2 rows while
  // allowing a pinned row only when its pin already equals the current V3.
  if (
    !summaryId ||
    !root ||
    !packageId ||
    !packageSlug ||
    !summarySlug ||
    !summaryCode ||
    summaryCode !== root.summary_code ||
    packageIsPublished !== true ||
    text(row.placement_status) !== 'active' ||
    lifecycleStatus !== 'active' ||
    lifecycleStatus !== root.lifecycle_status ||
    !isKnownVisibility(text(row.visibility)) ||
    !summaryVersionId ||
    !title ||
    versionStatus !== 'published' ||
    !contentChecksum ||
    !publishedAt ||
    readTimeMinutes === null ||
    readTimeMinutes < 1 ||
    !hasSharedCurrentRevision(row, root)
  ) {
    return null
  }

  return {
    summaryId,
    kind: 'kp_native',
    title,
    subject: text(row.subject_snapshot) ?? text(row.subject),
    topic: text(row.topic_snapshot) ?? text(row.topic),
    readTimeMinutes,
    packageId,
    packageSlug,
    summarySlug,
    href: summaryHref(packageSlug, summarySlug),
  }
}

function compareMembershipTargets(left: PublicSummaryTarget, right: PublicSummaryTarget): number {
  const packageSlug = left.packageSlug.localeCompare(right.packageSlug)
  if (packageSlug !== 0) return packageSlug
  const packageId = left.packageId.localeCompare(right.packageId)
  if (packageId !== 0) return packageId
  return left.summarySlug.localeCompare(right.summarySlug)
}

function sameTargetIdentity(left: PublicSummaryTarget, right: PublicSummaryTarget): boolean {
  return left.kind === right.kind &&
    left.summaryId === right.summaryId &&
    left.packageId === right.packageId &&
    left.packageSlug === right.packageSlug &&
    left.summarySlug === right.summarySlug &&
    left.title === right.title &&
    left.readTimeMinutes === right.readTimeMinutes
}

function buildTargets(
  legacyRows: readonly RawRow[],
  kpRows: readonly RawRow[],
  rootRows: readonly RawRow[],
  packageRows: readonly RawRow[],
): ReadonlyMap<string, PublicSummaryTarget> {
  const packages = new Map<string, RawRow>()
  for (const row of packageRows) {
    const id = text(row.id)
    if (id) packages.set(id, row)
  }

  const roots = new Map<string, KpRootPublicationState>()
  for (const row of rootRows) {
    const root = normalizeKpRootPublicationState(row)
    if (root) roots.set(root.id, root)
  }

  const legacyCandidates = new Map<string, PublicSummaryTarget[]>()
  for (const row of legacyRows) {
    const target = normalizeLegacyTarget(row, packages)
    if (!target) continue
    const existing = legacyCandidates.get(target.summaryId) ?? []
    existing.push(target)
    legacyCandidates.set(target.summaryId, existing)
  }

  const kpCandidates = new Map<string, PublicSummaryTarget[]>()
  for (const row of kpRows) {
    const target = normalizeKpTarget(row, roots)
    if (!target) continue
    const existing = kpCandidates.get(target.summaryId) ?? []
    existing.push(target)
    kpCandidates.set(target.summaryId, existing)
  }

  const targets = new Map<string, PublicSummaryTarget>()
  const ids = new Set([...legacyCandidates.keys(), ...kpCandidates.keys()])
  for (const id of ids) {
    const legacy = legacyCandidates.get(id) ?? []
    const kp = kpCandidates.get(id) ?? []

    // A Legacy root is authoritative only through its own package_id. If the
    // database returns conflicting duplicate Legacy identities, fail closed.
    if (legacy.length > 0) {
      const first = legacy[0]
      if (first && legacy.every((candidate) => sameTargetIdentity(first, candidate))) {
        targets.set(id, first)
      }
      continue
    }

    // Any valid active membership is eligible; the actual public target is
    // deterministic by Package slug, then package id, matching the frozen
    // read projections. Invalid pinned/stale candidates were removed above.
    const selected = kp.slice().sort(compareMembershipTargets)[0]
    if (selected) targets.set(id, selected)
  }

  return targets
}

/**
 * Resolve a batch of Summary root IDs. Every database read is batched by
 * distinct ID; callers must use the returned target.href rather than rebuild
 * a route from root fields.
 */
export async function resolvePublicSummaryTargets(
  client: SummaryTargetReadClient,
  summaryIds: readonly string[],
): Promise<ReadonlyMap<string, PublicSummaryTarget>> {
  const ids = distinctIds(summaryIds)
  if (ids.length === 0) return new Map()

  const [legacyRows, kpRows, rootRows] = await Promise.all([
    readLegacyTargetRows(client, ids),
    readKpTargetRows(client, ids),
    readKpRoots(client, ids),
  ])
  const packageIds = distinctIds(legacyRows.map((row) => text(row.package_id) ?? ''))
  const packageRows = await readLegacyPackages(client, packageIds)

  return buildTargets(legacyRows, kpRows, rootRows, packageRows)
}

/**
 * Discover verified targets for a bounded subject/topic query. This is used by
 * assessment enrichment and the latent recommendation provider so those
 * consumers match against current target metadata rather than root KP fields.
 */
export async function findPublicSummaryTargets(
  client: SummaryTargetReadClient,
  search: SummaryTargetSearch = {},
): Promise<ReadonlyMap<string, PublicSummaryTarget>> {
  const requestedLimit = search.limit === undefined
    ? 50
    : Math.max(0, Math.floor(search.limit))
  if (requestedLimit === 0) return new Map()

  // Discovery is bounded by distinct Summary roots, never by a global slice of
  // Package membership rows. This keeps the downstream result bounded while
  // preserving the complete membership set for every selected root.
  const [legacyIds, kpIds] = await Promise.all([
    readLegacyCandidateSummaryIds(client, search),
    readKpCandidateSummaryIds(client, search),
  ])
  const candidateIds = distinctIds([...legacyIds, ...kpIds])
    .sort((left, right) => left.localeCompare(right))
    .slice(0, requestedLimit)
  if (candidateIds.length === 0) return new Map()

  // Reuse the same complete resolver used by News. It reads the full active
  // membership set for each candidate root and applies Package.slug,
  // package_id ordering only after all valid rows are available.
  const allTargets = await resolvePublicSummaryTargets(client, candidateIds)
  const ordered = [...allTargets.values()]
    .sort((left, right) => left.summaryId.localeCompare(right.summaryId))
  return new Map(ordered.slice(0, requestedLimit).map((target) => [target.summaryId, target]))
}

/** Resolve a CTA target from an already verified target set. */
export function getVerifiedSummaryHref(
  targets: readonly Pick<PublicSummaryTarget, 'summaryId' | 'href'>[],
  summaryId: string | null | undefined,
): string | null {
  if (!summaryId) return null
  return targets.find((target) => target.summaryId === summaryId)?.href ?? null
}

/** Map News Summary-ID relations to at most one verified card per root. */
export function mapSummaryRelationsToTargets(
  summaryIds: readonly string[],
  targets: ReadonlyMap<string, PublicSummaryTarget>,
): PublicSummaryTarget[] {
  const seen = new Set<string>()
  const result: PublicSummaryTarget[] = []
  for (const summaryId of summaryIds) {
    const id = text(summaryId)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const target = targets.get(id)
    if (target) result.push(target)
  }
  return result
}

/** Match recommendation labels against verified, authoritative target fields. */
export function matchPublicSummaryTarget(
  targets: readonly PublicSummaryTarget[],
  labels: { readonly topic?: string | null; readonly subject?: string | null },
): PublicSummaryTarget | null {
  return (
    (labels.topic && targets.find((target) => target.topic === labels.topic)) ||
    (labels.subject && targets.find((target) => target.subject === labels.subject)) ||
    null
  )
}
