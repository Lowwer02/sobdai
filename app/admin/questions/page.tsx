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
  // IG-2 axes (Session 6.20 E-0.6) — four new filters, same query pattern.
  const blueprintTypeFilter = typeof params.blueprint_type === 'string' ? params.blueprint_type : ''
  const learningObjectiveFilter = typeof params.learning_objective === 'string' ? params.learning_objective : ''
  const questionPatternFilter = typeof params.question_pattern === 'string' ? params.question_pattern : ''
  const sectionFilter = typeof params.section === 'string' ? params.section : ''

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
  // IG-2 axes — same eq() filter pattern as Subject/Document/Law/Topic above.
  // No sentinel for "unassigned" on these (NULL handling is via the same
  // implicit "filter value absent → no row matches" rule the others use for
  // non-sentinel filters; a NULL-axis Browser filter is out of scope for E-0).
  if (blueprintTypeFilter && blueprintTypeFilter !== 'All') {
    query = query.eq('blueprint_type', blueprintTypeFilter)
  }
  if (learningObjectiveFilter && learningObjectiveFilter !== 'All') {
    query = query.eq('learning_objective', learningObjectiveFilter)
  }
  if (questionPatternFilter && questionPatternFilter !== 'All') {
    query = query.eq('question_pattern', questionPatternFilter)
  }
  if (sectionFilter && sectionFilter !== 'All') {
    query = query.eq('section', sectionFilter)
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

  // Filter dropdown values. Documents / Topics / Laws come from the SAME
  // single source of truth as the Question Picker: the get_question_metadata
  // RPC (migration 022), which returns DISTINCT, non-null, sorted arrays and
  // is immune to PostgREST's 1000-row cap. The previous implementation did a
  // full-table `select('category, law, topic, document')` + JS dedup, which
  // was silently truncated on Banks > 1000 rows — the exact bug that made
  // newly imported Documents appear in the Picker but go missing here.
  //
  // Category is a legacy/optional free-text column the RPC doesn't cover;
  // its distinct set is small and bounded, so it is fetched separately with
  // an explicit cap (no row-cap risk). Subject is a curated list
  // (lib/subjects.ts), not scanned.
  type MetaRow = {
    subjects: string[] | null
    documents: string[] | null
    topics: string[] | null
    laws: string[] | null
    // IG-2 axes (migration 028). Nullable for the empty-Bank case.
    blueprint_types: string[] | null
    learning_objectives: string[] | null
    question_patterns: string[] | null
    sections: string[] | null
  }
  const { data: metaData, error: metaErr } = (await (supabase as any).rpc('get_question_metadata')) as {
    data: MetaRow[] | null
    error: { message: string } | null
  }
  if (metaErr) {
    console.error('get_question_metadata RPC failed:', metaErr.message)
  }
  const metaRow = (metaData && metaData[0]) || {
    subjects: null,
    documents: null,
    topics: null,
    laws: null,
    blueprint_types: null,
    learning_objectives: null,
    question_patterns: null,
    sections: null,
  }

  // Category is not part of the shared metadata RPC; fetch its distinct
  // values separately. Bounded + deduped in JS — safe because the distinct
  // category set is small regardless of Bank size.
  const { data: categoryData } = await supabase
    .from('questions')
    .select('category')
    .not('category', 'is', null)

  const uniqueCategories = Array.from(new Set((categoryData ?? []).map(c => c.category).filter(Boolean))) as string[]
  const uniqueDocuments = metaRow.documents ?? []
  const uniqueLaws = metaRow.laws ?? []
  const uniqueTopics = metaRow.topics ?? []
  // IG-2 axes — distinct non-null sets from the RPC. Empty arrays when no
  // row has the axis populated (mixed v2.1/v2.2 repository steady state).
  const uniqueBlueprintTypes = metaRow.blueprint_types ?? []
  const uniqueLearningObjectives = metaRow.learning_objectives ?? []
  const uniqueQuestionPatterns = metaRow.question_patterns ?? []
  const uniqueSections = metaRow.sections ?? []

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
      blueprintTypeFilter={blueprintTypeFilter}
      learningObjectiveFilter={learningObjectiveFilter}
      questionPatternFilter={questionPatternFilter}
      sectionFilter={sectionFilter}
      uniqueCategories={uniqueCategories}
      uniqueDocuments={uniqueDocuments}
      uniqueLaws={uniqueLaws}
      uniqueTopics={uniqueTopics}
      uniqueBlueprintTypes={uniqueBlueprintTypes}
      uniqueLearningObjectives={uniqueLearningObjectives}
      uniqueQuestionPatterns={uniqueQuestionPatterns}
      uniqueSections={uniqueSections}
      totalCount={totalCount || 0}
      publishedCount={publishedCount || 0}
      reviewCount={reviewCount || 0}
      draftCount={draftCount || 0}
    />
  )
}
