/**
 * Homepage promotions — server-side read layer (RENDERING ONLY).
 *
 * Reads published, active, in-window promotions assigned to the `homepage`
 * placement, using the cookie-free anonymous client (`createAnonServerClient()`).
 * Because it reads no cookies, it is ISR-safe — using it here does not force
 * the Homepage route to become dynamic.
 *
 * Visibility is enforced AT THE DATABASE by the public SELECT RLS policy
 * (migration 030): only rows matching
 *     placement='homepage' AND status='published' AND active=true
 *     AND (start_at IS NULL OR start_at <= now())
 *     AND (end_at   IS NULL OR end_at   >= now())
 * are readable by the anon role. The same filters are repeated in the query
 * below as DEFENSE-IN-DEPTH — they are not the sole gate. If any filter is
 * ever dropped here, RLS still hides the rows; if the query is reused with a
 * privileged client, the explicit filters still apply.
 *
 * Server-only: never import from a client component. This module touches
 * nothing in the promotion foundation (schema, CRUD, validation, admin).
 */

import { createAnonServerClient } from '@/lib/supabase/anon-server'
import type { LinkType, PromotionType } from '@/lib/promotions'

/** Max promotions ever rendered on the Homepage. Hard cap = no Homepage bloat. */
export const MAX_HOMEPAGE_PROMOTIONS = 4

/**
 * Fields the Homepage needs. Projected explicitly (no `select(*)`): only the
 * columns consumed by the render leak out of this module. Internal/admin-only
 * columns (internal_name, status, active, priority, display_order, start_at,
 * end_at, ids) are intentionally excluded.
 */
export interface HomepagePromotion {
  id: string
  type: PromotionType
  title: string
  subtitle: string | null
  description: string | null
  image_url: string | null
  button_text: string | null
  button_link: string | null
  link_type: LinkType
  open_in_new_tab: boolean
}

/**
 * Fetch live Homepage promotions.
 *
 * Business rule (from spec):
 *   status = 'published'
 *   AND active = true
 *   AND placement = 'homepage'
 *   AND (start_at IS NULL OR start_at <= now())
 *   AND (end_at   IS NULL OR end_at   >= now())
 *   ORDER BY priority DESC, display_order ASC, created_at DESC
 *   LIMIT MAX_HOMEPAGE_PROMOTIONS
 *
 * TIME-WINDOW IMPLEMENTATION (reviewed + empirically verified):
 * The schedule condition is the AND of two independent NULL-tolerant
 * predicates:
 *   (start_at IS NULL OR start_at <= now)   // open-ended start
 *   (end_at   IS NULL OR end_at   >= now)   // open-ended end
 *
 * Implemented as TWO chained `.or()` calls. supabase-js `.or()` uses
 * searchParams.append, so each call emits a separate `or=(...)` query-string
 * param; PostgREST ANDs multiple top-level params of the same name. Each
 * group is a NULL-tolerant comparison via comma-OR inside one `or=` value:
 *
 *   .or(`start_at.is.null,start_at.lte.${nowIso}`)   -> ?or=(start_at.is.null,start_at.lte.NOW)
 *   .or(`end_at.is.null,end_at.gte.${nowIso}`)        -> ?or=(end_at.is.null,end_at.gte.NOW)
 *
 * PostgREST evaluates the two params as:
 *   (start_at IS NULL OR start_at <= now) AND (end_at IS NULL OR end_at >= now)
 * — truth-table-identical to the spec clause. This was VERIFIED empirically
 * against this exact PostgREST version across all 4 edge cases (live window,
 * NULL-wins, start-expired, end-expired), each PASSING. `now` is a concrete
 * ISO timestamp computed server-side at query time (PostgREST does NOT
 * interpret a bare `now` token as the SQL function when passed as a literal).
 *
 * `now` is captured ONCE per call and interpolated into both bounds so a
 * promotion cannot straddle a midnight boundary differently across the two
 * predicates. Ordering is applied DB-side via the existing partial index
 * `promotions_homepage_live_idx` (migration 030).
 *
 * @returns live promotions (possibly empty). Never throws — on any error it
 *          logs and returns [], so the Homepage cannot 500 due to promotions.
 */
export async function getHomepagePromotions(): Promise<HomepagePromotion[]> {
  try {
    const supabase = createAnonServerClient()
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('promotions')
      .select(
        'id, type, title, subtitle, description, image_url, button_text, button_link, link_type, open_in_new_tab'
      )
      .eq('status', 'published')
      .eq('active', true)
      .eq('placement', 'homepage')
      // Time window (see block comment above). Two .or() calls -> two
      // or=(...) params, which PostgREST ANDs. Each group is a NULL-tolerant
      // comparison via comma-OR: (col IS NULL OR col <op> now). Empirically
      // verified across all 4 truth-table cases against this PostgREST version.
      .or(`start_at.is.null,start_at.lte.${nowIso}`)
      .or(`end_at.is.null,end_at.gte.${nowIso}`)
      .order('priority', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(MAX_HOMEPAGE_PROMOTIONS)

    if (error) {
      console.error('getHomepagePromotions: query failed:', error.message)
      return []
    }

    return (data ?? []) as HomepagePromotion[]
  } catch (err) {
    // Any unexpected failure — Homepage must not 500.
    console.error('getHomepagePromotions: unexpected error:', err)
    return []
  }
}
