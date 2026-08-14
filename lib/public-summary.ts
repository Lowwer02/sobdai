/**
 * Public Summary read boundary for the frozen Legacy/KP hybrid state.
 *
 * Legacy rows are intentionally read from their grandfathered `summaries`
 * fields. KP-native rows are read from the frozen public projections, where
 * the active Package membership and published revision are resolved together.
 * The two branches must stay separate so a KP row can never fall back to
 * `summaries.content_md` or another Legacy field for public content.
 */

type PublicSummaryReadClient = {
  from(relation: string): any
  rpc(functionName: string, args: Record<string, unknown>): any
}

export type PublicSummaryRawRow = Record<string, unknown>
type RawRow = PublicSummaryRawRow

export type KpRootPublicationState = {
  readonly id: string
  readonly summary_code: string
  readonly lifecycle_status: string
  readonly current_published_version_id: string
}

type KpRootPublicationMap = ReadonlyMap<string, KpRootPublicationState>

export type PublicSummaryKind = 'legacy' | 'kp_native'

export interface PublicSummaryListItem {
  readonly id: string
  readonly summary_code: string | null
  readonly kind: PublicSummaryKind
  readonly title: string
  readonly slug: string
  readonly subject: string | null
  readonly topic: string | null
  readonly read_time_minutes: number | null
  readonly updated_at: string | null
  readonly created_at: string | null
  readonly display_order: number
  readonly released_at: string | null
}

export interface PublicSummarySourceCitation {
  readonly reference_document_id: string
  readonly document_code: string | null
  readonly title: string | null
  readonly reference_document_version_id: string | null
  readonly version_label: string | null
  readonly source_url: string | null
  readonly role: string | null
  readonly coverage_note: string | null
  readonly sort_order: number | null
}

export interface PublicSummaryDetail extends PublicSummaryListItem {
  readonly package_id: string
  readonly package_slug: string
  readonly package_name: string
  readonly law: string | null
  readonly content_md: string
  readonly visibility: string | null
  readonly lifecycle_status: string | null
  readonly summary_version_id: string | null
  readonly revision_number: number | null
  readonly version_status: string | null
  readonly content_checksum: string | null
  readonly version_published_at: string | null
  readonly source_citations: readonly PublicSummarySourceCitation[]
}

export interface PublicSummaryRouteRequest {
  readonly packageId: string
  readonly packageSlug: string
  readonly packageName: string
  readonly summarySlug: string
}

const LEGACY_SUMMARY_LIST_COLUMNS = [
  'id',
  'summary_code',
  'package_id',
  'title',
  'slug',
  'subject',
  'topic',
  'read_time_minutes',
  'updated_at',
  'created_at',
  'display_order',
  'released_at',
  'is_published',
].join(', ')

const LEGACY_SUMMARY_ROUTE_COLUMNS = [
  'id',
  'summary_code',
  'package_id',
  'title',
  'slug',
  'subject',
  'topic',
  'law',
  'content_md',
  'read_time_minutes',
  'updated_at',
  'created_at',
  'display_order',
  'released_at',
  'is_published',
].join(', ')

// This projection deliberately contains no compatibility-marker column. All
// active memberships are product memberships, including marker=false rows.
const KP_PACKAGE_SUMMARY_LIST_COLUMNS = [
  'package_id',
  'package_slug',
  'package_name',
  'package_is_published',
  'summary_id',
  'placement_status',
  'version_policy',
  'pinned_summary_version_id',
  'sort_order',
  'display_order',
  'released_at',
  'navigation_label',
  'legacy_slug',
  'summary_code',
  'canonical_slug',
  'canonical_title',
  'subject',
  'topic',
  'law',
  'visibility',
  'lifecycle_status',
  'summary_version_id',
  'revision_number',
  'version_status',
  'content_checksum',
  'title_snapshot',
  'subject_snapshot',
  'topic_snapshot',
  'law_snapshot',
  'read_time_minutes',
  'version_published_at',
].join(', ')

const KP_SUMMARY_ROUTE_FUNCTION = 'kp_read_summary_route'

const KP_ROOT_PUBLICATION_COLUMNS = [
  'id',
  'summary_code',
  'is_published',
  'lifecycle_status',
  'current_published_version_id',
].join(', ')

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function dateValue(value: unknown): string | null {
  return text(value)
}

