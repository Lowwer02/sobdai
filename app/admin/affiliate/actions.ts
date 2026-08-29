'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  AFFILIATE_MAX_COLLECTION_ITEMS,
  validateAffiliateProductDraft,
  validateAffiliateProductForPublish,
  validateAffiliateCollectionDraft,
  validateAffiliateCollectionForPublish,
} from '@/lib/affiliate'
import {
  AFFILIATE_LISTING_KEYS,
  validateAffiliateListingSettings,
} from '@/lib/affiliate-listing'

/**
 * Affiliate CMS — CRUD + lifecycle server actions (M1).
 *
 * Conventions reused verbatim from app/admin/news/actions.ts:
 *   - file-level `'use server'`
 *   - requirePermission(...) per action returns the RLS-enforced session
 *     client; never the service-role client
 *   - { success: boolean; error?: string } return shape; formatErrors
 *     flattens the lib contract's errors record to a ' • '-joined string
 *   - CONTENT/LIFECYCLE SEPARATION: update* never mutates status
 *   - PUBLISH IS GATED: publish* runs the strict lib validator against the
 *     stored row BEFORE flipping status
 *
 * EXTRA — dependent public-content revalidation: the news/article detail pages
 * are ISR (revalidate 300), so affiliate mutations must revalidate every
 * public page whose rail could change. revalidateDependentPublicContent()
 * resolves the affected slugs via the reverse-lookup indexes and refreshes
 * them (best-effort: an ISR page also self-heals within 300s).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatErrors(errors: Record<string, string>): string {
  return Object.values(errors).join(' • ')
}

/**
 * Revalidate the public news/article pages whose affiliate rail references any
 * of the given collections (plus the listing pages, which render no affiliate
 * content but stay cheap to refresh). Best-effort: failures are logged and
 * never fail the mutation that triggered them.
 */
async function revalidateDependentPublicContent(collectionIds: string[]): Promise<void> {
  const ids = Array.from(new Set(collectionIds.filter((id) => UUID_REGEX.test(id))))
  if (ids.length === 0) return

  try {
    const { supabase } = await requirePermission('content.read')

    const [newsRes, articlesRes] = await Promise.all([
      supabase.from('news').select('slug').in('affiliate_collection_id', ids),
      supabase.from('articles').select('slug').in('affiliate_collection_id', ids),
    ])

    for (const row of (newsRes.data ?? []) as { slug: string }[]) {
      revalidatePath(`/news/${row.slug}`)
    }
    for (const row of (articlesRes.data ?? []) as { slug: string }[]) {
      revalidatePath(`/articles/${row.slug}`)
    }
    // M2: collection mutations also affect the listing strips, which read a
    // collection WITHOUT any content row referencing it. The listing pages are
    // dynamic (searchParams-driven) so this is cheap insurance either way.
    revalidatePath('/news')
    revalidatePath('/articles')
  } catch (err) {
    console.error('revalidateDependentPublicContent failed (ISR self-heals in 300s):', err)
  }
}

/** Collection ids currently referencing a product (for product mutations). */
async function collectionsReferencingProduct(supabase: any, productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('affiliate_collection_items')
    .select('collection_id')
    .eq('product_id', productId)
  if (error) {
    console.error('collectionsReferencingProduct error:', error.message)
    return []
  }
  return ((data ?? []) as { collection_id: string }[]).map((r) => r.collection_id)
}

// ─── PRODUCTS: CREATE / UPDATE ───────────────────────────────────────────────

