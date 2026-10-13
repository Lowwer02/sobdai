'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  POSITION_MAPPING_SEARCH_PAGE_SIZE,
  POSITION_MAPPING_VALIDATION_BATCH_SIZE,
  chunkPositionIds,
  excludePlaceholderPositions,
  isPositionEntityStatus,
  isPositionPlaceholderName,
  isStablePositionSlug,
  normalizePositionText,
  parsePositionSourcesJson,
  validatePositionMappingSelection,
} from '@/lib/position-entity'
import type {
  PositionEntitySaveResult,
  ReplaceMappingsResult,
  SearchOperationalPositionsResult,
  SearchedOperationalPosition,
} from './action-state'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ExistingPositionEntity = {
  id: string
  slug: string
  status: string
  published_at: string | null
}

type MappedPositionRow = {
  id: string
  organization_id: string | null
}

type SelectedPositionRow = {
  id: string
  code: string | null
  name: string | null
  organization_id: string | null
  position_entity_id: string | null
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function safeActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  if (/position_entities|position_entity_id|replace_position_entity_mappings|schema cache|relation .* does not exist/i.test(message)) {
    return 'ยังไม่พร้อมใช้งาน: กรุณาให้ผู้ดูแลระบบติดตั้ง migration 094 ก่อน'
  }
  return fallback
}

function isMissingRowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /invalid input syntax for type uuid|invalid_text_representation/i.test(message)
}

function uniqueIds(ids: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)))
}

/**
 * Fetch every requested position in bounded batches so no single PostgREST
 * GET URL exceeds gateway limits at the 2,000-position cap. Batches run
 * sequentially and the first failure aborts the rest: the caller treats any
 * non-null error as "validation incomplete" and never reaches the mapping
 * RPC, so no unvalidated ID can be silently dropped. Returns null when any
 * batch fails.
 */
async function fetchSelectedPositionsForValidation(
  supabase: Awaited<ReturnType<typeof requirePermission>>['supabase'],
  trimmedIds: readonly string[],
): Promise<SelectedPositionRow[] | null> {
  if (trimmedIds.length === 0) return []

  const batches = chunkPositionIds(trimmedIds, POSITION_MAPPING_VALIDATION_BATCH_SIZE)
  const selected: SelectedPositionRow[] = []
  for (const [batchIndex, batch] of batches.entries()) {
    const { data, error } = await supabase
      .from('positions')
      .select('id, code, name, organization_id, position_entity_id')
      .in('id', batch)
    if (error) {
      console.error(
        `Position mapping validation batch ${batchIndex + 1}/${batches.length} failed:`,
        error,
      )
      return null
    }
    selected.push(...((data ?? []) as SelectedPositionRow[]))
  }

  // Every requested ID must be represented exactly once across all batches
  // before validation is considered complete.
  const selectedById = new Map(selected.map((row) => [row.id, row]))
  if (selected.length !== trimmedIds.length || selectedById.size !== trimmedIds.length) {
    return null
  }
  return selected
}

/**
 * Public surfaces that embed this entity's mapping-derived content. Only
 * published entities can appear there, so draft-only saves keep the public
 * caches untouched (revalidating a draft path would be a no-op purge).
 */
function revalidatePublicEntitySurfaces(entitySlug: string): void {
  revalidatePath('/positions')
  revalidatePath('/sitemap.xml')
  revalidatePath(`/positions/${encodeURIComponent(entitySlug)}`)
}

/**
 * Agency detail pages embed positions + their canonical entity per
 * organization, so a mapping change ripples into the affected organizations'
 * published Agency Profiles. Targeted per-slug revalidation; the /agencies
 * hub is revalidated only when at least one agency page is.
 */
