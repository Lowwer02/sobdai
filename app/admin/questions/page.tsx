import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import QuestionsClient from './QuestionsClient'
import { UNASSIGNED_SUBJECT } from '@/lib/subjects'

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('content.read')

  const params = await searchParams

  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const difficultyFilter = typeof params.difficulty === 'string' ? params.difficulty : ''
  const categoryFilter = typeof params.category === 'string' ? params.category : ''
  const subjectFilter = typeof params.subject === 'string' ? params.subject : ''
  const documentFilter = typeof params.document === 'string' ? params.document : ''
  const lawFilter = typeof params.law === 'string' ? params.law : ''
  const topicFilter = typeof params.topic === 'string' ? params.topic : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1


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
  // Subject filter: the special sentinel selects records with no subject
  // (null/empty). Anything else matches the stored value (curated code or
  // legacy free text). This is part of the existing query — no extra round
  // trip introduced.
  if (subjectFilter && subjectFilter !== 'All') {
    if (subjectFilter === UNASSIGNED_SUBJECT.code) {
      query = query.or('subject.is.null,subject.eq.')
    } else {
      query = query.eq('subject', subjectFilter)
    }
  }
  // Document filter: behaves exactly like the Subject filter — part of the
  // same query, no extra round trip. The sentinel selects records with no
  // document set.
  if (documentFilter && documentFilter !== 'All') {
    if (documentFilter === UNASSIGNED_SUBJECT.code) {
      query = query.or('document.is.null,document.eq.')
    } else {
      query = query.eq('document', documentFilter)
    }
  }
  if (lawFilter && lawFilter !== 'All') {
    query = query.eq('law', lawFilter)
  }
  if (topicFilter && topicFilter !== 'All') {
    query = query.eq('topic', topicFilter)
  }

  // Add pagination and ordering
  query = query
    .range(from, to)
    .order('created_at', { ascending: false })

  const { data: questions, count, error } = await query

  const totalPages = count ? Math.ceil(count / limit) : 0

  // 1. Fetch Aggregated Counts
  const [
    { count: totalCount },
    { count: publishedCount },
    { count: reviewCount },
    { count: draftCount }
  ] = await Promise.all([
    supabase.from('questions').select('*', { count: 'exact', head: true }),
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('status', 'Published'),
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('status', 'Review'),
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('status', 'Draft'),
  ])

  // Filter dropdown values for free-text/optional columns. Subject is a
  // curated list (lib/subjects.ts) so it is not scanned. Document is also
  // surfaced here so the dropdown can list existing document names.
  const { data: filterData } = await supabase
    .from('questions')
    .select('category, law, topic, document')

  const uniqueCategories = Array.from(new Set(filterData?.map(c => c.category).filter(Boolean))) as string[]
  const uniqueDocuments = Array.from(new Set(filterData?.map(c => c.document).filter(Boolean))) as string[]
  const uniqueLaws = Array.from(new Set(filterData?.map(c => c.law).filter(Boolean))) as string[]
  const uniqueTopics = Array.from(new Set(filterData?.map(c => c.topic).filter(Boolean))) as string[]

  return (
    <QuestionsClient
      questions={questions || []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      statusFilter={statusFilter}
      difficultyFilter={difficultyFilter}
      categoryFilter={categoryFilter}
      subjectFilter={subjectFilter}
      documentFilter={documentFilter}
      lawFilter={lawFilter}
      topicFilter={topicFilter}
      uniqueCategories={uniqueCategories}
      uniqueDocuments={uniqueDocuments}
      uniqueLaws={uniqueLaws}
      uniqueTopics={uniqueTopics}
      totalCount={totalCount || 0}
      publishedCount={publishedCount || 0}
      reviewCount={reviewCount || 0}
      draftCount={draftCount || 0}
    />
  )
}
