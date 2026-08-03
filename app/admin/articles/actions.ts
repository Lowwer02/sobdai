'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  ArticleStatus,
  validateArticleDraft,
  validateArticleForPublish,
  Article,
} from '@/lib/articles'

function formatErrors(errors: Record<string, string>): string {
  return Object.values(errors).join(' • ')
}

function isUniqueViolation(error: any): boolean {
  if (!error) return false
  return (
    error.code === '23505' ||
    (typeof error.message === 'string' && error.message.includes('unique constraint'))
  )
}

function getManagedCoverPath(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      const expectedOrigin = new URL(supabaseUrl).origin
      if (parsed.origin !== expectedOrigin) return null
    }
    const prefix = '/storage/v1/object/public/article-assets/article-covers/'
    if (!parsed.pathname.startsWith(prefix)) return null

    const fileName = parsed.pathname.slice(prefix.length)
    if (!fileName) return null

    const validExts = ['jpg', 'jpeg', 'png', 'webp', 'heic']
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!ext || !validExts.includes(ext)) return null

    return `article-covers/${fileName}`
  } catch {
    return null
  }
}

async function removeManagedCoverIfUnused(supabase: any, url: string | null | undefined) {
  const path = getManagedCoverPath(url)
  if (!path) return
  try {
    // Shared-cover protection: do not delete if another article still references the same cover
    const { count, error: countError } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('cover_image_url', url)

    if (!countError && count && count > 0) {
      return
    }

    const { error: storageError } = await supabase.storage.from('article-assets').remove([path])
    if (storageError) {
      console.error('Storage error removing managed article cover:', storageError.message)
    }
  } catch (err) {
    console.error('Unexpected error removing managed article cover:', err)
  }
}

// ─── CREATE ARTICLE ──────────────────────────────────────────────────────────

export async function createArticle(raw: any): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requirePermission('content.write')

  const { ok, errors, clean } = validateArticleDraft(raw)
  if (!ok || !clean) {
    return { success: false, error: formatErrors(errors) }
  }

  const payload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    slug: clean.slug,
    title: clean.title,
    excerpt: clean.excerpt,
    body_markdown: clean.body_markdown,
    cover_image_url: clean.cover_image_url,
    cover_image_alt: clean.cover_image_alt,
    category: clean.category,
    tags: clean.tags,
    status: 'draft',
    published_at: null,
    seo_title: clean.seo_title,
    seo_description: clean.seo_description,
    canonical_url: clean.canonical_url,
    og_image_url: clean.og_image_url,
    created_by: user.id,
  }

  const { error } = await supabase.from('articles').insert(payload)
  if (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: 'Slug นี้ถูกใช้งานแล้ว กรุณาใช้ Slug อื่น' }
    }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/articles')
  redirect(`/admin/articles/${payload.id}/edit`)
}

// ─── UPDATE ARTICLE ──────────────────────────────────────────────────────────

export async function updateArticle(
  id: string,
  raw: any
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  // Status-aware update validation:
  // Server forces status and published_at from existing stored row regardless of raw input
  const currentStatus = existing.status as ArticleStatus
  const candidate = {
    ...raw,
    status: currentStatus,
    published_at: existing.published_at,
  }

  let ok: boolean
  let errors: Record<string, string>
  let clean: any

  if (currentStatus === 'published') {
    const res = validateArticleForPublish(candidate)
    ok = res.ok
    errors = res.errors
    clean = res.clean
  } else {
    const res = validateArticleDraft(candidate)
    ok = res.ok
    errors = res.errors
    clean = res.clean
  }

  if (!ok || !clean) {
    return { success: false, error: formatErrors(errors) }
  }

  // Update payload excludes status, published_at, created_by
  const payload: Record<string, unknown> = {
    slug: clean.slug,
    title: clean.title,
    excerpt: clean.excerpt,
    body_markdown: clean.body_markdown,
    cover_image_url: clean.cover_image_url,
    cover_image_alt: clean.cover_image_alt,
    category: clean.category,
    tags: clean.tags,
    seo_title: clean.seo_title,
    seo_description: clean.seo_description,
    canonical_url: clean.canonical_url,
    og_image_url: clean.og_image_url,
  }

  // Atomic update guard with status matching
  const { error, data } = await supabase
    .from('articles')
    .update(payload)
    .eq('id', id)
    .eq('status', currentStatus)
    .select('id')

  if (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: 'Slug นี้ถูกใช้งานแล้ว กรุณาใช้ Slug อื่น' }
    }
    return { success: false, error: error.message }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'แก้ไขไม่สำเร็จ สถานะปัจจุบันของบทความอาจถูกเปลี่ยนไปแล้ว กรุณารีโหลดหน้าใหม่' }
  }

  // Managed Cover Cleanup: if cover URL changed, delete old managed cover if no longer used
  if (existing.cover_image_url && existing.cover_image_url !== clean.cover_image_url) {
    await removeManagedCoverIfUnused(supabase, existing.cover_image_url)
  }

  revalidatePath('/admin/articles')
  revalidatePath(`/admin/articles/${id}/edit`)
  return { success: true }
}