async function revalidateAgencySurfaces(
  supabase: Awaited<ReturnType<typeof requirePermission>>['supabase'],
  organizationIds: readonly string[],
): Promise<void> {
  const orgIds = uniqueIds(organizationIds)
  if (orgIds.length === 0) return

  const { data } = await supabase
    .from('organizations')
    .select('agency_profiles!inner(slug)')
    .in('id', orgIds)
    .eq('agency_profiles.status', 'published')

  const slugs = Array.from(
    new Set(
      ((data ?? []) as Array<{ agency_profiles?: unknown }>).flatMap((row) => {
        const profiles = Array.isArray(row.agency_profiles) ? row.agency_profiles : []
        return profiles
          .map((profile) => (profile as { slug?: unknown } | null)?.slug)
          .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
      }),
    ),
  )

  for (const slug of slugs) {
    revalidatePath(`/agencies/${encodeURIComponent(slug)}`)
  }
  if (slugs.length > 0) {
    revalidatePath('/agencies')
  }
}

/**
 * Save ONLY the editorial fields of one canonical Position entity. Mappings
 * are written exclusively through replacePositionEntityMappingsAction (the
 * single mapping write path) so a mapping failure can never be mistaken for a
 * failed editorial save and the two requests are never presented as atomic:
 * on create the entity is persisted first, then mapped.
 */
export async function savePositionEntityAction(
  id: string | null,
  formData: FormData,
): Promise<PositionEntitySaveResult> {
  const entitySlug = formText(formData, 'slug')

  try {
    const { supabase } = await requirePermission('system.manage')
    const name = normalizePositionText(formText(formData, 'name'))
    const overview = formText(formData, 'overview_markdown') || null
    const seoTitle = formText(formData, 'seo_title') || null
    const seoDescription = formText(formData, 'seo_description') || null
    const status = formText(formData, 'status')
    const sourcesResult = parsePositionSourcesJson(formData.get('sources_json'))

    if (!isStablePositionSlug(entitySlug)) {
      return { ok: false, error: 'Slug ต้องเป็นภาษาอังกฤษตัวพิมพ์เล็ก คั่นด้วยขีดกลาง และไม่มีอักขระพิเศษ' }
    }
    if (!name) return { ok: false, error: 'กรุณาระบุชื่อตำแหน่ง' }
    if (!isPositionEntityStatus(status)) return { ok: false, error: 'สถานะของ Position Entity ไม่ถูกต้อง' }
    if (!sourcesResult.ok) return { ok: false, error: sourcesResult.error }
    if (status === 'published' && isPositionPlaceholderName(name)) {
      return { ok: false, error: 'ไม่อนุญาตให้เผยแพร่ชื่อตำแหน่งที่เป็น placeholder หรือ General Position' }
    }

    let existing: ExistingPositionEntity | null = null
    if (id) {
      const { data, error } = await supabase
        .from('position_entities')
        .select('id, slug, status, published_at')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return { ok: false, error: 'ไม่พบ Position Entity ที่ต้องการแก้ไข' }
      existing = data as ExistingPositionEntity
    }

    if (existing?.published_at && existing.slug !== entitySlug) {
      return { ok: false, error: 'Slug ของ Position Entity ที่เคยเผยแพร่แล้วต้องคงเดิม' }
    }

    let duplicateQuery = supabase
      .from('position_entities')
      .select('id')
      .eq('slug', entitySlug)
      .limit(1)
    if (id) duplicateQuery = duplicateQuery.neq('id', id)
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) return { ok: false, error: 'Slug นี้ถูกใช้งานโดย Position Entity อื่นแล้ว' }

    const publishedAt = status === 'published'
      ? existing?.published_at || new Date().toISOString()
      : existing?.published_at || null
    const payload = {
      slug: entitySlug,
      name,
      overview_markdown: overview,
      seo_title: seoTitle,
      seo_description: seoDescription,
      status,
      published_at: publishedAt,
      sources: sourcesResult.sources,
    }

    let entityId = id
    if (id) {
      const { data, error } = await supabase
        .from('position_entities')
        .update(payload)
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return { ok: false, error: 'บันทึก Position Entity ไม่สำเร็จ' }
      entityId = data.id
    } else {
      const { data, error } = await supabase
        .from('position_entities')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      entityId = data.id
    }

    if (!entityId) return { ok: false, error: 'ไม่พบรหัส Position Entity หลังบันทึก' }

    revalidatePath('/admin/position-entities')
    if (status === 'published' || existing?.status === 'published') {
      revalidatePublicEntitySurfaces(entitySlug)
    }

    return { ok: true, entityId, entitySlug }
  } catch (error) {
    console.error('Position Entity editorial save failed:', error)
    return { ok: false, error: safeActionError(error, 'ไม่สามารถบันทึก Position Entity ได้ในขณะนี้') }
  }
}

