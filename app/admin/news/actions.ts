'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  NewsInput,
  NewsStatus,
  coerceRelations,
  generateSlug,
  validateNewsDraft,
  validateNewsForPublish,
} from '@/lib/news'

/**
 * Government News — CRUD + lifecycle server actions.
 *
 * Conventions reused from the rest of the admin:
 *   - file-level `'use server'`
 *   - permission via requirePermission(...), which returns the RLS-enforced
 *     session client. Never the service-role client (only payment webhooks
 *     use that).
 *   - return shape { success: boolean; error?: string }, typed inline
 *   - promotions-style error handling (check each error, treat zero-rows as a
 *     permission failure, NO try/catch around redirect() — it throws
 *     NEXT_REDIRECT internally)
 *   - lib validation contract: { ok, errors, clean } → formatErrors flattens
 *     to a ' • '-joined string for the client
 *   - revalidatePath only (no revalidateTag exists in the codebase)
 *
 * Design rules specific to this module:
 *   1. CONTENT/LIFECYCLE SEPARATION. updateNews NEVER mutates status or
 *      published_at. Lifecycle (publish/archive/restore) lives in dedicated
 *      actions. There is intentionally no "Save & Publish".
 *   2. PUBLISH IS GATED. publishNews runs validateNewsForPublish() first; if it
 *      fails, status is unchanged and the article stays a draft. This is the
 *      core error-prevention mechanism: an incomplete article cannot reach the
 *      SEO-critical public path.
 *   3. PUBLIC PATHS ARE REVALIDATED. Unlike promotions (which omit public
 *      revalidation), News revalidates /news and /news/[slug] because it IS a
 *      public surface. This corrects the promotions omission deliberately.
 *   4. LINK EQUITY IS PROTECTED. Slug changes on a published row create a 301
 *      redirect row first; archive proposes a redirect; hard delete of a
 *      published row requires a redirect to exist. A ranked URL must never
 *      silently 404.
 *
 * Non-atomic multi-writes: updateRelations (delete-then-insert) and
 * updateNews+redirect follow existing precedent (exam_set_questions). See the
 * implementation spec §7.
 */

// ─── CREATE ─────────────────────────────────────────────────────────────────

/**
 * Create a news article. Always as a draft (status forced server-side: a client
 * cannot self-publish at create). On success redirects to the edit page
 * (throws NEXT_REDIRECT, does not return); on validation/DB error returns
 * { success: false, error }.
 *
 * No relations at create time — they are added after the first save, mirroring
 * packages/exam-sets which insert the parent then the junction separately.
 */
export async function createNews(raw: any): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { ok, errors, clean } = validateNewsDraft(raw)
  if (!ok) return { success: false, error: formatErrors(errors) }

  const payload = toInsertPayload(clean!, true)

  const { error } = await supabase.from('news').insert(payload)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/news')
  revalidatePath('/news')
  redirect(`/admin/news/${payload.id}/edit`)
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

/**
 * Update news content. Stays on the edit page on success (returns
 * { success: true }). NEVER mutates status or published_at — those are owned by
 * the lifecycle actions. If the slug changes AND the row was ever published
 * (published_at not null), a 301 redirect row is created FIRST so the old
 * ranked URL keeps its link equity.
 */
export async function updateNews(
  id: string,
  raw: any
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  // Fetch the existing row to (a) check it exists + is RLS-visible, and (b)
  // detect a slug change on a published/ever-published article.
  const { data: existing, error: fetchError } = await supabase
    .from('news')
    .select('id, slug, published_at')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  const { ok, errors, clean } = validateNewsDraft(raw)
  if (!ok) return { success: false, error: formatErrors(errors) }

  const newSlug = clean!.slug
  const slugChanged = newSlug && existing.slug && newSlug !== existing.slug
  const wasEverPublished = existing.published_at != null

  // Redirect FIRST: if the insert fails, the old URL still resolves (no harm);
  // if the slug update then succeeds, the redirect is already in place. The
  // reverse order would flip the slug and then risk leaving the old ranked URL
  // unprotected if the redirect insert failed.
  if (slugChanged && wasEverPublished) {
    const { error: redirectError } = await supabase.from('news_redirects').insert({
      from_path: `/news/${existing.slug}`,
      to_path: `/news/${newSlug}`,
      http_status: 301,
      reason: `slug rename: ${existing.slug} → ${newSlug}`,
      news_id: id,
    })
    // from_path is unique; a pre-existing redirect for this exact old path is
    // acceptable (the old URL is still covered) — only surface real errors.
    if (redirectError && !isUniqueViolation(redirectError)) {
      return { success: false, error: redirectError.message }
    }
  }

  const updatePayload = toInsertPayload(clean!, false) // omit id; keep status/published_at untouched
  const { error, data } = await supabase
    .from('news')
    .update(updatePayload)
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'แก้ไขไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/news')
  revalidatePath('/news')
  revalidatePath(`/news/${newSlug}`)
  if (slugChanged) revalidatePath(`/news/${existing.slug}`)
  return { success: true }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

