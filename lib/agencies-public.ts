import 'server-only'

import { cache } from 'react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { isOperationalPositionPlaceholder } from '@/lib/position-entity'
import {
  dedupeById,
  isAgencyNewsItem,
  isAgencyProfileIndexReady,
  isStableAgencySlug,
  normalizeAgencySources,
  normalizeAgencyText,
  selectAgencyPageBySlug,
  selectIndexableAgencyPages,
  selectPublishedPackages,
  sortAgencyContent,
  type AgencyEditorialIdentity,
  type AgencySource,
} from '@/lib/agency-profile'

const MAX_PROFILES = 200
const MAX_ORG_POSITIONS = 2000
const MAX_PACKAGES = 1000
const MAX_RELATION_ROWS = 5000
const MAX_CONTENT_ROWS = 1000
const MAX_RELATED_NEWS = 6
const MAX_RELATED_ARTICLES = 6

export interface PublicAgencyAuthor {
  id: string
  slug: string
  display_name: string
  role_title: string | null
  short_bio: string | null
  avatar_url: string | null
}

export interface PublicAgencyOrganization {
  id: string
  code: string | null
  name: string
  short_name: string | null
  logo_url: string | null
  description: string | null
}

export interface PublicAgencyProfile {
  id: string
  organization_id: string
  slug: string
  overview_markdown: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  published_at: string | null
  sources: AgencySource[]
  author_id: string | null
  author: PublicAgencyAuthor | null
  created_at: string | null
  updated_at: string | null
}

export interface PublicAgencyOperationalPosition {
  id: string
  name: string
  organization_id: string
}

export interface PublicAgencyCanonicalPosition {
  id: string
  slug: string
  name: string
}

