import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION,
  SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE,
  SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE,
  SUMMARY_BANK_COMPATIBILITY_IMPORT_REPLACE_CHANGE_NOTE,
  SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION,
  SummaryBankCompatibilityWriterError,
  SummaryBankCompatibilityWriterService,
  type SummaryBankCompatibilityDeletePersistenceCommand,
  computeSummaryCompatibilityChecksum,
  type SummaryBankCompatibilityCreatePersistenceCommand,
  type SummaryBankCompatibilityEditPersistenceCommand,
  type SummaryBankCompatibilityImportSlugLookupInput,
  type SummaryBankCompatibilityPackageLookupInput,
  type SummaryBankCompatibilityPublishPersistenceCommand,
  type SummaryBankCompatibilityPersistence,
  type SummaryBankCompatibilityReplacePersistenceCommand,
  type SummaryBankCompatibilitySummaryKind,
  type SummaryBankCompatibilityUnpublishPersistenceCommand,
} from './summary-bank-compatibility-writer'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const PACKAGE_ID = '00000000-0000-4000-8000-000000000002'
const SUMMARY_ID = '00000000-0000-4000-8000-000000000003'
const VERSION_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_PACKAGE_ID = '00000000-0000-4000-8000-000000000005'
const THIRD_PACKAGE_ID = '00000000-0000-4000-8000-000000000006'

class FakePersistence implements SummaryBankCompatibilityPersistence {
  public readonly namespace = new Set<string>()
  public readonly compatibilitySlugs = new Set<string>()
  public replacementSummaryKind: SummaryBankCompatibilitySummaryKind = 'kp_native'
  public createCommand?: SummaryBankCompatibilityCreatePersistenceCommand
  public editCommand?: SummaryBankCompatibilityEditPersistenceCommand
  public replaceCommand?: SummaryBankCompatibilityReplacePersistenceCommand
  public publishCommand?: SummaryBankCompatibilityPublishPersistenceCommand
  public unpublishCommand?: SummaryBankCompatibilityUnpublishPersistenceCommand
  public legacyPublishCommand?: SummaryBankCompatibilityPublishPersistenceCommand
  public legacyUnpublishCommand?: SummaryBankCompatibilityUnpublishPersistenceCommand
  public deleteCommand?: SummaryBankCompatibilityDeletePersistenceCommand

  public async resolvePackage(input: SummaryBankCompatibilityPackageLookupInput) {
    if (!input.referenceType) return null
    return {
      packageId: PACKAGE_ID,
      packageName: 'Package',
      resolvedBy: input.referenceType === 'code' ? 'code' as const : 'slug' as const,
    }
  }

  public async findCompatibilityByLegacySlug(input: SummaryBankCompatibilityImportSlugLookupInput) {
    return this.compatibilitySlugs.has(input.legacySlug)
      ? { summaryId: SUMMARY_ID, summaryKind: this.replacementSummaryKind }
      : null
  }

  public async resolveImportReplacementTarget(input: SummaryBankCompatibilityImportSlugLookupInput) {
    if (!this.compatibilitySlugs.has(input.legacySlug)) return null
    return {
      summaryId: SUMMARY_ID,
      summaryKind: this.replacementSummaryKind,
      replacementVersionId: this.replacementSummaryKind === 'legacy' ? null : VERSION_ID,
    }
  }

  public async allocateSummaryCode(): Promise<string> {
    return 'SUM-000123'
  }

  public async canonicalSlugExists(candidate: string): Promise<boolean> {
    return this.namespace.has(candidate)
  }

