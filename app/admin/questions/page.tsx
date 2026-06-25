import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import QuestionsClient from './QuestionsClient'

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const difficultyFilter = typeof params.difficulty === 'string' ? params.difficulty : ''
  const categoryFilter = typeof params.category === 'string' ? params.category : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )

  // Build Query
  let query = supabase
    .from('questions')
    .select('*', { count: 'exact' })
    
  if (search) {
    query = query.ilike('content', `%${search}%`)
  }
  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('status', statusFilter)
  }
  if (difficultyFilter && difficultyFilter !== 'All') {
    query = query.eq('difficulty', difficultyFilter)
  }
  if (categoryFilter && categoryFilter !== 'All') {
    query = query.eq('category', categoryFilter)
  }

  // Add pagination and ordering
  query = query
    .range(from, to)
    .order('created_at', { ascending: false })

  const { data: questions, count, error } = await query

  const totalPages = count ? Math.ceil(count / limit) : 0

  // Fetch unique categories for the filter dropdown
  const { data: categoryData } = await supabase
    .from('questions')
    .select('category')
    .neq('category', null)

  const uniqueCategories = Array.from(new Set(categoryData?.map(c => c.category).filter(Boolean))) as string[]

  return (
    <QuestionsClient 
      questions={questions || []} 
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      difficultyFilter={difficultyFilter}
      categoryFilter={categoryFilter}
      uniqueCategories={uniqueCategories}
    />
  )
}