/**
 * Hard delete. The costliest action — loses a ranked URL. content.delete is
 * required (editor lacks it, matching RBAC). If the row was ever published,
 * a news_redirects row for its public path MUST already exist, else we refuse:
 * a ranked URL must never be hard-deleted into a 404.
 *
 * Cascade is DB-side: news_packages/news_summaries go via ON DELETE CASCADE;
 * news_redirects.news_id is SET NULL so the redirect itself survives (the whole
 * point of the redirects table).
 */
export async function deleteNews(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.delete')

  const { data: existing, error: fetchError } = await supabase
    .from('news')
    .select('id, slug, published_at')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  // Link-equity gate for ever-published content.
  if (existing.published_at != null) {
    const { data: redirect, error: redirectError } = await supabase
      .from('news_redirects')
      .select('id')
      .eq('from_path', `/news/${existing.slug}`)
      .maybeSingle()
    if (redirectError) return { success: false, error: redirectError.message }
    if (!redirect) {
      return {
        success: false,
        error: 'ไม่สามารถลบบทความที่เคยเผยแพร่ได้โดยไม่มี redirect — สร้าง redirect สำหรับ URL เดิมก่อนเพื่อรักษาลิงก์',
      }
    }
  }

  const { error, data } = await supabase.from('news').delete().eq('id', id).select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'ลบไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/news')
  revalidatePath('/news')
  if (existing.slug) revalidatePath(`/news/${existing.slug}`)
  return { success: true }
}

// ─── LIFECYCLE ──────────────────────────────────────────────────────────────

/**
 * Publish. Runs validateNewsForPublish() (the readiness gate) BEFORE the write;
 * on failure returns the field-specific errors and leaves status UNCHANGED
 * (article stays draft). published_at is stamped only on FIRST publish
 * (retained on republish-after-archive). Uses content.write, NOT
 * content.publish — the frozen CMS IA explicitly excludes an author/publisher
 * split, so any editor who can write can publish.
 */
export async function publishNews(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  // Run the readiness gate against the CURRENT stored row (the editor must
  // save before publishing). Cast through the validator which expects `any`.
  const { ok, errors } = validateNewsForPublish(existing)
  if (!ok) return { success: false, error: formatErrors(errors) }

  const patch: { status: NewsStatus; published_at?: string } = { status: 'published' }
  if (existing.published_at == null) patch.published_at = new Date().toISOString()

  const { error, data } = await supabase
    .from('news')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'เผยแพร่ไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  revalidatePath('/admin/news')
  revalidatePath('/news')
  revalidatePath(`/news/${existing.slug}`)
  return { success: true }
}

/**
 * Archive. Removes the article from the public listing/sitemap (status no
 * longer 'published') but RETAINS published_at so restore() can flip back
 * without re-stamping. Proposes a 301 redirect from the article's public path
 * to a chosen target (defaults to /news) so the retired ranked URL does not 404.
 */
export async function archiveNews(
  id: string,
  redirectTarget: string = '/news'
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('news')
    .select('id, slug, published_at')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  // Status flip (published_at intentionally NOT cleared).
  const { error, data } = await supabase
    .from('news')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'เก็บถาวรไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  // Propose a redirect so the retired URL doesn't 404. A pre-existing redirect
  // for this path is acceptable (URL still covered) — ignore unique violations.
  if (existing.slug) {
    await supabase.from('news_redirects').insert({
      from_path: `/news/${existing.slug}`,
      to_path: redirectTarget,
      http_status: 301,
      reason: 'archive',
      news_id: id,
    })
  }

  revalidatePath('/admin/news')
  revalidatePath('/news')
  revalidatePath(`/news/${existing.slug}`)
  return { success: true }
}

