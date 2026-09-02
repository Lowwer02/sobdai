'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { isSummaryBankCompatibilityWriterError } from '@/lib/application/knowledge-platform'
import { createSummaryBankCompatibilityWriter } from '@/lib/infrastructure/knowledge-platform'
import {
  assertPackageIdsAvailable,
  buildCreateSelection,
  buildEditSelection,
  buildSummaryRevalidationPaths,
  deriveSummaryKind,
  hydrateCurrentPackageIds,
  requiredSummaryIdentifier,
  shouldRepublishEditedSummary,
  stripEditPublicationState,
  type AdminSummaryKind,
} from './summary-action-logic'
import {
  dispatchSummaryPublication,
  resolveSummaryPublicationState,
} from './summary-publication-dispatch'

import { revalidatePath } from 'next/cache'

type AdminSupabase = Awaited<ReturnType<typeof requirePermission>>['supabase']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to save Summary.'
}

async function validatePackageIds(
  supabase: AdminSupabase,
  packageIds: readonly string[],
): Promise<void> {
  const { data, error } = await supabase
    .from('packages')
    .select('id')
    .in('id', [...packageIds])

  if (error || !Array.isArray(data)) {
    throw new Error('Package selection could not be validated safely.')
  }

  assertPackageIdsAvailable(
    packageIds,
    data.map((row: { id?: unknown }) => row.id),
  )
}

async function resolveSummaryForEdit(
  supabase: AdminSupabase,
  summaryId: unknown,
): Promise<{
  readonly id: string
  readonly summary_code: unknown
  readonly package_id: unknown
  readonly slug: unknown
  /** Server-resolved pre-edit publication state; never client-supplied. */
  readonly wasPublished: boolean
}> {
  const resolvedSummaryId = requiredSummaryIdentifier(summaryId, 'summaryId')
  const { data, error } = await supabase
    .from('summaries')
    .select('id, summary_code, package_id, slug, is_published')
    .eq('id', resolvedSummaryId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Summary state could not be resolved safely.')
  }

  const resolvedId = requiredSummaryIdentifier(data.id, 'summary.id')
  if (resolvedId !== resolvedSummaryId) {
    throw new Error('Summary state could not be resolved safely.')
  }

  // Resolve the discriminator here, before any client-supplied edit shape is
  // considered. The returned kind is intentionally not accepted from the UI.
  deriveSummaryKind(data.summary_code)

  return {
    id: resolvedId,
    summary_code: data.summary_code,
    package_id: data.package_id,
    slug: data.slug,
    wasPublished: data.is_published === true,
  }
}

async function resolveSummaryForPublication(
  supabase: AdminSupabase,
  summaryId: unknown,
): Promise<{
  readonly id: string
  readonly summary_code: unknown
  readonly package_id: unknown
  readonly slug: unknown
}> {
  const resolvedSummaryId = requiredSummaryIdentifier(summaryId, 'summaryId')
  const { data, error } = await supabase
    .from('summaries')
    .select('id, summary_code, package_id, slug')
    .eq('id', resolvedSummaryId)
    .maybeSingle()

  if (error) {
    throw new Error('Summary state could not be resolved safely.')
  }

  const summary = resolveSummaryPublicationState(data)
  const resolvedId = summary.id
  if (resolvedId !== resolvedSummaryId) {
    throw new Error('Summary state could not be resolved safely.')
  }

  const record = data as Record<string, unknown>
  return {
    id: resolvedId,
    summary_code: summary.summary_code,
    package_id: record.package_id,
    slug: record.slug,
  }
}

async function readCurrentPackageIds(
  supabase: AdminSupabase,
  summaryId: string,
  summaryKind: AdminSummaryKind,
  summaryPackageId: unknown,
): Promise<readonly string[]> {
  if (summaryKind === 'legacy') {
    return hydrateCurrentPackageIds('legacy', summaryPackageId, [])
  }

  const { data, error } = await supabase
    .from('package_summaries')
    .select('package_id')
    .eq('summary_id', summaryId)

  if (error || !Array.isArray(data)) {
    throw new Error('Current Summary Package memberships could not be loaded safely.')
  }

  // Deliberately read every membership row. Membership selection is not
  // filtered by any internal compatibility flag.
  return hydrateCurrentPackageIds('kp_native', summaryPackageId, data)
}

interface RevalidationPackageRow {
  readonly slug?: unknown
}

/**
 * Best-effort Package slug resolution for public route invalidation. A lookup
 * failure must never fail an already-committed mutation, so it degrades to an
 * empty result and the caller falls back to layout-level invalidation.
 */
async function resolveRevalidationPackages(
  supabase: AdminSupabase,
  packageIds: readonly string[],
): Promise<readonly RevalidationPackageRow[]> {
  if (packageIds.length === 0) return []
  try {
    const { data, error } = await supabase
      .from('packages')
      .select('id, slug')
      .in('id', [...new Set(packageIds)])

    if (error || !Array.isArray(data)) return []
    return data as readonly RevalidationPackageRow[]
  } catch {
    return []
  }
}

async function revalidateSummaryPackages(
  supabase: AdminSupabase,
  packageIds: readonly string[],
  summarySlugs: readonly unknown[],
): Promise<void> {
  revalidatePath('/admin/summaries')

  const packages = await resolveRevalidationPackages(supabase, packageIds)
  const paths = buildSummaryRevalidationPaths(packages, summarySlugs)
  if (paths.length === 0) {
    // Without resolved slugs no targeted route can be addressed, so fall back
    // to the layout-level Package invalidation (same hammer the support and
    // social-follow admin actions use) and let every Package page re-render.
    revalidatePath('/package', 'layout')
    return
  }
  for (const path of paths) {
    revalidatePath(path)
  }
}

