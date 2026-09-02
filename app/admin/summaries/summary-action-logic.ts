export type AdminSummaryKind = 'legacy' | 'kp_native'

export interface SummaryMembershipRow {
  readonly package_id: unknown
}

export type SummaryEditSelection =
  | {
      readonly summaryKind: 'legacy'
      readonly packageId: string
      readonly packageIds: null
    }
  | {
      readonly summaryKind: 'kp_native'
      readonly packageId: string
      readonly packageIds: readonly string[]
    }

export class SummaryActionValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'SummaryActionValidationError'
  }
}

function invalid(message: string): never {
  throw new SummaryActionValidationError(message)
}

export function asSummaryActionRecord(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('Summary input is invalid.')
  }
  return value as Readonly<Record<string, unknown>>
}

/**
 * Publication is intentionally not part of the ordinary Summary Edit
 * contract. Keep an accidentally submitted legacy field out of the writer
 * payload so Edit cannot look like a publication mutation.
 */
export function stripEditPublicationState(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const input = asSummaryActionRecord(value)
  const { is_published: _ignoredPublicationState, ...editableInput } = input
  return editableInput
}

export function requiredSummaryIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return invalid(`${field} is required.`)
  }
  return value.trim()
}

export function deriveSummaryKind(summaryCode: unknown): AdminSummaryKind {
  if (summaryCode === null) return 'legacy'
  if (typeof summaryCode === 'string' && summaryCode.trim() !== '') {
    return 'kp_native'
  }
  return invalid('Summary state could not be resolved safely.')
}

export function normalizePackageIds(
  value: unknown,
  field = 'packageIds',
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return invalid(`${field} must contain at least one Package.`)
  }

  const packageIds = value.map((packageId, index) =>
    requiredSummaryIdentifier(packageId, `${field}[${index}]`),
  )
  if (new Set(packageIds).size !== packageIds.length) {
    return invalid(`${field} cannot contain duplicates.`)
  }
  return packageIds
}

export function hydrateCurrentPackageIds(
  summaryKind: AdminSummaryKind,
  summaryPackageId: unknown,
  memberships: readonly SummaryMembershipRow[],
): string[] {
  if (summaryKind === 'legacy') {
    return [requiredSummaryIdentifier(summaryPackageId, 'package_id')]
  }

  return normalizePackageIds(
    memberships.map((membership, index) =>
      requiredSummaryIdentifier(membership.package_id, `membership[${index}].package_id`),
    ),
    'current Package memberships',
  )
}

export function assertPackageIdsAvailable(
  packageIds: readonly string[],
  availablePackageIds: readonly unknown[],
): void {
  const available = new Set(
    availablePackageIds.map((packageId, index) =>
      requiredSummaryIdentifier(packageId, `availablePackageIds[${index}]`),
    ),
  )
  const missing = packageIds.filter((packageId) => !available.has(packageId))
  if (missing.length > 0) {
    return invalid('One or more selected Packages are no longer available.')
  }
}

export function buildCreateSelection(data: unknown): {
  readonly summaryKind: 'kp_native'
  readonly packageId: string
  readonly packageIds: readonly string[]
} {
  const input = asSummaryActionRecord(data)
  const packageIds = normalizePackageIds(input.packageIds)
  return {
    summaryKind: 'kp_native',
    packageId: packageIds[0]!,
    packageIds,
  }
}

export function buildEditSelection(
  summary: { readonly summary_code: unknown; readonly package_id: unknown },
  data: unknown,
): SummaryEditSelection {
  const input = asSummaryActionRecord(data)
  const summaryKind = deriveSummaryKind(summary.summary_code)
  const existingPackageId = requiredSummaryIdentifier(summary.package_id, 'package_id')

  if (summaryKind === 'legacy') {
    if (input.packageIds !== undefined && input.packageIds !== null) {
      return invalid('Legacy edits do not accept a multi-Package selection.')
    }
    const packageId = requiredSummaryIdentifier(input.package_id, 'package_id')
    if (packageId !== existingPackageId) {
      return invalid('Legacy edits must keep their existing Package.')
    }
    return {
      summaryKind,
      packageId,
      packageIds: null,
    }
  }

  const packageIds = normalizePackageIds(input.packageIds)
  return {
    summaryKind,
    packageId: packageIds[0]!,
    packageIds,
  }
}

export interface SummaryRevalidationPackage {
  readonly slug?: unknown
}

function nonEmptySlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Public Package routes are addressed by Package slug, never by Package ID.
 * One save can move a Summary between Packages and rename its slug at the
 * same time, so every old/new Package slug crossed with every old/new
 * Summary slug is invalidated. Paths that never existed are harmless no-ops.
 */
export function buildSummaryRevalidationPaths(
  packages: readonly SummaryRevalidationPackage[],
  summarySlugs: readonly unknown[],
): string[] {
  const paths = new Set<string>()
  const routeSlugs = summarySlugs
    .map((summarySlug) => nonEmptySlug(summarySlug))
    .filter((summarySlug): summarySlug is string => summarySlug !== null)

  for (const pkg of packages) {
    const packageSlug = nonEmptySlug(pkg?.slug)
    if (!packageSlug) continue
    paths.add(`/package/${packageSlug}`)
    for (const summarySlug of routeSlugs) {
      paths.add(`/package/${packageSlug}/summary/${summarySlug}`)
    }
  }

  return [...paths]
}

/**
 * Public Package reads render only the current published revision of a
 * KP-native Summary, so an edit reaches the public title/content only after
 * the edited revision is promoted. Published KP-native edits therefore go
 * live on save through the same publication RPC as the Publish control —
 * matching Legacy edits, which already update their public fields in place.
 * Draft Summaries must stay drafts.
 */
export function shouldRepublishEditedSummary(
  summaryKind: AdminSummaryKind,
  wasPublished: boolean,
): boolean {
  return summaryKind === 'kp_native' && wasPublished
}
