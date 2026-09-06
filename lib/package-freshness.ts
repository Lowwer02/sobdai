/**
 * Package content freshness (V1, post-audit remediation).
 *
 * Single source of truth for "new/updated content" signals on package cards:
 * Homepage, the package catalogs (/packages, /packages/phak-khor), and
 * /my-packages. The freshness rule is deterministic and availability-timestamp
 * only — there is deliberately no per-user read state and no notification
 * infrastructure in this phase.
 *
 * What freshness MEANS
 * --------------------
 * "CONTENT NEWLY MADE AVAILABLE TO USERS" — the moment a learner could first
 * (or again) open the content. It is NOT the creation time of a draft and NOT
 * any metadata/edit time.
 *
 * Availability authority per content type
 * ---------------------------------------
 *   - exam sets  : `exam_sets.released_at`, stamped by the admin publish
 *                  actions exactly when status transitions into 'published'
 *                  from a non-published state (single + bulk, including
 *                  republish after unpublish/archive). Edits while published
 *                  never refresh it.
 *   - summaries (KP-native placements): `package_summaries.activated_at`,
 *                  stamped by the Knowledge Platform publication RPCs on every
 *                  publish/republish. A CHECK constraint (migration 045)
 *                  guarantees activated_at IS NOT NULL while status='active',
 *                  and the RLS predicate (migration 046) exposes only active
 *                  placements the viewer can actually read.
 *   - summaries (legacy rows, summary_code IS NULL): `summaries.released_at`,
 *                  stamped by kp_persist_publish_legacy_summary (migration 089
 *                  CREATE OR REPLACE) on the unpublished→published transition.
 *
 * Fallback (documented, conservative)
 * -----------------------------------
 * Rows predating the write-side stamps keep their historical values
 * (migration 019 backfilled released_at = created_at; legacy rows without any
 * release stamp fall back to created_at). A young row that is already public
 * therefore counts as new; an old row NEVER becomes fresh merely because time
 * passed or because it was edited. packages.updated_at and content
 * updated_at are never consulted, so package price/title edits and content
 * typo edits cannot produce a badge.
 *
 * Sizing: three batched `in (package_ids)` reads with slim projections,
 * grouped in Node. No per-package N+1, no RPC changes, no extra migration
 * beyond 089's publish-RPC stamp. Every read fails safe to "no freshness" —
 * an unavailable freshness signal must never break a card that already renders.
 */

/** Freshness window for package content, in days. */
export const PACKAGE_CONTENT_FRESH_DAYS = 30

export interface PackageContentFreshness {
  /** Published exam sets that became available within the window. */
  newExamSetCount: number
  /** Summaries that became available within the window (KP placements + legacy rows). */
  newSummaryCount: number
  hasFreshContent: boolean
}

/** Minimal structural view of a Supabase read client (repo convention, cf. lib/public-summary.ts). */
type FreshnessReadClient = {
  from(relation: string): any
}

/** Slim projections, shared with the tests: availability inputs only. */
export interface ExamSetTimestamps {
  released_at: string | null
  created_at: string | null
}
export interface LegacySummaryTimestamps {
  released_at: string | null
  created_at: string | null
}
export interface SummaryPlacementTimestamps {
  activated_at: string | null
}

