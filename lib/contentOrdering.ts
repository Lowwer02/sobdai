/**
 * Shared Smart Content Ordering for summaries + exam_sets.
 *
 * Ordering chain (highest priority first):
 *   1. display_order DESC   (admin pinning — higher = first)
 *   2. released_at  DESC    (publish/release time; NULLS LAST)
 *   3. updated_at   DESC    (most recent edit)
 *   4. created_at   DESC    (creation time, final tiebreaker)
 *
 * Applied at the DATABASE level only (no client-side sort). Supabase's
 * `.order()` is chained here so every query point uses the identical chain.
 *
 * `nullsFirst: false` on released_at sends rows without a release timestamp
 * to the bottom instead of letting NULLs sort first.
 */

/**
 * Apply the canonical ordering chain to a Supabase query builder.
 * Call this LAST, after all filters, and before `.range()`.
 */
// Using `any` for the builder type because the Supabase PostgrestFilterBuilder
// generic chain is verbose and every call site already has the concrete type;
// the helper only forwards `.order(...)` calls.
export function applyContentOrdering(q: any): any {
  return q
    .order('display_order', { ascending: false })
    .order('released_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
}
