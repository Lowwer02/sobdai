'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  isPositionEntityStatus,
  isPositionPlaceholderName,
  isStablePositionSlug,
  normalizePositionText,
  parsePositionSourcesJson,
} from '@/lib/position-entity'

export type PositionEntityActionState = {
  error?: string
}

export const INITIAL_POSITION_ENTITY_ACTION_STATE: PositionEntityActionState = {}

type ExistingPositionEntity = {
  id: string
  slug: string
  status: string
  published_at: string | null
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function formIds(formData: FormData): string[] {
  return Array.from(
    new Set(
      formData
        .getAll('position_ids')
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  )
}

function safeActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  if (/position_entities|position_entity_id|schema cache|relation .* does not exist/i.test(message)) {
    return 'ยังไม่พร้อมใช้งาน: กรุณาให้ผู้ดูแลระบบติดตั้ง migration 093 ก่อน'
  }
  return fallback
}

/**
 * Save one canonical Position entity and its organization-scoped mappings.
 * Mapping mutations intentionally use the existing system.manage boundary,
 * which is the current RLS boundary for changing `public.positions`.
 */
export async function savePositionEntityAction(
  id: string | null,
  _previousState: PositionEntityActionState,
  formData: FormData,
): Promise<PositionEntityActionState> {
  let entitySlug = formText(formData, 'slug')

  try {
    const { supabase } = await requirePermission('system.manage')
    const name = normalizePositionText(formText(formData, 'name'))
    const overview = formText(formData, 'overview_markdown') || null
    const seoTitle = formText(formData, 'seo_title') || null
    const seoDescription = formText(formData, 'seo_description') || null
    const status = formText(formData, 'status')
    const sourcesResult = parsePositionSourcesJson(formData.get('sources_json'))

    if (!isStablePositionSlug(entitySlug)) {
      return { error: 'Slug ต้องเป็นภาษาอังกฤษตัวพิมพ์เล็ก คั่นด้วยขีดกลาง และไม่มีอักขระพิเศษ' }
    }
    if (!name) return { error: 'กรุณาระบุชื่อตำแหน่ง' }
    if (!isPositionEntityStatus(status)) return { error: 'สถานะของ Position Entity ไม่ถูกต้อง' }
    if (!sourcesResult.ok) return { error: sourcesResult.error }
    if (status === 'published' && isPositionPlaceholderName(name)) {
      return { error: 'ไม่อนุญาตให้เผยแพร่ชื่อตำแหน่งที่เป็น placeholder หรือ General Position' }
    }

    let existing: ExistingPositionEntity | null = null
    if (id) {
      const { data, error } = await supabase
        .from('position_entities')
        .select('id, slug, status, published_at')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return { error: 'ไม่พบ Position Entity ที่ต้องการแก้ไข' }
      existing = data as ExistingPositionEntity
    }

    if (existing?.published_at && existing.slug !== entitySlug) {
      return { error: 'Slug ของ Position Entity ที่เคยเผยแพร่แล้วต้องคงเดิม' }
    }

    let duplicateQuery = supabase
      .from('position_entities')
      .select('id')
      .eq('slug', entitySlug)
      .limit(1)
    if (id) duplicateQuery = duplicateQuery.neq('id', id)
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) return { error: 'Slug นี้ถูกใช้งานโดย Position Entity อื่นแล้ว' }

    const positionIds = formIds(formData)
    if (positionIds.length > 2000) return { error: 'เลือกตำแหน่งได้ไม่เกิน 2,000 รายการ' }

    let selectedPositions: Array<{ id: string; position_entity_id: string | null }> = []
    if (positionIds.length > 0) {
      const { data, error } = await supabase
        .from('positions')
        .select('id, position_entity_id')
        .in('id', positionIds)
      if (error) throw error
      selectedPositions = (data ?? []) as Array<{ id: string; position_entity_id: string | null }>
      if (selectedPositions.length !== positionIds.length) {
        return { error: 'พบตำแหน่งที่เลือกไม่ครบ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' }
      }
    }

    const conflictingPosition = selectedPositions.find(
      (position) => position.position_entity_id && position.position_entity_id !== id,
    )
    if (conflictingPosition) {
      return { error: 'มีตำแหน่งที่เลือกถูกผูกกับ Position Entity อื่นแล้ว' }
    }

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
      if (!data) return { error: 'บันทึก Position Entity ไม่สำเร็จ' }
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

    if (!entityId) return { error: 'ไม่พบรหัส Position Entity หลังบันทึก' }

    const { error: clearError } = await supabase
      .from('positions')
      .update({ position_entity_id: null })
      .eq('position_entity_id', entityId)
    if (clearError) throw clearError

    if (positionIds.length > 0) {
      const { data: linked, error: linkError } = await supabase
        .from('positions')
        .update({ position_entity_id: entityId })
        .in('id', positionIds)
        .select('id')
      if (linkError) throw linkError
      if (!linked || linked.length !== positionIds.length) {
        return { error: 'บันทึก mapping ตำแหน่งไม่ครบ กรุณาตรวจสอบสิทธิ์แล้วลองอีกครั้ง' }
      }
    }
  } catch (error) {
    console.error('Position Entity action failed:', error)
    return { error: safeActionError(error, 'ไม่สามารถบันทึก Position Entity ได้ในขณะนี้') }
  }

  revalidatePath('/admin/position-entities')
  revalidatePath('/positions')
  revalidatePath('/sitemap.xml')
  revalidatePath(`/positions/${encodeURIComponent(entitySlug)}`)
  redirect('/admin/position-entities')
}