function isKnownVisibility(value: string | null): boolean {
  return value === 'public_indexable' || value === 'authenticated' || value === 'product_entitled'
}

function emptyCitations(): readonly PublicSummarySourceCitation[] {
  return []
}

function normalizeCitations(value: unknown): readonly PublicSummarySourceCitation[] {
  if (!Array.isArray(value)) return []

  const citations: PublicSummarySourceCitation[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return []
    const row = candidate as RawRow
    const referenceDocumentId = text(row.reference_document_id)
    if (!referenceDocumentId) return []
    citations.push({
      reference_document_id: referenceDocumentId,
      document_code: text(row.document_code),
      title: text(row.title),
      reference_document_version_id: text(row.reference_document_version_id),
      version_label: text(row.version_label),
      source_url: text(row.source_url),
      role: text(row.role),
      coverage_note: text(row.coverage_note),
      sort_order: number(row.sort_order),
    })
  }
  return citations
}

export function normalizeKpRootPublicationState(row: RawRow): KpRootPublicationState | null {
  const id = text(row.id)
  const summaryCode = text(row.summary_code)
  const lifecycleStatus = text(row.lifecycle_status)
  const currentPublishedVersionId = text(row.current_published_version_id)

  // This is the application-side proof that the frozen root itself is public.
  // A missing or malformed root is intentionally indistinguishable from an
  // unavailable root to callers, so every KP candidate fails closed.
  if (
    !id ||
    !summaryCode ||
    boolean(row.is_published) !== true ||
    lifecycleStatus !== 'active' ||
    !currentPublishedVersionId
  ) {
    return null
  }

  return {
    id,
    summary_code: summaryCode,
    lifecycle_status: lifecycleStatus,
    current_published_version_id: currentPublishedVersionId,
  }
}

function buildKpRootPublicationMap(rows: readonly RawRow[]): KpRootPublicationMap {
  const roots = new Map<string, KpRootPublicationState>()
  for (const row of rows) {
    const state = normalizeKpRootPublicationState(row)
    if (state) roots.set(state.id, state)
  }
  return roots
}

export function hasSharedCurrentRevision(
  row: RawRow,
  root: KpRootPublicationState,
): boolean {
  const resolvedVersionId = text(row.summary_version_id)
  const versionPolicy = text(row.version_policy)
  const pinnedVersionId = text(row.pinned_summary_version_id)

  // Membership policy may explain how the frozen projection selected a row,
  // but it is never public authority. The selected revision must be the root's
  // current published revision. A pinned membership is acceptable only when
  // its pin already equals that same root pointer.
  if (!resolvedVersionId || resolvedVersionId !== root.current_published_version_id) return false
  if (versionPolicy === 'latest_published') return pinnedVersionId === null
  if (versionPolicy === 'pinned') return pinnedVersionId === root.current_published_version_id
  return false
}

function normalizeLegacyListRow(row: RawRow, packageId: string): PublicSummaryListItem | null {
  const id = text(row.id)
  const packageRowId = text(row.package_id)
  const title = text(row.title)
  const slug = text(row.slug)

  // The Legacy branch is deliberately discriminator-first. A malformed
  // non-NULL code is never allowed to fall back to Legacy content.
  if (!id || packageRowId !== packageId || row.summary_code !== null || !title || !slug) return null
  if (boolean(row.is_published) !== true) return null

  return {
    id,
    summary_code: null,
    kind: 'legacy',
    title,
    slug,
    subject: text(row.subject),
    topic: text(row.topic),
    read_time_minutes: number(row.read_time_minutes),
    updated_at: dateValue(row.updated_at),
    created_at: dateValue(row.created_at),
    display_order: number(row.display_order) ?? 0,
    released_at: dateValue(row.released_at),
  }
}