// ─── LIFECYCLE: PUBLISH ──────────────────────────────────────────────────────

export async function publishArticle(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  if (existing.status !== 'draft') {
    return { success: false, error: 'สามารถเผยแพร่ได้เฉพาะบทความที่เป็นร่าง (Draft) เท่านั้น' }
  }

  const publishTimestamp = existing.published_at || new Date().toISOString()
  const rawCandidate = {
    ...existing,
    status: 'published',
    published_at: publishTimestamp,
  }

  const { ok, errors } = validateArticleForPublish(rawCandidate)
  if (!ok) {
    return { success: false, error: formatErrors(errors) }
  }

  const patch: { status: ArticleStatus; published_at: string } = {
    status: 'published',
    published_at: publishTimestamp,
  }

  // Atomic update with status guard
  const { error, data } = await supabase
    .from('articles')
    .update(patch)
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'เผยแพร่ไม่สำเร็จ สถานะปัจจุบันอาจถูกเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/articles')
  revalidatePath(`/admin/articles/${id}/edit`)
  return { success: true }
}

// ─── LIFECYCLE: ARCHIVE ──────────────────────────────────────────────────────

export async function archiveArticle(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('articles')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  if (existing.status !== 'published') {
    return { success: false, error: 'สามารถจัดเก็บได้เฉพาะบทความที่เผยแพร่แล้วเท่านั้น' }
  }

  // Atomic update with status guard
  const { error, data } = await supabase
    .from('articles')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('status', 'published')
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'จัดเก็บไม่สำเร็จ สถานะปัจจุบันอาจถูกเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/articles')
  revalidatePath(`/admin/articles/${id}/edit`)
  return { success: true }
}

// ─── LIFECYCLE: RESTORE (To Draft) ─────────────────────────────────────────

export async function restoreArticle(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('articles')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  if (existing.status !== 'archived') {
    return { success: false, error: 'สามารถกู้คืนได้เฉพาะบทความที่ถูกจัดเก็บแล้วเท่านั้น' }
  }

  // Atomic update with status guard (restores to draft)
  const { error, data } = await supabase
    .from('articles')
    .update({ status: 'draft' })
    .eq('id', id)
    .eq('status', 'archived')
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'กู้คืนไม่สำเร็จ สถานะปัจจุบันอาจถูกเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/articles')
  revalidatePath(`/admin/articles/${id}/edit`)
  return { success: true }
}

// ─── DELETE ARTICLE ──────────────────────────────────────────────────────────

export async function deleteArticle(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.delete')

  const { data: existing, error: fetchError } = await supabase
    .from('articles')
    .select('id, status, cover_image_url')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  if (existing.status === 'published') {
    return {
      success: false,
      error: 'ไม่สามารถลบบทความที่กำลังเผยแพร่ได้ — กรุณาจัดเก็บ (Archive) บทความก่อนทำการลบ',
    }
  }

  // Atomic delete with status guard
  const { error, data } = await supabase
    .from('articles')
    .delete()
    .eq('id', id)
    .in('status', ['draft', 'archived'])
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'ลบไม่สำเร็จ สถานะปัจจุบันของบทความอาจถูกเปลี่ยนไปแล้ว หรือไม่สามารถลบบทความนี้ได้' }
  }

  // Managed cover cleanup after successful delete
  if (existing.cover_image_url) {
    await removeManagedCoverIfUnused(supabase, existing.cover_image_url)
  }

  revalidatePath('/admin/articles')
  return { success: true }
}

// ─── READ SINGLE ARTICLE ────────────────────────────────────────────────────

export async function getArticleById(id: string): Promise<Article | null> {
  const { supabase } = await requirePermission('content.read')

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as Article
}

// ─── COVER UPLOAD ───────────────────────────────────────────────────────────

export async function uploadArticleCover(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return { success: false, error: 'ไม่พบไฟล์ที่ต้องการอัปโหลด หรือไฟล์ว่างเปล่า' }
  }

  // 4MB cap
  if (file.size > 4 * 1024 * 1024) {
    return { success: false, error: 'ขนาดไฟล์เกิน 4 MB' }
  }

  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
  }

  const ext = mimeMap[file.type]
  if (!ext) {
    return { success: false, error: 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, HEIC)' }
  }

  const path = `article-covers/${crypto.randomUUID()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabase.storage
    .from('article-assets')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return { success: false, error: uploadError.message }
  }

  const { data } = supabase.storage.from('article-assets').getPublicUrl(path)

  return { success: true, url: data.publicUrl }
}
