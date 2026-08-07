import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import ExamSetsClient from './ExamSetsClient'
import { applyContentOrdering } from '@/lib/contentOrdering'
import { parseStatusParam } from './status-filter'
import {
  buildExamSetFacetQuery,
  aggregateFacetCounts,
  type FilterableQueryBuilder,
} from './facet-counts'

export default async function ExamSetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('content.read')

  const params = await searchParams
  
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const packageFilter = typeof params.package === 'string' ? params.package : ''
  const typeFilter = typeof params.type === 'string' ? params.type : '' // Sample vs Full
  // Validated status filter: invalid/array/unknown values fall back to 'all'
  // (no filter). `all` never reaches the query — see filter block below.
  const statusFilter = parseStatusParam(params.status)

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  
  // Fetch unique packages for filter
  const { data: packages } = await supabase
    .from('packages')
    .select('id, name')
    .order('name')

  // Build Query
  let query = supabase
    .from('exam_sets')
    .select(`
      *,
      packages!inner(name),
      exam_set_questions(count)
    `, { count: 'exact' })
    
  if (search) {
    query = query.ilike('name', `%${search}%`)
  }
  if (packageFilter && packageFilter !== 'All') {
    query = query.eq('package_id', packageFilter)
  }
  if (typeFilter && typeFilter !== 'All') {
    query = query.eq('is_sample', typeFilter === 'Sample')
  }
  // Server-side status filter. Only applied for a concrete status; 'all'
  // preserves the original (unfiltered) query exactly.
  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  // Add pagination and Smart Content Ordering (DB-side).
  query = applyContentOrdering(query).range(from, to)

  const { data: rawExamSets, count, error } = await query

  const totalPages = count ? Math.ceil(count / limit) : 0

  // ── Facet status counts (Phase 4) ────────────────────────────────────────
  // These counts behave as a FACET: they reflect the active Search / Package /
  // Type filters (the same predicates as the main list query) but NEVER the
  // currently selected Status. `all` is derived as draft + published + archived
  // (the DB CHECK constraint forbids any other status, so the sum equals the
  // true total). All three queries are `head: true` — no row data is shipped.
  // Run in parallel via Promise.all (same idiom as questions/page.tsx and the
  // dashboard). The main list query + pagination above are UNCHANGED: the
  // pagination `count` still comes from the filtered main query, not from here.
  const facetFilters = { search, packageFilter, typeFilter }
  // Build one head-only count query narrowed to a single status. The shared
  // Search/Package/Type predicates are applied via buildExamSetFacetQuery.
  //
  // The Supabase builder returned by `.select(...)` is a deeply-generic
  // `PostgrestFilterBuilder`; threading it through our generic helper triggers
  // TS2589 (excessive type instantiation depth). We cast it once to the erased
  // `FilterableQueryBuilder` contract at the Supabase boundary — the same
  // boundary-erasure pattern actions.ts uses for RPC calls. The cast only
  // widens the static type; the runtime object is unchanged.
  const statusCountFor = (status: 'draft' | 'published' | 'archived') =>
    buildExamSetFacetQuery(
      supabase.from('exam_sets').select('*', { count: 'exact', head: true }) as unknown as FilterableQueryBuilder,
      facetFilters
    ).eq('status', status)
  // Each count query selects with head:true first (no rows shipped), then the
  // shared Search/Package/Type filters are applied, then the per-status
  // `.eq('status', …)` narrows that facet. Order mirrors the main list query
  // (`.select(...)` then `.eq(...)`). Run in parallel.
  const [
    draftCountRes,
    publishedCountRes,
    archivedCountRes,
  ] = await Promise.all([
    statusCountFor('draft'),
    statusCountFor('published'),
    statusCountFor('archived'),
  ])
  // Each result is inspected; ANY error short-circuits to a safe failure rather
  // than silently substituting 0 (which would compute misleading counts).
  const facetResult = aggregateFacetCounts(
    draftCountRes as any,
    publishedCountRes as any,
    archivedCountRes as any
  )
  const statusCounts = facetResult.ok
    ? facetResult.counts
    : { all: null, draft: null, published: null, archived: null }

  // Format data
  const examSets = (rawExamSets || []).map((es: any) => ({
    ...es,
    package_name: es.packages?.name || 'Unknown',
    question_count: es.exam_set_questions?.[0]?.count || 0
  }))

  return (
    <ExamSetsClient 
      examSets={examSets} 
      packages={packages || []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      packageFilter={packageFilter}
      typeFilter={typeFilter}
      statusFilter={statusFilter}
      statusCounts={statusCounts}
    />
  )
}
