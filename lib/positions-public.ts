import 'server-only'

import { cache } from 'react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import {
  dedupeById,
  derivePublishedPositionContentIds,
  derivePublishedPositionPackageIds,
  isPositionEntityIndexReady,
  isStablePositionSlug,
  normalizePositionSources,
  normalizePositionText,
  selectPublishedPackages,
  selectPublishedPositionContent,
  selectIndexablePositionPages,
  selectPositionPageBySlug,
  sortPositionContent,
  type PositionEntityIndexRecord,
  type PositionSource,
} from '@/lib/position-entity'

const MAX_ENTITIES = 200
const MAX_OPERATIONAL_POSITIONS = 2000
const MAX_PACKAGES = 1000
const MAX_RELATION_ROWS = 5000
const MAX_CONTENT_ROWS = 1000
const MAX_RELATED_NEWS = 6
const MAX_RELATED_ARTICLES = 6

export interface PublicPositionAuthor {
  id: string
  slug: string
  display_name: string
  role_title: string | null
  short_bio: string | null
  avatar_url: string | null
}

export interface PublicPositionEntity extends PositionEntityIndexRecord {
  slug: string
  name: string
  overview_markdown: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  published_at: string | null
  sources: PositionSource[]
  author_id: string | null
  author: PublicPositionAuthor | null
  created_at: string | null
  updated_at: string | null
}

export interface PublicPositionOrganization {
  id: string
  name: string
  short_name: string | null
}

export interface PublicOperationalPosition {
  id: string
  name: string
  organization_id: string
  organization: PublicPositionOrganization | null
}

type MappedOperationalPosition = PublicOperationalPosition & {
  entity_id: string
}

export interface PublicPositionPackage {
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
  organization: PublicPositionOrganization | null
}

export interface PublicPositionContentItem {
  id: string
  slug: string
  title: string
  excerpt: string | null
  published_at: string | null
  updated_at: string | null
}

export interface PublicPositionPageData {
  entity: PublicPositionEntity
  operationalPositions: PublicOperationalPosition[]
  organizations: PublicPositionOrganization[]
  packages: PublicPositionPackage[]
  news: PublicPositionContentItem[]
  articles: PublicPositionContentItem[]
  supportingItemCount: number
  indexReady: boolean
}

export interface CanonicalPositionLink {
  id: string
  slug: string
  name: string
}

type PositionEntityRow = {
  id: string
  slug: string
  name: string
  overview_markdown: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  published_at: string | null
  sources: unknown
  author_id: string | null
  created_at: string | null
  updated_at: string | null
  article_authors?: unknown
}

type OperationalPositionRow = {
  id: string
  name: string
  organization_id: string
  position_entity_id: string | null
  organizations?: unknown
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
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === 'object' ? first as Record<string, unknown> : null
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function mapAuthor(value: unknown): PublicPositionAuthor | null {
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

function mapOrganization(value: unknown, fallbackId = ''): PublicPositionOrganization | null {
  const row = firstObject(value)
  const id = typeof row?.id === 'string' ? row.id : fallbackId
  const name = typeof row?.name === 'string' ? row.name.trim() : ''
  if (!id || !name) return null
  return {
    id,
    name,
    short_name: typeof row?.short_name === 'string' ? row.short_name.trim() || null : null,
  }
}

function mapEntity(row: PositionEntityRow): PublicPositionEntity {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    overview_markdown: row.overview_markdown,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    status: row.status,
    published_at: row.published_at,
    sources: normalizePositionSources(row.sources),
    author_id: row.author_id,
    author: mapAuthor(row.article_authors),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapOperationalPosition(row: OperationalPositionRow): MappedOperationalPosition | null {
  if (!row.position_entity_id) return null
  return {
    id: row.id,
    name: row.name,
    organization_id: row.organization_id,
    organization: mapOrganization(row.organizations, row.organization_id),
    entity_id: row.position_entity_id,
  }
}

function mapPackage(row: PackageRow, organization: PublicPositionOrganization | null): PublicPositionPackage {
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
    organization,
  }
}

function mapContent(row: ContentRow): PublicPositionContentItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? null,
    published_at: row.published_at,
    updated_at: row.updated_at,
  }
}

