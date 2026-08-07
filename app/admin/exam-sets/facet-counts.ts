// Facet count queries for the Admin Exam Sets list (Phase 4).
//
// Status counts behave as a FACET: they reflect the other active filters
// (Search / Package / Type) but NOT the currently selected status. This module
// builds the shared filtered base and aggregates per-status counts safely.
//
// Notes on purity (correction #3): `buildExamSetFacetQuery` accepts a Supabase
// query builder, so it is NOT a pure function in the mathematical sense — it
// is a small, deterministic builder that records which predicates it applies.
// It is unit-tested with a fake builder that records calls so we can assert it
// applies exactly Search/Package/Type and never Status/pagination/ordering.
//
// All counts are computed server-side via `head: true` (no row data shipped).

// Relative import so this module's unit tests run under plain `npx jiti`
// (no `@/` alias resolution at test time). The build resolves either form.
import { ExamSetStatus, EXAM_SET_STATUS_VALUES } from '../../../lib/exam-set-status'

/**
 * The "other" filters that a status facet count must respect. These mirror
 * the main list query's non-status predicates EXACTLY (page.tsx). `status`
 * is intentionally absent — facets ignore the current status selection.
 */
export interface ExamSetFacetFilters {
  /** `?q=` — case-insensitive name match, or empty for no filter. */
  search?: string
  /** `?package=` — packages.id, or empty/''/'All' for no filter. */
  packageFilter?: string
  /** `?type=` — 'Sample' | 'Full' | '' | 'All' → is_sample flag, or none. */
  typeFilter?: string
}

/**
 * Minimal contract of a filterable query builder this helper needs. The real
 * Supabase `PostgrestFilterBuilder` (the type returned by `.select(...)`)
 * satisfies this structurally; tests pass a recording fake. Kept narrow so the
 * helper does not over-couple to PostgREST's deeply-generic internals —
 * accepting the erased `FilterableQueryBuilder` avoids TS2589 (excessive type
 * instantiation depth) that arises when threading Supabase's full generics
 * through a generic helper.
 *
 * Methods return `this`, so both the real builder and the fake stay chainable.
 */
export interface FilterableQueryBuilder {
  ilike(column: string, pattern: string): this
  eq(column: string, value: string | boolean): this
}

/**
 * Apply the shared "other filters" (Search / Package / Type) to a query
 * builder, using the SAME semantics as the main list query (page.tsx:43-51):
 *   - search  → `.ilike('name', `%${search}%`)`  (only when non-empty)
 *   - package → `.eq('package_id', packageFilter)` (only when concrete)
 *   - type    → `.eq('is_sample', typeFilter === 'Sample')` (only when concrete)
 *
 * It applies NO status filter and NO pagination/ordering — callers (the count
 * queries) finish the builder with the per-status `.eq('status', …)`.
 *
 * Returns the erased `FilterableQueryBuilder` so callers can chain `.eq` (for
 * the status facet) without instantiating Supabase's deep generics through a
 * generic parameter.
 */
export function buildExamSetFacetQuery(
  query: FilterableQueryBuilder,
  filters: ExamSetFacetFilters
): FilterableQueryBuilder {
  const { search, packageFilter, typeFilter } = filters
  if (search) {
    query = query.ilike('name', `%${search}%`)
  }
  if (packageFilter && packageFilter !== 'All') {
    query = query.eq('package_id', packageFilter)
  }
  if (typeFilter && typeFilter !== 'All') {
    query = query.eq('is_sample', typeFilter === 'Sample')
  }
  return query
}

// ─── Safe aggregation of per-status counts ──────────────────────────────────

/** One count query result as Supabase returns it: either a count or an error. */
export interface CountResult {
  count?: number | null
  error?: { message: string } | null
}

export interface FacetCounts {
  all: number
  draft: number
  published: number
  archived: number
}

export type AggregateFacetCountsResult =
  | { ok: true; counts: FacetCounts }
  | { ok: false; error: string }

/**
 * Aggregate three per-status count results into a FacetCounts object.
 *
 * If ANY result carries an error, returns `{ ok: false, error }` with a safe,
 * generic message — we do NOT silently substitute 0 for a failed query (that
 * would compute misleading counts). Only when all three succeed do we read
 * `result.count ?? 0` (the `?? 0` fallback is acceptable solely for a null
 * count on a successful query). `all` is the sum of the three, which equals
 * the true total because the DB CHECK constraint forbids any status outside
 * draft/published/archived.
 *
 * Extracted as a helper so the error handling is unit-testable without a DB.
 */
export function aggregateFacetCounts(
  draftResult: CountResult,
  publishedResult: CountResult,
  archivedResult: CountResult
): AggregateFacetCountsResult {
  // Any error short-circuits; never silently coerce to 0.
  if (draftResult.error) return facetError()
  if (publishedResult.error) return facetError()
  if (archivedResult.error) return facetError()

  const draft = draftResult.count ?? 0
  const published = publishedResult.count ?? 0
  const archived = archivedResult.count ?? 0
  return {
    ok: true,
    counts: {
      draft,
      published,
      archived,
      all: draft + published + archived,
    },
  }
}

/** Safe, generic error — never leaks DB details to the Admin. */
function facetError(): AggregateFacetCountsResult {
  return {
    ok: false,
    error: 'Could not load status counts. Please refresh the page.',
  }
}

// Re-export for callers that want the status list alongside the facet helpers.
export { EXAM_SET_STATUS_VALUES, type ExamSetStatus }