export async function createSummary(data: unknown) {
  try {
    const { user, supabase } = await requirePermission('content.write')
    const selection = buildCreateSelection(data)
    await validatePackageIds(supabase, selection.packageIds)

    const input = data as Record<string, unknown>
    const writer = createSummaryBankCompatibilityWriter()
    const result = await writer.create({
      actorId: user.id,
      packageId: selection.packageId,
      packageIds: selection.packageIds,
      title: input.title as string,
      slug: input.slug as string,
      subject: input.subject as string | null | undefined,
      document: input.document as string | null | undefined,
      law: input.law as string | null | undefined,
      topic: input.topic as string | null | undefined,
      contentMd: input.content_md as string,
      sortOrder: input.sort_order as number | string | null | undefined,
      displayOrder: input.display_order as number | string | null | undefined,
      isPublished: input.is_published as boolean,
    })

    revalidateSummaryPackages(supabase, selection.packageIds, [input.slug])
    return { success: true, id: result.summaryId }
  } catch (err: unknown) {
    if (isSummaryBankCompatibilityWriterError(err) && err.code === 'duplicate_legacy_slug') {
      return { success: false, error: 'Slug already exists in this package.' }
    }
    return { success: false, error: errorMessage(err) }
  }
}

export async function updateSummary(id: string, data: unknown) {
  try {
    const { user, supabase } = await requirePermission('content.write')
    const summary = await resolveSummaryForEdit(supabase, id)
    const selection = buildEditSelection(summary, data)
    const currentPackageIds = await readCurrentPackageIds(
      supabase,
      summary.id,
      selection.summaryKind,
      summary.package_id,
    )
    const packageIdsToValidate = selection.packageIds ?? [selection.packageId]
    await validatePackageIds(supabase, packageIdsToValidate)

    // Edit is deliberately content/membership-only. Publication state is
    // owned by the separate Publish/Unpublish action and is stripped here at
    // the server boundary even if an older client submits the field.
    const input = stripEditPublicationState(data)
    const writer = createSummaryBankCompatibilityWriter()
    const commonUpdate = {
      actorId: user.id,
      summaryId: summary.id,
      packageId: selection.packageId,
      title: input.title as string,
      slug: input.slug as string,
      subject: input.subject as string | null | undefined,
      document: input.document as string | null | undefined,
      law: input.law as string | null | undefined,
      topic: input.topic as string | null | undefined,
      contentMd: input.content_md as string,
      sortOrder: input.sort_order as number | string | null | undefined,
      displayOrder: input.display_order as number | string | null | undefined,
    }
    if (selection.summaryKind === 'legacy') {
      await writer.update({
        ...commonUpdate,
        summaryKind: 'legacy',
        packageIds: null,
      })
    } else {
      await writer.update({
        ...commonUpdate,
        summaryKind: 'kp_native',
        packageIds: selection.packageIds,
      })

      // Public Package reads render only the current published revision, so a
      // saved edit of a published KP-native Summary would otherwise never
      // reach the public title/content. Promote the revision the edit just
      // wrote through the same central publication dispatch the Publish
      // control uses; the Summary stays published the whole time and Draft
      // Summaries are left untouched.
      if (shouldRepublishEditedSummary(selection.summaryKind, summary.wasPublished)) {
        try {
          await dispatchSummaryPublication({
            summary,
            actorId: user.id,
            isPublished: true,
            writer,
          })
        } catch (publishError) {
          // The edit itself is committed; report honestly instead of letting
          // the admin believe the public pages already show the new content.
          return {
            success: false,
            error: 'Summary saved, but publishing the updated revision failed. '
              + `Retry saving or use Publish: ${errorMessage(publishError)}`,
          }
        }
      }
    }

    // Old and new memberships plus the old and new Summary slug: a save can
    // move the Summary between Packages and rename its slug at once, so
    // removed/added Package pages cannot stay stale either.
    await revalidateSummaryPackages(
      supabase,
      [...new Set([...currentPackageIds, ...packageIdsToValidate])],
      [summary.slug, input.slug],
    )
    return { success: true }
  } catch (err: unknown) {
    if (isSummaryBankCompatibilityWriterError(err) && err.code === 'duplicate_legacy_slug') {
      return { success: false, error: 'Slug already exists in this package.' }
    }
    return { success: false, error: errorMessage(err) }
  }
}

export async function deleteSummary(id: string) {
  try {
    const { user } = await requirePermission('content.delete')
    const writer = createSummaryBankCompatibilityWriter()
    const result = await writer.delete({
      actorId: user.id,
      summaryId: id,
    })

    revalidatePath('/admin/summaries')
    return { success: true, outcome: result.outcome }
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) }
  }
}

export async function toggleSummaryPublish(id: string, isPublished: boolean) {
  try {
    const { user, supabase } = await requirePermission('content.publish')
    const summary = await resolveSummaryForPublication(supabase, id)
    const summaryKind = deriveSummaryKind(summary.summary_code)
    const writer = createSummaryBankCompatibilityWriter()
    const result = await dispatchSummaryPublication({
      summary,
      actorId: user.id,
      isPublished,
      writer,
    })

    // Publication moves a Summary in or out of every Package page that lists
    // it, so those public routes must be invalidated like an edit is.
    const affectedPackageIds = await readCurrentPackageIds(
      supabase,
      summary.id,
      summaryKind,
      summary.package_id,
    )
    await revalidateSummaryPackages(supabase, affectedPackageIds, [summary.slug])
    return {
      success: true,
      outcome: result.outcome,
      idempotentRetry: result.idempotentRetry,
    }
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) }
  }
}
