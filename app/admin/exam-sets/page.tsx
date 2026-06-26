import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import ExamSetsClient from './ExamSetsClient'

export default async function ExamSetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const packageFilter = typeof params.package === 'string' ? params.package : ''
  const typeFilter = typeof params.type === 'string' ? params.type : '' // Sample vs Full

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

  // Add pagination and ordering
  query = query
    .range(from, to)
    .order('created_at', { ascending: false })

  const { data: rawExamSets, count, error } = await query

  const totalPages = count ? Math.ceil(count / limit) : 0

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
    />
  )
}
