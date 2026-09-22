'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  hasAuthoritativeAgencySource,
  isStableAgencySlug,
  normalizeAgencyText,
  parseAgencySourcesJson,
} from '@/lib/agency-profile'
import type { AgencyProfileActionState } from './action-state'

type ExistingAgencyProfile = {
  id: string
  slug: string
  status: string
  published_at: string | null
  organization_id: string
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function safeActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  if (/agency_profiles|organization_id|schema cache|relation .* does not exist/i.test(message)) {
    return 'ยังไม่พร้อมใช้งาน: กรุณาให้ผู้ดูแลระบบติดตั้ง migration 102 ก่อน'
  }
  return fallback
}

function revalidateAgencySurfaces(slug?: string): void {
  revalidatePath('/admin/agency-profiles')
  revalidatePath('/agencies')
  revalidatePath('/sitemap.xml')
  if (slug) revalidatePath(`/agencies/${encodeURIComponent(slug)}`)
}

async function loadProfile(supabase: any, id: string): Promise<ExistingAgencyProfile | null> {
  const { data, error } = await supabase
    .from('agency_profiles')
    .select('id, slug, status, published_at, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as ExistingAgencyProfile) ?? null
}

/**
 * Save one Agency Profile's editorial content (content.write). Following the
 * News content/lifecycle separation, this action NEVER mutates status or
 * published_at — publishing and archiving are dedicated content.publish
 * lifecycle actions below.
 */
export async function saveAgencyProfileAction(
  id: string | null,
  _previousState: AgencyProfileActionState,
  formData: FormData,
): Promise<AgencyProfileActionState> {
  let entitySlug = formText(formData, 'slug')

  try {
    const { supabase } = await requirePermission('content.write')
    const organizationId = formText(formData, 'organization_id')
    const overview = formText(formData, 'overview_markdown') || null
    const seoTitle = formText(formData, 'seo_title') || null
    const seoDescription = formText(formData, 'seo_description') || null
    const authorId = formText(formData, 'author_id') || null
    const parsedSources = parseAgencySourcesJson(formData.get('sources_json'))

    if (!isStableAgencySlug(entitySlug)) {
      return { error: 'Slug ต้องเป็นภาษาอังกฤษตัวพิมพ์เล็ก คั่นด้วยเส้นประ และไม่มีอักขระพิเศษ' }
    }
    if (!parsedSources.ok) {
      return { error: parsedSources.error }
    }
    const sources = parsedSources.sources

    let existing: ExistingAgencyProfile | null = null
    if (id) {
      existing = await loadProfile(supabase, id)
      if (!existing) return { error: 'ไม่พบ Agency Profile ที่ต้องการแก้ไข' }
      if (existing.published_at && existing.slug !== entitySlug) {
        return { error: 'Slug ของ Agency Profile ที่เคยเผยแพร่แล้วต้องคงเดิม' }
      }
      // The 1:1 bond is fixed at creation; re-pointing an existing profile to
      // another organization would silently rewrite agency history.
      if (organizationId && organizationId !== existing.organization_id) {
        return { error: 'เปลี่ยนหน่วยงานของ Profile ที่สร้างแล้วไม่ได้ — สร้าง Profile ใหม่แทน' }
      }
    } else {
      if (!organizationId) return { error: 'กรุณาเลือกหน่วยงานสำหรับ Profile นี้' }
    }

    // Slug uniqueness across profiles.
    let duplicateQuery = supabase
      .from('agency_profiles')
      .select('id')
      .eq('slug', entitySlug)
      .limit(1)
    if (id) duplicateQuery = duplicateQuery.neq('id', id)
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) return { error: 'Slug นี้ถูกใช้โดย Agency Profile อื่นแล้ว' }

    const targetOrganizationId = organizationId || existing?.organization_id || ''

    // 1:1 enforcement on create: the target organization must be real and
    // must not already carry a profile. (organizations is world-readable.)
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', targetOrganizationId)
      .maybeSingle()
    if (orgError) throw orgError
    if (!organization) return { error: 'ไม่พบหน่วยงานที่เลือก' }

    if (!id) {
      const { data: taken, error: takenError } = await supabase
        .from('agency_profiles')
        .select('id')
        .eq('organization_id', targetOrganizationId)
        .limit(1)
        .maybeSingle()
      if (takenError) throw takenError
      if (taken) {
        return { error: `หน่วยงาน ${normalizeAgencyText(organization.name)} มี Agency Profile อยู่แล้ว` }
      }

      const { error: insertError } = await supabase.from('agency_profiles').insert({
        organization_id: targetOrganizationId,
        slug: entitySlug,
        overview_markdown: overview,
        seo_title: seoTitle,
        seo_description: seoDescription,
        sources,
        author_id: authorId,
        status: 'draft',
        published_at: null,
      })
      if (insertError) throw insertError
    } else {
      const { error: updateError } = await supabase
        .from('agency_profiles')
        .update({
          slug: entitySlug,
          overview_markdown: overview,
          seo_title: seoTitle,
          seo_description: seoDescription,
          sources,
          author_id: authorId,
        })
        .eq('id', id)
      if (updateError) throw updateError
    }

    revalidateAgencySurfaces(entitySlug)
    return { message: 'บันทึกเรียบร้อย' }
  } catch (error) {
    return { error: safeActionError(error, 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง') }
  }
}

/**
 * Publish an Agency Profile (content.publish). Requires the minimum editorial
 * substance for a renderable public page — stable slug, non-empty overview,
 * and at least one authoritative HTTPS source. Full index-readiness (supporting
 * content totals, uniqueness) remains the computed public gate and may keep a
 * published page noindex until it qualifies.
 */
export async function publishAgencyProfileAction(
  id: string,
  _previousState: AgencyProfileActionState,
  _formData: FormData,
): Promise<AgencyProfileActionState> {
  try {
    const { supabase } = await requirePermission('content.publish')
    const existing = await loadProfile(supabase, id)
    if (!existing) return { error: 'ไม่พบ Agency Profile ที่ต้องการเผยแพร่' }
    if (existing.status === 'published') return { error: 'Agency Profile นี้เผยแพร่อยู่แล้ว' }

    const { data: profile, error: fetchError } = await supabase
      .from('agency_profiles')
      .select('slug, overview_markdown, sources')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!profile) return { error: 'ไม่พบ Agency Profile ที่ต้องการเผยแพร่' }

    if (!isStableAgencySlug(profile.slug)) {
      return { error: 'Slug ต้องเป็นภาษาอังกฤษตัวพิมพ์เล็กคั่นด้วยเส้นประก่อนเผยแพร่' }
    }
    if (!normalizeAgencyText(profile.overview_markdown)) {
      return { error: 'กรุณาเขียนภาพรวมของหน่วยงานก่อนเผยแพร่' }
    }
    if (!hasAuthoritativeAgencySource(profile.sources)) {
      return { error: 'กรุณาแนบแหล่งอ้างอิง HTTPS อย่างน้อยหนึ่งรายการก่อนเผยแพร่' }
    }

    const patch: Record<string, unknown> = { status: 'published' }
    if (!existing.published_at) patch.published_at = new Date().toISOString()

    const { error } = await supabase.from('agency_profiles').update(patch).eq('id', id)
    if (error) throw error

    revalidateAgencySurfaces(existing.slug)
    return { message: 'เผยแพร่เรียบร้อย' }
  } catch (error) {
    return { error: safeActionError(error, 'เผยแพร่ไม่สำเร็จ กรุณาลองอีกครั้ง') }
  }
}

/** Archive a published Agency Profile (content.publish). Retains published_at. */
export async function archiveAgencyProfileAction(
  id: string,
  _previousState: AgencyProfileActionState,
  _formData: FormData,
): Promise<AgencyProfileActionState> {
  try {
    const { supabase } = await requirePermission('content.publish')
    const existing = await loadProfile(supabase, id)
    if (!existing) return { error: 'ไม่พบ Agency Profile ที่ต้องการจัดเก็บ' }
    if (existing.status !== 'published') return { error: 'จัดเก็บได้เฉพาะ Profile ที่เผยแพร่อยู่' }

    const { error } = await supabase
      .from('agency_profiles')
      .update({ status: 'archived' })
      .eq('id', id)
    if (error) throw error

    revalidateAgencySurfaces(existing.slug)
    return { message: 'จัดเก็บเรียบร้อย (URL เดิมจะกลายเป็น 404 จนกว่าจะเผยแพร่อีกครั้ง)' }
  } catch (error) {
    return { error: safeActionError(error, 'จัดเก็บไม่สำเร็จ กรุณาลองอีกครั้ง') }
  }
}

/** Restore an archived Agency Profile back to draft (content.publish). */
export async function restoreAgencyProfileAction(
  id: string,
  _previousState: AgencyProfileActionState,
  _formData: FormData,
): Promise<AgencyProfileActionState> {
  try {
    const { supabase } = await requirePermission('content.publish')
    const existing = await loadProfile(supabase, id)
    if (!existing) return { error: 'ไม่พบ Agency Profile ที่ต้องการกู้คืน' }
    if (existing.status !== 'archived') return { error: 'กู้คืนได้เฉพาะ Profile ที่ถูกจัดเก็บ' }

    const { error } = await supabase
      .from('agency_profiles')
      .update({ status: 'draft' })
      .eq('id', id)
    if (error) throw error

    revalidateAgencySurfaces(existing.slug)
    return { message: 'กู้คืนเป็นฉบับร่างเรียบร้อย' }
  } catch (error) {
    return { error: safeActionError(error, 'กู้คืนไม่สำเร็จ กรุณาลองอีกครั้ง') }
  }
}
