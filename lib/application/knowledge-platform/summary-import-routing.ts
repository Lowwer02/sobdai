import type {
  SummaryBankCompatibilityPackageLookupResult,
  SummaryBankCompatibilityWriter,
} from './summary-bank-compatibility-writer'

export type SummaryImportConflictResolution = 'replace' | 'new'

export type SummaryImportRoutingWriter = Pick<
  SummaryBankCompatibilityWriter,
  | 'resolvePackage'
  | 'isCompatibilityLegacySlugOccupied'
  | 'allocateImportLegacySlug'
  | 'create'
  | 'replace'
>

export interface SummaryImportRoutingInput {
  readonly data: any
  readonly actorId: string
  readonly conflictResolution: SummaryImportConflictResolution
  readonly writer: SummaryImportRoutingWriter
  readonly revalidatePath: (path: string) => void
}

export type SummaryImportRoutingResult =
  | { readonly success: true; readonly finalSlug: string }
  | { readonly success: false; readonly error: string }

export async function routeSummaryImport(
  input: SummaryImportRoutingInput,
): Promise<SummaryImportRoutingResult> {
  const { data, writer } = input
  const pkg: SummaryBankCompatibilityPackageLookupResult | null =
    await writer.resolvePackage({
      reference: data.package_ref,
      referenceType: data.package_ref_type,
    })

  if (!pkg) {
    return { success: false, error: `Package not found: ${data.package_ref}` }
  }

  const isDuplicate = await writer.isCompatibilityLegacySlugOccupied({
    packageId: pkg.packageId,
    legacySlug: data.slug,
  })

  // The package-local discriminator-aware lookup is authoritative. It covers
  // the Legacy root and every KP Package membership; a stale/default client
  // value must never turn a genuinely new import into a replacement.
  if (!isDuplicate || input.conflictResolution === 'new') {
    const finalSlug = await writer.allocateImportLegacySlug({
      packageId: pkg.packageId,
      legacySlug: data.slug,
    })
    const result = await writer.create({
      actorId: input.actorId,
      packageId: pkg.packageId,
      title: data.title,
      slug: finalSlug,
      subject: data.subject,
      document: data.document,
      law: data.law,
      topic: data.topic,
      contentMd: data.content_md,
      sortOrder: data.sort,
      isPublished: data.published,
    })

    input.revalidatePath('/admin/summaries')
    input.revalidatePath(`/package/${pkg.packageId}`)
    return {
      success: true,
      finalSlug: result.legacySlug,
    }
  }

  if (input.conflictResolution !== 'replace') {
    return { success: false, error: 'Invalid import conflict resolution.' }
  }

  const result = await writer.replace({
    actorId: input.actorId,
    packageId: pkg.packageId,
    title: data.title,
    slug: data.slug,
    subject: data.subject,
    document: data.document,
    law: data.law,
    topic: data.topic,
    contentMd: data.content_md,
    sortOrder: data.sort,
    isPublished: data.published,
  })

  input.revalidatePath('/admin/summaries')
  input.revalidatePath(`/package/${pkg.packageId}`)
  return { success: true, finalSlug: result.legacySlug }
}