  public async create(
    command: SummaryBankCompatibilityCreatePersistenceCommand,
  ) {
    this.createCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: command.versionId,
      packageId: command.packageId,
      legacySlug: command.legacySlug,
      isPublished: command.isPublished,
      idempotentRetry: false,
    }
  }

  public async update(
    command: SummaryBankCompatibilityEditPersistenceCommand,
  ) {
    this.editCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: command.packageIds === null ? null : VERSION_ID,
      packageId: command.packageId,
      legacySlug: command.legacySlug,
      revisionCreated: command.packageIds !== null,
      packageReassigned: false,
    }
  }

  public async replace(command: SummaryBankCompatibilityReplacePersistenceCommand) {
    this.replaceCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: command.replacementVersionId,
      packageId: command.packageId,
      legacySlug: command.legacySlug,
      isPublished: command.isPublished,
      revisionCreated: command.replacementVersionId !== null,
      idempotentRetry: false,
    }
  }

  public async publish(command: SummaryBankCompatibilityPublishPersistenceCommand) {
    this.publishCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: VERSION_ID,
      packageId: PACKAGE_ID,
      idempotentRetry: false,
      republished: false,
    }
  }

  public async unpublish(command: SummaryBankCompatibilityUnpublishPersistenceCommand) {
    this.unpublishCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: VERSION_ID,
      packageId: PACKAGE_ID,
      idempotentRetry: false,
    }
  }

  public async publishLegacy(command: SummaryBankCompatibilityPublishPersistenceCommand) {
    this.legacyPublishCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: null,
      packageId: PACKAGE_ID,
      isPublished: true as const,
      idempotentRetry: false,
    }
  }

  public async unpublishLegacy(command: SummaryBankCompatibilityUnpublishPersistenceCommand) {
    this.legacyUnpublishCommand = command
    return {
      summaryId: command.summaryId,
      summaryVersionId: null,
      packageId: PACKAGE_ID,
      isPublished: false as const,
      idempotentRetry: false,
    }
  }

  public async delete(command: SummaryBankCompatibilityDeletePersistenceCommand) {
    this.deleteCommand = command
    return {
      summaryId: command.summaryId,
      outcome: 'archived' as const,
      idempotentRetry: false,
    }
  }
}

function ids() {
  const values = [SUMMARY_ID, VERSION_ID]
  return () => {
    const value = values.shift()
    if (!value) throw new Error('test UUID allocator exhausted')
    return value
  }
}

test('uses identity-normalized SHA-256 metadata and preserves exact Markdown bytes', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence, ids())
  const contentMd = '  first\r\nsecond  '

  const result = await writer.create({
    actorId: ACTOR_ID,
    packageId: PACKAGE_ID,
    title: 'A Summary',
    slug: 'a-summary',
    contentMd,
    sortOrder: '4',
    displayOrder: 7,
    isPublished: true,
  })

  const command = persistence.createCommand
  assert.ok(command)
  assert.equal(command.contentMd, contentMd)
  assert.equal(command.readTimeMinutes, 1)
  assert.equal(command.readTimePolicyVersion, SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION)
  assert.equal(command.contentSchemaVersion, SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION)
  assert.equal(command.changeNote, SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE)
  assert.deepEqual(command.packageIds, [PACKAGE_ID])
  assert.match(command.contentChecksum, /^[0-9a-f]{64}$/)
  assert.equal(command.canonicalSlug, 'a-summary-sum-000123')
  assert.equal(result.summaryId, SUMMARY_ID)
  assert.equal(result.canonicalSlug, command.canonicalSlug)

  const lfChecksum = await computeSummaryCompatibilityChecksum('  first\nsecond  ')
  const whitespaceChecksum = await computeSummaryCompatibilityChecksum(' first second ')
  assert.notEqual(command.contentChecksum, lfChecksum)
  assert.notEqual(command.contentChecksum, whitespaceChecksum)
})

test('KP-native create forwards the complete three-Package set', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence, ids())

  await writer.create({
    actorId: ACTOR_ID,
    packageId: PACKAGE_ID,
    packageIds: [PACKAGE_ID, OTHER_PACKAGE_ID, THIRD_PACKAGE_ID],
    title: 'A Summary',
    slug: 'a-summary',
    contentMd: 'content',
    isPublished: false,
  })

  assert.deepEqual(
    persistence.createCommand?.packageIds,
    [PACKAGE_ID, OTHER_PACKAGE_ID, THIRD_PACKAGE_ID],
  )
})

test('KP-native create rejects an empty Package set before persistence', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  await assert.rejects(
    () => writer.create({
      actorId: ACTOR_ID,
      packageId: PACKAGE_ID,
      packageIds: [],
      title: 'A Summary',
      slug: 'a-summary',
      contentMd: 'content',
      isPublished: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SummaryBankCompatibilityWriterError)
      assert.equal(error.code, 'invalid_input')
      return true
    },
  )
  assert.equal(persistence.createCommand, undefined)
})