/**
 * Restore an archived article to published. Re-runs the readiness gate
 * (restoring == republishing). published_at is already retained, so it is not
 * re-stamped. Optionally removes the archive redirect so the live URL no longer
 * redirects away.
 */
export async function restoreNews(
  id: string,
  removeArchiveRedirect = true
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const { data: existing, error: fetchError } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  const { ok, errors } = validateNewsForPublish(existing)
  if (!ok) return { success: false, error: formatErrors(errors) }

  const { error, data } = await supabase
    .from('news')
    .update({ status: 'published' }) // published_at retained
    .eq('id', id)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'กู้คืนไม่สำเร็จ คุณอาจไม่มีสิทธิ์' }
  }

  if (removeArchiveRedirect && existing.slug) {
    // Best-effort: removing the archive redirect is a convenience, not a
    // correctness requirement. Ignore errors — the article is already live.
    await supabase
      .from('news_redirects')
      .delete()
      .eq('from_path', `/news/${existing.slug}`)
  }

  revalidatePath('/admin/news')
  revalidatePath('/news')
  revalidatePath(`/news/${existing.slug}`)
  return { success: true }
}

// ─── READS ──────────────────────────────────────────────────────────────────

/**
 * Fetch a single news article by id (admin view: returns all statuses — RLS
 * gives admins full visibility, needed for editing drafts).
 */
export async function getNewsById(id: string) {
  const { supabase } = await requirePermission('content.read')
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('getNewsById error:', error)
    return null
  }
  return data
}

/**
 * Fetch a single news article by slug (admin view: returns all statuses, used
 * by the editor / duplicate-slug check). The PUBLIC slug fetch (anon client,
 * published-only) lives in the public route handler, not here.
 */
export async function getNewsBySlug(slug: string) {
  const { supabase } = await requirePermission('content.read')
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('getNewsBySlug error:', error)
    return null
  }
  return data
}

/**
 * Search packages/summaries for the related-content picker. This is the ONLY
 * list-shaped action: the main admin list page fetches directly (a Server
 * Component), like promotions/users/summaries. Returns { data, count };
 * totalPages is derived client-side (matches fetchQuestionsForPicker).
 *
 * Pagination is offset-based with count: 'exact' — the existing convention.
 */
export async function listNews(
  params: {
    q?: string
    type?: 'package' | 'summary'
    page?: number
    limit?: number
  } = {}
): Promise<{ data: any[]; count: number | null }> {
  const { supabase } = await requirePermission('content.read')

  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50)
  const page = Math.max(params.page ?? 1, 1)
  const from = (page - 1) * limit
  const to = from + limit - 1

  // Search the right table based on type. Empty q returns the first page of
  // items so the picker has something to show immediately.
  const isSummary = params.type === 'summary'
  const table = isSummary ? 'summaries' : 'packages'
  const labelColumn = isSummary ? 'title' : 'name'
  const selectCols = isSummary
    ? 'id, slug, title, topic'
    : 'id, slug, name, description, cover_image_url, logo_url'

  let query = supabase.from(table).select(selectCols, { count: 'exact' })

  if (params.q && params.q.trim()) {
    // ilike for case-insensitive contains; packages.name / summaries.title
    query = query.ilike(labelColumn, `%${params.q.trim()}%`)
  }

  query = query.order(labelColumn, { ascending: true }).range(from, to)

  const { data, error, count } = await query
  if (error) {
    console.error('listNews picker error:', error)
    return { data: [], count: null }
  }

  const normalized = (data || []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    name: isSummary ? row.title : row.name,
    title: isSummary ? row.title : row.name,
    description: isSummary ? row.topic : row.description,
    excerpt: isSummary ? row.topic : row.description,
    cover_image_url: row.cover_image_url || row.logo_url || null,
  }))

  return { data: normalized, count }
}

// ─── RELATIONS ──────────────────────────────────────────────────────────────

/**
 * Replace the related packages + summaries for a news article (delete-then-
 * insert, mirroring exam_set_questions). Non-atomic: if the insert fails after
 * the delete, relations are lost (RLS is the safety net, as in exam-sets).
 * Cardinality is bounded by MAX_RELATED_ITEMS (enforced in coerceRelations).
 */
