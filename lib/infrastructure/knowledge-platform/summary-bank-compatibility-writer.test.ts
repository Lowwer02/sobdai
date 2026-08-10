import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SummaryBankCompatibilityWriterError,
  type SummaryBankCompatibilityCreatePersistenceCommand,
  type SummaryBankCompatibilityEditPersistenceCommand,
} from '../../application/knowledge-platform/summary-bank-compatibility-writer'
import {
  SupabaseSummaryBankCompatibilityPersistence,
  type SummaryBankCompatibilitySupabaseClient,
} from './summary-bank-compatibility-writer'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const PACKAGE_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_PACKAGE_ID = '00000000-0000-4000-8000-000000000005'
const SUMMARY_ID = '00000000-0000-4000-8000-000000000003'
const OTHER_SUMMARY_ID = '00000000-0000-4000-8000-000000000006'
const VERSION_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_VERSION_ID = '00000000-0000-4000-8000-000000000007'

interface RpcError {
  readonly code?: string
  readonly message?: string
  readonly details?: string
  readonly hint?: string
}

interface RpcResponse {
  readonly data: unknown
  readonly error: RpcError | null
}

class FakeSupabaseClient implements SummaryBankCompatibilitySupabaseClient {
  public readonly calls: Array<{
    readonly functionName: string
    readonly args: Record<string, unknown>
  }> = []

  public constructor(private readonly response: RpcResponse) {}

  public from(_table: string): never {
    throw new Error('Unexpected table read in RPC adapter test.')
  }

  public rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<RpcResponse> {
    this.calls.push({ functionName, args })
    return Promise.resolve(this.response)
  }
}

const CREATE_COMMAND: SummaryBankCompatibilityCreatePersistenceCommand = {
  summaryId: SUMMARY_ID,
  versionId: VERSION_ID,
  summaryCode: 'SUM-000123',
  canonicalSlug: 'a-summary-sum-000123',
  packageId: PACKAGE_ID,
  legacySlug: 'a-summary',
  title: 'A Summary',
  subject: 'law',
  document: 'Document',
  law: 'Law',
  topic: 'Topic',
  contentMd: 'content',
  contentChecksum: 'a'.repeat(64),
  readTimeMinutes: 1,
  readTimePolicyVersion: 'summary-whitespace-200wpm-v1',
  contentSchemaVersion: 'summary-markdown-v1',
  sortOrder: 4,
  displayOrder: 7,
  navigationLabel: null,
  actorId: ACTOR_ID,
  isPublished: true,
  changeNote: 'Initial Summary Bank draft',
}

const EDIT_COMMAND: SummaryBankCompatibilityEditPersistenceCommand = {
  summaryId: SUMMARY_ID,
  packageId: PACKAGE_ID,
  legacySlug: 'a-summary',
  title: 'Edited Summary',
  subject: 'law',
  document: 'Document',
  law: 'Law',
  topic: 'Topic',
  contentMd: 'edited content',
  contentChecksum: 'b'.repeat(64),
  readTimeMinutes: 1,
  readTimePolicyVersion: 'summary-whitespace-200wpm-v1',
  contentSchemaVersion: 'summary-markdown-v1',
  sortOrder: 2,
  displayOrder: 3,
  navigationLabel: null,
  actorId: ACTOR_ID,
  changeNote: 'Summary Bank compatibility edit',
}

function persistence(response: RpcResponse) {
  const client = new FakeSupabaseClient(response)
  return {
    client,
    persistence: new SupabaseSummaryBankCompatibilityPersistence(client),
  }
}

function createResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      outcome: 'created',
      summary_id: SUMMARY_ID,
      summary_version_id: VERSION_ID,
      package_id: PACKAGE_ID,
      legacy_slug: 'a-summary',
      is_published: true,
      idempotent_retry: false,
      ...overrides,
    },
    error: null,
  }
}

function editResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      success: true,
      outcome: 'updated',
      summary_id: SUMMARY_ID,
      summary_version_id: VERSION_ID,
      package_id: PACKAGE_ID,
      legacy_slug: 'a-summary',
      revision_created: true,
      package_reassigned: false,
      ...overrides,
    },
    error: null,
  }
}

