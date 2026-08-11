import type { UUID } from './contracts'

export const SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION =
  'summary-whitespace-200wpm-v1' as const
export const SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION =
  'summary-markdown-v1' as const
export const SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE =
  'Initial Summary Bank draft' as const
export const SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE =
  'Summary Bank compatibility edit' as const
export const SUMMARY_BANK_COMPATIBILITY_IMPORT_REPLACE_CHANGE_NOTE =
  'Summary Bank compatibility import replace' as const

export const SUMMARY_BANK_COMPATIBILITY_IMPORT_SLUG_SUFFIX_LIMIT = 1_000 as const

export type SummaryBankCompatibilityPackageReferenceType =
  | 'slug'
  | 'code'
  | 'ambiguous'

export interface SummaryBankCompatibilityPackageLookupInput {
  readonly reference: string
  readonly referenceType?: SummaryBankCompatibilityPackageReferenceType
}

export interface SummaryBankCompatibilityPackageLookupResult {
  readonly packageId: UUID
  readonly packageName: string
  readonly resolvedBy: 'slug' | 'code'
}

export interface SummaryBankCompatibilityImportSlugLookupInput {
  readonly packageId: UUID
  readonly legacySlug: string
}

export interface SummaryBankCompatibilityImportPlacementLookupResult {
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityImportReplacementTarget {
  readonly summaryId: UUID
  readonly replacementVersionId: UUID | null
}

export interface SummaryBankCompatibilityCreateInput {
  readonly actorId: UUID
  readonly packageId: UUID
  readonly title: string
  readonly slug: string
  readonly subject?: string | null
  readonly document?: string | null
  readonly law?: string | null
  readonly topic?: string | null
  readonly contentMd: string
  readonly sortOrder?: number | string | null
  readonly displayOrder?: number | string | null
  readonly navigationLabel?: string | null
  readonly isPublished: boolean
}

export interface SummaryBankCompatibilityEditInput {
  readonly actorId: UUID
  readonly summaryId: UUID
  readonly packageId: UUID
  readonly title: string
  readonly slug: string
  readonly subject?: string | null
  readonly document?: string | null
  readonly law?: string | null
  readonly topic?: string | null
  readonly contentMd: string
  readonly sortOrder?: number | string | null
  readonly displayOrder?: number | string | null
  readonly navigationLabel?: string | null
}

export interface SummaryBankCompatibilityMetadata {
  readonly contentChecksum: string
  readonly readTimeMinutes: number
  readonly readTimePolicyVersion: typeof SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION
  readonly contentSchemaVersion: typeof SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION
}

export interface SummaryBankCompatibilityCreatePersistenceCommand
  extends SummaryBankCompatibilityMetadata {
  readonly summaryId: UUID
  readonly versionId: UUID
  readonly summaryCode: string
  readonly canonicalSlug: string
  readonly packageId: UUID
  readonly legacySlug: string
  readonly title: string
  readonly subject: string | null
  readonly document: string | null
  readonly law: string | null
  readonly topic: string | null
  readonly contentMd: string
  readonly sortOrder: number | null
  readonly displayOrder: number | null
  readonly navigationLabel: string | null
  readonly actorId: UUID
  readonly isPublished: boolean
  readonly changeNote: typeof SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE
}

export interface SummaryBankCompatibilityEditPersistenceCommand
  extends SummaryBankCompatibilityMetadata {
  readonly summaryId: UUID
  readonly packageId: UUID
  readonly legacySlug: string
  readonly title: string
  readonly subject: string | null
  readonly document: string | null
  readonly law: string | null
  readonly topic: string | null
  readonly contentMd: string
  readonly sortOrder: number | null
  readonly displayOrder: number | null
  readonly navigationLabel: string | null
  readonly actorId: UUID
  readonly changeNote: typeof SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE
}

export interface SummaryBankCompatibilityReplaceInput {
  readonly actorId: UUID
  readonly packageId: UUID
  readonly title: string
  readonly slug: string
  readonly subject?: string | null
  readonly document?: string | null
  readonly law?: string | null
  readonly topic?: string | null
  readonly contentMd: string
  readonly sortOrder?: number | string | null
  readonly displayOrder?: number | string | null
  readonly isPublished: boolean
}

export interface SummaryBankCompatibilityReplacePersistenceCommand
  extends SummaryBankCompatibilityMetadata {
  readonly summaryId: UUID
  readonly packageId: UUID
  readonly legacySlug: string
  readonly replacementVersionId: UUID
  readonly title: string
  readonly subject: string | null
  readonly document: string | null
  readonly law: string | null
  readonly topic: string | null
  readonly contentMd: string
  readonly sortOrder: number | null
  readonly displayOrder: number | null
  readonly actorId: UUID
  readonly isPublished: boolean
  readonly changeNote: typeof SUMMARY_BANK_COMPATIBILITY_IMPORT_REPLACE_CHANGE_NOTE
}

export interface SummaryBankCompatibilityCreatePersistenceResult {
  readonly summaryId: UUID
  readonly summaryVersionId: UUID
  readonly packageId: UUID
  readonly legacySlug: string
  readonly isPublished: boolean
  readonly idempotentRetry: boolean
}

export interface SummaryBankCompatibilityEditPersistenceResult {
  readonly summaryId: UUID
  readonly summaryVersionId: UUID
  readonly packageId: UUID
  readonly legacySlug: string
  readonly revisionCreated: boolean
  readonly packageReassigned: boolean
}

export interface SummaryBankCompatibilityReplacePersistenceResult {
  readonly summaryId: UUID
  readonly summaryVersionId: UUID
  readonly packageId: UUID
  readonly legacySlug: string
  readonly isPublished: boolean
  readonly revisionCreated: boolean
  readonly idempotentRetry: boolean
}

export interface SummaryBankCompatibilityPublishInput {
  readonly actorId: UUID
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityUnpublishInput {
  readonly actorId: UUID
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityDeleteInput {
  readonly actorId: UUID
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityPublishPersistenceCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityUnpublishPersistenceCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityDeletePersistenceCommand {
  readonly actorId: UUID
  readonly summaryId: UUID
}

export interface SummaryBankCompatibilityPublishPersistenceResult {
  readonly summaryId: UUID
  readonly summaryVersionId: UUID
  readonly packageId: UUID
  readonly idempotentRetry: boolean
  readonly republished: boolean
}

export interface SummaryBankCompatibilityUnpublishPersistenceResult {
  readonly summaryId: UUID
  readonly summaryVersionId: UUID
  readonly packageId: UUID
  readonly idempotentRetry: boolean
}

export type SummaryBankCompatibilityDeleteOutcome = 'deleted' | 'archived'

export interface SummaryBankCompatibilityDeletePersistenceResult {
  readonly summaryId: UUID
  readonly outcome: SummaryBankCompatibilityDeleteOutcome
  readonly idempotentRetry: boolean
}

export interface SummaryBankCompatibilityPersistence {
  resolvePackage(
    input: SummaryBankCompatibilityPackageLookupInput
  ): Promise<SummaryBankCompatibilityPackageLookupResult | null>
  findCompatibilityByLegacySlug(
    input: SummaryBankCompatibilityImportSlugLookupInput
  ): Promise<SummaryBankCompatibilityImportPlacementLookupResult | null>
  resolveImportReplacementTarget(
    input: SummaryBankCompatibilityImportSlugLookupInput
  ): Promise<SummaryBankCompatibilityImportReplacementTarget | null>
  allocateSummaryCode(): Promise<string>
  canonicalSlugExists(candidate: string): Promise<boolean>
  create(
    command: SummaryBankCompatibilityCreatePersistenceCommand
  ): Promise<SummaryBankCompatibilityCreatePersistenceResult>
  update(
    command: SummaryBankCompatibilityEditPersistenceCommand
  ): Promise<SummaryBankCompatibilityEditPersistenceResult>
  replace(
    command: SummaryBankCompatibilityReplacePersistenceCommand
  ): Promise<SummaryBankCompatibilityReplacePersistenceResult>
  publish(
    command: SummaryBankCompatibilityPublishPersistenceCommand
  ): Promise<SummaryBankCompatibilityPublishPersistenceResult>
  unpublish(
    command: SummaryBankCompatibilityUnpublishPersistenceCommand
  ): Promise<SummaryBankCompatibilityUnpublishPersistenceResult>
  delete(
    command: SummaryBankCompatibilityDeletePersistenceCommand
  ): Promise<SummaryBankCompatibilityDeletePersistenceResult>
}

export interface SummaryBankCompatibilityCreateResult
  extends SummaryBankCompatibilityCreatePersistenceResult {
  readonly canonicalSlug: string
}

export interface SummaryBankCompatibilityEditResult
  extends SummaryBankCompatibilityEditPersistenceResult {}

export interface SummaryBankCompatibilityReplaceResult
  extends SummaryBankCompatibilityReplacePersistenceResult {}

export interface SummaryBankCompatibilityPublishResult
  extends SummaryBankCompatibilityPublishPersistenceResult {}

export interface SummaryBankCompatibilityUnpublishResult
  extends SummaryBankCompatibilityUnpublishPersistenceResult {}

export interface SummaryBankCompatibilityDeleteResult
  extends SummaryBankCompatibilityDeletePersistenceResult {}

export type SummaryBankCompatibilityWriterErrorCode =
  | 'invalid_input'
  | 'invalid_allocator_result'
  | 'canonical_slug_conflict'
  | 'duplicate_legacy_slug'
  | 'namespace_lookup_failed'
  | 'lookup_failed'
  | 'rpc_failed'
  | 'invalid_response'

export class SummaryBankCompatibilityWriterError extends Error {
  public readonly code: SummaryBankCompatibilityWriterErrorCode

  public constructor(
    code: SummaryBankCompatibilityWriterErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SummaryBankCompatibilityWriterError'
    this.code = code
  }
}

export function isSummaryBankCompatibilityWriterError(
  error: unknown,
): error is SummaryBankCompatibilityWriterError {
  return error instanceof SummaryBankCompatibilityWriterError
}

function invalidInput(message: string): never {
  throw new SummaryBankCompatibilityWriterError('invalid_input', message)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return invalidInput(`${field} is required.`)
  }
  return value
}

function requiredIdentifier(value: unknown, field: string): string {
  const identifier = requiredString(value, field)
  if (identifier.trim() === '') return invalidInput(`${field} is required.`)
  return identifier
}

function normalizeLegacySlug(value: unknown): string {
  const slug = requiredString(value, 'slug')
  const normalized = slug.trim().toLowerCase()
  if (normalized === '' || slug !== normalized) {
    return invalidInput('Slug must be lowercase and trimmed.')
  }
  return normalized
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function normalizeInteger(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null || value === '') return null

  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN

  if (!Number.isInteger(numberValue)) {
    return invalidInput(`${field} must be an integer.`)
  }
  return numberValue
}

function normalizeBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return invalidInput(`${field} must be a boolean.`)
}

function normalizePackageReferenceType(
  value: unknown,
): SummaryBankCompatibilityPackageReferenceType | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'slug' || value === 'code' || value === 'ambiguous') return value
  return invalidInput('Package reference type is invalid.')
}