function normalizeKpListRow(
  row: RawRow,
  packageId: string,
  roots: KpRootPublicationMap,
): PublicSummaryListItem | null {
  const id = text(row.summary_id)
  const packageRowId = text(row.package_id)
  const summaryCode = text(row.summary_code)
  const packageSlug = text(row.package_slug)
  const membershipSlug = text(row.legacy_slug)
  const title = text(row.title_snapshot)
  const versionId = text(row.summary_version_id)
  const versionStatus = text(row.version_status)
  const contentChecksum = text(row.content_checksum)
  const lifecycleStatus = text(row.lifecycle_status)
  const readTime = number(row.read_time_minutes)
  const publishedAt = dateValue(row.version_published_at)
  const packageIsPublished = row.package_is_published === undefined
    ? true
    : boolean(row.package_is_published)
  const root = id ? roots.get(id) : undefined

  // `kp_read_package_summaries` has already applied the frozen publication
  // predicates. Recheck the returned state and the separately-read root here
  // so a divergent/corrupt row is dropped rather than rendered from a root
  // fallback.
  if (
    !id ||
    !root ||
    packageRowId !== packageId ||
    packageIsPublished !== true ||
    text(row.placement_status) !== 'active' ||
    !summaryCode ||
    summaryCode !== root.summary_code ||
    !packageSlug ||
    !membershipSlug ||
    lifecycleStatus !== 'active' ||
    lifecycleStatus !== root.lifecycle_status ||
    !versionId ||
    versionStatus !== 'published' ||
    !hasSharedCurrentRevision(row, root) ||
    !contentChecksum ||
    !title ||
    readTime === null ||
    readTime < 1 ||
    !publishedAt
  ) {
    return null
  }

  return {
    id,
    summary_code: summaryCode,
    kind: 'kp_native',
    // KP list metadata is revision-owned for title/read time. The membership
    // owns the route slug; root canonical slug is not used for Package links.
    title,
    slug: membershipSlug,
    subject: text(row.subject_snapshot) ?? text(row.subject),
    topic: text(row.topic_snapshot) ?? text(row.topic),
    read_time_minutes: readTime,
    updated_at: publishedAt,
    created_at: publishedAt,
    display_order: number(row.display_order) ?? 0,
    released_at: dateValue(row.released_at),
  }
}

function normalizeLegacyDetailRow(
  row: RawRow,
  request: PublicSummaryRouteRequest,
): PublicSummaryDetail | null {
  const listItem = normalizeLegacyListRow(row, request.packageId)
  const content = text(row.content_md)
  if (!listItem || listItem.slug !== request.summarySlug || !content) return null

  return {
    ...listItem,
    package_id: request.packageId,
    package_slug: request.packageSlug,
    package_name: request.packageName,
    law: text(row.law),
    content_md: content,
    visibility: null,
    lifecycle_status: null,
    summary_version_id: null,
    revision_number: null,
    version_status: null,
    content_checksum: null,
    version_published_at: null,
    source_citations: emptyCitations(),
  }
}

function normalizeKpDetailRow(
  row: RawRow,
  request: PublicSummaryRouteRequest,
  roots: KpRootPublicationMap,
): PublicSummaryDetail | null {
  const id = text(row.summary_id)
  const summaryCode = text(row.summary_code)
  const packageId = text(row.package_id)
  const packageSlug = text(row.package_slug)
  const membershipSlug = text(row.legacy_slug)
  const title = text(row.version_title)
  const content = text(row.content_md)
  const versionId = text(row.summary_version_id)
  const versionStatus = text(row.version_status)
  const contentChecksum = text(row.content_checksum)
  const lifecycleStatus = text(row.summary_lifecycle_status)
  const visibility = text(row.visibility)
  const readTime = number(row.read_time_minutes)
  const publishedAt = dateValue(row.version_published_at)
  const packageName = text(row.package_name) ?? request.packageName
  const root = id ? roots.get(id) : undefined

  // The RPC resolves the selected revision through the active membership, but
  // the separately-read root pointer is the only public revision authority.
  if (
    !id ||
    !root ||
    !summaryCode ||
    summaryCode !== root.summary_code ||
    !packageId ||
    !packageSlug ||
    !membershipSlug ||
    !title ||
    !content ||
    !versionId ||
    !contentChecksum ||
    !packageName ||
    packageId !== request.packageId ||
    packageSlug !== request.packageSlug ||
    membershipSlug !== request.summarySlug ||
    text(row.placement_status) !== 'active' ||
    lifecycleStatus !== 'active' ||
    lifecycleStatus !== root.lifecycle_status ||
    versionStatus !== 'published' ||
    !hasSharedCurrentRevision(row, root) ||
    !isKnownVisibility(visibility) ||
    readTime === null ||
    readTime < 1 ||
    !publishedAt
  ) {
    return null
  }

  return {
    id,
    summary_code: summaryCode,
    kind: 'kp_native',
    title,
    slug: membershipSlug,
    subject: text(row.version_subject) ?? text(row.subject),
    topic: text(row.version_topic) ?? text(row.topic),
    read_time_minutes: readTime,
    updated_at: publishedAt,
    created_at: publishedAt,
    display_order: number(row.display_order) ?? 0,
    released_at: dateValue(row.released_at),
    package_id: packageId,
    package_slug: packageSlug,
    package_name: packageName,
    law: text(row.version_law) ?? text(row.law),
    content_md: content,
    visibility,
    lifecycle_status: lifecycleStatus,
    summary_version_id: versionId,
    revision_number: number(row.revision_number),
    version_status: versionStatus,
    content_checksum: contentChecksum,
    version_published_at: publishedAt,
    source_citations: normalizeCitations(row.source_citations),
  }
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return left.localeCompare(right)
  if (Number.isNaN(leftTime)) return 1
  if (Number.isNaN(rightTime)) return -1
  return rightTime - leftTime
}

