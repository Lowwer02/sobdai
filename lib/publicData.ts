import { createAnonServerClient } from '@/lib/supabase/anon-server'
import type { PackageCardData } from '@/components/PackageCard'

export interface PackageCounts {
  total_questions: number
  total_exam_sets: number
  exam_set_counts: Record<string, number>
}

/**
 * Returns published question/exam-set counts for the given packages.
 *
 * Implementation note: this previously pulled the entire
 * packages -> exam_sets -> exam_set_questions -> questions graph into Node
 * and counted it in a JS loop (heavy payload + slow). It now calls the
 * `get_package_public_counts` Postgres RPC (migration 016), which aggregates
 * in a single SQL query.
 *
 * The RPC is SECURITY DEFINER and grants execute to `anon`. We intentionally
 * use the cookie-free anon server client (`createAnonServerClient`) so that
 * callers in statically rendered routes (e.g. the homepage with
 * `revalidate`) do NOT get forced into dynamic rendering by a `cookies()`
 * access. It only returns counts, never question content.
 */
export async function getPackagePublicCounts(
  packageIds: string[]
): Promise<Record<string, PackageCounts>> {
  if (!packageIds || packageIds.length === 0) return {}

  const supabase = createAnonServerClient()

  // The RPC is a custom Postgres function not covered by the auto-generated
  // DB types, so we declare its row shape and cast through `unknown`.
  type CountRow = {
    package_id: string
    total_questions: number
    total_exam_sets: number
    exam_set_counts: Record<string, number> | null
  }

  // supabase-js typings don't know this custom RPC's signature, so we go
  // through `any` for the call and re-shape the result into CountRow[].
  const { data, error } = (await (supabase as any).rpc('get_package_public_counts', {
    package_ids: packageIds,
  })) as { data: CountRow[] | null; error: { message: string } | null }

  if (error) {
    console.error('get_package_public_counts RPC failed:', error.message)
    return {}
  }

  const counts: Record<string, PackageCounts> = {}

  for (const row of data ?? []) {
    // exam_set_counts comes back as jsonb -> object; normalize keys/values.
    const rawSetCounts = (row.exam_set_counts ?? {}) as Record<string, number>
    const exam_set_counts: Record<string, number> = {}
    for (const [setId, q] of Object.entries(rawSetCounts)) {
      exam_set_counts[setId] = Number(q) || 0
    }

    counts[row.package_id] = {
      total_questions: Number(row.total_questions) || 0,
      total_exam_sets: Number(row.total_exam_sets) || 0,
      exam_set_counts,
    }
  }

  return counts
}

/**
 * Raw row shape returned by the `get_public_package_catalog` RPC (migration
 * 078). Flat columns; the loader reshapes them into PackageCardData.
 */
export interface PublicPackageCatalogRow {
  id: string
  slug: string
  exam_year: string | null
  current_price: number
  original_price: number
  difficulty: string
  description: string | null
  logo_url: string | null
  organization_name: string | null
  organization_logo_url: string | null
  position_name: string | null
  total_questions: number
  total_exam_sets: number
}

/**
 * One-roundtrip loader for the public /packages catalog (PERF-P0C-1).
 *
 * Replaces the previous two serialized calls (packages list → counts RPC)
 * with a single `get_public_package_catalog()` RPC. The RPC returns only
 * published packages ordered by created_at desc, with the same count
 * semantics as get_package_public_counts (migration 016): published
 * questions only, exam sets with ≥1 published question, zero-coalesced.
 *
 * Returns rows in the PackageCardData shape consumed by PackageCatalogClient.
 * On RPC failure it returns [] (matching the page's established list-query
 * failure mode — the page shows its empty state rather than misleading
 * zero-count cards).
 */
export async function getPublicPackageCatalog(): Promise<PackageCardData[]> {
  const supabase = createAnonServerClient()

  // Custom Postgres RPC not covered by the auto-generated DB types, so we
  // declare its row shape and cast through `unknown` (same pattern as
  // getPackagePublicCounts above).
  const { data, error } = (await (supabase as any).rpc('get_public_package_catalog')) as {
    data: PublicPackageCatalogRow[] | null
    error: { message: string } | null
  }

  if (error) {
    console.error('get_public_package_catalog RPC failed:', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    exam_year: row.exam_year ?? '',
    current_price: Number(row.current_price) || 0,
    original_price: Number(row.original_price) || 0,
    difficulty: row.difficulty,
    description: row.description,
    logo_url: row.logo_url,
    total_questions: Number(row.total_questions) || 0,
    total_exam_sets: Number(row.total_exam_sets) || 0,
    organizations: row.organization_name
      ? { name: row.organization_name, logo_url: row.organization_logo_url }
      : null,
    positions: row.position_name ? { name: row.position_name } : null,
  }))
}

/**
 * Fetches all published packages with organizations, positions, and live
 * question/exam-set counts. Shared across catalog pages (/packages and /packages/phak-khor)
 * to avoid duplicate fetching logic.
 */
export async function getPublishedPackages(): Promise<any[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('packages')
      .select(`
        id,
        slug,
        exam_year,
        current_price,
        original_price,
        difficulty,
        description,
        logo_url,
        organizations ( name, logo_url ),
        positions ( name )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error || !data || data.length === 0) {
      if (error) console.error('Failed to fetch published packages:', error)
      return []
    }

    const counts = await getPackagePublicCounts(data.map((p: any) => p.id))
    return data.map((pkg: any) => ({
      ...pkg,
      total_questions: counts[pkg.id]?.total_questions || 0,
      total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
    }))
  } catch (error) {
    console.error('Failed to fetch published packages:', error)
    return []
  }
}
