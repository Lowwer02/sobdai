import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SUMMARY_BANK_COMPATIBILITY_CONTENT_SCHEMA_VERSION,
  SUMMARY_BANK_COMPATIBILITY_CREATE_CHANGE_NOTE,
  SUMMARY_BANK_COMPATIBILITY_EDIT_CHANGE_NOTE,
  SUMMARY_BANK_COMPATIBILITY_READ_TIME_POLICY_VERSION,
  SummaryBankCompatibilityWriterService,
  computeSummaryCompatibilityChecksum,
  type SummaryBankCompatibilityCreatePersistenceCommand,
  type SummaryBankCompatibilityEditPersistenceCommand,
  type SummaryBankCompatibilityPersistence,
} from './summary-bank-compatibility-writer'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const PACKAGE_ID = '00000000-0000-4000-8000-000000000002'
const SUMMARY_ID = '00000000-0000-4000-8000-000000000003'
const VERSION_ID = '00000000-0000-4000-8000-000000000004'

class FakePersistence implements SummaryBankCompatibilityPersistence {
  public readonly namespace = new Set<string>()
  public createCommand?: SummaryBankCompatibilityCreatePersistenceCommand
  public editCommand?: SummaryBankCompatibilityEditPersistenceCommand

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
      summaryVersionId: VERSION_ID,
      packageId: command.packageId,
      legacySlug: command.legacySlug,
      revisionCreated: true,
      packageReassigned: false,
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
  assert.match(command.contentChecksum, /^[0-9a-f]{64}$/)
  assert.equal(command.canonicalSlug, 'a-summary-sum-000123')
  assert.equal(result.summaryId, SUMMARY_ID)
  assert.equal(result.canonicalSlug, command.canonicalSlug)

  const lfChecksum = await computeSummaryCompatibilityChecksum('  first\nsecond  ')
  const whitespaceChecksum = await computeSummaryCompatibilityChecksum(' first second ')
  assert.notEqual(command.contentChecksum, lfChecksum)
  assert.notEqual(command.contentChecksum, whitespaceChecksum)
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
})