export async function createAffiliateProduct(
  raw: any
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { ok, errors, clean } = validateAffiliateProductDraft(raw)
  if (!ok || !clean) return { success: false, error: formatErrors(errors) }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('affiliate_products').insert({
    id,
    name: clean.name,
    image_url: clean.image_url,
    image_alt: clean.image_alt,
    merchant: clean.merchant,
    affiliate_url: clean.affiliate_url,
    short_description: clean.short_description,
    tags: clean.tags,
    status: 'draft',
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/affiliate')
  redirect(`/admin/affiliate/${id}/edit`)
}

export async function updateAffiliateProduct(
  id: string,
  raw: any
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('affiliate_products')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบสินค้า หรือคุณไม่มีสิทธิ์' }

  const { ok, errors, clean } = validateAffiliateProductDraft(raw)
  if (!ok || !clean) return { success: false, error: formatErrors(errors) }

  const { error, data } = await supabase
    .from('affiliate_products')
    .update({
      name: clean.name,
      image_url: clean.image_url,
      image_alt: clean.image_alt,
      merchant: clean.merchant,
      affiliate_url: clean.affiliate_url,
      short_description: clean.short_description,
      tags: clean.tags,
    })
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'แก้ไขไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/affiliate')
  revalidatePath(`/admin/affiliate/${id}/edit`)
  await revalidateDependentPublicContent(await collectionsReferencingProduct(supabase, id))
  return { success: true }
}

// ─── PRODUCTS: LIFECYCLE ─────────────────────────────────────────────────────

export async function publishAffiliateProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('affiliate_products')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบสินค้า หรือคุณไม่มีสิทธิ์' }
  if (existing.status !== 'draft') {
    return { success: false, error: 'เผยแพร่ได้เฉพาะสินค้าสถานะ Draft เท่านั้น' }
  }

  // Readiness gate against the STORED row (the editor must save first).
  const { ok, errors } = validateAffiliateProductForPublish(existing)
  if (!ok) return { success: false, error: formatErrors(errors) }

  const { error, data } = await supabase
    .from('affiliate_products')
    .update({ status: 'published' })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'เผยแพร่ไม่สำเร็จ สถานะอาจถูกเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/affiliate')
  revalidatePath(`/admin/affiliate/${id}/edit`)
  await revalidateDependentPublicContent(await collectionsReferencingProduct(supabase, id))
  return { success: true }
}

export async function archiveAffiliateProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { error, data } = await supabase
    .from('affiliate_products')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('status', 'published')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'จัดเก็บได้เฉพาะสินค้าที่เผยแพร่แล้วเท่านั้น' }
  }

  revalidatePath('/admin/affiliate')
  revalidatePath(`/admin/affiliate/${id}/edit`)
  await revalidateDependentPublicContent(await collectionsReferencingProduct(supabase, id))
  return { success: true }
}

export async function restoreAffiliateProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { error, data } = await supabase
    .from('affiliate_products')
    .update({ status: 'draft' })
    .eq('id', id)
    .eq('status', 'archived')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'กู้คืนได้เฉพาะสินค้าที่ถูกจัดเก็บแล้วเท่านั้น' }
  }

  revalidatePath('/admin/affiliate')
  revalidatePath(`/admin/affiliate/${id}/edit`)
  await revalidateDependentPublicContent(await collectionsReferencingProduct(supabase, id))
  return { success: true }
}

export async function deleteAffiliateProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.delete')

  // Resolve dependents BEFORE the delete (junction rows cascade away with it).
  const dependentCollections = await collectionsReferencingProduct(supabase, id)

  const { error, data } = await supabase
    .from('affiliate_products')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'ลบไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/affiliate')
  await revalidateDependentPublicContent(dependentCollections)
  return { success: true }
}

// ─── COLLECTIONS: CREATE / UPDATE ────────────────────────────────────────────

export async function createAffiliateCollection(
  raw: any
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { ok, errors, clean } = validateAffiliateCollectionDraft(raw)
  if (!ok || !clean) return { success: false, error: formatErrors(errors) }

  const id = crypto.randomUUID()
  const { error } = await supabase
    .from('affiliate_collections')
    .insert({ id, name: clean.name, status: 'draft' })
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/affiliate/collections')
  redirect(`/admin/affiliate/collections/${id}/edit`)
}

export async function updateAffiliateCollection(
  id: string,
  raw: any
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { ok, errors, clean } = validateAffiliateCollectionDraft(raw)
  if (!ok || !clean) return { success: false, error: formatErrors(errors) }

  const { error, data } = await supabase
    .from('affiliate_collections')
    .update({ name: clean.name })
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'แก้ไขไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/affiliate/collections')
  revalidatePath(`/admin/affiliate/collections/${id}/edit`)
  return { success: true }
}

