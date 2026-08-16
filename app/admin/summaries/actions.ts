'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { isSummaryBankCompatibilityWriterError } from '@/lib/application/knowledge-platform'
import { createSummaryBankCompatibilityWriter } from '@/lib/infrastructure/knowledge-platform'
import {
  assertPackageIdsAvailable,
  buildCreateSelection,
  buildEditSelection,
  deriveSummaryKind,
  hydrateCurrentPackageIds,
  requiredSummaryIdentifier,
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
}> {
  const resolvedSummaryId = requiredSummaryIdentifier(summaryId, 'summaryId')
  const { data, error } = await supabase
    .from('summaries')
    .select('id, summary_code, package_id')
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
  }
}

async function resolveSummaryForPublication(
  supabase: AdminSupabase,
  summaryId: unknown,
): Promise<{
  readonly id: string
  readonly summary_code: unknown
}> {
  const resolvedSummaryId = requiredSummaryIdentifier(summaryId, 'summaryId')
  const { data, error } = await supabase
    .from('summaries')
    .select('id, summary_code')
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

  return summary
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

function revalidateSummaryPackages(
  packageIds: readonly string[],
  slug: unknown,
): void {
  revalidatePath('/admin/summaries')

  const normalizedSlug = typeof slug === 'string' ? slug : ''
  for (const packageId of new Set(packageIds)) {
    revalidatePath(`/package/${packageId}`)
    if (normalizedSlug !== '') {
      revalidatePath(`/package/${packageId}/summary/${normalizedSlug}`)
    }
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

    revalidateSummaryPackages(selection.packageIds, input.slug)
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
    }

    revalidateSummaryPackages(
      [...new Set([...currentPackageIds, ...packageIdsToValidate])],
      input.slug,
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
    const writer = createSummaryBankCompatibilityWriter()
    const result = await dispatchSummaryPublication({
      summary,
      actorId: user.id,
      isPublished,
      writer,
    })

    revalidatePath('/admin/summaries')
    return {
      success: true,
      outcome: result.outcome,
      idempotentRetry: result.idempotentRetry,
    }
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) }
  }
}
