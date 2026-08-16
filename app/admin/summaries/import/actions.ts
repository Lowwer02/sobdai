'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { isSummaryBankCompatibilityWriterError } from '@/lib/application/knowledge-platform'
import { routeSummaryImport } from '@/lib/application/knowledge-platform/summary-import-routing'
import { createSummaryBankCompatibilityWriter } from '@/lib/infrastructure/knowledge-platform'

import { revalidatePath } from 'next/cache'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Summary import failed.'
}

export async function validateSummaryImport(metadata: any) {
  try {
    await requirePermission('content.write')
    const writer = createSummaryBankCompatibilityWriter()
    const pkg = await writer.resolvePackage({
      reference: metadata.package_ref,
      referenceType: metadata.package_ref_type,
    })

    if (!pkg) {
      return { success: false, error: `Package not found: ${metadata.package_ref}` }
    }

    const isDuplicate = await writer.isCompatibilityLegacySlugOccupied({
      packageId: pkg.packageId,
      legacySlug: metadata.slug,
    })

    return {
      success: true,
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      isDuplicate,
      resolvedBy: pkg.resolvedBy,
    }
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) }
  }
}

export async function commitSummaryImport(data: any, conflictResolution: 'replace' | 'new') {
  try {
    const { user } = await requirePermission('content.write')
    const writer = createSummaryBankCompatibilityWriter()
    return await routeSummaryImport({
      data,
      actorId: user.id,
      conflictResolution,
      writer,
      revalidatePath,
    })
  } catch (err: unknown) {
    if (isSummaryBankCompatibilityWriterError(err) && err.code === 'duplicate_legacy_slug') {
      return { success: false, error: 'Slug already exists in this package.' }
    }
    return { success: false, error: errorMessage(err) }
  }
}