export async function updateRelations(
  id: string,
  packages: unknown,
  summaries: unknown
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  // Verify the parent exists + is RLS-visible before touching junctions.
  const { data: existing, error: fetchError } = await supabase
    .from('news')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { success: false, error: fetchError.message }
  if (!existing) return { success: false, error: 'ไม่พบบทความ หรือคุณไม่มีสิทธิ์' }

  const pkgRows = coerceRelations(packages)
  const sumRows = coerceRelations(summaries)

  // --- packages junction: full replace
  const { error: delPkgError } = await supabase
    .from('news_packages')
    .delete()
    .eq('news_id', id)
  if (delPkgError) return { success: false, error: delPkgError.message }

  if (pkgRows.length > 0) {
    const rows = pkgRows.map((r) => ({ news_id: id, package_id: r.id, sort_order: r.sort_order }))
    const { error: insPkgError, data: insPkgData } = await supabase
      .from('news_packages')
      .insert(rows)
      .select('news_id')
    if (insPkgError) return { success: false, error: insPkgError.message }
    if (!insPkgData || insPkgData.length !== rows.length) {
      return { success: false, error: 'ลิงก์แพ็กเกจไม่ครบ คุณอาจไม่มีสิทธิ์' }
    }
  }

  // --- summaries junction: full replace
  const { error: delSumError } = await supabase
    .from('news_summaries')
    .delete()
    .eq('news_id', id)
  if (delSumError) return { success: false, error: delSumError.message }

  if (sumRows.length > 0) {
    const rows = sumRows.map((r) => ({ news_id: id, summary_id: r.id, sort_order: r.sort_order }))
    const { error: insSumError, data: insSumData } = await supabase
      .from('news_summaries')
      .insert(rows)
      .select('news_id')
    if (insSumError) return { success: false, error: insSumError.message }
    if (!insSumData || insSumData.length !== rows.length) {
      return { success: false, error: 'ลิงก์สรุปไม่ครบ คุณอาจไม่มีสิทธิ์' }
    }
  }

  revalidatePath(`/news/${existing.slug}`)
  return { success: true }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Build the insert/update payload from a validated NewsInput. Strips lifecycle
 * fields (status/published_at) — updateNews must never touch those. For create
 * we force status='draft' server-side regardless of client input.
 *
 * Slug handling: if the validated slug is blank, generate from title (Thai
 * preserved). This is the packages convention.
 */
function toInsertPayload(input: NewsInput, isCreate: boolean): Record<string, unknown> & { id?: string } {
  let slug = input.slug
  if (!slug) slug = generateSlug(input.title)

  const payload: Record<string, unknown> = {
    slug,
    title: input.title,
    excerpt: input.excerpt,
    body_markdown: input.body_markdown,
    cover_image_url: input.cover_image_url,
    cover_image_alt: input.cover_image_alt,
    category: input.category,
    tags: input.tags,
    author_id: input.author_id,
    source_name: input.source_name,
    source_url: input.source_url,
    source_date: input.source_date,
    seo_title: input.seo_title,
    seo_description: input.seo_description,
    canonical_url: input.canonical_url,
    og_image_url: input.og_image_url,
    // CTA box config (JSONB). cleanCtaConfig in lib/news.ts already coerced
    // this to a CtaConfig | null, so persist it verbatim — null preserves the
    // legacy "no CTA" state for rows whose cta_config was cleared.
    cta_config: input.cta_config ?? null,
    // ภาค ก. requirement — always a legal tri-state value after coercion.
    gp_exam_requirement: input.gp_exam_requirement,
    // Application deadline & homepage pinning (Task 3)
    application_deadline: input.application_deadline,
    homepage_featured: input.homepage_featured,
    homepage_featured_order: input.homepage_featured_order,
    hide_from_homepage_when_expired: input.hide_from_homepage_when_expired,
    // Affiliate rail wiring (migration 085). Already strictly coerced
    // (boolean + uuid-or-null) by the shared lib contract; null preserves
    // "no collection" for legacy/cleared rows.
    affiliate_enabled: input.affiliate_enabled,
    affiliate_collection_id: input.affiliate_collection_id,
  }

  if (isCreate) {
    payload.id = crypto.randomUUID()
    payload.status = 'draft'
    payload.published_at = null
  }

  return payload
}

function formatErrors(errors: Record<string, string>): string {
  return Object.values(errors).join(' • ')
}

/** Detect Supabase/Postgres unique-violation errors (code 23505). */
function isUniqueViolation(error: any): boolean {
  return (
    error?.code === '23505' ||
    /duplicate key value|already exists|unique/i.test(error?.message || '')
  )
}