function comparePublicSummaryOrder(left: PublicSummaryListItem, right: PublicSummaryListItem): number {
  if (left.display_order !== right.display_order) return right.display_order - left.display_order

  const released = compareNullableDates(left.released_at, right.released_at)
  if (released !== 0) return released

  const updated = compareNullableDates(left.updated_at, right.updated_at)
  if (updated !== 0) return updated

  const created = compareNullableDates(left.created_at, right.created_at)
  if (created !== 0) return created

  return left.id.localeCompare(right.id)
}

function sameListIdentity(left: PublicSummaryListItem, right: PublicSummaryListItem): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.summary_code === right.summary_code &&
    left.title === right.title &&
    left.slug === right.slug &&
    left.read_time_minutes === right.read_time_minutes
  )
}

/**
 * Merge the two public package branches by Summary root. Conflicting rows for
 * one root are removed entirely, which is safer than choosing a potentially
 * wrong Package-local identity or content source.
 */
export function mergePublicSummaryListRows(
  legacyRows: readonly RawRow[],
  kpRows: readonly RawRow[],
  packageId: string,
  rootRows: readonly RawRow[],
): readonly PublicSummaryListItem[] {
  const bySummaryId = new Map<string, PublicSummaryListItem>()
  const conflicted = new Set<string>()
  const roots = buildKpRootPublicationMap(rootRows)
  const normalizedRows = [
    ...legacyRows.map((row) => normalizeLegacyListRow(row, packageId)),
    ...kpRows.map((row) => normalizeKpListRow(row, packageId, roots)),
  ]

  for (const row of normalizedRows) {
    if (!row || conflicted.has(row.id)) continue
    const existing = bySummaryId.get(row.id)
    if (!existing) {
      bySummaryId.set(row.id, row)
      continue
    }
    if (!sameListIdentity(existing, row)) {
      bySummaryId.delete(row.id)
      conflicted.add(row.id)
    }
  }

  return [...bySummaryId.values()].sort(comparePublicSummaryOrder)
}

/**
 * Resolve a route from already-fetched candidates. This pure boundary is used
 * by tests and keeps the collision rules explicit: one Package + slug can
 * identify at most one public Summary root.
 */
export function resolvePublicSummaryRouteRows(
  legacyRows: readonly RawRow[],
  kpRows: readonly RawRow[],
  request: PublicSummaryRouteRequest,
  rootRows: readonly RawRow[],
): PublicSummaryDetail | null {
  const roots = buildKpRootPublicationMap(rootRows)
  const legacyMatches = legacyRows
    .map((row) => normalizeLegacyDetailRow(row, request))
    .filter((row): row is PublicSummaryDetail => row !== null)
  const kpMatches = kpRows
    .map((row) => normalizeKpDetailRow(row, request, roots))
    .filter((row): row is PublicSummaryDetail => row !== null)

  const candidates = [...legacyMatches, ...kpMatches]
  if (candidates.length !== 1) return null

  // A duplicate RPC row for the same root is not a safe route resolution even
  // if its visible fields happen to match; the caller must fail closed on
  // ambiguous database state. The exact-one check above enforces that.
  return candidates[0] ?? null
}