test('uses the bounded Summary-ID fallback for a historical canonical or alias collision', async () => {
  const persistence = new FakePersistence()
  persistence.namespace.add('a-summary-sum-000123')
  const writer = new SummaryBankCompatibilityWriterService(persistence, ids())

  await writer.create({
    actorId: ACTOR_ID,
    packageId: PACKAGE_ID,
    title: 'A Summary',
    slug: 'a-summary',
    contentMd: 'content',
    isPublished: false,
  })

  assert.equal(
    persistence.createCommand?.canonicalSlug,
    `a-summary-sum-000123-${SUMMARY_ID}`,
  )
})

test('centralizes the edit metadata and sends no revision or canonical slug from the UI contract', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  const result = await writer.update({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
    packageId: PACKAGE_ID,
    summaryKind: 'legacy',
    title: 'Edited Summary',
    slug: 'edited-summary',
    document: '',
    contentMd: 'edited content',
    sortOrder: 2,
    displayOrder: '3',
  })

  assert.equal(result.summaryId, SUMMARY_ID)
  assert.equal(persistence.editCommand?.changeNote, SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE)
  assert.equal(
    persistence.editCommand?.contentSchemaVersion,
    SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION,
  )
  assert.equal(
    persistence.editCommand?.readTimePolicyVersion,
    SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION,
  )
  assert.equal(persistence.editCommand?.document, '')
  assert.equal('canonicalSlug' in (persistence.editCommand ?? {}), false)
  assert.equal(persistence.editCommand?.packageIds, null)
  assert.equal(result.summaryVersionId, null)
})

test('KP edit carries the complete one-Package set', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  await writer.update({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
    packageId: PACKAGE_ID,
    summaryKind: 'kp_native',
    packageIds: [PACKAGE_ID],
    title: 'Edited Summary',
    slug: 'edited-summary',
    contentMd: 'edited content',
  })

  assert.deepEqual(persistence.editCommand?.packageIds, [PACKAGE_ID])
  assert.equal(persistence.editCommand?.packageId, PACKAGE_ID)
})

test('KP edit carries the complete three-Package set without marker inference', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  await writer.update({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
    packageId: OTHER_PACKAGE_ID,
    summaryKind: 'kp_native',
    packageIds: [PACKAGE_ID, OTHER_PACKAGE_ID, THIRD_PACKAGE_ID],
    title: 'Edited Summary',
    slug: 'edited-summary',
    contentMd: 'edited content',
  })

  assert.deepEqual(
    persistence.editCommand?.packageIds,
    [PACKAGE_ID, OTHER_PACKAGE_ID, THIRD_PACKAGE_ID],
  )
  assert.equal(persistence.editCommand?.packageId, OTHER_PACKAGE_ID)
})

test('KP edit rejects an empty complete Package set before persistence', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  await assert.rejects(
    () => writer.update({
      actorId: ACTOR_ID,
      summaryId: SUMMARY_ID,
      packageId: PACKAGE_ID,
      summaryKind: 'kp_native',
      packageIds: [],
      title: 'Edited Summary',
      slug: 'edited-summary',
      contentMd: 'edited content',
    }),
    (error: unknown) => {
      assert.ok(error instanceof SummaryBankCompatibilityWriterError)
      assert.equal(error.code, 'invalid_input')
      return true
    },
  )
  assert.equal(persistence.editCommand, undefined)
})

test('KP edit rejects missing packageIds before persistence', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)
  const input = {
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
    packageId: PACKAGE_ID,
    summaryKind: 'kp_native' as const,
    title: 'Edited Summary',
    slug: 'edited-summary',
    contentMd: 'edited content',
  } as any

  await assert.rejects(
    () => writer.update(input),
    (error: unknown) => {
      assert.ok(error instanceof SummaryBankCompatibilityWriterError)
      assert.equal(error.code, 'invalid_input')
      return true
    },
  )
  assert.equal(persistence.editCommand, undefined)
})

