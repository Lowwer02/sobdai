import { requirePermission } from '@/lib/auth/server-protect'
import ArticlesClient from '@/components/admin/articles/ArticlesClient'
import { ARTICLE_STATUSES, type Article, type ArticleStatus } from '@/lib/articles'

export default async function ArticlesListPage({
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

  let query: any = supabase
    .from('articles')
    .select('id, slug, title, excerpt, category, status, published_at, updated_at, created_at', {
      count: 'exact',
    })

  if (search) {
    query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%,slug.ilike.%${search}%`)
  }

  const validStatuses = ARTICLE_STATUSES.map((s) => s.value)
  if (statusFilter && validStatuses.includes(statusFilter as ArticleStatus)) {
    query = query.eq('status', statusFilter)
  }
  if (categoryFilter) {
    query = query.eq('category', categoryFilter)
  }

  query = query
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const { data: articles, count } = await query
  const totalPages = count ? Math.ceil(count / limit) : 0

  const { data: catRows } = await supabase
    .from('articles')
    .select('category')
    .not('category', 'is', null)

  const categories = Array.from(
    new Set((catRows ?? []).map((r) => r.category).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b))

  return (
    <ArticlesClient
      articles={(articles ?? []) as unknown as Article[]}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      categoryFilter={categoryFilter}
      categories={categories}
    />
  )
}