async function readLegacyPackageSummaries(
  client: PublicSummaryReadClient,
  packageId: string,
): Promise<{ rows: readonly RawRow[]; failed: boolean }> {
  try {
    const result = await client
      .from('summaries')
      .select(LEGACY_SUMMARY_LIST_COLUMNS)
      .eq('package_id', packageId)
      .is('summary_code', null)
      .eq('is_published', true)
      .order('display_order', { ascending: false })
      .order('released_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    return {
      rows: Array.isArray(result?.data) ? result.data as RawRow[] : [],
      failed: Boolean(result?.error),
    }
  } catch {
    return { rows: [], failed: true }
  }
}

async function readKpPackageSummaries(
  client: PublicSummaryReadClient,
  packageId: string,
): Promise<readonly RawRow[]> {
  try {
    const result = await client
      .from('kp_read_package_summaries')
      .select(KP_PACKAGE_SUMMARY_LIST_COLUMNS)
      .eq('package_id', packageId)
      .order('display_order', { ascending: false })
      .order('released_at', { ascending: false, nullsFirst: false })
      .order('version_published_at', { ascending: false, nullsFirst: false })

    if (result?.error || !Array.isArray(result?.data)) return []
    return result.data as RawRow[]
  } catch {
    return []
  }
}

async function readKpRootPublicationStates(
  client: PublicSummaryReadClient,
  kpRows: readonly RawRow[],
): Promise<readonly RawRow[]> {
  const summaryIds = [...new Set(
    kpRows
      .map((row) => text(row.summary_id))
      .filter((id): id is string => id !== null),
  )]
  if (summaryIds.length === 0) return []

  try {
    const result = await client
      .from('summaries')
      .select(KP_ROOT_PUBLICATION_COLUMNS)
      .in('id', summaryIds)

    if (result?.error || !Array.isArray(result?.data)) return []
    return result.data as RawRow[]
  } catch {
    return []
  }
}

export async function listPublicPackageSummaries(
  client: PublicSummaryReadClient,
  packageId: string,
): Promise<readonly PublicSummaryListItem[]> {
  const [legacy, kpRows] = await Promise.all([
    readLegacyPackageSummaries(client, packageId),
    readKpPackageSummaries(client, packageId),
  ])

  // Resolve every KP root in one batched read. Legacy listing remains an
  // independent discriminator-scoped query and never requires KP state.
  const kpRootRows = await readKpRootPublicationStates(client, kpRows)

  // A Legacy query failure must not be silently replaced with a KP-only view;
  // return the independently safe KP branch, while the route resolver below
  // fails closed when it cannot establish Legacy collision state.
  const legacyRows = legacy.failed ? [] : legacy.rows
  return mergePublicSummaryListRows(legacyRows, kpRows, packageId, kpRootRows)
}

async function readLegacyRouteCandidates(
  client: PublicSummaryReadClient,
  request: PublicSummaryRouteRequest,
): Promise<{ rows: readonly RawRow[]; failed: boolean }> {
  try {
    const result = await client
      .from('summaries')
      .select(LEGACY_SUMMARY_ROUTE_COLUMNS)
      .eq('package_id', request.packageId)
      .eq('slug', request.summarySlug)
      .is('summary_code', null)
      .limit(2)

    return {
      rows: Array.isArray(result?.data) ? result.data as RawRow[] : [],
      failed: Boolean(result?.error),
    }
  } catch {
    return { rows: [], failed: true }
  }
}

async function readKpRouteCandidates(
  client: PublicSummaryReadClient,
  request: PublicSummaryRouteRequest,
): Promise<readonly RawRow[]> {
  try {
    const result = await client.rpc(KP_SUMMARY_ROUTE_FUNCTION, {
      p_slug: request.summarySlug,
      p_package_slug: request.packageSlug,
    })

    if (result?.error || !Array.isArray(result?.data)) return []
    return result.data as RawRow[]
  } catch {
    return []
  }
}

export async function getPublicSummaryRoute(
  client: PublicSummaryReadClient,
  request: PublicSummaryRouteRequest,
): Promise<PublicSummaryDetail | null> {
  const [legacy, kpRows] = await Promise.all([
    readLegacyRouteCandidates(client, request),
    readKpRouteCandidates(client, request),
  ])

  // If Legacy lookup failed, we cannot prove that the Package-local slug is
  // not an ambiguous Legacy/KP collision. Do not return the KP candidate.
  if (legacy.failed) return null

  const kpRootRows = await readKpRootPublicationStates(client, kpRows)
  return resolvePublicSummaryRouteRows(legacy.rows, kpRows, request, kpRootRows)
}
