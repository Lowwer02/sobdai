import type {
  SummaryLibraryItem,
  SummaryLibraryPage,
  SummaryLibraryQuery,
  SummaryLibraryQueryRequest,
  SummaryLibraryReadRepository,
  SummaryLibrarySort,
  SummaryLibrarySortDirection,
  SummaryLibrarySortKey,
} from './contracts'

export const SUMMARY_LIBRARY_DEFAULT_PAGE_SIZE = 25
export const SUMMARY_LIBRARY_MAX_PAGE_SIZE = 100
export const SUMMARY_LIBRARY_MAX_PAGE = 10_000
export const SUMMARY_LIBRARY_MAX_SEARCH_LENGTH = 120

export const SUMMARY_LIBRARY_SORT_KEYS = [
  'updatedAt',
  'canonicalTitle',
  'summaryCode',
  'lifecycleStatus',
  'currentRevisionNumber',
] as const satisfies readonly SummaryLibrarySortKey[]

const SUMMARY_LIBRARY_DEFAULT_SORT: SummaryLibrarySort = {
  key: 'updatedAt',
  direction: 'desc',
}

const SUMMARY_LIBRARY_LIFECYCLE_STATUSES = ['active', 'archived'] as const
const SUMMARY_LIBRARY_VISIBILITIES = [
  'public_indexable',
  'authenticated',
  'product_entitled',
] as const

export type SummaryLibraryQueryParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>

export interface NormalizedSummaryLibraryQuery extends SummaryLibraryQueryRequest {
  readonly search: string | null
  readonly subject: string | null
  readonly topic: string | null
  readonly law: string | null
  readonly lifecycleStatus: SummaryLibraryQueryRequest['lifecycleStatus']
  readonly visibility: SummaryLibraryQueryRequest['visibility']
  readonly hasPublishedRevision: boolean | null
  readonly hasPackages: boolean | null
  readonly hasSources: boolean | null
  readonly sort: SummaryLibrarySort
  readonly page: number
  readonly pageSize: number
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeSearch(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized
    ? normalized.slice(0, SUMMARY_LIBRARY_MAX_SEARCH_LENGTH)
    : null
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN

  return Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : fallback
}

function normalizeSortKey(value: unknown): SummaryLibrarySortKey {
  return typeof value === 'string' &&
    (SUMMARY_LIBRARY_SORT_KEYS as readonly string[]).includes(value)
    ? value as SummaryLibrarySortKey
    : SUMMARY_LIBRARY_DEFAULT_SORT.key
}

function normalizeSortDirection(value: unknown): SummaryLibrarySortDirection {
  return value === 'asc' || value === 'desc'
    ? value
    : SUMMARY_LIBRARY_DEFAULT_SORT.direction
}

function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  return typeof value === 'string' && allowed.includes(value as T)
    ? value as T
    : null
}

/**
 * Normalize untrusted query state before it reaches a persistence adapter.
 * Empty filters become null, invalid numeric/sort values use safe defaults,
 * and search input is bounded so a URL cannot create an unbounded predicate.
 */
export function normalizeSummaryLibraryQuery(
  request: SummaryLibraryQueryRequest = {}
): NormalizedSummaryLibraryQuery {
  const pageSize = Math.min(
    SUMMARY_LIBRARY_MAX_PAGE_SIZE,
    normalizePositiveInteger(request.pageSize, SUMMARY_LIBRARY_DEFAULT_PAGE_SIZE)
  )

  return {
    search: normalizeSearch(request.search),
    subject: normalizeText(request.subject),
    topic: normalizeText(request.topic),
    law: normalizeText(request.law),
    lifecycleStatus: normalizeEnum(
      request.lifecycleStatus,
      SUMMARY_LIBRARY_LIFECYCLE_STATUSES
    ),
    visibility: normalizeEnum(request.visibility, SUMMARY_LIBRARY_VISIBILITIES),
    hasPublishedRevision: normalizeBoolean(request.hasPublishedRevision),
    hasPackages: normalizeBoolean(request.hasPackages),
    hasSources: normalizeBoolean(request.hasSources),
    sort: {
      key: normalizeSortKey(request.sort?.key),
      direction: normalizeSortDirection(request.sort?.direction),
    },
    page: Math.min(
      SUMMARY_LIBRARY_MAX_PAGE,
      normalizePositiveInteger(request.page, 1)
    ),
    pageSize,
  }
}

function firstQueryValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0]
}

function queryBoolean(value: string | undefined): boolean | null {
  return normalizeBoolean(value)
}

function queryInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? numberValue : null
}

/**
 * Convert Next.js searchParams into the same bounded request used by the
 * Application query. This is a transport mapper; it does not know Supabase.
 */