function createUuid(): UUID {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_input',
      'The server does not provide a UUID allocator.',
    )
  }
  return globalThis.crypto.randomUUID()
}

export function calculateSummaryCompatibilityReadTimeMinutes(
  contentMd: string,
): number {
  const wordCount = contentMd.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(wordCount / 200))
}

export async function computeSummaryCompatibilityChecksum(
  contentMd: string,
): Promise<string> {
  if (typeof contentMd !== 'string') {
    return invalidInput('content_md is required.')
  }
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_input',
      'The server does not provide a SHA-256 implementation.',
    )
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(contentMd),
  )

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export async function prepareSummaryCompatibilityMetadata(
  contentMd: string,
): Promise<SummaryBankCompatibilityMetadata> {
  const content = requiredString(contentMd, 'content_md')
  return {
    contentChecksum: await computeSummaryCompatibilityChecksum(content),
    readTimeMinutes: calculateSummaryCompatibilityReadTimeMinutes(content),
    readTimePolicyVersion: SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION,
    contentSchemaVersion: SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION,
  }
}

function normalizeCommonFields(input: {
  readonly actorId: unknown
  readonly packageId: unknown
  readonly title: unknown
  readonly slug: unknown
  readonly subject?: unknown
  readonly document?: unknown
  readonly law?: unknown
  readonly topic?: unknown
  readonly contentMd: unknown
  readonly sortOrder?: unknown
  readonly displayOrder?: unknown
  readonly navigationLabel?: unknown
}) {
  const title = requiredString(input.title, 'title')
  if (title.trim() === '') return invalidInput('title is required.')

  return {
    actorId: requiredIdentifier(input.actorId, 'actorId'),
    packageId: requiredIdentifier(input.packageId, 'packageId'),
    title,
    slug: normalizeLegacySlug(input.slug),
    subject: optionalText(input.subject),
    document: optionalText(input.document),
    law: optionalText(input.law),
    topic: optionalText(input.topic),
    contentMd: requiredString(input.contentMd, 'content_md'),
    sortOrder: normalizeInteger(input.sortOrder, 'sort_order'),
    displayOrder: normalizeInteger(input.displayOrder, 'display_order'),
    navigationLabel: optionalText(input.navigationLabel),
  }
}