/**
 * Replace a collection's ordered product set (delete-then-insert, mirroring
 * news updateRelations). productIds order IS the editorial order (index =
 * sort_order). Cardinality bounded by AFFILIATE_MAX_COLLECTION_ITEMS.
 */
export async function updateAffiliateCollectionItems(
  id: string,
  productIds: unknown
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  if (!Array.isArray(productIds)) {
    return { success: false, error: 'รูปแบบรายการสินค้าไม่ถูกต้อง' }
  }
  const ids = Array.from(new Set(productIds as unknown[]))
  if (ids.length > AFFILIATE_MAX_COLLECTION_ITEMS) {
    return { success: false, error: `เลือกสินค้าได้ไม่เกิน ${AFFILIATE_MAX_COLLECTION_ITEMS} รายการ` }
  }
  for (const pid of ids) {
    if (typeof pid !== 'string' || !UUID_REGEX.test(pid)) {
      return { success: false, error: 'พบรหัสสินค้าที่มีรูปแบบไม่ถูกต้อง' }
    }
  }

  const { data: existing, error: fetchError } = await supabase
    .from('affiliate_collections')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบคอลเลกชัน หรือคุณไม่มีสิทธิ์' }

  // Verify every selected product exists before replacing (mirrors
  // updateArticlePackageRelations' validation).
  if (ids.length > 0) {
    const { data: valid, error: validError } = await supabase
      .from('affiliate_products')
      .select('id')
      .in('id', ids)
    if (validError) return { success: false, error: validError.message }
    if (!valid || valid.length !== ids.length) {
      return { success: false, error: 'พบสินค้าที่ไม่ถูกต้องหรือถูกลบไปแล้ว' }
    }
  }

  const { error: delError } = await supabase
    .from('affiliate_collection_items')
    .delete()
    .eq('collection_id', id)
  if (delError) return { success: false, error: delError.message }

  if (ids.length > 0) {
    const rows = ids.map((pid, index) => ({
      collection_id: id,
      product_id: pid,
      sort_order: index,
    }))
    const { error: insError, data: insData } = await supabase
      .from('affiliate_collection_items')
      .insert(rows)
      .select('collection_id')
    if (insError) return { success: false, error: insError.message }
    if (!insData || insData.length !== rows.length) {
      return { success: false, error: 'เพิ่มสินค้าไม่ครบ คุณอาจไม่มีสิทธิ์' }
    }
  }

  revalidatePath('/admin/affiliate/collections')
  revalidatePath(`/admin/affiliate/collections/${id}/edit`)
  await revalidateDependentPublicContent([id])
  return { success: true }
}

// ─── COLLECTIONS: LIFECYCLE ──────────────────────────────────────────────────

export async function publishAffiliateCollection(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('affiliate_collections')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบคอลเลกชัน หรือคุณไม่มีสิทธิ์' }
  if (existing.status !== 'draft') {
    return { success: false, error: 'เผยแพร่ได้เฉพาะคอลเลกชันสถานะ Draft เท่านั้น' }
  }

  // Gate: name + at least one attached product (the stored row decides).
  const { data: items, error: itemsError } = await supabase
    .from('affiliate_collection_items')
    .select('product_id')
    .eq('collection_id', id)
  if (itemsError) return { success: false, error: itemsError.message }

  const { ok, errors } = validateAffiliateCollectionForPublish(
    existing,
    ((items ?? []) as { product_id: string }[]).map((r) => r.product_id),
  )
  if (!ok) return { success: false, error: formatErrors(errors) }

  const { error, data } = await supabase
    .from('affiliate_collections')
    .update({ status: 'published' })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'เผยแพร่ไม่สำเร็จ สถานะอาจถูกเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/affiliate/collections')
  revalidatePath(`/admin/affiliate/collections/${id}/edit`)
  await revalidateDependentPublicContent([id])
  return { success: true }
}