export function parseSummaryLibraryQueryParams(
  params: SummaryLibraryQueryParams
): NormalizedSummaryLibraryQuery {
  const sortKey = firstQueryValue(params.sort)
  const direction = firstQueryValue(params.direction)

  return normalizeSummaryLibraryQuery({
    search: firstQueryValue(params.q) ?? firstQueryValue(params.search),
    subject: firstQueryValue(params.subject),
    topic: firstQueryValue(params.topic),
    law: firstQueryValue(params.law),
    lifecycleStatus: firstQueryValue(params.lifecycleStatus) as SummaryLibraryQueryRequest['lifecycleStatus'],
    visibility: firstQueryValue(params.visibility) as SummaryLibraryQueryRequest['visibility'],
    hasPublishedRevision: queryBoolean(firstQueryValue(params.hasPublishedRevision)),
    hasPackages: queryBoolean(firstQueryValue(params.hasPackages)),
    hasSources: queryBoolean(firstQueryValue(params.hasSources)),
    sort: {
      key: sortKey as SummaryLibrarySortKey,
      direction: direction as SummaryLibrarySortDirection,
    },
    page: queryInteger(firstQueryValue(params.page)),
    pageSize: queryInteger(firstQueryValue(params.pageSize)),
  })
}

function contains(value: string | null, search: string): boolean {
  return value?.toLocaleLowerCase().includes(search) ?? false
}

function compareText(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left < right ? -1 : 1
}

function compareNumbers(left: number | null, right: number | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left < right ? -1 : 1
}

function compareItems(
  left: SummaryLibraryItem,
  right: SummaryLibraryItem,
  sort: SummaryLibrarySort
): number {
  let result: number
  switch (sort.key) {
    case 'canonicalTitle':
      result = compareText(left.canonicalTitle, right.canonicalTitle)
      break
    case 'summaryCode':
      result = compareText(left.summaryCode, right.summaryCode)
      break
    case 'lifecycleStatus':
      result = compareText(left.lifecycleStatus, right.lifecycleStatus)
      break
    case 'currentRevisionNumber':
      result = compareNumbers(left.currentRevisionNumber, right.currentRevisionNumber)
      break
    case 'updatedAt':
    default:
      result = compareText(left.updatedAt, right.updatedAt)
      break
  }

  if (result !== 0) return sort.direction === 'asc' ? result : -result
  return compareText(left.summaryId, right.summaryId)
}

/**
 * Compatibility fallback for an F4.1 repository that only exposes list().
 * Target-backed repositories should implement `search()` so filtering,
 * sorting, and pagination remain database-side and indexed.
 */
function searchListedItems(
  items: readonly SummaryLibraryItem[],
  request: NormalizedSummaryLibraryQuery
): SummaryLibraryPage {
  const filtered = items.filter((item) => {
    const search = request.search?.toLocaleLowerCase()
    if (
      search &&
      ![
        item.summaryCode,
        item.canonicalSlug,
        item.canonicalTitle,
        item.currentRevisionTitle,
        item.subject,
        item.topic,
        item.law,
      ].some((value) => contains(value, search))
    ) return false
    if (request.subject && item.subject !== request.subject) return false
    if (request.topic && item.topic !== request.topic) return false
    if (request.law && item.law !== request.law) return false
    if (request.lifecycleStatus && item.lifecycleStatus !== request.lifecycleStatus) return false
    if (request.visibility && item.visibility !== request.visibility) return false
    if (
      request.hasPublishedRevision !== null &&
      (item.currentPublishedVersionId !== null) !== request.hasPublishedRevision
    ) return false
    if (
      request.hasPackages !== null &&
      (item.packagePlacementCount > 0) !== request.hasPackages
    ) return false
    if (
      request.hasSources !== null &&
      (item.sourceDocumentCount > 0) !== request.hasSources
    ) return false
    return true
  })

  const sorted = [...filtered].sort((left, right) => compareItems(left, right, request.sort))
  const totalItems = sorted.length
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / request.pageSize)
  const page = totalPages === 0 ? 1 : Math.min(request.page, totalPages)
  const start = (page - 1) * request.pageSize

  return {
    items: sorted.slice(start, start + request.pageSize),
    page,
    pageSize: request.pageSize,
    totalItems,
    totalPages,
  }
}

/**
 * Application read use case for the Admin Summary Library.
 *
 * `list()` remains the F4.1 complete projection read. `search()` adds the
 * bounded F4.2 discovery contract without changing the existing list shape.
 */
export class SummaryLibraryQueryService implements SummaryLibraryQuery {
  public constructor(
    private readonly repository: SummaryLibraryReadRepository
  ) {}

  public async list(): Promise<readonly SummaryLibraryItem[]> {
    return this.repository.list()
  }

  public async search(
    request: SummaryLibraryQueryRequest = {}
  ): Promise<SummaryLibraryPage> {
    const normalized = normalizeSummaryLibraryQuery(request)
    if (this.repository.search) return this.repository.search(normalized)

    return searchListedItems(await this.repository.list(), normalized)
  }
}