test('delegates publish, unpublish, and delete through the Supabase-free writer contract', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  const publishResult = await writer.publish({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
  })
  const unpublishResult = await writer.unpublish({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
  })
  const legacyPublishResult = await writer.publishLegacy({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
  })
  const legacyUnpublishResult = await writer.unpublishLegacy({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
  })
  const deleteResult = await writer.delete({
    actorId: ACTOR_ID,
    summaryId: SUMMARY_ID,
  })

  assert.equal(persistence.publishCommand?.actorId, ACTOR_ID)
  assert.equal(persistence.publishCommand?.summaryId, SUMMARY_ID)
  assert.equal(publishResult.summaryId, SUMMARY_ID)
  assert.equal(unpublishResult.summaryVersionId, VERSION_ID)
  assert.equal(persistence.legacyPublishCommand?.summaryId, SUMMARY_ID)
  assert.equal(persistence.legacyUnpublishCommand?.summaryId, SUMMARY_ID)
  assert.equal(legacyPublishResult.summaryVersionId, null)
  assert.equal(legacyPublishResult.isPublished, true)
  assert.equal(legacyUnpublishResult.summaryVersionId, null)
  assert.equal(legacyUnpublishResult.isPublished, false)
  assert.equal(deleteResult.outcome, 'archived')
})

test('allocates Import NEW slugs from the package-local namespace with the legacy suffix sequence', async () => {
  const persistence = new FakePersistence()
  persistence.compatibilitySlugs.add('a-summary')
  persistence.compatibilitySlugs.add('a-summary-2')
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  assert.equal(
    await writer.allocateImportLegacySlug({ packageId: PACKAGE_ID, legacySlug: 'a-summary' }),
    'a-summary-3',
  )
  assert.equal(
    await writer.allocateImportLegacySlug({ packageId: PACKAGE_ID, legacySlug: 'free-summary' }),
    'free-summary',
  )
})

test('fails Import NEW slug allocation after the bounded package-local namespace search', async () => {
  const persistence = new FakePersistence()
  persistence.findCompatibilityByLegacySlug = async () => ({
    summaryId: SUMMARY_ID,
    summaryKind: 'kp_native',
  })
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  await assert.rejects(
    () => writer.allocateImportLegacySlug({ packageId: PACKAGE_ID, legacySlug: 'a-summary' }),
    (error: unknown) => {
      assert.ok(error instanceof SummaryBankCompatibilityWriterError)
      assert.equal(error.code, 'duplicate_legacy_slug')
      return true
    },
  )
})

test('delegates Import REPLACE through the migration-071 persistence boundary', async () => {
  const persistence = new FakePersistence()
  persistence.compatibilitySlugs.add('a-summary')
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  const result = await writer.replace({
    actorId: ACTOR_ID,
    packageId: PACKAGE_ID,
    title: 'Imported replacement',
    slug: 'a-summary',
    document: 'free-form document',
    contentMd: 'replacement content',
    isPublished: true,
  })

  assert.equal(result.summaryId, SUMMARY_ID)
  assert.equal(result.legacySlug, 'a-summary')
  assert.equal(persistence.replaceCommand?.summaryId, SUMMARY_ID)
  assert.equal(persistence.replaceCommand?.replacementVersionId, VERSION_ID)
  assert.equal(
    persistence.replaceCommand?.changeNote,
    SUMMARY_BANK_COMPATIBILITY_IMPORT_REPLACE_CHANGE_NOTE,
  )
  assert.equal(persistence.replaceCommand?.contentMd, 'replacement content')
})

test('Legacy Import REPLACE keeps the nullable revision contract and allocates no fake UUID', async () => {
  const persistence = new FakePersistence()
  persistence.compatibilitySlugs.add('a-summary')
  persistence.replacementSummaryKind = 'legacy'
  const writer = new SummaryBankCompatibilityWriterService(
    persistence,
    () => { throw new Error('Legacy replacement must not allocate a revision UUID') },
  )

  const result = await writer.replace({
    actorId: ACTOR_ID,
    packageId: PACKAGE_ID,
    title: 'Imported replacement',
    slug: 'a-summary',
    contentMd: 'replacement content',
    isPublished: false,
  })

  assert.equal(result.summaryVersionId, null)
  assert.equal(persistence.replaceCommand?.replacementVersionId, null)
})

test('fails Import REPLACE closed when the package-local target is absent', async () => {
  const persistence = new FakePersistence()
  const writer = new SummaryBankCompatibilityWriterService(persistence)

  await assert.rejects(
    () => writer.replace({
      actorId: ACTOR_ID,
      packageId: PACKAGE_ID,
      title: 'Imported replacement',
      slug: 'missing-summary',
      contentMd: 'replacement content',
      isPublished: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SummaryBankCompatibilityWriterError)
      assert.equal(error.code, 'lookup_failed')
      return true
    },
  )
})
