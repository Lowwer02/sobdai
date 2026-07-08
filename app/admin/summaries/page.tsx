import { requirePermission, getAdminSession } from '@/lib/auth/server-protect'
import SummariesClient from './SummariesClient'
import { UNASSIGNED_SUBJECT } from '@/lib/subjects'

export default async function SummariesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('content.read')

  const params = await searchParams

  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const packageFilter = typeof params.package === 'string' ? params.package : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const subjectFilter = typeof params.subject === 'string' ? params.subject : ''
  const documentFilter = typeof params.document === 'string' ? params.document : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1


  let query = supabase
    .from('summaries')
    .select('id, title, slug, subject, document, law, topic, sort_order, is_published, updated_at, packages!inner(name)', { count: 'exact' })

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }
  if (packageFilter && packageFilter !== 'All') {
    query = query.eq('package_id', packageFilter)
  }
  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('is_published', statusFilter === 'published')
  }
  // Subject filter: same query, no extra round trip. Sentinel → null/empty.
  if (subjectFilter && subjectFilter !== 'All') {
    if (subjectFilter === UNASSIGNED_SUBJECT.code) {
      query = query.or('subject.is.null,subject.eq.')
    } else {
      query = query.eq('subject', subjectFilter)
    }
  }
  // Document filter: behaves like Subject — same query, no extra round trip.
  if (documentFilter && documentFilter !== 'All') {
    if (documentFilter === UNASSIGNED_SUBJECT.code) {
      query = query.or('document.is.null,document.eq.')
    } else {
      query = query.eq('document', documentFilter)
    }
  }

  query = query.range(from, to).order('sort_order', { ascending: true }).order('updated_at', { ascending: false })

  const { data: rawSummaries, count } = await query

  const summaries = (rawSummaries || []).map((s: any) => ({
    ...s,
    package_name: s.packages?.name || 'Unknown Package'
  }))

  const totalPages = count ? Math.ceil(count / limit) : 0

  const { data: packages } = await supabase.from('packages').select('id, name').order('name')

  // Distinct document names for the filter dropdown (single column scan).
  const { data: docData } = await supabase
    .from('summaries')
    .select('document')
  const uniqueDocuments = Array.from(new Set((docData || []).map(d => d.document).filter(Boolean))) as string[]

  return (
    <SummariesClient
      summaries={summaries}
      packages={packages || []}
      totalPages={totalPages}
      currentPage={page}
      search={search}
      packageFilter={packageFilter}
      statusFilter={statusFilter}
      subjectFilter={subjectFilter}
      documentFilter={documentFilter}
      uniqueDocuments={uniqueDocuments}
    />
  )
}