/**
 * Owner-gated replacement of one entity's full mapping set through the
 * existing atomic SECURITY DEFINER RPC. The RPC independently re-verifies the
 * active Owner role, placeholder exclusion, conflicting ownership, and the
 * 2,000-position cap inside its transaction; this action re-validates every
 * requested position in bounded batches (fail-closed: an incomplete or failed
 * batch aborts before the RPC), and adds an application-level staleness
 * comparison so an editor basing their save on an outdated mapping set is
 * rejected with fresh state instead of silently overwriting a concurrent
 * change. The compare is best-effort (a race can still slip between the check
 * and the RPC); the RPC's row locking and conflict rejection remain the
 * authoritative guarantee.
 */
export async function replacePositionEntityMappingsAction(
  entityId: string,
  positionIds: string[],
  expectedLoadedIds: string[],
): Promise<ReplaceMappingsResult> {
  try {
    const { supabase } = await requirePermission('system.manage')

    if (typeof entityId !== 'string' || !UUID_PATTERN.test(entityId)) {
      return { ok: false, error: 'รหัส Position Entity ไม่ถูกต้อง' }
    }
    if (!Array.isArray(positionIds) || !Array.isArray(expectedLoadedIds)) {
      return { ok: false, error: 'รูปแบบรายการ mapping ไม่ถูกต้อง' }
    }
    const trimmedIds = positionIds.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0)
    if (new Set(trimmedIds).size !== trimmedIds.length) {
      return { ok: false, error: 'รายการ mapping มีตำแหน่งซ้ำ กรุณาตรวจสอบแล้วลองอีกครั้ง' }
    }
    if (trimmedIds.length > 2000) {
      return { ok: false, error: 'เลือกตำแหน่งได้ไม่เกิน 2,000 รายการ' }
    }
    for (const value of trimmedIds) {
      if (!UUID_PATTERN.test(value)) return { ok: false, error: 'รหัสตำแหน่งไม่ถูกต้อง' }
    }

    const [{ data: entity, error: entityError }, selectedPositions] = await Promise.all([
      supabase
        .from('position_entities')
        .select('id, slug, status')
        .eq('id', entityId)
        .maybeSingle(),
      fetchSelectedPositionsForValidation(supabase, trimmedIds),
    ])
    if (entityError) throw entityError
    if (!entity) return { ok: false, error: 'ไม่พบ Position Entity ที่ต้องการแก้ไข' }

    const selected = selectedPositions
    if (selected === null) {
      // Fail closed: batch validation did not complete, so no ID may reach the RPC.
      return {
        ok: false,
        error:
          'ตรวจสอบรายการตำแหน่งที่เลือกไม่ครบทุกชุด ระบบจึงยกเลิกการบันทึก mapping ทั้งหมด กรุณาลองอีกครั้ง',
      }
    }
    if (selected.length !== trimmedIds.length) {
      return { ok: false, error: 'พบตำแหน่งที่เลือกไม่ครบ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' }
    }

    const mappingValidation = validatePositionMappingSelection(entityId, trimmedIds, selected)
    if (!mappingValidation.valid) {
      if (mappingValidation.reason === 'placeholder') {
        return { ok: false, error: 'ไม่อนุญาตให้ผูกตำแหน่ง GEN หรือ placeholder กับ Position Entity' }
      }
      if (mappingValidation.reason === 'conflict') {
        const conflicts = selected.filter(
          (row) => row.position_entity_id && row.position_entity_id !== entityId,
        )
        const { data: owners } = await supabase
          .from('position_entities')
          .select('id, name, slug')
          // Error-path enrichment only; bounded so a large conflict set can't
          // hit the same URL-length limit the batch validation exists for.
          .in('id', uniqueIds(conflicts.map((row) => row.position_entity_id)).slice(0, POSITION_MAPPING_VALIDATION_BATCH_SIZE))
        const ownerNames = new Map(
          ((owners ?? []) as Array<{ id: string; name?: string | null; slug?: string | null }>).map(
            (owner) => [owner.id, owner.name || owner.slug || owner.id],
          ),
        )
        const detail = conflicts
          .slice(0, 3)
          .map((row) => `「${row.name ?? row.id}」 → ${ownerNames.get(row.position_entity_id as string) ?? (row.position_entity_id as string)}`)
          .join(', ')
        return {
          ok: false,
          error: `บันทึกไม่สำเร็จ: ตำแหน่งบางรายการถูก map กับ Position Entity อื่นแล้ว (${detail}${conflicts.length > 3 ? ' …' : ''}) ถอดรายการเหล่านี้ออก หรือไปที่ entity เจ้าของแทน`,
        }
      }
      return { ok: false, error: 'รายการ mapping ตำแหน่งไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' }
    }

    const { data: loadedRows, error: loadedError } = await supabase
      .from('positions')
      .select('id, organization_id')
      .eq('position_entity_id', entityId)
    if (loadedError) throw loadedError
    const loaded = (loadedRows ?? []) as MappedPositionRow[]
    const currentIds = loaded.map((row) => row.id).sort()

    const expectedIds = [...expectedLoadedIds.map((value) => String(value ?? '').trim())].sort()
    if (
      currentIds.length !== expectedIds.length ||
      currentIds.some((value, index) => value !== expectedIds[index])
    ) {
      return {
        ok: false,
        error:
          'การ map ตำแหน่งถูกเปลี่ยนแปลงจากที่อื่นระหว่างที่คุณกำลังแก้ไข ระบบจึงยกเลิกการบันทึกเพื่อไม่ให้ทับข้อมูลใหม่ กรุณาตรวจสอบรายการปัจจุบันแล้วบันทึกอีกครั้ง',
        stale: true,
        currentIds,
      }
    }

    const { data: mappingResult, error: mappingError } = await supabase.rpc(
      'replace_position_entity_mappings',
      {
        p_entity_id: entityId,
        p_position_ids: trimmedIds,
      },
    )
    if (mappingError) {
      const rpcMessage = mappingError.message ?? ''
      if (/already owned by another Position Entity/i.test(rpcMessage)) {
        return {
          ok: false,
          error:
            'บันทึกไม่สำเร็จ: ตำแหน่งบางรายการถูก map กับ Position Entity อื่นแล้ว (ตรวจสอบโดยฐานข้อมูล) ถอดรายการเหล่านี้ออกก่อนบันทึก',
        }
      }
      if (/Only an active Owner may replace/i.test(rpcMessage)) {
        return { ok: false, error: 'บันทึกไม่สำเร็จ: เฉพาะ Owner ที่ active เท่านั้นที่เปลี่ยน mapping ได้' }
      }
      if (/placeholder Positions cannot be mapped/i.test(rpcMessage)) {
        return { ok: false, error: 'บันทึกไม่สำเร็จ: ตำแหน่ง GEN หรือ placeholder map ไม่ได้' }
      }
      throw mappingError
    }

    const result = mappingResult as { entity_id?: unknown; mapped_count?: unknown } | null
    if (result?.entity_id !== entityId || result.mapped_count !== trimmedIds.length) {
      return { ok: false, error: 'บันทึก mapping ตำแหน่งไม่ครบ กรุณาตรวจสอบสิทธิ์แล้วลองอีกครั้ง' }
    }

    revalidatePath('/admin/position-entities')
    if (entity.status === 'published') {
      revalidatePublicEntitySurfaces(entity.slug)
    }

    const removedRows = loaded.filter((row) => !trimmedIds.includes(row.id))
    const affectedOrganizationIds = uniqueIds([
      ...selected.map((row) => row.organization_id),
      ...removedRows.map((row) => row.organization_id),
    ])
    await revalidateAgencySurfaces(supabase, affectedOrganizationIds)

    return {
      ok: true,
      entityId,
      mappedCount: trimmedIds.length,
      mappedIds: trimmedIds,
    }
  } catch (error) {
    console.error('Position mapping save failed:', error)
    return { ok: false, error: safeActionError(error, 'ไม่สามารถบันทึก mapping ตำแหน่งได้ในขณะนี้') }
  }
}