function parseTimestampMs(value: string | null | undefined): number {
  if (!value) return Number.NaN
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

/**
 * Exam set availability: the publish/republish stamp; historical rows fall
 * back to created_at (migration 019 backfill semantics). Never updated_at.
 */
export function examSetAvailabilityAt(row: ExamSetTimestamps): string | null {
  return row.released_at ?? row.created_at
}

/**
 * Legacy summary availability: the publish/republish stamp (migration 089);
 * rows that predate it fall back to created_at. Never updated_at.
 */
export function legacySummaryAvailabilityAt(row: LegacySummaryTimestamps): string | null {
  return row.released_at ?? row.created_at
}

/**
 * KP placement availability: the activation stamp (publish/republish). The
 * 045 CHECK constraint guarantees it is non-null while the placement is
 * active; null/invalid values fail safe to "not fresh".
 */
export function summaryPlacementAvailabilityAt(row: SummaryPlacementTimestamps): string | null {
  return row.activated_at
}

function countWithinWindow(availability: readonly (string | null)[], cutoffMs: number): number {
  let count = 0
  for (const value of availability) {
    const availableAtMs = parseTimestampMs(value)
    if (!Number.isNaN(availableAtMs) && availableAtMs >= cutoffMs) count += 1
  }
  return count
}

/**
 * Pure freshness computation for one package from raw availability inputs.
 * Exposed for behavioral tests and for callers that already hold the rows;
 * production routes use getPackageContentFreshness instead.
 */
export function computePackageContentFreshness(
  examSetRows: readonly ExamSetTimestamps[],
  summaryPlacementRows: readonly SummaryPlacementTimestamps[],
  legacySummaryRows: readonly LegacySummaryTimestamps[],
  now: Date = new Date(),
): PackageContentFreshness {
  const cutoffMs = now.getTime() - PACKAGE_CONTENT_FRESH_DAYS * 24 * 60 * 60 * 1000

  const newExamSetCount = countWithinWindow(examSetRows.map(examSetAvailabilityAt), cutoffMs)
  const newSummaryCount = countWithinWindow(
    [
      ...summaryPlacementRows.map(summaryPlacementAvailabilityAt),
      ...legacySummaryRows.map(legacySummaryAvailabilityAt),
    ],
    cutoffMs,
  )

  return {
    newExamSetCount,
    newSummaryCount,
    hasFreshContent: newExamSetCount > 0 || newSummaryCount > 0,
  }
}

interface RawTimestampRow {
  package_id: string | null
  [column: string]: unknown
}

async function readTimestampRows(
  client: FreshnessReadClient,
  table: string,
  columns: string,
  packageIds: readonly string[],
  filters: readonly { column: string; value: string | boolean | null }[],
): Promise<readonly RawTimestampRow[]> {
  let query = client.from(table).select(columns).in('package_id', [...packageIds])
  for (const filter of filters) {
    query =
      filter.value === null
        ? query.is(filter.column, null)
        : query.eq(filter.column, filter.value)
  }

  const result = await query
  if (result?.error) {
    throw new Error(result.error.message || `${table} freshness read failed`)
  }
  return (Array.isArray(result?.data) ? result.data : []) as RawTimestampRow[]
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

  try {
    const [examSetRows, placementRows, legacyRows] = await Promise.all([
      // Availability = released_at (publish stamp) with created_at fallback.
      readTimestampRows(client, 'exam_sets', 'package_id, released_at, created_at', ids, [
        { column: 'status', value: 'published' },
      ]),
      // KP-native summary availability = placement activation. RLS scopes
      // this to placements the current viewer can actually read.
      readTimestampRows(client, 'package_summaries', 'package_id, activated_at', ids, [
        { column: 'status', value: 'active' },
      ]),
      // Legacy summary availability = released_at (migration 089 stamp) with
      // created_at fallback. summary_code IS NULL excludes KP-native rows,
      // which are counted via their placements above (no double counting).
      readTimestampRows(client, 'summaries', 'package_id, released_at, created_at', ids, [
        { column: 'is_published', value: true },
        { column: 'summary_code', value: null },
      ]),
    ])

    const cutoffMs = Date.now() - PACKAGE_CONTENT_FRESH_DAYS * 24 * 60 * 60 * 1000
    const availabilityByPackage = (
      rows: readonly RawTimestampRow[],
      availabilityAt: (row: any) => string | null,
    ): Map<string, (string | null)[]> => {
      const byPackage = new Map<string, (string | null)[]>()
      for (const row of rows) {
        if (!row.package_id) continue
        const list = byPackage.get(row.package_id) ?? []
        list.push(availabilityAt(row))
        byPackage.set(row.package_id, list)
      }
      return byPackage
    }

    const examAvailability = availabilityByPackage(examSetRows, examSetAvailabilityAt)
    const placementAvailability = availabilityByPackage(placementRows, summaryPlacementAvailabilityAt)
    const legacyAvailability = availabilityByPackage(legacyRows, legacySummaryAvailabilityAt)

    const freshness: Record<string, PackageContentFreshness> = {}
    for (const id of ids) {
      const result = {
        newExamSetCount: countWithinWindow(examAvailability.get(id) ?? [], cutoffMs),
        newSummaryCount: countWithinWindow(
          [
            ...(placementAvailability.get(id) ?? []),
            ...(legacyAvailability.get(id) ?? []),
          ],
          cutoffMs,
        ),
      }
      if (result.newExamSetCount > 0 || result.newSummaryCount > 0) {
        freshness[id] = { ...result, hasFreshContent: true }
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