async function assertInvalid(
  operation: () => Promise<unknown>,
  expectedCode: 'invalid_allocator_result' | 'invalid_response' = 'invalid_response',
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof SummaryBankCompatibilityWriterError)
    assert.equal(error.code, expectedCode)
    return true
  })
}

test('allocator accepts exactly one valid code', async () => {
  const { client, persistence: adapter } = persistence({
    data: ['SUM-000123'],
    error: null,
  })

  assert.equal(await adapter.allocateSummaryCode(), 'SUM-000123')
  assert.equal(client.calls[0]?.functionName, 'allocate_summary_codes')
  assert.deepEqual(client.calls[0]?.args, { n: 1 })
})

for (const [label, data] of [
  ['null data', null],
  ['unexpected object', {}],
  ['zero rows', []],
  ['multiple rows', ['SUM-000123', 'SUM-000124']],
  ['malformed code', ['NOT-A-SUMMARY-CODE']],
] as const) {
  test(`allocator rejects ${label}`, async () => {
    const { persistence: adapter } = persistence({ data, error: null })
    await assertInvalid(() => adapter.allocateSummaryCode(), 'invalid_allocator_result')
  })
}

test('create accepts the exact migration-071 result contract', async () => {
  const { persistence: adapter } = persistence(createResponse())
  const result = await adapter.create(CREATE_COMMAND)

  assert.deepEqual(result, {
    summaryId: SUMMARY_ID,
    summaryVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    legacySlug: 'a-summary',
    isPublished: true,
    idempotentRetry: false,
  })
})

for (const [label, value] of [
  ['missing idempotent_retry', undefined],
  ['null idempotent_retry', null],
] as const) {
  test(`create rejects ${label}`, async () => {
    const { persistence: adapter } = persistence(createResponse({ idempotent_retry: value }))
    await assertInvalid(() => adapter.create(CREATE_COMMAND))
  })
}

test('create rejects an unexpected outcome', async () => {
  const { persistence: adapter } = persistence(createResponse({ outcome: 'updated' }))
  await assertInvalid(() => adapter.create(CREATE_COMMAND))
})

for (const [field, value] of [
  ['summary_id', OTHER_SUMMARY_ID],
  ['summary_version_id', OTHER_VERSION_ID],
  ['package_id', OTHER_PACKAGE_ID],
  ['legacy_slug', 'other-summary'],
  ['is_published', false],
] as const) {
  test(`create rejects a mismatched ${field}`, async () => {
    const { persistence: adapter } = persistence(createResponse({ [field]: value }))
    await assertInvalid(() => adapter.create(CREATE_COMMAND))
  })
}

test('edit accepts the exact migration-072 result contract', async () => {
  const { persistence: adapter } = persistence(editResponse())
  const result = await adapter.update(EDIT_COMMAND)

  assert.deepEqual(result, {
    summaryId: SUMMARY_ID,
    summaryVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    legacySlug: 'a-summary',
    revisionCreated: true,
    packageReassigned: false,
  })
})

test('edit rejects an unexpected outcome', async () => {
  const { persistence: adapter } = persistence(editResponse({ outcome: 'created' }))
  await assertInvalid(() => adapter.update(EDIT_COMMAND))
})

for (const [label, value] of [
  ['missing success', undefined],
  ['false success', false],
] as const) {
  test(`edit rejects ${label}`, async () => {
    const { persistence: adapter } = persistence(editResponse({ success: value }))
    await assertInvalid(() => adapter.update(EDIT_COMMAND))
  })
}

for (const [field, value] of [
  ['summary_id', OTHER_SUMMARY_ID],
  ['package_id', OTHER_PACKAGE_ID],
  ['legacy_slug', 'other-summary'],
] as const) {
  test(`edit rejects a mismatched ${field}`, async () => {
    const { persistence: adapter } = persistence(editResponse({ [field]: value }))
    await assertInvalid(() => adapter.update(EDIT_COMMAND))
  })
}

test('edit rejects a malformed required boolean', async () => {
  const { persistence: adapter } = persistence(
    editResponse({ revision_created: 'true' }),
  )
  await assertInvalid(() => adapter.update(EDIT_COMMAND))
})

test('edit rejects a malformed returned revision identifier', async () => {
  const { persistence: adapter } = persistence(
    editResponse({ summary_version_id: 'not-a-uuid' }),
  )
  await assertInvalid(() => adapter.update(EDIT_COMMAND))
})