/**
 * Server-side search for the mapping picker (READ = existing content.read
 * policy). Excludes placeholder/GEN positions, pages 20 rows at a time, and
 * embeds each row's owning canonical entity so the UI can disable rows owned
 * by another entity instead of silently reassigning them.
 */
export async function searchOperationalPositionsAction(
  rawQuery: string,
  organizationId: string,
  page: number,
): Promise<SearchOperationalPositionsResult> {
  try {
    const { supabase } = await requirePermission('content.read')

    const search = typeof rawQuery === 'string' ? rawQuery.replace(/[,()]/g, ' ').trim() : ''
    const orgFilter = typeof organizationId === 'string' && UUID_PATTERN.test(organizationId) ? organizationId : ''
    const requestedPage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
    const from = (requestedPage - 1) * POSITION_MAPPING_SEARCH_PAGE_SIZE

    let query = excludePlaceholderPositions(
      supabase
        .from('positions')
        .select(
          'id, code, name, organization_id, position_entity_id, position_entities(id, slug, name), organizations(id, name, short_name)',
          { count: 'exact' },
        ),
    )
    if (orgFilter) query = query.eq('organization_id', orgFilter)
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + POSITION_MAPPING_SEARCH_PAGE_SIZE - 1)
    if (error) throw error

    const positions: SearchedOperationalPosition[] = []
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      if (isOperationalPositionPlaceholderRow(row)) continue
      const organization = Array.isArray(row.organizations)
        ? (row.organizations[0] as { id?: string; name?: string; short_name?: string } | null)
        : (row.organizations as { id?: string; name?: string; short_name?: string } | null)
      const entityEmbed = Array.isArray(row.position_entities)
        ? (row.position_entities[0] as { id?: string; slug?: string; name?: string } | null)
        : (row.position_entities as { id?: string; slug?: string; name?: string } | null)

      positions.push({
        id: String(row.id),
        code: typeof row.code === 'string' ? row.code : null,
        name: typeof row.name === 'string' ? row.name : '',
        organizationId: typeof organization?.id === 'string' ? organization.id : null,
        organizationName: organization?.short_name || organization?.name || null,
        owningEntity:
          entityEmbed && typeof entityEmbed.id === 'string' && typeof entityEmbed.slug === 'string'
            ? { id: entityEmbed.id, slug: entityEmbed.slug, name: String(entityEmbed.name ?? '') }
            : null,
      })
    }

    const total = typeof count === 'number' ? count : positions.length
    return {
      ok: true,
      positions,
      hasMore: from + positions.length < total,
    }
  } catch (error) {
    if (isMissingRowError(error)) {
      return { ok: false, error: 'ค้นหาตำแหน่งไม่สำเร็จ: รูปแบบตัวกรองไม่ถูกต้อง' }
    }
    console.error('Operational position search failed:', error)
    return { ok: false, error: safeActionError(error, 'ไม่สามารถค้นหาตำแหน่งได้ในขณะนี้') }
  }
}

function isOperationalPositionPlaceholderRow(row: Record<string, unknown>): boolean {
  const code = typeof row.code === 'string' ? row.code : null
  const name = typeof row.name === 'string' ? row.name : null
  return [code, name].some(
    (value) => typeof value === 'string' && value.trim().length > 0 && isPositionPlaceholderName(value),
  )
}