async function readPublishedEntities(): Promise<PublicPositionEntity[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('position_entities')
      .select(
        'id, slug, name, overview_markdown, seo_title, seo_description, status, published_at, sources, author_id, created_at, updated_at, article_authors(id, slug, display_name, role_title, short_bio, avatar_url, is_active)'
      )
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(MAX_ENTITIES)

    if (error) {
      // The additive migration is intentionally optional at deploy time. A
      // missing table must make public pages empty/noindex, never crash them.
      console.error('Public Position entity read unavailable:', error.message)
      return []
    }

    return (data ?? []).map((row) => mapEntity(row as unknown as PositionEntityRow))
  } catch (error) {
    console.error('Public Position entity read failed:', error)
    return []
  }
}

async function readMappedOperationalPositions(
  entityIds: string[],
): Promise<MappedOperationalPosition[]> {
  if (entityIds.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('positions')
      .select('id, name, organization_id, position_entity_id, organizations(id, name, short_name)')
      .in('position_entity_id', entityIds)
      .order('name', { ascending: true })
      .limit(MAX_OPERATIONAL_POSITIONS)

    if (error) {
      console.error('Public mapped Position read failed:', error.message)
      return []
    }

    return (data ?? [])
      .map((row) => mapOperationalPosition(row as unknown as OperationalPositionRow))
      .filter((position): position is MappedOperationalPosition => Boolean(position))
  } catch (error) {
    console.error('Public mapped Position read failed:', error)
    return []
  }
}

async function readPublishedPackages(positionIds: string[]): Promise<PackageRow[]> {
  if (positionIds.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('packages')
      .select(
        'id, slug, name, description, logo_url, cover_image_url, current_price, original_price, exam_year, organization_id, position_id, created_at, updated_at, is_published'
      )
      .in('position_id', positionIds)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_PACKAGES)

    if (error) {
      console.error('Public Position package read failed:', error.message)
      return []
    }

    return selectPublishedPackages((data ?? []) as unknown as PackageRow[])
  } catch (error) {
    console.error('Public Position package read failed:', error)
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
      console.error(`Public Position ${relationTable} read failed:`, error.message)
      return []
    }

    return (data ?? []) as unknown as RelationRow[]
  } catch (error) {
    console.error(`Public Position ${relationTable} read failed:`, error)
    return []
  }
}

async function readPublishedContent(
  table: 'news' | 'articles',
  ids: string[],
): Promise<ContentRow[]> {
  if (ids.length === 0) return []

  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from(table)
      .select('id, slug, title, excerpt, status, published_at, updated_at')
      .in('id', ids)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(MAX_CONTENT_ROWS)

    if (error) {
      console.error(`Public Position ${table} read failed:`, error.message)
      return []
    }

    return selectPublishedPositionContent((data ?? []) as unknown as ContentRow[])
  } catch (error) {
    console.error(`Public Position ${table} read failed:`, error)
    return []
  }
}

function addRelation(
  byEntity: Map<string, Set<string>>,
  entityId: string,
  contentId: string | undefined,
): void {
  if (!contentId) return
  const ids = byEntity.get(entityId) ?? new Set<string>()
  ids.add(contentId)
  byEntity.set(entityId, ids)
}

function uniqueOrganizations(positions: readonly PublicOperationalPosition[]): PublicPositionOrganization[] {
  const seen = new Set<string>()
  const organizations: PublicPositionOrganization[] = []
  for (const position of positions) {
    const organization = position.organization
    if (!organization || seen.has(organization.id)) continue
    seen.add(organization.id)
    organizations.push(organization)
  }
  return organizations
}

/**
 * One bounded public dataset powers the hub, detail pages, and sitemap. The
 * same derived `indexReady` value is deliberately reused by all three.
 */