function normalizeSummaryCode(value: unknown): string {
  const code = requiredString(value, 'summary_code').toUpperCase()
  if (!/^SUM-[0-9]{6,}$/.test(code)) {
    throw new SummaryBankCompatibilityWriterError(
      'invalid_allocator_result',
      'The Summary-code allocator returned an invalid code.',
    )
  }
  return code
}

async function allocateCanonicalSlug(
  persistence: SummaryBankCompatibilityPersistence,
  legacySlug: string,
  summaryCode: string,
  summaryId: UUID,
): Promise<string> {
  const base = `${legacySlug}-${summaryCode.toLowerCase()}`
  if (!(await persistence.canonicalSlugExists(base))) return base

  const fallback = `${base}-${summaryId.toLowerCase()}`
  if (await persistence.canonicalSlugExists(fallback)) {
    throw new SummaryBankCompatibilityWriterError(
      'canonical_slug_conflict',
      'A globally unique canonical Summary slug could not be allocated.',
    )
  }
  return fallback
}

export interface SummaryBankCompatibilityWriter {
  resolvePackage(
    input: SummaryBankCompatibilityPackageLookupInput
  ): Promise<SummaryBankCompatibilityPackageLookupResult | null>
  isCompatibilityLegacySlugOccupied(
    input: SummaryBankCompatibilityImportSlugLookupInput
  ): Promise<boolean>
  allocateImportLegacySlug(
    input: SummaryBankCompatibilityImportSlugLookupInput
  ): Promise<string>
  create(
    input: SummaryBankCompatibilityCreateInput
  ): Promise<SummaryBankCompatibilityCreateResult>
  update(
    input: SummaryBankCompatibilityEditInput
  ): Promise<SummaryBankCompatibilityEditResult>
  replace(
    input: SummaryBankCompatibilityReplaceInput
  ): Promise<SummaryBankCompatibilityReplaceResult>
  publish(
    input: SummaryBankCompatibilityPublishInput
  ): Promise<SummaryBankCompatibilityPublishResult>
  unpublish(
    input: SummaryBankCompatibilityUnpublishInput
  ): Promise<SummaryBankCompatibilityUnpublishResult>
  delete(
    input: SummaryBankCompatibilityDeleteInput
  ): Promise<SummaryBankCompatibilityDeleteResult>
}

