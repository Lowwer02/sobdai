import { createAnonServerClient } from '@/lib/supabase/anon-server'

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

