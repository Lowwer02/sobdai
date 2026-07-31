import { requirePermission } from '@/lib/auth/server-protect'
import NewsClient from '@/components/admin/news/NewsClient'
import { NEWS_STATUSES, type NewsStatus } from '@/lib/news'

/**
 * Government News — admin list (Server Component).
 *
 * Mirrors the promotions/users/summaries list convention: the page fetches
 * directly with the RLS-enforced session client (there is intentionally no
 * `listNews` action for the articles themselves — `listNews` in actions.ts is
 * the related-content picker for packages/summaries). Filtering + pagination
 * are URL-driven so the view is shareable and refresh-safe.
 *
 * Divergence from promotions, by necessity:
 *   - The secondary filter is `category` (free-text, no enum), not `type`. The
 *     options are data-driven from the distinct categories already in use,
 *     since news has no controlled vocabulary (migration 031).
 *   - `applyContentOrdering()` is NOT reused: it orders by `released_at` and
 *     `display_order`, columns the `news` table does not have. Ordering is built
 *     inline from news's actual columns (published_at → updated_at → created_at).
 */
export default async function NewsListPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase } = await requirePermission('content.read')

  const params = await searchParams
  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page) || 1) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const categoryFilter = typeof params.category === 'string' ? params.category : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  // List columns only — never select body_markdown / seo fields into the list.
  let query: any = supabase
    .from('news')
    .select('id, slug, title, excerpt, category, status, published_at, updated_at, created_at', {
      count: 'exact',
    })

  if (search) {
    query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%,slug.ilike.%${search}%`)
  }
  // Guard against arbitrary values: only apply .eq for a real status/category.
  const validStatuses = NEWS_STATUSES.map(s => s.value)
  if (statusFilter && validStatuses.includes(statusFilter as NewsStatus)) {
    query = query.eq('status', statusFilter)
  }
  if (categoryFilter) {
    query = query.eq('category', categoryFilter)
  }

  // Newest/most-relevant first, adapted to news's columns (no released_at here).
  query = query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const { data: news, count } = await query
  const totalPages = count ? Math.ceil(count / limit) : 0

  // Category options are data-driven (free-text taxonomy, no enum). Cheap over
  // editorial volume; dedupes + sorts for a stable dropdown.
  const { data: catRows } = await supabase
    .from('news')
    .select('category')
    .not('category', 'is', null)
  const categories = Array.from(
    new Set((catRows ?? []).map(r => r.category).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b))

  return (
    <NewsClient
      news={news ?? []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      categoryFilter={categoryFilter}
      categories={categories}
    />
  )
}
