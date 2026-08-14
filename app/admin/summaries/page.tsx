import { requirePermission } from '@/lib/auth/server-protect'
import SummariesClient from './SummariesClient'
import {
  parseSummaryLibraryQueryParams,
  type SummaryLibraryCompatibilityQueryRequest,
} from '@/lib/application/knowledge-platform'
import { createSummaryLibraryCompatibilityRepository } from '@/lib/infrastructure/knowledge-platform'

const SUMMARY_LIBRARY_PAGE_SIZE = 15

export default async function SummariesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase } = await requirePermission('content.read')

  const params = await searchParams

  const libraryQuery = parseSummaryLibraryQueryParams(params)
  const search = libraryQuery.search ?? ''
  const packageFilter = typeof params.package === 'string' ? params.package : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''
  const subjectFilter = typeof params.subject === 'string' ? params.subject : ''
  const documentFilter = typeof params.document === 'string' ? params.document : ''

  const legacySortKey = libraryQuery.sort.key === 'canonicalTitle' || libraryQuery.sort.key === 'updatedAt'
    ? libraryQuery.sort.key
    : 'updatedAt'
  const legacySortDirection = legacySortKey === libraryQuery.sort.key
    ? libraryQuery.sort.direction
    : 'desc'

  const request: SummaryLibraryCompatibilityQueryRequest = {
    search: libraryQuery.search,
    packageId: packageFilter && packageFilter !== 'All' ? packageFilter : null,
    publicationStatus:
      statusFilter === 'published' || statusFilter === 'draft'
        ? statusFilter
        : null,
    subject: subjectFilter && subjectFilter !== 'All' ? subjectFilter : null,
    document: documentFilter && documentFilter !== 'All' ? documentFilter : null,
    sort: {
      key: legacySortKey,
      direction: legacySortDirection,
    },
    page: libraryQuery.page,
    pageSize: SUMMARY_LIBRARY_PAGE_SIZE,
  }

  const repository = createSummaryLibraryCompatibilityRepository(supabase)
  const compatibilityPage = await repository.search(request)

  const summaries = compatibilityPage.items.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    package_name: item.packageName,
    package_names: item.packages.map((pkg) => pkg.name),
    subject: item.subject,
    document: item.document,
    topic: item.topic,
    sort_order: item.sortOrder,
    is_published: item.isPublished,
  }))

  return (
    <SummariesClient
      summaries={summaries}
      packages={[...compatibilityPage.facets.packageOptions]}
      totalPages={compatibilityPage.totalPages}
      currentPage={compatibilityPage.page}
      search={search}
      packageFilter={packageFilter}
      statusFilter={statusFilter}
      subjectFilter={subjectFilter}
      documentFilter={documentFilter}
      uniqueDocuments={[...compatibilityPage.facets.documentOptions]}
      sortKey={legacySortKey}
      sortDirection={legacySortDirection}
    />
  )
}
