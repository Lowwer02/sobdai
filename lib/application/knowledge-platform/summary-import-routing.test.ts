import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SummaryBankCompatibilityWriterError,
  type SummaryBankCompatibilityCreateInput,
  type SummaryBankCompatibilityCreateResult,
  type SummaryBankCompatibilityImportSlugLookupInput,
  type SummaryBankCompatibilityPackageLookupInput,
  type SummaryBankCompatibilityPackageLookupResult,
  type SummaryBankCompatibilityReplaceInput,
} from './summary-bank-compatibility-writer'
import {
  routeSummaryImport,
  type SummaryImportRoutingWriter,
} from './summary-import-routing'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const PACKAGE_ID = '00000000-0000-4000-8000-000000000002'
const STALE_PACKAGE_ID = '00000000-0000-4000-8000-000000000009'

const PACKAGE: SummaryBankCompatibilityPackageLookupResult = {
  packageId: PACKAGE_ID,
  packageName: 'Package',
  resolvedBy: 'slug',
}

const DATA = {
  package_ref: 'package-slug',
  package_ref_type: 'slug' as const,
  packageId: STALE_PACKAGE_ID,
  slug: 'a-summary',
  title: 'Imported Summary',
  subject: 'Subject',
  document: 'Document',
  law: 'Law',
  topic: 'Topic',
  content_md: '# Imported',
  sort: 4,
  published: false,
  isDuplicate: true,
}

class FakeWriter implements SummaryImportRoutingWriter {
  public duplicate = false
  public packageResult: SummaryBankCompatibilityPackageLookupResult | null = PACKAGE
  public duplicateError: Error | null = null
  public allocatedSlug = 'a-summary'
  public createdSlug = 'a-summary'
  public replacedSlug = 'a-summary'
  public resolveCalls: SummaryBankCompatibilityPackageLookupInput[] = []
  public duplicateCalls: SummaryBankCompatibilityImportSlugLookupInput[] = []
  public createCalls: SummaryBankCompatibilityCreateInput[] = []
  public replaceCalls: SummaryBankCompatibilityReplaceInput[] = []

  public async resolvePackage(input: SummaryBankCompatibilityPackageLookupInput) {
    this.resolveCalls.push(input)
    return this.packageResult
  }

  public async isCompatibilityLegacySlugOccupied(
    input: SummaryBankCompatibilityImportSlugLookupInput,
  ) {
    this.duplicateCalls.push(input)
    if (this.duplicateError) throw this.duplicateError
    return this.duplicate
  }

  public async allocateImportLegacySlug(input: SummaryBankCompatibilityImportSlugLookupInput) {
    return this.allocatedSlug || input.legacySlug
  }

  public async create(input: SummaryBankCompatibilityCreateInput): Promise<SummaryBankCompatibilityCreateResult> {
    this.createCalls.push(input)
    return {
      summaryId: '00000000-0000-4000-8000-000000000003',
      summaryVersionId: '00000000-0000-4000-8000-000000000004',
      packageId: input.packageId,
      legacySlug: this.createdSlug,
      isPublished: input.isPublished,
      idempotentRetry: false,
      canonicalSlug: `${input.slug}-sum-000123`,
    }
  }

  public async replace(input: SummaryBankCompatibilityReplaceInput) {
    this.replaceCalls.push(input)
    return {
      summaryId: '00000000-0000-4000-8000-000000000003',
      summaryVersionId: '00000000-0000-4000-8000-000000000004',
      packageId: input.packageId,
      legacySlug: this.replacedSlug,
      isPublished: input.isPublished,
      revisionCreated: true,
      idempotentRetry: false,
    }
  }
}

async function route(
  writer: FakeWriter,
  conflictResolution: 'replace' | 'new',
  data = DATA,
) {
  const revalidated: string[] = []
  const result = await routeSummaryImport({
    data,
    actorId: ACTOR_ID,
    conflictResolution,
    writer,
    revalidatePath: (path) => revalidated.push(path),
  })
  return { result, revalidated }
}

