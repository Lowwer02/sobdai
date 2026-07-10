import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import ExamSetsClient from './ExamSetsClient'
import { applyContentOrdering } from '@/lib/contentOrdering'

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

  // Add pagination and Smart Content Ordering (DB-side).
  query = applyContentOrdering(query).range(from, to)

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
