import type { UUID } from './contracts'

export const SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION =
  'summary-whitespace-200wpm-v1' as const
export const SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION =
  'summary-markdown-v1' as const
export const SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE =
  'Initial Summary Bank draft' as const
export const SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE =
  'Summary Bank compatibility edit' as const

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

export interface SummaryBankCompatibilityPersistence {
  allocateSummaryCode(): Promise<string>
  canonicalSlugExists(candidate: string): Promise<boolean>
  create(
    command: SummaryBankCompatibilityCreatePersistenceCommand
  ): Promise<SummaryBankCompatibilityCreatePersistenceResult>
  update(
    command: SummaryBankCompatibilityEditPersistenceCommand
  ): Promise<SummaryBankCompatibilityEditPersistenceResult>
}

export interface SummaryBankCompatibilityCreateResult
  extends SummaryBankCompatibilityCreatePersistenceResult {
  readonly canonicalSlug: string
}

export interface SummaryBankCompatibilityEditResult
  extends SummaryBankCompatibilityEditPersistenceResult {}

export type SummaryBankCompatibilityWriterErrorCode =
  | 'invalid_input'
  | 'invalid_allocator_result'
  | 'canonical_slug_conflict'
  | 'duplicate_legacy_slug'
  | 'namespace_lookup_failed'
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
  create(
    input: SummaryBankCompatibilityCreateInput
  ): Promise<SummaryBankCompatibilityCreateResult>
  update(
    input: SummaryBankCompatibilityEditInput
  ): Promise<SummaryBankCompatibilityEditResult>
}

export class SummaryBankCompatibilityWriterService
  implements SummaryBankCompatibilityWriter {
  public constructor(
    private readonly persistence: SummaryBankCompatibilityPersistence,
    private readonly idAllocator: () => UUID = createUuid,
  ) {}

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
}