export class SummaryBankCompatibilityWriterService
  implements SummaryBankCompatibilityWriter {
  public constructor(
    private readonly persistence: SummaryBankCompatibilityPersistence,
    private readonly idAllocator: () => UUID = createUuid,
  ) {}

  public async resolvePackage(
    input: SummaryBankCompatibilityPackageLookupInput,
  ): Promise<SummaryBankCompatibilityPackageLookupResult | null> {
    return this.persistence.resolvePackage({
      reference: requiredString(input.reference, 'package_ref'),
      referenceType: normalizePackageReferenceType(input.referenceType),
    })
  }

  public async isCompatibilityLegacySlugOccupied(
    input: SummaryBankCompatibilityImportSlugLookupInput,
  ): Promise<boolean> {
    const packageId = requiredIdentifier(input.packageId, 'packageId')
    const legacySlug = normalizeLegacySlug(input.legacySlug)
    const placement = await this.persistence.findCompatibilityByLegacySlug({
      packageId,
      legacySlug,
    })
    return placement !== null
  }

  public async allocateImportLegacySlug(
    input: SummaryBankCompatibilityImportSlugLookupInput,
  ): Promise<string> {
    const packageId = requiredIdentifier(input.packageId, 'packageId')
    const baseSlug = normalizeLegacySlug(input.legacySlug)

    const isOccupied = async (legacySlug: string): Promise<boolean> =>
      (await this.persistence.findCompatibilityByLegacySlug({
        packageId,
        legacySlug,
      })) !== null

    if (!(await isOccupied(baseSlug))) return baseSlug

    for (
      let suffix = 2;
      suffix <= SUMMARY_BANK_COMPATIBILITY_IMPORT_SLUG_SUFFIX_LIMIT;
      suffix += 1
    ) {
      const candidate = `${baseSlug}-${suffix}`
      if (!(await isOccupied(candidate))) return candidate
    }

    throw new SummaryBankCompatibilityWriterError(
      'duplicate_legacy_slug',
      'A unique import slug could not be allocated within the bounded suffix range.',
    )
  }

  public async create(
    input: SummaryBankCompatibilityCreateInput,
  ): Promise<SummaryBankCompatibilityCreateResult> {
    const fields = normalizeCommonFields(input)
    const summaryId = this.idAllocator()
    const versionId = this.idAllocator()
    const summaryCode = normalizeSummaryCode(
      await this.persistence.allocateSummaryCode()
    )
    const canonicalSlug = await allocateCanonicalSlug(
      this.persistence,
      fields.slug,
      summaryCode,
      summaryId,
    )
    const metadata = await prepareSummaryCompatibilityMetadata(fields.contentMd)
    const result = await this.persistence.create({
      ...metadata,
      summaryId,
      versionId,
      summaryCode,
      canonicalSlug,
      packageId: fields.packageId,
      legacySlug: fields.slug,
      title: fields.title,
      subject: fields.subject,
      document: fields.document,
      law: fields.law,
      topic: fields.topic,
      contentMd: fields.contentMd,
      sortOrder: fields.sortOrder,
      displayOrder: fields.displayOrder,
      navigationLabel: fields.navigationLabel,
      actorId: fields.actorId,
      isPublished: normalizeBoolean(input.isPublished, 'is_published'),
      changeNote: SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE,
    })

    return { ...result, canonicalSlug }
  }

  public async update(
    input: SummaryBankCompatibilityEditInput,
  ): Promise<SummaryBankCompatibilityEditResult> {
    const fields = normalizeCommonFields(input)
    const metadata = await prepareSummaryCompatibilityMetadata(fields.contentMd)
    return this.persistence.update({
      ...metadata,
      summaryId: requiredIdentifier(input.summaryId, 'summaryId'),
      packageId: fields.packageId,
      legacySlug: fields.slug,
      title: fields.title,
      subject: fields.subject,
      document: fields.document,
      law: fields.law,
      topic: fields.topic,
      contentMd: fields.contentMd,
      sortOrder: fields.sortOrder,
      displayOrder: fields.displayOrder,
      navigationLabel: fields.navigationLabel,
      actorId: fields.actorId,
      changeNote: SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE,
    })
  }

  public async replace(
    input: SummaryBankCompatibilityReplaceInput,
  ): Promise<SummaryBankCompatibilityReplaceResult> {
    const fields = normalizeCommonFields(input)
    const target = await this.persistence.resolveImportReplacementTarget({
      packageId: fields.packageId,
      legacySlug: fields.slug,
    })
    if (!target) {
      throw new SummaryBankCompatibilityWriterError(
        'lookup_failed',
        'Import replacement target does not exist for the requested Package and slug.',
      )
    }

    const metadata = await prepareSummaryCompatibilityMetadata(fields.contentMd)
    return this.persistence.replace({
      ...metadata,
      summaryId: target.summaryId,
      packageId: fields.packageId,
      legacySlug: fields.slug,
      replacementVersionId: target.replacementVersionId ?? this.idAllocator(),
      title: fields.title,
      subject: fields.subject,
      document: fields.document,
      law: fields.law,
      topic: fields.topic,
      contentMd: fields.contentMd,
      sortOrder: fields.sortOrder,
      displayOrder: fields.displayOrder,
      actorId: fields.actorId,
      isPublished: normalizeBoolean(input.isPublished, 'is_published'),
      changeNote: SUMMARY_BANK_COMPATIBILITY_IMPORT_REPLACE_CHANGE_NOTE,
    })
  }

  public async publish(
    input: SummaryBankCompatibilityPublishInput,
  ): Promise<SummaryBankCompatibilityPublishResult> {
    return this.persistence.publish({
      actorId: requiredIdentifier(input.actorId, 'actorId'),
      summaryId: requiredIdentifier(input.summaryId, 'summaryId'),
    })
  }

  public async unpublish(
    input: SummaryBankCompatibilityUnpublishInput,
  ): Promise<SummaryBankCompatibilityUnpublishResult> {
    return this.persistence.unpublish({
      actorId: requiredIdentifier(input.actorId, 'actorId'),
      summaryId: requiredIdentifier(input.summaryId, 'summaryId'),
    })
  }

  public async delete(
    input: SummaryBankCompatibilityDeleteInput,
  ): Promise<SummaryBankCompatibilityDeleteResult> {
    return this.persistence.delete({
      actorId: requiredIdentifier(input.actorId, 'actorId'),
      summaryId: requiredIdentifier(input.summaryId, 'summaryId'),
    })
  }
}