export const getPublishedPositionPages = cache(
  async (): Promise<PublicPositionPageData[]> => {
    const entities = await readPublishedEntities()
    if (entities.length === 0) return []

    const entityIds = entities.map((entity) => entity.id)
    const mappedOperationalPositions = await readMappedOperationalPositions(entityIds)
    const positionById = new Map(mappedOperationalPositions.map((position) => [position.id, position]))
    const packages = await readPublishedPackages(mappedOperationalPositions.map((position) => position.id))

    // A defensive ownership check keeps a legacy mismatch from leaking a
    // package under the wrong canonical entity even before the admin fix has
    // repaired that row.
    const ownedPackages = packages.filter((pkg) => {
      if (!pkg.position_id || !pkg.organization_id) return false
      const position = positionById.get(pkg.position_id)
      return Boolean(position && position.organization_id === pkg.organization_id)
    })
    const packageIdsForMappedPositions = new Set(
      derivePublishedPositionPackageIds(
        mappedOperationalPositions.map((position) => position.id),
        ownedPackages,
      ),
    )
    const cleanPackages = ownedPackages.filter((pkg) => packageIdsForMappedPositions.has(pkg.id))

    const operationalEntityByPositionId = new Map(
      mappedOperationalPositions.map((position) => [position.id, position.entity_id]),
    )
    const packageEntityById = new Map<string, string>()
    const packageByEntity = new Map<string, PublicPositionPackage[]>()
    for (const pkg of cleanPackages) {
      const entityId = pkg.position_id ? operationalEntityByPositionId.get(pkg.position_id) : undefined
      if (entityId) packageEntityById.set(pkg.id, entityId)
    }

    for (const pkg of cleanPackages) {
      const entityId = packageEntityById.get(pkg.id)
      if (!entityId) continue
      const position = positionById.get(pkg.position_id || '')
      const items = packageByEntity.get(entityId) ?? []
      items.push(mapPackage(pkg, position?.organization ?? null))
      packageByEntity.set(entityId, items)
    }

    const packageIds = cleanPackages.map((pkg) => pkg.id)
    const [newsRelations, articleRelations] = await Promise.all([
      readRelationRows('news_packages', packageIds),
      readRelationRows('article_packages', packageIds),
    ])

    const mappedPackageIds = [...packageEntityById.keys()]
    const newsIds = derivePublishedPositionContentIds(
      mappedPackageIds,
      newsRelations.map((row) => ({ package_id: row.package_id, content_id: row.news_id })),
    )
    const articleIds = derivePublishedPositionContentIds(
      mappedPackageIds,
      articleRelations.map((row) => ({ package_id: row.package_id, content_id: row.article_id })),
    )

    const [newsRows, articleRows] = await Promise.all([
      readPublishedContent('news', newsIds),
      readPublishedContent('articles', articleIds),
    ])
    const newsById = new Map(dedupeById(newsRows).map((row) => [row.id, mapContent(row)]))
    const articlesById = new Map(dedupeById(articleRows).map((row) => [row.id, mapContent(row)]))

    const newsByEntity = new Map<string, Set<string>>()
    for (const relation of newsRelations) {
      const entityId = packageEntityById.get(relation.package_id)
      if (entityId) addRelation(newsByEntity, entityId, relation.news_id)
    }
    const articlesByEntity = new Map<string, Set<string>>()
    for (const relation of articleRelations) {
      const entityId = packageEntityById.get(relation.package_id)
      if (entityId) addRelation(articlesByEntity, entityId, relation.article_id)
    }

    const identities: PositionEditorialIdentity[] = entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      overview_markdown: entity.overview_markdown,
    }))

    return entities.map((entity) => {
      const mappedPositions = mappedOperationalPositions.filter(
        (position) => operationalEntityByPositionId.get(position.id) === entity.id,
      )
      const entityNews = sortPositionContent(
        [...(newsByEntity.get(entity.id) ?? [])]
          .map((id) => newsById.get(id))
          .filter((item): item is PublicPositionContentItem => Boolean(item)),
      ).slice(0, MAX_RELATED_NEWS)
      const entityArticles = sortPositionContent(
        [...(articlesByEntity.get(entity.id) ?? [])]
          .map((id) => articlesById.get(id))
          .filter((item): item is PublicPositionContentItem => Boolean(item)),
      ).slice(0, MAX_RELATED_ARTICLES)
      const entityPackages = (packageByEntity.get(entity.id) ?? []).slice(0, MAX_PACKAGES)
      const signals = {
        packageCount: entityPackages.length,
        newsCount: entityNews.length,
        articleCount: entityArticles.length,
        uniqueEditorialOverview: true,
        uniquePrimaryIntent: true,
      }
      const indexReady = isPositionEntityIndexReady(entity, signals, identities)

      return {
        entity,
        operationalPositions: mappedPositions.map(({ entity_id: _entityId, ...position }) => position),
        organizations: uniqueOrganizations(mappedPositions),
        packages: entityPackages,
        news: entityNews,
        articles: entityArticles,
        supportingItemCount: entityNews.length + entityArticles.length,
        indexReady,
      }
    })
  },
)

