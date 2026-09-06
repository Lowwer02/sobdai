/**
 * Package content freshness (V1).
 *
 * Single source of truth for "new/updated content" signals on package cards:
 * Homepage, the package catalogs (/packages, /packages/phak-khor), and
 * /my-packages. The freshness rule is deterministic and timestamp-only —
 * there is deliberately no per-user read state and no notification
 * infrastructure in this phase.
 *
 * Rule
 * ----
 * Content is "fresh" when it became available within PACKAGE_CONTENT_FRESH_DAYS
 * of now:
 *   - exam sets : `exam_sets.status = 'published'` and
 *                 coalesce(released_at, created_at) within the window
 *   - summaries : `summaries.is_published = true` and
 *                 coalesce(released_at, created_at) within the window
 *
 * `released_at` is the schema-documented publish/release timestamp
 * (migration 019; NULL falls back to created_at). Package-level fields
 * (packages.updated_at etc.) are intentionally NEVER consulted, so a
 * price/title edit cannot produce a freshness badge, and content edits
 * (updated_at) are equally excluded — only added/published content counts.
 *
 * Sizing: both reads are single batched `in (package_ids)` queries with slim
 * projections, grouped in Node. No per-package N+1, no RPC changes, no
 * migration. Every read fails safe to "no freshness" — an unavailable
 * freshness signal must never break a card that already renders.
 */

/** Freshness window for package content, in days. */
export const PACKAGE_CONTENT_FRESH_DAYS = 30

export interface PackageContentFreshness {
  /** Published exam sets that became available within the window. */
  newExamSetCount: number
  /** Published summaries that became available within the window. */
  newSummaryCount: number
  hasFreshContent: boolean
}

/** Minimal structural view of a Supabase read client (repo convention, cf. lib/public-summary.ts). */
type FreshnessReadClient = {
  from(relation: string): any
}

type FreshnessTimestampRow = {
  package_id: string | null
  released_at: string | null
  created_at: string | null
}

/** When content availability is evaluated from: published_at semantics, else creation. */
function contentAvailableAt(row: FreshnessTimestampRow): number {
  const released = row.released_at ? new Date(row.released_at).getTime() : Number.NaN
  if (!Number.isNaN(released)) return released
  const created = row.created_at ? new Date(row.created_at).getTime() : Number.NaN
  return Number.isNaN(created) ? Number.NaN : created
}

function countRowsWithinWindow(rows: readonly FreshnessTimestampRow[], cutoffMs: number): number {
  let count = 0
  for (const row of rows) {
    if (row.package_id === null) continue
    const availableAt = contentAvailableAt(row)
    if (!Number.isNaN(availableAt) && availableAt >= cutoffMs) count += 1
  }
  return count
}

/** Minimal timestamp pair as returned by the slim projections. */
export interface ContentAvailabilityTimestamps {
  released_at: string | null
  created_at: string | null
}

/**
 * Pure freshness computation for one package from raw content timestamps.
 * Exposed for tests and for callers that already hold the rows; production
 * routes use getPackageContentFreshness instead.
 */
export function computePackageContentFreshness(
  examSetTimestamps: readonly ContentAvailabilityTimestamps[],
  summaryTimestamps: readonly ContentAvailabilityTimestamps[],
  now: Date = new Date(),
): PackageContentFreshness {
  const cutoffMs = now.getTime() - PACKAGE_CONTENT_FRESH_DAYS * 24 * 60 * 60 * 1000
  const toRows = (timestamps: readonly ContentAvailabilityTimestamps[]): FreshnessTimestampRow[] =>
    timestamps.map((ts) => ({ package_id: 'pkg', released_at: ts.released_at, created_at: ts.created_at }))

  const newExamSetCount = countRowsWithinWindow(toRows(examSetTimestamps), cutoffMs)
  const newSummaryCount = countRowsWithinWindow(toRows(summaryTimestamps), cutoffMs)

  return {
    newExamSetCount,
    newSummaryCount,
    hasFreshContent: newExamSetCount > 0 || newSummaryCount > 0,
  }
}

async function readFreshTimestamps(
  client: FreshnessReadClient,
  table: string,
  packageIds: readonly string[],
  publishFilter: Record<string, string | boolean>,
): Promise<readonly FreshnessTimestampRow[]> {
  const columns = 'package_id, released_at, created_at'
  let query = client.from(table).select(columns).in('package_id', [...packageIds])
  for (const [column, value] of Object.entries(publishFilter)) {
    query = query.eq(column, value)
  }

  const result = await query
  if (result?.error) {
    throw new Error(result.error.message || `${table} freshness read failed`)
  }
  return (Array.isArray(result?.data) ? result.data : []) as FreshnessTimestampRow[]
}

/**
 * Batched freshness for a set of packages. Returns a map keyed by package id;
 * packages with no fresh content are simply absent (treat as "render
 * nothing"). Any read failure fails safe to an empty map — no badges — and is
 * logged, mirroring the optional-read convention of /my-packages counts.
 */
export async function getPackageContentFreshness(
  packageIds: readonly string[],
  client: FreshnessReadClient,
): Promise<Record<string, PackageContentFreshness>> {
  const ids = [...new Set(packageIds.filter(Boolean))]
  if (ids.length === 0) return {}

  const cutoffMs = Date.now() - PACKAGE_CONTENT_FRESH_DAYS * 24 * 60 * 60 * 1000

  try {
    const [examSetRows, summaryRows] = await Promise.all([
      readFreshTimestamps(client, 'exam_sets', ids, { status: 'published' }),
      readFreshTimestamps(client, 'summaries', ids, { is_published: true }),
    ])

    const freshness: Record<string, PackageContentFreshness> = {}
    for (const id of ids) {
      const newExamSetCount = countRowsWithinWindow(
        examSetRows.filter((row) => row.package_id === id),
        cutoffMs,
      )
      const newSummaryCount = countRowsWithinWindow(
        summaryRows.filter((row) => row.package_id === id),
        cutoffMs,
      )
      if (newExamSetCount > 0 || newSummaryCount > 0) {
        freshness[id] = {
          newExamSetCount,
          newSummaryCount,
          hasFreshContent: true,
        }
      }
    }
    return freshness
  } catch (error) {
    console.error('Package content freshness unavailable:', error)
    return {}
  }
}

/* -------------------------------------------------------------------------- */
/* Presentation labels — kept beside the rule so every route says it the same  */
/* way.                                                                       */
/* -------------------------------------------------------------------------- */

/** “✦ ข้อสอบใหม่ N ชุด” (exam freshness chip). */
export function formatFreshExamSetLabel(count: number): string {
  return `ข้อสอบใหม่ ${count} ชุด`
}

/** “▣ สรุปใหม่ N เรื่อง” (summary freshness chip). */
export function formatFreshSummaryLabel(count: number): string {
  return `สรุปใหม่ ${count} เรื่อง`
}

/** Compact generic chip for surfaces that must stay visually quiet. */
export const GENERIC_FRESHNESS_LABEL = 'อัปเดตใหม่'

/** Accessible clarification for the compact generic chip. */
export const GENERIC_FRESHNESS_TOOLTIP = 'เพิ่มข้อสอบหรือสรุปล่าสุด'