export interface PublicAgencyPackage {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  cover_image_url: string | null
  current_price: number | null
  original_price: number | null
  exam_year: string | null
  organization_id: string | null
  position_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PublicAgencyContentItem {
  id: string
  slug: string
  title: string
  excerpt: string | null
  published_at: string | null
  updated_at: string | null
}

export interface PublicAgencyPageData {
  profile: PublicAgencyProfile
  organization: PublicAgencyOrganization
  operationalPositions: PublicAgencyOperationalPosition[]
  canonicalPositions: PublicAgencyCanonicalPosition[]
  packages: PublicAgencyPackage[]
  news: PublicAgencyContentItem[]
  articles: PublicAgencyContentItem[]
  supportingItemCount: number
  indexReady: boolean
}

type AgencyProfileRow = {
  id: string
  organization_id: string
  slug: string
  overview_markdown: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  published_at: string | null
  sources: unknown
  author_id: string | null
  created_at: string | null
  updated_at: string | null
  organizations?: unknown
  article_authors?: unknown
}

type OperationalPositionRow = {
  id: string
  code: string | null
  name: string
  organization_id: string
  position_entities?: unknown
}

type PackageRow = {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  cover_image_url: string | null
  current_price: number | null
  original_price: number | null
  exam_year: string | null
  organization_id: string | null
  position_id: string | null
  created_at: string | null
  updated_at: string | null
  is_published?: boolean
}

type RelationRow = {
  package_id: string
  news_id?: string
  article_id?: string
}

type ContentRow = {
  id: string
  slug: string
  title: string
  excerpt?: string | null
  status: string
  published_at: string | null
  updated_at: string | null
  organization_id?: string | null
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === 'object' ? first as Record<string, unknown> : null
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function mapAuthor(value: unknown): PublicAgencyAuthor | null {
  const row = firstObject(value)
  if (!row) return null

  const id = typeof row.id === 'string' ? row.id : ''
  const slug = typeof row.slug === 'string' ? row.slug : ''
  const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : ''
  if (!id || !slug || !displayName || row.is_active === false) return null

  return {
    id,
    slug,
    display_name: displayName,
    role_title: typeof row.role_title === 'string' ? row.role_title : null,
    short_bio: typeof row.short_bio === 'string' ? row.short_bio : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
  }
}

function mapOrganization(value: unknown, fallbackId = ''): PublicAgencyOrganization | null {
  const row = firstObject(value)
  const id = typeof row?.id === 'string' ? row.id : fallbackId
  const name = typeof row?.name === 'string' ? row.name.trim() : ''
  if (!id || !name) return null
  return {
    id,
    code: typeof row?.code === 'string' ? row.code.trim() || null : null,
    name,
    short_name: typeof row?.short_name === 'string' ? row.short_name.trim() || null : null,
    logo_url: typeof row?.logo_url === 'string' && row.logo_url.trim() ? row.logo_url.trim() : null,
    description: typeof row?.description === 'string' && row.description.trim() ? row.description.trim() : null,
  }
}

function mapProfile(row: AgencyProfileRow): { profile: PublicAgencyProfile; organization: PublicAgencyOrganization | null } {
  const profile: PublicAgencyProfile = {
    id: row.id,
    organization_id: row.organization_id,
    slug: row.slug,
    overview_markdown: row.overview_markdown,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    status: row.status,
    published_at: row.published_at,
    sources: normalizeAgencySources(row.sources),
    author_id: row.author_id,
    author: mapAuthor(row.article_authors),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  return { profile, organization: mapOrganization(row.organizations, row.organization_id) }
}

function mapCanonicalPosition(value: unknown): PublicAgencyCanonicalPosition | null {
  const row = firstObject(value)
  if (!row) return null
  const id = typeof row.id === 'string' ? row.id : ''
  const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const status = typeof row.status === 'string' ? row.status : ''
  if (!id || !name || status !== 'published' || !isStableAgencySlug(slug)) return null
  return { id, slug, name }
}

function mapPackage(row: PackageRow): PublicAgencyPackage {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logo_url: row.logo_url,
    cover_image_url: row.cover_image_url,
    current_price: row.current_price,
    original_price: row.original_price,
    exam_year: row.exam_year,
    organization_id: row.organization_id,
    position_id: row.position_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapContent(row: ContentRow): PublicAgencyContentItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? null,
    published_at: row.published_at,
    updated_at: row.updated_at,
  }
}

async function readPublishedProfiles(): Promise<{ profile: PublicAgencyProfile; organization: PublicAgencyOrganization }[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('agency_profiles')
      .select(
        'id, organization_id, slug, overview_markdown, seo_title, seo_description, status, published_at, sources, author_id, created_at, updated_at, organizations(id, code, name, short_name, logo_url, description), article_authors(id, slug, display_name, role_title, short_bio, avatar_url, is_active)'
      )
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(MAX_PROFILES)

    if (error) {
      // The additive migration is intentionally optional at deploy time. A
      // missing table must make public pages empty/noindex, never crash them.
      console.error('Public Agency profile read unavailable:', error.message)
      return []
    }

    return (data ?? [])
      .map((row) => mapProfile(row as unknown as AgencyProfileRow))
      .filter((entry): entry is { profile: PublicAgencyProfile; organization: PublicAgencyOrganization } =>
        Boolean(entry.organization))
  } catch (error) {
    console.error('Public Agency profile read failed:', error)
    return []
  }
}

async function readOrgPositions(organizationIds: string[]): Promise<OperationalPositionRow[]> {
  if (organizationIds.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('positions')
      .select('id, code, name, organization_id, position_entities(id, slug, name, status)')
      .in('organization_id', organizationIds)
      .order('name', { ascending: true })
      .limit(MAX_ORG_POSITIONS)

    if (error) {
      console.error('Public Agency position read failed:', error.message)
      return []
    }
    return (data ?? []) as unknown as OperationalPositionRow[]
  } catch (error) {
    console.error('Public Agency position read failed:', error)
    return []
  }
}

async function readOrgPackages(organizationIds: string[]): Promise<PackageRow[]> {
  if (organizationIds.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('packages')
      .select(
        'id, slug, name, description, logo_url, cover_image_url, current_price, original_price, exam_year, organization_id, position_id, created_at, updated_at, is_published'
      )
      .in('organization_id', organizationIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_PACKAGES)

    if (error) {
      console.error('Public Agency package read failed:', error.message)
      return []
    }
    return selectPublishedPackages((data ?? []) as unknown as PackageRow[])
  } catch (error) {
    console.error('Public Agency package read failed:', error)
    return []
  }
}

async function readNewsByOrganization(organizationIds: string[]): Promise<ContentRow[]> {
  if (organizationIds.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('news')
      .select('id, slug, title, excerpt, status, published_at, updated_at, organization_id')
      .in('organization_id', organizationIds)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(MAX_CONTENT_ROWS)

    if (error) {
      console.error('Public Agency explicit news read failed:', error.message)
      return []
    }
    return (data ?? []) as unknown as ContentRow[]
  } catch (error) {
    console.error('Public Agency explicit news read failed:', error)
    return []
  }
}

async function readRelationRows(
  relationTable: 'news_packages' | 'article_packages',
  packageIds: string[],
): Promise<RelationRow[]> {
  if (packageIds.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const relationColumn = relationTable === 'news_packages' ? 'news_id' : 'article_id'
    const { data, error } = await supabase
      .from(relationTable)
      .select(`package_id, ${relationColumn}`)
      .in('package_id', packageIds)
      .limit(MAX_RELATION_ROWS)

    if (error) {
      console.error(`Public Agency ${relationTable} read failed:`, error.message)
      return []
    }
    return (data ?? []) as unknown as RelationRow[]
  } catch (error) {
    console.error(`Public Agency ${relationTable} read failed:`, error)
    return []
  }
}

async function readPublishedContent(table: 'news' | 'articles', ids: string[]): Promise<ContentRow[]> {
  if (ids.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from(table)
      .select('id, slug, title, excerpt, status, published_at, updated_at, organization_id')
      .in('id', ids)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(MAX_CONTENT_ROWS)

    if (error) {
      console.error(`Public Agency ${table} read failed:`, error.message)
      return []
    }
    return (data ?? []) as unknown as ContentRow[]
  } catch (error) {
    console.error(`Public Agency ${table} read failed:`, error)
    return []
  }
}

/**
 * One bounded public dataset powers the hub, detail pages, and sitemap. The
 * same derived `indexReady` value is deliberately reused by all three.
 *
 * News membership is explicit-first: news.organization_id decides, and the
 * package-derived fallback applies only to rows whose explicit value is NULL.
 * Meaningful position counts exclude placeholder/GEN-style operational rows
 * via the shared Position contract.
 */
export const getPublishedAgencyPages = cache(
  async (): Promise<PublicAgencyPageData[]> => {
    const entries = await readPublishedProfiles()
    if (entries.length === 0) return []

    const organizationIds = entries.map((entry) => entry.profile.organization_id)
    const [orgPositions, orgPackages, explicitNewsRows] = await Promise.all([
      readOrgPositions(organizationIds),
      readOrgPackages(organizationIds),
      readNewsByOrganization(organizationIds),
    ])

    const positionsByOrg = new Map<string, OperationalPositionRow[]>()
    for (const position of orgPositions) {
      const list = positionsByOrg.get(position.organization_id) ?? []
      list.push(position)
      positionsByOrg.set(position.organization_id, list)
    }

    const packagesByOrg = new Map<string, PackageRow[]>()
    for (const pkg of orgPackages) {
      if (!pkg.organization_id) continue
      const list = packagesByOrg.get(pkg.organization_id) ?? []
      list.push(pkg)
      packagesByOrg.set(pkg.organization_id, list)
    }

    const packageOrgById = new Map<string, string>()
    for (const [orgId, packages] of packagesByOrg) {
      for (const pkg of packages) packageOrgById.set(pkg.id, orgId)
    }
    const agencyPackageIds = [...packageOrgById.keys()]

    const [newsRelations, articleRelations] = await Promise.all([
      readRelationRows('news_packages', agencyPackageIds),
      readRelationRows('article_packages', agencyPackageIds),
    ])

    const fallbackNewsIds = dedupeById(
      newsRelations
        .filter((relation): relation is RelationRow & { news_id: string } => typeof relation.news_id === 'string')
        .map((relation) => ({ id: relation.news_id })),
    ).map((row) => row.id)
    const articleIds = dedupeById(
      articleRelations
        .filter((relation): relation is RelationRow & { article_id: string } => typeof relation.article_id === 'string')
        .map((relation) => ({ id: relation.article_id })),
    ).map((row) => row.id)

    const [fallbackNewsRows, articleRows] = await Promise.all([
      readPublishedContent('news', fallbackNewsIds),
      readPublishedContent('articles', articleIds),
    ])

    const newsRelatedOrgs = new Map<string, Set<string>>()
    for (const relation of newsRelations) {
      if (!relation.news_id) continue
      const orgId = packageOrgById.get(relation.package_id)
      if (!orgId) continue
      const set = newsRelatedOrgs.get(relation.news_id) ?? new Set<string>()
      set.add(orgId)
      newsRelatedOrgs.set(relation.news_id, set)
    }

    const newsCandidates = dedupeById([...explicitNewsRows, ...fallbackNewsRows]).map((row) => ({
      row,
      resolution: {
        id: row.id,
        organization_id: row.organization_id ?? null,
        relatedOrganizationIds: [...(newsRelatedOrgs.get(row.id) ?? [])],
      },
    }))

    const newsByOrg = new Map<string, ContentRow[]>()
    for (const candidate of newsCandidates) {
      for (const orgId of organizationIds) {
        if (!isAgencyNewsItem(candidate.resolution, orgId)) continue
        const list = newsByOrg.get(orgId) ?? []
        list.push(candidate.row)
        newsByOrg.set(orgId, list)
      }
    }

    const articlesByOrg = new Map<string, ContentRow[]>()
    const articleById = new Map(dedupeById(articleRows).map((row) => [row.id, row]))
    for (const relation of articleRelations) {
      if (!relation.article_id) continue
      const orgId = packageOrgById.get(relation.package_id)
      const row = articleById.get(relation.article_id)
      if (!orgId || !row) continue
      const list = articlesByOrg.get(orgId) ?? []
      if (!list.some((existing) => existing.id === row.id)) list.push(row)
      articlesByOrg.set(orgId, list)
    }

    const identities: AgencyEditorialIdentity[] = entries.map((entry) => ({
      id: entry.profile.id,
      name: entry.organization.name,
      slug: entry.profile.slug,
      overview_markdown: entry.profile.overview_markdown,
    }))

    return entries.map(({ profile, organization }) => {
      const orgPositions = positionsByOrg.get(organization.id) ?? []
      const meaningfulPositions = orgPositions.filter(
        (position) => !isOperationalPositionPlaceholder({ code: position.code, name: position.name }),
      )

      const canonicalById = new Map<string, PublicAgencyCanonicalPosition>()
      for (const position of orgPositions) {
        const canonical = mapCanonicalPosition(position.position_entities)
        if (canonical) canonicalById.set(canonical.id, canonical)
      }

      const orgPackages = (packagesByOrg.get(organization.id) ?? [])
        .map(mapPackage)
        .slice(0, MAX_PACKAGES)
      const orgNews = sortAgencyContent(newsByOrg.get(organization.id) ?? [])
        .map(mapContent)
        .slice(0, MAX_RELATED_NEWS)
      const orgArticles = sortAgencyContent(articlesByOrg.get(organization.id) ?? [])
        .map(mapContent)
        .slice(0, MAX_RELATED_ARTICLES)

      const signals = {
        positionCount: meaningfulPositions.length,
        packageCount: orgPackages.length,
        newsCount: orgNews.length,
        articleCount: orgArticles.length,
        uniqueEditorialOverview: true,
        uniquePrimaryIntent: true,
      }
      const indexReady = isAgencyProfileIndexReady(
        {
          id: profile.id,
          organization_id: profile.organization_id,
          name: organization.name,
          slug: profile.slug,
          overview_markdown: profile.overview_markdown,
          status: profile.status,
          sources: profile.sources,
        },
        signals,
        identities,
      )

      return {
        profile,
        organization,
        operationalPositions: meaningfulPositions.map((position) => ({
          id: position.id,
          name: position.name,
          organization_id: position.organization_id,
        })),
        canonicalPositions: [...canonicalById.values()],
        packages: orgPackages,
        news: orgNews,
        articles: orgArticles,
        supportingItemCount:
          meaningfulPositions.length + orgPackages.length + orgNews.length + orgArticles.length,
        indexReady,
      }
    })
  },
)

export const getPublishedAgencyPageBySlug = cache(
  async (slug: string): Promise<PublicAgencyPageData | null> => {
    const pages = await getPublishedAgencyPages()
    return selectAgencyPageBySlug(pages, slug)
  },
)

export const getIndexableAgencyHubEntries = cache(
  async (): Promise<PublicAgencyPageData[]> => {
    const pages = await getPublishedAgencyPages()
    return selectIndexableAgencyPages(pages)
  },
)

export function getAgencySitemapSlugs(pages: readonly PublicAgencyPageData[]): string[] {
  return pages
    .filter((page) => page.indexReady)
    .map((page) => page.profile.slug)
    .filter((slug) => isStableAgencySlug(slug))
}

/** Display label: short name (สตง.) wins, else the full organization name. */
export function publicAgencyOrganizationLabel(organization: PublicAgencyOrganization): string {
  return normalizeAgencyText(organization.short_name) || normalizeAgencyText(organization.name)
}