export const getPublishedPositionPageBySlug = cache(
  async (slug: string): Promise<PublicPositionPageData | null> => {
    const cleanSlug = typeof slug === 'string' ? slug.trim() : ''
    if (!cleanSlug) return null
    const pages = await getPublishedPositionPages()
    return selectPositionPageBySlug(pages, cleanSlug)
  },
)

export const getIndexablePositionHubEntries = cache(
  async (): Promise<PublicPositionPageData[]> => {
    const pages = await getPublishedPositionPages()
    return selectIndexablePositionPages(pages)
  },
)

function mapCanonicalPosition(value: unknown): CanonicalPositionLink | null {
  const row = firstObject(value)
  if (!row) return null
  const id = typeof row.id === 'string' ? row.id : ''
  const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const status = typeof row.status === 'string' ? row.status : ''
  if (!id || !name || status !== 'published' || !isStablePositionSlug(slug)) return null
  return { id, slug, name }
}

/** Resolve a published canonical link for an existing operational Position. */
export const getCanonicalPositionLink = cache(
  async (positionId: string | null | undefined): Promise<CanonicalPositionLink | null> => {
    if (!positionId || typeof positionId !== 'string') return null
    try {
      const supabase = createAnonServerClient()
      const { data, error } = await supabase
        .from('positions')
        .select('id, position_entities!inner(id, slug, name, status)')
        .eq('id', positionId)
        .eq('position_entities.status', 'published')
        .maybeSingle()
      if (error || !data) return null
      return mapCanonicalPosition((data as any).position_entities)
    } catch (error) {
      console.error('Canonical Position link read failed:', error)
      return null
    }
  },
)

/** Batch equivalent used by News/Article detail pages without rail re-queries. */
export const getCanonicalPositionLinks = cache(
  async (positionIds: readonly (string | null | undefined)[]): Promise<Map<string, CanonicalPositionLink>> => {
    const ids = [...new Set(positionIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))]
    const result = new Map<string, CanonicalPositionLink>()
    if (ids.length === 0) return result

    try {
      const supabase = createAnonServerClient()
      const { data, error } = await supabase
        .from('positions')
        .select('id, position_entities!inner(id, slug, name, status)')
        .in('id', ids)
        .eq('position_entities.status', 'published')
        .limit(MAX_OPERATIONAL_POSITIONS)
      if (error) return result

      for (const row of (data ?? []) as any[]) {
        const link = mapCanonicalPosition(row.position_entities)
        if (link && typeof row.id === 'string') result.set(row.id, link)
      }
    } catch (error) {
      console.error('Canonical Position link batch read failed:', error)
    }
    return result
  },
)

export function getPositionSitemapSlugs(pages: readonly PublicPositionPageData[]): string[] {
  return pages
    .filter((page) => page.indexReady)
    .map((page) => page.entity.slug)
    .filter((slug) => isStablePositionSlug(slug))
}

export function positionOrganizationsLabel(organization: PublicPositionOrganization): string {
  return normalizePositionText(organization.short_name) || normalizePositionText(organization.name)
}