export async function archiveAffiliateCollection(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { error, data } = await supabase
    .from('affiliate_collections')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('status', 'published')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'จัดเก็บได้เฉพาะคอลเลกชันที่เผยแพร่แล้วเท่านั้น' }
  }

  revalidatePath('/admin/affiliate/collections')
  revalidatePath(`/admin/affiliate/collections/${id}/edit`)
  await revalidateDependentPublicContent([id])
  return { success: true }
}

export async function restoreAffiliateCollection(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { error, data } = await supabase
    .from('affiliate_collections')
    .update({ status: 'draft' })
    .eq('id', id)
    .eq('status', 'archived')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'กู้คืนได้เฉพาะคอลเลกชันที่ถูกจัดเก็บแล้วเท่านั้น' }
  }

  revalidatePath('/admin/affiliate/collections')
  revalidatePath(`/admin/affiliate/collections/${id}/edit`)
  await revalidateDependentPublicContent([id])
  return { success: true }
}

export async function deleteAffiliateCollection(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.delete')

  // news/articles FK is ON DELETE SET NULL: content keeps affiliate_enabled
  // but loses the collection → the public rail silently turns off (by design).
  const { error, data } = await supabase
    .from('affiliate_collections')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'ลบไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/affiliate/collections')
  await revalidateDependentPublicContent([id])
  return { success: true }
}

// ─── READS (pickers) ─────────────────────────────────────────────────────────

/** Search products for the collection editor's picker (all statuses visible
 *  to staff; status surfaces in the label so drafts are recognizable). */
export async function listAffiliateProducts(
  params: { q?: string; page?: number; limit?: number } = {}
): Promise<{ data: any[]; count: number | null }> {
  const { supabase } = await requirePermission('content.read')

  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50)
  const page = Math.max(params.page ?? 1, 1)
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('affiliate_products')
    .select('id, name, merchant, status', { count: 'exact' })

  if (params.q && params.q.trim()) {
    query = query.ilike('name', `%${params.q.trim()}%`)
  }

  query = query.order('name', { ascending: true }).range(from, to)

  const { data, error, count } = await query
  if (error) {
    console.error('listAffiliateProducts picker error:', error.message)
    return { data: [], count: null }
  }
  return { data: data ?? [], count }
}

/**
 * Collections for the News/Article editors' assignment select. All statuses
 * are visible (staff RLS); non-published collections are labeled so editors
 * can see the rail won't render until the collection publishes.
 */
export async function listAffiliateCollectionsForContent(): Promise<{
  success: boolean
  data: { id: string; name: string; status: string }[]
  error?: string
}> {
  const { supabase } = await requirePermission('content.read')

  const { data, error } = await supabase
    .from('affiliate_collections')
    .select('id, name, status')
    .order('name', { ascending: true })

  if (error) {
    console.error('listAffiliateCollectionsForContent error:', error.message)
    return { success: false, data: [], error: 'ไม่สามารถโหลดรายการคอลเลกชันได้' }
  }
  return { success: true, data: (data ?? []) as { id: string; name: string; status: string }[] }
}

// ─── LISTING STRIP SETTINGS (M2) ─────────────────────────────────────────────

/**
 * Save the /news + /articles listing-strip config (one row per listing key in
 * affiliate_listing_slots). The form always submits BOTH slots, so the two
 * listings are saved atomically in ONE upsert while staying independently
 * configurable. Position/threshold are frozen in code — nothing here can
 * change them. Upsert (not update) so a missing seed row heals itself.
 */
export async function saveAffiliateListingSettings(
  raw: unknown
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { ok, errors, clean } = validateAffiliateListingSettings(raw)
  if (!ok || !clean) return { success: false, error: formatErrors(errors) }

  const rows = AFFILIATE_LISTING_KEYS.map((key) => ({
    listing_key: key,
    enabled: clean[key].enabled,
    collection_id: clean[key].collection_id,
  }))

  const { error } = await supabase
    .from('affiliate_listing_slots')
    .upsert(rows, { onConflict: 'listing_key' })
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/affiliate/listing')
  revalidatePath('/news')
  revalidatePath('/articles')
  return { success: true }
}