test('authoritative no-duplicate state forces NEW despite stale replace UI state', async () => {
  const writer = new FakeWriter()
  writer.duplicate = false
  writer.allocatedSlug = 'a-summary'
  writer.createdSlug = 'server-new-slug'

  const { result } = await route(writer, 'replace')

  assert.deepEqual(result, { success: true, finalSlug: 'server-new-slug' })
  assert.equal(writer.createCalls.length, 1)
  assert.equal(writer.replaceCalls.length, 0)
  assert.equal(writer.createCalls[0]?.packageId, PACKAGE_ID)
})

test('no duplicate with the normal NEW conflict value uses CREATE', async () => {
  const writer = new FakeWriter()

  await route(writer, 'new')

  assert.equal(writer.createCalls.length, 1)
  assert.equal(writer.replaceCalls.length, 0)
})

test('authoritative duplicate with REPLACE uses the exact compatibility target', async () => {
  const writer = new FakeWriter()
  writer.duplicate = true

  const { result } = await route(writer, 'replace', { ...DATA, isDuplicate: false })

  assert.deepEqual(result, { success: true, finalSlug: 'a-summary' })
  assert.equal(writer.createCalls.length, 0)
  assert.equal(writer.replaceCalls.length, 1)
  assert.deepEqual(writer.replaceCalls[0], {
    actorId: ACTOR_ID,
    packageId: PACKAGE_ID,
    title: DATA.title,
    slug: DATA.slug,
    subject: DATA.subject,
    document: DATA.document,
    law: DATA.law,
    topic: DATA.topic,
    contentMd: DATA.content_md,
    sortOrder: DATA.sort,
    isPublished: DATA.published,
  })
})

test('duplicate with CREATE-NEW preserves the bounded suffix result', async () => {
  const writer = new FakeWriter()
  writer.duplicate = true
  writer.allocatedSlug = 'a-summary-2'
  writer.createdSlug = 'a-summary-2'

  const { result } = await route(writer, 'new')

  assert.deepEqual(result, { success: true, finalSlug: 'a-summary-2' })
  assert.equal(writer.createCalls[0]?.slug, 'a-summary-2')
  assert.equal(writer.replaceCalls.length, 0)
})

test('target-only placement is treated as no compatibility duplicate', async () => {
  const writer = new FakeWriter()
  writer.duplicate = false
  writer.createdSlug = 'a-summary'

  const { result } = await route(writer, 'replace', { ...DATA, isDuplicate: true })

  assert.deepEqual(result, { success: true, finalSlug: 'a-summary' })
  assert.equal(writer.createCalls.length, 1)
  assert.equal(writer.replaceCalls.length, 0)
})

test('duplicate lookup failure returns through the caller as a controlled rejection without mutation', async () => {
  const writer = new FakeWriter()
  writer.duplicateError = new SummaryBankCompatibilityWriterError(
    'invalid_response',
    'Corrupt compatibility marker authority.',
  )

  await assert.rejects(
    () => route(writer, 'replace'),
    (error: unknown) => {
      assert.ok(error instanceof SummaryBankCompatibilityWriterError)
      assert.equal(error.code, 'invalid_response')
      return true
    },
  )
  assert.equal(writer.createCalls.length, 0)
  assert.equal(writer.replaceCalls.length, 0)
})

test('package resolution failure is controlled and does not invoke mutation methods', async () => {
  const writer = new FakeWriter()
  writer.packageResult = null

  const { result } = await route(writer, 'replace')

  assert.deepEqual(result, { success: false, error: 'Package not found: package-slug' })
  assert.equal(writer.duplicateCalls.length, 0)
  assert.equal(writer.createCalls.length, 0)
  assert.equal(writer.replaceCalls.length, 0)
})

test('server routing uses the package resolved from the reference, not client packageId', async () => {
  const writer = new FakeWriter()

  await route(writer, 'replace')

  assert.deepEqual(writer.resolveCalls[0], {
    reference: 'package-slug',
    referenceType: 'slug',
  })
  assert.deepEqual(writer.duplicateCalls[0], {
    packageId: PACKAGE_ID,
    legacySlug: 'a-summary',
  })
})
